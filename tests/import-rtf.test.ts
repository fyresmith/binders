import { readFileSync } from 'fs';
import { strToU8 } from 'fflate';
import { DEFAULT_SETTINGS } from '../src/settings-data';
import { readRtfDocument } from '../src/import/rtf-doc';
import { readDocument } from '../src/import/docx';
import { planManuscript, type ManuscriptOptions } from '../src/import/manuscript';
import type { ImportPlan } from '../src/import/plan';
import { firstDifference, tokens } from './export-words';
import { plannedWords } from './import-words';
import { ok, eq, done } from './harness';

/* The rich text import (src/import/rtf-doc.ts) on files written by hand, each in the way one program writes rich
   text: Word's and LibreOffice's style sheet ("heading 1", an outline level), its notes, comments in the margin,
   tracked changes, fields, list labels, hidden text, sections, pictures and code pages; and TextEdit's, which has
   no styles at all. The words are held to the words each file was written from (`want`), not to a second reader.
   The files LibreOffice wrote itself are tests/import-libreoffice.test.ts. */

const settings = { ...DEFAULT_SETTINGS };
const STYLESHEET = '{\\stylesheet{\\ql \\fs24 Normal;}{\\s1\\ql\\outlinelevel0\\b\\fs32 heading 1;}{\\s2\\ql\\outlinelevel1\\b\\fs28 heading 2;}{\\s3\\qc\\b\\fs48 Title;}{\\s4\\b\\fs32 Heading 1;}{\\s5\\fi0\\li720\\ri720 Quote;}{\\*\\cs10 Default Paragraph Font;}}';
const rtf = (body: string, o: { sheet?: string; head?: string } = {}): Uint8Array => strToU8(`{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fnil\\fcharset204 Arial Cyr;}}${o.sheet ?? STYLESHEET}${o.head ?? ''}\n${body}}`);
const esc = (s: string) => s.replace(/[\\{}]/g, (c) => `\\${c}`);
const words = (n: number, seed: string): string => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';
/** A paragraph in a style. */
const P = (t: string, s = 0, more = '') => `\\pard\\plain\\s${s}${more} ${t}\\par\n`;
const H = (t: string, level = 1) => P(esc(t), level);
const body = (seed: string, n = 120) => P(words(n, seed));

const throws = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof Error ? e.message : String(e); } return ''; };
const read = (bytes: Uint8Array, o: { tabs?: boolean; revisions?: 'final' | 'original'; comments?: boolean; underline?: 'plain' | 'italic'; file?: string } = {}) => readDocument(bytes, o.file ?? 'Book.rtf', { bytes }, { tabs: o.tabs ?? true, ...o });
const run = (bytes: Uint8Array, o: Partial<ManuscriptOptions> & Parameters<typeof read>[1] = {}) => planManuscript(read(bytes, o), { name: 'Book', parent: '', settings, choices: {}, scenes: 'words', ...o });
const make = (bytes: Uint8Array, o: Parameters<typeof run>[1] = {}): ImportPlan => run(bytes, o).plan;
const rows = (plan: ImportPlan) => plan.notes.slice(1).filter((n) => n.title !== 'Research').map((n) => `${'  '.repeat(n.depth - 1)}${n.title}${n.folder ? '/' : ''}`).join('\n');
const textOf = (plan: ImportPlan) => plan.notes.map((n) => n.body).join('\n');
/** The word-for-word check, against the words the file was written from. */
function same(plan: ImportPlan, want: string, notes: string, what: string): void {
	const got = plannedWords(plan), b = firstDifference(tokens(want), got.body), n = firstDifference(tokens(notes), got.notes);
	ok(!b, `${what}: every word, in order${b ? ` (${b})` : ''}`);
	ok(!n, `${what}: every word of the footnotes, in order${n ? ` (${n})` : ''}`);
}

// ---- headings: by the style sheet's names and outline levels ----
{
	const bytes = rtf([P('The Salt Road', 3), H('One'), body('a'), H('Two'), body('b'), P('Three', 4), body('c')].join(''));
	const plan = make(bytes);
	eq(rows(plan), 'Front matter/\n  Title page\nOne\nTwo\nThree', 'headings: by outline level, and by the style\'s name alone (LibreOffice writes no level); the title is front matter');
	same(plan, ['The Salt Road One', words(120, 'a'), 'Two', words(120, 'b'), 'Three', words(120, 'c')].join(' '), '', 'headings');
	ok(read(bytes).scan.text.includes('# One\n\n'), 'headings: the style\'s own bold, written on its runs as well, isn\'t written into the name');
	const scenes = rtf([H('One'), H('Scene a', 2), body('a'), H('Scene b', 2), body('b'), H('Two'), H('Scene c', 2), body('c'), H('Scene d', 2), body('d')].join(''));
	eq(rows(make(scenes)), 'One/\n  Scene a\n  Scene b\nTwo/\n  Scene c\n  Scene d', 'headings: a second level is scenes');
}

// ---- formatting, characters and code pages ----
{
	const bytes = rtf([H('One'), P('Plain {\\i italic} and {\\b bold} and {\\strike struck}, {\\b\\i both}\\plain  plain again.'), P('Caf\\\'e9 \\\'93quoted\\\'94 \\u8217? \\emdash  \\endash  a\\~b \\ldblquote x\\rdblquote  {\\uc2\\u8364 EUcafe}'), P('{\\f1 \\\'cf\\\'f0\\\'e8\\\'e2\\\'e5\\\'f2}'), P('{\\field{\\*\\fldinst HYPERLINK "https://example.org/a"}{\\fldrslt {\\ul\\cf2 a link}}} and {\\field{\\*\\fldinst PAGE}{\\fldrslt 7}}.'), body('a'), H('Two'), body('b')].join(''));
	const r = read(bytes), text = r.scan.text;
	ok(text.includes('Plain *italic* and **bold** and ~~struck~~, ***both*** plain again.'), 'formatting: italic, bold, struck, and \\plain ends them');
	ok(text.includes('Café “quoted” ’ — – a b “x” €cafe'), 'characters: the code page, Unicode with its stand-in skipped by \\uc, and the named marks');
	ok(text.includes('Привет'), 'characters: a font\'s own character set (Cyrillic)');
	ok(text.includes('[a link](https://example.org/a) and 7.'), 'fields: a link is a link, its underlining isn\'t italics; another field is what it shows');
	eq(r.word?.hasUnderline, false, 'fields: a link\'s underlining isn\'t counted as the writer\'s');
	const ul = rtf([H('One'), P('It was {\\ul never} so.'), body('a'), H('Two'), body('b')].join(''));
	ok(read(ul).scan.text.includes('It was *never* so.'), 'formatting: underlining is read as italics in a file with no italics');
}

// ---- notes and comments ----
{
	const doc = [H('One'), P('Before{\\super\\chftn}{\\footnote\\pard\\plain {\\super\\chftn} A footnote.} after, and marked words{\\*\\atnid AB}{\\*\\atnauthor Ann}\\chatn{\\*\\annotation{\\*\\atnref 1}\\pard\\plain Check this.} more.'), P('An end{\\super\\chftn}{\\footnote\\ftnalt\\pard\\plain An endnote.}.'), body('a'), H('Two'), body('b')].join('');
	const bytes = rtf(doc), r = read(bytes);
	ok(r.scan.text.includes('Before^[A footnote.] after, and marked words%%Ann: Check this.%% more.'), 'notes: a footnote in place, a comment where Word writes it (at the end of its range)');
	ok(r.scan.text.includes('An end^[An endnote.].'), 'notes: an endnote is a footnote, and said');
	ok(r.scan.said.includes('Endnotes come in as footnotes.'), 'notes: said');
	eq(r.word?.comments, 1, 'comments: counted, so the dialog offers the choice');
	ok(!read(bytes, { comments: false }).scan.text.includes('%%'), 'comments: off, none come in');
	same(make(bytes), ['One Before after and marked words Ann Check this more An end', words(120, 'a'), 'Two', words(120, 'b')].join(' '), 'A footnote An endnote', 'notes and comments');
}

// ---- tracked changes, accepted and rejected ----
{
	const doc = [H('One'), P('Kept {\\revised added }{\\deleted cut }end.'), `\\pard\\plain Joined {\\deleted\\par}\\pard\\plain to this.\\par\n`, body('a'), H('Two'), body('b')].join('');
	const bytes = rtf(doc);
	const final = read(bytes), original = read(bytes, { revisions: 'original' });
	ok(final.scan.text.includes('Kept added end.\n\nJoined to this.'), 'changes: accepted, inserted words in, deleted words and a deleted paragraph mark out');
	ok(original.scan.text.includes('Kept cut end.\n\nJoined \n\nto this.') || original.scan.text.includes('Kept cut end.\n\nJoined\n\nto this.'), 'changes: rejected, the deleted words and the paragraph mark are back, the inserted words gone');
	eq(final.word?.revisions, 3, 'changes: counted, so the dialog offers Accept all and Reject all');
	same(make(bytes), ['One Kept added end Joined to this', words(120, 'a'), 'Two', words(120, 'b')].join(' '), '', 'changes accepted');
	same(make(bytes, { revisions: 'original' }), ['One Kept cut end Joined to this', words(120, 'a'), 'Two', words(120, 'b')].join(' '), '', 'changes rejected');
}

// ---- lists, quotes, tables, numbered headings, hidden text ----
{
	const doc = [
		H('One'), body('a'),
		`\\pard\\plain\\ls1\\ilvl0 {\\listtext\\'95\\tab}a bullet\\par\n`, `\\pard\\plain\\ls1\\ilvl1 {\\listtext o\\tab}nested\\par\n`,
		`\\pard\\plain\\ls2\\ilvl0 {\\listtext 1.\\tab}first\\par\n`, `\\pard\\plain\\ls2\\ilvl0 {\\listtext 2.\\tab}second\\par\n`,
		P('Quoted at length.', 5),
		`\\trowd\\cellx3000\\cellx6000\\pard\\plain\\intbl cell one\\cell cell two\\cell\\row\n`,
		P('Seen {\\v unseen }and seen.'), P('{\\v All of this paragraph.}'),
		`\\pard\\plain\\s1\\ls3 {\\listtext Chapter 2\\tab}\\par\n`, body('b'), H('Three'), body('c'),
	].join('');
	const bytes = rtf(doc), r = read(bytes), text = r.scan.text;
	ok(text.includes('- a bullet\n  - nested\n1. first\n1. second'), 'lists: the labels written out are bullets and numbers, nested by level, and aren\'t words');
	ok(text.includes('> Quoted at length.'), 'quotes: a paragraph indented both sides is a quote');
	ok(text.includes('cell one\n\ncell two') && r.scan.said.some((s) => /table comes in as its text/.test(s)), 'tables: their text, cell after cell, and said');
	ok(text.includes('Seen and seen.') && !/unseen|All of this/.test(text), 'hidden: hidden text isn\'t brought in');
	ok(r.scan.said.includes('This file has hidden text in 2 places. It isn’t brought in; the original file keeps it.'), 'hidden: how many places is said');
	const plan = make(bytes);
	eq(rows(plan), 'One\nChapter 2\nThree', 'numbered headings: a heading with only its number still starts a chapter, named by its place');
	same(plan, ['One', words(120, 'a'), 'a bullet nested first second Quoted at length cell one cell two Seen and seen', words(120, 'b'), 'Three', words(120, 'c')].join(' '), '', 'lists and the rest');
}

// ---- sections and page breaks ----
{
	const line = (t: string) => `\\pard\\plain\\qc\\b ${t}\\par\n`;
	const doc = [line('The Storm'), body('a'), '\\sect\\sectd\\sbknone\n', line('Not a page'), body('x', 20), '\\sect\\sectd\n', line('The Calm'), body('b'), `\\pard\\plain\\qc\\b\\page The End\\par\n`, body('c')].join('');
	const { found, plan } = run(rtf(doc));
	eq(found.signal, 'pages', 'pages: a section that starts a page, and \\page, start chapters');
	eq(rows(plan), 'Front matter/\n  Title page\nThe Calm\nThe End', 'pages: a section with no break (\\sbknone) is no page break');
	const sized = ['The Storm', 'The Calm', 'The End'].map((t, k) => `\\pard\\plain${k ? '\\pagebb' : ''}\\fs40 ${t}\\par\n${body(`s${k}`)}`).join('');
	eq(rows(make(rtf(sized))), 'Front matter/\n  Title page\nThe Calm\nThe End', 'larger text: plain lines twice the size after page breaks start chapters');
}

// ---- pictures and what isn't the text ----
{
	const png = '89504e470d0a1a0a0102', doc = [H('One'), P(`Here {\\*\\shppict{\\pict\\pngblip\\picw10\\pich10 ${png}}}{\\nonshppict{\\pict\\wmetafile8 0102}} and {\\pict\\wmetafile8 0a0b}.`), body('a'), H('Two'), body('b')].join('');
	const plan = make(rtf(doc, { head: '{\\header \\pard\\plain Page header\\par}{\\info{\\title A title}{\\author Ann}}{\\*\\generator Microsoft Word 16;}' }));
	eq([...plan.files.keys()].filter((f) => f.includes('/Attachments/')).length, 1, 'pictures: a PNG is kept, its stand-in for older readers isn\'t');
	ok(plan.said.some((s) => /1 picture of a kind other than PNG or JPEG/.test(s.text)), 'pictures: a metafile is counted and said');
	ok(!/Page header|A title/.test(textOf(plan)) && plan.said.some((s) => /Headers and footers/.test(s.text)), 'headers: not brought in, and said; the file\'s own information isn\'t text');
}

// ---- TextEdit: no styles; chapters are lines like "Chapter One" ----
{
	const bytes = new Uint8Array(readFileSync('tests/fixtures/import/libreoffice/source/salt-road-textedit.rtf'));
	const { found, plan } = run(bytes);
	eq(found.signal, 'titles', 'TextEdit: chapters by their lines');
	eq(rows(plan), 'Front matter/\n  Title page\nChapter One/\n  Mara came down to the jetty before the\n  By noon the wind had come round to the\nChapter Two\nChapter Three/\n  It broke a little after midnight. The\n  In the morning the jetty was gone. Not', 'TextEdit: three chapters, the first and last of two scenes at the * between them');
	const text = textOf(plan);
	ok(text.includes('\tShe counted them, as her father had taught her. *Nineteen.* There had been twenty the week before.'), 'TextEdit: a paragraph begun with a tab keeps it, italics by \\i, the curly quotes of its code page');
	ok(!textOf(make(bytes, { tabs: false })).includes('\tShe'), 'TextEdit: without "Start a paragraph with a tab", the tabs go, and that is said');
}

// ---- real files: what programs really write around the document ----
{
	const good = [H('One'), body('a')].join('');
	const want = ['One', words(120, 'a')].join(' ');
	// Evernote and some clipboards end the file with a NUL after the last brace; Word and LibreOffice read it all the same
	same(make(new Uint8Array([...rtf(good), 0])), want, '', 'a NUL after the last brace');
	same(make(new Uint8Array([...rtf(good), 13, 10, 0, 0])), want, '', 'a line end and NULs after the last brace');
	// a "}" with no "{" closes the document early (LibreOffice's and Word's readers skip it; the words after it are the writer's):
	// every word is kept, and it is said
	const stray = strToU8(new TextDecoder().decode(rtf(P('Before the brace.') + '}' + P('After the brace.'))));
	const strayPlan = make(stray);
	same(strayPlan, 'Before the brace. After the brace.', '', 'a closing brace with no opening one in the middle');
	ok(strayPlan.said.some((s) => /closing brace/.test(s.text)), 'a closing brace with no opening one is said');
	// but not a file that is cut short
	eq(throws(() => readRtfDocument(strToU8('{\\rtf1\\ansi Hello'))), 'This rich text file can’t be read: the file is cut short.', 'a file with its last brace missing is still cut short');
	// some programs write no version number, "{\rtf\ansi" (LibreOffice and Word read it)
	const bare = strToU8(new TextDecoder().decode(rtf(good)).replace('{\\rtf1', '{\\rtf'));
	same(make(bare), want, '', 'a header with no version number');
}

// ---- refused, plainly ----
{
	eq(throws(() => readRtfDocument(strToU8('Just some text'))), 'This rich text file can’t be read: the file isn’t rich text.', 'refused: not rich text');
	eq(throws(() => readRtfDocument(strToU8('{\\rtf1 cut short'))), 'This rich text file can’t be read: the file is cut short.', 'refused: cut short');
	eq(throws(() => read(rtf(H('') + P('')))), 'This rich text file has no text in it.', 'refused: no text');
	ok(read(rtf([H('One'), body('a')].join('')), { file: 'Book.doc' }).scan.text.startsWith('# One'), 'a ".doc" that is really rich text (Word saves one so) is read as rich text');
}

// ---- the binder's name a file gives itself: its Title-styled paragraph, else the file's name ----
{
	eq(read(rtf([P('The Salt Road', 3), H('One'), body('a')].join(''))).name, 'The Salt Road', 'title (rtf): the style sheet’s Title names the binder');
	ok(read(rtf([P('The Salt Road', 3), H('One'), body('a')].join(''))).titled === true, 'title (rtf): and the name is marked as the file’s own');
	eq(read(rtf([H('One'), body('a')].join(''))).name, 'Book', 'title (rtf): with no Title, the file’s name is kept');
	eq(read(rtf([P('The Salt Road', 3), body('a')].join(''))).name, 'The Salt Road','title (rtf): a file’s name does not matter when it has a Title');
	eq(read(rtf([H('The Salt Road', 1), body('a')].join(''))).name, 'Book', 'title (rtf): a heading is not the Title');
}
done('import rtf');
