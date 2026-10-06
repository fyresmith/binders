// Export (src/export/, src/view/export.ts): the window, a manuscript as a Word file, one note, where files go. The
// system's own save dialog can't be driven from a test, so a stand-in answers for it (the plugin's `exportHost`), and
// everything after the dialog is real: the file is written to the disk and read back here. Every test that exports
// checks that no note changed.
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { crc32, deflateSync } from 'zlib';
import { strFromU8, unzipSync } from 'fflate';
import { PL, clickMenu, file, j, openView, reload, same, split, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const WIN = '.modal.binders-export';

/** A .docx on the disk, read: its paragraphs as { style, text }, its footnotes' text, the names of its parts. */
function docx(path) {
	const z = unzipSync(new Uint8Array(readFileSync(path))), xml = (name) => (z[name] ? strFromU8(z[name]) : '');
	const un = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
	const text = (p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:(tab|br)\/>/g)].map((m) => (m[1] !== undefined ? un(m[1]) : ' ')).join('');
	const paras = [...xml('word/document.xml').matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map((m) => ({ style: /<w:pStyle w:val="([^"]+)"/.exec(m[0])?.[1] ?? '', text: text(m[0]) }));
	return { parts: Object.keys(z), paras, body: paras.filter((x) => x.style === 'Normal').map((x) => x.text), headings: paras.filter((x) => x.style === 'Heading1').map((x) => x.text), notes: text(xml('word/footnotes.xml')), header: text(xml('word/header1.xml')), all: paras.map((x) => x.text).join('\n') };
}
/** Words as the test compares them: letters and digits. */
const words = (s) => s.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];

const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
/** Opens the Export window on a binder's folder and waits for what it shows. */
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} .binders-export-paper .binders-export-section, ${WIN} .binders-export-note > *')`, 6000);
	await p.sleep(150);
}
const pressed = (p, label) => p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b) return false; b.click(); return true; })()`);
async function press(p, label) { if (!(await pressed(p, label))) throw new Error(`no button “${label}” in the Export window`); await p.sleep(100); }
const status = (p) => p.ev(`document.querySelector('${WIN} .binders-export-status')?.textContent ?? ''`);
const saved = (p, ms = 8000) => until(p, `(document.querySelector('${WIN} .binders-export-status')?.textContent ?? '').startsWith('Saved to')`, ms);
const kinds = (p) => p.ev(`[...document.querySelectorAll('${WIN} [role="option"] .binders-snapshots-item-name')].map(e => e.textContent)`);
const pick = async (p, name) => { await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(name)}).click(); return 1; })()`); await p.sleep(500); };
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);
const closeAll = async (p) => { for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); } };

/** Stands in for the system's save dialog: it answers with the place it was asked to start at, or with `to`
    (null: the writer pressed Cancel). `none`: this computer has no dialog at all. Everything else is the real thing. */
const standIn = (p, o = {}) => p.ev(`(() => {
	const pl = ${PL}; window.__bx ??= { real: pl.exportHost.desktop };
	window.__bx.asked = []; window.__bx.to = ${j(o.to)}; window.__bx.none = ${j(!!o.none)};
	pl.exportHost.desktop = (app) => { const d = window.__bx.none ? null : window.__bx.real(app); return d && { ...d, pick: async (start) => { window.__bx.asked.push(start); return window.__bx.to === undefined ? start : window.__bx.to; } }; };
	return 1;
})()`);
const asked = (p) => p.ev(`window.__bx.asked`);
/** A test with the stand-in, put right after: the real dialog back, nothing remembered, the window shut. */
const test = (name, fn, o) => specs.push({ name: 'export: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p, o);
	const before = await texts(p);
	try { await fn(p, h, t, before); } finally {
		await closeAll(p);
		await p.ev(`(() => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); return 1; })()`);
	}
}) });

const BODIES = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
/** The words of the binder's notes as they are on disk, in binder order, without their properties. */
const sourceWords = (all) => BODIES.flatMap((n) => words(all[`${L}${n}.md`].replace(/^---\n[\s\S]*?\n---\n?/, '')));

test('the window opens on a manuscript: the kinds that exist, the choices, the text on paper', async (p, h, t) => {
	await open(p);
	t.eq((await kinds(p)).join('|'), 'Manuscript|Ebook|Scrivener project|One note', 'the kinds built so far, and no others');
	t.eq(await p.ev(`document.querySelector('${WIN} [role="option"][aria-selected="true"] .binders-snapshots-item-name').textContent`), 'Manuscript', 'a manuscript the first time');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-snapshots-name').textContent`), 'Manuscript', 'the bar names what is being made');
	t.ok(/^\d+ words · 7 chapters$/.test(await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`)), 'and how big it is');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item-name')].map(e => e.textContent)`)).join('|'), 'Style|Front and back matter|Your name', 'its choices: the style, front and back matter, and (until it is said) the writer’s name');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-heading')].map(e => e.innerText.replace(/\\n/g, ' / '))`)).join('|'), 'Prologue|Part One|Chapter One / Arrival|Chapter Two / The keeper|Chapter Three / Storm warning|Part Two|Chapter Four / The wreck|Chapter Five / Lights out|Epilogue', 'the text, with the headings the manuscript will have');
	const paper = await p.ev(`(() => { const s = getComputedStyle(document.querySelector('${WIN} .binders-export-paper')); return s.backgroundColor + ' ' + s.color; })()`);
	t.eq(paper, 'rgb(255, 255, 255) rgb(0, 0, 0)', 'paper is white and ink black, whatever the theme');
	t.ok((await p.ev(`document.querySelector('${WIN} .binders-export-caption').textContent`)).includes('not its pages'), 'and it says that these aren’t pages');
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-export-titlepage .binders-export-title')`), 'the title page comes first');
	t.eq(await p.ev(`document.querySelector('${WIN} button.mod-cta').textContent`), 'Export', 'one filled button');
	await closeAll(p);
	// the same window from a binder folder's menu and the view's own
	const titles = await p.ev(`(() => {
		const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const s = {}, it = new Proxy({}, { get: (x, m) => m === 's' ? s : (v) => { if (m === 'setTitle') s.t = v; if (m === 'onClick') s.f = v; return it; } }); cb(it); items.push(s); return menu; } : () => menu });
		app.workspace.trigger('file-menu', menu, ${file('The Lighthouse')}, 'file-explorer-context-menu');
		items.find(i => i.t === 'Export...')?.f({});
		return items.map(i => i.t);
	})()`);
	t.ok(titles.includes('Export...'), 'a binder folder’s menu has “Export...”');
	t.ok(await until(p, `!!document.querySelector('${WIN}')`), 'which opens the window');
});

test('a choice’s name is never squeezed: “Your name” is whole beside its field', async (p, h, t) => {
	await open(p);
	const rows = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item')].map(r => { const n = r.querySelector('.setting-item-name'), c = r.querySelector('.setting-item-control').getBoundingClientRect(), b = n.getBoundingClientRect(), s = document.querySelector('${WIN} .binders-export-side').getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(n); return { name: n.textContent, lines: range.getClientRects().length, cut: n.scrollWidth > n.clientWidth + 1, inside: c.right <= s.right + 1 && b.left >= s.left - 1, apart: b.right <= c.left + 1 }; })`);
	t.ok(rows.some((r) => r.name === 'Your name'), 'the writer’s name is asked for');
	for (const r of rows) t.ok(r.lines === 1 && !r.cut && r.inside && r.apart, `“${r.name}” is on one line, whole, beside its control (${JSON.stringify(r)})`);
});

test('a manuscript goes through the save dialog to the Exports folder: a Word file with the notes’ words, in order', async (p, h, t, before) => {
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.authorName = 'Mara Lindqvist'; pl.settings.contact = '12 Harbour Row\\nmara@example.com'; await pl.saveData(pl.settings); })().then(() => 1)`);
	await open(p);
	await press(p, 'Export');
	t.ok(await saved(p), 'the bar says it was saved');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.docx');
	t.eq((await asked(p)).join(), at, 'the dialog was opened once, in Exports beside the binder, with the book’s name');
	t.ok(existsSync(at), 'the file is where the dialog said');
	t.eq(readdirSync(join(p.vaultDir, 'Exports')).join(), 'The Lighthouse.docx', 'and nothing else is: no half-written file');
	const d = docx(at);
	t.ok(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/footnotes.xml', 'word/header1.xml'].every((n) => d.parts.includes(n)), 'it is a Word package');
	t.eq(words(d.body.join(' ')).join(' '), sourceWords(before).join(' '), 'word for word: the words in the file are the words of the notes, in binder order');
	t.eq(d.headings.join('|'), 'Prologue|Part One|Chapter One Arrival|Chapter Two The keeper|Chapter Three Storm warning|Part Two|Chapter Four The wreck|Chapter Five Lights out|Epilogue', 'parts and chapters are headings; a prologue has no number');
	t.ok(d.all.includes('Mara Lindqvist') && d.all.includes('12 Harbour Row') && d.all.includes('by Mara Lindqvist') && /about [\d,]+ words/.test(d.all), 'the title page has the name, the contact details and the count');
	t.ok(d.header.startsWith('Lindqvist / LIGHTHOUSE / '), 'the header has the surname and the title');
	t.eq(await status(p), 'Saved to Exports/The Lighthouse.docx', 'the window says where it went');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .modal-setting-titlebar-actions button')].map(b => b.textContent)`)).join('|'), 'Show in folder|Open', 'with the ways to it');
	t.eq(await p.ev(`(() => { const b = document.querySelector('${WIN} .binders-export-remember input'); return b ? String(b.checked) : 'none'; })()`), 'false', 'and offers to save there next time without asking, not ticked');
	same(t, before, await texts(p));
});

test('“Save here next time without asking”: the dialog is skipped, a file changed since is asked about, and settings ask again', async (p, h, t) => {
	await open(p);
	await press(p, 'Export');
	await saved(p);
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.docx');
	await p.ev(`(() => { document.querySelector('${WIN} .binders-export-remember input').click(); return 1; })()`);
	await p.sleep(200);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place').textContent`), 'Saves to Exports/The Lighthouse.docx', 'ticked, the window says where it saves');
	await closeAll(p);
	// a change to a note, and again: straight there
	await writeRaw(p, L + 'Epilogue.md', 'Years later the lamp room was a museum, and the stair was roped off.\n');
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place')?.textContent`), 'Saves to Exports/The Lighthouse.docx', 'opened again, it still says so');
	await press(p, 'Export');
	await saved(p);
	t.eq((await asked(p)).length, 1, 'the dialog didn’t open a second time');
	t.ok(docx(at).all.includes('roped off'), 'and the file there is the new one');
	// someone else's file in that place is never replaced without asking
	writeFileSync(at, 'not a manuscript');
	await closeAll(p);
	await open(p);
	await press(p, 'Export');
	t.ok(await until(p, `[...document.querySelectorAll('.modal')].some(m => m.textContent.includes('Replace this file'))`), 'a file export didn’t leave there is asked about');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].filter(b => b.textContent === 'Cancel').pop().click(); return 1; })()`);
	await p.sleep(300);
	t.eq(readFileSync(at, 'utf8'), 'not a manuscript', 'and kept when the answer is no');
	// "Choose where to save..." opens the dialog again
	await p.ev(`(() => { document.querySelector('${WIN} [aria-label="More"]').click(); return 1; })()`);
	await clickMenu(p, 'Choose where to save...');
	await saved(p);
	t.eq((await asked(p)).length, 2, '“Choose where to save...” asks again');
	await closeAll(p);
	// Binders' settings: the place is listed, and "Ask again" forgets it
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	const row = `(app.setting.activeTab.containerEl.querySelector('.binders-settings-places'))`;
	await until(p, `!!${row}`);
	t.ok((await p.ev(`${row}.querySelector('.setting-item-description').textContent`)).includes('The Lighthouse (manuscript)'), 'settings list the place remembered');
	await p.ev(`(() => { ${row}.querySelector('button').click(); return 1; })()`);
	await p.sleep(300);
	t.ok((await p.ev(`${row}.querySelector('.setting-item-description').textContent`)).startsWith('Every export asks'), '“Ask again” forgets it');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place')?.textContent ?? ''`), '', 'and the window no longer says it saves anywhere');
});

test('the dialog cancelled, or a place that can’t be written: nothing is written, and the window says so', async (p, h, t, before) => {
	await standIn(p, { to: null });
	await open(p);
	await press(p, 'Export');
	await until(p, `document.querySelector('${WIN} button.mod-cta')?.textContent === 'Export'`);
	t.eq(await status(p), '', 'cancelled: the window is as it was');
	t.ok(!existsSync(join(p.vaultDir, 'Exports')), 'and nothing was made, not even the Exports folder');
	await standIn(p, { to: join(p.vaultDir, 'no such folder', 'deeper', 'x.docx') });
	await press(p, 'Export');
	let said = '';
	for (let i = 0; i < 60 && !said.includes('The export didn’t finish.'); i++) { await p.sleep(100); said = await notices(p); }
	t.ok(said.includes('The export didn’t finish.'), `a failure is said (${said})`);
	t.ok(!existsSync(join(p.vaultDir, 'no such folder')), 'and no half-written file is left');
	t.eq(await p.ev(`document.querySelector('${WIN} button.mod-cta')?.textContent`), 'Export', 'the window can try again');
	same(t, before, await texts(p));
});

test('the fallback: with no save dialog to be had, the file goes into the Exports folder in the vault', async (p, h, t, before) => {
	t.ok(await p.ev(`(() => { const d = window.__bx.real(app); return !!d && d.base === app.vault.adapter.basePath && typeof d.pick === 'function' && typeof d.write === 'function'; })()`), 'here the real dialog and disk are found');
	await standIn(p, { none: true });
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place').textContent`), 'Goes to Exports/The Lighthouse.docx, in this vault', 'the window says where it will go');
	await press(p, 'Export');
	await saved(p);
	t.ok(await p.ev(`app.vault.adapter.exists('Exports/The Lighthouse.docx')`), 'the file is in the vault');
	t.eq(words(docx(join(p.vaultDir, 'Exports', 'The Lighthouse.docx')).body.join(' ')).join(' '), sourceWords(before).join(' '), 'word for word');
	t.eq(await p.ev(`document.querySelectorAll('${WIN} .modal-setting-titlebar-actions button').length`), 0, 'no “Show in folder” without a way to show it');
	// again: export's own file is replaced without asking; someone else's is asked about
	await p.ev(`(() => { document.querySelector('${WIN} [aria-label="More"]').click(); return 1; })()`);
	await clickMenu(p, 'Export');
	await p.sleep(1200);
	t.ok(!(await p.ev(`[...document.querySelectorAll('.modal')].some(m => m.textContent.includes('Replace this file'))`)), 'its own file is replaced without a question');
	await p.ev(`app.vault.adapter.write('Exports/The Lighthouse.docx', 'mine').then(() => 1)`);
	await p.sleep(600);
	await p.ev(`(() => { document.querySelector('${WIN} [aria-label="More"]').click(); return 1; })()`);
	await clickMenu(p, 'Export');
	t.ok(await until(p, `[...document.querySelectorAll('.modal')].some(m => m.textContent.includes('Replace this file'))`), 'a file that isn’t export’s is asked about');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].filter(b => b.textContent === 'Cancel').pop().click(); return 1; })()`);
	await p.sleep(300);
	t.eq(await p.ev(`app.vault.adapter.read('Exports/The Lighthouse.docx')`), 'mine', 'and kept');
	same(t, before, await texts(p));
});

test('the Exports folder can be one folder for the whole vault', async (p, h, t) => {
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.exportsFolder = 'Out/Books'; await pl.saveData(pl.settings); })().then(() => 1)`);
	await open(p);
	await press(p, 'Export');
	await saved(p);
	t.eq((await asked(p)).join(), join(p.vaultDir, 'Out', 'Books', 'The Lighthouse.docx'), 'a path in settings is where the dialog starts');
	t.ok(existsSync(join(p.vaultDir, 'Out', 'Books', 'The Lighthouse.docx')), 'and where the file goes');
});

test('roles: export-as, export: false and compile: false are honoured; Contents shows what each item was taken for', async (p, h, t) => {
	await writeRaw(p, L + 'Part One/The keeper.md', '---\nexport: false\n---\nNEVER-IN-THE-BOOK one.\n');
	await writeRaw(p, L + 'Part Two/The wreck.md', '---\ncompile: false\n---\nNEVER-IN-THE-BOOK two.\n');
	await writeRaw(p, L + 'Part One/Storm warning.md', '---\nexport-as: scene\n---\nThe glass fell all afternoon.\n');
	await writeRaw(p, L + 'Epilogue.md', '---\nexport-as: back matter\n---\nA closing page.\n');
	await p.sleep(600);
	await open(p);
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-compare').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`);
	const rows = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].map(r => r.querySelector('.nav-file-title-content').textContent + '=' + (r.querySelector('.nav-file-tag')?.textContent ?? '') + (r.classList.contains('binders-export-out') ? '!' : ''))`);
	t.eq(rows.join('|'), 'Prologue=Chapter|Part One=Part 1|Arrival=Chapter 1|The keeper=Left out!|Storm warning=Scene|Part Two=Part 2|The wreck=Left out!|Lights out=Chapter 2|Epilogue=Back matter', 'each item with its role; what is left out is faint');
	t.ok((await p.ev(`document.querySelector('${WIN} .binders-export-structure').textContent`)).startsWith('Folders are parts, notes are chapters'), 'and the structure it was read by');
	await press(p, 'Export');
	await saved(p);
	const d = docx(join(p.vaultDir, 'Exports', 'The Lighthouse.docx'));
	t.ok(!d.all.includes('NEVER-IN-THE-BOOK'), 'a note left out by either property isn’t in the file');
	t.ok(!d.all.includes('A closing page.'), 'back matter stays out of a manuscript unless asked for');
	t.eq(d.headings.join('|'), 'Prologue|Part One|Chapter One Arrival|Part Two|Chapter Two Lights out', 'a note made a scene goes on with the chapter before it');
	t.ok(d.paras.some((x) => x.style === 'SceneBreak' && x.text === '#') && d.all.includes('The glass fell all afternoon.'), 'after a scene break');
	t.eq(await p.ev(`app.vault.adapter.read(${j(L + 'Part Two/The wreck.md')})`), '---\ncompile: false\n---\nNEVER-IN-THE-BOOK two.\n', 'a note with the old property is read, and not rewritten');
});

test('what can’t be exported is counted before anything is made, each with its note, and opens it', async (p, h, t) => {
	await writeRaw(p, L + 'Part One/Arrival.md', 'She came ashore.\n\n![[chart of the sound.png]]\n\n![[Part Two/The wreck]]\n\n![[missing.pdf]]\n\nA #tag in a line.\n');
	await p.sleep(600);
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-warn-head').textContent`), '3 things to look at', 'the count');
	const said = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-warn-open')].map(w => w.textContent)`);
	t.ok(said.every((s) => s.startsWith('Arrival')) && said.some((s) => s.includes('chart of the sound.png')) && said.some((s) => s.includes('missing.pdf')) && said.some((s) => s.includes('tag')), 'a picture that isn’t found, an embed that can’t be exported and a tag, each with its note');
	t.ok(await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-paper p')].filter(e => e.textContent.startsWith('The sea gave')).length`).then((n) => n >= 0), 'the preview is drawn all the same');
	await p.ev(`(() => { document.querySelector('${WIN} .binders-export-warn-open').click(); return 1; })()`);
	t.ok(await until(p, `!document.querySelector('${WIN}') && app.workspace.getActiveFile()?.path === ${j(L + 'Part One/Arrival.md')}`), 'a line opens its note');
});

test('a note changed outside after the window opened is exported as it is now', async (p, h, t) => {
	await open(p);
	await p.ev(`app.vault.adapter.write(${j(L + 'Prologue.md')}, 'The light went out, and CHANGED-OUTSIDE came after.\\n').then(() => 1)`);
	await p.sleep(800);
	await press(p, 'Export');
	await saved(p);
	t.ok(docx(join(p.vaultDir, 'Exports', 'The Lighthouse.docx')).all.includes('CHANGED-OUTSIDE'), 'the file has the note’s text as it is on disk at export');
});

test('one note: what Compile was, from the window, with tabs taken off paragraphs unless said otherwise', async (p, h, t, before) => {
	await writeRaw(p, L + 'Prologue.md', '\tA tabbed paragraph.\n\tAnd a second.\n');
	await p.sleep(500);
	const then = await texts(p);
	await open(p);
	await pick(p, 'One note');
	await until(p, `!!document.querySelector('${WIN} .binders-export-note > *')`);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-snapshots-name').textContent`), 'One note', 'the bar names it');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item-name')].map(e => e.textContent)`)).join('|'), 'Title|Folders as headings|Note titles as headings|Between notes|Leave out comments|Take tabs off paragraphs|Save as', 'its options');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-path').value`), 'The Lighthouse (exported).md', 'saved beside the binder by default');
	t.ok(await p.ev(`document.querySelector('${WIN} .binders-export-note h1')?.textContent === 'The Lighthouse' && !document.querySelector('${WIN} .binders-export-note pre')`), 'the preview is the note, and its tabbed paragraphs aren’t code');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .modal-setting-titlebar-actions button')].map(b => b.textContent)`)).join('|'), 'Copy|Export', 'Copy, and Export');
	await press(p, 'Export');
	await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse (exported).md'`, 6000);
	const made = await p.ev(`app.vault.adapter.read('The Lighthouse (exported).md')`);
	t.ok(made.startsWith('# The Lighthouse\n\nA tabbed paragraph.\nAnd a second.\n\n## Part One\n\n'), 'the note: the title, the text without its tabs, folders as headings');
	t.eq((await asked(p)).length, 0, 'no save dialog: the note is in the vault');
	t.ok(!(await p.ev(`!!document.querySelector('${WIN}')`)), 'the window closes and the note opens');
	// with the option off the tabs stay; and the choice of kind is remembered
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} [role="option"][aria-selected="true"] .binders-snapshots-item-name').textContent`), 'One note', 'the kind last used is the kind it opens on');
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="tabs"]').click(); return 1; })()`);
	await p.sleep(500);
	await press(p, 'Export');
	await until(p, `app.vault.adapter.read('The Lighthouse (exported).md').then(s => s.includes('\\tA tabbed paragraph.'))`, 6000);
	t.ok((await p.ev(`app.vault.adapter.read('The Lighthouse (exported).md')`)).includes('\tA tabbed paragraph.\n\tAnd a second.'), 'with “Take tabs off paragraphs” off, the text is as typed');
	same(t, then, await texts(p));
	void before;
});

test('by keyboard, and for a screen reader: the kinds are a list, the arrows choose, Tab reaches Export, Escape closes', async (p, h, t) => {
	await open(p);
	t.eq(await p.ev(`(() => { const a = document.activeElement; return a?.getAttribute('role') + ':' + a?.querySelector('.binders-snapshots-item-name')?.textContent; })()`), 'option:Manuscript', 'the keyboard starts on the kind chosen');
	t.eq(await p.ev(`(() => { const l = document.querySelector('${WIN} [role="listbox"]'); return l.getAttribute('aria-label') + '|' + [...l.querySelectorAll('[role="option"]')].map(o => o.getAttribute('aria-label')).join('|'); })()`), 'What to make|Manuscript: Word, in standard manuscript format|Ebook: EPUB, for Kindle, Apple Books and Kobo|Scrivener project: The binder itself, for Scrivener 3|One note: Markdown, in this vault', 'the list and its rows are named');
	await p.key('ArrowDown');
	await until(p, `document.querySelector('${WIN} .binders-snapshots-name').textContent === 'Ebook'`);
	t.eq(await p.ev(`document.activeElement?.querySelector('.binders-snapshots-item-name')?.textContent`), 'Ebook', 'Down chooses the next kind, and the keyboard stays in the list');
	await p.key('End');
	await until(p, `document.querySelector('${WIN} .binders-snapshots-name').textContent === 'One note'`);
	t.eq(await p.ev(`document.activeElement?.querySelector('.binders-snapshots-item-name')?.textContent`), 'One note', 'End chooses the last');
	await p.key('ArrowUp');
	await until(p, `document.querySelector('${WIN} .binders-snapshots-name').textContent === 'Scrivener project'`);
	t.eq(await p.ev(`document.activeElement?.querySelector('.binders-snapshots-item-name')?.textContent`), 'Scrivener project', 'Up goes back through the kinds, in the order they are listed');
	await p.key('ArrowUp');
	await until(p, `document.querySelector('${WIN} .binders-snapshots-name').textContent === 'Ebook'`);
	await until(p, `!!document.querySelector('${WIN} .binders-export-paper.mod-ebook .binders-export-section')`);
	const ebookTabs = [];
	for (let i = 0; i < 12; i++) { await p.key('Tab'); ebookTabs.push(await p.ev(`(() => { const a = document.activeElement; return a?.dataset.bindersKey || a?.getAttribute('aria-label') || a?.textContent || a?.tagName; })()`)); if (ebookTabs[ebookTabs.length - 1] === 'Export') break; }
	t.ok(ebookTabs.includes('style') && ebookTabs.includes('cover') && ebookTabs.includes('Contents') && ebookTabs[ebookTabs.length - 1] === 'Export', `in the ebook, Tab goes through the style and the cover to Contents and Export (${ebookTabs.join(', ')})`);
	await p.ev(`(() => { document.querySelector('${WIN} [role="option"][aria-selected="true"]').focus(); return 1; })()`);
	await p.key('ArrowUp');
	await until(p, `document.querySelector('${WIN} .binders-snapshots-name').textContent === 'Manuscript'`);
	await until(p, `!!document.querySelector('${WIN} .binders-export-paper .binders-export-section')`);
	const seen = [];
	for (let i = 0; i < 12; i++) { await p.key('Tab'); seen.push(await p.ev(`(() => { const a = document.activeElement; return a?.dataset.bindersKey || a?.getAttribute('aria-label') || a?.textContent || a?.tagName; })()`)); if (seen[seen.length - 1] === 'Export') break; }
	t.ok(seen.includes('style') && seen.includes('matter') && seen.includes('Contents') && seen[seen.length - 1] === 'Export', `Tab goes through the choices to Contents and Export (${seen.join(', ')})`);
	t.eq(await p.ev(`(() => { const c = document.querySelector('${WIN} .binders-snapshots-compare'); return c.getAttribute('role') + ' ' + c.getAttribute('aria-pressed'); })()`), 'button false', 'Contents is a button that says whether it is on');
	await p.key('Enter');
	t.ok(await saved(p), 'Enter on Export exports');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-status').getAttribute('role')`), 'status', 'and what happened is said to a screen reader');
	await p.key('Escape');
	t.ok(await until(p, `!document.querySelector('${WIN}')`), 'Escape closes the window');
});

test('a binder of 150,000 words is exported in time, word for word', async (p, h, t) => {
	const LIST = 'the light keeper water stone island storm glass tower lamp night boat letter she he was had and of in to a not with for on at from by when then'.split(' ');
	const n = await p.ev(`(async () => {
		const list = ${j(LIST)}; let seed = 7; const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
		await app.vault.createFolder('Big'); let total = 0; const order = [];
		for (let c = 1; c <= 30; c++) {
			const lines = [];
			for (let l = 0; l < 100; l++) { const w = []; for (let i = 0; i < 50; i++) w.push(list[Math.floor(next() * list.length)]); lines.push(w.join(' ') + '.'); total += 50; }
			await app.vault.create('Big/Chapter ' + c + '.md', lines.join('\\n') + '\\n'); order.push('Chapter ' + c);
		}
		await app.vault.create('Big/Big.md', '---\\nbinder: 1\\ncontents:\\n' + order.map(o => '  - ' + o).join('\\n') + '\\n---\\n');
		return total;
	})()`);
	t.eq(n, 150000, 'a binder of 150,000 words');
	await until(p, `!!${PL}.binders.binderOf('Big')`, 8000);
	await p.sleep(500);
	const t0 = Date.now();
	await open(p, 'Big');
	const shown = Date.now() - t0;
	const t1 = Date.now();
	await press(p, 'Export');
	t.ok(await saved(p, 30000), 'it is exported');
	const took = Date.now() - t1;
	t.ok(shown < 15000, `the window shows it in under 15 s (${shown} ms)`);
	t.ok(took < 15000, `and exports it in under 15 s (${took} ms)`);
	const d = docx(join(p.vaultDir, 'Exports', 'Big.docx')), got = words(d.body.join(' '));
	const want = words((await Promise.all(Array.from({ length: 30 }, (_, i) => p.ev(`app.vault.adapter.read('Big/Chapter ${i + 1}.md')`)))).join(' '));
	t.eq(got.length, 150000, 'every word is in the file');
	t.ok(got.every((w, i) => w === want[i]), 'in order');
	t.eq(d.headings.length, 30, 'thirty chapters');
});

// ---- a phone and a tablet ----

/** Runs fn in Obsidian's mobile mode at a size, by touch; then puts the desktop back. */
// ---- the ebook ----

/** An .epub on the disk, read as a reading app reads it (the package's reading order, a file at a time), with
    patterns of its own: the names in the zip, the package, each heading, and the text without what export made. */
function epub(path) {
	const z = unzipSync(new Uint8Array(readFileSync(path))), names = Object.keys(z), x = (n) => (z[n] ? strFromU8(z[n]) : '');
	const opf = x('OEBPS/package.opf'), hrefs = new Map([...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
	const spine = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => hrefs.get(m[1]));
	const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
	const headings = [];
	let body = '';
	for (const href of spine) {
		if (href === 'nav.xhtml') continue;
		let b = /<body[^>]*>([\s\S]*)<\/body>/.exec(x(`OEBPS/${href}`))?.[1] ?? '';
		if (/class="(titlepage|[^"]* made)"/.test(b)) continue;
		b = b.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/, (_m, h) => { headings.push(text(h).replace(/\s+/g, ' ').trim()); return ''; });
		body += ' ' + text(b.replace(/<p class="break"[^>]*>[\s\S]*?<\/p>/g, ' ').replace(/<a class="noteref"[^>]*>[^<]*<\/a>/g, '').replace(/<a [^>]*doc-backlink[^>]*>[^<]*<\/a>/g, ''));
	}
	return { names, opf, spine, headings, body, x, stored: new Uint8Array(readFileSync(path)).slice(30, 38).join() === [...'mimetype'].map((c) => c.charCodeAt(0)).join() };
}
/** EPUBCheck's verdict on a file: "" when it passes, what it says when it doesn't, null when it isn't installed
    (`npm run get-epubcheck`). */
function epubcheck(path) {
	const tools = process.env.BINDERS_TOOLS || join(homedir(), '.cache', 'binders-tools'), jar = join(tools, 'epubcheck', 'epubcheck.jar');
	const java = [join(tools, 'jre', 'bin', 'java'), join(tools, 'jre', 'Contents', 'Home', 'bin', 'java')].find((f) => existsSync(f)) ?? (spawnSync('which', ['java']).status === 0 ? 'java' : '');
	if (!existsSync(jar) || !java) { console.log('    ******** EPUBCheck WAS NOT RUN: it isn’t installed (npm run get-epubcheck). ********'); return null; }
	const r = spawnSync(java, ['-jar', jar, path, '--failonwarnings'], { encoding: 'utf8', timeout: 120000 });
	return r.status === 0 ? '' : `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter((l) => /^(ERROR|WARNING|FATAL)/.test(l)).slice(0, 3).join(' | ') || 'it failed';
}
/** A real PNG of one grey. */
function png(width, height) {
	const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body) >>> 0, body.length + 4); return out; };
	const head = Buffer.alloc(13);
	head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8;
	const rows = Buffer.alloc((width + 1) * height, 0xcc);
	for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0;
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const EBOOK = `${WIN} .binders-export-paper.mod-ebook`;
/** The window, with the Ebook kind chosen and its text shown. */
async function openEbook(p, folder = 'The Lighthouse') {
	await open(p, folder);
	await pick(p, 'Ebook');
	await until(p, `!!document.querySelector('${EBOOK} .binders-export-section.mod-chapter')`, 8000);
	await p.sleep(200);
}
const NOTE = `${L}The Lighthouse.md`;
const DETAILS = '.modal.binders-book-details';
const fm = (p, path = NOTE) => p.ev(`app.vault.adapter.read(${j(path)}).then(t => t)`).then((t) => split(t));
/** Sets one of Book details' fields as a writer does: typed and left, chosen, or switched. */
const detail = async (p, key, value) => {
	await p.ev(`(() => { const e = document.querySelector('${DETAILS} [data-binders-key="${key}"]'); if (!e) throw new Error('no field ${key}'); if (e.classList.contains('checkbox-container')) e.click(); else { e.value = ${j(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } return 1; })()`);
	await p.sleep(250);
};
const withAuthor = (p) => p.ev(`(async () => { const pl = ${PL}; pl.settings.authorName = 'Mara Lindqvist'; await pl.saveData(pl.settings); })().then(() => 1)`);

test('the Ebook kind: its choices, its text in the shape of the style, and what a reader chooses said', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	t.eq((await kinds(p)).join('|'), 'Manuscript|Ebook|Scrivener project|One note', 'the kinds built so far, in the design’s order');
	t.eq(await p.ev(`document.querySelector('${WIN} [role="option"][aria-selected="true"]').getAttribute('aria-label')`), 'Ebook: EPUB, for Kindle, Apple Books and Kobo', 'the ebook, and what it is for');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item-name')].map(e => e.textContent)`)).join('|'), 'Style|Cover', 'its choices: the style and the cover');
	t.eq(await p.ev(`(() => { const s = document.querySelector('${WIN} [data-binders-key="style"]'); return [...s.options].map(o => o.textContent).join() + '=' + s.value; })()`), 'Classic=Classic', 'the first book style');
	t.ok(/^\d+ words · 7 chapters$/.test(await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`)), 'the bar says how big it is');
	const heads = await p.ev(`[...document.querySelectorAll('${EBOOK} .binders-export-section')].map(s => s.querySelector('.binders-export-title, .binders-export-heading')?.innerText.replace(/\\n+/g, ' / ') ?? (s.classList.contains('mod-copyright') ? '(copyright)' : ''))`);
	t.eq(heads.join('|').toLowerCase(), 'the lighthouse|(copyright)|contents|prologue|part one|chapter one / arrival|chapter two / the keeper|chapter three / storm warning|part two|chapter four / the wreck|chapter five / lights out|epilogue', 'the made pages, then the book, headed as Classic heads it');
	t.eq(await p.ev(`document.querySelector('${EBOOK} .mod-copyright').textContent`), `© ${new Date().getFullYear()} Mara Lindqvist`, 'the copyright page says who and when');
	t.eq((await p.ev(`[...document.querySelectorAll('${EBOOK} .binders-export-toc li')].map(e => e.firstChild.textContent)`)).slice(0, 4).join('|'), 'The Lighthouse|Prologue|Part One|Chapter One · Arrival', 'the contents list the book');
	const shape = await p.ev(`(() => { const sec = [...document.querySelectorAll('${EBOOK} .mod-chapter')].find(s => s.querySelectorAll('p').length > 1) ?? document.querySelector('${EBOOK} .mod-chapter'), ps = sec.querySelectorAll('p'), cs = (e) => getComputedStyle(e), h = sec.querySelector('.binders-export-heading'); return { first: cs(ps[0]).textIndent, head: cs(h).textAlign + ' ' + cs(h).textTransform, paper: cs(document.querySelector('${EBOOK}')).backgroundColor + ' ' + cs(document.querySelector('${EBOOK}')).color }; })()`);
	t.eq(shape.first, '0px', 'a chapter’s first paragraph isn’t indented');
	t.eq(shape.head, 'center uppercase', 'the heading is centred, in capitals');
	t.eq(shape.paper, 'rgb(255, 255, 255) rgb(0, 0, 0)', 'paper is white and ink black, whatever the theme');
	t.ok((await p.ev(`document.querySelector('${WIN} .binders-export-caption').textContent`)).startsWith('A reader chooses the typeface, the size and the colors.'), 'and the window says what an ebook leaves to its reader');
	const fits = await p.ev(`(() => { const s = document.querySelector('${WIN} .binders-export-scroll').getBoundingClientRect(), e = document.querySelector('${EBOOK}').getBoundingClientRect(); return e.left >= s.left - 1 && e.right <= s.right + 1; })()`);
	t.ok(fits, 'one column, inside its pane');
	await closeAll(p);
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} [role="option"][aria-selected="true"] .binders-snapshots-item-name').textContent`), 'Ebook', 'the kind last used is the one the window opens on');
});

test('an ebook goes through the save dialog to the Exports folder: an EPUB with the notes’ words, in order, that EPUBCheck passes', async (p, h, t, before) => {
	await withAuthor(p);
	await openEbook(p);
	await press(p, 'Export');
	t.ok(await saved(p), 'the bar says it was saved');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.epub');
	t.eq((await asked(p)).join(), at, 'the dialog was opened once, in Exports beside the binder, with the book’s name');
	t.eq(readdirSync(join(p.vaultDir, 'Exports')).join(), 'The Lighthouse.epub', 'the file is there, and nothing else is: no half-written file');
	const e = epub(at);
	t.ok(e.names[0] === 'mimetype' && e.stored && e.x('mimetype') === 'application/epub+zip', 'it is an EPUB: `mimetype` first, stored');
	t.eq(e.spine.map((s) => s.replace(/^text\/|\.xhtml$/g, '')).join(' '), 'title-page copyright nav prologue part-1 chapter-1 chapter-2 chapter-3 part-2 chapter-4 chapter-5 epilogue', 'a file to a section, in the book’s order');
	t.eq(words(e.body).join(' '), sourceWords(before).join(' '), 'word for word: the words in the file are the words of the notes, in binder order');
	t.eq(e.headings.join('|'), 'Prologue|Part One|Chapter One Arrival|Chapter Two The keeper|Chapter Three Storm warning|Part Two|Chapter Four The wreck|Chapter Five Lights out|Epilogue', 'parts and chapters are headed; a prologue has no number');
	t.ok(e.opf.includes('<dc:title>The Lighthouse</dc:title>') && e.opf.includes('>Mara Lindqvist</dc:creator>') && e.opf.includes('<dc:language>en</dc:language>'), 'the package says whose book it is');
	const verdict = epubcheck(at);
	if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes it without errors or warnings');
	t.eq(await status(p), 'Saved to Exports/The Lighthouse.epub', 'the window says where it went');
	// a place is remembered for each kind of each binder
	await p.ev(`(() => { document.querySelector('${WIN} .binders-export-remember input').click(); return 1; })()`);
	await p.sleep(200);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place')?.textContent ?? ''`), 'Saves to Exports/The Lighthouse.epub', 'ticked, the ebook saves there without asking');
	await pick(p, 'Manuscript');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place')?.textContent ?? ''`), '', 'and the manuscript is still asked about: the place is the ebook’s');
	await pick(p, 'Ebook');
	await until(p, `!!document.querySelector('${EBOOK} .mod-chapter')`);
	await press(p, 'Export');
	t.ok(await saved(p), 'exported again');
	t.eq((await asked(p)).length, 1, 'without the dialog');
	same(t, before, await texts(p));
});

test('Book details: kept as the binder note’s own properties and nothing else; the ebook follows them', async (p, h, t, before) => {
	await openEbook(p);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="details"]').click(); return 1; })()`);
	t.ok(await until(p, `!!document.querySelector('${DETAILS} [data-binders-key="title"]')`), 'the button beside the book’s name opens Book details');
	t.eq((await p.ev(`[...document.querySelectorAll('${DETAILS} .setting-item-name')].map(e => e.textContent)`)).filter((n) => n).join('|'), 'Title|Subtitle|Author|Structure|Title page|Copyright page|Contents page|Language', 'its rows');
	t.eq(await p.ev(`document.querySelector('${DETAILS} [data-binders-key="title"]').placeholder`), 'The Lighthouse', 'the title is the folder’s name until one is said');
	t.ok(await p.ev(`document.querySelector('${DETAILS} [data-binders-key="language"]').tagName === 'SELECT' && document.querySelector('${DETAILS} [data-binders-key="language"]').options.length > 40`), 'the language is chosen from a list, not typed');
	await detail(p, 'title', 'The Lighthouse Keeper');
	await detail(p, 'subtitle', 'A short novel');
	await detail(p, 'author', 'M. L. Lindqvist');
	await detail(p, 'copyright', 'Copyright © 2026 M. L. Lindqvist. All rights reserved.');
	await detail(p, 'language', 'en-GB');
	await detail(p, 'contents-page', 'never');
	await detail(p, 'structure', 'notes');
	t.ok(await until(p, `app.vault.adapter.read(${j(NOTE)}).then(t => t.includes('structure:'))`, 4000), 'each change is kept as it is made');
	const now = await fm(p), was = split(before[NOTE]);
	t.eq(now.body, was.body, 'the binder note’s text is untouched');
	t.ok(now.yaml.startsWith(was.yaml), 'what the note had (its format, its order, the writer’s own properties) is as it was, in place');
	t.eq(now.yaml.slice(was.yaml.length).trim().split('\n').map((l) => l.split(':')[0]).sort().join(), 'author,contents-page,copyright,language,structure,subtitle,title', 'and only Book details’ own properties are added');
	t.ok(now.yaml.includes('language: en-GB') && now.yaml.includes('structure: every note a chapter') && now.yaml.includes('contents-page: never'), 'written as the file format has them');
	await p.ev(`(() => { [...document.querySelectorAll('${DETAILS} button')].find(b => b.textContent === 'Done').click(); return 1; })()`);
	t.ok(await until(p, `document.querySelector('${EBOOK} .binders-export-title')?.textContent === 'The Lighthouse Keeper' && !document.querySelector('${EBOOK} .mod-contents')`, 6000), 'the window reads the book again: its title, and no contents page');
	t.eq(await p.ev(`[document.querySelector('${EBOOK} .binders-export-subtitle').textContent, document.querySelector('${EBOOK} .binders-export-by').textContent, document.querySelector('${EBOOK} .mod-copyright').textContent, document.querySelector('${EBOOK}').lang].join('|')`), 'A short novel|M. L. Lindqvist|Copyright © 2026 M. L. Lindqvist. All rights reserved.|en-GB', 'its subtitle, its author, its copyright line, its language');
	t.ok(!(await p.ev(`!!document.querySelector('${EBOOK} .mod-part')`)), 'and its structure: every note a chapter, no parts');
	// taken back: a detail that says nothing is taken out of the note, not left empty
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="details"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${DETAILS} [data-binders-key="title"]')`);
	for (const [k, v] of [['title', ''], ['subtitle', ''], ['author', ''], ['copyright', ''], ['language', ''], ['contents-page', 'titled'], ['structure', '']]) await detail(p, k, v);
	t.ok(await until(p, `app.vault.adapter.read(${j(NOTE)}).then(t => t === ${j(before[NOTE])})`, 4000), 'every detail taken back: the binder note is byte for byte what it was');
	await closeAll(p);
	same(t, before, await texts(p));
});

test('Book details and the cover never write to a binder in a newer format, or to a Longform project’s note', async (p, h, t) => {
	const was = await p.ev(`app.vault.adapter.read(${j(NOTE)})`);
	await writeRaw(p, NOTE, was.replace('binder: 1', 'binder: 99'));
	await until(p, `!!${PL}.binders.problem('The Lighthouse')`, 6000);
	const before = await texts(p);
	await openView(p, 'The Lighthouse');
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="details"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${DETAILS} [data-binders-key="title"]')`);
	t.ok((await p.ev(`document.querySelector('${DETAILS} .binders-book-details-locked')?.textContent ?? ''`)).includes('newer version of Binders'), 'Book details says why nothing can be changed');
	t.eq((await p.ev(`[...document.querySelectorAll('${DETAILS} input[type="text"], ${DETAILS} select:not([aria-hidden]), ${DETAILS} .checkbox-container')].filter(e => !(e.disabled || e.classList.contains('is-disabled'))).map(e => e.dataset.bindersKey ?? e.outerHTML.slice(0, 90))`)).join(), '', 'and every field is shut');
	// (and if a field were written to all the same, the note is refused, not rewritten)
	await detail(p, 'title', 'Forced');
	await detail(p, 'language', 'fr');
	await p.sleep(600);
	await closeAll(p);
	same(t, before, await texts(p));
	const lf = Object.keys(before).find((k) => k.startsWith('Longform demo/') && /^---\n[\s\S]*?longform:/.test(before[k]));
	t.ok(!!lf, 'the test vault has a Longform project');
	await openView(p, 'Longform demo');
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="details"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${DETAILS} [data-binders-key="title"]')`);
	t.ok((await p.ev(`document.querySelector('${DETAILS} .binders-book-details-locked')?.textContent ?? ''`)).includes('Longform'), 'a Longform project’s details are Longform’s to keep');
	await detail(p, 'title', 'Forced');
	await p.sleep(500);
	await closeAll(p);
	same(t, before, await texts(p));
});

test('the cover: chosen from the vault’s pictures, kept as a link in the binder note, and the EPUB’s cover image', async (p, h, t, before) => {
	writeFileSync(join(p.vaultDir, 'cover.png'), png(1600, 2560));
	writeFileSync(join(p.vaultDir, 'small.png'), png(300, 480));
	await until(p, `!!app.vault.getAbstractFileByPath('cover.png') && !!app.vault.getAbstractFileByPath('small.png')`, 8000);
	await withAuthor(p);
	await openEbook(p);
	const choose = async (name) => {
		await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="cover"]').click(); return 1; })()`);
		await until(p, `[...document.querySelectorAll('.suggestion-item')].some(e => e.textContent === ${j(name)})`, 4000);
		await p.ev(`(() => { [...document.querySelectorAll('.suggestion-item')].find(e => e.textContent === ${j(name)}).click(); return 1; })()`);
	};
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="cover"]').textContent`), 'Choose...', 'no cover yet');
	await choose('small.png');
	t.ok(await until(p, `!!document.querySelector('${EBOOK} .mod-cover img') && [...document.querySelectorAll('${WIN} .binders-export-warn-text')].some(e => e.textContent.includes('480 pixels on its longer side'))`, 6000), 'a small cover is shown, and said to be small for the stores');
	await choose('cover.png');
	t.ok(await until(p, `app.vault.adapter.read(${j(NOTE)}).then(t => t.includes('cover: "[[cover.png]]"'))`, 4000), 'the cover is kept in the binder note, as a link');
	t.ok(await until(p, `!!document.querySelector('${EBOOK} .mod-cover img') && ![...document.querySelectorAll('${WIN} .binders-export-warn-text')].some(e => e.textContent.includes('longer side'))`, 6000), 'and shown first in the book, with nothing said against it');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="cover"]').textContent`), 'Change...', 'the button offers to change it');
	await press(p, 'Export');
	t.ok(await saved(p), 'exported');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.epub'), e = epub(at);
	t.ok(e.names.includes('OEBPS/images/cover.png') && e.opf.includes('href="images/cover.png" media-type="image/png" properties="cover-image"'), 'the EPUB has it as its cover image');
	const verdict = epubcheck(at);
	if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes the book with its cover');
	await choose('No cover');
	t.ok(await until(p, `app.vault.adapter.read(${j(NOTE)}).then(t => t === ${j(before[NOTE])})`, 4000), '“No cover” takes it out of the note again, which is then what it was');
	same(t, before, await texts(p));
});

test('an ebook of 150,000 words is exported in time, word for word', async (p, h, t) => {
	const LIST = 'the light keeper water stone island storm glass tower lamp night boat letter she he was had and of in to a not with for on at from by when then'.split(' ');
	const n = await p.ev(`(async () => {
		const list = ${j(LIST)}; let seed = 11; const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
		await app.vault.createFolder('Big'); let total = 0; const order = [];
		for (let c = 1; c <= 30; c++) {
			const lines = [];
			for (let l = 0; l < 100; l++) { const w = []; for (let i = 0; i < 50; i++) w.push(list[Math.floor(next() * list.length)]); lines.push(w.join(' ') + '.'); total += 50; }
			await app.vault.create('Big/Chapter ' + c + '.md', lines.join('\\n') + '\\n'); order.push('Chapter ' + c);
		}
		await app.vault.create('Big/Big.md', '---\\nbinder: 1\\ncontents:\\n' + order.map(o => '  - ' + o).join('\\n') + '\\n---\\n');
		return total;
	})()`);
	t.eq(n, 150000, 'a binder of 150,000 words');
	await until(p, `!!${PL}.binders.binderOf('Big')`, 8000);
	await p.sleep(500);
	await open(p, 'Big');
	const t0 = Date.now();
	await pick(p, 'Ebook');
	await until(p, `!!document.querySelector('${EBOOK} .binders-export-section.mod-chapter')`, 20000);
	const shown = Date.now() - t0, t1 = Date.now();
	await press(p, 'Export');
	t.ok(await saved(p, 30000), 'it is exported');
	const took = Date.now() - t1;
	t.ok(shown < 15000, `the window shows it in under 15 s (${shown} ms)`);
	t.ok(took < 15000, `and exports it in under 15 s (${took} ms)`);
	const e = epub(join(p.vaultDir, 'Exports', 'Big.epub')), got = words(e.body);
	const want = words((await Promise.all(Array.from({ length: 30 }, (_, i) => p.ev(`app.vault.adapter.read('Big/Chapter ${i + 1}.md')`)))).join(' '));
	t.eq(got.length, 150000, 'every word is in the file');
	t.ok(got.every((w, i) => w === want[i]), 'in order');
	t.eq(e.headings.length, 30, 'thirty chapters');
});

async function onMobile(p, width, height, fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await theme();
	await p.sleep(200);
	try { await fn(); } finally {
		await closeAll(p);
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
		await theme();
	}
}
const tapEl = async (p, expr) => { const at = await p.ev(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); if (!at) throw new Error(`nothing to tap: ${expr}`); await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] }); await p.sleep(40); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.sleep(450); };
const button = (label) => `[...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop()`;

specs.push({ name: 'export: a phone: the choices first with Preview and Export at their foot, the preview second; the file goes to Exports in the vault', fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	await onMobile(p, 390, 844, async () => {
		t.eq(await p.ev(`${PL}.exportHost.desktop(app)`), null, 'a phone has no save dialog: the way to it says so');
		await open2(p);
		t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-export-side') && !document.querySelector('${WIN} .binders-export-pane')`), 'the choices are the first screen');
		t.eq((await kinds(p)).join('|'), 'Manuscript|Ebook|Scrivener project|One note', 'the same kinds');
		t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-phone-row button')].map(b => b.textContent)`)).join('|'), 'Preview|Export', 'Preview and Export at the foot');
		t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place').textContent`), 'Goes to Exports/The Lighthouse.docx, then to where you share it', 'where the file will go');
		const fits = await p.ev(`(() => { const m = document.querySelector('${WIN}').getBoundingClientRect(); return [...document.querySelectorAll('${WIN} .setting-item, ${WIN} .binders-export-phone-row button')].every(e => { const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1; }); })()`);
		t.ok(fits, 'nothing is wider than the screen');
		await tapEl(p, button('Preview'));
		t.ok(await until(p, `!!document.querySelector('${WIN} .binders-export-pane .binders-export-paper .binders-export-section') && !document.querySelector('${WIN} .binders-export-side')`), 'Preview is the second screen: the text on paper');
		t.ok(await p.ev(`document.querySelector('${WIN} .binders-export-paper').getBoundingClientRect().width <= 390`), 'the paper fits the screen');
		await tapEl(p, `document.querySelector('${WIN} .modal-setting-back-button')`);
		t.ok(await until(p, `!!document.querySelector('${WIN} .binders-export-side') && !document.querySelector('${WIN} .binders-export-pane')`), 'the arrow goes back to the choices');
		await tapEl(p, button('Export'));
		t.ok(await until(p, `app.vault.adapter.exists('Exports/The Lighthouse.docx')`, 8000), 'Export puts the file in Exports, in the vault');
		await p.sleep(500);
		const d = docx(join(p.vaultDir, 'Exports', 'The Lighthouse.docx'));
		t.eq(words(d.body.join(' ')).join(' '), sourceWords(before).join(' '), 'word for word');
		t.ok((await notices(p)).includes('Exported “The Lighthouse” to Exports/The Lighthouse.docx.'), 'and says so (there is no share sheet in a test)');
	});
	same(t, before, await texts(p));
}) });
/** The window opened on a phone or tablet (the command, with the binder's view in front). */
async function open2(p) {
	await openView(p, 'The Lighthouse');
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
	await p.sleep(400);
}

specs.push({ name: 'export: a tablet has both panes', fn: withTidy(async (p, h, t) => {
	await onMobile(p, 1024, 768, async () => {
		await open2(p);
		t.ok(await until(p, `!!document.querySelector('${WIN} .binders-export-side') && !!document.querySelector('${WIN} .binders-export-pane .binders-export-paper .binders-export-section')`), 'the choices and the preview side by side');
		const r = await p.ev(`(() => { const a = document.querySelector('${WIN} .binders-export-side').getBoundingClientRect(), b = document.querySelector('${WIN} .binders-export-pane').getBoundingClientRect(); return a.right <= b.left + 1 && b.width > a.width; })()`);
		t.ok(r, 'the preview beside the choices, and wider');
		t.ok(await p.ev(`!!${button('Export')} && !document.querySelector('${WIN} .binders-export-phone-row')`), 'Export is in the bar, as on a computer');
	});
}) });

specs.push({ name: 'export: an ebook on a phone and a tablet: three kinds, its rows whole on the screen, the file in Exports', fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		t.eq((await kinds(p)).join('|'), 'Manuscript|Ebook|Scrivener project|One note', 'the same three kinds');
		await tapEl(p, `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === 'Ebook')`);
		t.ok(await until(p, `document.querySelector('${WIN} .binders-export-place')?.textContent === 'Goes to Exports/The Lighthouse.epub, then to where you share it'`, 6000), 'the ebook is chosen, and says where its file will go');
		t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item-name')].map(e => e.textContent)`)).join('|'), 'Style|Cover|Book details|Your name', 'its rows: the style, the cover, Book details, and (until it is said) the writer’s name');
		const rows = await p.ev(`(() => { const m = document.querySelector('${WIN}').getBoundingClientRect(); return [...document.querySelectorAll('${WIN} [role="option"], ${WIN} .setting-item, ${WIN} .binders-export-phone-row button')].map(e => { const r = e.getBoundingClientRect(), n = e.querySelector('.setting-item-name'); return { what: (n ?? e).textContent.slice(0, 24), inside: r.left >= m.left - 1 && r.right <= m.right + 1, cut: !!n && n.scrollWidth > n.clientWidth + 1, tall: r.height }; }); })()`);
		for (const r of rows) t.ok(r.inside && !r.cut && r.tall >= 40, `“${r.what}” is whole, on the screen, and big enough to tap (${JSON.stringify(r)})`);
		t.ok(await p.ev(`(() => { const s = document.querySelector('${WIN} .binders-export-side .modal-sidebar-inner') ?? document.querySelector('${WIN} .binders-export-side'), b = ${button('Export')}.getBoundingClientRect(); return b.bottom <= window.innerHeight + 1 || s.scrollHeight > s.clientHeight; })()`), 'Export is on the screen, or the choices scroll to it');
		await tapEl(p, `document.querySelector('${WIN} [data-binders-key="details"]')`);
		t.ok(await until(p, `!!document.querySelector('${DETAILS} [data-binders-key="title"]')`, 4000), 'Book details opens from its row');
		t.ok(await p.ev(`[...document.querySelectorAll('${DETAILS} .setting-item')].every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; })`), 'and its rows fit the screen');
		await p.key('Escape');
		await p.sleep(400);
		await tapEl(p, button('Preview'));
		t.ok(await until(p, `!!document.querySelector('${WIN} .binders-export-pane ${'.binders-export-paper.mod-ebook'} .mod-chapter') && !document.querySelector('${WIN} .binders-export-side')`, 6000), 'Preview is the second screen: the ebook on paper');
		t.ok(await p.ev(`document.querySelector('${EBOOK}').getBoundingClientRect().width <= 390`), 'the paper fits the screen');
		await tapEl(p, `document.querySelector('${WIN} .modal-setting-back-button')`);
		await until(p, `!!document.querySelector('${WIN} .binders-export-side')`);
		await tapEl(p, button('Export'));
		t.ok(await until(p, `app.vault.adapter.exists('Exports/The Lighthouse.epub')`, 8000), 'Export puts the file in Exports, in the vault');
		await p.sleep(500);
		const e = epub(join(p.vaultDir, 'Exports', 'The Lighthouse.epub'));
		t.eq(words(e.body).join(' '), sourceWords(before).join(' '), 'word for word');
		t.ok((await notices(p)).includes('Exported “The Lighthouse” to Exports/The Lighthouse.epub.'), 'and says so (there is no share sheet in a test)');
		const verdict = epubcheck(join(p.vaultDir, 'Exports', 'The Lighthouse.epub'));
		if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes the ebook a phone made');
	});
	await onMobile(p, 1024, 768, async () => {
		await open2(p);
		t.ok(await until(p, `!!document.querySelector('${WIN} .binders-export-side') && !!document.querySelector('${WIN} .binders-export-pane ${'.binders-export-paper.mod-ebook'} .mod-chapter')`, 8000), 'a tablet: the ebook (the kind last used) beside its choices');
		t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-export-head [data-binders-key="details"]')`), 'with Book details beside the book’s name, as on a computer');
	});
	same(t, before, await texts(p));
}) });
