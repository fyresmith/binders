import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { zipSync, strToU8 } from 'fflate';
import { DEFAULT_SETTINGS } from '../src/settings-data';
import { events } from '../src/docx/xml';
import { readPackage } from '../src/docx/package';
import { readDocx } from '../src/docx/read';
import { settle } from '../src/docx/settle';
import { readWord } from '../src/import/docx';
import { planManuscript, type ManuscriptOptions } from '../src/import/manuscript';
import type { ImportPlan } from '../src/import/plan';
import { runsToMarkdown } from '../src/import/markdown';
import { firstDifference, tokens } from './export-words';
import { docxWords, plannedWords } from './import-words';
import { NS, STYLES, br, comment, del, docx, esc, footnote, ins, mark, p, r, words } from './import-docx-fixtures';
import { readdirSync } from 'fs';
import { ok, eq, done } from './harness';

/* The Word import (src/docx/, src/import/docx.ts) on files written by hand: the reader, each way a file can say where
   a chapter starts (R0 to R6 reached through Word), the dialect quirks, and the word-for-word test, which compares
   the importer's words with a second reader's that shares no code with it (tests/import-words.ts). */

const settings = { ...DEFAULT_SETTINGS };
const read = (bytes: Uint8Array, tabs = true) => readWord(bytes, 'Book.docx', { bytes }, { tabs });
const make = (bytes: Uint8Array, o: Partial<ManuscriptOptions> & { tabs?: boolean } = {}) => planManuscript(read(bytes, o.tabs ?? true), { name: 'Book', parent: '', settings, choices: {}, scenes: 'words', ...o });
const rows = (plan: ImportPlan) => plan.notes.slice(1).filter((n) => n.title !== 'Research').map((n) => `${'  '.repeat(n.depth - 1)}${n.title}${n.folder ? '/' : ''}`).join('\n');
const throws = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof Error ? e.message : String(e); } return ''; };
/** The word-for-word check: a second reader's words of the file against the plan's. */
function same(bytes: Uint8Array, plan: ImportPlan, what: string): void {
	const want = docxWords(bytes), got = plannedWords(plan);
	const body = firstDifference(want.body, got.body), notes = firstDifference(want.notes, got.notes);
	ok(!body, `${what}: every word, in order${body ? ` (${body})` : ''}`);
	ok(!notes, `${what}: every word of the footnotes, in order${notes ? ` (${notes})` : ''}`);
}
const H = (text: string, level = 1) => p(text, { style: `Heading${level}` });
const body = (seed: string, n = 120) => p(words(n, seed));

// ---- XML ----
{
	const list = [...events('<?xml version="1.0"?><a x="1 &amp; 2"><!-- c --><b/>t&#233;&#x20AC;<![CDATA[<raw>]]></a>')].map((e) => (e.t === 'text' ? `"${e.text}"` : e.t === 'open' ? `<${e.name}${JSON.stringify(e.attrs)}` : `/${e.name}`));
	eq(list.join(' '), '<a{"x":"1 & 2"} <b{} /b "té€" "<raw>" /a', 'xml: events, entities, CDATA, comments');
	for (const [bad, why] of [['<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x/>', 'a DOCTYPE'], ['<x>&unknown;</x>', 'an unknown entity'], ['<a><b></a>', 'a mismatched tag'], ['<a>', 'text left open'], ['<a>&#xD800;</a>', 'a surrogate'], ['<a b=1/>', 'an unquoted attribute']]) ok(!!throws(() => [...events(bad)]), `xml: ${why} is refused`);
	let n = 0;
	for (const _e of events(`<a>${'<b>x</b>'.repeat(100000)}</a>`)) n++;
	eq(n, 100000 * 3 + 2, 'xml: a long part is read as a stream of events');
}

// ---- the package ----
{
	eq(throws(() => readPackage(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))), 'This is an older Word file (.doc), or one locked with a password. In Word, save it as .docx with no password, then choose that.', 'package: an older or locked file is refused in plain words');
	eq(throws(() => readPackage(strToU8('Just some text, not a zip.'))), 'This isn’t a Word file (.docx).', 'package: not a zip');
	eq(throws(() => readPackage(zipSync({ 'a.txt': strToU8('x') }))), 'This zip file isn’t a Word file: it has no document in it.', 'package: a zip with no document');
	eq(throws(() => readPackage(zipSync({ '../evil.xml': strToU8('x') }))), 'A file in the project has a name that can’t be read safely.', 'package: a name that climbs out of the zip is refused before anything is inflated');
	const pkg = readPackage(docx(p('x'), { mainPath: 'custom/main.xml' }));
	eq(pkg.main, 'custom/main.xml', 'package: the document is found through the relationships, not by its name');
	const big = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), '_rels/.rels': strToU8('<Relationships><Relationship Id="a" Type="x/officeDocument" Target="word/document.xml"/></Relationships>'), 'word/document.xml': strToU8('<w:document/>'), 'word/media/image1.png': new Uint8Array(2000).fill(7) });
	ok(!readPackage(big).parts.has('word/media/image1.png'), 'package: pictures are not inflated');
	ok(throws(() => readDocx(strToU8('PK nonsense'))) !== '', 'package: a cut-short zip is refused');
}

// ---- Markdown from runs ----
{
	const t = (text: string, o: Partial<{ b: boolean; i: boolean; s: boolean; href: string }> = {}) => ({ kind: 'text' as const, text, b: false, i: false, s: false, ...o });
	eq(runsToMarkdown([t('plain '), t('italic ', { i: true }), t('bold', { b: true }), t(' and '), t('both', { b: true, i: true }), t(' struck', { s: true })], () => ''), 'plain *italic* **bold** and ***both*** ~~struck~~', 'markdown: marks, with a space outside them');
	eq(runsToMarkdown([t('a '), t('b', { i: true }), t('c', { i: true })], () => ''), 'a *bc*', 'markdown: runs that are alike are one');
	eq(runsToMarkdown([t('# not a heading, 1. not a list')], () => ''), '\\# not a heading, 1. not a list', 'markdown: the start of a line is escaped');
	eq(runsToMarkdown([t('Word '), t('#tag mid-line')], () => ''), 'Word \\#tag mid-line', 'markdown: only where it would mean something');
	eq(runsToMarkdown([t('see'), t(' here', { href: 'https://e.com/a (b)' })], () => ''), 'see[ here](https://e.com/a%20%28b%29)'.replace('see[ here]', 'see [here]'), 'markdown: a link');
	eq(runsToMarkdown([t('Text'), { kind: 'note', note: 0 }], () => 'The note, with [a link] and a ] bracket'), 'Text^[The note, with [a link] and a ] bracket]', 'markdown: a footnote is in place');
	eq(runsToMarkdown([t('a'), { kind: 'br' }, t('b')], () => ''), 'a  \nb', 'markdown: a line break is two spaces and a newline');
	eq(runsToMarkdown([t(' \tword \n', { i: true }), t('   ', { b: true })], () => ''), ' \t*word* \n   ', 'markdown: any space at a run’s edge stays outside its marks, and a run of only spaces is as it was');
	// a long run of spaces inside a run (a file of a few KB can hold one): its edges are found in time, not in time that grows as its square
	const gap = ' '.repeat(150000), t0 = Date.now(), long = runsToMarkdown([t(`x${gap}y`, { i: true })], () => ''), spent = Date.now() - t0;
	ok(long === `*x${gap}y*`, 'markdown: a long run of spaces inside a run is kept');
	ok(spent < 1000, `markdown: and is read in time (${spent} ms)`);
}

// ---- headings: by style name, by outline level ----
{
	const bytes = docx([p('The Salt Road', { style: 'Title' }), p('By Mara.'), p('One', { style: 'berschrift1' }), body('a'), p('Two', { style: 'Chapter' }), body('b'), p('Three', { ppr: '<w:outlineLvl w:val="0"/>' }), body('c')].join(''));
	const { plan, found } = make(bytes);
	eq(found.signal, 'headings', 'headings: by a style’s built-in name (a localised id), by an outline level, direct or through the style');
	eq(rows(plan), 'Front matter/\n  Title page\nOne\nTwo\nThree', 'headings: three chapters, and the title before them in the front matter');
	same(bytes, plan, 'headings');
	const sub = docx([H('A'), body('a'), H('Sub', 2), body('s'), H('B'), body('b')].join(''));
	eq(make(sub).plan.notes.find((n) => n.title === 'A')?.body.includes('## Sub'), true, 'headings: a level under the chapters that few have stays in the text, marked');
	eq(settle(readDocx(docx(p('x', { style: 'TOC1' }))), 'final').paras[0].toc, true, 'headings: a contents style is marked');
}

// ---- R2: no styles at all; lines that read as titles, centered, bold ----
{
	const parts = ['CHAPTER ONE', 'CHAPTER TWO', 'CHAPTER THREE'].flatMap((c, k) => [p(c, { jc: 'center', props: '<w:b/>', pageBefore: k > 0 }), p(words(150, `r${k}`)), p(words(30, `s${k}`))]);
	const bytes = docx(parts.join(''), { styles: STYLES.replace(/<w:style w:type="paragraph" w:styleId="Heading1">[\s\S]*?<\/w:style>/, '') });
	const { plan, found } = make(bytes);
	eq(found.signal, 'titles', 'R2: bold centered "CHAPTER ONE" lines with no heading styles');
	eq(rows(plan), 'Chapter One\nChapter Two\nChapter Three', 'R2: a note each, named in title case');
	same(bytes, plan, 'R2');
}

// ---- R3: page breaks ----
{
	const parts = ['The Storm', 'The Calm', 'The End'].flatMap((c, k) => [br(true) && p(`<w:r><w:br w:type="page"/></w:r>${r(c, '<w:b/>')}`, { jc: 'center' }), body(`p${k}`)]);
	const bytes = docx(parts.join(''));
	const { found, plan } = make(bytes);
	eq(found.signal, 'pages', 'R3: bold centered lines after page breaks');
	eq(rows(plan), 'The Storm\nThe Calm\nThe End', 'R3: chapters');
	same(bytes, plan, 'R3');
	eq(make(docx([body('a'), p(`<w:r><w:br w:type="page"/></w:r>${r(words(14, 'q'))}`), body('b')].join(''))).found.signal, 'none', 'R3: a page break before prose is not a chapter');
}

// ---- R4: scene breaks ----
{
	const brk = (kind: string) => kind === 'style' ? p('* * *', { style: 'SceneBreak' }) : kind === 'mark' ? p('#') : kind === 'empty' ? '<w:p/>' : '';
	for (const kind of ['style', 'mark']) {
		const bytes = docx([H('One'), body('a'), brk(kind), body('b'), H('Two'), body('c')].join(''));
		const { plan } = make(bytes);
		eq(rows(plan).split('\n').length, 4, `R4: a ${kind === 'style' ? 'scene break style' : 'line with a mark'} makes a folder of two scenes`);
		same(bytes, plan, `R4 ${kind}`);
	}
	// empty paragraphs, where they are rare
	const paras = Array.from({ length: 30 }, (_, i) => body(`e${i}`, 20));
	const bytes = docx(paras.slice(0, 12).join('') + '<w:p/>' + paras.slice(12).join(''));
	const { found } = make(bytes);
	eq(found.breakStyle, 'blank', 'R4: an empty paragraph where they are rare is a scene break');
	eq(make(docx(paras.map((x) => x + '<w:p/>').join(''))).found.breakStyle, 'none', 'R4: and where every paragraph has one, it is not');
}

// ---- R0: a table of contents ----
{
	const toc = docx([p('Contents', {}), p('One', { style: 'TOC1' }), p('Two', { style: 'TOC1' }), p('Three', { style: 'TOC1' }), H('One'), body('a'), H('Two'), body('b'), H('Three'), body('c')].join(''));
	const { plan } = make(toc);
	eq(rows(plan), 'Front matter/\n  Title page\nOne\nTwo\nThree', 'R0: a contents list in its style stays in the front matter');
	same(toc, plan, 'R0');
	const field = docx([`<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${r('Chapter 1')}</w:p>`, `<w:p>${r('Chapter 2')}</w:p>`, `<w:p>${r('Chapter 3')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`, p('Chapter 1', { jc: 'center', props: '<w:b/>' }), body('a'), p('Chapter 2', { jc: 'center', props: '<w:b/>' }), body('b')].join(''));
	eq(rows(make(field).plan), 'Front matter/\n  Title page\nChapter 1\nChapter 2', 'R0: a TOC field’s result is not chapters, and its instruction is not words');
	const sdt = docx(`<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent>${p('Chapter 1', { jc: 'center', props: '<w:b/>' })}${p('Chapter 2', { jc: 'center', props: '<w:b/>' })}</w:sdtContent></w:sdt>${p('Chapter 1', { jc: 'center', props: '<w:b/>' })}${body('a')}${p('Chapter 2', { jc: 'center', props: '<w:b/>' })}${body('b')}`);
	eq(rows(make(sdt).plan), 'Front matter/\n  Title page\nChapter 1\nChapter 2', 'R0: and a table of contents content control');
}

// ---- R5 and R6 ----
{
	const short = make(docx([H('A'), body('a', 10), H('B'), body('b', 10), H('C'), body('c', 10)].join('')));
	ok(short.found.doubtful && short.plan.said.some((s) => /may not be chapters/.test(s.text)), 'R5: very short chapters are said to be doubtful');
	const none = docx([body('a'), body('b')].join(''));
	const { plan, found } = make(none);
	eq(found.signal, 'none', 'R6: nothing found');
	eq(rows(plan), 'Manuscript', 'R6: one note');
	same(none, plan, 'R6');
}

// ---- tracked changes ----
{
	const bytes = docx([H('One'), p(`${r('Kept ')}${del('deleted words ')}${ins(r('inserted words '))}${r('end.')}`), `<w:p><w:pPr><w:rPr>${del('', 'Ann', 7).replace(/<w:r>.*<\/w:r>/, '')}</w:rPr></w:pPr>${r('Joined ')}</w:p>`, p('to this paragraph.'), H('Two'), body('b')].join(''));
	const doc = settle(readDocx(bytes), 'final'), orig = settle(readDocx(bytes), 'original');
	const text = (d: typeof doc) => d.paras.map((q) => q.runs.map((x) => (x.kind === 'text' ? x.text : '')).join('')).join('|');
	eq(text(doc), 'One|Kept inserted words end.|Joined to this paragraph.|Two|' + words(120, 'b'), 'changes: accepted, a deletion gone, an insertion kept, a deleted paragraph mark joins');
	ok(text(orig).includes('Kept deleted words end.') && !text(orig).includes('inserted'), 'changes: the file as it was is the other settling');
	ok(doc.said[0].startsWith('This file has 3 tracked changes. They are brought in as accepted.'), 'changes: counted, and said');
	const { plan } = make(bytes);
	same(bytes, plan, 'changes');
	ok(!tokens(plan.notes.map((n) => n.body).join(' ')).includes('deleted'), 'changes: deleted words are not in the notes');
	const moved = docx(`<w:p><w:moveFrom w:id="1" w:author="A" w:date="d"><w:r><w:t>moved away </w:t></w:r></w:moveFrom><w:moveTo w:id="2" w:author="A" w:date="d"><w:r><w:t>moved here</w:t></w:r></w:moveTo></w:p>`);
	eq(settle(readDocx(moved), 'final').paras[0].runs.map((x) => (x.kind === 'text' ? x.text : '')).join(''), 'moved here', 'changes: a move is its destination');
	// a change inside another (Word writes these when two people edit): text one wrote and another deleted was never in the
	// original and isn't in the final; text one inserted and then moved away is gone from the final too
	const text1 = (b: Uint8Array, as: 'final' | 'original') => settle(readDocx(b), as).paras.map((q) => q.runs.map((x) => (x.kind === 'text' ? x.text : '')).join('')).join('|');
	const nested = docx(`<w:p>${r('A ')}<w:ins w:id="1" w:author="A" w:date="d"><w:del w:id="2" w:author="B" w:date="d"><w:r><w:delText>written then deleted </w:delText></w:r></w:del></w:ins>${r('B ')}<w:moveFrom w:id="3" w:author="A" w:date="d"><w:ins w:id="4" w:author="A" w:date="d"><w:r><w:t>inserted then moved </w:t></w:r></w:ins></w:moveFrom>${r('C')}</w:p>`);
	eq(text1(nested, 'final'), 'A B C', 'changes: text inserted by one and deleted by another, or inserted and then moved away, is gone from the final');
	eq(text1(nested, 'original'), 'A B C', 'changes: and was never in the original');
}

// ---- footnotes, endnotes, links, lists, quotes ----
{
	const bytes = docx([H('One'), p(`${r('Before')}${mark(1)}${r(' middle')}${mark(2)}${r(' end ')}<w:hyperlink r:id="rIdL">${r('a link')}</w:hyperlink>`), p('First', { num: [1, 0] }), p('Second', { num: [1, 0] }), p('Numbered', { num: [2, 0] }), p('Said wisely.', { style: 'Quote' }), body('z'), H('Two'), body('b')].join(''), { footnotes: footnote(1, 'First note.') + footnote(2, 'Second note, with more.') });
	const { plan } = make(bytes);
	const one = plan.notes.find((n) => n.title === 'One')?.body ?? '';
	ok(one.includes('Before^[First note.] middle^[Second note, with more.] end [a link](https://example.com/a?b=1&c=2)'), 'notes: footnotes in place, a web link');
	ok(one.includes('- First\n- Second\n\n1. Numbered') || one.includes('- First\n- Second\n1. Numbered'), 'notes: bulleted and numbered lists');
	ok(one.includes('> Said wisely.'), 'notes: a quotation');
	same(bytes, plan, 'notes');
	const ends = docx([H('One'), p(`${r('Text')}<w:r><w:endnoteReference w:id="1"/></w:r>`), H('Two'), body('b')].join(''), { endnotes: '<w:endnote w:id="1"><w:p><w:r><w:endnoteRef/></w:r><w:r><w:t>An endnote.</w:t></w:r></w:p></w:endnote>' });
	ok(make(ends).plan.notes.find((n) => n.title === 'One')?.body.includes('Text^[An endnote.]'), 'notes: an endnote comes in as a footnote');
	ok(make(ends).plan.said.some((s) => /Endnotes come in as footnotes/.test(s.text)), 'notes: and is said');
	same(ends, make(ends).plan, 'endnotes');
}

// ---- a text box is read once ----
{
	const box = `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx><w:txbxContent><w:p>${r('Boxed words once.')}</w:p></w:txbxContent></wps:txbx></wps:wsp></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent><w:p>${r('Boxed words once.')}</w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r>${r('Around it.')}</w:p>`;
	const bytes = docx([H('One'), box, body('a'), H('Two'), body('b')].join(''));
	const { plan } = make(bytes);
	eq(plan.notes.map((n) => n.body).join(' ').split('Boxed words once').length - 1, 1, 'text box: its words are once in the notes');
	same(bytes, plan, 'text box');
	ok(plan.said.some((s) => /text box/.test(s.text)), 'text box: said');
}

// ---- tabs, underlines, tables, comments, pictures: what a file with them does ----
{
	const tabbed = docx([H('One'), p(`<w:r><w:tab/></w:r>${r('A typed tab starts this.')}`), p('Flush after.'), H('Two'), body('b')].join(''));
	ok((make(tabbed, { tabs: true }).plan.notes.find((n) => n.title === 'One')?.body ?? '').includes('\tA typed tab'), 'tabs: a typed first tab is kept when the setting is on');
	const off = make(tabbed, { tabs: false }).plan;
	ok(!off.notes.find((n) => n.title === 'One')?.body.includes('\t') && off.said.some((s) => /began with a tab/.test(s.text)), 'tabs: and dropped, said, when it is off');
	const under = docx([H('One'), p(`${r('Plain ')}${r('under', '<w:u w:val="single"/>')}${r(' end.')}`), H('Two'), body('b')].join(''));
	ok(make(under).plan.notes.find((n) => n.title === 'One')?.body.includes('*under*'), 'underline: read as italics when the file has none');
	const both = docx([H('One'), p(`${r('i', '<w:i/>')}${r(' u', '<w:u w:val="single"/>')}`), H('Two'), body('b')].join(''));
	ok(!make(both).plan.notes.find((n) => n.title === 'One')?.body.includes('*u*'), 'underline: and left plain when the file has italics');
	const table = docx([H('One'), '<w:tbl><w:tr><w:tc>' + p('Cell one') + '</w:tc><w:tc>' + p('Cell two') + '</w:tc></w:tr></w:tbl>', body('a'), H('Two'), body('b')].join(''));
	const tp = make(table).plan;
	ok(tp.notes.find((n) => n.title === 'One')?.body.includes('Cell one\n\nCell two') && tp.said.some((s) => /table/.test(s.text)), 'tables: their text comes in, cell after cell, said');
	same(table, tp, 'table');
	const comments = docx([H('One'), `<w:p><w:commentRangeStart w:id="0"/>${r('Commented words.')}<w:commentRangeEnd w:id="0"/></w:p>`, body('a'), H('Two'), body('b')].join(''));
	const cp = make(comments).plan;
	ok(cp.notes.find((n) => n.title === 'One')?.body.includes('Commented words.') && cp.said.some((s) => /comment/.test(s.text)), 'comments: the commented words stay, the comment is not brought in, and said');
	same(comments, cp, 'comments');
	const picture = docx([H('One'), `<w:p><w:r><w:drawing><a:blip xmlns:a="x" r:embed="rIdX"/></w:drawing></w:r>${r('Under a picture.')}</w:p>`, H('Two'), body('b')].join(''));
	ok(make(picture).plan.said.some((s) => /other than PNG or JPEG/.test(s.text)), 'pictures: one with no file behind it is said, and the words stay');
	same(picture, make(picture).plan, 'picture');
	const headers = docx(H('One') + body('a') + H('Two') + body('b'), { extra: { 'word/header1.xml': `<w:hdr ${NS}>${p('Running head words')}</w:hdr>` } });
	ok(make(headers).plan.said.some((s) => /Headers and footers/.test(s.text)), 'headers: said, not brought in');
	same(headers, make(headers).plan, 'headers');
}

// ---- a heading with a line break: how Binders writes "Chapter One" and its title ----
{
	const bytes = docx(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${r('Chapter One')}${br()}${r('The jetty')}</w:p>${body('a')}<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${r('Chapter Two')}${br()}${r('The tide')}</w:p>${body('b')}`);
	eq(rows(make(bytes).plan), 'Chapter One - The jetty\nChapter Two - The tide', 'headings: a number and its title on two lines read as "Chapter One - The jetty", which export strips the number from');
	same(bytes, make(bytes).plan, 'two-line headings');
}

// ---- the test is tested ----
{
	const bytes = docx([H('One'), body('a'), body('a2'), H('Two'), body('b'), H('Three'), body('c')].join(''));
	const { plan } = make(bytes), want = docxWords(bytes);
	ok(!firstDifference(want.body, plannedWords(plan).body), 'oracle: agrees before it is damaged');
	const rowsOf = plan.notes.slice(1);
	const dropped = { ...plan, notes: [plan.notes[0], ...rowsOf.map((n, i) => (i === 0 ? { ...n, body: n.body.replace(/^.*\n\n/, '') } : n))] } as ImportPlan;
	ok(firstDifference(want.body, plannedWords(dropped).body) !== null, 'oracle: notices a dropped paragraph');
	const swapped = { ...plan, notes: [plan.notes[0], rowsOf[1], rowsOf[0], ...rowsOf.slice(2)] } as ImportPlan;
	ok(firstDifference(want.body, plannedWords(swapped).body) !== null, 'oracle: notices two swapped chapters');
}

// ---- step 4: what a Word file carries ----
{
	// comments: kept as Obsidian comments at the end of their range, with a switch
	const bytes = docx([H('One'), `<w:p>${r('Before ')}<w:commentRangeStart w:id="0"/>${r('the commented words')}<w:commentRangeEnd w:id="0"/>${r(' after.')}</w:p>`, body('a'), H('Two'), body('b')].join(''), { comments: comment(0, 'Ann', 'Check this: %% twice.') });
	const on = read(bytes), off = on.reread?.({ comments: false }) ?? on;
	eq(on.word?.comments, 1, 'comments: counted, for the row that is shown only when a file has any');
	const onPlan = planManuscript(on, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' }).plan;
	ok(onPlan.notes.find((n) => n.title === 'One')?.body.startsWith('Before the commented words%%Ann: Check this: % % twice.%% after.'), 'comments: at the end of their range, by who wrote them');
	const d = firstDifference(docxWords(bytes, { comments: true }).body, plannedWords(onPlan).body);
	ok(!d, `comments: every word, the comment's among them, in order${d ? ` (${d})` : ''}`);
	const offPlan = planManuscript(off, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' }).plan;
	ok(!offPlan.notes.some((n) => n.body.includes('%%')) && offPlan.said.some((s) => /comment.*left out/.test(s.text)), 'comments: off, they are left out and said');
	same(bytes, offPlan, 'comments off');
	eq(read(docx(H('One') + body('a') + H('Two') + body('b'))).word?.comments, 0, 'comments: none, no row');

	// tracked changes: accept all, or reject all
	const rev = docx([H('One'), p(`${r('Kept ')}${del('deleted words ')}${ins(r('inserted words '))}${r('end.')}`), H('Two'), body('b')].join(''));
	const inRead = read(rev), orig = inRead.reread?.({ revisions: 'original' });
	eq(inRead.word?.revisions, 2, 'changes: counted for the row');
	const body1 = (rd: typeof inRead) => planManuscript(rd, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' }).plan.notes.find((n) => n.title === 'One')?.body;
	eq(body1(inRead), 'Kept inserted words end.\n', 'changes: accept all');
	eq(body1(orig ?? inRead), 'Kept deleted words end.\n', 'changes: reject all');

	// underline: with italics in the file, a choice; with none, italics
	const both = docx([H('One'), p(`${r('i', '<w:i/>')}${r(' under', '<w:u w:val="single"/>')}${r(' end.')}`), H('Two'), body('b')].join(''));
	const bothRead = read(both);
	ok(bothRead.word?.hasUnderline && bothRead.word.hasItalic, 'underline: a file with both has the row');
	eq(planManuscript(bothRead, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' }).plan.notes.find((n) => n.title === 'One')?.body, '*i* under end.\n', 'underline: left plain');
	eq(planManuscript(bothRead.reread?.({ underline: 'italic' }) ?? bothRead, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' }).plan.notes.find((n) => n.title === 'One')?.body, '*i* *under* end.\n'.replace('*i* *under*', '*i under*'), 'underline: made italic');

	// pictures: PNG and JPEG are kept where they stood, others counted; nothing is inflated that the plan doesn't need
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), jpg = new Uint8Array([0xff, 0xd8, 0xff, 9, 9]), gif = new Uint8Array([0x47, 0x49, 0x46, 7]);
	const pic = (rid: string) => `<w:p><w:r><w:drawing><wp:inline xmlns:wp="x"><a:graphic xmlns:a="a"><a:graphicData><pic:pic xmlns:pic="p"><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
	const rels = ['A:image1.png', 'B:image2.jpeg', 'C:image3.gif'].map((x) => `<Relationship Id="rId${x[0]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${x.slice(2)}"/>`).join('');
	const withPics = docx([H('One'), body('a'), pic('rIdA'), p('Between.'), pic('rIdB'), pic('rIdC'), H('Two'), body('b')].join(''), { rels, extra: { 'word/media/image1.png': png, 'word/media/image2.jpeg': jpg, 'word/media/image3.gif': gif } });
	const pp = make(withPics).plan;
	eq([...pp.files.keys()].filter((f) => f.includes('/Attachments/')).sort().join('|'), 'Book/Research/Attachments/Picture 1.png|Book/Research/Attachments/Picture 2.jpg', 'pictures: PNG and JPEG are in Research/Attachments');
	eq(Array.from(pp.files.get('Book/Research/Attachments/Picture 1.png') ?? []).join(), Array.from(png).join(), 'pictures: byte for byte');
	ok(pp.notes.find((n) => n.title === 'One')?.body.includes('![[Book/Research/Attachments/Picture 1.png]]\n\nBetween.\n\n![[Book/Research/Attachments/Picture 2.jpg]]'), 'pictures: embedded where they stood');
	ok(pp.said.some((s) => /1 picture of a kind other than PNG or JPEG/.test(s.text)) && pp.said.some((s) => /2 pictures are kept/.test(s.text)), 'pictures: the others are counted and said');
	ok(pp.files.has('Book/Research/Research.md') && (new TextDecoder().decode(pp.files.get('Book/Book.md')).includes('Research/')), 'pictures: Research exists for them, left out of exports');
	same(withPics, pp, 'pictures');
	// (media a plan never asks for is never inflated: garbage where its bytes should be is no matter)
	const bad = docx([H('One'), body('a'), H('Two'), body('b')].join(''), { extra: { 'word/media/never.png': png } });
	const at = new TextDecoder('latin1').decode(bad).indexOf('never.png');
	ok(at > 0 && make(bad).plan.notes.length > 1, 'pictures: a media file nothing refers to is not read');
	const orig2 = read(docx([H('One'), body('a'), pic('rIdA'), H('Two'), body('b')].join(''), { rels, extra: { 'word/media/image1.png': png } }));
	let loaded = 0;
	const spy = { ...orig2, scan: { ...orig2.scan, pictures: orig2.scan.pictures?.map((q) => ({ ...q, load: () => { loaded++; return q.load(); } })) } };
	planManuscript(spy, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' });
	ok(loaded >= 1, 'pictures: inflated when a plan needs them');

	// a heading the file numbers has no text: named by its place, and said
	const numbered = STYLES.replace('</w:styles>', '<w:style w:type="paragraph" w:styleId="NumHead"><w:name w:val="heading 1"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>');
	const nb = docx(['<w:p><w:pPr><w:pStyle w:val="NumHead"/></w:pPr></w:p>', body('a'), '<w:p><w:pPr><w:pStyle w:val="NumHead"/></w:pPr></w:p>', body('b'), '<w:p><w:pPr><w:pStyle w:val="NumHead"/></w:pPr></w:p>', body('c')].join(''), { styles: numbered });
	const np = make(nb).plan;
	eq(rows(np), 'Chapter 1\nChapter 2\nChapter 3', 'numbered headings: with no text, named by their place');
	ok(np.said.some((s) => /numbered by the file and has no text/.test(s.text)), 'numbered headings: said');
	same(nb, np, 'numbered headings');
}

// ---- files the maintainer has made (BINDERS_IMPORT_SAMPLES=<folder>) ----
{
	const dir = process.env.BINDERS_IMPORT_SAMPLES;
	if (!dir) console.log('SKIPPED: BINDERS_IMPORT_SAMPLES IS NOT SET, SO NO FILE FROM A REAL WORD PROCESSOR WAS READ');
	else {
		let n = 0;
		for (const f of readdirSync(dir).filter((x) => /\.docx$/i.test(x))) {
			const bytes = new Uint8Array(readFileSync(`${dir}/${f}`)), plan = make(bytes).plan;
			const d = firstDifference(docxWords(bytes, { comments: true }).body, plannedWords(plan).body);
			ok(!d, `sample ${f}: every word, in order${d ? ` (${d})` : ''}`);
			const txt = `${dir}/${f.replace(/\.docx$/i, '.txt')}`;
			if (existsSync(txt)) {
				// (a program's own "save as text" puts footnotes where it likes: the words are compared as a set when the file has notes)
				const want = tokens(readFileSync(txt, 'utf8')), got = [...plannedWords(plan).body, ...plannedWords(plan).notes];
				const key = (l: string[]) => (docxWords(bytes).notes.length ? [...l].sort() : l).join(' ');
				ok(key(want) === key(got), `sample ${f}: the words of its own .txt`);
			}
			n++;
		}
		console.log(`  samples: ${n} files read from ${dir}`);
	}
}

// ---- larger text: a sign of a heading, as bold is, never a heading by itself ----
{
	const sized = (sz: number) => (c: string, k: number) => [p(`<w:r><w:br w:type="page"/></w:r>${r(c, `<w:sz w:val="${sz}"/>`)}`), body(`z${k}`)];
	const book = (sz: number) => docx(['The Storm', 'The Calm', 'The End'].flatMap(sized(sz)).join(''), { styles: STYLES.replace('<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>', '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>') });
	const { found, plan } = make(book(36));
	eq(found.signal, 'pages', 'larger text: plain 18 pt lines after page breaks, in a book set in 12 pt, start chapters');
	eq(rows(plan), 'The Storm\nThe Calm\nThe End', 'larger text: the chapters are named by those lines');
	same(book(36), plan, 'larger text');
	eq(make(book(26)).found.signal, 'none', 'larger text: a line only a point larger is no sign');
	eq(make(book(24)).found.signal, 'none', 'larger text: the same lines at the body size are no sign');
	// by the paragraph's style, with the size the file sets as its default
	const styled = docx(['The Storm', 'The Calm'].flatMap((c, k) => [p(`<w:r><w:br w:type="page"/></w:r>${r(c)}`, { style: 'Big' }), body(`y${k}`)]).join(''), { styles: STYLES.replace('</w:styles>', '<w:style w:type="paragraph" w:styleId="Big"><w:name w:val="Big"/><w:rPr><w:sz w:val="40"/></w:rPr></w:style></w:styles>') });
	eq(make(styled).found.signal, 'pages', 'larger text: a size from the paragraph\'s style is read too');
	// without a page break before it, a larger line is no chapter: it is only a sign
	eq(make(docx([body('a'), p(r('The Storm', '<w:sz w:val="48"/>')), body('b'), p(r('The Calm', '<w:sz w:val="48"/>')), body('c')].join(''))).found.signal, 'none', 'larger text: alone, it starts no chapter');
}

// ---- sections: how the next one starts, and the paragraph that only marks where one ends ----
{
	const end = (type?: string) => `<w:p><w:pPr><w:sectPr>${type ? `<w:type w:val="${type}"/>` : ''}</w:sectPr></w:pPr></w:p>`;
	const lines = (k: string) => p(r(`The ${k}`, '<w:b/>'), { jc: 'center' });
	// (LibreOffice writes a section's end as a paragraph of its own, empty: Word puts it on the last paragraph)
	const bytes = docx([lines('Storm'), body('a'), end(), lines('Calm'), body('b'), end('continuous'), p(words(30, 'c')), end(), lines('End'), body('d')].join(''));
	const doc = settle(readDocx(bytes), 'final');
	eq(doc.paras.filter((x) => !x.runs.length).length, 0, 'sections: a paragraph that only marks a section\'s end, with no words, is no empty line');
	// (Storm, a | Calm, b: continuous | c | End, d: a section's type is written at its end, and says how it began)
	eq(doc.paras.map((x) => (x.pageBefore ? 'P' : '-')).join(''), '----PP-', 'sections: a section starts a page unless it is written as continuous');
	same(bytes, make(bytes).plan, 'sections');
}

// ---- hidden text is left out, and said ----
{
	const styles = STYLES.replace('</w:styles>', '<w:style w:type="character" w:styleId="Secret"><w:name w:val="Secret"/><w:rPr><w:vanish/></w:rPr></w:style></w:styles>');
	const bytes = docx([H('One'), p(`${r('Seen ')}${r('unseen words ', '<w:vanish/>')}${r('and seen.')}`), p(`${r('Also ')}${r('styled away ', '<w:rStyle w:val="Secret"/>')}${r('seen.')}`), p(r('kept ', '<w:vanish w:val="0"/>') + r('too.')), body('h'), H('Two'), body('i')].join(''), { styles });
	const { plan } = make(bytes);
	const text = plan.notes.map((n) => n.body).join('\n');
	ok(!/unseen|styled away/.test(text), 'hidden: text hidden by hand or by its character style isn\'t brought in');
	ok(/Seen and seen\./.test(text) && /Also seen\./.test(text) && /kept too\./.test(text), 'hidden: the words around it are, and text whose hiding is turned off is too');
	ok(plan.said.some((x) => x.text === 'This file has hidden text in 2 places. It isn’t brought in; the original file keeps it.'), 'hidden: how many places is said');
	same(bytes, plan, 'hidden');
	ok(!make(docx([H('One'), body('a'), H('Two'), body('b')].join(''))).plan.said.some((x) => /hidden/.test(x.text)), 'hidden: a file with none says nothing of it');
}

// ---- refused, plainly ----
{
	eq(throws(() => readWord(docx(''), 'E.docx', { bytes: docx('') }, { tabs: true })), 'This Word file has no text in it.', 'a file with no text is refused');
	const bad = docx(p('x')).slice();
	ok(throws(() => readDocx(bad.subarray(0, bad.length - 30))) !== '', 'a damaged file is refused');
	const evil = docx('', { extra: {} });
	void evil;
	eq(throws(() => readDocx(docx('<w:p><w:r><w:t>&xxe;</w:t></w:r></w:p>'))), 'This file holds an entity the reader doesn’t know, so it can’t be read safely.', 'an entity it doesn’t know is refused');
	eq(throws(() => readDocx(docx('', { extra: { 'word/document.xml': '<!DOCTYPE d [<!ENTITY a "b">]><w:document/>' } }))), 'This file declares document types or entities, which import won’t read.', 'a DOCTYPE is refused');
}

// ---- a 150,000-word file, in time ----
{
	const chapters: string[] = [];
	for (let c = 0; c < 50; c++) {
		chapters.push(H(`Chapter ${c + 1}`));
		for (let k = 0; k < 60; k++) chapters.push(p(`${r(words(48, `c${c}p${k}w`))}${k % 20 === 0 ? mark(c * 3 + k / 20 + 1) : ''}`));
	}
	const bytes = docx(chapters.join(''), { footnotes: Array.from({ length: 150 }, (_, c) => footnote(c + 1, `Note ${c}`)).join('') });
	const t0 = Date.now();
	const { plan } = make(bytes);
	const spent = Date.now() - t0;
	ok(spent < 10000, `speed: a 150,000-word file is read and planned in under ten seconds (${spent} ms)`);
	eq(plan.notes.filter((n) => !n.folder).length, 50, 'speed: fifty chapters');
	same(bytes, plan, 'speed');
}

// ---- a third writer: LibreOffice, where it is installed ----
{
	const soffice = ['/usr/bin/soffice', '/usr/local/bin/soffice'].find((f) => existsSync(f));
	if (!soffice) console.log('SKIPPED: soffice IS NOT INSTALLED, SO NO FILE MADE BY LIBREOFFICE WAS READ');
	else {
		const dir = 'test-dist/import-soffice';
		mkdirSync(dir, { recursive: true });
		const html = `<html><body><h1>The Lighthouse</h1><p>By Mara.</p>${['The jetty', 'The tide', 'The storm'].map((c, k) => `<h2>${esc(c)}</h2><p>${words(80, `h${k}`)} It was <i>not</i> what <b>Mara</b> had hoped.<sup>x</sup></p><p>${words(60, `j${k}`)}</p>`).join('')}</body></html>`;
		writeFileSync(`${dir}/book.html`, html);
		try {
			execFileSync(soffice, ['--headless', '--convert-to', 'docx:MS Word 2007 XML', '--outdir', dir, `${dir}/book.html`], { stdio: 'ignore', timeout: 120000, env: { ...process.env, HOME: process.env.HOME ?? '/tmp' } });
			const bytes = new Uint8Array(readFileSync(`${dir}/book.docx`));
			const { plan } = make(bytes);
			ok(rows(plan).includes('The jetty') && rows(plan).includes('The storm'), 'soffice: the chapters of a file LibreOffice wrote are found');
			same(bytes, plan, 'soffice');
		} catch (e) { console.log(`SKIPPED: soffice COULD NOT CONVERT (${e instanceof Error ? e.message : String(e)})`); }
	}
}
// ---- the binder's name a file gives itself: its Title-styled paragraph (titleOf), else the file's name ----
{
	const named = (bytes: Uint8Array) => read(bytes);
	const TITLED = docx([p('The Salt Road', { style: 'Title' }), p('By Mara.'), p('One', { style: 'Heading1' }), body('a')].join(''));
	eq(named(TITLED).name, 'The Salt Road', 'title: the Title-styled paragraph names the binder');
	ok(named(TITLED).titled === true, 'title: and the name is marked as the file’s own');
	eq(named(docx([p('One', { style: 'Heading1' }), body('a')].join(''))).name, 'Book', 'title: with no Title-styled paragraph, the file’s name is kept');
	ok(!named(docx([p('One', { style: 'Heading1' }), body('a')].join(''))).titled, 'title: and it is not marked as the file’s');
	eq(named(docx([p('The Salt Road: A Novel?', { style: 'Title' }), body('a')].join(''))).name, 'The Salt Road A Novel', 'title: made safe as a folder’s name');
	eq(named(docx([p('', { style: 'Title' }), p('The Salt Road', { style: 'Title' }), body('a')].join(''))).name, 'The Salt Road', 'title: an empty Title paragraph is passed over');
	eq(named(docx([p('First', { style: 'Title' }), p('Second', { style: 'Title' }), body('a')].join(''))).name, 'First', 'title: only the first Title paragraph is asked');
	const long = 'The Salt Road and everything that happened on it while the storms kept coming in off the sea for a whole year';
	eq(named(docx([p(long, { style: 'Title' }), p('Short', { style: 'Title' }), body('a')].join(''))).name, 'Book', 'title: a Title too long to be a name is a line, and the file’s name is kept');
	eq(named(docx([p(long.slice(0, 80), { style: 'Title' }), body('a')].join(''))).name, long.slice(0, 80), 'title: up to eighty characters is a name');
	const localised = STYLES.replace('w:styleId="Title"', 'w:styleId="Titel"');
	eq(named(docx([p('Der Salzweg', { style: 'Titel' }), body('a')].join(''), { styles: localised })).name, 'Der Salzweg', 'title: a German Word’s id is its own, and the built-in name still reads it');
	// a lone first heading the detector takes for the book, as it does with no Title above it
	const chapters = [p('Part One', { style: 'Heading1' }), body('a'), p('One', { style: 'Heading2' }), body('b'), p('Two', { style: 'Heading2' }), body('c'), p('Three', { style: 'Heading2' }), body('d')].join('');
	const pl = (bytes: Uint8Array) => planManuscript(read(bytes), { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' });
	eq(pl(docx(chapters)).title, 'Part One', 'title: a lone first heading is the book’s name when the file has no Title');
	eq(pl(docx(p('The Salt Road', { style: 'Title' }) + chapters)).title, 'The Salt Road', 'title: the Title paragraph is the name over that heading');
}
done('import docx');
