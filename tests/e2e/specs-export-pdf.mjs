// Export, the pages (src/export/pages/, src/export/pdf.ts): a paperback and a manuscript as PDFs. The pages the
// window shows are the pages that are printed, so every test that exports reads the PDF back (pdftotext, pdffonts and
// pdfinfo, dev-time tools of Poppler: a test that needs one says loudly when it isn't there) and compares it with
// the window's pages and with the notes. The save dialog is stood in for, as in specs-export.mjs.
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { strFromU8, unzipSync } from 'fflate';
import { join } from 'path';
import { PL, j, openView, reload, same, texts, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const WIN = '.modal.binders-export';
/** Where sample PDFs are kept for a person to look at, when the run asks for them. */
const KEEP = process.env.BINDERS_KEEP_PDF || '';
const keep = (path, name) => { if (!KEEP) return; mkdirSync(KEEP, { recursive: true }); copyFileSync(path, join(KEEP, name)); };

// ---- reading a PDF back ----
const tool = (name) => !spawnSync(name, ['-v']).error;
const TOOLS = { text: tool('pdftotext'), fonts: tool('pdffonts'), info: tool('pdfinfo') };
const loud = (t, name) => { console.log(`\n    !! ${name} isn’t installed (Poppler): this part of the test was SKIPPED, not passed\n`); t.ok(true, `${name} isn’t installed: skipped`); };
/** Each page's text. */
const pdfPages = (path) => spawnSync('pdftotext', ['-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split('\f').slice(0, -1);
const pdfFonts = (path) => spawnSync('pdffonts', [path], { encoding: 'utf8' }).stdout.split('\n').slice(2).filter((l) => l.trim()).map((l) => { const m = /^(.*?)\s+(Type 1C?|Type 3|TrueType|CID Type 0C?|CID TrueType|Type 1C \(OT\)|TrueType \(OT\)|CID Type 0C \(OT\)|CID TrueType \(OT\))\s+(\S+)\s+(yes|no)\s+(yes|no)\s+(yes|no)/.exec(l); return m ? { name: m[1].trim(), type: m[2], embedded: m[4] === 'yes', subset: m[5] === 'yes' } : { name: l, type: '?', embedded: false, subset: false }; });
const pdfInfo = (path) => Object.fromEntries(spawnSync('pdfinfo', [path], { encoding: 'utf8' }).stdout.split('\n').map((l) => l.split(/:\s+/)).filter((x) => x.length > 1).map(([k, ...v]) => [k, v.join(': ')]));
/** Words as the tests compare them: letters and digits, a word broken at a line's end joined again, and a hyphen
    inside a word not counted (a line may end at one, and then nothing tells it from a word that was broken). Letters
    and figures are words apart: pdftotext sometimes reads a footnote's mark as joined to its word and sometimes not. */
const words = (s) => (s.normalize('NFKC').replace(/[-‐­]\s*\n\s*/g, '').replace(/[-‐­​]/g, '').match(/\p{L}+|\p{N}+/gu) ?? []).map((w) => w.toLowerCase());

/** Two runs of words held against each other; where they part is said, not the whole of them. */
function sameWords(t, got, want, msg) {
	const at = got.findIndex((w, i) => w !== want[i]);
	t.ok(at < 0 && got.length === want.length, `${msg} (${got.length} words of ${want.length}${at < 0 ? '' : `; at word ${at}: “${got.slice(Math.max(0, at - 4), at + 5).join(' ')}” where the notes have “${want.slice(Math.max(0, at - 4), at + 5).join(' ')}”`})`);
}

// ---- the window ----
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const FRAME = `document.querySelector('${WIN} iframe.binders-export-frame')`;
/** The window's pages, once they are all laid out: for each, its text, its notes, its head and its number. */
const pages = (p) => p.ev(`(() => { const d = ${FRAME}?.contentDocument; if (!d) return []; const t = (e) => (e ? [...e.children].map(c => c.tagName === 'TABLE' ? [...c.querySelectorAll('th, td')].map(x => x.textContent).join(' ') : c.textContent).join('\\n') : ''); return [...d.querySelectorAll('.page')].map(live => { const pg = live.cloneNode(true); for (const b of pg.querySelectorAll('br')) b.replaceWith('\\n'); return pg; }).map(pg => ({ cls: pg.className, text: t(pg.querySelector('.text')), notes: t(pg.querySelector('.notes')), head: pg.querySelector('.head')?.textContent ?? '', folio: pg.querySelector('.folio')?.textContent ?? '' })); })()`);
const laidOut = (p, ms = 20000) => until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]') && !!${FRAME}`, ms);
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
	await p.sleep(150);
}
const pick = async (p, name) => { await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(name)}).click(); return 1; })()`); await p.sleep(300); };
const choose = async (p, key, value) => { await p.ev(`(() => { const s = document.querySelector('${WIN} select[data-binders-key="${key}"]'); s.value = ${j(value)}; s.dispatchEvent(new Event('change')); return 1; })()`); await p.sleep(300); };
const rows = (p) => p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item-name')].map(e => e.textContent)`);
const buttons = (p) => p.ev(`[...document.querySelectorAll('${WIN} button')].filter(b => b.getBoundingClientRect().width).map(b => b.textContent)`);
const press = async (p, label) => { const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b) return false; b.click(); return true; })()`); if (!ok) throw new Error(`no button “${label}” in the Export window`); await p.sleep(100); };
const saved = (p, ms = 60000) => until(p, `(document.querySelector('${WIN} .binders-export-status')?.textContent ?? '').startsWith('Saved to')`, ms);
const detail = (p) => p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`);
const closeAll = async (p) => { for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); } };
const withAuthor = (p, name = 'Mara Lindqvist') => p.ev(`(async () => { const pl = ${PL}; pl.settings.authorName = ${j(name)}; await pl.saveData(pl.settings); return 1; })()`);

const standIn = (p, o = {}) => p.ev(`(() => {
	const pl = ${PL}; window.__bp ??= { desktop: pl.exportHost.desktop, printer: pl.exportHost.printer };
	window.__bp.asked = [];
	pl.exportHost.desktop = (app) => { const d = window.__bp.desktop(app); return d && { ...d, pick: async (start) => { window.__bp.asked.push(start); return start; } }; };
	pl.exportHost.printer = ${o.noPrinter ? '() => null' : 'window.__bp.printer'};
	return 1;
})()`);
const test = (name, fn, o) => specs.push({ name: 'export pdf: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p, o);
	const before = await texts(p);
	try { await fn(p, h, t, before); } finally {
		await closeAll(p);
		await p.ev(`(async () => { const pl = ${PL}; if (window.__bp) { pl.exportHost.desktop = window.__bp.desktop; pl.exportHost.printer = window.__bp.printer; } app.saveLocalStorage('binders-export', null); Object.assign(pl.settings, { exportKind: 'manuscript', exportFile: 'docx', exportPaper: 'letter', authorName: '' }); await pl.saveData(pl.settings); return 1; })()`);
	}
}) });

const BODIES = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const sourceWords = (all) => BODIES.flatMap((n) => words(all[`${L}${n}.md`].replace(/^---\n[\s\S]*?\n---\n?/, '')));
/** The words of the pages that are the notes' own: not the pages export makes, nor a heading, a mark or a number. */
const bodyWords = (p) => p.ev(`(() => { const d = ${FRAME}.contentDocument, out = []; for (const pg of d.querySelectorAll('.page')) { if (/title-page|copyright|contents/.test(pg.className)) continue; const c = pg.querySelector('.block').cloneNode(true); for (const b of c.querySelectorAll('br')) b.replaceWith('\\n'); for (const x of c.querySelectorAll('h1, sup, .n, .mk, .break')) x.remove(); out.push([...c.querySelectorAll('.text > *, .notes > *')].map(e => e.tagName === 'TABLE' ? [...e.querySelectorAll('th, td')].map(x => x.textContent).join(' ') : e.textContent).join('\\n')); } return out.join('\\n'); })()`);

test('a paperback: the kind and its choices, the pages in the window, and a PDF that is those pages', async (p, h, t, before) => {
	await withAuthor(p);
	await open(p);
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} [role="option"]')].map(e => e.getAttribute('aria-label'))`)).join('|'), 'Manuscript: Word, in standard manuscript format|Ebook: EPUB, for Kindle, Apple Books and Kobo|Paperback: PDF, ready for print|Scrivener project: The binder itself, for Scrivener 3|One note: Markdown, in this vault', 'Paperback is between Ebook and Scrivener project');
	await pick(p, 'Paperback');
	t.eq((await rows(p)).join('|'), 'Style|Page', 'its choices: a book style and a page');
	t.eq((await p.ev(`[...document.querySelectorAll('${WIN} select[data-binders-key="page"] option')].map(o => o.textContent)`)).join('|'), '5 × 8 in|5.25 × 8 in|5.5 × 8.5 in|6 × 9 in|A5', 'the trim sizes');
	t.ok(await laidOut(p), 'the pages are laid out in the window');
	const shown = await pages(p);
	t.ok(shown.length >= 8, `the book has pages (${shown.length})`);
	t.eq(await detail(p), `${shown.length} pages · 5 × 8 in`, 'the bar says how many, and how large');
	t.ok(/title-page/.test(shown[0].cls) && /spine-left/.test(shown[0].cls) && shown[0].text.startsWith('The Lighthouse') && !shown[0].folio && !shown[0].head, 'the title page first, a right-hand page, with no number');
	t.ok(/copyright/.test(shown[1].cls) && shown[1].text.includes('Mara Lindqvist'), 'the copyright page on its back');
	const contents = shown.find((s) => /contents/.test(s.cls));
	t.ok(contents && contents.text.startsWith('Contents'), 'a contents page, as chapters have titles');
	const opener = shown.findIndex((s) => /opener/.test(s.cls) && /chapter/.test(s.cls));
	t.ok(shown[opener].folio === '1' && !shown[opener].head, 'the text starts at page 1, and a chapter’s first page has no running head');
	t.ok(shown.every((s, i) => /blank|display/.test(s.cls) || !/chapter|part/.test(s.cls) || /opener/.test(s.cls) || s.head === (i % 2 ? 'Mara Lindqvist' : 'The Lighthouse')), 'the author runs along the left-hand pages and the title along the right');
	sameWords(t, words(await bodyWords(p)), sourceWords(before), 'word for word: the pages hold the notes’ words, in binder order');

	await press(p, 'Export');
	t.ok(await saved(p), 'the bar says it was saved');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.pdf');
	t.ok(existsSync(at), 'the PDF is in Exports beside the binder');
	keep(at, 'test-vault-the-lighthouse.pdf');
	t.eq(readFileSync(at).subarray(0, 5).toString(), '%PDF-', 'and is a PDF');
	if (!TOOLS.info) loud(t, 'pdfinfo'); else {
		const info = pdfInfo(at);
		t.eq(info.Pages, String(shown.length), 'as many pages as the window showed');
		t.ok(/^360 x 576 pts/.test(info['Page size']), `each exactly the trim size (${info['Page size']})`);
		t.eq(`${info.Title} / ${info.Author}`, 'The Lighthouse / Mara Lindqvist', 'it says its title and its author');
	}
	t.ok(readFileSync(at).includes('/Lang (en'), 'and its language');
	if (!TOOLS.fonts) loud(t, 'pdffonts'); else {
		const fonts = pdfFonts(at);
		t.ok(fonts.length > 0 && fonts.every((f) => f.embedded && f.subset), `every font is embedded, as a subset (${fonts.map((f) => `${f.name} ${f.type}${f.embedded ? '' : ' NOT EMBEDDED'}`).join('; ')})`);
		t.ok(fonts.every((f) => f.type !== 'Type 3'), 'none as Type 3');
		t.ok(fonts.some((f) => /EBGaramond/.test(f.name)), 'the text is in EB Garamond');
	}
	if (!TOOLS.text) loud(t, 'pdftotext'); else {
		const printed = pdfPages(at);
		t.eq(printed.length, shown.length, 'the printed pages are the window’s pages: as many');
		// (a script whose letters join, Arabic, comes out of a PDF letter by letter: there the letters are held, not the words)
		const bag = (text) => (o.others ? [...words(text).join('')].sort().join('') : words(text).sort().join(' '));
		const differ = shown.map((s, i) => [bag(`${s.head}\n${s.text}\n${s.notes}\n${s.folio}`), bag(printed[i] ?? '')]).findIndex(([a, b]) => a !== b);
		t.eq(differ, -1, `and each holds the same words (page ${differ + 1})`);
		const first = (s) => words(s).slice(0, 4).join(' ');
		t.eq(printed.map(first).join('|'), shown.map((s) => first(`${s.head}\n${s.text}`)).join('|'), 'each beginning with the same words');
	}
	same(t, before, await texts(p));
});

/** The PDF read back and held against the window's pages: as many, each with the same words, every font in it. */
function checkPdf(t, at, shown, o = {}) {
	if (!TOOLS.info) loud(t, 'pdfinfo'); else {
		const info = pdfInfo(at);
		t.eq(info.Pages, String(shown.length), 'as many pages as the window showed');
		if (o.size) t.ok(info['Page size'].includes(o.size), `each exactly the page’s size (${info['Page size']})`);
	}
	if (!TOOLS.fonts) loud(t, 'pdffonts'); else {
		const fonts = pdfFonts(at);
		t.ok(fonts.length > 0 && fonts.every((f) => f.embedded), `every font is embedded (${fonts.map((f) => `${f.name} ${f.type}${f.embedded ? '' : ' NOT EMBEDDED'}`).join('; ')})`);
		// The faces Binders carries are never Type 3. A script they don't hold (Japanese, an emoji) is set in whatever the
		// computer has for it, and Chromium embeds some of those (CFF collections, colour fonts) as Type 3: said, not hidden.
		const drawn = [...new Set(fonts.filter((f) => f.type === 'Type 3').map((f) => f.name.replace(/^[A-Z]+\+/, '')))];
		t.ok(!drawn.some((n) => /EBGaramond|SourceSerif/.test(n)), `${o.name ? `${o.name}: ` : ''}none of Binders’ own faces as Type 3`);
		if (o.others) { if (drawn.length) console.log(`    ${o.name}: this computer’s own fonts for other scripts are embedded as Type 3: ${drawn.join(', ')}`); } else t.eq(drawn.join(), '', `${o.name ? `${o.name}: ` : ''}no font as Type 3`);
	}
	if (!TOOLS.text) loud(t, 'pdftotext'); else {
		const printed = pdfPages(at);
		// (a script whose letters join, Arabic, comes out of a PDF letter by letter: there the letters are held, not the words)
		const bag = (text) => (o.others ? [...words(text).join('')].sort().join('') : words(text).sort().join(' '));
		const differ = shown.map((s, i) => [bag(`${s.head}\n${s.text}\n${s.notes}\n${s.folio}`), bag(printed[i] ?? '')]).findIndex(([a, b]) => a !== b);
		let why = '';
		if (differ >= 0) { const a = words(`${shown[differ].head}\n${shown[differ].text}\n${shown[differ].notes}\n${shown[differ].folio}`), b = words(printed[differ] ?? ''), left = [...a]; const extra = []; for (const w of b) { const i = left.indexOf(w); if (i < 0) extra.push(w); else left.splice(i, 1); } why = `page ${differ + 1}: only in the window “${left.slice(0, 12).join(' ')}”, only in the PDF “${extra.slice(0, 12).join(' ')}”`; }
		t.eq(why, '', `${o.name ? `${o.name}: ` : ''}each printed page holds the words of the window’s page`);
	}
}

test('a manuscript as a PDF: the File and Paper choices, standard manuscript format on its pages, the header on each', async (p, h, t, before) => {
	await withAuthor(p);
	await open(p);
	t.eq((await rows(p)).join('|'), 'Style|Front and back matter|File', 'a manuscript has a File choice');
	await choose(p, 'file', 'pdf');
	t.eq((await rows(p)).join('|'), 'Style|Front and back matter|File|Paper', 'a PDF has its paper');
	t.ok(await laidOut(p), 'the pages are laid out in the window');
	let shown = await pages(p);
	t.eq(await detail(p), `${shown.length} pages · Letter`, 'the bar says how many pages, on Letter');
	t.ok(/title-page/.test(shown[0].cls) && /about \d[\d,]* words/.test(shown[0].text) && shown[0].text.includes('by Mara Lindqvist') && !shown[0].head, 'the title page: the count, the title, the byline, and no header');
	t.eq(shown[1].head, 'Lindqvist / LIGHTHOUSE / 1', 'the header on the first page of text, which is page 1');
	t.ok(shown.slice(1).every((s, i) => s.head === `Lindqvist / LIGHTHOUSE / ${i + 1}`), 'and on every page after, counted');
	t.ok(shown.some((s) => s.text.startsWith('Chapter One')), 'chapters are headed as the Word file heads them');
	sameWords(t, words(await bodyWords(p)), sourceWords(before), 'word for word: the pages hold the notes’ words, in binder order');
	await choose(p, 'paper', 'a4');
	t.ok(await laidOut(p), 'A4 is laid out');
	shown = await pages(p);
	t.eq(await detail(p), `${shown.length} pages · A4`, 'the bar follows');
	await press(p, 'Export');
	t.ok(await saved(p), 'the bar says it was saved');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.pdf');
	t.ok(existsSync(at), 'a PDF, in Exports beside the binder');
	keep(at, 'test-vault-manuscript-a4.pdf');
	checkPdf(t, at, shown, { size: '(A4)' });
	same(t, before, await texts(p));
});

test('the page: a larger one holds more, is kept with the book, and is the PDF’s size', async (p, h, t) => {
	await withAuthor(p);
	await open(p);
	await pick(p, 'Paperback');
	await laidOut(p);
	await choose(p, 'page', '6x9');
	t.ok(await laidOut(p), 'the pages are laid out again');
	const shown = await pages(p);
	t.eq(await detail(p), `${shown.length} pages · 6 × 9 in`, 'the bar follows');
	t.ok(await until(p, `app.metadataCache.getCache('The Lighthouse/The Lighthouse.md')?.frontmatter?.['page-size'] === '6x9'`, 4000), 'the size is kept in the binder note, as `page-size`');
	await closeAll(p);
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} select[data-binders-key="page"]').value`), '6x9', 'and is there when the window is opened again');
	await laidOut(p);
	await press(p, 'Export');
	t.ok(await saved(p), 'exported');
	checkPdf(t, join(p.vaultDir, 'Exports', 'The Lighthouse.pdf'), await pages(p), { size: '432 x 648' });
});

test('where a PDF can’t be made: the window says so, shows the pages, and has no Export', async (p, h, t, before) => {
	await withAuthor(p);
	t.eq(await p.ev(`${PL}.exportHost.printer()`), null, 'no way to a PDF here');
	await open(p);
	await pick(p, 'Paperback');
	t.ok(await laidOut(p), 'the pages are laid out all the same');
	t.ok((await pages(p)).length >= 8, 'and can be looked at');
	t.ok(!(await buttons(p)).includes('Export'), 'there is no Export');
	t.ok((await p.ev(`document.querySelector('${WIN} .binders-export-nopdf')?.textContent ?? ''`)).startsWith('PDF isn’t available here.'), 'and the choices say why');
	await pick(p, 'Manuscript');
	t.ok((await buttons(p)).includes('Export'), 'a Word manuscript is exported as ever');
	await choose(p, 'file', 'pdf');
	t.ok(!(await buttons(p)).includes('Export') && (await p.ev(`!!document.querySelector('${WIN} .binders-export-nopdf')`)), 'a manuscript as a PDF is the same');
	t.ok(!existsSync(join(p.vaultDir, 'Exports')), 'nothing was written');
	same(t, before, await texts(p));
}, { noPrinter: true });

test('the real way to a PDF is found on a computer', async (p, h, t) => {
	t.ok(await p.ev(`typeof ${PL}.exportHost.printer()?.print === 'function'`), 'a webview that can print');
});

// ---- a phone ----
async function onPhone(p, fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
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
const click = (p, expr) => p.ev(`(() => { const e = ${expr}; if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; })()`);

specs.push({ name: 'export pdf: a phone: Paperback says “PDF, made on a computer”, has Preview and no Export, and shows its pages one under another', fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	await withAuthor(p);
	try {
		await onPhone(p, async () => {
			t.eq(await p.ev(`${PL}.exportHost.printer()`), null, 'a phone has no way to a PDF');
			await open(p);
			await pick(p, 'Paperback');
			t.eq(await p.ev(`[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.getAttribute('aria-selected') === 'true').getAttribute('aria-label')`), 'Paperback: PDF, made on a computer', 'the row says where it is made');
			t.ok((await p.ev(`document.querySelector('${WIN} .binders-export-nopdf')?.textContent ?? ''`)).startsWith('A PDF is made by Obsidian on a computer.'), 'and a sentence under its choices');
			t.eq((await rows(p)).join('|'), 'Style|Page|Book details', 'its style and its page can be chosen here');
			t.eq((await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-phone-row button')].map(b => b.textContent)`)).join('|'), 'Preview', 'Preview, and no Export');
			const fits = await p.ev(`(() => { const m = document.querySelector('${WIN}').getBoundingClientRect(); return [...document.querySelectorAll('${WIN} .setting-item, ${WIN} .binders-export-nopdf, ${WIN} .binders-export-phone-row button')].every(e => { const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1; }); })()`);
			t.ok(fits, 'nothing is wider than the screen');
			await click(p, `[...document.querySelectorAll('${WIN} .binders-export-phone-row button')].find(b => b.textContent === 'Preview')`);
			t.ok(await laidOut(p), 'Preview: the pages are laid out on the phone');
			const shown = await pages(p);
			t.ok(shown.length >= 8 && shown[0].text.startsWith('The Lighthouse'), `the same book (${shown.length} pages)`);
			const look = await p.ev(`(() => { const f = ${FRAME}, d = f.contentDocument, sheets = [...d.querySelectorAll('.sheet')].slice(0, 3).map(s => s.getBoundingClientRect()); return { single: d.querySelector('#book').classList.contains('single'), wide: f.getBoundingClientRect().width, sheet: sheets[0].width, under: sheets[1].top > sheets[0].bottom - 1 && sheets[2].top > sheets[1].bottom - 1, left: sheets[0].left, paper: getComputedStyle(d.querySelector('.page')).backgroundColor }; })()`);
			t.ok(look.single && look.under, 'single pages, one under another');
			t.ok(look.sheet <= look.wide && look.left >= 0, `each as wide as the screen lets it be (${Math.round(look.sheet)} of ${Math.round(look.wide)})`);
			t.eq(look.paper, 'rgb(255, 255, 255)', 'on white paper, whatever the theme');
			sameWords(t, words(await bodyWords(p)), sourceWords(before), 'word for word, on a phone too');
		});
	} finally { await p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, { exportKind: 'manuscript', exportFile: 'docx', authorName: '' }); await pl.saveData(pl.settings); return 1; })()`); }
	same(t, before, await texts(p));
}) });

test('the window’s pages: facing on a wide window (the first alone on the right), white in both themes, the frame named', async (p, h, t) => {
	await withAuthor(p);
	await open(p);
	await pick(p, 'Paperback');
	await laidOut(p);
	const look = await p.ev(`(() => { const f = ${FRAME}, d = f.contentDocument, s = [...d.querySelectorAll('.sheet')].slice(0, 3).map(x => x.getBoundingClientRect()); return { single: d.querySelector('#book').classList.contains('single'), first: s[0].left, second: s[1].left, third: s[2].left, row: Math.abs(s[1].top - s[2].top) < 1 && s[1].top > s[0].bottom - 1, touch: Math.abs(s[1].right - s[2].left) < 1, paper: getComputedStyle(d.querySelector('.page')).backgroundColor, desk: getComputedStyle(d.documentElement).backgroundColor, pane: getComputedStyle(document.querySelector('${WIN} .binders-export-pages')).backgroundColor, label: f.getAttribute('aria-label'), tab: f.tabIndex, wide: f.getBoundingClientRect().width, right: Math.max(...s.map(x => x.right)) }; })()`);
	t.ok(!look.single && look.first === look.third && look.second < look.third, 'the first page stands alone on the right; the next two face each other');
	t.ok(look.row && look.touch, 'a spread is two pages meeting at the spine');
	t.ok(look.right <= look.wide, 'and fits the window');
	t.eq(look.paper, 'rgb(255, 255, 255)', 'pages are paper: white');
	t.eq(look.desk, look.pane, 'on the theme’s own background');
	t.ok(look.label === 'The pages, as they will print' && look.tab === 0, 'the frame is named and can be reached by keyboard');
});

// ---- the pages hold: what must be true of any book's pages, read from the window ----

/** Everything wrong with the pages the window shows; and what they are: how many, which hold more than they should. */
const invariants = (p) => p.ev(`(() => {
	const d = ${FRAME}.contentDocument, bad = [], pages = [...d.querySelectorAll('.page')], over = [];
	for (const pg of pages) pg.removeAttribute('data-done'); // (a page out of sight isn't laid out: all of them are measured here)
	const seenNote = new Map(), seenMark = new Set();
	let offset = null, last = 0;
	pages.forEach((pg, i) => {
		const page = pg.getBoundingClientRect(), block = pg.querySelector('.block').getBoundingClientRect(), text = pg.querySelector('.text'), notes = pg.querySelector('.notes');
		const s = page.width / pg.offsetWidth, full = text.getBoundingClientRect().height + notes.getBoundingClientRect().height > block.height + s;
		if (full && !/copyright/.test(pg.className)) over.push((i + 1) + ' (' + Math.round((text.getBoundingClientRect().height + notes.getBoundingClientRect().height - block.height) / s) + 'px: ' + [...text.children].slice(-3).map(e => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().height / s)).join(' ') + ' | notes ' + Math.round(notes.getBoundingClientRect().height / s) + ')');
		for (const e of text.children) { const r = e.getBoundingClientRect(); if (r.left < block.left - 1 || r.right > block.right + 1) bad.push('page ' + (i + 1) + ': a ' + e.tagName + ' is wider than the text block'); if (!full && !/copyright/.test(pg.className) && r.bottom > block.bottom + 1) bad.push('page ' + (i + 1) + ': a ' + e.tagName + ' ends under the text block'); }
		for (const n of notes.querySelectorAll(':scope > .note')) { const id = n.dataset.note; if (!seenNote.has(id)) seenNote.set(id, i); else if (seenNote.get(id) !== i - 1 && seenNote.get(id) !== i) bad.push('page ' + (i + 1) + ': note ' + id + ' goes on from page ' + (seenNote.get(id) + 1)); else seenNote.set(id, i); }
		for (const sup of text.querySelectorAll('sup[data-note]')) { const id = sup.dataset.note; if (seenMark.has(id)) continue; seenMark.add(id); const first = [...notes.querySelectorAll(':scope > .note')].some(n => n.dataset.note === id); if (!first) bad.push('page ' + (i + 1) + ': the note of mark ' + id + ' isn’t at its foot'); }
		const folio = pg.querySelector('.folio')?.textContent ?? pg.querySelector('.head .n')?.textContent ?? '';
		if (/^\\d+$/.test(folio)) { const n = Number(folio); if (offset === null) offset = i + 1 - n; if (i + 1 - n !== offset || n <= last) bad.push('page ' + (i + 1) + ' is numbered ' + n); last = n; }
		const end = text.lastElementChild;
		if (end && (/^H\\d$/.test(end.tagName) || end.classList.contains('break')) && pages[i + 1] && pages[i + 1].dataset.section === pg.dataset.section && text.childElementCount > 1) bad.push('page ' + (i + 1) + ' ends with a ' + (end.classList.contains('break') ? 'scene break' : 'heading'));
	});
	let toc = 0;
	for (const n of d.querySelectorAll('p.toc .n')) {
		const at = pages.findIndex(pg => pg.dataset.section === n.dataset.to);
		if (at < 0) { bad.push('the contents list ' + n.dataset.to + ', which has no page'); continue; }
		toc++;
		if (/^\\d+$/.test(n.textContent) && offset !== null && Number(n.textContent) !== at + 1 - offset) bad.push('the contents say ' + n.dataset.to + ' is on page ' + n.textContent + '; it is on ' + (at + 1 - offset));
		if (!n.textContent) bad.push('the contents give no page for ' + n.dataset.to);
	}
	return { bad, over, pages: pages.length, toc, notes: seenNote.size, marks: seenMark.size };
})()`);

/** The window's pages by section: each section's own words (not its heading, its marks, its breaks), and its notes'. */
const bySection = (p) => p.ev(`(() => { const d = ${FRAME}.contentDocument, out = {}; for (const pg of d.querySelectorAll('.page[data-section]')) { const c = pg.querySelector('.block').cloneNode(true); for (const b of c.querySelectorAll('br')) b.replaceWith('\\n'); for (const x of c.querySelectorAll('h1, sup, .n, .mk, .break')) x.remove(); const o = (out[pg.dataset.section] ??= { main: '', notes: '' }); const t = (sel) => [...c.querySelectorAll(sel)].map(e => e.tagName === 'TABLE' ? [...e.querySelectorAll('th, td')].map(x => x.textContent).join(' ') : e.textContent).join('\\n'); o.main += '\\n' + t('.text > *'); o.notes += '\\n' + t('.notes > *'); } return out; })()`);
/** An EPUB's sections the same way. The ebook writer is held word for word against the book in the unit tests: so
    the pages are held against it. */
function epubSections(path) {
	const z = unzipSync(new Uint8Array(readFileSync(path))), out = {};
	const un = (s) => s.replace(/&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
	const clean = (h) => un(h.replace(/<h1[\s\S]*?<\/h1>/g, ' ').replace(/<a class="noteref"[\s\S]*?<\/a>/g, '').replace(/<a href="#r[^"]*" role="doc-backlink">[\s\S]*?<\/a>/g, '').replace(/<p class="break"[\s\S]*?<\/p>/g, ' ').replace(/<\/?(?:em|strong|del|code|span|a)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' '));
	for (const [name, data] of Object.entries(z)) {
		const m = /^OEBPS\/text\/(.+)\.xhtml$/.exec(name);
		if (!m) continue;
		const x = strFromU8(data), body = x.slice(x.indexOf('<body')), at = body.indexOf('<section class="notes"');
		out[m[1]] = { main: clean(at < 0 ? body : body.slice(0, at)), notes: clean(at < 0 ? '' : body.slice(at)) };
	}
	return out;
}
/** A book's pages against its ebook, section by section, in order: "" when they are the same words. */
function againstEbook(pagesBy, ebookBy) {
	const made = /^(title-page|copyright|contents)/;
	for (const id of Object.keys(ebookBy)) {
		if (made.test(id)) continue;
		const a = pagesBy[id], b = ebookBy[id];
		if (!a) { if (words(b.main).length) return `the section ${id} isn’t in the pages`; continue; }
		for (const part of ['main', 'notes']) {
			const x = words(a[part]), y = words(b[part]), at = x.findIndex((w, i) => w !== y[i]);
			if (x.length !== y.length || at >= 0) return `${id}, its ${part === 'main' ? 'text' : 'notes'}: ${x.length} words in the pages, ${y.length} in the book; at word ${at}: “${x.slice(Math.max(0, at - 3), at + 4).join(' ')}” / “${y.slice(Math.max(0, at - 3), at + 4).join(' ')}”`;
		}
	}
	for (const id of Object.keys(pagesBy)) if (!ebookBy[id] && !made.test(id) && words(pagesBy[id].main).length) return `the pages have a section ${id} the book hasn’t`;
	return '';
}

/** A binder exported as an ebook, then shown as a paperback: the ebook's sections, and the window on its pages. */
async function bothWays(p, folder, name) {
	await open(p, folder);
	await pick(p, 'Ebook');
	await until(p, `!!document.querySelector('${WIN} .binders-export-paper.mod-ebook .binders-export-section')`, 30000);
	await press(p, 'Export');
	if (!(await saved(p))) throw new Error(`the ebook of ${folder} wasn’t saved`);
	const ebook = epubSections((await p.ev(`window.__bp.asked`)).pop());
	await pick(p, 'Paperback');
	if (!(await laidOut(p, 120000))) throw new Error(`the pages of ${folder} were never laid out`);
	return { ebook, name };
}

const EXAMPLES = ['Low Water at Corran', 'Twelve Hives', 'Kettleby Junction', 'Nine Kinds of Weather', 'The Kitchen Table Press', 'The Varga Job', 'Die Uhr von Sankt Veit', 'Le Bac de minuit', 'Other Alphabets', 'The Cartographer’s Winter', 'What Markdown becomes'];
/** The demo vault's example books put into the vault under test (scripts/demo-vault makes them, the same every time). */
async function withExamples(p) {
	const { plan } = await import('../../scripts/demo-vault/build.mjs');
	for (const [path, data] of plan({ caseSensitive: true, bothForms: true })) {
		if (!path.startsWith('Examples/')) continue;
		mkdirSync(join(p.vaultDir, path, '..'), { recursive: true });
		writeFileSync(join(p.vaultDir, path), data);
	}
	await until(p, `${j(EXAMPLES)}.every(n => !!${PL}.binders.binderOf('Examples/' + n))`, 60000);
	await p.sleep(1500);
}

test('the demo vault’s example books: every one laid out word for word, its pages sound, and printed as it is shown', async (p, h, t) => {
	await withAuthor(p);
	await withExamples(p);
	let total = 0, sheets = 0, took = 0;
	const began = Date.now();
	for (const name of EXAMPLES) {
		const { ebook } = await bothWays(p, `Examples/${name}`, name);
		const by = await bySection(p), shown = await pages(p), inv = await invariants(p);
		const count = Object.values(by).reduce((n, s) => n + words(s.main).length + words(s.notes).length, 0);
		total += count; sheets += shown.length; took += Number(await p.ev(`document.querySelector('${WIN} .binders-export-preview').dataset.took`));
		t.eq(againstEbook(by, ebook), '', `${name}: word for word, section by section (${count.toLocaleString()} words on ${shown.length} pages)`);
		t.eq(inv.bad.slice(0, 4).join('; '), '', `${name}: no line outside its page, every note under its mark or flowing from it, the numbers in order, the contents true (${inv.notes} notes, ${inv.toc} lines of contents)`);
		t.ok(inv.over.length <= 2, `${name}: no page over-full, but for what is taller than a page (${inv.over.join(', ') || 'none'})`);
		await press(p, 'Export');
		const done = await until(p, `(document.querySelector('${WIN} .binders-export-status')?.textContent ?? '').startsWith('Saved to') || [...document.querySelectorAll('.notice')].some(n => n.textContent.startsWith('The export didn’t finish'))`, 180000);
		t.eq(await p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent).filter(x => x.startsWith('The export')).join('|')`), '', `${name}: nothing went wrong in printing`);
		t.ok(done && await saved(p, 1000), `${name}: printed`);
		const at = (await p.ev(`window.__bp.asked`)).pop();
		keep(at, `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-classic.pdf`);
		checkPdf(t, at, shown, { name, others: name === 'Other Alphabets' });
		await closeAll(p);
	}
	console.log(`    the demo vault’s ${EXAMPLES.length} example books as paperbacks: ${total.toLocaleString()} words on ${sheets.toLocaleString()} pages; laid out in ${Math.round(took).toLocaleString()} ms in all; ${Math.round((Date.now() - began) / 1000)} s with reading, the ebooks and printing`);
});

test('a paperback of 150,000 words is laid out and printed in time, word for word', async (p, h, t) => {
	await withAuthor(p);
	const LIST = 'the light keeper water stone island storm glass tower lamp night boat letter she he was had and of in to a not with for on at from by when then extraordinary lighthouse remembered understanding'.split(' ');
	const made = await p.ev(`(async () => {
		const list = ${j(LIST)}; let seed = 11; const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
		await app.vault.createFolder('Big'); const order = [], all = [];
		for (let c = 1; c <= 30; c++) {
			const lines = [];
			for (let l = 0; l < 100; l++) { const w = []; for (let i = 0; i < 50; i++) w.push(list[Math.floor(next() * list.length)]); lines.push(w.join(' ') + '.'); all.push(...w); }
			await app.vault.create('Big/Chapter ' + c + '.md', lines.join('\\n') + '\\n'); order.push('Chapter ' + c);
		}
		await app.vault.create('Big/Big.md', '---\\nbinder: 1\\ncontents:\\n' + order.map(o => '  - ' + o).join('\\n') + '\\n---\\n');
		return all.join(' ');
	})()`);
	t.eq(words(made).length, 150000, 'a binder of 150,000 words');
	await until(p, `!!${PL}.binders.binderOf('Big')`, 8000);
	await open(p, 'Big');
	await pick(p, 'Paperback');
	t.ok(await laidOut(p, 120000), 'the pages are laid out');
	const took = Number(await p.ev(`document.querySelector('${WIN} .binders-export-preview').dataset.took`)), shown = await pages(p);
	// (about three seconds on a machine doing nothing else; the limit is for one running six Obsidians, where it has taken forty)
	t.ok(took < 60000, `in time: ${took} ms for ${shown.length} pages (the limit is 60 s)`);
	sameWords(t, words(await bodyWords(p)), words(made), 'word for word, in the window');
	const inv = await invariants(p);
	t.eq(inv.bad.slice(0, 4).join('; '), '', 'the pages are sound');
	t.eq(inv.over.join(), '', 'none over-full');
	const began = Date.now();
	await press(p, 'Export');
	t.ok(await saved(p, 240000), 'printed and saved');
	const whole = Date.now() - began, at = join(p.vaultDir, 'Exports', 'Big.pdf');
	t.ok(whole < 180000, `exported in time: ${whole} ms to read, lay out, print and save (the limit is 180 s)`);
	console.log(`    150,000 words: ${shown.length} pages; laid out in the window in ${took} ms; exported (read, laid out again, printed, saved) in ${whole} ms; ${Math.round(readFileSync(at).length / 1024)} kB`);
	keep(at, 'generated-150000-words.pdf');
	checkPdf(t, at, shown, { size: '360 x 576' });
	if (TOOLS.text) {
		const printed = pdfPages(at);
		// (a word broken at the foot of a page goes on at the head of the next: the pages are read as one text)
		// (and pdftotext, which joins a broken word again, joins one broken at a page's last line to the page number under it)
		const body = words(printed.map((x, i) => { const s = shown[i], lines = x.split('\n').filter((l) => l.trim()), same = (l, w) => !!w && words(l ?? '').join(' ') === words(w).join(' '); if (same(lines[0], s.head)) lines.shift(); if (same(lines[lines.length - 1], s.folio)) lines.pop(); else if (s.folio && lines.length && lines[lines.length - 1].endsWith(s.folio)) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -s.folio.length)}-`; return /title-page|copyright|contents/.test(s.cls) ? '' : lines.join('\n'); }).join('\n'));
		const chapters = shown.filter((s) => /opener/.test(s.cls) && /chapter/.test(s.cls)).length;
		t.eq(chapters, 30, 'thirty chapters open');
		// (each chapter's heading, "Chapter One", is two words the notes didn't write)
		const want = words(made);
		let i = 0, missed = -1;
		for (const w of body) { if (w === want[i]) i++; else if (w !== 'chapter' && !/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|twentyone|twentytwo|twentythree|twentyfour|twentyfive|twentysix|twentyseven|twentyeight|twentynine)$/.test(w)) { missed = i; break; } }
		t.ok(missed < 0 && i === want.length, `word for word, in the PDF, running heads and page numbers set aside (${i} of ${want.length}${missed < 0 ? '' : `, lost at word ${missed}: “${want.slice(Math.max(0, missed - 4), missed + 4).join(' ')}”`})`);
		t.eq(body.length - chapters * 2, 150000, 'and no word more');
	}
});
