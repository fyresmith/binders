// Export styles (src/export/style*.ts, src/export/styles.ts, src/view/export-style-editor.ts): the style editor in
// the Export window, the styles' files in "Export styles", and what a changed style does to the preview and to the
// file exported. The save dialog is stood in for as in specs-export.mjs; every test checks that no note changed.
//   BINDERS_SHOTS=dir   also saves pictures of the editor there (the report's screenshots)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { PL, clickMenu, j, menuItems, reload, same, texts, until, withTidy } from './view-helpers.mjs';
import { EBOOK, WIN, asked, closeAll, docx, epub, epubcheck, onMobile, open, open2, openEbook, pick, press, saved, sourceWords, standIn, tapEl, withAuthor, words } from './specs-export.mjs';

export const specs = [];
const DIR = 'Export styles';
const BINDER = 'The Lighthouse/The Lighthouse.md';
const ED = `${WIN} .binders-style-editor`;
const SHOTS = process.env.BINDERS_SHOTS || '';

/** A picture for the report, named for the theme it was taken in. */
async function shot(p, name) {
	if (!SHOTS) return;
	mkdirSync(SHOTS, { recursive: true });
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	await p.sleep(250);
	await p.shot(join(SHOTS, `${name}-${dark ? 'dark' : 'light'}.png`));
}

const styles = `${PL}.styles`;
const settle = (p) => p.ev(`${styles}.settled().then(() => 1)`);
/** A style's file on the disk, or null. */
const onDisk = (p, name) => { const at = join(p.vaultDir, DIR, `${name}.bookstyle`); return existsSync(at) ? readFileSync(at, 'utf8') : null; };
const files = (p) => (existsSync(join(p.vaultDir, DIR)) ? readdirSync(join(p.vaultDir, DIR)).sort() : []);
/** Writes a style's file from outside Obsidian, as another program or sync would, and waits for Binders to see it. */
async function outside(p, name, text) {
	mkdirSync(join(p.vaultDir, DIR), { recursive: true });
	writeFileSync(join(p.vaultDir, DIR, `${name}.bookstyle`), text);
	await until(p, `${styles}.text(${j(name)}) === ${j(text)}`, 8000);
	await p.sleep(200);
}
/** Takes every style file away again, and waits for Binders to see that. */
async function clear(p) {
	await settle(p);
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${styles}.folder); if (f) await app.vault.delete(f, true); await ${styles}.reload(); })().then(() => 1)`);
}

const key = (k) => `document.querySelector('${WIN} [data-binders-key="${k}"]')`;
const click = async (p, k) => { if (!(await p.ev(`(() => { const e = ${key(k)}; if (!e) return false; e.click(); return true; })()`))) throw new Error(`nothing with the key “${k}” in the Export window`); await p.sleep(150); };
/** Opens the editor on the style the window has chosen. */
async function edit(p) { await click(p, 'edit-style'); await until(p, `!!document.querySelector('${ED} .input-row')`); }
/** Chooses an option of one of the editor's dropdowns by what it says. */
const choose = async (p, row, label) => {
	const ok = await p.ev(`(() => { const s = ${key(`style-${row}`)}; const o = s && [...s.options].find(o => o.textContent === ${j(label)}); if (!o) return false; s.value = o.value; s.dispatchEvent(new Event('change')); return true; })()`);
	if (!ok) throw new Error(`the row “${row}” has no “${label}”`);
	await p.sleep(250);
};
/** Moves one of the editor's sliders. */
const slide = async (p, row, value) => { await p.ev(`(() => { const s = ${key(`style-${row}`)}; s.value = ${j(String(value))}; s.dispatchEvent(new Event('input')); return 1; })()`); await p.sleep(250); };
const note = (p) => p.ev(`document.querySelector('${ED} .binders-style-note')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''`);
const rows = (p) => p.ev(`[...document.querySelectorAll('${ED} .input-group-container')].map(g => g.querySelector('.input-group-header').textContent + ': ' + [...g.querySelectorAll('.input-row-label')].map(l => l.textContent).join(', '))`);
const more = async (p) => { await click(p, 'style-more'); await until(p, `!!document.querySelector('.menu')`); };

const test = (name, fn, o) => specs.push({ name: 'export styles: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p, o);
	await clear(p);
	if (o?.prepare) await o.prepare(p);
	const before = await texts(p);
	try { await fn(p, h, t, before); same(t, before, await texts(p), { skip: o?.skip ?? [] }); } finally {
		await closeAll(p);
		await clear(p);
		await p.ev(`(async () => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportStyle = ''; pl.settings.exportKind = 'manuscript'; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });

export { DIR, ED, choose, click, edit, files, key, more, note, onDisk, outside, rows, settle, shot, slide, styles, test };

test('“Edit this style” turns the sidebar into the editor: a book style’s rows from Ebook, and back', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	t.eq(await p.ev(`${key('edit-style')}.getAttribute('aria-label')`), 'Edit this style', 'the button beside the Style dropdown');
	await edit(p);
	t.eq(await p.ev(`document.querySelector('${ED} .back-label').textContent`), 'Edit style', 'the editor, under its name');
	t.eq(await p.ev(`${key('style-name')}.value + '|' + ${key('style-name')}.readOnly`), 'Classic|true', 'a built-in style keeps its name');
	t.eq(await note(p), 'Built in', 'and says it is built in');
	t.eq((await rows(p)).join(' / '), 'Text: Paragraphs, Quotes and dashes / Chapters: Heading, Lettering, Heading size, Placed, First words / Scene breaks: Mark', 'from Ebook: the rows an ebook decides');
	t.ok((await p.ev(`document.querySelector('${ED} .binders-style-note.mod-foot').textContent`)).includes('in an ebook the reader chooses them'), 'and why the rest aren’t here');
	t.ok(await p.ev(`!!document.querySelector('${EBOOK} .mod-chapter')`), 'the preview stays beside it');
	await shot(p, 'editor-ebook-opened');
	await click(p, 'style-back');
	t.ok(await p.ev(`!!document.querySelector('${WIN} [role="option"]') && !document.querySelector('${ED}')`), 'back to the choices');
});

/** Before a test's notes are noted down: folders are chapters and notes their scenes (so there are scene breaks),
    and one note has quotes, a dash and an ellipsis as they are typed. */
const SHAPED = async (p) => {
	await p.ev(`(async () => {
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('The Lighthouse/The Lighthouse.md'), (fm) => { fm.structure = 'chapters and scenes'; });
		const f = app.vault.getAbstractFileByPath('The Lighthouse/Part One/Arrival.md');
		await app.vault.process(f, (t) => t + '\\n\\n"Quoted," she said -- twice... and left.\\n');
	})().then(() => 1)`);
	await p.sleep(400);
};
/** What the ebook's preview shows of the style. */
const SHAPE = `(() => {
	const paper = document.querySelector('${EBOOK}'), cs = (e) => getComputedStyle(e);
	const sec = [...paper.querySelectorAll('.mod-chapter')].find(s => s.querySelector('.binders-export-break')) ?? paper.querySelector('.mod-chapter');
	const h = sec.querySelector('.binders-export-heading'), ps = [...sec.querySelectorAll(':scope > p:not(.binders-export-break)')];
	return {
		heading: h.innerText.replace(/\\n+/g, ' / '), align: cs(h).textAlign, italic: cs(h).fontStyle, upper: cs(h).textTransform, size: Math.round(parseFloat(cs(h).fontSize) / parseFloat(cs(paper).fontSize) * 100) / 100,
		indent: cs(ps[1]).textIndent !== '0px', gap: cs(ps[1]).marginTop !== '0px', lead: !!sec.querySelector('.binders-export-lead'),
		mark: sec.querySelector('.binders-export-break')?.textContent ?? null, text: paper.textContent,
	};
})()`;
const shape = (p) => p.ev(SHAPE);
/** Waits for the preview to show what `test` (a function of the shape, as source) is true of. */
const shown = (p, test, ms = 6000) => until(p, `(() => { try { return (${test})(${SHAPE}); } catch { return false; } })()`, ms);

test('every row of a book style changes the ebook’s preview and the EPUB, is kept in the style’s file, and Reset puts it back', async (p, h, t, before) => {
	await withAuthor(p);
	await openEbook(p);
	await edit(p);
	const was = await shape(p);
	t.eq([was.heading.toLowerCase(), was.align, was.upper, was.size, was.indent, was.gap, was.lead, was.mark].join('|'), 'chapter one|center|uppercase|1.05|true|false|true|* * *', 'Classic, before anything is changed');
	t.ok(was.text.includes('“Quoted,” she said — twice… and left.'), 'quotes and dashes typeset');
	t.eq(onDisk(p, 'Classic'), null, 'a built-in style as it comes has no file');

	await choose(p, 'paragraphs', 'Space between');
	t.ok(await shown(p, `(s) => !s.indent && s.gap`), 'Paragraphs: space between, no indent');
	await settle(p);
	t.eq(onDisk(p, 'Classic'), '---\nexport-style: 1\nbased-on: Classic\nparagraphs: spaced\n---\n', 'the change is kept as it is made: the file has the one difference');
	t.eq(await note(p), 'Built in · 1 change Reset', 'the editor counts it, and offers Reset');
	await choose(p, 'quotes', 'As typed');
	t.ok(await shown(p, `(s) => s.text.includes('"Quoted," she said -- twice... and left.')`), 'Quotes and dashes: as typed');
	await choose(p, 'chapter-heading', 'Chapter 1');
	t.ok(await shown(p, `(s) => s.heading.toLowerCase() === 'chapter 1'`), 'Heading: the pattern chosen');
	await choose(p, 'heading-lettering', 'Italic');
	t.ok(await shown(p, `(s) => s.italic === 'italic' && s.upper === 'none'`), 'Lettering: italic');
	await choose(p, 'heading-size', 'Large');
	t.ok(await shown(p, `(s) => s.size === 2.2`), 'Heading size: large');
	await choose(p, 'heading-alignment', 'At the left');
	t.ok(await shown(p, `(s) => s.align === 'start'`), 'Placed: at the left');
	await choose(p, 'first-words', 'As the rest');
	t.ok(await shown(p, `(s) => !s.lead`), 'First words: as the rest');
	await choose(p, 'scene-break', '⁂');
	t.ok(await shown(p, `(s) => s.mark === '⁂'`), 'Mark: the one chosen');
	t.eq(await note(p), 'Built in · 8 changes Reset', 'eight rows, eight changes');
	t.eq(await p.ev(`document.querySelectorAll('${ED} .input-row.is-changed').length`), 8, 'each changed row is marked');
	await shot(p, 'editor-ebook-changed');
	await settle(p);
	t.eq(onDisk(p, 'Classic'), '---\nexport-style: 1\nbased-on: Classic\nparagraphs: spaced\nquotes: as typed\nchapter-heading: "Chapter {number}"\nheading-lettering: italic\nheading-size: large\nheading-alignment: left\nfirst-words: as the rest\nscene-break: "⁂"\n---\n', 'the file: its version, what it is based on, and the differences under the editor’s rows’ names');

	await press(p, 'Export');
	t.ok(await saved(p), 'exported with the changed style');
	const e = epub(join(p.vaultDir, 'Exports', 'The Lighthouse.epub')), css = e.x('OEBPS/css/book.css');
	t.ok(css.includes('p + p { margin-top: 0.7em; }') && css.includes('text-indent: 0;'), 'the EPUB: paragraphs spaced');
	t.ok(/h1 \{ font-size: 2\.2em;[^}]*text-align: start; font-style: italic;/.test(css), 'its headings large, at the left, italic');
	t.ok(!css.includes('.lead {'), 'no first words set apart');
	t.ok(e.x('OEBPS/text/chapter-1.xhtml').includes('<p class="break" role="separator">⁂</p>'), 'the scene break’s mark');
	t.eq(e.headings.filter((x) => x.startsWith('Chapter')).join('|'), 'Chapter 1|Chapter 2', 'the heading pattern');
	t.ok(e.body.includes('"Quoted," she said -- twice... and left.'), 'quotes as typed');
	t.eq(words(e.body).join(' '), sourceWords(before).join(' '), 'word for word, with a changed style: the words in the file are the words of the notes');
	const verdict = epubcheck(join(p.vaultDir, 'Exports', 'The Lighthouse.epub'));
	if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes it');

	// kept across a reload
	await closeAll(p);
	await reload(p);
	await standIn(p);
	await openEbook(p);
	t.ok(await shown(p, `(s) => s.mark === '⁂' && s.align === 'start' && s.size === 2.2 && !s.lead`), 'after a reload the book is still set that way');
	await edit(p);
	t.eq(await note(p), 'Built in · 8 changes Reset', 'and the editor still says what was changed');
	t.eq(await p.ev(`[...${key('style-scene-break')}.selectedOptions][0].textContent + '|' + [...${key('style-heading-size')}.selectedOptions][0].textContent`), '⁂|Large', 'its rows show the style as it is');

	await click(p, 'style-reset');
	t.ok(await shown(p, `(s) => s.mark === '* * *' && s.align === 'center' && s.lead && s.indent && s.text.includes('“Quoted,”')`), 'Reset: Classic as it comes');
	t.eq(await note(p), 'Built in', 'nothing is changed any more');
	await settle(p);
	t.eq(files(p).join(), '', 'and the file that held the changes is gone');
}, { prepare: SHAPED });

const PAPER = `${WIN} .binders-export-paper`;
/** What the manuscript's preview shows of the style. */
const SHEET = `(() => {
	const paper = document.querySelector('${PAPER}');
	return {
		courier: paper.classList.contains('mod-courier'), spacing: paper.dataset.spacing, underline: paper.classList.contains('mod-underline') && getComputedStyle(paper.querySelector('em')).textDecorationLine === 'underline',
		top: paper.classList.contains('mod-top'), mark: paper.querySelector('.binders-export-break')?.textContent ?? null,
		head: paper.querySelector('.binders-export-running')?.textContent ?? null, title: !!paper.querySelector('.binders-export-titlepage'),
	};
})()`;
const sheet = (p, test, ms = 6000) => until(p, `(() => { try { return (${test})(${SHEET}); } catch { return false; } })()`, ms);
const part = (path, name) => { const z = unzipSync(new Uint8Array(readFileSync(path))); return z[name] ? strFromU8(z[name]) : null; };

test('every row of a manuscript style changes the preview and the Word file: seven rows, kept in the style’s file', async (p, h, t, before) => {
	await withAuthor(p);
	await open(p);
	t.eq(await p.ev(`${key('style')}.value`), 'Standard manuscript', 'the manuscript’s style');
	await edit(p);
	t.eq((await rows(p)).join(' / '), 'Text: Typeface, Line spacing, Italics / Chapters and breaks: A chapter starts, Scene break / Pages: Along the top, Title page', 'a manuscript style’s seven rows');
	t.eq(await note(p), 'Built in', 'built in');
	t.ok(!(await p.ev(`!!document.querySelector('${ED} .binders-style-note.mod-foot')`)), 'nothing is left to a reader here');
	const was = await p.ev(SHEET);
	t.eq(JSON.stringify(was), JSON.stringify({ courier: false, spacing: '2', underline: false, top: false, mark: '#', head: 'Lindqvist / LIGHTHOUSE / 1', title: true }), 'Standard manuscript, before anything is changed');
	await shot(p, 'editor-manuscript-opened');

	await choose(p, 'typeface', 'Courier');
	t.ok(await sheet(p, `(s) => s.courier`), 'Typeface: Courier');
	await choose(p, 'line-spacing', 'Single');
	t.ok(await sheet(p, `(s) => s.spacing === '1'`), 'Line spacing: single');
	await choose(p, 'italics', 'Underlined');
	t.ok(await sheet(p, `(s) => s.underline`), 'Italics: underlined');
	await choose(p, 'chapter-starts', 'At the top of a new page');
	t.ok(await sheet(p, `(s) => s.top`), 'A chapter starts: at the top');
	await choose(p, 'scene-break', '***');
	t.ok(await sheet(p, `(s) => s.mark === '***'`), 'Scene break: the mark chosen');
	await choose(p, 'header', 'The page number');
	t.ok(await sheet(p, `(s) => s.head === '1'`), 'Along the top: the page number alone');
	await choose(p, 'title-page', 'None');
	t.ok(await sheet(p, `(s) => !s.title`), 'Title page: none');
	t.eq(await note(p), 'Built in · 7 changes Reset', 'seven rows, seven changes');
	await settle(p);
	t.eq(onDisk(p, 'Standard manuscript'), '---\nexport-style: 1\nbased-on: Standard manuscript\ntypeface: Courier New\nline-spacing: single\nitalics: underlined\nchapter-starts: at the top\nscene-break: "***"\nheader: page\ntitle-page: false\n---\n', 'the file, under a manuscript style’s names');

	await press(p, 'Export');
	t.ok(await saved(p), 'exported with the changed style');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.docx'), d = docx(at), look = part(at, 'word/styles.xml');
	t.ok(look.includes('<w:rFonts w:ascii="Courier New"'), 'the Word file: Courier');
	t.ok(/w:styleId="Normal">[\s\S]*?w:line="240"/.test(look), 'single-spaced');
	t.ok(/w:styleId="Heading1">[\s\S]*?<w:spacing w:before="0"/.test(look), 'a chapter at the top of its page');
	t.ok(part(at, 'word/document.xml').includes('<w:u w:val="single"/>') && !part(at, 'word/document.xml').includes('<w:i/>'), 'italics underlined');
	t.ok(d.paras.some((x) => x.style === 'SceneBreak' && x.text === '***'), 'the scene break’s mark');
	t.eq(d.header.trim(), '1', 'the page number alone along the top');
	t.ok(!d.paras.some((x) => x.style === 'Title'), 'no title page');
	t.eq(words(d.body.join(' ')).join(' '), sourceWords(before).join(' '), 'word for word, with a changed style: the words in the file are the words of the notes');

	await choose(p, 'header', 'Nothing');
	t.ok(await sheet(p, `(s) => s.head === null`), 'Along the top: nothing');
	await click(p, 'style-back');
	await press(p, 'Export');
	t.ok(await saved(p), 'exported again');
	t.eq(part(at, 'word/header1.xml'), null, 'and the file has no header at all');
}, { prepare: async (p) => { await SHAPED(p); await p.ev(`app.vault.process(app.vault.getAbstractFileByPath('The Lighthouse/Part One/Arrival.md'), (t) => t + '\\nAnd *stressed* once.\\n').then(() => 1)`); await p.sleep(300); }, to: undefined });

const fmOf = (p, path) => p.ev(`(async () => { const t = await app.vault.adapter.read(${j(path)}); return t; })()`);
const styleIs = (p) => p.ev(`${key('style-name')}?.value ?? ''`);
const answer = async (p, label) => { await until(p, `[...document.querySelectorAll('.modal-container:last-of-type button')].some(b => b.textContent === ${j(label)})`); await p.ev(`(() => { [...document.querySelectorAll('.modal-container:last-of-type button')].find(b => b.textContent === ${j(label)}).click(); return 1; })()`); await p.sleep(300); };

test('a style of one’s own: Duplicate makes it, it is renamed and deleted, and the binder that uses it follows', async (p, h, t, before) => {
	await withAuthor(p);
	await openEbook(p);
	await edit(p);
	await choose(p, 'scene-break', '⁂');
	await more(p);
	t.eq((await menuItems(p)).join('|'), 'Duplicate|Reset to the original|Save a copy to share...|Add a style from a file...|Show the style’s file', 'a built-in style’s menu');
	await clickMenu(p, 'Duplicate');
	await until(p, `${key('style-name')}?.value === 'Classic 2'`);
	t.eq(await styleIs(p), 'Classic 2', 'the copy is the style in hand, under the first free name');
	t.eq(await p.ev(`${key('style-name')}.readOnly`), false, 'its name can be typed over');
	t.eq(await note(p), 'Based on Classic', 'it says what it is based on');
	await settle(p);
	t.eq(onDisk(p, 'Classic 2'), '---\nexport-style: 1\nbased-on: Classic\n---\n', 'its file: based on Classic, nothing changed yet');
	t.eq(await p.ev(`[...${key('style-scene-break')}.selectedOptions][0].textContent`), '⁂', 'it starts as the style it was made from is now');
	t.ok((await fmOf(p, 'The Lighthouse/The Lighthouse.md')).includes('book-style: Classic 2'), 'and the binder uses it from now on');
	await choose(p, 'paragraphs', 'Space between');
	await settle(p);
	t.eq(onDisk(p, 'Classic 2'), '---\nexport-style: 1\nbased-on: Classic\nparagraphs: spaced\n---\n', 'a change to it is written to its own file');
	t.ok(!onDisk(p, 'Classic').includes('paragraphs'), 'and not to Classic’s');
	await shot(p, 'editor-own-style');

	// renamed: by typing over its name
	await p.ev(`(() => { const i = ${key('style-name')}; i.focus(); i.value = 'Wide and airy'; i.dispatchEvent(new Event('blur')); return 1; })()`);
	await until(p, `${styles}.text('Wide and airy') !== null`, 6000);
	await settle(p);
	t.eq(files(p).join(), 'Classic.bookstyle,Wide and airy.bookstyle', 'renamed: its file has the new name');
	await until(p, `app.metadataCache.getCache('The Lighthouse/The Lighthouse.md')?.frontmatter?.['book-style'] === 'Wide and airy'`, 6000);
	t.ok((await fmOf(p, 'The Lighthouse/The Lighthouse.md')).includes('book-style: Wide and airy'), 'the binder that used it still does, under its new name');
	t.eq(await styleIs(p), 'Wide and airy', 'the editor has it under the new name');
	// a name that is taken, and one a file can't have
	await p.ev(`(() => { const i = ${key('style-name')}; i.focus(); i.value = 'classic'; i.dispatchEvent(new Event('blur')); return 1; })()`);
	await p.sleep(500);
	t.eq(await styleIs(p), 'Wide and airy', 'a name that is taken is refused');
	await p.ev(`(() => { const i = ${key('style-name')}; i.focus(); i.value = 'a/b'; i.dispatchEvent(new Event('blur')); return 1; })()`);
	await p.sleep(500);
	t.eq(files(p).join(), 'Classic.bookstyle,Wide and airy.bookstyle', 'and so is one a file can’t have');

	await more(p);
	t.eq((await menuItems(p)).join('|'), 'Duplicate|Rename...|Save a copy to share...|Add a style from a file...|Show the style’s file|Delete', 'a style of one’s own: Rename and Delete');
	await shot(p, 'editor-own-style-menu');
	await clickMenu(p, 'Delete');
	await answer(p, 'Delete');
	await until(p, `${key('style-name')}?.value === 'Classic'`, 6000);
	await settle(p);
	t.eq(files(p).join(), 'Classic.bookstyle', 'deleted: its file is gone');
	t.eq(await p.ev(`app.vault.adapter.exists('.trash/Wide and airy.bookstyle')`), true, 'to the trash, where it can be had back');
	t.eq(await styleIs(p), 'Classic', 'and the window is back on the style it was based on');
	t.ok(await shown(p, `(s) => !s.gap && s.indent`), 'the preview with it');
	await click(p, 'style-back');
	t.eq(await p.ev(`[...${key('style')}.options].map(o => o.value).join()`), 'Classic,Modern', 'the Style dropdown lists what there is');
	const binderNote = await fmOf(p, BINDER);
	t.eq(binderNote.replace("book-style: Classic\n", ""), before[BINDER], 'the binder note gained its style’s name among its properties, and nothing else in it changed');
}, { prepare: SHAPED, skip: [BINDER] });

test('deleting a style keeps the styles based on it as they look; renaming it keeps them based on it', async (p, h, t) => {
	await outside(p, 'House', '---\nexport-style: 1\nbased-on: Modern\nscene-break: "#"\n---\nh1 { color: navy; }\n');
	await outside(p, 'House, large', '---\nexport-style: 1\nbased-on: House\nheading-size: medium\nmine: kept\n---\n');
	const look = () => p.ev(`(() => { const s = ${styles}.book('House, large'); return [s['scene-break'], s['heading-size'], s.typeface, s.css].join('|'); })()`);
	t.eq(await look(), '#|medium|Source Serif 4|h1 { color: navy; }', 'a style based on another of one’s own');
	await p.ev(`${styles}.rename(${styles}.get('House', 'book'), 'Home').then(() => 1)`);
	t.eq(onDisk(p, 'House, large'), '---\nexport-style: 1\nbased-on: Home\nheading-size: medium\nmine: kept\n---\n', 'renamed: the style based on it says the new name, and nothing else in its file changed');
	t.eq(await look(), '#|medium|Source Serif 4|h1 { color: navy; }', 'and looks as it did');
	await p.ev(`${styles}.remove(${styles}.get('Home', 'book')).then(() => 1)`);
	t.eq(onDisk(p, 'House, large'), '---\nexport-style: 1\nbased-on: Modern\nheading-size: medium\nmine: kept\nscene-break: "#"\n---\nh1 { color: navy; }\n', 'deleted: the style based on it now stands on the built-in one, with what it had from the one that is gone');
	t.eq(await look(), '#|medium|Source Serif 4|h1 { color: navy; }', 'and still looks as it did');
});

const explorerNames = (p) => p.ev(`[...document.querySelectorAll('.nav-files-container > div > .tree-item > .tree-item-self .tree-item-inner')].map(e => e.textContent)`);

test('the styles folder is kept out of the file explorer, in no search or switcher, and shown if the writer keeps notes in it', async (p, h, t) => {
	const top = await explorerNames(p);
	await outside(p, 'Mine', '---\nexport-style: 1\nbased-on: Classic\nmargins: wide\n---\n');
	await p.sleep(600);
	t.ok(await p.ev(`app.vault.getAbstractFileByPath('${DIR}') instanceof app.vault.getRoot().constructor`), 'the folder is in the vault');
	t.eq((await explorerNames(p)).join('|'), top.join('|'), 'and not in the file explorer');
	t.ok(!(await p.ev(`app.vault.getMarkdownFiles().some(f => f.path.startsWith('${DIR}/'))`)), 'a style is not a note: Obsidian doesn’t index it');
	t.eq(await p.ev(`Object.keys(app.metadataCache.resolvedLinks).filter(k => k.startsWith('${DIR}/')).length`), 0, 'so it is in no graph or search');
	// a note of the writer's own in it: the folder is theirs too, and is listed
	await p.ev(`app.vault.create('${DIR}/About these.md', 'Mine.').then(() => 1)`);
	await until(p, `[...document.querySelectorAll('.nav-folder-title-content')].some(e => e.textContent === '${DIR}')`, 5000);
	t.ok((await explorerNames(p)).includes(DIR), 'with a note in it the folder is shown');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('${DIR}/About these.md')).then(() => 1)`);
	await until(p, `![...document.querySelectorAll('.nav-folder-title-content')].some(e => e.textContent === '${DIR}')`, 5000);
	t.ok(!(await explorerNames(p)).includes(DIR), 'and hidden again when the note is gone');
	// its name is a setting: the folder goes with it
	await p.ev(`${styles}.moveTo('Book styles').then(() => 1)`);
	t.eq(await p.ev(`[app.vault.adapter.exists('Book styles/Mine.bookstyle'), app.vault.adapter.exists('${DIR}')].length && Promise.all([app.vault.adapter.exists('Book styles/Mine.bookstyle'), app.vault.adapter.exists('${DIR}')]).then(a => a.join())`), 'true,false', 'renamed in settings: the folder is renamed, with its styles');
	t.eq(await p.ev(`${styles}.get('Mine', 'book').values.margins`), 'wide', 'and they are still the vault’s styles');
	await p.sleep(500);
	t.ok(!(await explorerNames(p)).includes('Book styles'), 'still out of the explorer');
	await p.ev(`${styles}.moveTo('${DIR}').then(() => 1)`);
});

test('a style’s file changed, added or deleted outside Obsidian is picked up, in the open window too', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	await outside(p, 'Classic', '---\nexport-style: 1\nbased-on: Classic\nscene-break: "⁂"\nheading-alignment: left\n---\n');
	t.ok(await shown(p, `(s) => s.mark === '⁂' && s.align === 'start'`), 'Classic’s file arrived (as by sync): the preview follows');
	await edit(p);
	t.eq(await note(p), 'Built in · 2 changes Reset', 'the editor reads it');
	await outside(p, 'Classic', '---\nexport-style: 1\nbased-on: Classic\nscene-break: "#"\n---\n');
	t.ok(await shown(p, `(s) => s.mark === '#' && s.align === 'center'`), 'changed outside while the editor is open: the preview follows');
	t.eq(await note(p), 'Built in · 1 change Reset', 'and so does the editor');
	t.eq(await p.ev(`[...${key('style-scene-break')}.selectedOptions][0].textContent + '|' + [...${key('style-heading-alignment')}.selectedOptions][0].textContent`), '#|In the middle', 'its rows show the file as it is now');
	await click(p, 'style-back');
	await outside(p, 'From a friend', '---\nexport-style: 1\nbased-on: Modern\n---\n');
	await until(p, `[...${key('style')}.options].some(o => o.value === 'From a friend')`, 6000);
	t.eq(await p.ev(`[...${key('style')}.options].map(o => o.textContent).join()`), 'Classic,Modern,From a friend', 'a new file is a new style in the dropdown');
	await p.ev(`(() => { const s = ${key('style')}; s.value = 'From a friend'; s.dispatchEvent(new Event('change')); return 1; })()`);
	t.ok(await shown(p, `(s) => s.align === 'start' && s.size === 2.2 && !s.lead`), 'chosen: Modern’s shape');
	// deleted outside: the choice falls back, nothing breaks
	const { rmSync } = await import('fs');
	rmSync(join(p.vaultDir, DIR, 'From a friend.bookstyle'));
	await until(p, `${styles}.text('From a friend') === null`, 8000);
	t.ok(await shown(p, `(s) => s.align === 'center' && s.mark === '#'`), 'its file deleted outside: the window falls back to Classic');
	t.eq(await p.ev(`[...${key('style')}.options].map(o => o.textContent).join() + '=' + ${key('style')}.value`), 'Classic,Modern=Classic', 'and no longer offers it');
}, { prepare: SHAPED, skip: [BINDER] });

test('a style from a newer Binders is listed, not used, and never rewritten; a broken file says so and falls back', async (p, h, t) => {
	const newer = '---\nexport-style: 2\nbased-on: Classic\nscene-break: "⁂"\nsomething-new: [1, 2]\n---\n/* later */\n';
	const torn = 'scene-break: "⁂"\nno properties here\n';
	const half = '---\nexport-style: 1\nbased-on: Classic\nscene-break: "⁂"\nheading-size: enormous\ntype-size: 40\n---\n';
	await outside(p, 'Classic', newer);
	await outside(p, 'Torn', torn);
	await outside(p, 'Half', half);
	await withAuthor(p);
	await openEbook(p);
	t.eq(await p.ev(`[...${key('style')}.options].map(o => o.textContent).join('|')`), 'Classic (from a newer Binders)|Modern|Half|Torn (can’t be read)', 'each is listed, and says what is wrong with it');
	t.ok(await shown(p, `(s) => s.mark === '* * *'`), 'the newer file isn’t used: Classic is as it comes');
	const warn = () => p.ev(`[...document.querySelectorAll('${WIN} .binders-export-warn')].map(e => e.innerText.replace(/\\s+/g, ' ')).filter(x => x.startsWith('Style'))`);
	t.ok((await warn()).some((w) => w.includes('newer version of Binders')), 'and the window says why, with what there is to look at');
	await edit(p);
	t.ok((await note(p)).includes('newer version of Binders'), 'the editor says so too');
	t.eq(await p.ev(`[...document.querySelectorAll('${ED} select:not(.is-measuring)')].map(s => s.disabled).join()`), 'true,true,true,true,true,true,true,true', 'and its rows can’t be changed');
	await p.ev(`(() => { try { ${styles}.set(${styles}.get('Classic', 'book'), 'scene-break', '#'); return 'written'; } catch (e) { return e.message; } })()`);
	await p.ev(`(() => { try { ${styles}.reset(${styles}.get('Classic', 'book')); } catch (e) { return e.message; } })()`);
	await settle(p);
	t.eq(onDisk(p, 'Classic'), newer, 'the newer file is untouched, byte for byte');
	await click(p, 'style-back');

	await p.ev(`(() => { const s = ${key('style')}; s.value = 'Torn'; s.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(600);
	t.ok((await warn()).some((w) => w.includes('“Torn” can’t be read')), 'a broken file: said with what there is to look at');
	t.ok(await shown(p, `(s) => s.mark === '* * *' && s.align === 'center'`), 'and Classic is used in its place');
	await p.ev(`(() => { try { ${styles}.set(${styles}.get('Torn', 'book'), 'scene-break', '#'); } catch (e) { return e.message; } })()`);
	await settle(p);
	t.eq(onDisk(p, 'Torn'), torn, 'it is left as it is');

	await p.ev(`(() => { const s = ${key('style')}; s.value = 'Half'; s.dispatchEvent(new Event('change')); return 1; })()`);
	t.ok(await shown(p, `(s) => s.mark === '⁂' && s.size === 1.05`), 'a file with a value that can’t be read: the rest of it is used, and that row is its base’s');
	const said = await warn();
	t.ok(said.some((w) => w.includes('“heading-size” can’t be read (enormous)')) && said.some((w) => w.includes('“type-size” can’t be read (40)')), 'each such value is listed');
	await edit(p);
	await choose(p, 'heading-size', 'Large');
	await settle(p);
	t.eq(onDisk(p, 'Half'), '---\nexport-style: 1\nbased-on: Classic\nscene-break: "⁂"\nheading-size: large\ntype-size: 40\n---\n', 'the row put right in the editor is written; the line the editor didn’t touch stays as the writer left it');
}, { prepare: SHAPED, skip: [BINDER] });

test('styles belong to the vault: a built-in style changed for one binder is changed for another', async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('Second book');
		await app.vault.create('Second book/Second book.md', '---\\nbinder: 1\\ncontents:\\n  - One\\n  - Two\\n---\\n');
		await app.vault.create('Second book/One.md', 'The first chapter.\\n\\n---\\n\\nAfter a break.\\n');
		await app.vault.create('Second book/Two.md', 'The second chapter.\\n');
	})().then(() => 1)`);
	await until(p, `!!${PL}.binders.binderOf(app.vault.getAbstractFileByPath('Second book'))`, 8000);
	await withAuthor(p);
	await openEbook(p);
	await edit(p);
	await choose(p, 'scene-break', '⁂');
	await choose(p, 'heading-alignment', 'At the left');
	await settle(p);
	await closeAll(p);
	await openEbook(p, 'Second book');
	t.eq(await p.ev(`${key('style')}.value`), 'Classic', 'the other binder is in Classic too');
	t.ok(await shown(p, `(s) => s.mark === '⁂' && s.align === 'start'`), 'and has the changes made from the first');
	await edit(p);
	t.eq(await note(p), 'Built in · 2 changes Reset', 'its editor says the style is changed');
	await press(p, 'Export');
	t.ok(await saved(p), 'the second binder exported');
	const e = epub(join(p.vaultDir, 'Exports', 'Second book.epub'));
	t.ok(e.x('OEBPS/css/book.css').includes('text-align: start') && e.x('OEBPS/text/chapter-1.xhtml').includes('>⁂</p>'), 'its file is in the changed style');
	t.eq(files(p).join(), 'Classic.bookstyle', 'one file for the vault, not one a binder');
	await click(p, 'style-reset');
	await closeAll(p);
	await openEbook(p);
	t.ok(await shown(p, `(s) => s.mark !== '⁂' && s.align === 'center'`), 'reset from the second, the first is as it came again');
}, { prepare: SHAPED });

test('a heading of the writer’s own, and a mark typed into the file', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	await edit(p);
	await choose(p, 'chapter-heading', 'Your own...');
	t.ok(await p.ev(`document.activeElement === ${key('style-own-heading')}`), '“Your own...” opens a field for the pattern, ready to type in');
	t.eq(await p.ev(`${key('style-own-heading')}.value`), 'Chapter {number:words} / {title}', 'starting from the pattern it had');
	t.ok((await p.ev(`document.getElementById('binders-style-own-hint').textContent`)).includes('{number:roman}'), 'with what a pattern can say under it');
	await p.ev(`(() => { const i = ${key('style-own-heading')}; i.value = '{number:roman}. / {title}'; i.dispatchEvent(new Event('input')); return 1; })()`);
	t.ok(await shown(p, `(s) => s.heading === 'I.'`), 'typed: the preview follows as it is typed');
	await settle(p);
	t.eq(onDisk(p, 'Classic'), '---\nexport-style: 1\nbased-on: Classic\nchapter-heading: "{number:roman}. / {title}"\n---\n', 'and it is kept');
	t.ok(await p.ev(`document.activeElement === ${key('style-own-heading')}`), 'the field keeps the cursor while the style is written');
	await choose(p, 'chapter-heading', 'Chapter 1');
	t.ok(!(await p.ev(`!!${key('style-own-heading')}`)), 'a heading chosen by name takes the field away again');
	await outside(p, 'Classic', '---\nexport-style: 1\nbased-on: Classic\nscene-break: "~ ~"\n---\n');
	t.ok(await shown(p, `(s) => s.mark === '~ ~'`), 'a mark typed into the file is used');
	await click(p, 'style-back');
	await edit(p);
	t.eq(await p.ev(`[...${key('style-scene-break')}.options].map(o => o.textContent).join('|') + '=' + [...${key('style-scene-break')}.selectedOptions][0].textContent`), '* * *|#|⁂|—|Space only|~ ~=~ ~', 'and the editor offers it as itself');
	await choose(p, 'scene-break', 'Space only');
	t.ok(await shown(p, `(s) => s.mark.trim() === ''`), 'Space only: no mark');
}, { prepare: SHAPED });

test('sharing: a copy saved to send, a style added from a file, the style’s file shown', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	await edit(p);
	await more(p);
	t.eq(await p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(i => i.classList.contains('is-disabled')).map(i => i.querySelector('.menu-item-title').textContent).join('|')`), 'Reset to the original|Save a copy to share...|Show the style’s file', 'a built-in style as it comes has nothing to reset, send or show');
	await p.key('Escape');
	await choose(p, 'scene-break', '⁂');
	await more(p);
	await clickMenu(p, 'Duplicate');
	await until(p, `${key('style-name')}?.value === 'Classic 2'`);
	await choose(p, 'paragraphs', 'Space between');
	await settle(p);
	const to = join(p.vaultDir, 'sent.bookstyle');
	await p.ev(`(() => { window.__bx.to = ${j(to)}; window.__bx.asked = []; return 1; })()`);
	await more(p);
	await clickMenu(p, 'Save a copy to share...');
	await until(p, `window.__bx.asked.length === 1`, 5000);
	await p.sleep(500);
	t.ok((await asked(p))[0].endsWith('Classic 2.bookstyle'), 'the save dialog opens with the style’s name');
	t.eq(readFileSync(to, 'utf8'), '---\nexport-style: 1\nbased-on: Classic\nparagraphs: spaced\nscene-break: "⁂"\n---\n', 'the copy stands by itself: it has what it took from Classic as it is changed here');
	// shown in the system's file manager
	await p.ev(`(() => { const pl = ${PL}, was = pl.exportHost.desktop; pl.exportHost.desktop = (app) => { const d = was(app); return d && { ...d, reveal: (path) => { window.__shown = path; } }; }; return 1; })()`);
	await click(p, 'style-back');
	await edit(p);
	await more(p);
	await clickMenu(p, 'Show the style’s file');
	t.eq(await p.ev(`window.__shown`), join(p.vaultDir, DIR, 'Classic 2.bookstyle'), '“Show the style’s file” shows its file on the disk');
	// added from a file: under its name, or the first free one
	// (the system's file chooser can't be driven, and headless it answers “cancelled” at once: it is kept shut, and the file handed to the field it would have filled)
	await p.ev(`(() => { const was = HTMLInputElement.prototype.click; window.__click = was; HTMLInputElement.prototype.click = function () { if (this.type !== 'file') was.call(this); }; return 1; })()`);
	await more(p);
	await clickMenu(p, 'Add a style from a file...');
	const give = (name, text) => p.ev(`(() => { const i = document.querySelector('${ED} .binders-style-file'); const d = new DataTransfer(); d.items.add(new File([${j(text)}], ${j(name)})); i.files = d.files; i.dispatchEvent(new Event('change')); return 1; })()`);
	t.eq(await p.ev(`document.querySelector('${ED} .binders-style-file').accept`), '.bookstyle', 'the file chooser asks for a style’s file');
	await give('Classic 2.bookstyle', readFileSync(to, 'utf8'));
	await until(p, `${key('style-name')}?.value === 'Classic 3'`, 6000);
	await settle(p);
	t.eq(files(p).join(), 'Classic 2.bookstyle,Classic 3.bookstyle,Classic.bookstyle', 'a name that is taken: added under the first free one, nothing replaced');
	t.eq(onDisk(p, 'Classic 3'), readFileSync(to, 'utf8'), 'the file as it was sent');
	await more(p);
	await clickMenu(p, 'Add a style from a file...');
	await until(p, `!!document.querySelector('${ED} .binders-style-file')`);
	await give('Later.bookstyle', '---\nexport-style: 9\nbased-on: Classic\n---\n');
	await p.sleep(600);
	await more(p);
	await clickMenu(p, 'Add a style from a file...');
	await until(p, `!!document.querySelector('${ED} .binders-style-file')`);
	await give('notes.txt', 'not a style');
	await p.sleep(600);
	t.eq(files(p).join(), 'Classic 2.bookstyle,Classic 3.bookstyle,Classic.bookstyle', 'a file from a newer Binders, or one that is no style, isn’t taken');
	await p.ev(`(() => { HTMLInputElement.prototype.click = window.__click; return 1; })()`);
}, { skip: [BINDER] });

test('the editor by keyboard, and to a screen reader', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	await p.ev(`(() => { ${key('edit-style')}.focus(); return 1; })()`);
	await p.key('Enter');
	await until(p, `!!document.querySelector('${ED} .input-row')`);
	t.ok(await p.ev(`document.activeElement === ${key('style-back')}`), 'Enter on “Edit this style” opens the editor, with the way back in hand');
	const stops = [];
	for (let i = 0; i < 12; i++) { await p.key('Tab'); stops.push(await p.ev(`document.activeElement?.dataset.bindersKey ?? document.activeElement?.tagName`)); }
	t.eq(stops.slice(0, 11).join(' '), 'style-more style-name style-paragraphs style-quotes style-chapter-heading style-heading-lettering style-heading-size style-heading-alignment style-first-words style-scene-break BUTTON', 'Tab goes through its head and its rows in order, then on to the window’s bar');
	t.eq(await p.ev(`[...document.querySelectorAll('${ED} select:not(.is-measuring), ${ED} input')].filter(e => !e.getAttribute('aria-label')).length`), 0, 'every control has a name');
	t.eq(await p.ev(`[...document.querySelectorAll('${ED} [role="group"]')].map(g => g.getAttribute('aria-label')).join()`), 'Text,Chapters,Scene breaks', 'the groups are groups, by name');
	t.eq(await p.ev(`document.querySelector('${ED} .binders-style-note').getAttribute('role')`), 'status', 'what the style is, is said when it changes');
	await p.ev(`(() => { ${key('style-scene-break')}.focus(); return 1; })()`);
	await p.key('ArrowDown');
	await p.sleep(400);
	t.ok(await shown(p, `(s) => s.mark === '#'`), 'an arrow key on a row changes it');
	t.ok(await p.ev(`document.activeElement === ${key('style-scene-break')}`), 'and the row keeps the keyboard');
	await p.ev(`(() => { ${key('style-reset')}.focus(); return 1; })()`);
	await p.key('Enter');
	await p.sleep(400);
	t.eq(await note(p), 'Built in', 'Enter on Reset resets');
	t.ok(await p.ev(`document.querySelector('${ED}').contains(document.activeElement)`), 'and the keyboard is still in the editor');
	await p.ev(`(() => { ${key('style-back')}.focus(); return 1; })()`);
	await p.key(' ');
	await p.sleep(300);
	t.ok(await p.ev(`document.activeElement === ${key('edit-style')}`), 'Space on the back arrow goes back, to the button it came from');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(!(await p.ev(`!!document.querySelector('${WIN}')`)), 'Escape closes the window, as ever');
}, { prepare: SHAPED });

test('where Obsidian has no “Configure view” look, the editor is laid out by Binders’ own rules', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	await edit(p);
	const layout = () => p.ev(`(() => { const r = document.querySelector('${ED} [data-row]'), l = r.querySelector('.input-row-label').getBoundingClientRect(), c = r.querySelector('select').getBoundingClientRect(), f = document.querySelector('${ED} .binders-style-form').getBoundingClientRect(); return { plain: document.querySelector('${ED}').classList.contains('is-plain'), over: l.bottom <= c.top + 1, wide: c.width > f.width * 0.8, header: getComputedStyle(document.querySelector('${ED} .input-group-header')).fontWeight >= 600 }; })()`);
	const native = await layout();
	t.eq(JSON.stringify(native), JSON.stringify({ plain: false, over: true, wide: true, header: true }), 'this Obsidian has the look: a label over a full-width control, a bold group name');
	await click(p, 'style-back');
	// an Obsidian whose stylesheet has none of those classes: its rules are taken away, and the editor opened again
	await p.ev(`(() => { window.__off = []; for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch { continue; } for (let i = rules.length - 1; i >= 0; i--) { const r = rules[i]; if (r.selectorText && /\\.input-row|\\.input-group|\\.back-button|\\.bases-toolbar-menu|\\.view-config-menu/.test(r.selectorText) && !/binders/.test(r.selectorText)) { window.__off.push([sheet, r.cssText, i]); sheet.deleteRule(i); } } } return window.__off.length; })()`);
	try {
		await edit(p);
		const plain = await layout();
		t.eq(JSON.stringify(plain), JSON.stringify({ plain: true, over: true, wide: true, header: true }), 'without it: the fallback, and the same layout');
		await shot(p, 'editor-fallback-look');
	} finally {
		await p.ev(`(() => { for (const [sheet, text, i] of window.__off.reverse()) { try { sheet.insertRule(text, Math.min(i, sheet.cssRules.length)); } catch {} } return 1; })()`);
	}
});

specs.push({ name: 'export styles: a phone: the editor is a screen of its own, its rows whole on it, Preview at its foot', fn: withTidy(async (p, h, t) => {
	await clear(p);
	const before = await texts(p);
	await onMobile(p, 390, 844, async () => {
		await withAuthor(p);
		await open2(p);
		await tapEl(p, `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.textContent.startsWith('Ebook'))`);
		await until(p, `!!${key('edit-style')}`, 6000);
		await tapEl(p, key('edit-style'));
		await until(p, `!!document.querySelector('${ED} .input-row')`, 6000);
		t.ok(!(await p.ev(`!!document.querySelector('${WIN} [role="option"]')`)), 'the editor takes the screen: the kinds are behind it');
		t.eq((await rows(p)).join(' / '), 'Text: Paragraphs, Quotes and dashes / Chapters: Heading, Lettering, Heading size, Placed, First words / Scene breaks: Mark', 'the same rows');
		const fits = await p.ev(`(() => { const m = document.querySelector('${WIN}').getBoundingClientRect(); return [...document.querySelectorAll('${ED} .input-row, ${ED} select:not(.is-measuring), ${ED} .binders-export-phone-row button, ${ED} .back-button')].every(e => { const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1 && r.width > 40; }); })()`);
		t.ok(fits, 'each row is whole on the screen');
		t.ok(await p.ev(`[...document.querySelectorAll('${ED} select:not(.is-measuring)')].every(s => s.getBoundingClientRect().height >= 40)`), 'its controls are a finger high');
		t.eq((await p.ev(`[...document.querySelectorAll('${ED} .binders-export-phone-row button')].map(b => b.textContent)`)).join(), 'Preview', 'Preview at its foot');
		await shot(p, 'editor-phone-opened');
		await choose(p, 'heading-alignment', 'At the left');
		await choose(p, 'scene-break', '⁂');
		t.eq(await note(p), 'Built in · 2 changes Reset', 'a change is kept and counted');
		await shot(p, 'editor-phone-changed');
		await tapEl(p, `document.querySelector('${ED} .binders-export-phone-row button')`);
		await until(p, `!!document.querySelector('${EBOOK} .binders-export-heading')`, 6000);
		t.eq(await p.ev(`getComputedStyle([...document.querySelectorAll('${EBOOK} .mod-chapter .binders-export-heading')][0]).textAlign`), 'start', 'Preview: the book with the change');
		await shot(p, 'editor-phone-preview');
		await tapEl(p, `document.querySelector('${WIN} .modal-setting-back-button')`);
		await until(p, `!!document.querySelector('${ED} .input-row')`, 6000);
		t.eq(await note(p), 'Built in · 2 changes Reset', 'back from the preview: the editor, as it was left');
		await tapEl(p, key('style-more'));
		await until(p, `!!document.querySelector('.menu')`);
		t.eq((await menuItems(p)).join('|'), 'Duplicate|Reset to the original|Share this style...|Add a style from a file...', 'its menu on a phone: Share, and no file to show');
		await p.key('Escape');
		await p.sleep(300);
		await tapEl(p, key('style-reset'));
		await p.sleep(500);
		t.eq(await note(p), 'Built in', 'Reset by touch');
		await tapEl(p, key('style-back'));
		await until(p, `!!document.querySelector('${WIN} [role="option"]')`, 6000);
		t.ok(true, 'and back to the choices');
	});
	await clear(p);
	same(t, before, await texts(p));
}) });
