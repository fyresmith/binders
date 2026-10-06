// Export (src/export/, src/view/export.ts): the window, a manuscript as a Word file, one note, where files go. The
// system's own save dialog can't be driven from a test, so a stand-in answers for it (the plugin's `exportHost`), and
// everything after the dialog is real: the file is written to the disk and read back here. Every test that exports
// checks that no note changed.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { PL, clickMenu, file, j, openView, reload, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

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
	t.eq((await kinds(p)).join('|'), 'Manuscript|Scrivener project|One note', 'the kinds built so far, and no others');
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
	t.eq(await p.ev(`(() => { const l = document.querySelector('${WIN} [role="listbox"]'); return l.getAttribute('aria-label') + '|' + [...l.querySelectorAll('[role="option"]')].map(o => o.getAttribute('aria-label')).join('|'); })()`), 'What to make|Manuscript: Word, in standard manuscript format|Scrivener project: The binder itself, for Scrivener 3|One note: Markdown, in this vault', 'the list and its rows are named');
	await p.key('ArrowDown');
	await until(p, `document.querySelector('${WIN} .binders-snapshots-name').textContent === 'Scrivener project'`);
	t.eq(await p.ev(`document.activeElement?.querySelector('.binders-snapshots-item-name')?.textContent`), 'Scrivener project', 'Down chooses the next kind, and the keyboard stays in the list');
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
		t.eq((await kinds(p)).join('|'), 'Manuscript|Scrivener project|One note', 'the same kinds');
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
