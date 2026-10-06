// Export, the pages (src/export/pages/, src/export/pdf.ts): a paperback and a manuscript as PDFs. The pages the
// window shows are the pages that are printed, so every test that exports reads the PDF back (pdftotext, pdffonts and
// pdfinfo, dev-time tools of Poppler: a test that needs one says loudly when it isn't there) and compares it with
// the window's pages and with the notes. The save dialog is stood in for, as in specs-export.mjs.
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
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
    inside a word not counted (a line may end at one, and then nothing tells it from a word that was broken). */
const words = (s) => (s.normalize('NFKC').replace(/[-‐­]\s*\n\s*/g, '').replace(/[-‐­​]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.toLowerCase());

// ---- the window ----
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const FRAME = `document.querySelector('${WIN} iframe.binders-export-frame')`;
/** The window's pages, once they are all laid out: for each, its text, its notes, its head and its number. */
const pages = (p) => p.ev(`(() => { const d = ${FRAME}?.contentDocument; if (!d) return []; const t = (e) => (e ? [...e.children].map(c => c.textContent).join('\\n') : ''); return [...d.querySelectorAll('.page')].map(pg => ({ cls: pg.className, text: t(pg.querySelector('.text')), notes: t(pg.querySelector('.notes')), head: pg.querySelector('.head')?.textContent ?? '', folio: pg.querySelector('.folio')?.textContent ?? '' })); })()`);
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
const bodyWords = (p) => p.ev(`(() => { const d = ${FRAME}.contentDocument, out = []; for (const pg of d.querySelectorAll('.page')) { if (/title-page|copyright|contents/.test(pg.className)) continue; const c = pg.querySelector('.block').cloneNode(true); for (const x of c.querySelectorAll('h1, sup, .n, .mk, .break')) x.remove(); out.push([...c.querySelectorAll('.text > *, .notes > *')].map(e => e.textContent).join('\\n')); } return out.join('\\n'); })()`);

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
	t.eq(words(await bodyWords(p)).join(' '), sourceWords(before).join(' '), 'word for word: the pages hold the notes’ words, in binder order');

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
		const differ = shown.map((s, i) => [words(`${s.head}\n${s.text}\n${s.notes}\n${s.folio}`).sort().join(' '), words(printed[i] ?? '').sort().join(' ')]).findIndex(([a, b]) => a !== b);
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
		t.ok(fonts.every((f) => f.type !== 'Type 3'), 'none as Type 3');
	}
	if (!TOOLS.text) loud(t, 'pdftotext'); else {
		const printed = pdfPages(at);
		const differ = shown.map((s, i) => [words(`${s.head}\n${s.text}\n${s.notes}\n${s.folio}`).sort().join(' '), words(printed[i] ?? '').sort().join(' ')]).findIndex(([a, b]) => a !== b);
		t.eq(differ, -1, `each printed page holds the words of the window’s page (page ${differ + 1})`);
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
	t.eq(words(await bodyWords(p)).join(' '), sourceWords(before).join(' '), 'word for word: the pages hold the notes’ words, in binder order');
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
			t.eq(words(await bodyWords(p)).join(' '), sourceWords(before).join(' '), 'word for word, on a phone too');
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
