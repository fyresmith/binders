import { buildBook } from '../src/export/book';
import { needs, parseBody, parseNote } from '../src/export/markdown';
import { blocksText, numberWords, plain, type Block, type Inline } from '../src/export/model';
import { pictureOf } from '../src/export/picture';
import { assignRoles, guessStructure, readRole, readStructure, titleFrom, type SourceItem } from '../src/export/roles';
import { typeset } from '../src/export/typography';
import { tabLines } from '../src/paragraphs/text';
import { done, eq, ok } from './harness';

const kinds = (blocks: Block[]) => blocks.map((b) => b.kind).join(' ');
const texts = (given: Block[] | { blocks: Block[] }) => (Array.isArray(given) ? given : given.blocks).map((b) => (b.kind === 'p' || b.kind === 'heading' ? plain(b.runs) : `<${b.kind}>`));
const p = (text: string) => parseBody(text);
const run = (text: string, at = 0): Inline[] => { const b = p(text).blocks[at]; return b.kind === 'p' || b.kind === 'heading' ? b.runs : []; };

// paragraphs: a blank line or a new line starts one; two spaces or a backslash break a line inside one
{
	eq(texts(p('One.\nTwo.\n\nThree.')).join('|'), 'One.|Two.|Three.', 'a new line is a new paragraph');
	eq(run('Line one  \nline two').map((r) => r.kind).join(' '), 'text br text', 'two spaces at a line’s end break the line');
	eq(run('Line one\\\nline two').map((r) => r.kind).join(' '), 'text br text', 'a backslash at a line’s end breaks the line');
	eq(texts(parseNote('---\nstatus: draft\n---\nText.')).join('|'), 'Text.', 'properties are never exported');
	eq(texts(p('A\r\nB\rC')).join('|'), 'A|B|C', 'every kind of line ending');
}

// a line begun with a tab or spaces is a paragraph, never code; only a fenced block is code
{
	const text = '\tFirst.\n\tSecond.\n\n    Third, with spaces.\n\n```\n\tcode stays\n```\n';
	const b = p(text).blocks;
	eq(kinds(b), 'p p p code', 'tab-led lines are paragraphs, the fence is code');
	eq(texts(b).slice(0, 3).join('|'), 'First.|Second.|Third, with spaces.', 'their indent is dropped');
	eq(b[3].kind === 'code' ? b[3].text : '', '\tcode stays', 'code is as typed');
	// every line `tabLines` names comes out as a paragraph of its own
	const lines = text.split('\n'), named = tabLines(text).map((n) => lines[n].trim());
	ok(named.length === 3 && named.every((l) => texts(b).includes(l)), 'the lines tabLines names are paragraphs');
}

// marks
{
	const r = run('Plain *it* **bold** ~~gone~~ `code` ==lit== end.');
	const of = (t: string) => r.find((x) => x.kind === 'text' && x.text.includes(t)) as Extract<Inline, { kind: 'text' }>;
	ok(of('it').i === true && of('bold').b === true && of('gone').s === true && of('code').code === true, 'italic, bold, struck, code');
	ok(plain(r).includes(' lit ') && !plain(r).includes('=='), 'a highlight is its words');
	eq(plain(run('a %%hidden%% b <!-- also --> c')), 'a  b  c', 'comments are left out');
	eq(plain(run('`%%kept%%` and `[[not a link]]`')), '%%kept%% and [[not a link]]', 'code keeps its marks');
}

// links, embeds, pictures
{
	const r = run('See [[Arrival]], [[Part One/The keeper|him]], [[Arrival#The jetty]] and [site](https://example.com).');
	eq(plain(r), 'See Arrival, him, Arrival > The jetty and site.', 'a link is its words');
	const link = r.find((x) => x.kind === 'text' && x.text === 'him') as Extract<Inline, { kind: 'text' }>;
	eq(link.to, 'Part One/The keeper', 'and remembers its note');
	eq((r.find((x) => x.kind === 'text' && x.text === 'site') as Extract<Inline, { kind: 'text' }>).href, 'https://example.com', 'a web link keeps its address');
	const b = p('Before ![[chart.png|300]] after.\n\n![alt words](pics/map.png)\n\n![[Other note]]').blocks;
	eq(kinds(b), 'p embed p image embed', 'an embed or a picture stands between paragraphs');
	const n = needs(p('![[a.png]]\n\n> ![[Quoted]]\n\n![x](b.jpg)'));
	eq(n.embeds.join(','), 'a.png,Quoted', 'what a note embeds');
	eq(n.images.join(','), 'b.jpg', 'and the pictures it shows');
	eq(plain(run('| a | b |\n|---|---|\n| [[N\\|shown]] | x |', 0)), '', 'a table is not a paragraph');
	const t = p('| a | b |\n|---|---|\n| [[N\\|shown]] | x |').blocks[0];
	eq(t.kind === 'table' ? t.rows.map((row) => row.map(plain).join(',')).join(';') : '', 'a,b;shown,x', 'a table, and a link in it');
}

// footnotes
{
	const d = p('First[^b] and second[^a] and inline^[Said *here*.].\n\n[^a]: Note A.\n[^b]: Note B,\n    on two lines.\n[^c]: Unused.');
	eq(d.blocks.length, 1, 'definitions are not paragraphs');
	eq(run('x[^1]\n\n[^1]: n').filter((r) => r.kind === 'note').length, 1, 'a mark');
	eq(d.notes.map(blocksText).join('|'), 'Note B,\non two lines.|Note A.|Said here.', 'footnotes in the order of their marks');
	ok(d.warnings.some((w) => w.includes('nothing in the text points at')), 'an unused footnote is said');
	eq(plain(run('Costs $5 and $10, or [^nope].')), 'Costs $5 and $10, or [^nope].', 'prices and a mark with no note are text');
}

// scene breaks, headings, quotations, callouts, lists
{
	eq(kinds(p('One.\n---\nTwo.\n\n***\n\n___\n\n#\n\nThree.').blocks), 'p break p break break break p', 'a rule is a scene break, never a heading of the line above');
	const h = p('## A *sub*heading\n\nText.').blocks[0];
	ok(h.kind === 'heading' && h.level === 2 && plain(h.runs) === 'A subheading', 'a heading is a subheading');
	const q = p('> Quoted line.\n> Second.').blocks[0];
	ok(q.kind === 'quote' && !q.title && texts(q.blocks).join('|') === 'Quoted line.|Second.', 'a quotation');
	const c = p('> [!note]- A title\n> Its text.').blocks[0];
	ok(c.kind === 'quote' && plain(c.title ?? []) === 'A title' && texts(c.blocks).join('|') === 'Its text.', 'a callout is a quotation with a title');
	const bare = p('> [!quote]\n> Only text.').blocks[0];
	ok(bare.kind === 'quote' && !bare.title && texts(bare.blocks).join('|') === 'Only text.', 'a callout without a title has none');
	const l = p('3. three\n4. four\n   - inner').blocks[0];
	ok(l.kind === 'list' && l.ordered && l.start === 3 && l.items.length === 2 && kinds(l.items[1]) === 'p list', 'a list, numbered from where it starts, with one inside');
}

// tags, block ids, math, HTML
{
	const d = p('#draft #todo\nA line with a #tag in it. ^abc123\n^only-id\nPrice $x_1 + y_2$ stays.\nA <span>word</span> here.');
	eq(texts(d.blocks).join('|'), 'A line with a #tag in it.|Price $x_1 + y_2$ stays.|A word here.', 'tags alone and block ids are dropped; math and a tag in text are as typed');
	eq(d.warnings.length, 3, 'a tag in text, math and HTML are each said once');
	eq(texts(p('# Heading\n#1 is not a tag')).join('|'), 'Heading|#1 is not a tag', 'a heading and a number are not tags');
}

// typography
{
	eq(typeset('"Wait," she said. "It\'s the \'90s -- or..."'), '“Wait,” she said. “It’s the ’90s — or…”', 'quotes, apostrophes, a dash, an ellipsis');
	eq(typeset('\'Single\' and "nested \'inner\'"'), '‘Single’ and “nested ‘inner’”', 'single quotes');
	eq(typeset('"Zitat"', '', 'de'), '„Zitat“', 'German quotes');
	eq(typeset("qu'il dit: \"l'heure\"", '', 'fr'), 'qu’il dit: «\u00A0l’heure\u00A0»', 'an apostrophe inside a French word is an apostrophe');
	eq(typeset("Wie geht's? 'So' ist's, Hans' Uhr.", '', 'de'), 'Wie geht’s? ‚So‘ ist’s, Hans’ Uhr.', 'and in German: a quote that was opened is closed, anything else after a word is an apostrophe');
	const b = buildBook([{ kind: 'note', name: 'A', path: 'A.md', included: true, text: '"He said *no*" and `"code"`.' }], { title: 'T', author: '', matter: false });
	eq(blocksText(b.sections[0].blocks), '“He said no” and "code".', 'across italics; code as typed');
	const typed = buildBook([{ kind: 'note', name: 'A', path: 'A.md', included: true, text: '"As typed" -- so.' }], { title: 'T', author: '', matter: false, asTyped: true });
	eq(blocksText(typed.sections[0].blocks), '"As typed" -- so.', 'as typed when the style says so');
}

// titles and numbers
{
	eq(titleFrom('03 - Storm warning'), 'Storm warning', 'a number a name starts with is dropped');
	eq([titleFrom('7'), titleFrom('Chapter 3'), titleFrom('Part One'), titleFrom('Chapter XII'), titleFrom('Twenty-One')].join('|'), '||||', 'a name that is only a number is no title');
	eq(titleFrom('Chapter 3: The wreck'), 'The wreck', 'a title after its number');
	eq([titleFrom('Mix'), titleFrom('1984 and after')].join('|'), 'Mix|and after', 'a word of Roman letters is a name');
	eq([numberWords(1), numberWords(21), numberWords(40), numberWords(115), numberWords(1000)].join('|'), 'One|Twenty-One|Forty|One Hundred Fifteen|1000', 'numbers in words');
	eq([readRole('Chapter'), readRole('front-matter'), readRole('Back matter'), readRole('nonsense'), readRole(3)].join('|'), 'chapter|front|back||', 'export-as, read');
	eq([readStructure('parts and chapters'), readStructure('notes'), readStructure('other')].join('|'), 'parts|notes|', 'structure, read');
}

// roles from structure
const note = (name: string, text = `${name} text.`, more: Partial<SourceItem> = {}): SourceItem => ({ kind: 'note', name, path: `${name}.md`, text, included: true, ...more });
const folder = (name: string, children: SourceItem[], more: Partial<SourceItem> = {}): SourceItem => ({ kind: 'folder', name, path: name, included: true, children, ...more });
const roles = (items: SourceItem[], s = guessStructure(items)) => assignRoles(items, s).placed.map((x) => `${x.item.name}:${x.role}`).join(' ');
{
	const lighthouse = [note('Prologue'), folder('Part One', [note('Arrival'), note('The keeper')]), folder('Part Two', [note('The wreck')]), note('Epilogue')];
	eq(guessStructure(lighthouse), 'parts', 'top folders named as parts: folders are parts, notes are chapters');
	eq(roles(lighthouse), 'Prologue:chapter Part One:part Arrival:chapter The keeper:chapter Part Two:part The wreck:chapter Epilogue:chapter', 'its roles');
	const plainFolders = [folder('Storm', [note('a'), note('b')]), note('Alone')];
	eq(guessStructure(plainFolders), 'chapters', 'other folders are chapters');
	eq(roles(plainFolders), 'Storm:chapter a:scene b:scene Alone:chapter', 'notes in them scenes; a note at the top a chapter');
	const deep = [folder('Part One', [folder('One', [note('a'), folder('Deeper', [note('b')])]), note('loose')])];
	eq(guessStructure(deep), 'parts-chapters', 'two levels of folders: parts, chapters and scenes');
	eq(roles(deep), 'Part One:part One:chapter a:scene Deeper:group b:scene loose:chapter', 'its roles');
	eq(assignRoles(deep, 'parts-chapters').deep.map((f) => f.name).join(), 'Deeper', 'a folder deeper than the rule reaches is said');
	eq(guessStructure([note('a'), note('b')]), 'notes', 'no folders: every note is a chapter');
	eq(roles([folder('Group', [note('a')])], 'notes'), 'Group:group a:chapter', 'every note a chapter: folders only group');
	const matter = [note('Dedication'), note('One'), note('Acknowledgements'), folder('Back matter', [note('Anything')]), note('About the author')];
	eq(roles(matter, 'notes'), 'Dedication:front One:chapter Acknowledgements:chapter Back matter:back Anything:back About the author:back', 'front and back matter by name and place, and by folder');
	const over = [folder('Storm', [note('a', 'a', { exportAs: 'chapter' }), note('b')], { exportAs: 'part' }), note('Skipped', 's', { included: false }), note('End', 'e', { exportAs: 'back matter' })];
	eq(roles(over), 'Storm:part a:chapter b:chapter Skipped:out End:back', 'export-as overrules, and export: false leaves out');
}

// the book
{
	const items = [
		note('Prologue', 'Before.[^1]\n\n[^1]: First note.'),
		folder('Part One', [note('01 Arrival', '# The jetty\nShe came.[^1]\n\n[^1]: Second note.'), note('Chapter 2', 'Then.\n\n---\n')]),
		folder('Part Two', [note('Left out', 'Never.', { included: false }), note('The wreck', '---\nIt sank.')]),
		note('Dedication', 'For M.'),
	];
	const b = buildBook(items, { title: 'The Lighthouse', author: 'A Writer', matter: false });
	eq(b.sections.map((s) => `${s.role} ${s.number} "${s.title}"`).join(' | '), 'chapter null "Prologue" | part 1 "" | chapter 1 "The jetty" | chapter 2 "" | part 2 "" | chapter 3 "The wreck"', 'sections: a prologue has no number, a heading at a note’s top is its title');
	eq(blocksText(b.sections[2].blocks), 'She came.', 'the title heading isn’t set twice');
	eq(b.notes.map(blocksText).join('|'), 'First note.|Second note.', 'footnotes of two notes with the same label, each its own');
	const marks = b.sections.flatMap((s) => s.blocks).flatMap((x) => (x.kind === 'p' ? x.runs : [])).filter((r) => r.kind === 'note').map((r) => (r.kind === 'note' ? r.note : -1));
	eq(marks.join(), '0,1', 'and their marks point at them');
	ok(b.sections.every((s) => s.blocks[0]?.kind !== 'break' && s.blocks[s.blocks.length - 1]?.kind !== 'break'), 'no scene break at a section’s start or end');
	ok(!b.sections.some((s) => s.role === 'back') && buildBook(items, { title: '', author: '', matter: true }).sections.some((s) => s.role === 'back' && s.title === 'Dedication'), 'back matter only when asked for');
	eq(b.outline.map((r) => `${'.'.repeat(r.depth)}${r.name}=${r.role}${r.number ?? ''}`).join(' '), 'Prologue=chapter Part One=part1 .01 Arrival=chapter1 .Chapter 2=chapter2 Part Two=part2 .Left out=out .The wreck=chapter3 Dedication=back', 'contents: each item with its role');
	const scenes = buildBook([folder('Storm', [note('a', 'One.'), note('empty', ''), note('b', 'Two.')])], { title: '', author: '', matter: false });
	eq(kinds(scenes.sections[0].blocks), 'p break p', 'scenes join with one scene break; an empty one adds none');
	ok(scenes.guessed && scenes.structure === 'chapters', 'the structure is guessed, and said to be');
	eq(buildBook([folder('Group', [note('a')])], { title: '', author: '', matter: false, flat: true }).structure, 'notes', 'a Longform project: every note a chapter');
}

// embeds, one level deep; pictures; warnings with their note
{
	const png = new Uint8Array(32);
	png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40, 0, 0, 0, 30]);
	const pic = pictureOf(png);
	ok(!!pic && pic.type === 'png' && pic.width === 40 && pic.height === 30, 'a PNG’s size');
	eq(pictureOf(new Uint8Array([1, 2, 3])), null, 'not a picture');
	const b = buildBook([note('A', 'Start.[^1]\n\n![[Inner]]\n\n![[map.png]]\n\n![[gone.png]]\n\n![[paper.pdf]]\n\n![x](missing.png)\n\n[^1]: Outer note.')], { title: '', author: '', matter: false }, {
		embed: (t) => (t === 'Inner' ? { text: '---\nk: v\n---\nInner text.[^1]\n\n![[Deeper]]\n\n[^1]: Inner note.' } : t === 'map.png' && pic ? { picture: pic } : t === 'Deeper' ? { text: 'Too deep.' } : null),
	});
	eq(kinds(b.sections[0].blocks), 'p p image', 'an embedded note’s text and a picture come in; the rest is left out');
	eq(blocksText(b.sections[0].blocks), 'Start.\n---\nk: v\n---\nInner text.'.replace('---\nk: v\n---\n', ''), 'the embedded text, without its properties');
	eq(b.notes.map(blocksText).join('|'), 'Outer note.|Inner note.', 'its footnotes join the book’s');
	eq(b.warnings.length, 4, 'a note embedded in an embedded note, two pictures not found and a PDF are said');
	ok(b.warnings.every((w) => w.path === 'A.md' && w.name === 'A'), 'each with the note it is in');
}

done('export model');
