import { DEFAULT_SETTINGS } from '../src/settings-data';
import { decodeText, scanMarkdown, scanPlain } from '../src/import/text';
import { firstWords, nameOf, planManuscript, type ManuscriptRead } from '../src/import/manuscript';
import { inBinder, type ImportPlan } from '../src/import/plan';
import { parts } from '../src/scene-text';
import { tokens, firstDifference } from './export-words';
import { noteWords } from './export-scriv-words';
import { ok, eq, done } from './harness';

/* Markdown and plain text into a binder (src/import/text.ts, manuscript.ts): what is made, and the word-for-word
   test: the pieces joined are the text, word for word and in order. */

const enc = new TextEncoder(), dec = new TextDecoder();
const settings = { ...DEFAULT_SETTINGS };
const prose = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';
const para = (seed: string, n = 60) => `${prose(n, seed)} It was *not* what **Mara** had [[planned|hoped]].`;
const md = (text: string): ManuscriptRead => ({ name: 'Book', file: 'Book.md', origin: { path: 'Book.md' }, scan: scanMarkdown(text) });
const plain = (text: string, tabs = true): ManuscriptRead => ({ name: 'Book', file: 'Book.txt', origin: { bytes: enc.encode(text) }, scan: scanPlain(decodeText(enc.encode(text)).text, { tabs }) });
const make = (r: ManuscriptRead, o: Partial<Parameters<typeof planManuscript>[1]> = {}) => planManuscript(r, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words', ...o });
const rows = (plan: ImportPlan) => plan.notes.slice(1).filter((n) => n.title !== 'Research').map((n) => `${'  '.repeat(n.depth - 1)}${n.title}${n.folder ? '/' : ''}`).join('\n');
const text = (plan: ImportPlan, path: string) => dec.decode(plan.files.get(path));
/** The properties of a note the plan writes: its values are JSON, which is how the plan quotes them. */
function props(file: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	let list: string[] | null = null;
	for (const line of parts(file).yaml.split('\n')) {
		const item = /^ {2}- (.*)$/.exec(line), kv = /^([\w-]+|"[^"]+"):(?: (.*))?$/.exec(line);
		if (item && list) list.push(JSON.parse(item[1]));
		else if (kv) { const key = kv[1].replace(/"/g, ''); if (kv[2] === undefined || kv[2] === '') { list = []; out[key] = list; } else { out[key] = JSON.parse(kv[2]); list = null; } }
	}
	return out;
}
const binderProps = (plan: ImportPlan) => props(text(plan, `${plan.name}/${plan.name}.md`));

// ---- decoding ----
{
	eq(decodeText(enc.encode('a\r\nb\rc\n')).text, 'a\nb\nc\n', 'decode: line endings are made "\\n"');
	eq(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69])).text, 'hi', 'decode: a UTF-8 byte-order mark is not text');
	eq(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00])).text, 'hé', 'decode: UTF-16 by its mark');
	eq(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0xe9])).text, 'hé', 'decode: UTF-16 the other way');
	const old = decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
	eq(old.text, 'café', 'decode: what isn’t UTF-8 is Windows-1252');
	ok(old.said.length === 1 && /Windows-1252/.test(old.said[0]), 'decode: and said');
	eq(decodeText(enc.encode('café “x”')).said.length, 0, 'decode: UTF-8 is not said');
	let threw = false;
	try { decodeText(new Uint8Array(500).fill(1)); } catch { threw = true; }
	ok(threw, 'decode: a file that isn’t text is refused');
}

// ---- a note with clean headings ----
const clean = `---\ntags: [novel]\n---\n# The Lighthouse\n\nBy Mara.\n\n## Chapter 1: The jetty\n\n${para('a')}\n\nSecond paragraph ${prose(20, 'a2')}\n\n***\n\n${para('b')}\n\n## Chapter 2\n\n${para('c')}\n\n### A subheading\n\n${para('d')}\n\n## Chapter 3\n\n${para('e')}\n`;
{
	const { plan, found, title } = make(md(clean));
	eq(title, 'The Lighthouse', 'clean: the title is the book’s name');
	eq(found.signal, 'headings', 'clean: found by its headings');
	eq(rows(plan), 'Front matter/\n  Title page\nChapter 1 - The jetty/\n  a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11\n  b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11\nChapter 2\nChapter 3', 'clean: front matter, a chapter of two scenes as a folder named by its first words');
	const names = plan.notes.slice(1).map((n) => n.title);
	eq(names[0], 'Front matter', 'clean: front matter first');
	eq(names.slice(2, 3).join(), 'Chapter 1 - The jetty', 'clean: “Chapter 1: The jetty” is named with its separator, for export to strip the number');
	eq(names.slice(-2).join(), 'Chapter 2,Chapter 3', 'clean: a chapter of one scene is a note at the top');
	eq(binderProps(plan).structure, 'chapters and scenes', 'clean: the rule is written down, not left to be guessed');
	eq(JSON.stringify(binderProps(plan).contents), JSON.stringify(['Front matter/', 'Front matter/Title page', 'Chapter 1 - The jetty/', `Chapter 1 - The jetty/${names[3]}`, `Chapter 1 - The jetty/${names[4]}`, 'Chapter 2', 'Chapter 3']), 'clean: the binder’s order, a folder before what it holds');
	ok(plan.notes[0].folder && plan.notes[0].path === 'Book/Book.md', 'clean: the first row is the binder’s own');
	const two = plan.notes.find((n) => n.path === 'Book/Chapter 2.md');
	eq(two?.heading, 'Chapter 2', 'clean: a chapter remembers the heading it was named from');
	ok((two?.body ?? '').includes('### A subheading'), 'clean: a heading below the scenes stays in the text');
	ok(!/^# /m.test(two?.body ?? '#'), 'clean: and a name that is the heading’s words needs no heading in the text');
	ok(![...plan.files.keys()].some((p) => /tags: \[novel\]/.test(text(plan, p))), 'clean: the note’s properties are not text');
	ok(plan.said.some((s) => /properties/.test(s.text)), 'clean: and said');
	eq(plan.notes.find((n) => n.title === 'Title page')?.body, '# The Lighthouse\n\nBy Mara.\n', 'clean: the front matter is the text before the first chapter, the title among it');
	ok([...plan.files.keys()].every((p) => inBinder('Book', p)), 'clean: every file is inside the binder’s folder');
	ok(!plan.files.has('Book/Research/Research.md'), 'clean: a note in the vault is not copied');
	ok(text(plan, 'Book/Book.md').includes('Made from [[Book|Book]]. That note is unchanged.'), 'clean: the binder note links to it');
	eq(plan.sceneCount, plan.notes.filter((n) => !n.folder).length, 'clean: notes counted');
}

// ---- word for word ----
/** What the plan holds, in the binder's order: each row's heading (the name it was taken from), then its text. */
function planned(plan: ImportPlan, use: (body: string) => string[] = (b) => noteWords(b).body): string[] {
	return plan.notes.slice(1).flatMap((n) => [...(n.heading ? tokens(n.heading) : []), ...use(n.heading ? n.body.replace(new RegExp(`^# ${n.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\n`), '') : n.body)]);
}
const sourceMd = (t: string) => noteWords(t.replace(/^---\n[\s\S]*?\n---\n/, '')).body;
{
	const { plan } = make(md(clean));
	eq(firstDifference(sourceMd(clean), planned(plan)), null, 'words: a note’s pieces are its words, in order');
	// the test notices what it should
	const rowsOf = plan.notes.slice(1);
	const dropped = planned({ ...plan, notes: [plan.notes[0], ...rowsOf.map((n, i) => (i === 3 ? { ...n, body: n.body.replace(/^.*\n\n/, '') } : n))] } as ImportPlan);
	ok(firstDifference(sourceMd(clean), dropped) !== null, 'words: and notices a dropped paragraph');
	const at = rowsOf.findIndex((n) => n.path === 'Book/Chapter 2.md');
	const swapped = [...rowsOf];
	[swapped[at], swapped[at + 1]] = [swapped[at + 1], swapped[at]];
	ok(firstDifference(sourceMd(clean), planned({ ...plan, notes: [plan.notes[0], ...swapped] } as ImportPlan)) !== null, 'words: and two swapped chapters');
	ok(firstDifference(sourceMd(clean), [...planned(plan), 'extra']) !== null, 'words: and a word added');
	// byte for byte: every line of the source that was not a heading made a name, or a mark that became a boundary, is in a note
	const src = clean.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n').filter((l) => l.trim() && !/^## Chapter|^\*\*\*$/.test(l));
	const got = plan.notes.flatMap((n) => n.body.split('\n')).filter((l) => l.trim());
	eq(got.join('\n'), src.join('\n'), 'bytes: the lines of the pieces are the lines of the source, byte for byte, apart from the headings that became names');
}

// ---- a note with "Chapter N" lines and no headings ----
{
	const lines = `Chapter 1\n\n${para('a')}\n\nChapter 2\n\n${para('b')}\n\n**Chapter 3**\n\n${para('c')}\n`;
	const { plan, found } = make(md(lines));
	eq(found.signal, 'titles', 'lines: found by what they read as');
	eq(rows(plan), 'Chapter 1\nChapter 2\nChapter 3', 'lines: a note each, no folders');
	eq(binderProps(plan).structure, 'every note a chapter', 'lines: and the rule is every note a chapter');
	eq(firstDifference(sourceMd(lines), planned(plan)), null, 'lines: word for word');
	eq(plan.notes.find((n) => n.title === 'Chapter 3')?.heading, '**Chapter 3**', 'lines: the exact line is kept');
	ok(!/Chapter 3/.test(plan.notes.find((n) => n.title === 'Chapter 3')?.body ?? ''), 'lines: it is the name, not the text');
}

// ---- nothing found ----
{
	const flat = `${para('a', 200)}\n\n${para('b', 200)}\n`;
	const { plan, found } = make(md(flat));
	eq(found.signal, 'none', 'none: nothing found');
	eq(rows(plan), 'Manuscript', 'none: one note');
	eq(text(plan, 'Book/Manuscript.md'), flat, 'none: with the text exactly');
	ok(plan.said.some((s) => /No chapters were found/.test(s.text)), 'none: and says so');
	// scenes only
	const scenes = make(md(`${para('a')}\n\n***\n\n${para('b')}\n\n***\n\n${para('c')}\n`));
	eq(scenes.plan.notes.filter((n) => !n.folder).length, 3, 'none: marks make scenes');
	eq(scenes.plan.notes[1].title, 'Chapter 1', 'none: in a folder that export gives no title');
	eq(binderProps(scenes.plan).structure, 'chapters and scenes', 'none: of a chapter');
	eq(make(md(`${para('a')}\n\n***\n\n${para('b')}\n`), { choices: { breaks: 'keep' } }).plan.notes.filter((n) => !n.folder).length, 1, 'none: or kept in the text');
}

// ---- parts ----
{
	const parts3 = `# Part One\n\n## A\n\n${para('a')}\n\n## B\n\n${para('b')}\n\n# Part Two\n\n## C\n\n${para('c')}\n`;
	const { plan } = make(md(parts3));
	eq(rows(plan), 'Part One/\n  A\n  B\nPart Two/\n  C', 'parts: a folder each, their chapters notes');
	eq(binderProps(plan).structure, 'parts and chapters', 'parts: parts and chapters');
	const deep = make(md(`# Part One\n\n## A\n\n${para('a')}\n\n***\n\n${para('b')}\n\n## B\n\n${para('c')}\n\n# Part Two\n\n## C\n\n${para('d')}\n`)).plan;
	eq(binderProps(deep).structure, 'parts, chapters and scenes', 'parts: with scenes in a chapter, three levels');
	eq(firstDifference(sourceMd(parts3), planned(plan)), null, 'parts: word for word');
}

// ---- names ----
{
	eq(nameOf('Chapter 12: The Storm'), 'Chapter 12 - The Storm', 'names: a number and its title');
	eq(nameOf('CHAPTER XII'), 'Chapter XII', 'names: capitals become a title, a Roman numeral stays');
	eq(nameOf('THE END OF THE ROAD'), 'The End of the Road', 'names: with small words small');
	eq(nameOf('*Italic* and [[Link|text]]'), 'Italic and text', 'names: marks off');
	eq(nameOf('Mixed Case stays'), 'Mixed Case stays', 'names: other cases are the writer’s');
	eq(firstWords('Mara arrived at the jetty a little after midnight, with the tide.'), 'Mara arrived at the jetty a little after', 'names: a scene’s first words, up to about forty characters, at a word’s end');
	const tricky = make(md(`## What? A "title"\n\n${para('a')}\n\n## What? A "title"\n\n${para('b')}\n\n## ../../escape\n\n${para('c')}\n\n## CON\n\n${para('d')}\n`)).plan;
	ok(tricky.notes.slice(1).every((n) => inBinder('Book', n.path)), 'names: no title leaves the folder');
	eq(new Set(tricky.notes.map((n) => n.path.toLowerCase())).size, tricky.notes.length, 'names: and two of one name are told apart');
	const t = tricky.notes.find((n) => n.heading === '## What'.slice(3) + '? A "title"' && n.title.endsWith('2'));
	ok(!!t && t.body.startsWith('# What? A "title"\n\n'), 'names: a note whose name is not its heading keeps the heading as its first line');
	// a folder can’t: said
	const folder = make(md(`## What? One\n\n${para('a')}\n\n***\n\n${para('b')}\n\n## Two\n\n${para('c')}\n`)).plan;
	ok(folder.said.some((s) => s.name === 'What? One' && /folder/.test(s.text)) === false, 'names: a ? is not a word, so the folder’s name needs no saying');
	const long = make(md(`## ${'word '.repeat(40)}end\n\n${para('a')}\n\n***\n\n${para('b')}\n\n## Two\n\n${para('c')}\n`)).plan;
	ok(long.said.some((s) => /folder/.test(s.text)), 'names: a heading a folder can’t hold as it is is said');
	// scenes: by number
	const num = make(md(`## A\n\n${para('a')}\n\n***\n\n${para('b')}\n\n## B\n\n${para('c')}\n`), { scenes: 'numbers' }).plan;
	eq(rows(num), 'A/\n  Scene 1\n  Scene 2\nB', 'names: or Scene 1, Scene 2');
}

// ---- plain text ----
{
	const wrap = (t: string, w = 66) => { const out: string[] = []; let line = ''; for (const word of t.split(' ')) { if (`${line} ${word}`.trim().length > w) { out.push(line); line = word; } else line = `${line} ${word}`.trim(); } out.push(line); return out.join('\n'); };
	const wrapped = `CHAPTER ONE\n\n${wrap(prose(60, 'a'))}\n\n${wrap(prose(60, 'b'))}\n\nCHAPTER TWO\n\n  It was * a # test_ with _marks [x]. ${prose(20, 'm')}\n\n\tTabbed paragraph ${prose(30, 'tab')}\n`;
	const on = plain(wrapped, true), off = plain(wrapped, false);
	const { plan } = make(on);
	eq(rows(plan), 'Chapter One\nChapter Two', 'plain: chapters from lines in capitals');
	ok(plan.notes[1].body.trimEnd().split('\n\n').length === 2 && plan.notes[1].body.trimEnd().split('\n\n').every((q) => !q.includes('\n')), 'plain: a hard-wrapped paragraph is one line');
	ok(plan.notes[2].body.includes('\\*') && plan.notes[2].body.includes('\\[x]'), 'plain: what Markdown would take for markup is escaped');
	ok(plan.notes[2].body.includes('\n\n\tTabbed'), 'plain: a tab kept when the setting is on');
	ok(!make(off).plan.notes[2].body.includes('\t') && make(off).plan.said.some((s) => /tab/.test(s.text)), 'plain: dropped and said when it is off');
	eq(firstDifference(tokens(wrapped), planned(plan, tokens)), null, 'plain: word for word');
	const stacked = plain(`CHAPTER ONE\n${prose(40, 'a')}\n\nCHAPTER TWO\n${prose(40, 'b')}\n`);
	eq(rows(make(stacked).plan), 'Chapter One\nChapter Two', 'plain: a title directly over its text is still a title');
	const several = plain(`${prose(40, 'a')}\nsecond line ${prose(3, 'x')}\n`);
	ok(make(several).plan.notes[1].body.includes('  \n'), 'plain: short lines inside a paragraph stay lines');
	// a text with a form feed: a page
	const pages = plain(`\f\n    THE STORM\n\n${prose(40, 'a')}\n\f\n    THE CALM\n\n${prose(40, 'b')}\n`);
	eq(make(pages).found.signal, 'pages', 'plain: a form feed is a page break');
}

// ---- Markdown details ----
{
	const fenced = `## One\n\n${para('a')}\n\n\`\`\`\n## not a heading\n\`\`\`\n\n%% \n## nor this\n%%\n\n## Two\n\n${para('b')}\n`;
	eq(rows(make(md(fenced)).plan), 'One\nTwo', 'markdown: a heading in code or a comment is not one');
	ok(make(md(fenced)).plan.files.get('Book/One.md') !== undefined && text(make(md(fenced)).plan, 'Book/One.md').includes('## not a heading') && text(make(md(fenced)).plan, 'Book/One.md').includes('## nor this'), 'markdown: and stays in the text');
	const tag = make(md(`## One\n\n#tag line ${prose(100, 'a')}\n\n## Two\n\n${prose(100, 'b')}\n`)).plan;
	ok(tag.notes[1].body.startsWith('#tag line'), 'markdown: a tag is not a heading');
	const setext = make(md(`Title\n---\n${prose(300, 'a')}\n`)).plan;
	eq(setext.notes.length, 2, 'markdown: a rule under a line of text is not a scene break');
	const unclosed = make(md(`## One\n\n\`\`\`\n${prose(50, 'a')}\n`));
	eq(unclosed.found.signal, 'none', 'markdown: an unclosed fence runs to the end');
	const definitions = make(md(`## One\n\nText[^1] ${prose(100, 'a')}\n\n## Two\n\n${prose(100, 'b')}\n\n[^1]: A note.\n`)).plan;
	ok(definitions.said.some((s) => /footnotes written out/.test(s.text)), 'markdown: footnotes at the foot are said');
	const bom = scanMarkdown(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('## A\n\nx\n\n## B\n\ny\n')])).text);
	eq(bom.units[0].text, 'A', 'markdown: a byte-order mark does not hide the first heading');
}

// ---- the original ----
{
	const fromDevice = make(plain(`CHAPTER ONE\n\n${prose(50, 'a')}\n\nCHAPTER TWO\n\n${prose(50, 'b')}\n`)).plan;
	ok(fromDevice.files.has('Book/Research/Originals/Book.txt'), 'original: a file from the device is kept in Research/Originals');
	eq(dec.decode(fromDevice.files.get('Book/Research/Originals/Book.txt')), `CHAPTER ONE\n\n${prose(50, 'a')}\n\nCHAPTER TWO\n\n${prose(50, 'b')}\n`, 'original: as it was');
	eq(props(text(fromDevice, 'Book/Research/Research.md')).export, false, 'original: Research is left out of exports');
	ok((binderProps(fromDevice).contents as string[]).includes('Research/'), 'original: and is in the binder’s order');
	const note = make({ ...md(`## A\n\n${prose(300, 'a')}\n\n## B\n\n${prose(300, 'b')}\n`), file: 'My Book.md', origin: { bytes: enc.encode('x') } }).plan;
	ok(note.files.has('Book/Research/Originals/My Book.md.original'), 'original: a Markdown file keeps its text but not its ending: it is not a second note of the binder');
}

// ---- a folder in a folder, and the name ----
{
	const { plan } = make(md(`## A\n\n${prose(300, 'a')}\n\n## B\n\n${prose(300, 'b')}\n`), { name: 'The ../Odd: name', parent: 'Books' });
	ok(!plan.name.includes('/') && !plan.name.includes(':'), 'name: a binder’s name is made safe');
	ok([...plan.files.keys()].every((p) => inBinder(`Books/${plan.name}`, p)), 'name: and everything is under it');
	ok(plan.folders[0] === `Books/${plan.name}`, 'name: the folder is made first');
}

// ---- a long book, in time ----
{
	const chapters = Array.from({ length: 60 }, (_, c) => `## Chapter ${c + 1}\n\n${Array.from({ length: 160 }, (_, p) => prose(21, `c${c}p${p}w`)).join('\n\n')}\n`).join('\n');
	const t0 = Date.now();
	const { plan } = make(md(chapters));
	const spent = Date.now() - t0;
	eq(plan.notes.filter((n) => !n.folder).length, 60, 'long: sixty chapters');
	ok(spent < 4000, `long: 200,000 words are read and planned in time (${spent} ms)`);
	eq(firstDifference(tokens(chapters), planned(plan, tokens)), null, 'long: word for word');
}
done('import manuscript');
