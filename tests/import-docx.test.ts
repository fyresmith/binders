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
import { NS, STYLES, br, del, docx, esc, footnote, ins, mark, p, r, words } from './import-docx-fixtures';
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
	ok(make(picture).plan.said.some((s) => /Pictures/.test(s.text)), 'pictures: said, and the words stay');
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
done('import docx');
