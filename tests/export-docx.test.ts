import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, resolve as abs } from 'path';
// @ts-expect-error a plain module, without types
import { plan, prose, rng } from '../scripts/demo-vault/build.mjs';
import { buildBook } from '../src/export/book';
import { headingLines, keyword, roundedWords, surname, writeDocx } from '../src/export/docx';
import { MANUSCRIPT_STYLES, esc } from '../src/export/docx-parts';
import { bookWords, type Picture } from '../src/export/model';
import { pictureOf } from '../src/export/picture';
import type { SourceItem } from '../src/export/roles';
import { parts } from '../src/scene-text';
import { bindersOf, type Files, type TestBinder } from './export-vault';
import { ROWS_INNER, ROWS_TEXT, bigBinder, read } from './export-fixtures';
import { firstDifference, readDocx, sourceWords, tokens } from './export-words';
import { done, eq, ok } from './harness';

const [STANDARD, COURIER, PLAIN] = MANUSCRIPT_STYLES;
const WHEN = new Date('2026-10-05T12:00:00Z');
const note = (name: string, text: string, more: Partial<SourceItem> = {}): SourceItem => ({ kind: 'note', name, path: `${name}.md`, text, included: true, ...more });
const folder = (name: string, children: SourceItem[]): SourceItem => ({ kind: 'folder', name, path: name, included: true, children });

/** What must hold of any .docx this writer makes: a package Word can open. */
function sound(bytes: Uint8Array, what: string): void {
	const { files, raw } = readDocx(bytes), types = files['[Content_Types].xml'] ?? '', styles = files['word/styles.xml'] ?? '', doc = files['word/document.xml'] ?? '', notes = files['word/footnotes.xml'] ?? '';
	const problems: string[] = [];
	for (const name of Object.keys(raw)) {
		if (name === '[Content_Types].xml') continue;
		const ext = name.split('.').pop() ?? '';
		if (!types.includes(`PartName="/${name}"`) && !types.includes(`Extension="${ext}"`)) problems.push(`${name} has no content type`);
	}
	for (const [part, rels] of [['word/document.xml', 'word/_rels/document.xml.rels'], ['word/footnotes.xml', 'word/_rels/footnotes.xml.rels']]) {
		const ids = new Map([...(files[rels] ?? '').matchAll(/Id="([^"]+)"[^>]*?Target="([^"]+)"([^>]*)/g)].map((m) => [m[1], m] as const));
		for (const [, m] of ids) if (!m[3].includes('External') && !raw[`word/${m[2]}`]) problems.push(`${rels} points at ${m[2]}, which isn't there`);
		for (const m of (files[part] ?? '').matchAll(/r:(?:id|embed)="([^"]+)"/g)) if (!ids.has(m[1])) problems.push(`${part} uses ${m[1]}, which ${rels} doesn't have`);
	}
	const defined = new Set([...styles.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]));
	for (const m of (doc + notes + (files['word/header1.xml'] ?? '')).matchAll(/<w:(?:pStyle|rStyle) w:val="([^"]+)"/g)) if (!defined.has(m[1])) problems.push(`style ${m[1]} isn't defined`);
	const noteIds = new Set([...notes.matchAll(/<w:footnote (?:w:type="\w+" )?w:id="(\d+)"/g)].map((m) => m[1]));
	for (const m of doc.matchAll(/<w:footnoteReference w:id="(\d+)"/g)) if (!noteIds.has(m[1])) problems.push(`footnote ${m[1]} is marked and not there`);
	const nums = new Set([...(files['word/numbering.xml'] ?? '').matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => m[1]));
	for (const m of (doc + notes).matchAll(/<w:numId w:val="(\d+)"/g)) if (!nums.has(m[1])) problems.push(`list ${m[1]} isn't defined`);
	// (well formed: every tag opened is closed, in order)
	for (const [name, xml] of Object.entries(files)) {
		const open: string[] = [];
		for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([\w:]+)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
			if (m[4]) continue;
			if (!m[1]) open.push(m[2]); else if (open.pop() !== m[2]) { problems.push(`${name}: </${m[2]}> closes nothing`); break; }
		}
		if (open.length) problems.push(`${name}: <${open[open.length - 1]}> is never closed`);
		if (/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u.test(xml)) problems.push(`${name} has a character XML can't hold`);
	}
	ok(!problems.length, `${what}: a sound package${problems.length ? ` (${problems.slice(0, 3).join('; ')})` : ''}`);
}

/** The word-for-word test: the words read back out of the file are the words that went in, in order. */
function wordForWord(b: TestBinder, what: string): { words: number; ms: number; bytes: Uint8Array } {
	const t0 = Date.now();
	const book = buildBook(b.items, { title: b.name, author: 'A Writer', matter: false }, b.resolve);
	const bytes = writeDocx(book, STANDARD, { contact: [], words: bookWords(book), when: WHEN });
	const ms = Date.now() - t0;
	const got = readDocx(bytes), want = sourceWords(b.items, book.structure, b.embedded);
	const body = firstDifference(want.body, got.body), notes = firstDifference(want.notes, got.notes);
	ok(!body, `${what}: every word of the text, in order${body ? ` (${body})` : ''}`);
	ok(!notes, `${what}: every word of the footnotes, in order${notes ? ` (${notes})` : ''}`);
	sound(bytes, what);
	return { words: want.body.length + want.notes.length, ms, bytes };
}

// ---- the shape of a manuscript ----
{
	const items = [
		note('Prologue', 'It began.[^1]\n\n[^1]: A *first* note.'),
		folder('Part One', [note('01 The jetty', 'She said "no" -- twice.\n***\nA [link](https://example.com/a?b=1&c=2) and *stress*.'), note('Chapter 2', '> [!note] Mind\n> Quoted.\n\n- one\n- two\n\n1. first\n2. second\n\n| a | b |\n|---|---|\n| c | d |\n\n```\ncode <here>\n```\n\n## Later\n\nEnd.^[Typed in place.]')]),
		note('Dedication', 'For M.'),
	];
	const book = buildBook(items, { title: 'The Lighthouse', author: 'Mara Lindqvist', language: 'en-GB', matter: false });
	const bytes = writeDocx(book, STANDARD, { contact: ['12 Harbour Row', 'mara@example.com'], words: 84321, when: WHEN });
	const d = readDocx(bytes), doc = d.files['word/document.xml'], styles = d.files['word/styles.xml'];
	sound(bytes, 'a manuscript');
	eq(d.headings.join('|'), 'Prologue|Part One|Chapter One The jetty|Chapter Two', 'chapters are Heading 1: numbered in words, a title under its number');
	ok(/<w:pStyle w:val="Title"\/>.*?The Lighthouse/.test(doc) && doc.includes('by Mara Lindqvist') && doc.includes('about 84,000 words') && doc.includes('12 Harbour Row'), 'a title page: contact details, the count rounded, the title, the name');
	ok((d.files['word/header1.xml'] ?? '').includes('Lindqvist / LIGHTHOUSE / ') && d.files['word/header1.xml'].includes(' PAGE '), 'the header: surname, title, the page number');
	ok((doc.match(/<w:sectPr>/g) ?? []).length === 5 && doc.indexOf('headerReference') > doc.indexOf('by Mara') && (doc.match(/<w:pgNumType w:start="1"\/>/g) ?? []).length === 2, 'the title page is a section without a header; each chapter is a section, and the text’s pages are counted from one');
	ok(/<w:pStyle w:val="SceneBreak"\/><\/w:pPr><w:r><w:t[^>]*>#<\/w:t>/.test(doc), 'a scene break is a paragraph of its own style');
	ok(doc.includes('“no” — twice.'), 'quotes and a dash are typeset');
	ok(/<w:rPr><w:i\/><\/w:rPr><w:t[^>]*>stress</.test(doc), 'italics are italic');
	ok(/<w:footnoteReference w:id="2"\/>/.test(doc) && /<w:footnote w:id="2">.*<w:footnoteRef\/>.*first.*note\./.test(d.files['word/footnotes.xml']) && /<w:footnote w:id="3">.*Typed in place\./.test(d.files['word/footnotes.xml']), 'footnotes are Word footnotes');
	ok(/<w:hyperlink r:id="(rId\d+)">/.test(doc) && d.files['word/_rels/document.xml.rels'].includes('Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"'), 'a web link is a link');
	ok(/<w:pStyle w:val="Quote"\/><\/w:pPr><w:r><w:rPr><w:b\/><\/w:rPr><w:t[^>]*>Mind</.test(doc), 'a callout: a quotation, its title in bold');
	ok((doc.match(/<w:numPr>/g) ?? []).length === 4 && /<w:num w:numId="2"><w:abstractNumId w:val="2"\/>/.test(d.files['word/numbering.xml']), 'lists are Word lists, each with its own count');
	ok(/<w:tbl>.*<w:tr>.*<w:tr>.*<\/w:tbl>/.test(doc) && doc.includes('code &lt;here&gt;') && /<w:pStyle w:val="Heading2"\/>.*Later/.test(doc), 'a table, code and a subheading');
	ok(styles.includes('w:ascii="Times New Roman"') && styles.includes('w:line="480"') && styles.includes('<w:ind w:firstLine="720"/>') && styles.includes('<w:lang w:val="en-GB"/>'), 'Times, double-spaced, a half-inch indent, in the book’s language');
	ok(/<w:styleId="Heading1"|w:styleId="Heading1"><w:name w:val="heading 1"\/>.*?<w:pageBreakBefore\/><w:spacing w:before="4320"/.test(styles), 'a chapter opens a new page, a third of the way down');
	ok((d.files['docProps/core.xml'] ?? '').includes('<dc:title>The Lighthouse</dc:title><dc:creator>Mara Lindqvist</dc:creator>'), 'the file’s own title and author');
	ok(!doc.includes('For M.') && readDocx(writeDocx(buildBook(items, { title: 'T', author: '', matter: true }), STANDARD, { contact: [], words: 10 })).headings.includes('Dedication'), 'front and back matter only when asked for');

	const courier = readDocx(writeDocx(book, COURIER, { contact: [], words: 1, when: WHEN }));
	ok(courier.files['word/styles.xml'].includes('w:ascii="Courier New"') && /<w:rPr><w:u w:val="single"\/><\/w:rPr><w:t[^>]*>stress</.test(courier.files['word/document.xml']), 'the Courier style underlines italics');
	const plain = readDocx(writeDocx(book, PLAIN, { contact: [], words: 1, when: WHEN }));
	ok(!plain.files['word/header1.xml'] && !plain.files['word/document.xml'].includes('w:val="Title"') && plain.files['word/styles.xml'].includes('w:line="240"') && plain.files['word/document.xml'].includes('>***<'), 'the typesetter’s style: single-spaced, no title page or header, *** breaks');
	sound(writeDocx(book, PLAIN, { contact: [], words: 1 }), 'the typesetter’s style');
	eq([roundedWords(1474), roundedWords(40), roundedWords(84321), roundedWords(19949)].join(), '1500,100,84000,19900', 'the count is rounded');
	eq([keyword('The Lighthouse'), keyword('A Salt Road'), surname('Mara Lindqvist'), surname('')].join('|'), 'LIGHTHOUSE|SALT ROAD|Lindqvist|', 'the header’s words');
	eq(headingLines({ id: 'part-2', role: 'part', number: 2, title: 'The Island', blocks: [], paths: [] }).join('|'), 'Part Two|The Island', 'a part’s heading');
	eq(esc('a<b>&"\u0001\uD800'), 'a&lt;b&gt;&amp;&quot;', 'text is made safe for XML');
	sound(writeDocx(buildBook([], { title: 'Empty', author: '', matter: false }), STANDARD, { contact: [], words: 0 }), 'an empty binder');
}

// ---- pictures; a footnote marked twice; a footnote in a footnote ----
{
	const png = new Uint8Array(40);
	png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0, 0, 0, 3, 0]);
	const pic = pictureOf(png) as Picture;
	const book = buildBook([note('A', 'Before.\n\n![[map.png]]\n\nOnce[^n] and again[^n].^[Outer, with one inside.[^n]]\n\n[^n]: The note.')], { title: 'T', author: '', matter: false }, { embed: () => ({ picture: pic }) });
	const bytes = writeDocx(book, STANDARD, { contact: [], words: 5, when: WHEN }), d = readDocx(bytes);
	sound(bytes, 'a picture');
	ok(!!d.raw['word/media/image1.png'] && d.files['[Content_Types].xml'].includes('Extension="png"') && /<wp:extent cx="5943600" cy="4457700"\/>/.test(d.files['word/document.xml']), 'a picture is in the file, no wider than the text');
	eq((d.files['word/document.xml'].match(/<w:footnoteReference /g) ?? []).length, 2, 'a footnote marked twice is one footnote');
	ok(tokens(d.files['word/footnotes.xml'].replace(/<[^>]+>/g, ' ')).join(' ').includes('Outer with one inside The note'), 'a footnote in a footnote is set in its place');
}

// ---- word for word: the test vault ----
const results: string[] = [];
let sample: Uint8Array | null = null;
{
	const binders = bindersOf(read('test-vault'));
	ok(binders.some((b) => b.name === 'The Lighthouse'), 'the test vault’s binder is found');
	for (const b of binders) { const r = wordForWord(b, `test vault, ${b.name}`); results.push(`${b.name}: ${r.words} words, ${r.ms} ms`); if (b.name === 'The Lighthouse') sample = r.bytes; }
}

// ---- word for word: every row of "What Markdown becomes", in one note ----
{
	const text = ROWS_TEXT;
	const inner = ROWS_INNER;
	const b: TestBinder = { folder: 'Rows', name: 'Rows', items: [folder('One', [note('Every row', parts(text).body), note('After', 'The scene after.')])], resolve: { embed: (t) => (t === 'Inner note' ? { text: inner } : null) }, embedded: (t) => (t === 'Inner note' ? inner : null) };
	const r = wordForWord(b, 'every row of the table');
	ok(r.words > 150, `it has its words (${r.words})`);
}

// ---- word for word: the demo vault's extremes ----
{
	const binders = bindersOf(plan({}) as Files);
	ok(binders.length > 10, `the demo vault’s binders are found (${binders.length})`);
	let words = 0, ms = 0;
	for (const b of binders) { const r = wordForWord(b, `demo vault, ${b.name}`); words += r.words; ms += r.ms; }
	results.push(`demo vault, ${binders.length} binders: ${words} words, ${ms} ms`);
}

// ---- word for word, and in time: a binder of 150,000 words ----
{
	const items = bigBinder();
	const big: TestBinder = { folder: 'Big', name: 'A long book', items, resolve: {}, embedded: () => null };
	const r = wordForWord(big, 'a binder of 150,000 words');
	ok(r.words > 150000, `it has its words (${r.words})`);
	ok(r.ms < 10000, `read and written in under ten seconds (${r.ms} ms)`);
	results.push(`150,000-word binder: ${r.words} words, ${r.ms} ms, ${Math.round(r.bytes.length / 1024)} kB`);
}
// the test itself would notice: a paragraph taken out of the file, or two changing places, is a difference
{
	const b = bindersOf(read('test-vault')).find((x) => x.name === 'The Lighthouse') as TestBinder;
	const book = buildBook(b.items, { title: b.name, author: '', matter: false }, b.resolve), want = sourceWords(b.items, book.structure, b.embedded);
	const whole = buildBook(b.items, { title: b.name, author: '', matter: false }, b.resolve);
	whole.sections[whole.sections.length - 1].blocks.pop();
	ok(!!firstDifference(want.body, readDocx(writeDocx(whole, STANDARD, { contact: [], words: 1 })).body), 'a dropped paragraph is noticed');
	const swapped = buildBook(b.items, { title: b.name, author: '', matter: false }, b.resolve), last = swapped.sections.length - 1;
	[swapped.sections[last], swapped.sections[last - 1]] = [swapped.sections[last - 1], swapped.sections[last]];
	ok(!!firstDifference(want.body, readDocx(writeDocx(swapped, STANDARD, { contact: [], words: 1 })).body), 'two sections out of order are noticed');
}
console.log(`  word for word: ${results.join('; ')}`);

// ---- other readers of the same file: xmllint (well formed) and LibreOffice (opens it and makes a PDF of it) ----
{
	const has = (cmd: string) => spawnSync('which', [cmd]).status === 0;
	const out = abs('test-dist/export-docx');
	rmSync(out, { recursive: true, force: true });
	mkdirSync(out, { recursive: true });
	if (sample) writeFileSync(join(out, 'The Lighthouse.docx'), sample);
	if (sample && has('xmllint')) {
		let bad = '';
		for (const [name, xml] of Object.entries(readDocx(sample).files)) { const f = join(out, name.replace(/[\\/[\]]/g, '_')); writeFileSync(f, xml); if (spawnSync('xmllint', ['--noout', f]).status !== 0) bad += ` ${name}`; }
		ok(!bad, `xmllint reads every part${bad}`);
	} else console.log('  (xmllint isn’t installed: not run)');
	if (sample && has('soffice') && !process.env.BINDERS_NO_SOFFICE) {
		try { execFileSync('soffice', [`-env:UserInstallation=file://${join(out, 'profile')}`, '--headless', '--convert-to', 'pdf', '--outdir', out, join(out, 'The Lighthouse.docx')], { stdio: 'ignore', timeout: 120000 }); } catch { /* said below */ }
		const pdf = join(out, 'The Lighthouse.pdf');
		ok(existsSync(pdf) && statSync(pdf).size > 1000, 'LibreOffice opens the file and makes a PDF of it');
	} else console.log('  (LibreOffice isn’t installed, or BINDERS_NO_SOFFICE is set: not run)');
}

done('export docx');
