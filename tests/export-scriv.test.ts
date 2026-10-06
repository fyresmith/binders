import { strFromU8 } from 'fflate';
import type { Picture } from '../src/export/model';
import { pictureOf } from '../src/export/picture';
import { HONEST_CREATOR, floats, scrivDate, uuid } from '../src/export/scriv/parts';
import { scrivFiles, writeScriv, type ScrivItem, type ScrivOptions, type ScrivSource } from '../src/export/scriv/project';
import { DEFAULT_LABELS, DEFAULT_STATUSES } from '../src/view/labels';
import { noteWords, rtfText, rtfWords } from './export-scriv-words';
import { checkProject, parseXml, rtfProblem } from './export-scriv-tools';
import { done, eq, ok } from './harness';

/* The Scrivener project's writer (src/export/scriv/): the shape of what it writes, piece by piece. The word-for-word
   test and the structural checks over whole vaults are in export-scriv-words.test.ts. */

const WHEN = new Date('2026-10-05T12:00:00Z');
const OPTS: ScrivOptions = { outside: true, snapshots: true, version: '1.2.3', when: WHEN };
const note = (name: string, text: string, more: Partial<ScrivItem> = {}): ScrivItem => ({ kind: 'note', name, path: `B/${name}.md`, text, included: true, ...more });
const folder = (name: string, children: ScrivItem[], more: Partial<ScrivItem> = {}): ScrivItem => ({ kind: 'folder', name, path: `B/${name}`, included: true, children: children.map((c) => ({ ...c, path: `B/${name}/${c.name}.md` })), ...more });
const source = (items: ScrivItem[], more: Partial<ScrivSource> = {}): ScrivSource => ({ name: 'B', path: 'B', items, labels: DEFAULT_LABELS, statuses: DEFAULT_STATUSES, ...more });
const made = (src: ScrivSource, o: Partial<ScrivOptions> = {}) => { const p = writeScriv(src, { ...OPTS, ...o }), files = scrivFiles(p, 'B'), c = checkProject(files, 'B'); return { p, files, ...c, str: (path: string) => { const d = files.get(path); return d ? strFromU8(d) : null; } }; };
const sound = (m: ReturnType<typeof made>, what: string) => ok(!m.problems.length, `${what}: a sound project${m.problems.length ? ` (${m.problems.slice(0, 3).join('; ')})` : ''}`);

// ---- small things ----
{
	eq(uuid('B', 'item:a'), uuid('B', 'item:a'), 'an id is the same every time');
	ok(uuid('B', 'item:a') !== uuid('B', 'item:b') && uuid('B', 'item:a') !== uuid('C', 'item:a'), 'and another for another item or binder');
	ok(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(uuid('x', 'y')), 'it looks like one Scrivener makes');
	const seen = new Set<string>();
	for (let i = 0; i < 20000; i++) seen.add(uuid('Binder', `item:Chapter ${i >> 5}/Scene ${i}`));
	eq(seen.size, 20000, 'twenty thousand items have twenty thousand ids');
	ok(/^2026-10-05 \d\d:00:00 [+-]\d{4}$/.test(scrivDate(WHEN)), 'a date as Scrivener writes it');
	eq(floats('#ff0080'), '1.0 0.0 0.501961', 'a color as three numbers');
}

// ---- the binder: order, nesting, and what a writer set ----
{
	const src = source([
		note('Prologue', 'It began.', { synopsis: 'The start.', label: 'yellow', status: 'draft', target: 1200, created: Date.UTC(2026, 0, 2), modified: Date.UTC(2026, 0, 3) }),
		folder('Part One', [note('Arrival', 'She came.', { label: 'Blue', status: 'Needs research', tags: ['pov/mara', '#storm'], props: { pov: 'Mara', 'A field': 'x & y' } }), note('The wreck', 'Cut.', { included: false })], { text: 'Notes for part one.', synopsis: 'The first part.', label: '#c0392b' }),
		note('Notes on lighthouses', 'Research.', { included: false }),
		note('Epilogue', '', { label: 'teal' }),
	], { note: note('B', 'About the book.', { target: 50000, synopsis: 'A keeper.' }) });
	const m = made(src), x = m.str('B.scrivx') ?? '';
	sound(m, 'a binder');
	eq(m.items.map((i) => `${'  '.repeat(i.depth)}${i.title}`).join('\n'), 'Draft\n  Prologue\n  Part One\n    Arrival\n    The wreck\n  Epilogue\nResearch\n  B (binder note)\n  Notes on lighthouses\nTrash', 'the tree: the binder under Draft, in order; what is outside the manuscript in Research');
	eq(m.items.filter((i) => i.depth).map((i) => i.path).join('|'), 'Prologue|Part One/|Part One/Arrival|Part One/The wreck|Epilogue|B|Notes on lighthouses', 'every item says its path in the binder');
	eq(m.items.filter((i) => i.type === 'Folder').map((i) => i.title).join(), 'Part One', 'a folder is a folder');
	const by = (title: string) => m.items.find((i) => i.title === title) as (typeof m.items)[number];
	ok(by('Prologue').included && !by('The wreck').included && !/<IncludeInCompile>No/.test(x), '“Include in export” off: the element is left out, never “No”');
	eq([by('Prologue').label, by('Arrival').label, by('Part One').label, by('Epilogue').label].join(), '2,5,8,9', 'labels: the settings’ list, then a color of its own and a label that names none');
	ok(x.includes(`<Label ID="2" Color="${floats('#e0ac00')}">Yellow</Label>`) && x.includes(`<Label ID="8" Color="${floats('#c0392b')}">#c0392b</Label>`) && x.includes('>Teal</Label>'), 'each with its color');
	eq([by('Prologue').status, by('Arrival').status].join(), '1,4', 'statuses: the settings’ list, and any other text added to it');
	ok(x.includes('<Status ID="4">Needs research</Status>'), 'a status of the writer’s own is in the project’s list');
	ok(/<Title>Prologue<\/Title>[\s\S]*?<Target Type="Words" Notify="No">1200<\/Target>/.test(x) && x.includes('IgnoreDeadline="Yes">50000</DraftTarget>'), 'targets: the note’s, and the binder’s as the draft’s');
	eq(m.str(`Files/Data/${by('Prologue').id}/synopsis.txt`), 'The start.', 'a synopsis is synopsis.txt, with no line break after it');
	eq(m.str(`Files/Data/${by('Part One').id}/synopsis.txt`), 'The first part.', 'a folder’s too');
	ok(rtfText(m.str(`Files/Data/${by('Part One').id}/content.rtf`) ?? '').includes('Notes for part one.'), 'a folder note’s text is the folder’s own text');
	ok(rtfText(m.str(`Files/Data/${by('B (binder note)').id}/content.rtf`) ?? '').includes('About the book.'), 'the binder note’s text is a document at the top of Research');
	ok(!m.files.has(`Files/Data/${by('Epilogue').id}/content.rtf`) && ![...m.files.keys()].some((p) => p.includes(by('Epilogue').id)), 'a note with no text and no synopsis has no folder of files');
	ok(/Created="2026-01-0[12] [^"]+" Modified="2026-01-0[23] /.test(x), 'a note’s dates are its file’s');
	ok(x.includes('<Keyword ID="0" Color="0.67 0.67 0.67">') && x.includes('<Title>pov/mara</Title>') && x.includes('<Title>storm</Title>') && /<Keywords>\s*<KeywordID>0<\/KeywordID>\s*<KeywordID>1<\/KeywordID>/.test(x), 'tags are keywords');
	ok(x.includes('<MetaDataField ID="pov" Type="Text" Wraps="No" Align="Left">') && x.includes('<FieldID>afield</FieldID>') && x.includes('<Value>x &amp; y</Value>'), 'other properties are custom metadata, as text');
	eq(HONEST_CREATOR, true, 'the project says honestly who made it');
	ok(x.includes('Creator="BINDERS-1.2.3"') && x.includes('Version="2.0"') && m.str('Files/version.txt') === '23', 'Creator, the format’s version, version.txt');
	ok(m.files.has('Files/styles.xml') && m.files.has('Settings/compile.xml'), 'the full shape: styles and compile settings');
	eq(m.p.documents, 6, 'documents counted');
	eq(m.p.folders, 1, 'folders counted');
	eq(m.p.words, 8, 'the draft’s words: what is included, a folder’s own text too');
	eq(m.p.rows.map((r) => r.title).join('|'), 'Draft|Prologue|Part One|Arrival|The wreck|Epilogue|Research|B (binder note)|Notes on lighthouses|Trash', 'the preview’s rows are the tree');

	// the same binder again: the same ids. The bare shape. The switch off.
	eq(made(src).items.map((i) => i.id).join(), m.items.map((i) => i.id).join(), 'a second export gives every document the id it had');
	const bare = made(src, { full: false });
	sound(bare, 'the bare shape');
	ok(!bare.files.has('Files/styles.xml') && !bare.files.has('Settings/compile.xml'), 'the bare shape has no styles or settings file');
	const off = made(src, { outside: false });
	sound(off, 'without notes outside the manuscript');
	eq(off.items.map((i) => i.title).join('|'), 'Draft|Prologue|Part One|Arrival|The wreck|Notes on lighthouses|Epilogue|Research|Trash', 'the switch off: Research is empty, and what is left out stays where it is');
	// a plain binder writes nothing the spike's project didn't have
	const plain = made(source([note('One', 'Text.')])).str('B.scrivx') ?? '';
	ok(!plain.includes('<Keywords>') && !plain.includes('<SectionType>') && (plain.match(/<MetaDataField /g) ?? []).length === 1, 'a plain binder has no keywords, no section type of an item’s own, one custom field');
	sound(made(source([])), 'an empty binder');
	ok(parseXml(made(source([note('A <b> & "c"', 'x', { synopsis: 'a < b' })])).str('B.scrivx') ?? '').name === 'ScrivenerProject', 'a title with XML’s characters in it');
}

// ---- section types: the roles, by the structure's defaults and by hand ----
{
	const src = source([note('Dedication', 'For M.'), folder('Chapter 1', [note('Scene 1', 'a'), note('Scene 2', 'b', { exportAs: 'chapter' })]), note('Coda', 'c')]);
	const m = made(src), x = m.str('B.scrivx') ?? '', type = (name: string) => new RegExp(`<Type ID="([^"]+)">${name}</Type>`).exec(x)?.[1] ?? '?';
	sound(m, 'section types');
	ok(new RegExp(`<Folders>\\s*<Type>${type('Chapter')}</Type>`).test(x) && new RegExp(`<Files>\\s*<Type>${type('Scene')}</Type>`).test(x), 'folders are chapters and notes are scenes, by default');
	const by = (title: string) => m.items.find((i) => i.title === title)?.section ?? null;
	eq([by('Chapter 1'), by('Scene 1'), by('Scene 2'), by('Coda'), by('Dedication')].join(), [null, null, type('Chapter'), type('Chapter'), type('Front matter')].join(), 'an item says its type only when it isn’t the default');
	const c = m.str('Settings/compile.xml') ?? '';
	ok(c.includes(`<Type ID="${type('Chapter')}">NEW-PAGE-HEADER-WITH-TEXT</Type>`) && c.includes(`<Type ID="${type('Scene')}">TEXT-SECTION</Type>`) && c.includes('<ProjectTitle>B</ProjectTitle>'), 'compile.xml gives each type a layout');
}

// ---- the text ----
{
	const png = new Uint8Array(40);
	png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 8, 0, 0, 0, 6, 0]);
	const pic = pictureOf(png) as Picture;
	const text = 'First, with *stress*, **weight**, ***both***, ~~a cut~~ and `code {x}`.\n\n\tA tab starts this one.[^a]\n\tAnd this, see [[Other]] and [[Other|that one]] and [[Nowhere]] and [the board](https://example.com/a?b=1&c=é).\n\n%%Check the\ndate%% After a comment. <!-- unseen -->\n\n***\n\n## Later\n\n> Quoted.\n\n> [!note] Mind\n> Called out.\n\n- one\n- two\n  - deep\n\n3. third\n4. fourth\n\n| a | b |\n|---|---|\n| c | d |\n\n```js\nlet x = {1};\n```\n\n![[map.png]]\n\n![[Other]]\n\n![gone](missing.png)\n\nÉmile 👋 naïve \\ {braces}.^[Typed in place, *twice*.]\n\n[^a]: A note, with [[Other|a link]].';
	const src = source([note('One', text), note('Other', 'Elsewhere.')]);
	const m = made(src, { picture: (name) => (name === 'map.png' ? { picture: pic, name: 'B/map.png' } : null) });
	sound(m, 'a note of everything');
	const one = m.items.find((i) => i.title === 'One'), other = m.items.find((i) => i.title === 'Other');
	const r = m.str(`Files/Data/${one?.id}/content.rtf`) ?? '';
	eq(rtfProblem(r), null, 'the RTF is well formed, and ASCII');
	ok(r.includes('{\\i stress}') && r.includes('{\\b weight}') && r.includes('{\\i\\b both}') && r.includes('{\\strike a cut}') && r.includes('{\\f1 code \\{x\\}}'), 'italic, bold, both, struck through, code');
	ok(r.includes('\\pard\\fi360 A tab starts this one.') && !/\\pard[^ ]* \\tab/.test(r) && r.includes('\\pard\\sa200 First'), 'a paragraph begun with a tab has a first-line indent and no tab; the others are flush left with space after');
	ok(r.includes('\\{\\\\Scrv_fn=A note, with {\\field{\\*\\fldinst{HYPERLINK "scrivlnk://' + other?.id + '"}}{\\fldrslt a link}}.\\\\end_Scrv_fn\\}'), 'a footnote is Scrivener’s inline footnote, where its mark was');
	ok(r.includes('\\{\\\\Scrv_fn=Typed in place, {\\i twice}.\\\\end_Scrv_fn\\}'), 'one typed in place too');
	ok(r.includes('\\{\\\\Scrv_annot \\\\color=\\{\\\\R=0.619608\\\\G=0.043137\\\\B=0.011765\\} \\\\text=Check the date\\\\end_Scrv_annot\\} After a comment.') && !r.includes('unseen'), 'a comment is an inline annotation; an HTML comment is left out');
	eq((r.match(new RegExp(`scrivlnk://${other?.id}`, 'g')) ?? []).length, 4, 'links to a note of the binder lead to its document');
	ok(r.includes('and Nowhere and') && !r.includes('scrivlnk://"'), 'a link to a note that isn’t in the project is its words');
	ok(r.includes('{\\field{\\*\\fldinst{HYPERLINK "https://example.com/a?b=1&c=%C3%A9"}}{\\fldrslt the board}}'), 'a web link is a link');
	ok(r.includes('\\pard\\qc\\sa200 * * *') && r.includes('{\\b\\fs30 Later}'), 'a scene break, a heading');
	ok(r.includes('\\pard\\li720\\ri720\\sa200 Quoted.') && r.includes('\\pard\\li720\\ri720\\sa200 {\\b Mind}'), 'a quotation; a callout is one with its title in bold');
	ok(r.includes('\\pard\\li720\\fi-360\\tx720 \\u8226?\\tab one') && r.includes('\\pard\\li1440\\fi-360\\tx1440 \\u8226?\\tab deep') && r.includes('\\tx720 3.\\tab third') && r.includes('4.\\tab fourth'), 'lists, nested, numbered from where they start');
	ok(r.includes('{\\f1\\fs20 | a | b |}') && r.includes('{\\f1\\fs20 | --- | --- |}') && r.includes('{\\f1\\fs20 let x = \\{1\\};}'), 'a table stays as Markdown; code is monospaced, as typed');
	ok(/\{\\pict\\pngblip\\picw8\\pich6\\picwgoal120\\pichgoal90\n89504e47/.test(r), 'a picture is in the text');
	ok(r.includes(`{\\fldrslt !\\u91?\\u91?Other]]}`) || r.includes('{\\fldrslt ![[Other]]}'), 'a note embedded stays as typed, and leads to its document');
	ok(r.includes('![gone](missing.png)'), 'a picture that isn’t found stays as typed');
	ok(r.includes('\\u201?mile \\u-10179?\\u-9141? na\\u239?ve \\\\ \\{braces\\}.'), 'accents, an emoji as two units, RTF’s own characters');
	const image = m.items.find((i) => i.type === 'Image');
	ok(!!image && image.title === 'map' && m.files.has(`Files/Data/${image.id}/content.png`) && (m.str('B.scrivx') ?? '').includes('<FileExtension>png</FileExtension>'), 'the picture is also a file in Research');
	eq(m.p.warnings.map((w) => w.text).sort().join('|'), 'A note or file embedded in another stays as it is typed.|A picture that couldn’t be put in the text stays as it is typed.|A table stays as it is typed.', 'what stayed as Markdown is said, with its note');
	const got = rtfWords(r), want = noteWords(text, (n) => n === 'map.png');
	eq(got.body.join(' '), want.body.join(' '), 'word for word: the text');
	eq(got.notes.join(' '), want.notes.join(' '), 'word for word: the footnotes');
	ok(want.body.includes('Check') && want.notes.join(' ') === 'A note with a link Typed in place twice', 'and the test’s own reading has the comment and both footnotes');
}

// ---- snapshots, and a note's notes ----
{
	const at = Date.UTC(2026, 8, 1, 10, 0, 0);
	const src = source([note('One', 'Now.', { notes: 'Ask *Tom*.', snapshots: [{ title: 'Before the rewrite', when: at, text: 'Then.' }, { title: '', when: at, text: '' }] })]);
	const m = made(src), id = m.items.find((i) => i.title === 'One')?.id, dir = `Snapshots/${id}.snapshots/`;
	sound(m, 'snapshots');
	const index = m.str(`${dir}index.xml`) ?? '', names = [...m.files.keys()].filter((p) => p.startsWith(dir) && p.endsWith('.rtf'));
	eq(names.length, 2, 'a file for each snapshot');
	ok(index.includes('<Title>Before the rewrite</Title>') && index.includes('<Title>Untitled Snapshot</Title>') && index.includes(`<Date>${scrivDate(new Date(at))}</Date>`) && index.includes(`<Date>${scrivDate(new Date(at + 1000))}</Date>`), 'the index has their names and dates; two of one moment are a second apart');
	ok(/\.snapshots\/\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d[+-]\d{4}\.rtf$/.test(names[0]) && rtfText(m.str(names[0]) ?? '').includes('Then.'), 'a snapshot’s file is named for its date, and has its text');
	eq(m.p.snapshots, 2, 'snapshots counted');
	ok(rtfText(m.str(`Files/Data/${id}/notes.rtf`) ?? '').includes('Ask Tom.'), 'a note’s `notes` property is the document’s notes');
	const off = made(src, { snapshots: false });
	ok(![...off.files.keys()].some((p) => p.startsWith('Snapshots/')) && off.p.snapshots === 0, 'the switch off: no snapshots');
}

done('export scriv');
