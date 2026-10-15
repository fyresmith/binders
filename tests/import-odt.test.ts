import { strToU8, unzipSync as unzip, zipSync } from 'fflate';
import { DEFAULT_SETTINGS } from '../src/settings-data';
import { readOdt } from '../src/import/odt';
import { readDocument } from '../src/import/docx';
import { planManuscript, type ManuscriptOptions } from '../src/import/manuscript';
import type { ImportPlan } from '../src/import/plan';
import { firstDifference, tokens } from './export-words';
import { plannedWords } from './import-words';
import { ok, eq, done } from './harness';

/* The OpenDocument import (src/import/odt.ts) on files written by hand: headings by `text:h` and by a style's outline
   level, formatting through the chain of styles, XML's spaces, notes, comments, tracked changes either way, lists,
   tables, indexes, hidden text, pictures, the flat file, and what is refused. The words are held to an oracle of their
   own: a reader of content.xml by regular expressions, sharing no code with the importer. The files LibreOffice wrote
   itself are tests/import-libreoffice.test.ts. */

const settings = { ...DEFAULT_SETTINGS };
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"';
const STYLES = `<office:styles>
<style:default-style style:family="paragraph"><style:text-properties fo:font-size="12pt"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph"/>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"/>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="14pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="1"/>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="2"/>
<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/></style:style>
<style:style style:name="Contents_20_1" style:display-name="Contents 1" style:family="paragraph" style:parent-style-name="Standard"/>
<style:style style:name="Emphasis" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="Strong_20_Emphasis" style:display-name="Strong Emphasis" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Hidden" style:family="text"><style:text-properties text:display="none"/></style:style>
<text:list-style style:name="Bullets"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style>
<text:list-style style:name="Numbers"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>
</office:styles>`;
const AUTO = `<office:automatic-styles>
<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Heading_20_1"><style:paragraph-properties fo:break-before="page"/></style:style>
<style:style style:name="P2" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="P3" style:family="paragraph" style:parent-style-name="Text_20_body"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="T1" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="T2" style:family="text"><style:text-properties fo:font-weight="bold" fo:font-style="italic"/></style:style>
<style:style style:name="T3" style:family="text"><style:text-properties style:text-underline-style="solid"/></style:style>
<style:style style:name="T4" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style>
<style:style style:name="T5" style:family="text"><style:text-properties fo:font-size="200%"/></style:style>
</office:automatic-styles>`;
interface O { auto?: string; styles?: string; mimetype?: string; manifest?: string; extra?: Record<string, Uint8Array>; tracked?: string; generator?: string }
const content = (body: string, o: O = {}) => `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}>${o.auto ?? AUTO}<office:body><office:text>${o.tracked ?? ''}${body}</office:text></office:body></office:document-content>`;
/** An .odt: the body in a package with the styles given. */
function odt(body: string, o: O = {}): Uint8Array {
	const files: Record<string, Uint8Array> = {
		mimetype: strToU8(o.mimetype ?? 'application/vnd.oasis.opendocument.text'),
		'content.xml': strToU8(content(body, o)),
		'styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}>${o.styles ?? STYLES}</office:document-styles>`),
		'meta.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS}><office:meta><meta:generator>${o.generator ?? 'LibreOffice/24.8.4.2$Linux_X86_64'}</meta:generator></office:meta></office:document-meta>`),
		'META-INF/manifest.xml': strToU8(o.manifest ?? '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/></manifest:manifest>'),
		...(o.extra ?? {}),
	};
	return zipSync(files, { level: 0 });
}
/** The same document as one flat XML file (.fodt). */
const fodt = (body: string, o: O = {}): Uint8Array => strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.text"><office:meta><meta:generator>LibreOffice</meta:generator></office:meta>${o.styles ?? STYLES}${o.auto ?? AUTO}<office:body><office:text>${o.tracked ?? ''}${body}</office:text></office:body></office:document>`);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const words = (n: number, seed: string): string => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';
const P = (t: string, style = 'Text_20_body') => `<text:p text:style-name="${style}">${t.includes('<') ? t : esc(t)}</text:p>`;
const H = (t: string, level = 1, style = `Heading_20_${level}`) => `<text:h text:style-name="${style}" text:outline-level="${level}">${esc(t)}</text:h>`;
const body = (seed: string, n = 120) => P(words(n, seed));

const throws = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof Error ? e.message : String(e); } return ''; };
const read = (bytes: Uint8Array, o: { tabs?: boolean; revisions?: 'final' | 'original'; comments?: boolean; underline?: 'plain' | 'italic'; file?: string } = {}) => readDocument(bytes, o.file ?? 'Book.odt', { bytes }, { tabs: o.tabs ?? true, ...o });
const run = (bytes: Uint8Array, o: Partial<ManuscriptOptions> & Parameters<typeof read>[1] = {}) => planManuscript(read(bytes, o), { name: 'Book', parent: '', settings, choices: {}, scenes: 'words', ...o });
const make = (bytes: Uint8Array, o: Parameters<typeof run>[1] = {}): ImportPlan => run(bytes, o).plan;
const rows = (plan: ImportPlan) => plan.notes.slice(1).filter((n) => n.title !== 'Research').map((n) => `${'  '.repeat(n.depth - 1)}${n.title}${n.folder ? '/' : ''}`).join('\n');
const textOf = (plan: ImportPlan) => plan.notes.map((n) => n.body).join('\n');

/** The oracle: content.xml's words by regular expressions. What isn't the book's text is taken out first (the
    tracked changes' list, notes' citations, comments, generated numbers, hidden spans, index sources); a deletion is
    put back where its point is when the file is read as it was. */
function odtWords(bytes: Uint8Array, o: { original?: boolean; comments?: boolean } = {}): { body: string[]; notes: string[] } {
	const xml = new TextDecoder().decode(bytes[0] === 0x3c ? bytes : (Object.entries(unzip(bytes)).find(([k]) => k === 'content.xml')?.[1] ?? new Uint8Array()));
	const deleted = new Map<string, string>();
	for (const m of xml.matchAll(/<text:changed-region[^>]*text:id="([^"]*)"[^>]*>([\s\S]*?)<\/text:changed-region>/g)) { const d = /<text:deletion>([\s\S]*?)<\/text:deletion>/.exec(m[2]); if (d) deleted.set(m[1], d[1].replace(/<office:change-info>[\s\S]*?<\/office:change-info>/g, '')); }
	let x = xml.replace(/<text:tracked-changes>[\s\S]*?<\/text:tracked-changes>/g, '').replace(/<office:automatic-styles>[\s\S]*?<\/office:automatic-styles>|<office:styles>[\s\S]*?<\/office:styles>|<office:meta>[\s\S]*?<\/office:meta>/g, '');
	x = x.replace(/<text:change text:change-id="([^"]*)"\/>/g, (_m, id: string) => (o.original ? ` ${deleted.get(id) ?? ''} ` : ''));
	if (o.original) x = x.replace(/<text:change-start text:change-id="([^"]*)"\/>[\s\S]*?<text:change-end text:change-id="\1"\/>/g, '');
	x = x.replace(/<text:note-citation>[^<]*<\/text:note-citation>|<text:number>[^<]*<\/text:number>|<text:[a-z-]*index-source[\s\S]*?<\/text:[a-z-]*index-source>|<text:table-of-content-source[\s\S]*?<\/text:table-of-content-source>/g, '');
	x = x.replace(/<text:span text:style-name="Hidden">[\s\S]*?<\/text:span>/g, '');
	// (a comment's words go where its range ends, as import keeps them; one with no range, where it stands)
	const ranged = new Map<string, string>();
	x = x.replace(/<office:annotation((?:\s[^>]*)?)>([\s\S]*?)<\/office:annotation>/g, (_m, attrs: string, inner: string) => {
		const words = o.comments ? ` ${inner.replace(/<dc:date>[^<]*<\/dc:date>/, '').replace(/<[^>]+>/g, ' ')} ` : '';
		const name = /office:name="([^"]*)"/.exec(attrs)?.[1];
		if (name) { ranged.set(name, words); return ''; }
		return words;
	}).replace(/<office:annotation-end office:name="([^"]*)"\/>/g, (_m, name: string) => ranged.get(name) ?? '');
	const notes: string[] = [];
	x = x.replace(/<text:note-body>([\s\S]*?)<\/text:note-body>/g, (_m, inner: string) => { notes.push(...tokens(inner.replace(/<[^>]+>/g, ' '))); return ''; });
	const text = x.replace(/<text:(?:p|h)\b[^>]*\/>/g, ' ').replace(/<\/text:(?:p|h)>|<text:(?:s|tab|line-break)\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
	return { body: tokens(text), notes };
}
function same(bytes: Uint8Array, plan: ImportPlan, what: string, o: { original?: boolean; comments?: boolean } = { comments: true }): void {
	const want = odtWords(bytes, o), got = plannedWords(plan);
	const b = firstDifference(want.body, got.body), n = firstDifference(want.notes, got.notes);
	ok(!b, `${what}: every word, in order${b ? ` (${b})` : ''}`);
	ok(!n, `${what}: every word of the footnotes, in order${n ? ` (${n})` : ''}`);
}

// ---- headings: by text:h, by a style's outline level through an automatic style, the title ----
{
	const doc = [P('The Salt Road', 'Title'), H('One'), body('a'), P('Two', 'P1'), body('b'), `<text:h text:style-name="Heading_20_1">Three</text:h>`, body('c')].join('');
	for (const [name, bytes] of [['odt', odt(doc)], ['fodt', fodt(doc)]] as const) {
		const plan = make(bytes, { file: `Book.${name}` });
		eq(rows(plan), 'Front matter/\n  Title page\nOne\nTwo\nThree', `headings (${name}): a heading by text:h, by its style's outline level through an automatic style, and with no level written (1); the title is front matter`);
		same(bytes, plan, `headings (${name})`);
	}
	const two = odt([H('One'), H('Scene a', 2), body('a'), H('Scene b', 2), body('b'), H('Two'), H('Scene c', 2), body('c'), H('Scene d', 2), body('d')].join(''));
	eq(rows(make(two)), 'One/\n  Scene a\n  Scene b\nTwo/\n  Scene c\n  Scene d', 'headings: a second level is scenes');
	const read1 = read(odt([H('One'), body('a')].join('')));
	ok(read1.scan.text.startsWith('# One\n\n'), 'headings: a heading style\'s bold is its look, not written into the name');
}

// ---- formatting through the chain of styles ----
{
	const doc = [H('One'), P('Plain <text:span text:style-name="T1">italic</text:span> and <text:span text:style-name="Strong_20_Emphasis">strong</text:span> and <text:span text:style-name="T4">gone</text:span> and <text:span text:style-name="T2">both</text:span>.'), P('A whole paragraph set in italics by hand.', 'P3'), P('<text:a xlink:type="simple" xlink:href="https://example.org/a">a link</text:a> and <text:a xlink:href="file:///etc/passwd">not one</text:a>.'), body('a'), H('Two'), body('b')].join('');
	const text = read(odt(doc)).scan.text;
	ok(text.includes('Plain *italic* and **strong** and ~~gone~~ and ***both***.'), 'formatting: italic, bold and struck, from automatic and named text styles');
	ok(text.includes('*A whole paragraph set in italics by hand.*'), 'formatting: a paragraph made italic by hand (an automatic style) is italic');
	ok(text.includes('[a link](https://example.org/a) and not one.'), 'formatting: a web link is kept, a link to a file is its words');
	const underlined = odt([H('One'), P('It was <text:span text:style-name="T3">never</text:span> so.'), body('a'), H('Two'), body('b')].join(''));
	ok(read(underlined).scan.text.includes('It was *never* so.'), 'formatting: underlining is read as italics in a file with no italics');
	ok(read(odt([H('One'), P('<text:span text:style-name="T3">under</text:span> and <text:span text:style-name="T1">ital</text:span>'), body('a'), H('Two'), body('b')].join(''))).word?.hasUnderline === true, 'formatting: a file with both asks what to do with the underlining');
}

// ---- XML's spaces ----
{
	const doc = [H('One'), P('  Leading   spaces\n  collapse,<text:s text:c="3"/>but these stay;<text:tab/>a tab<text:line-break/>a break.'), P('one<text:soft-page-break/> two'), body('a'), H('Two'), body('b')].join('');
	const text = read(odt(doc)).scan.text;
	ok(text.includes('Leading spaces collapse,   but these stay; a tab  \na break.'), 'spaces: a run of white space is one space, text:s keeps its count, a paragraph\'s lead is none, a tab inside a line is a space, a line break is a break');
	ok(text.includes('one two'), 'spaces: a soft page break is layout, not a break or a space');
	eq(read(odt(doc)).scan.units.filter((u) => u.pageBefore).length, 0, 'spaces: a soft page break is no page break');
	ok(read(odt([H('One'), P('\tBegun with a tab.'), body('a'), H('Two'), body('b')].join('').replace('\tBegun', '<text:tab/>Begun'))).scan.text.includes('\tBegun with a tab.'), 'spaces: a paragraph begun with a tab keeps it, with "Start a paragraph with a tab" on');
}

// ---- notes and comments ----
{
	const doc = [H('One'), P(`Before<text:note text:id="n1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body>${P('A footnote.', 'Footnote')}</text:note-body></text:note> after, and <office:annotation office:name="c1"><dc:creator>Ann</dc:creator><dc:date>2026-10-01T10:00:00</dc:date>${P('Check this.')}</office:annotation>marked words<office:annotation-end office:name="c1"/> then<office:annotation><dc:creator>Bo</dc:creator>${P('Here.')}</office:annotation> more.`), P(`An end<text:note text:id="n2" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body>${P('An endnote.')}</text:note-body></text:note>.`), body('a'), H('Two'), body('b')].join('');
	const bytes = odt(doc), r = read(bytes);
	ok(r.scan.text.includes('Before^[A footnote.] after, and marked words%%Ann: Check this.%% then%%Bo: Here.%% more.'), 'notes: a footnote in place; a comment at the end of its range, and one with no range where it stands');
	ok(r.scan.text.includes('An end^[An endnote.].'), 'notes: an endnote is a footnote');
	ok(r.scan.said.includes('Endnotes come in as footnotes.'), 'notes: and that is said');
	eq(r.word?.comments, 2, 'comments: counted, so the dialog offers the choice');
	const plan = make(bytes);
	same(bytes, plan, 'notes and comments');
	ok(!read(bytes, { comments: false }).scan.text.includes('%%'), 'comments: off, none come in');
}

// ---- tracked changes, accepted and rejected ----
{
	const tracked = '<text:tracked-changes><text:changed-region text:id="ct1"><text:insertion><office:change-info><dc:creator>Ann</dc:creator><dc:date>2026-10-01T10:00:00</dc:date></office:change-info></text:insertion></text:changed-region><text:changed-region text:id="ct2"><text:deletion><office:change-info><dc:creator>Ann</dc:creator><dc:date>2026-10-01T10:00:00</dc:date></office:change-info><text:p text:style-name="Text_20_body">cut words</text:p><text:p text:style-name="Text_20_body">a whole cut paragraph</text:p><text:p text:style-name="Text_20_body">and the start of </text:p></text:deletion></text:changed-region><text:changed-region text:id="ct3"><text:insertion><office:change-info><dc:creator>Ann</dc:creator><dc:date>2026-10-01T10:00:00</dc:date></office:change-info></text:insertion></text:changed-region></text:tracked-changes>';
	const doc = [H('One'), P('Kept <text:change-start text:change-id="ct1"/>added <text:change-end text:change-id="ct1"/>end.'), P('Before <text:change text:change-id="ct2"/>this one.'), P('<text:change-start text:change-id="ct3"/>A new paragraph.'), P('<text:change-end text:change-id="ct3"/>Last.'), body('a'), H('Two'), body('b')].join('');
	const bytes = odt(doc, { tracked });
	const final = read(bytes), original = read(bytes, { revisions: 'original' });
	ok(final.scan.text.includes('Kept added end.\n\nBefore this one.\n\nA new paragraph.\n\nLast.'), 'changes: accepted, an insertion is in, a deletion of several paragraphs is out, the paragraphs as they are');
	ok(original.scan.text.includes('Kept end.\n\nBefore cut words\n\na whole cut paragraph\n\nand the start of this one.\n\nLast.'), 'changes: rejected, the deleted paragraphs are back where they were, and an inserted paragraph is gone, its mark too');
	eq(final.word?.revisions, 3, 'changes: counted, so the dialog offers Accept all and Reject all');
	same(bytes, make(bytes), 'changes accepted');
	same(bytes, make(bytes, { revisions: 'original' }), 'changes rejected', { original: true, comments: true });
	ok(!read(odt(doc.replace('<text:change text:change-id="ct2"/>', ''), { tracked: tracked.replace(/<text:changed-region text:id="ct2">[\s\S]*?<\/text:changed-region>/, '') })).scan.said.some((s) => /3 tracked/.test(s)), 'changes: a region with no mark in the text isn\'t counted');
}

// ---- lists, quotations, tables, text boxes, indexes, outline numbers ----
{
	const doc = [
		`<text:table-of-content text:name="Contents"><text:table-of-content-source><text:index-title-template>Contents</text:index-title-template></text:table-of-content-source><text:index-body>${P('One\t1', 'Contents_20_1')}${P('Two\t5', 'Contents_20_1')}</text:index-body></text:table-of-content>`,
		`<text:h text:style-name="Heading_20_1" text:outline-level="1"><text:number>Chapter 1</text:number>One</text:h>`, body('a'),
		`<text:list text:style-name="Bullets"><text:list-item>${P('a bullet')}<text:list><text:list-item>${P('nested')}</text:list-item></text:list></text:list-item></text:list>`,
		`<text:list text:style-name="Numbers"><text:list-item>${P('first')}</text:list-item><text:list-item>${P('second')}</text:list-item></text:list>`,
		P('Quoted at length.', 'Quotations'),
		`<table:table table:name="T"><table:table-row><table:table-cell>${P('cell one')}</table:table-cell><table:table-cell>${P('cell two')}</table:table-cell></table:table-row></table:table>`,
		P('Framed, outside.<draw:frame draw:name="F"><draw:text-box>' + P('inside a box') + '</draw:text-box></draw:frame>'),
		`<text:h text:style-name="Heading_20_1" text:outline-level="1"><text:number>Chapter 2</text:number>Two</text:h>`, body('b'),
	].join('');
	const bytes = odt(doc), r = read(bytes), text = r.scan.text;
	ok(text.includes('- a bullet\n  - nested\n1. first\n1. second'), 'lists: bullets and numbers, nested by level');
	ok(text.includes('> Quoted at length.'), 'quotations: LibreOffice\'s style is a quote');
	ok(text.includes('cell one\n\ncell two') && r.scan.said.some((s) => /table comes in as its text/.test(s)), 'tables: their text, cell after cell, and said');
	ok(text.includes('Framed, outside.\n\ninside a box') && r.scan.said.some((s) => /text box/.test(s)), 'text boxes: their text comes in once, after the paragraph it stands in, and said');
	ok(!/Chapter 1|Chapter 2/.test(text), 'outline numbers: the number the outline writes before a heading isn\'t its words');
	const plan = make(bytes);
	eq(rows(plan), 'Front matter/\n  Title page\nOne\nTwo', 'indexes: a table of contents stays in the front matter, its template left out');
	same(bytes, plan, 'lists and the rest');
}

// ---- numbered headings with no words of their own ----
{
	const styles = STYLES.replace('</office:styles>', '<text:outline-style style:name="Outline"><text:outline-level-style text:level="1" style:num-prefix="Chapter " style:num-format="1"/></text:outline-style></office:styles>');
	const bytes = odt([H('The harbour'), body('a'), '<text:h text:style-name="Heading_20_1" text:outline-level="1"/>', body('b'), H('The road'), body('c')].join(''), { styles });
	const plan = make(bytes);
	eq(rows(plan), 'The harbour\nChapter 2\nThe road', 'numbered headings: one the outline numbers with no words of its own still starts a chapter, named by its place');
	same(bytes, plan, 'numbered headings');
	eq(rows(make(odt([H('The harbour'), body('a'), '<text:h text:style-name="Heading_20_1" text:outline-level="1"/>', body('b'), H('The road'), body('c')].join('')))), 'The harbour\nThe road', 'numbered headings: an empty heading the outline doesn\'t number is an empty line');
}

// ---- hidden text ----
{
	const doc = [H('One'), P('Seen <text:span text:style-name="Hidden">unseen</text:span>and seen.'), P('<text:span text:style-name="Hidden">All of this paragraph.</text:span>'), body('a'), H('Two'), body('b')].join('');
	const bytes = odt(doc), r = read(bytes);
	ok(r.scan.text.includes('Seen and seen.') && !/unseen|All of this/.test(r.scan.text), 'hidden: text in a style that hides it isn\'t brought in');
	ok(r.scan.said.includes('This file has hidden text in 2 places. It isn’t brought in; the original file keeps it.'), 'hidden: how many places is said');
	same(bytes, make(bytes), 'hidden');
}

// ---- larger text is a sign ----
{
	const doc = ['The Storm', 'The Calm', 'The End'].map((c, k) => P(`<text:span text:style-name="T5">${c}</text:span>`, 'P1x') + body(`s${k}`)).join('');
	const auto = AUTO.replace('</office:automatic-styles>', '<style:style style:name="P1x" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:break-before="page"/></style:style></office:automatic-styles>');
	const { found, plan } = run(odt(doc, { auto }));
	eq(found.signal, 'pages', 'larger text: lines at twice the size, after page breaks, start chapters');
	eq(rows(plan), 'The Storm\nThe Calm\nThe End', 'larger text: named by those lines');
}

// ---- pictures ----
{
	const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), b64 = btoa(String.fromCharCode(...png));
	const doc = [H('One'), P('Here <draw:frame draw:name="a"><draw:image xlink:href="Pictures/a.png"/></draw:frame>, a chart <draw:frame draw:name="b"><draw:object xlink:href="./Object 1"/><draw:image xlink:href="./ObjectReplacements/Object 1"/></draw:frame>, an SVG <draw:frame draw:name="c"><draw:image xlink:href="Pictures/c.svg"/></draw:frame> and one in a box <draw:frame draw:name="d"><draw:text-box>' + P('<draw:frame draw:name="e"><draw:image xlink:href="Pictures/a.png"/></draw:frame>caption') + '</draw:text-box></draw:frame>.'), body('a'), H('Two'), body('b')].join('');
	const bytes = odt(doc, { extra: { 'Pictures/a.png': png, 'Pictures/c.svg': strToU8('<svg/>') } });
	const plan = make(bytes), files = [...plan.files.keys()].filter((f) => f.includes('/Attachments/'));
	eq(files.length, 1, 'pictures: a PNG is kept, once for each file it is');
	ok(plan.said.some((s) => /2 pictures of a kind other than PNG or JPEG/.test(s.text)), 'pictures: a chart and an SVG are counted and said');
	eq(textOf(plan).match(/!\[\[/g)?.length, 2, 'pictures: the PNG is embedded where it stood both times, in a box too');
	const flat = fodt([H('One'), P(`Inline <draw:frame draw:name="a"><draw:image><office:binary-data>${b64}</office:binary-data></draw:image></draw:frame>.`), body('a'), H('Two'), body('b')].join(''));
	const fp = make(flat, { file: 'Book.fodt' });
	const kept = [...fp.files.entries()].find(([k]) => k.includes('/Attachments/'));
	ok(!!kept && kept[0].endsWith('.png'), 'pictures: a flat file\'s picture, written in base64, is kept as a PNG');
}

// ---- refused, plainly ----
{
	eq(throws(() => readOdt(odt(H('x'), { manifest: '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="content.xml"><manifest:encryption-data/></manifest:file-entry></manifest:manifest>' }))), 'This OpenDocument file is locked with a password. Open it in LibreOffice, save it with no password, then choose that.', 'refused: a locked file');
	eq(throws(() => readOdt(odt(H('x'), { mimetype: 'application/vnd.oasis.opendocument.text-master' }))), 'This is a master document (.odm), whose chapters are files of their own. In LibreOffice, choose File, Export, and save it as one .odt, then choose that.', 'refused: a master document');
	eq(throws(() => readOdt(odt(H('x'), { mimetype: 'application/vnd.oasis.opendocument.spreadsheet' }))), 'This OpenDocument file isn’t a text document (it may be a spreadsheet or a presentation).', 'refused: a spreadsheet');
	eq(throws(() => readOdt(strToU8('not a zip at all'))), 'This isn’t an OpenDocument text file (.odt).', 'refused: not a zip');
	eq(throws(() => readOdt(zipSync({ mimetype: strToU8('application/vnd.oasis.opendocument.text') }))), 'This zip file isn’t an OpenDocument text: it has no document in it.', 'refused: no content');
	ok(throws(() => readOdt(odt(H('x')).slice(0, 200))) !== '', 'refused: a cut-short file');
	ok(/can’t be read/.test(throws(() => readOdt(odt('<text:p>open')))), 'refused: XML that isn\'t well-formed');
	ok(/document types or entities/.test(throws(() => readOdt(strToU8('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><office:document>&y;</office:document>')))), 'refused: a flat file that declares entities');
	eq(throws(() => read(odt(H('') + P('')))), 'This OpenDocument file has no text in it.', 'refused: a file with no text');
	ok(read(odt([H('One'), body('a')].join(''))).word !== undefined, 'a template (.ott) and a flat file (.fodt) are read as an .odt is');
	ok(read(odt([H('One'), body('a')].join('')), { file: 'Book.ott' }).scan.text.startsWith('# One'), 'a template is read by its name');
}

// ---- the binder's name a file gives itself: its Title-styled paragraph, else the file's name ----
{
	eq(read(odt([P('The Salt Road', 'Title'), H('One'), body('a')].join(''))).name, 'The Salt Road', 'title (odt): the Title style names the binder');
	ok(read(odt([P('The Salt Road', 'Title'), H('One'), body('a')].join(''))).titled === true, 'title (odt): and the name is marked as the file’s own');
	eq(read(odt([H('One'), body('a')].join(''))).name, 'Book', 'title (odt): with no Title, the file’s name is kept');
	eq(read(odt([P('The Salt Road: A Novel', 'Title'), body('a')].join(''))).name, 'The Salt Road A Novel', 'title (odt): made safe as a folder’s name');
	eq(read(odt([P('The Salt Road', 'Title_20_Book'), body('a')].join(''))).name, 'Book', 'title (odt): a style of another name is not the Title');
}
done('import odt');
