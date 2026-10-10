// QA round 11, export smoke after the paragraph and find work: a binder whose notes have tab-led paragraphs (Indent
// paragraphs on and off), links with shown words, tags, comments, code, footnotes and highlights, read back from the
// files the export writes (EPUB, Word and PDF), after a Replace all, and Export again on the last settings. Helpers
// come from specs-export.mjs and view-helpers.mjs. Tests are named "qa11 export smoke: …". Every test edits only
// Part One/Arrival.md (its properties are kept) and the test vault is reset after each test.
import { spawnSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { PL, VIEW, j, openView, read, split, until, withTidy, writeRaw } from './view-helpers.mjs';
import { WIN, asked, closeAll, docx, epub, onMobile, open, open2, pick, press, run, saved, status, standIn, tapEl, button } from './specs-export.mjs';

export const specs = [];
const ARRIVAL = 'The Lighthouse/Part One/Arrival.md';

const test = (name, fn) => specs.push({ name: 'qa11 export smoke: ' + name, fn: withTidy(async (p, h, t) => {
	await standIn(p);
	try { await fn(p, h, t); } finally {
		await closeAll(p);
		await p.ev(`(() => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; return 1; })()`);
	}
}) });

/** The body of Arrival, as typed: its properties stay as they are. */
async function setBody(p, lines) {
	const cur = await read(p, ARRIVAL), m = /^---\n[\s\S]*?\n---\n/.exec(cur);
	await writeRaw(p, ARRIVAL, (m ? m[0] : '') + lines.join('\n') + '\n');
	await p.sleep(300);
}
/** The export window, the kind chosen, Export pressed; the file's path once the window says it is saved. */
async function exportAs(p, kind, name) {
	await open(p);
	if (kind !== 'Manuscript') await pick(p, kind);
	await press(p, 'Export');
	if (!(await saved(p))) throw new Error(`no save for ${kind}: “${await status(p)}”`);
	await closeAll(p);
	return join(p.vaultDir, 'Exports', name);
}
const flat = (s) => s.replace(/\s+/g, ' ');
/** The XML of a part inside a Word or EPUB file, read here. */
const part = (path, name) => { const z = unzipSync(new Uint8Array(readFileSync(path))); return z[name] ? strFromU8(z[name]) : ''; };
/** Every chapter of an EPUB, as XHTML. */
const xhtml = (path) => { const e = epub(path); return e.names.filter((n) => /\.xhtml$/.test(n)).map((n) => e.x(n)).join('\n'); };
/** Replace all across the binder, as a person does: the bar, Replace all, the review's button. */
async function replaceAll(p, from, to) {
	await openView(p, 'The Lighthouse');
	await p.ev(`(async () => {
		const v = ${VIEW};
		if (!v.findBar) v.showSearch(true); else v.findBar.setReplacing(true);
		const b = v.findBar;
		if (b.options.matchCase !== false) b.options = { matchCase: false };
		b.input.value = ${j(from)}; b.by.value = ${j(to)};
		await b.search();
	})().then(() => 1)`);
	await p.sleep(250);
	await p.ev(`(() => { window.__all = ${VIEW}.findBar.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review button.mod-cta')`, 6000);
	await p.sleep(200);
	await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); return 1; })()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(500);
}
const setIndent = (p, on) => p.ev(`(async () => { ${PL}.settings.indentParagraphs = ${j(on)}; await ${PL}.saveData(${PL}.settings); return 1; })().then(() => 1)`);

const LINES_A = [
	'\tThe supply boat left Mara on the jetty with two cases.',
	'\tShe had not opened the letter.',
	'    Four spaces lead this one, and it is a paragraph too.',
	'Last line of the note.',
];
const LINES_C = [
	'The letter named [[Storm warning|the storm]] and [[The keeper]] by name.',
	'A [[Lights out#Night|night]] shows up here.',
	'\t[[Prologue|the prologue]] is tab-led too.',
];
const LINES_D = [
	'Begin the scene.',
	'#draft',
	'The lamp was lit %% a note to self %% at dusk.',
	'<!-- html comment hidden -->',
	'The tide <!-- inline html --> turned.',
	'A #lantern in the window.',
	'%%',
	'\tTHIS BLOCK IS HIDDEN',
	'%%',
	'After the block.',
];

// ---- 1. Adversarial: tab-led paragraphs, Indent paragraphs on and off ----
test('Indent paragraphs on or off: the Word file is the same, and no paragraph keeps the tab or spaces that began it', async (p, h, t) => {
	await setBody(p, LINES_A);
	await setIndent(p, false);
	const off = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	await p.sleep(1100);
	await setIndent(p, true);
	const on = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.eq(JSON.stringify(on.all), JSON.stringify(off.all), 'Indent paragraphs on writes the same Word text as off');
	t.ok(off.body.includes('The supply boat left Mara on the jetty with two cases.'), 'the tab-led line is a paragraph of its own, its words whole');
	t.ok(off.body.includes('Four spaces lead this one, and it is a paragraph too.'), 'a line begun with four spaces is a paragraph too, its spaces dropped');
	t.ok(off.body.every((x) => !/^\s/.test(x)), 'no paragraph of the book begins with a space or a tab');
	t.ok(off.body.includes('Last line of the note.'), 'the line after them is there');
});

test('EPUB of tab-led paragraphs: no tab or spaces at the start of any paragraph, and the words in order', async (p, h, t) => {
	await setBody(p, LINES_A);
	const at = await exportAs(p, 'Ebook', 'The Lighthouse.epub');
	const x = xhtml(at);
	t.ok(!x.includes('\t'), 'no tab character in the chapters');
	t.ok(!/<p(\s[^>]*)?>[ \t]/.test(x), 'no paragraph begins with a space');
	t.ok(flat(epub(at).body).includes('The supply boat left Mara on the jetty with two cases. She had not opened the letter.'), 'the two tab-led lines read on in order');
});

// ---- 2. Adversarial: tab-led tags, comments, scene breaks ----
test('a tab-led line that is only a tag or a comment is left out, and the *** break between tab-led paragraphs holds', async (p, h, t) => {
	await setBody(p, [
		'Ends the first paragraph.',
		'\t#draft',
		'\t%% hidden tab comment %%',
		'\t[[Prologue|the prologue]] opens a tab-led line.',
		'\t`code span` in a tab line.',
		'***',
		'\tAfter the break.',
	]);
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.ok(d.body.includes('Ends the first paragraph.'), 'the line before is there');
	t.ok(d.body.includes('the prologue opens a tab-led line.'), 'a tab-led line with a link shows its words');
	t.ok(d.body.includes('code span in a tab line.'), 'a tab-led line with code shows its words');
	t.ok(d.body.includes('After the break.'), 'the paragraph after the break is there');
	t.ok(!d.all.includes('draft') && !d.all.includes('hidden tab'), 'a tab-led tag or comment alone on its line is not in the book');
	t.ok(!d.all.includes('***'), 'the *** break is a break, not the literal asterisks');
	t.ok(!d.all.includes('[['), 'no wikilink brackets are left');
});

// ---- 3. Tags and comments in Word, EPUB and PDF ----
test('comments and tags: in Word the sentences come out whole, a comment between words leaves one space, and a hidden block is gone', async (p, h, t) => {
	await setBody(p, LINES_D);
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.ok(d.body.includes('Begin the scene.'), 'the line before the tag');
	t.ok(d.body.includes('The lamp was lit at dusk.'), 'a comment in the middle of a sentence: the sentence is whole, one space each side');
	t.ok(d.body.includes('The tide turned.'), 'an HTML comment in the middle of a sentence: the same');
	t.ok(d.body.includes('A #lantern in the window.'), 'a tag inside a sentence is kept as typed');
	t.ok(d.body.includes('After the block.'), 'the line after the hidden block');
	t.ok(!d.all.includes('draft') && !d.all.includes('note to self') && !d.all.includes('html comment') && !d.all.includes('HIDDEN'), 'no comment, no tag alone, and no hidden block is in the book');
});

test('comments and tags in the EPUB: the same sentences, and none of the hidden words in any chapter', async (p, h, t) => {
	await setBody(p, LINES_D);
	const at = await exportAs(p, 'Ebook', 'The Lighthouse.epub');
	const text = flat(epub(at).body), x = xhtml(at);
	t.ok(text.includes('The lamp was lit at dusk.'), 'the sentence with a comment in it, whole');
	t.ok(text.includes('The tide turned.'), 'the sentence with an HTML comment in it, whole');
	t.ok(!/draft|note to self|html comment|HIDDEN|%%|<!--/.test(x), 'nothing hidden or left as markup in the chapters');
});

test('comments in the PDF, and Indent paragraphs changes no word of the PDF', async (p, h, t) => {
	await setBody(p, LINES_D.concat(['\tA tab-led line after all.']));
	const pdfText = (path) => flat(spawnSync('pdftotext', ['-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout);
	await setIndent(p, false);
	const off = pdfText(await exportAs(p, 'Paperback', 'The Lighthouse.pdf'));
	await p.sleep(1100);
	await setIndent(p, true);
	const on = pdfText(await exportAs(p, 'Paperback', 'The Lighthouse.pdf'));
	t.ok(off.length > 0, 'the PDF has text (pdftotext ran)');
	t.ok(off.includes('The lamp was lit at dusk.'), 'the sentence with a comment in it, whole');
	t.ok(off.includes('A tab-led line after all.'), 'the tab-led paragraph is in the PDF');
	t.ok(!/draft|note to self|html comment|HIDDEN|%%|<!--/.test(off), 'nothing hidden in the PDF');
	t.eq(on, off, 'Indent paragraphs on: the same words on the pages');
});

// ---- 4. Links with shown words ----
test('links with shown words: in Word and the EPUB the shown words, never the brackets or the target', async (p, h, t) => {
	await setBody(p, LINES_C);
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.ok(d.body.includes('The letter named the storm and The keeper by name.'), 'a link with words shows the words; a plain link shows the note’s name');
	t.ok(d.body.includes('A night shows up here.'), 'a link to a heading in a note shows its words');
	t.ok(d.body.includes('the prologue is tab-led too.'), 'a tab-led line with a link');
	t.ok(!d.all.includes('[[') && !d.all.includes('Storm warning|') && !d.all.includes('#Night'), 'no brackets, pipe or heading target left in the Word file');
	const at = await exportAs(p, 'Ebook', 'The Lighthouse.epub');
	t.ok(flat(epub(at).body).includes('The letter named the storm and The keeper by name.'), 'the same words in the EPUB');
	t.ok(!xhtml(at).includes('[['), 'and no brackets in the EPUB chapters');
});

test('a Markdown link: its words and a link in Word and EPUB; the address in the Word relations, not in the text', async (p, h, t) => {
	await setBody(p, ['See [the lighthouse site](https://example.com/light) for more.']);
	const at = await exportAs(p, 'Manuscript', 'The Lighthouse.docx');
	const d = docx(at);
	t.ok(d.body.includes('See the lighthouse site for more.'), 'the words of the link are in the text');
	t.ok(!d.all.includes('https://'), 'the address is not printed in the text');
	t.ok(part(at, 'word/_rels/document.xml.rels').includes('https://example.com/light'), 'and the link is a Word hyperlink to that address');
	const e = await exportAs(p, 'Ebook', 'The Lighthouse.epub');
	t.ok(xhtml(e).includes('href="https://example.com/light"'), 'in the EPUB the link is a link to the address');
});

// ---- 5. Code and footnotes ----
test('code: a fenced block and a code span keep their text as typed, comments and links included, and the Word file gives them a monospaced style', async (p, h, t) => {
	await setBody(p, [
		'Before the code.',
		'```',
		'let x = [[Arrival]]; // %% kept %%',
		'```',
		'The sign said `%% kept %%` here, and `[[Arrival]]` too.',
		'After the code.',
	]);
	const at = await exportAs(p, 'Manuscript', 'The Lighthouse.docx');
	const d = docx(at);
	t.ok(d.all.includes('let x = [[Arrival]]; // %% kept %%'), 'the fenced block is there as typed');
	t.ok(d.body.includes('The sign said %% kept %% here, and [[Arrival]] too.'), 'the code span is as typed too');
	t.ok(!d.all.includes('```'), 'no fence marks are printed');
	const codePara = d.paras.find((x) => x.text.includes('let x'));
	const styleDef = codePara ? (new RegExp(`w:styleId="${codePara.style}"[\\s\\S]*?</w:style>`).exec(part(at, 'word/styles.xml'))?.[0] ?? '') : '';
	t.ok(!!codePara && (/Courier|Mono|Consol/.test(styleDef) || /Courier|Mono|Consol/.test(part(at, 'word/document.xml'))), 'the code paragraph is set in a monospaced face (style “' + (codePara?.style || 'none') + '”)');
	const e = await exportAs(p, 'Ebook', 'The Lighthouse.epub');
	t.ok(/<pre[^>]*>[\s\S]*?let x = \[\[Arrival\]\]; \/\/ %% kept %%[\s\S]*?<\/pre>/.test(xhtml(e)), 'the EPUB has the fenced block in a pre element, as typed');
	t.ok(/<code[^>]*>[^<]*%% kept %%[^<]*<\/code>/.test(xhtml(e)), 'and the code span in a code element');
});

test('footnotes and highlights: the notes are at the foot of the Word file, the marks and the == are gone', async (p, h, t) => {
	await setBody(p, [
		'A mark[^1] sits in the text, ==bright words== too, and an aside^[inline note here] follows.',
		'',
		'[^1]: The footnote itself.',
	]);
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.ok(d.body.includes('A mark sits in the text, bright words too, and an aside follows.'), 'the marks and the highlight’s == are gone; the words stay');
	t.ok(d.notes.includes('The footnote itself.') && d.notes.includes('inline note here'), 'both notes are in the Word file’s footnotes');
	t.ok(!d.all.includes('[^1]') && !d.all.includes('==') && !d.all.includes('^['), 'no note syntax is printed in the text');
});

// ---- 6. After Replace all, and Export again ----
test('Replace all, then Export: the Word file has the replaced words, and no old word in the text', async (p, h, t) => {
	await setBody(p, LINES_A);
	await replaceAll(p, 'Mara', 'Maren');
	t.ok((await read(p, ARRIVAL)).includes('left Maren on the jetty'), 'the note on disk has the replacement');
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.ok(d.body.includes('The supply boat left Maren on the jetty with two cases.'), 'the tab-led paragraph in the Word file says Maren');
	t.ok(!/\bMara\b/.test(d.all), 'no Mara is left in the book');
	t.ok(d.body.every((x) => !/^\s/.test(x)), 'and the tab-led paragraphs still begin with no space');
});

test('Export again after Replace all: the EPUB is written again with the replaced words, with the same choices, and nothing is asked', async (p, h, t) => {
	await setBody(p, [
		'\tThe lamp was lit at the top.',
		'The lamp went out at dawn.',
	]);
	const at = await exportAs(p, 'Ebook', 'The Lighthouse.epub');
	const first = statSync(at).mtimeMs;
	t.ok(flat(epub(at).body).includes('The lamp went out at dawn.'), 'first: the EPUB has the old words');
	await closeAll(p);
	await replaceAll(p, 'lamp', 'beacon');
	await p.sleep(1100);
	await openView(p, 'The Lighthouse');
	await run(p, 'export-again');
	for (let i = 0; i < 60 && statSync(at).mtimeMs <= first; i++) await p.sleep(250);
	t.ok(statSync(at).mtimeMs > first, 'Export again wrote the file again');
	const text = flat(epub(at).body);
	t.ok(text.includes('The beacon went out at dawn.') && text.includes('The beacon was lit at the top.'), 'the EPUB has the replaced words');
	t.ok(!/\blamp\b/.test(text), 'and no old word is left');
	t.eq((await asked(p)).length, 1, 'and the save dialog was not opened a second time');
});

// ---- 7. A phone, touch ----
test('a phone: an EPUB with tab-led paragraphs goes to Exports and the share sheet, with no tab in its chapters', async (p, h, t) => {
	await setBody(p, LINES_A);
	await onMobile(p, 390, 844, async () => {
		await p.ev(`(() => { window.__shared = []; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared.push(d.files[0].name); }; return 1; })()`);
		await open2(p);
		await tapEl(p, `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.textContent.startsWith('Ebook'))`);
		await p.sleep(800);
		await tapEl(p, `[...document.querySelectorAll('${WIN} .binders-export-phone-row button')].find(b => b.textContent === 'Export')`);
		t.ok(await until(p, `window.__shared.length === 1`, 12000), 'the EPUB is handed to the share sheet');
		t.eq(await p.ev(`window.__shared[0]`), 'The Lighthouse.epub', 'and it is the EPUB');
		const at = join(p.vaultDir, 'Exports', 'The Lighthouse.epub');
		t.ok(await until(p, `app.vault.adapter.exists('Exports/The Lighthouse.epub')`, 4000), 'and it is in Exports in the vault');
		const x = xhtml(at);
		t.ok(!x.includes('\t') && !/<p(\s[^>]*)?>[ \t]/.test(x), 'no tab or leading space in the chapters, as on the computer');
		t.ok(flat(epub(at).body).includes('The supply boat left Mara on the jetty'), 'and the words are there');
		await closeAll(p);
	});
});

// ---- 8. Edge: a binder with a note that is only tab-led paragraphs, and Indent paragraphs on, straight to Word ----
test('Indent paragraphs on, a note of tab-led lines only: the Word file has its words and no empty paragraph run of tabs', async (p, h, t) => {
	await setBody(p, ['\t\tA doubly indented line.', '\t\t\tA triply indented line.', '\t']);
	await setIndent(p, true);
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.ok(d.body.includes('A doubly indented line.') && d.body.includes('A triply indented line.'), 'both lines are paragraphs, their tabs dropped');
	t.ok(!d.body.some((x) => /\t/.test(x)), 'no tab is printed in any paragraph');
	t.ok(!d.body.some((x) => x.trim() === ''), 'and no empty paragraph is left where the tabs were');
});

// ---- 9. The replacement as typed: no pattern of the replace is expanded, and a PDF is written again ----
test('Replace all with “$&” in the new text: the words go in as typed, and the Word file has them so', async (p, h, t) => {
	await setBody(p, ['\tThe lamp was lit.', 'The lamp went out.']);
	await replaceAll(p, 'lamp', 'lamp $& x');
	t.eq(JSON.stringify(split(await read(p, ARRIVAL)).body), JSON.stringify('\tThe lamp $& x was lit.\nThe lamp $& x went out.\n'), 'the note on disk has the replacement as typed, the tab kept');
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.eq(JSON.stringify(d.body.filter((x) => /was lit|went out/.test(x))), JSON.stringify(['The lamp $& x was lit.', 'The lamp $& x went out.']), 'the two paragraphs have it literally, in the Word file');
});

test('Export again of a PDF after Replace all: the pages are written again with the replaced words', async (p, h, t) => {
	await setBody(p, ['\tThe lamp was lit at the top.', 'The lamp went out at dawn.']);
	const pdfText = (path) => flat(spawnSync('pdftotext', ['-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout);
	const at = await exportAs(p, 'Paperback', 'The Lighthouse.pdf');
	const first = statSync(at).mtimeMs;
	t.ok(pdfText(at).includes('The lamp went out at dawn.'), 'first: the PDF has the old words');
	await closeAll(p);
	await replaceAll(p, 'lamp', 'beacon');
	await p.sleep(1100);
	await openView(p, 'The Lighthouse');
	await run(p, 'export-again');
	for (let i = 0; i < 60 && statSync(at).mtimeMs <= first; i++) await p.sleep(250);
	t.ok(statSync(at).mtimeMs > first, 'Export again wrote the PDF again');
	const text = pdfText(at);
	t.ok(text.includes('The beacon went out at dawn.') && text.includes('The beacon was lit at the top.'), 'the PDF has the replaced words');
	t.ok(!/\blamp\b/.test(text), 'and no old word is left in it');
	t.eq((await asked(p)).length, 1, 'and the save dialog was not opened a second time');
});


// ---- 10. Typed in the note, then Export at once: the typed words are in the book ----
test('words typed in the note a moment before Export are in the Word file (the editor’s text is not yet on disk)', async (p, h, t) => {
	await setBody(p, LINES_A);
	await p.ev(`(async () => { await app.workspace.getLeaf(true).openFile(app.vault.getAbstractFileByPath(${j(ARRIVAL)})); return 1; })().then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .cm-content')`, 5000);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, n = ed.lineCount() - 1; ed.setCursor({ line: n, ch: ed.getLine(n).length }); document.querySelector('.workspace-leaf.mod-active .cm-content').focus(); return 1; })()`);
	await p.sleep(200);
	await p.type(' Typed just before export.');
	const at = await exportAs(p, 'Manuscript', 'The Lighthouse.docx');
	const d = docx(at);
	t.ok(d.body.some((x) => x.includes('Last line of the note.')), 'the note’s text is in the book');
	t.ok(d.all.includes('Typed just before export.'), 'the words typed a moment before Export are in the book');
	t.eq(await p.ev(`app.vault.adapter.read(${j(ARRIVAL)}).then(x => x.includes('Typed just before export.'))`), true, 'and they are on disk');
});

// ---- 11. Replace all, then the bar’s Undo: the book has the old words again ----
test('Replace all, then the bar’s Undo: the Word file has the old words again, and no replacement', async (p, h, t) => {
	await setBody(p, LINES_A);
	await replaceAll(p, 'Mara', 'Maren');
	t.ok((await read(p, ARRIVAL)).includes('left Maren on'), 'replaced on disk');
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { document.querySelector('.workspace-leaf.mod-active .binders-view .binders-find .binders-find-undo').click(); return 1; })()`);
	await p.sleep(1000);
	t.ok((await read(p, ARRIVAL)).includes('left Mara on'), 'Undo put the note back on disk');
	const d = docx(await exportAs(p, 'Manuscript', 'The Lighthouse.docx'));
	t.ok(d.body.includes('The supply boat left Mara on the jetty with two cases.'), 'the Word file has the old words, the tab-led paragraph whole');
	t.ok(!d.all.includes('Maren'), 'and no replacement is left in it');
});
