// Export's Scrivener project (src/export/scriv/, src/view/export-scriv.ts): the kind in the window, the `.scriv`
// folder written whole through the save dialog, a project opened since never written over, and the zip in the vault
// where a folder can't be written (the fallback, and a phone). The system's save dialog can't be driven from a test,
// so a stand-in answers for it (the plugin's `exportHost`), as in specs-export.mjs; everything after it is real: the
// folder is written to the disk and read back here. Every test that exports checks that no note changed.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { PL, clickMenu, j, openView, reload, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const WIN = '.modal.binders-export';
const KIND = 'Scrivener project';

/** Words as the test compares them: letters and digits. */
const words = (s) => s.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
/** The text of an RTF file as this writer makes them, read by a few patterns of the test's own. */
const rtfText = (s) => s.replace(/\{\\fonttbl[\s\S]*?\}\}|\{\\colortbl[^}]*\}|\{\\\*\\fldinst\{[^}]*\}\}/g, '').replace(/\\u(-?\d+)\?/g, (_m, n) => String.fromCharCode(+n < 0 ? +n + 65536 : +n)).replace(/\\par\b|\\line\b/g, '\n').replace(/\\tab\b/g, '\t').replace(/\\([\\{}])/g, (_m, c) => ({ '\\': '\u0001', '{': '\u0002', '}': '\u0003' })[c]).replace(/\\[a-zA-Z]+-?\d* ?/g, '').replace(/[{}]/g, '').replace(/[\u0001-\u0003]/g, (c) => '\\{}'[c.charCodeAt(0) - 1]);
/** A project on the disk (a folder) or in a zip, read: its files by their path inside it. */
function project(at) {
	const files = {};
	const walk = (dir, rel) => { for (const n of readdirSync(dir)) { const full = join(dir, n), r = rel ? `${rel}/${n}` : n; if (statSync(full).isDirectory()) walk(full, r); else files[r] = readFileSync(full); } };
	walk(at, '');
	return read(files);
}
function read(files) {
	const str = (path) => (files[path] ? Buffer.from(files[path]).toString('utf8') : null);
	const scrivx = Object.keys(files).find((n) => n.endsWith('.scrivx')), x = str(scrivx) ?? '';
	const items = [...x.matchAll(/<BinderItem UUID="([^"]+)" Type="([^"]+)"[^>]*>\s*<Title>([^<]*)<\/Title>\s*<MetaData>([\s\S]*?)<\/MetaData>/g)].map((m) => ({ id: m[1], type: m[2], title: m[3].replace(/&amp;/g, '&'), meta: m[4] }));
	const text = (title) => { const it = items.find((i) => i.title === title), r = it ? str(`Files/Data/${it.id}/content.rtf`) : null; return r == null ? null : rtfText(r); };
	return { names: Object.keys(files).sort(), scrivx, x, items, str, text, item: (title) => items.find((i) => i.title === title) };
}

const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const pick = async (p, name) => { await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(name)}).click(); return 1; })()`); await until(p, `!!document.querySelector('${WIN} .binders-export-binder .binders-export-row')`, 8000); await p.sleep(300); };
/** Opens the Export window on a binder's folder, on the Scrivener project. */
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
	await p.sleep(300);
	await pick(p, KIND);
}
const press = async (p, label) => { if (!(await p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b) return false; b.click(); return true; })()`))) throw new Error(`no button “${label}” in the Export window`); await p.sleep(100); };
const status = (p) => p.ev(`document.querySelector('${WIN} .binders-export-status')?.textContent ?? ''`);
const saved = (p, ms = 10000) => until(p, `(document.querySelector('${WIN} .binders-export-status')?.textContent ?? '').startsWith('Saved to')`, ms);
const rows = (p) => p.ev(`[...document.querySelectorAll('${WIN} .binders-export-binder .binders-export-row')].map(r => '  '.repeat(Number(r.style.getPropertyValue('--binders-export-depth'))) + r.querySelector('.nav-file-title-content').textContent + (r.querySelector('.nav-file-tag') ? ' [' + r.querySelector('.nav-file-tag').textContent + ']' : '') + (r.classList.contains('binders-export-out') ? ' (out)' : ''))`);
const toggle = async (p, key) => { await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="${key}"]').click(); return 1; })()`); await p.sleep(900); };
const again = async (p) => { await p.ev(`(() => { document.querySelector('${WIN} [aria-label="More"]').click(); return 1; })()`); await clickMenu(p, 'Export'); };
const modal = (text) => `[...document.querySelectorAll('.modal')].some(m => m.textContent.includes(${j(text)}))`;
const answer = async (p, label) => { await p.ev(`(() => { [...document.querySelectorAll('.modal button')].filter(b => b.textContent === ${j(label)}).pop().click(); return 1; })()`); await p.sleep(400); };
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);
const closeAll = async (p) => { for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); } };

/** Stands in for the system's save dialog (see specs-export.mjs). `none`: no dialog at all. `flat`: the disk can't
    be written as folders. */
const standIn = (p, o = {}) => p.ev(`(() => {
	const pl = ${PL}; window.__bx ??= { real: pl.exportHost.desktop };
	window.__bx.asked = []; window.__bx.to = ${j(o.to)}; window.__bx.none = ${j(!!o.none)}; window.__bx.flat = ${j(!!o.flat)};
	pl.exportHost.desktop = (app) => { const d = window.__bx.none ? null : window.__bx.real(app); return d && { ...d, ...(window.__bx.flat ? { writeFolder: undefined, folderStamp: undefined } : {}), pick: async (start) => { window.__bx.asked.push(start); return window.__bx.to === undefined ? start : window.__bx.to; } }; };
	return 1;
})()`);
const test = (name, fn, o) => specs.push({ name: 'export, Scrivener: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(async () => { app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	await standIn(p, o);
	try { await fn(p, h, t); } finally {
		await closeAll(p);
		await p.ev(`(async () => { const pl = ${PL}; if (window.__bx) pl.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });

/** The fixture given what a project carries: a label, a target, a note left out, a footnote, a comment, a link, a
    paragraph begun with a tab, a folder note with text, a note outside the manuscript, a snapshot. */
async function dress(p) {
	const L = 'The Lighthouse/';
	await writeRaw(p, `${L}Part One/Arrival.md`, '---\nstatus: revised\nlabel: Blue\ntarget: 1200\nnotes: Ask Tom about the tide.\nsynopsis: Mara arrives on the island with the supply boat.\ntags:\n  - storm\n---\nThe supply boat left Mara on the jetty.[^1] %%Check the tide.%%\n\n\tIt did **not** wait, see [[The keeper]].\n\n[^1]: With two cases.\n');
	await writeRaw(p, `${L}Part Two/The wreck.md`, '---\nexport: false\n---\nA scene that was cut.\n');
	await writeRaw(p, `${L}Part One/Part One.md`, '---\nsynopsis: The first days.\n---\nNotes for part one.\n');
	await p.ev(`(async () => { await app.vault.create(${j(`${L}Notes on lighthouses.md`)}, '---\\nexport: false\\n---\\nFresnel lenses.\\n'); await app.vault.adapter.mkdir(${j(`${L}Snapshots/Part One/Arrival`)}); await app.vault.adapter.write(${j(`${L}Snapshots/Part One/Arrival/2026-09-01 10.00.00 Before the rewrite.snapshot`)}, '---\\nsnapshot-of: "Part One/Arrival"\\ntaken: 2026-09-01T10:00:00\\n---\\nAn earlier arrival.\\n'); })().then(() => 1)`);
	await until(p, `app.metadataCache.getCache(${j(`${L}Notes on lighthouses.md`)})?.frontmatter?.export === false && app.metadataCache.getCache(${j(`${L}Part One/Arrival.md`)})?.frontmatter?.label === 'Blue' && app.metadataCache.getCache(${j(`${L}Part Two/The wreck.md`)})?.frontmatter?.export === false`, 8000);
	await p.sleep(600);
}

test('the kind in the window: the binder as Scrivener will list it, two switches, and what is carried across', async (p, h, t) => {
	await dress(p);
	const before = await texts(p);
	await openView(p, 'The Lighthouse');
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
	t.ok((await p.ev(`[...document.querySelectorAll('${WIN} [role="option"]')].map(e => e.getAttribute('aria-label'))`)).includes('Scrivener project: The binder itself, for Scrivener 3'), 'the kind is in the list, with what it is for');
	await pick(p, KIND);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-snapshots-name').textContent + ' | ' + document.querySelector('${WIN} .binders-snapshots-detail').textContent`), 'Scrivener project | 9 documents · 2 folders', 'the bar says what is being made and how big it is');
	t.eq((await rows(p)).join('\n'), ['Draft', '  Prologue [Draft]', '  Part One', '    Arrival [Revised]', '    The keeper [Draft]', '    Storm warning [Idea]', '  Part Two', '    The wreck (out)', '    Lights out [Idea]', '  Epilogue [Idea]', 'Research', '  The Lighthouse (binder note)', '  Notes on lighthouses (out)', 'Trash'].join('\n'), 'the preview is the binder as Scrivener will list it: Draft in binder order, Research, Trash');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item-name')].map(e => e.textContent)`)).join('|'), 'Notes outside the manuscript|Snapshots', 'two switches, and no style');
	const caption = await p.ev(`document.querySelector('${WIN} .binders-export-caption').textContent`);
	t.ok(caption.startsWith('Carried across: the order, synopses, labels and their colors, statuses, targets, “Include in export”, and 1 snapshot.'), `the caption says what is carried across (${caption.slice(0, 60)}…)`);
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .modal-setting-titlebar-actions button')].map(b => b.textContent)`)).join('|'), 'Export', 'one button: Export (no Contents, no Copy)');
	// (for looking at: BINDERS_SHOTS=folder keeps a picture of the window in each theme)
	if (process.env.BINDERS_SHOTS) { mkdirSync(process.env.BINDERS_SHOTS, { recursive: true }); await p.shot(join(process.env.BINDERS_SHOTS, `scrivener-${(await p.ev(`document.body.classList.contains('theme-dark')`)) ? 'dark' : 'light'}.png`)); }
	await toggle(p, 'outside');
	const off = (await rows(p)).join('|');
	t.ok(!off.includes('binder note') && off.endsWith('|Research|Trash') && off.indexOf('  Notes on lighthouses (out)') > 0 && off.indexOf('  Notes on lighthouses (out)') < off.indexOf('|Research'), `the first switch off: Research is empty, and what is left out stays in the draft (${off})`);
	await toggle(p, 'snapshots');
	t.ok(!(await p.ev(`document.querySelector('${WIN} .binders-export-caption').textContent`)).includes('snapshot'), 'the second off: no snapshots');
	t.eq(await p.ev(`${PL}.settings.exportOutside + ',' + ${PL}.settings.exportSnapshots + ',' + ${PL}.settings.exportKind`), 'false,false,scrivener', 'the choices are kept');
	// a row opens its note
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} .binders-export-binder .binders-export-row')].find(r => r.textContent.startsWith('Arrival')).click(); return 1; })()`);
	t.ok(await until(p, `!document.querySelector('${WIN}') && app.workspace.getActiveFile()?.path === 'The Lighthouse/Part One/Arrival.md'`), 'a row opens its note');
	same(t, before, await texts(p));
});

test('a Scrivener project goes through the save dialog: a .scriv folder, written whole, with the binder word for word', async (p, h, t) => {
	await dress(p);
	const before = await texts(p);
	await open(p);
	await press(p, 'Export');
	t.ok(await saved(p), 'the bar says it was saved');
	const dir = join(p.vaultDir, 'Exports'), at = join(dir, 'The Lighthouse.scriv');
	t.eq((await p.ev(`window.__bx.asked`)).join(), at, 'the dialog was opened once, in Exports beside the binder, with the binder’s name');
	t.ok(existsSync(at) && statSync(at).isDirectory(), 'the project is a folder where the dialog said');
	t.eq(readdirSync(dir).join(), 'The Lighthouse.scriv', 'and nothing else is there: no half-written project');
	const pr = project(at);
	t.eq(pr.scrivx, 'The Lighthouse.scrivx', 'the .scrivx is named like the folder');
	t.ok(pr.str('Files/version.txt') === '23' && pr.names.includes('Files/styles.xml') && pr.names.includes('Settings/compile.xml'), 'the format’s version, the styles and the compile settings');
	t.ok(new RegExp(`Creator="BINDERS-${(await p.ev(`${PL}.manifest.version`)).replace(/\./g, '\\.')}"`).test(pr.x), 'it says honestly who made it');
	t.eq(pr.items.map((i) => i.title).join('|'), 'Draft|Prologue|Part One|Arrival|The keeper|Storm warning|Part Two|The wreck|Lights out|Epilogue|Research|The Lighthouse (binder note)|Notes on lighthouses|Trash', 'the tree is the binder, in its order');
	t.ok(pr.item('Part One').type === 'Folder' && pr.item('Arrival').type === 'Text', 'folders are folders and notes are texts');
	const a = pr.item('Arrival');
	t.ok(/<LabelID>5<\/LabelID>/.test(a.meta) && /<StatusID>2<\/StatusID>/.test(a.meta) && a.meta.includes('<Value>Part One/Arrival</Value>') && pr.x.includes('<Target Type="Words" Notify="No">1200</Target>') && pr.x.includes('<Title>storm</Title>'), 'a note’s label, status, target, tag and its path in the binder');
	t.eq(pr.str(`Files/Data/${a.id}/synopsis.txt`), 'Mara arrives on the island with the supply boat.', 'its synopsis');
	t.ok(rtfText(pr.str(`Files/Data/${a.id}/notes.rtf`) ?? '').includes('Ask Tom about the tide.') && !a.meta.includes('Ask Tom'), 'the notes on it are the document’s notes, and no custom metadata');
	t.ok(pr.item('Prologue').meta.includes('<IncludeInCompile>Yes') && !pr.item('The wreck').meta.includes('IncludeInCompile'), '“Include in export” off is “not included in compile”');
	const r = pr.str(`Files/Data/${a.id}/content.rtf`);
	t.ok(r.includes('\\{\\\\Scrv_fn=With two cases.\\\\end_Scrv_fn\\}') && r.includes('\\\\text=Check the tide.\\\\end_Scrv_annot\\}') && r.includes('\\pard\\fi360 It did {\\b not} wait') && r.includes(`scrivlnk://${pr.item('The keeper').id}`), 'a footnote, a comment, a paragraph begun with a tab, a link to another note');
	t.ok(pr.text('Part One').includes('Notes for part one.') && pr.text('The Lighthouse (binder note)').includes('A short novel about a lighthouse'), 'a folder note’s text is the folder’s; the binder note’s is in Research');
	const snaps = pr.names.filter((n) => n.startsWith(`Snapshots/${a.id}.snapshots/`));
	t.ok(snaps.length === 2 && pr.str(`Snapshots/${a.id}.snapshots/index.xml`).includes('<Title>Before the rewrite</Title>') && rtfText(pr.str(snaps.find((n) => n.endsWith('.rtf')))).includes('An earlier arrival.'), 'the note’s snapshot, with its name');
	// word for word: every note's words, in binder order, are the words in the project's documents, in its order
	const order = ['Prologue', 'Part One/Part One', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/Part Two', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue', 'The Lighthouse', 'Notes on lighthouses'];
	const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^\[\^1\]: (.*)$/m, '').replace('[^1]', ' With two cases. ').replace(/\[\[|\]\]|%%|\*\*|`/g, ' ');
	const want = order.flatMap((n) => words(body(before[`The Lighthouse/${n}.md`] ?? '')));
	const got = pr.items.flatMap((i) => words((pr.text(i.title) ?? '').replace(/\{\\Scrv_fn=|\\end_Scrv_fn\}|\{\\Scrv_annot \\color=\{[^}]*\} \\text=|\\end_Scrv_annot\}/g, ' ')));
	t.ok(want.length > 100, `the binder has its words (${want.length})`);
	const off = want.findIndex((w, i) => w !== got[i]);
	t.ok(off < 0 && got.length === want.length, `word for word: the words in the project are the words of the notes, in binder order${off < 0 ? '' : ` (at word ${off}: wanted “${want.slice(Math.max(0, off - 3), off + 4).join(' ')}”, got “${got.slice(Math.max(0, off - 3), off + 4).join(' ')}”)`}`);
	t.eq(await status(p), 'Saved to Exports/The Lighthouse.scriv', 'the window says where it went');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .modal-setting-titlebar-actions button')].map(b => b.textContent)`)).join('|'), 'Show in folder|Open', 'with the ways to it');
	same(t, before, await texts(p));
});

test('exported again, its own project is replaced whole; a project opened since is never written over', async (p, h, t) => {
	await open(p);
	await press(p, 'Export');
	await saved(p);
	const dir = join(p.vaultDir, 'Exports'), at = join(dir, 'The Lighthouse.scriv'), first = project(at);
	// the binder changes: a note goes. Its files must not be left behind in the project.
	await p.ev(`app.vault.adapter.remove('The Lighthouse/Epilogue.md').then(() => 1)`);
	await until(p, `!app.vault.getAbstractFileByPath('The Lighthouse/Epilogue.md')`);
	await again(p);
	await p.sleep(1500);
	t.ok(!(await p.ev(modal('Save beside it'))), 'its own project, as it left it, is replaced without a question');
	const second = project(at);
	t.ok(!second.item('Epilogue') && !second.names.some((n) => n.includes(first.item('Epilogue').id)), 'replaced whole: nothing of the old project is left in the new');
	t.eq(readdirSync(dir).join(), 'The Lighthouse.scriv', 'and nothing beside it: no part, no old one');
	// Scrivener opens it: it writes files of its own into the project
	writeFileSync(join(at, 'Files', 'binder.autosave'), 'Scrivener was here');
	await again(p);
	t.ok(await until(p, modal('Save beside it')), 'a project changed since is asked about');
	t.ok(await p.ev(modal('Export never writes into such a project')), 'and the question says why');
	await answer(p, 'Cancel');
	await p.sleep(500);
	t.eq(readdirSync(dir).join(), 'The Lighthouse.scriv', 'Cancel: nothing is written');
	await again(p);
	await until(p, modal('Save beside it'));
	await answer(p, 'Save as “The Lighthouse 2.scriv”');
	t.ok(await until(p, `(document.querySelector('${WIN} .binders-export-status')?.textContent ?? '') === 'Saved to Exports/The Lighthouse 2.scriv'`, 8000), 'it is saved beside it, under the next free name');
	t.eq(readFileSync(join(at, 'Files', 'binder.autosave'), 'utf8'), 'Scrivener was here', 'the project that was opened is untouched');
	t.eq(project(join(dir, 'The Lighthouse 2.scriv')).scrivx, 'The Lighthouse 2.scrivx', 'the new project’s .scrivx is named like its folder');
	t.eq(readdirSync(dir).sort().join(), 'The Lighthouse 2.scriv,The Lighthouse.scriv', 'two projects, and nothing else');
});

test('the dialog cancelled, or a place that can’t be written: no project, and no half of one', async (p, h, t) => {
	const before = await texts(p);
	await standIn(p, { to: null });
	await open(p);
	await press(p, 'Export');
	await p.sleep(800);
	t.ok(!existsSync(join(p.vaultDir, 'Exports')) && (await status(p)) === '', 'Cancel in the dialog: nothing is written, not even the Exports folder');
	// a place under a file: no folder can be made there
	const under = join(p.vaultDir, 'The Lighthouse', 'Prologue.md', 'The Lighthouse.scriv');
	await standIn(p, { to: under });
	await press(p, 'Export');
	await p.sleep(1500);
	t.ok((await notices(p)).includes('The export didn’t finish') && !existsSync(join(p.vaultDir, 'The Lighthouse', 'Prologue.md.binders-part')), 'a place that can’t be written: the window says the export didn’t finish');
	// a place where the folder can be begun and not finished: a file is where one of its folders must go
	const out = join(p.vaultDir, 'Elsewhere');
	mkdirSync(join(out, 'The Lighthouse.scriv.binders-part'), { recursive: true });
	writeFileSync(join(out, 'The Lighthouse.scriv.binders-part', 'leftover.txt'), 'from an export that was cut short');
	await standIn(p, { to: join(out, 'The Lighthouse.scriv') });
	await press(p, 'Export');
	t.ok(await saved(p), 'what an export that was cut short left beside the place doesn’t stop the next');
	t.eq(readdirSync(out).join(), 'The Lighthouse.scriv', 'and is gone: the project, whole, and nothing else');
	t.ok(!project(join(out, 'The Lighthouse.scriv')).names.includes('leftover.txt'), 'with nothing of it inside');
	same(t, before, await texts(p));
});

test('the fallback: where a folder can’t be written, the project is zipped into the Exports folder in the vault', async (p, h, t) => {
	const before = await texts(p);
	t.ok(await p.ev(`(() => { const d = window.__bx.real(app); return !!d && typeof d.writeFolder === 'function' && typeof d.folderStamp === 'function'; })()`), 'here the disk can be written as folders');
	for (const [o, what] of [[{ none: true }, 'no save dialog'], [{ flat: true }, 'a disk without folders']]) {
		await standIn(p, o);
		await open(p);
		t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place').textContent`), 'Goes to Exports/The Lighthouse.scriv.zip, in this vault', `${what}: the window says where it will go`);
		await press(p, 'Export');
		t.ok(await saved(p), `${what}: it is saved`);
		t.ok(await p.ev(`app.vault.adapter.exists('Exports/The Lighthouse.scriv.zip')`), `${what}: the zip is in the vault`);
		const z = unzipSync(new Uint8Array(readFileSync(join(p.vaultDir, 'Exports', 'The Lighthouse.scriv.zip'))));
		const pr = read(Object.fromEntries(Object.entries(z).map(([k, v]) => [k.replace(/^The Lighthouse\.scriv\//, ''), v])));
		t.ok(Object.keys(z).every((k) => k.startsWith('The Lighthouse.scriv/')) && pr.scrivx === 'The Lighthouse.scrivx' && pr.str('Files/version.txt') === '23', `${what}: in it, the project’s folder`);
		t.eq(pr.items.filter((i) => i.type === 'Text').length, 8, `${what}: with the binder’s notes, and the binder note’s text`);
		t.ok(strFromU8(z[`The Lighthouse.scriv/Files/Data/${pr.item('Prologue').id}/content.rtf`]).startsWith('{\\rtf1'), `${what}: and their text`);
		await closeAll(p);
		await p.ev(`app.vault.adapter.rmdir('Exports', true).then(() => 1)`);
		await p.sleep(400);
	}
	same(t, before, await texts(p));
});

test('a binder of 150,000 words is a project in time', async (p, h, t) => {
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
	const shown = Date.now() - t0, t1 = Date.now();
	await press(p, 'Export');
	t.ok(await saved(p, 30000), 'it is exported');
	const took = Date.now() - t1;
	t.ok(shown < 15000, `the window shows it in under 15 s (${shown} ms)`);
	t.ok(took < 15000, `and exports it in under 15 s (${took} ms)`);
	const pr = project(join(p.vaultDir, 'Exports', 'Big.scriv'));
	const got = pr.items.filter((i) => i.type === 'Text').flatMap((i) => words(pr.text(i.title) ?? ''));
	const want = words((await Promise.all(Array.from({ length: 30 }, (_, i) => p.ev(`app.vault.adapter.read('Big/Chapter ${i + 1}.md')`)))).join(' '));
	t.eq(got.length, 150000, 'every word is in the project');
	t.ok(got.every((w, i) => w === want[i]), 'in order');
});

// ---- a phone ----
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
		await p.send('Emulation.clearDeviceMetricsOverride');
		await reload(p, false);
		await p.focusMain();
		await theme();
	}
}
const tapEl = async (p, expr) => { const at = await p.ev(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); if (!at) throw new Error(`nothing to tap: ${expr}`); await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] }); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.sleep(350); };

specs.push({ name: 'export, Scrivener: a phone gets the project zipped, in the Exports folder in the vault', fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	try {
		await onMobile(p, 390, 844, async () => {
			await openView(p, 'The Lighthouse');
			await run(p, 'export');
			await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
			await p.sleep(400);
			await tapEl(p, `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(KIND)})`);
			t.ok(await until(p, `(document.querySelector('${WIN} .binders-export-place')?.textContent ?? '') === 'Goes to Exports/The Lighthouse.scriv.zip, then to where you share it'`, 6000), 'a phone: the window says the project goes zipped to Exports, then to the share sheet');
			t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item-name')].map(e => e.textContent)`)).join('|'), 'Notes outside the manuscript|Snapshots', 'the two switches');
			t.ok(await p.ev(`(() => { const m = document.querySelector('${WIN}').getBoundingClientRect(); return [...document.querySelectorAll('${WIN} .setting-item, ${WIN} .binders-export-phone-row button')].every(e => { const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1; }); })()`), 'nothing is wider than the screen');
			await tapEl(p, `[...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === 'Preview' && b.getBoundingClientRect().width).pop()`);
			t.ok(await until(p, `!!document.querySelector('${WIN} .binders-export-pane .binders-export-binder .binders-export-row') && !document.querySelector('${WIN} .binders-export-side')`), 'Preview is the second screen: the binder as Scrivener will list it');
			t.ok(await p.ev(`document.querySelector('${WIN} .binders-export-binder').getBoundingClientRect().width <= 390`), 'the list fits the screen');
			await tapEl(p, `document.querySelector('${WIN} .modal-setting-back-button')`);
			await tapEl(p, `[...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === 'Export' && b.getBoundingClientRect().width).pop()`);
			t.ok(await until(p, `!!app.vault.getAbstractFileByPath('Exports/The Lighthouse.scriv.zip')`, 10000), 'Export: the zip is in the vault');
			const z = unzipSync(new Uint8Array(readFileSync(join(p.vaultDir, 'Exports', 'The Lighthouse.scriv.zip'))));
			t.ok(!!z['The Lighthouse.scriv/The Lighthouse.scrivx'] && strFromU8(z['The Lighthouse.scriv/Files/version.txt']) === '23', 'and in it the project');
		});
	} finally { await p.ev(`(async () => { const pl = ${PL}; pl.settings.exportKind = 'manuscript'; await pl.saveData(pl.settings); app.saveLocalStorage('binders-export', null); })().then(() => 1)`); }
	same(t, before, await texts(p));
}) });
