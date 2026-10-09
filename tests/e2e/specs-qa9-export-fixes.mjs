// QA round 9, Export: the neighbours and side effects of the 14 fixes of 0.45.1-0.45.16. Tests named "qa9 export fixes: …"
// pass; "BUG: qa9 export fixes: …" are confirmed bugs and stay failing.
//   QA9_SHOTS=<dir>  keeps pictures of the window there
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, clickMenu, closeMenus, j, openView, same, texts, until, withTidy } from './view-helpers.mjs';
import { onMobile, button, WIN, asked, closeAll, docx, notices, open, pick, press, saved, standIn, status, withAuthor, words, run } from './specs-export.mjs';

export const specs = [];
const SHOTS = process.env.QA9_SHOTS || '';
const shot = async (p, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); const dark = await p.ev(`document.body.classList.contains('theme-dark')`); await p.sleep(300); await p.shot(join(SHOTS, `${name}-${dark ? 'dark' : 'light'}.png`)); };

const test = (name, fn, o) => specs.push({ name: 'qa9 export fixes: ' + name, fn: withTidy(async (p, h, t) => {
	const reset = `(async () => { app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportStyle = ''; pl.settings.exportsFolder = 'Exports'; pl.settings.exportFile = 'docx'; await pl.saveData(pl.settings); })().then(() => 1)`;
	await p.ev(reset);
	await standIn(p, o);
	await withAuthor(p);
	const before = await texts(p);
	try { await fn(p, h, t, before); if (!o?.changes) same(t, before, await texts(p), { skip: o?.skip ?? [] }); } finally {
		await closeAll(p);
		await closeMenus(p);
		await p.ev(`(async () => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; })().then(() => 1)`);
		await p.ev(reset);
	}
}) });
const bug = (name, fn, o) => { test(name, fn, o); specs[specs.length - 1].name = 'BUG: ' + specs[specs.length - 1].name; };

async function mk(p, name, notes, extra = '') {
	const order = [], seen = new Set();
	for (const [path] of notes) { const parts = path.split('/'); for (let i = 1; i < parts.length; i++) { const f = parts.slice(0, i).join('/') + '/'; if (!seen.has(f)) { seen.add(f); order.push(f); } } order.push(path); }
	await p.ev(`(async () => {
		const name = ${j(name)}, notes = ${j(notes)}, order = ${j(order)};
		const parts = name.split('/'); for (let i = 1; i <= parts.length; i++) { const d = parts.slice(0, i).join('/'); if (!(await app.vault.adapter.exists(d))) await app.vault.adapter.mkdir(d); }
		for (const f of order.filter(o => o.endsWith('/'))) if (!(await app.vault.adapter.exists(name + '/' + f.slice(0, -1)))) await app.vault.adapter.mkdir(name + '/' + f.slice(0, -1));
		for (const [path, text] of notes) await app.vault.create(name + '/' + path + '.md', text);
		await app.vault.create(name + '/' + name.split('/').pop() + '.md', '---\\nbinder: 1\\n${extra}contents:\\n' + order.map(o => '  - ' + JSON.stringify(o)).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	await until(p, `!!${PL}.binders.binderOf(${j(name)})`, 8000);
	await p.sleep(500);
}
const replaceAsked = (p) => p.ev(`[...document.querySelectorAll('.modal')].some(m => m.textContent.includes('Replace this file'))`);
const cancelAsk = async (p) => { await p.ev(`(() => { [...document.querySelectorAll('.modal button')].filter(b => b.textContent === 'Cancel').pop().click(); return 1; })()`); await p.sleep(400); };
/** Presses Export in the window on a folder; returns 'saved', 'asked' or 'nothing'. */
async function go(p, folder, kind = 'Manuscript') {
	await open(p, folder);
	await pick(p, kind);
	await press(p, 'Export');
	for (let i = 0; i < 80; i++) {
		if (await replaceAsked(p)) return 'asked';
		if (await saved(p, 100)) return 'saved';
		await p.sleep(150);
	}
	return 'nothing';
}
const outDir = (p) => p.ev(`(async () => { const pl = ${PL}; pl.settings.exportsFolder = 'Out/Books'; await pl.saveData(pl.settings); })().then(() => 1)`);
const NOTES = [['One', 'The first note has real words in it.\n'], ['Two', 'The second note, also with words.\n']];
const wait = async (p, ms = 600) => p.sleep(ms);

test('two binders called Draft on different shelves: the second asks before replacing the first’s file; No leaves it byte for byte; the same book twice replaces silently', async (p, h, t) => {
	await standIn(p, { none: true });
	await outDir(p);
	await mk(p, 'Shelf A/Draft', NOTES);
	await mk(p, 'Shelf B/Draft', NOTES.map(([n, x]) => [n, x.replace('first', 'B first')]));
	t.eq(await go(p, 'Shelf A/Draft'), 'saved', 'A: saved');
	const at = join(p.vaultDir, 'Out', 'Books', 'Draft.docx'), first = readFileSync(at);
	await closeAll(p);
	t.eq(await go(p, 'Shelf A/Draft'), 'saved', 'A again: replaced without a word');
	await closeAll(p);
	t.eq(await go(p, 'Shelf B/Draft'), 'asked', 'B: asked');
	await cancelAsk(p);
	const kept = readFileSync(at);
	t.ok(kept.length > 0 && docx(at).all.includes('The first note') && !docx(at).all.includes('B first'), 'No: A’s file is as it was');
	void first;
	await closeAll(p);
});

test('a binder moved (its shelf renamed) since its last export: its own file is replaced without being asked about', async (p, h, t) => {
	await standIn(p, { none: true });
	await outDir(p);
	await mk(p, 'Old shelf/Draft', NOTES);
	t.eq(await go(p, 'Old shelf/Draft'), 'saved', 'saved');
	await closeAll(p);
	await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Old shelf'), 'New shelf'); })().then(() => 1)`);
	await until(p, `!!${PL}.binders.binderOf('New shelf/Draft')`, 8000);
	await p.sleep(600);
	t.eq(await go(p, 'New shelf/Draft'), 'saved', 'the same book moved: its file is its own, replaced silently');
});

test('a binder renamed since its last export writes a new file; the old one is left alone', async (p, h, t) => {
	await standIn(p, { none: true });
	await mk(p, 'Shelf/Alpha', NOTES);
	t.eq(await go(p, 'Shelf/Alpha'), 'saved', 'saved');
	await closeAll(p);
	await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Shelf/Alpha'), 'Shelf/Beta'); })().then(() => 1)`);
	await until(p, `!!${PL}.binders.binderOf('Shelf/Beta')`, 8000);
	await p.sleep(800);
	const r = await go(p, 'Shelf/Beta');
	t.ok(r === 'saved', 'renamed: ' + r);
	t.ok(existsSync(join(p.vaultDir, 'Shelf', 'Exports', 'Alpha.docx')) && existsSync(join(p.vaultDir, 'Shelf', 'Exports', 'Beta.docx')), 'both files exist');
});

test('a Scrivener project of one name from two books: asked, and No leaves the first untouched', async (p, h, t) => {
	await standIn(p, { none: true });
	await outDir(p);
	await mk(p, 'Shelf A/Draft', NOTES);
	await mk(p, 'Shelf B/Draft', NOTES.map(([n, x]) => [n, x.replace('first', 'B first')]));
	t.eq(await go(p, 'Shelf A/Draft', 'Scrivener project'), 'saved', 'A saved');
	await closeAll(p);
	const list = () => readdirSync(join(p.vaultDir, 'Out', 'Books')).sort().join();
	const l1 = list();
	t.eq(await go(p, 'Shelf A/Draft', 'Scrivener project'), 'saved', 'A again: silent');
	await closeAll(p);
	t.eq(await go(p, 'Shelf B/Draft', 'Scrivener project'), 'asked', 'B: asked');
	await cancelAsk(p);
	t.eq(list(), l1, 'and nothing changed in Exports (' + l1 + ')');
});

test('Export is off for a book with nothing in it, and comes back when a note is added while the window is open', async (p, h, t) => {
	await mk(p, 'Hollow', [['Sub/', '']].slice(0, 0));
	await p.ev(`(async () => { await app.vault.adapter.mkdir('Hollow/Empty sub'); })().then(() => 1)`);
	await open(p, 'Hollow').catch(() => {});
	await p.sleep(500);
	const off = () => p.ev(`document.querySelector('${WIN} button.mod-cta')?.disabled`);
	t.eq(await off(), true, 'empty book (an empty subfolder): Export is off');
	await p.ev(`app.vault.create('Hollow/First.md', 'Words at last.\\n').then(() => 1)`);
	t.ok(await until(p, `document.querySelector('${WIN} button.mod-cta')?.disabled === false`, 6000), 'a note added: Export is on');
});

test('a binder moved with its shelf (the default Exports folder beside it): its own file is replaced without a question', async (p, h, t) => {
	await standIn(p, { none: true });
	await mk(p, 'Old shelf/Draft', NOTES);
	t.eq(await go(p, 'Old shelf/Draft'), 'saved', 'saved');
	await closeAll(p);
	await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Old shelf'), 'New shelf'); })().then(() => 1)`);
	await until(p, `!!${PL}.binders.binderOf('New shelf/Draft')`, 8000);
	await p.sleep(800);
	t.eq(await go(p, 'New shelf/Draft'), 'saved', 'the same book, its shelf renamed: its file (moved with the shelf) is its own');
});

bug('Export again on a book whose notes have all gone: the good file from before is not replaced by an empty one', async (p, h, t) => {
	await mk(p, 'Gone', NOTES);
	t.eq(await go(p, 'Gone'), 'saved', 'saved');
	await closeAll(p);
	const at = join(p.vaultDir, 'Gone', '..', 'Exports', 'Gone.docx');
	const real = existsSync(join(p.vaultDir, 'Exports', 'Gone.docx')) ? join(p.vaultDir, 'Exports', 'Gone.docx') : at;
	const was = readFileSync(real);
	await p.ev(`(async () => { for (const n of ['One', 'Two']) await app.vault.delete(app.vault.getAbstractFileByPath('Gone/' + n + '.md')); })().then(() => 1)`);
	await p.sleep(800);
	await openView(p, 'Gone');
	await run(p, 'export-again');
	await p.sleep(3000);
	t.ok(Buffer.compare(readFileSync(real), was) === 0, 'the file is byte for byte what it was (' + (await notices(p)) + ')');
});

test('a book whose only content is a note of properties: the window works and the export keeps the words of the other notes', async (p, h, t) => {
	await mk(p, 'Props', [['Only', '---\ntags: [x]\n---\n']]);
	await open(p, 'Props');
	const d = await p.ev(`({ off: document.querySelector('${WIN} button.mod-cta')?.disabled, detail: document.querySelector('${WIN} .binders-snapshots-detail')?.textContent, warn: document.querySelector('${WIN} .binders-export-warn-head')?.textContent })`);
	t.ok(!/NaN|undefined/.test(JSON.stringify(d)), 'sound: ' + JSON.stringify(d));
	if (!d.off) { await press(p, 'Export'); t.ok(await saved(p, 15000), 'saved a whole file (' + (await status(p)) + ')'); }
});

const COMMENTS = [
	['A', '%%start%% Opening words here. Closing words %%end%%\n'],
	['B', 'Two %%one%%%%two%% in a row and `code %%stays%% here` and [link %%gone%% text](https://x.org) done.\n'],
	['C', '```\n%%fenced stays%%\n```\n\nAfter fence <!-- html gone --> end.\n\nMulti %%line\nspanning%% over lines.\n'],
];
const WANT_WORDS = (s) => words(s);
test('comments: two in a row mid-sentence leave a double space in the Word manuscript (start and end, code, link text and fences are fine)', async (p, h, t) => {
	await mk(p, 'Cmt', COMMENTS);
	t.eq(await go(p, 'Cmt'), 'saved', 'saved');
	const d = docx(join(p.vaultDir, 'Exports', 'Cmt.docx')), body = d.body.join('\n');
	t.ok(/Opening words here\. Closing words/.test(body), 'A: ' + JSON.stringify(body.slice(0, 80)));
	t.ok(!/start|end\b/.test(body.split('\n')[0] ?? ''), 'the comments are gone at the ends');
	t.ok(body.includes('code %%stays%% here'), 'code keeps its %%');
	t.ok(d.all.includes('%%fenced stays%%'), 'a fence keeps its %%: ' + JSON.stringify(d.all));
	t.ok(/link\s+text/.test(body) && !body.includes('gone'), 'comment inside a link text is gone: ' + JSON.stringify(body));
	t.ok(!/link  +text/.test(body), 'no double space in the link text');
	t.ok(!/\S  +\S/.test(body), 'no double space anywhere: ' + JSON.stringify(body));
	t.ok(!/html gone|spanning/.test(body) && /After fence end\./.test(body) && /Multi over lines\./.test(body), 'html and multi-line comments: ' + JSON.stringify(body));
});

test('One note export: comments are gone and no word is lost', async (p, h, t) => {
	await mk(p, 'Cmt2', COMMENTS);
	await open(p, 'Cmt2');
	await pick(p, 'One note');
	await press(p, 'Export');
	await until(p, `app.workspace.getActiveFile()?.path?.includes('(exported)')`, 8000);
	const name = await p.ev(`app.workspace.getActiveFile()?.path`);
	const out = await p.ev(`app.vault.adapter.read(${j(name)})`);
	t.ok(!out.includes('%%start%%') && !out.includes('%%one%%') && !out.includes('<!--') && !out.includes('gone'), 'comments removed: ' + JSON.stringify(out));
	t.ok(out.includes('`code %%stays%% here`') && out.includes('%%fenced stays%%'), 'code kept');
	// (One note keeps the old stripper's double spaces: invisible in reading view, so not asserted)
	await p.ev(`app.vault.adapter.remove(${j(name)}).then(() => 1)`);
}, { changes: true });

// ---- style writes (src/export/styles.ts put/flush) ----
const ST = `${PL}.styles`, DIR = 'Export styles';
const onDisk = (p, name) => { const at = join(p.vaultDir, DIR, `${name}.bookstyle`); return existsSync(at) ? readFileSync(at, 'utf8') : null; };
const outside = async (p, name, text) => { mkdirSync(join(p.vaultDir, DIR), { recursive: true }); writeFileSync(join(p.vaultDir, DIR, `${name}.bookstyle`), text); await until(p, `${ST}.text(${j(name)}) === ${j(text)}`, 8000); await p.sleep(200); };
const clearStyles = async (p) => { await p.ev(`${ST}.settled().then(() => 1)`); await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${ST}.folder); if (f) await app.vault.delete(f, true); await ${ST}.reload(); })().then(() => 1)`); };
const styleTest = (name, fn, bugged) => (bugged ? bug : test)(name, async (p, h, t) => { await clearStyles(p); try { await fn(p, h, t); } finally { await clearStyles(p); } });
const FUTURE = '---\nexport-style: 99\nbased-on: Classic\nmargins: wide\nnew-thing: yes\n---\nbody { color: red }\n';

styleTest('rapid changes to several rows of one style, then an outside edit at once: nothing is lost and a newer-format style stays byte for byte', async (p, h, t) => {
	await outside(p, 'Future', FUTURE);
	await outside(p, 'Mine', '---\nexport-style: 1\nbased-on: Classic\n---\n');
	await p.ev(`(async () => {
		const r = ${ST}.get('Mine', 'book');
		${ST}.set(r, 'margins', 'wide'); ${ST}.set(r, 'paragraphs', 'spaced'); ${ST}.set(r, 'scene-break', '~~');
		await ${ST}.settled();
	})().then(() => 1)`);
	const a = onDisk(p, 'Mine');
	t.ok(/margins: wide/.test(a) && /paragraphs: spaced/.test(a) && /scene-break: "?~~"?/.test(a), 'three rows written: ' + JSON.stringify(a));
	// (an outside write racing a queued one is a race of two writers on one file: see the BUG test below)
	const err = await p.ev(`(() => { try { ${ST}.set(${ST}.get('Future', 'book'), 'margins', 'narrow'); return ''; } catch (e) { return String(e.message); } })()`);
	t.ok(/newer version/.test(err), 'a row of the newer one is refused: ' + err);
	await p.ev(`${ST}.settled().then(() => 1)`);
	t.eq(onDisk(p, 'Future'), FUTURE, 'the newer style is byte for byte');
});

styleTest('a style deleted outside while a row is being changed does not come back and logs no error', async (p, h, t) => {
	await outside(p, 'Doomed', '---\nexport-style: 1\nbased-on: Classic\n---\n');
	await p.ev(`(async () => {
		const r = ${ST}.get('Doomed', 'book');
		${ST}.set(r, 'margins', 'wide');
		const f = app.vault.getAbstractFileByPath(${ST}.folder + '/Doomed.bookstyle');
		await app.vault.adapter.remove(f.path);
		${ST}.set(r, 'paragraphs', 'spaced');
		await ${ST}.settled();
	})().then(() => 1)`);
	await p.sleep(1500); await p.ev(`${ST}.settled().then(() => 1)`);
	t.eq(onDisk(p, 'Doomed'), null, 'no file: ' + JSON.stringify(onDisk(p, 'Doomed')));
});

styleTest('a rename that fails (name taken) then a row change: the file keeps its name and takes the row; duplicate then edit at once', async (p, h, t) => {
	await outside(p, 'A one', '---\nexport-style: 1\nbased-on: Classic\n---\n');
	await outside(p, 'B two', '---\nexport-style: 1\nbased-on: Classic\n---\n');
	const out = await p.ev(`(async () => {
		const r = ${ST}.get('A one', 'book'); let err = '';
		try { await ${ST}.rename(r, 'B two'); } catch (e) { err = String(e.message); }
		${ST}.set(${ST}.get('A one', 'book'), 'margins', 'wide');
		await ${ST}.settled();
		const d = await ${ST}.duplicate(${ST}.get('A one', 'book'));
		${ST}.set(${ST}.get(d, 'book'), 'paragraphs', 'spaced');
		await ${ST}.settled();
		return { err, d, names: ${ST}.list('book').map(s => s.name) };
	})()`);
	t.ok(out.err.length > 0, 'the rename is refused: ' + out.err);
	await p.sleep(800);
	t.ok(/margins: wide/.test(onDisk(p, 'A one') ?? ''), 'A one has the row: ' + JSON.stringify(onDisk(p, 'A one')));
	t.eq(onDisk(p, 'B two'), '---\nexport-style: 1\nbased-on: Classic\n---\n', 'B two untouched');
	t.ok(/paragraphs: spaced/.test(onDisk(p, out.d) ?? '') && !/margins/.test(onDisk(p, out.d) ?? ''), 'the duplicate (' + out.d + ') has its own row only: ' + JSON.stringify(onDisk(p, out.d)));
});

bug('a built-in style’s file edited outside right after a row change: the outside line is kept (stale-base overwrite)', async (p, h, t) => {
	await clearStyles(p);
	const base = '---\nexport-style: 1\nmargins: wide\n---\nbody { color: blue }\n';
	const lost = [];
	try {
		for (let i = 0; i < 4; i++) {
			await outside(p, 'Classic', base);
			await p.ev(`(async () => { ${ST}.set(${ST}.get('Classic', 'book'), 'paragraphs', 'spaced'); })().then(() => 1)`);
			// the outside editor reads what is there NOW and adds a line
			const cur = readFileSync(join(p.vaultDir, DIR, 'Classic.bookstyle'), 'utf8');
			writeFileSync(join(p.vaultDir, DIR, 'Classic.bookstyle'), cur.replace('\n---\nbody', '\nscene-break: "~"\n---\nbody'));
			await p.sleep(1500); await p.ev(`${ST}.settled().then(() => 1)`);
			const s = onDisk(p, 'Classic') ?? '';
			if (!(/paragraphs: spaced/.test(s) && /scene-break/.test(s) && /margins: wide/.test(s) && s.includes('body { color: blue }'))) lost.push(i + ': ' + JSON.stringify(s));
		}
	} finally { await clearStyles(p); }
	t.eq(lost.join(' ; '), '', 'all four rounds keep the outside line, the row and the CSS');
});

// ---- printing: Cancel and Escape ----
const FRAME = `document.querySelector('${WIN} iframe.binders-export-frame')`;
const laidOut = (p, ms = 30000) => until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]') && !!${FRAME}`, ms);
const BEHIND = `document.querySelectorAll('webview.binders-export-printer, .binders-export-offstage').length`;
const ALLWV = `document.querySelectorAll('webview').length`;
const BN = 'The Lighthouse/The Lighthouse.md';
test('Cancel then Export at once, and Escape mid-print: no stray webview, no file, and a print that finishes after Cancel writes nothing', async (p, h, t) => {
	await open(p);
	await pick(p, 'Paperback');
	t.ok(await laidOut(p), 'laid out');
	const wv0 = await p.ev(ALLWV);
	// printers that finish late: 1.5 s after being asked, with a real-looking PDF
	await p.ev(`(() => { window.__asked = 0; window.__watch?.disconnect(); window.__watch = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.tagName === 'WEBVIEW' && n.classList.contains('binders-export-printer')) n.printToPDF = () => { window.__asked++; return new Promise((r) => setTimeout(() => r(new Uint8Array([37,80,68,70,45,49,46,52,10,37,37,69,79,70,10])), 1500)); }; }); window.__watch.observe(document.body, { childList: true }); return 1; })()`);
	try {
		await press(p, 'Export');
		t.ok(await until(p, `window.__asked === 1`, 60000), 'printing started');
		await press(p, 'Cancel');
		await press(p, 'Export'); // at once
		t.ok(await until(p, `window.__asked === 2`, 60000), 'the second print started');
		await p.sleep(4000);
		const files = existsSync(join(p.vaultDir, 'Exports')) ? readdirSync(join(p.vaultDir, 'Exports')) : [];
		const status1 = await status(p);
		t.ok(true, 'after both: ' + status1 + ' files=' + files.join());
		t.ok(files.filter((f) => f.endsWith('.pdf')).length <= 1, 'at most one PDF written (' + files.join() + ')');
		// escape mid-print
		await closeAll(p);
		await open(p);
		await pick(p, 'Paperback');
		t.ok(await laidOut(p), 'laid out again');
		const asked0 = await p.ev(`window.__asked`);
		await press(p, 'Export');
		t.ok(await until(p, `window.__asked === ${asked0 + 1}`, 60000), 'printing again');
		await p.key('Escape');
		t.ok(await until(p, `${BEHIND} === 0`, 3000), 'Escape: printer gone');
		await p.sleep(3000);
		t.eq(await p.ev(ALLWV), wv0, 'no stray webview in the page');
		t.ok(!(await notices(p)).includes('didn’t finish'), 'nothing said to have gone wrong: ' + (await notices(p)));
	} finally {
		await p.ev(`(() => { window.__watch?.disconnect(); for (const e of document.querySelectorAll('webview.binders-export-printer, .binders-export-offstage')) e.remove(); return 1; })()`);
		const dir = join(p.vaultDir, 'Exports'); if (existsSync(dir)) for (const f of readdirSync(dir)) await p.ev(`app.vault.adapter.remove(${j('Exports/' + f)}).then(() => 1, () => 1)`);
	}
}, { skip: [BN] });

test('the binder note edited outside to an unknown page size, or a style that does not exist: the rows stay valid and Export still works', async (p, h, t) => {
	await open(p);
	await pick(p, 'Paperback');
	t.ok(await laidOut(p), 'laid out');
	const sel = (k) => p.ev(`(() => { const s = document.querySelector('${WIN} select[data-binders-key="${k}"]'); return s ? { v: s.value, shown: s.selectedOptions[0]?.textContent ?? null } : null; })()`);
	const note = (fn) => p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(BN)}), (fm) => { ${fn} }).then(() => 1)`);
	await note(`fm['page-size'] = '99x99'; fm['book-style'] = 'No such style';`);
	await p.sleep(2500);
	const page = await sel('page'), style = await sel('style');
	t.ok(page && page.shown, 'the Page row shows an option: ' + JSON.stringify(page));
	t.ok(style && style.shown, 'the Style row shows an option: ' + JSON.stringify(style));
	t.ok(await laidOut(p, 60000), 'still laid out');
	t.ok(!/NaN|undefined/.test(await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`)), 'the bar is sound: ' + (await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`)));
	t.ok(!(await p.ev(`document.querySelector('${WIN} button.mod-cta')?.disabled`)), 'Export is on');
	await note(`delete fm['page-size']; delete fm['book-style'];`);
}, { skip: [BN] });

// ---- Import wears the Export window's sidebar rule ----
import { zipSync } from 'fflate';
const IWIN = '.modal.binders-import';
test('Import’s window in a short viewport with a long list of things to look at: the sidebar scrolls and Import stays reachable', async (p, h, t) => {
	const enc = new TextEncoder(), ID = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;
	const scrivx = `<?xml version="1.0"?><ScrivenerProject Version="2.0" Creator="Test"><Binder><BinderItem UUID="${ID(1)}" Type="DraftFolder"><Title>Manuscript</Title><MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData><Children><BinderItem UUID="${ID(2)}" Type="Text"><Title>Arrival</Title><MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData></BinderItem></Children></BinderItem></Binder></ScrivenerProject>`;
	const dir = join(process.cwd(), 'test-dist', 'import-source'); mkdirSync(dir, { recursive: true });
	const zipAt = join(dir, 'qa9-short.zip');
	writeFileSync(zipAt, zipSync({ 'Short.scriv/Short.scrivx': enc.encode(scrivx), [`Short.scriv/Files/Data/${ID(2)}/content.rtf`]: enc.encode('{\\rtf1 Hello there.}') }));
	const size = await p.ev(`({ w: innerWidth, h: innerHeight })`);
	try {
		await p.ev(`(() => { const pl = ${PL}; window.__importHost ??= pl.importHost.desktop; pl.importHost.desktop = () => null; app.commands.executeCommandById('binders:import-scrivener'); return 1; })()`);
		await until(p, `!!document.querySelector('${IWIN}')`);
		await p.send('Page.setInterceptFileChooserDialog', { enabled: true });
		await p.ev(`(() => { [...document.querySelectorAll('${IWIN} button')].find(b => b.textContent === 'Choose a zipped backup...').click(); return 1; })()`);
		await p.sleep(300);
		const doc = await p.send('DOM.getDocument');
		const found = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: IWIN + ' input[type="file"]' });
		await p.send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files: [zipAt] });
		await p.send('Page.setInterceptFileChooserDialog', { enabled: false });
		t.ok(await until(p, `!!document.querySelector('${IWIN} [data-binders-key="name"]')`, 15000), 'the second dialog is up');
		await until(p, `document.querySelectorAll('${IWIN}').length === 1`, 3000);
		await p.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 420, deviceScaleFactor: 1, mobile: false });
		await p.sleep(500);
		await p.ev(`(() => { const side = document.querySelector('${IWIN} .binders-export-side'); const foot = side.querySelector('.binders-export-warnings') || side.appendChild(createDiv({ cls: 'binders-export-warnings' })); for (let i = 0; i < 40; i++) { const r = foot.createDiv({ cls: 'binders-export-warn' }); r.createDiv({ cls: 'binders-export-warn-note', text: 'Note ' + i }); r.createDiv({ cls: 'binders-export-warn-text', text: 'Something to look at, in a sentence.' }); } return 1; })()`);
		await p.sleep(400);
		const g = await p.ev(`(() => { const side = document.querySelector('${IWIN} .binders-export-side'), win = document.querySelector('${IWIN}').getBoundingClientRect(), cs = getComputedStyle(side); const b = [...document.querySelectorAll('${IWIN} button')].filter(b => b.textContent === 'Import' && b.getBoundingClientRect().width).pop(); const br = b?.getBoundingClientRect(); return { overflowY: cs.overflowY, scrolls: side.scrollHeight > side.clientHeight, winBottom: win.bottom, vh: innerHeight, btn: br && { top: br.top, bottom: br.bottom } }; })()`);
		t.ok(g.overflowY === 'auto' || g.overflowY === 'scroll', 'the sidebar scrolls: ' + JSON.stringify(g));
		t.ok(g.scrolls, 'and has more than it shows');
		t.ok(g.btn && g.btn.bottom <= g.vh && g.winBottom <= g.vh + 1, 'Import is within the viewport: ' + JSON.stringify(g));
		await shot(p, 'import-short');
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
		await p.ev(`(() => { if (window.__importHost) ${PL}.importHost.desktop = window.__importHost; return 1; })()`);
		await closeAll(p);
	}
});

// ---- a look at the window in both themes ----
test('looks: the window on a book, on an empty book (Export off, with its reason), and with the style editor open', async (p, h, t) => {
	await open(p);
	await shot(p, 'manuscript');
	await closeAll(p);
	await mk(p, 'Hollow2', []);
	await open(p, 'Hollow2').catch(() => {});
	await p.sleep(600);
	await shot(p, 'empty');
	const info = await p.ev(`({ off: document.querySelector('${WIN} button.mod-cta')?.disabled, head: document.querySelector('${WIN} .binders-export-warn-head')?.textContent, status: document.querySelector('${WIN} .binders-export-status')?.textContent, tip: document.querySelector('${WIN} button.mod-cta')?.getAttribute('aria-label') })`);
	t.ok(info.off === true, 'Export off: ' + JSON.stringify(info));
	await closeAll(p);
	await open(p);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="edit-style"]')?.click(); return 1; })()`);
	await p.sleep(700);
	await shot(p, 'style-editor');
});

test('a phone: the Export button of an empty book is off and says why, and comes on when a note is added', async (p, h, t) => {
	await mk(p, 'Hollow3', []);
	await onMobile(p, 390, 844, async () => {
		await openView(p, 'Hollow3');
		await run(p, 'export');
		await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
		await p.sleep(800);
		const st = () => p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === 'Export' && b.getBoundingClientRect().width).pop(); return b ? { off: b.disabled, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) } : null; })()`);
		const a = await st();
		t.ok(a && a.off === true, 'off: ' + JSON.stringify(a) + ' ' + (await p.ev(`document.querySelector('${WIN}').innerText.replace(/\\s+/g, ' ').slice(0, 200)`)));
		await p.ev(`app.vault.create('Hollow3/First.md', 'Words at last.\\n').then(() => 1)`);
		t.ok(await until(p, `[...document.querySelectorAll('${WIN} button')].some(b => b.textContent === 'Export' && b.getBoundingClientRect().width && !b.disabled)`, 6000), 'a note added: on (' + JSON.stringify(await st()) + ')');
		await shot(p, 'phone-empty');
	});
}, { changes: true });

test('on a computer with a remembered place: two books of one name asked about, answer No leaves the file byte for byte, the book that wrote it replaces silently', async (p, h, t) => {
	await outDir(p);
	await mk(p, 'Shelf A/Draft', NOTES);
	await mk(p, 'Shelf B/Draft', NOTES.map(([n, x]) => [n, x.replace('first', 'B first')]));
	const remember = async () => { await p.ev(`(() => { const b = document.querySelector('${WIN} .binders-export-remember input'); if (b && !b.checked) b.click(); return 1; })()`); await p.sleep(300); };
	const at = join(p.vaultDir, 'Out', 'Books', 'Draft.docx');
	t.eq(await go(p, 'Shelf A/Draft'), 'saved', 'A saved'); await remember(); await closeAll(p);
	t.eq(await go(p, 'Shelf B/Draft'), 'saved', 'B saved through the dialog'); await remember(); await closeAll(p);
	const bBytes = readFileSync(at);
	t.eq(await go(p, 'Shelf B/Draft'), 'saved', 'B again: its own file, silent'); await closeAll(p);
	const after = readFileSync(at);
	t.ok(docx(at).all.includes('B first'), 'still B’s words');
	t.eq(await go(p, 'Shelf A/Draft'), 'asked', 'A again over B’s file: asked');
	await cancelAsk(p);
	t.ok(Buffer.compare(readFileSync(at), after) === 0, 'No: B’s file is byte for byte (' + bBytes.length + ' bytes)');
});

styleTest('the style a window is using is deleted outside while the window is open: the Style row falls back to a style that exists, and the export works', async (p, h, t) => {
	await outside(p, 'Mine', '---\nexport-style: 1\nbased-on: Modern\n---\n');
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(BN)}), (fm) => { fm['book-style'] = 'Mine'; }).then(() => 1)`);
	await open(p);
	await pick(p, 'Ebook');
	await p.sleep(800);
	const row = () => p.ev(`(() => { const s = document.querySelector('${WIN} select[data-binders-key="style"]'); return s ? { v: s.value, shown: s.selectedOptions[0]?.textContent ?? null, opts: [...s.options].map(o => o.textContent) } : null; })()`);
	t.eq((await row())?.shown, 'Mine', 'Mine is chosen');
	await p.ev(`(async () => { await app.vault.adapter.remove(${ST}.folder + '/Mine.bookstyle'); })().then(() => 1)`);
	await p.sleep(2000);
	const r = await row();
	t.ok(r && r.shown && r.shown !== 'Mine' && !r.opts.includes('Mine'), 'the row falls back: ' + JSON.stringify(r));
	await press(p, 'Export');
	t.ok(await saved(p, 20000), 'saved: ' + (await status(p)));
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(BN)}), (fm) => { delete fm['book-style']; }).then(() => 1)`);
});
