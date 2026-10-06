// Export, the pages (src/export/pages/, src/export/pdf.ts): a paperback and a manuscript as PDFs. The pages the
// window shows are the pages that are printed, so every test that exports reads the PDF back (pdftotext, pdffonts and
// pdfinfo, dev-time tools of Poppler: a test that needs one says loudly when it isn't there) and compares it with
// the window's pages and with the notes. The save dialog is stood in for, as in specs-export.mjs.
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PL, j, openView, same, texts, until, withTidy } from './view-helpers.mjs';

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
