import { zipSync } from 'fflate';
import { DEFAULT_SETTINGS } from '../src/settings-data';
import { equalBytes, projectSource, safePath, utf8, zipSource } from '../src/import/source';
import { readXml } from '../src/import/scriv/xml';
import { readRtf } from '../src/import/scriv/rtf';
import { readProject } from '../src/import/scriv/project';
import { inBinder, planImport } from '../src/import/scriv/plan';
import { ok, eq, done } from './harness';
import { writeScriv, scrivFiles } from '../src/export/scriv/project';

const enc = new TextEncoder(), bytes = (s: string) => enc.encode(s);
const rich = (s: string) => readRtf(bytes(s));
function rejects(fn: () => unknown, label: string) { let threw = false; try { fn(); } catch { threw = true; } ok(threw, label); }

eq(readXml('<?xml version="1.0"?><Root Name="&quot;&amp;"><Title><![CDATA[a < b]]></Title></Root>').children[0].text, 'a < b', 'CDATA is writing');
rejects(() => readXml('<a><b></a>'), 'mismatched XML fails');
rejects(() => readXml('<!DOCTYPE x SYSTEM "file:///etc/passwd"><x/>'), 'external entities fail');
rejects(() => readXml('<x>&unknown;</x>'), 'unknown entities fail');
rejects(() => readXml('<x>&constructor;</x>'), 'prototype names are not XML entities');
for (const path of ['../note', '/note', 'C:/note', 'one\\two', 'a//b', 'a/../b']) rejects(() => safePath(path), `unsafe path ${path}`);

eq(rich('{\\rtf1\\ansi Hello \\{world\\} \\\\ end.}').plain, 'Hello {world} \\ end.', 'literal RTF escapes');
eq(rich('{\\rtf1\\ansi\\uc1 \\u-10179?\\u-8704? \\u20013?\\u25991?}').plain, '😀 中文', 'signed Unicode and surrogate pairs');
eq(rich('{\\rtf1\\uc1 A{\\uc2\\u233??}\\u241?Z}').plain, 'AéñZ', 'Unicode fallback is scoped');
eq(rich("{\\rtf1\\ansi\\ansicpg1251 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2}").plain, 'Привет', 'Cyrillic code page');
eq(rich("{\\rtf1\\ansi\\ansicpg932 \\'82\\'a0}").plain, 'あ', 'multibyte hex escape');
eq(rich('{\\rtf1 A{\\b bold} normal {\\i italic} {\\strike gone}.}').markdown, 'A**bold** normal *italic* ~~gone~~.\n', 'format groups restore their parent');
// A table is written as one paragraph a row, with a rule after the first (export, docs/dev/export.md): its rows come back
// together, as the table they are. Pipe lines with no rule among them are paragraphs, as they were.
eq(rich('{\\rtf1 | a | b |\\par | --- | --- |\\par | 1 | 2 |\\par}').markdown, '| a | b |\n| --- | --- |\n| 1 | 2 |\n', 'table rows with a rule come back together');
eq(rich('{\\rtf1 | a | b |\\par | c | d |\\par Then prose.}').markdown, '| a | b |\n\n| c | d |\n\nThen prose.\n', 'pipe lines with no rule are paragraphs');
// A paragraph begun with a tab is written with a 360-twip first-line indent and no space after (export). It reads back
// as the tab only when "Start a paragraph with a tab" is on; any other indent, or space after, is left as it is.
const tabbed = '{\\rtf1\\ansi Before.\\par\\pard\\fi360 It did {\\b not} wait.\\par\\pard\\sa200 Flush.\\par\\pard\\fi720 Indented.\\par\\pard\\fi360\\sa200 Spaced.\\par}';
eq(readRtf(bytes(tabbed), { indentedAsTabs: true }).markdown, 'Before.\n\n\tIt did **not** wait.\n\nFlush.\n\nIndented.\n\nSpaced.\n', 'a 360 first-line indent reads back as a tab, when asked; others don’t');
eq(readRtf(bytes('{\\rtf1\\ansi Before.\\par\\pard\\fi360 Last {\\b bold}}'), { indentedAsTabs: true }).markdown, 'Before.\n\n\tLast **bold**\n', 'the last paragraph of a group, with no \\par after it, is one too');
eq(readRtf(bytes(tabbed)).markdown, 'Before.\n\nIt did **not** wait.\n\nFlush.\n\nIndented.\n\nSpaced.\n', 'without the setting, the indent is not a tab');
ok(rich('{\\rtf1 # not a heading\\par ---\\par **literal**}').markdown.includes('\\# not a heading'), 'literal Markdown is escaped');
// A sentence is left as it was typed: only what Obsidian would take for markup is escaped, where it would.
const prose = 'Mr. Smith - a 1.5 mile walk! (Yes.) No. 7 = 100% + more; snake_case, a < b > c, AT&T, 3 ~ 4, e.g. this: that.';
eq(rich(`{\\rtf1 ${prose}}`).markdown, prose + '\n', 'prose comes through without a backslash in it');
eq(rich('{\\rtf1 1. One\\par - two\\par + three\\par > four\\par ---\\par =\\par 2) five\\par #tag and # alone\\par -dash and 3.5}').markdown, '1\\. One\n\n\\- two\n\n\\+ three\n\n\\> four\n\n\\---\n\n\\=\n\n2\\) five\n\n\\#tag and # alone\n\n-dash and 3.5\n', 'what would start a list, a quote, a rule or a heading is escaped at the start of a line');
eq(rich('{\\rtf1 a*b _c_ `d` [e] [[f]] ![[g]] <b> <!-- h --> &amp; $i$ ~~j~~ ==k== %%l%% \\\\ end}').markdown, 'a\\*b \\_c\\_ \\`d\\` \\[e] \\[\\[f]] !\\[\\[g]] \\<b> \\<!-- h --> \\&amp; \\$i\\$ \\~\\~j\\~\\~ \\=\\=k\\=\\= \\%\\%l\\%\\% \\\\ end\n', 'markup typed as text stays text');
eq(rich('{\\rtf1 A\\line B\\par C\\tab D}').markdown, 'A  \nB\n\nC\tD\n', 'line, paragraph and literal tab');
eq(rich('{\\rtf1\\cocoartf2864 First\\\nSecond}').plain, 'First\n\nSecond', 'Cocoa backslash-newline separates paragraphs');
eq(rich('{\\rtf1{\\upr{wrong}{\\*\\ud \\u20013?}}}').plain, '中', 'Unicode alternative wins over ANSI fallback');
eq(rich('{\\rtf1 <$ScrKeepWithNext><$Scr_H::2>{\\b A heading}<!$Scr_H::2>\\par Prose.}').markdown, '## **A heading**\n\nProse.\n', 'explicit Scrivener heading markers');
eq(rich('{\\rtf1 {\\field{\\*\\fldinst HYPERLINK "https://example.org"}{\\fldrslt Visit}}}').markdown, '[Visit](https://example.org)\n', 'hyperlink destinations are not prose');
eq(readRtf(bytes('{\\rtf1 {\\field{\\*\\fldinst HYPERLINK "scrivlnk://AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"}{\\fldrslt Next}}}'), { link: () => '[[Novel/Next|Next]]' }).markdown, '[[Novel/Next|Next]]\n', 'UUID links use allocated paths');
eq(rich('{\\rtf1 Text{\\footnote A note.} end.}').markdown, 'Text[^1] end.\n\n[^1]: A note.\n', 'standard footnote preserved');
const annotation = '{\\rtf1 {\\b Before} \\{\\\\Scrv_annot \\\\color=\\{\\\\R=1\\} \\\\text=check \\u233?\\\\end_Scrv_annot\\} {\\i after} \\{\\\\Scrv_fn=footnote\\\\end_Scrv_fn\\}}';
const annotated = rich(annotation).markdown;
ok(annotated.includes('**Before** %%check é%% *after*'), 'annotations preserve surrounding formatting');
ok(annotated.includes('[^1]: footnote'), 'inline footnote preserved');
rejects(() => rich('{\\rtf1 broken'), 'unfinished RTF fails');
rejects(() => rich('{\\rtf1{\\pict\\pngblip\\bin90 x}}'), 'truncated binary fails');
let picture: Uint8Array;
eq(readRtf(bytes('{\\rtf1 A{\\pict\\pngblip 0102ff}Z}'), { picture: (b) => { picture = b; return '![[Pictures/test.png]]'; } }).markdown, 'A![[Pictures/test.png]]Z\n', 'embedded image is an attachment');
ok(equalBytes(picture, Uint8Array.of(1, 2, 255)), 'image bytes unchanged');

// Hand-authored fixture: deliberately not made by the Binders exporter. IDs, localized root name, a text
// container, an excluded scene, collisions, custom string metadata and a snapshot exercise independent input.
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const item = (n: number, type: string, title: string, meta: string, kids = '') => `<BinderItem UUID="${id(n)}" Type="${type}"><Title>${title}</Title><MetaData>${meta}</MetaData>${kids ? `<Children>${kids}</Children>` : ''}</BinderItem>`;
const files = new Map<string, Uint8Array>([
	['Novel.scrivx', bytes(`<ScrivenerProject Version="2.0"><CustomMetaDataSettings><MetaDataField ID="f"><Title>binder</Title></MetaDataField></CustomMetaDataSettings><Binder>${item(1, 'DraftFolder', 'Manuscrit', '', item(2, 'Text', 'Chapter', '<IncludeInCompile>Yes</IncludeInCompile>', item(3, 'Text', 'Chapter', '') + item(4, 'Text', 'Chapter', '<CustomMetaData><MetaDataItem><FieldID>f</FieldID><Value>0123</Value></MetaDataItem></CustomMetaData>')) + item(5, 'Text', 'Snapshots', '<IncludeInCompile>Yes</IncludeInCompile>'))}${item(6, 'ResearchFolder', 'Sources', '', item(7, 'Text', 'Research note', ''))}${item(8, 'TrashFolder', 'Corbeille', '', item(9, 'Text', 'Deleted writing', ''))}</Binder></ScrivenerProject>`)],
	[`Files/Data/${id(2)}/content.rtf`, bytes('{\\rtf1 Parent writing.}')],
	[`Files/Data/${id(3)}/content.rtf`, bytes('{\\rtf1 First child.}')],
	[`Files/Data/${id(4)}/content.rtf`, bytes('{\\rtf1 Second child.}')],
	[`Files/Data/${id(5)}/content.rtf`, bytes('{\\rtf1{\\field{\\*\\fldinst HYPERLINK "scrivlnk://' + id(4) + '"}{\\fldrslt Second}}}')],
	[`Files/Data/${id(7)}/content.rtf`, bytes('{\\rtf1 Research writing.}')],
	[`Snapshots/${id(3)}.snapshots/index.xml`, bytes('<Snapshots Version="1.0"><Snapshot><Title>Before</Title><Date>2026-09-01 10:00:00 -0400</Date></Snapshot></Snapshots>')],
	[`Snapshots/${id(3)}.snapshots/2026-09-01-10-00-00-0400.rtf`, bytes('{\\rtf1 Earlier child.}')],
	[`Files/Data/${id(3)}/comments.xml`, bytes('<comments>Sidebar writing</comments>')],
]);
const source = projectSource(files, 'Novel', async () => true), project = readProject(source), options = { name: 'Novel', parent: '', research: true, snapshots: true, settings: DEFAULT_SETTINGS };
const plan = planImport(project, options), text = (path: string) => utf8(plan.files.get(path));
eq(plan.sceneCount, 5, 'all manuscript and Research prose becomes visible scenes');
eq(plan.snapshotCount, 1, 'snapshot imported');
eq(plan.trashCount, 1, 'Trash identified by type');
ok(text('Novel/Chapter/Chapter text.md').includes('Parent writing'), 'container prose is first visible scene');
// The order is the binder note's: every item by its path from the binder, a folder before what it holds. A folder
// note holds no list (docs/dev/file-format.md): one written there is never read, and the folder's notes fall into
// alphabetical order.
const listed = (note: string): string[] => { const m = /^"?contents"?:(.*(?:\n[ \t]+-.*)*)/m.exec(note); return m ? [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse(x[0]) as string) : []; };
eq(listed(text('Novel/Novel.md')).join('|'), 'Chapter/|Chapter/Chapter text|Chapter/Chapter 2|Chapter/Chapter 3|Snapshots 2|Research/|Research/Research note', 'the binder note lists every item in Scrivener’s order');
ok(!plan.files.has('Novel/Chapter/Chapter.md') || !/contents/.test(text('Novel/Chapter/Chapter.md')), 'a folder note holds no list of its own');
ok(!/contents/.test(text('Novel/Research/Research.md')), 'nor does the Research folder’s note');
ok(text('Novel/Chapter/Chapter 2.md').includes('export: false'), 'excluded writing kept outside export');
ok(text('Novel/Chapter/Chapter 3.md').includes('"Scrivener binder": "0123"'), 'reserved field and leading zeros preserved');
ok(text('Novel/Snapshots 2.md').includes('[[Novel/Chapter/Chapter 3|Second]]'), 'renamed target link is resolved');
ok(text('Novel/Research/Research.md').includes('export: false'), 'Research outside manuscript');
ok([...plan.files.keys()].some((p) => p.endsWith('Before.snapshot')), 'native snapshot file');
ok([...plan.files.values()].some((b) => utf8(b).includes('Earlier child')), 'snapshot writing retained');
ok(equalBytes(plan.files.get(`Novel/Research/Originals/Chapter/Chapter 2/comments.xml`), files.get(`Files/Data/${id(3)}/comments.xml`)), 'unsupported sidecar retained byte for byte');
// What import keeps beside the notes is out of the manuscript and can be found: an original under its note's own
// path, a picture with the research. Neither is an item at the top of the binder, where it would be a chapter.
ok(equalBytes(plan.files.get('Novel/Research/Originals/Chapter/Chapter 2/content.rtf'), files.get(`Files/Data/${id(3)}/content.rtf`)), 'an original is filed under its note’s path, not an identifier');
ok(equalBytes(plan.files.get('Novel/Research/Originals/Chapter/Chapter 2/Snapshot 1.rtf'), files.get(`Snapshots/${id(3)}.snapshots/2026-09-01-10-00-00-0400.rtf`)), 'a snapshot’s original with it');
const pictured = planImport(readProject(projectSource(new Map([...files, [`Files/Data/${id(5)}/content.rtf`, bytes('{\\rtf1 A{\\pict\\pngblip 0102ff}Z}')]]), 'Novel', async () => true)), options);
ok(pictured.files.has('Novel/Research/Attachments/Picture 1.png') && utf8(pictured.files.get('Novel/Snapshots 2.md')).includes('![[Novel/Research/Attachments/Picture 1.png]]'), 'a picture is kept with the research, and shown where it was');
ok(![...pictured.files.keys(), ...pictured.folders].some((path) => /^Novel\/(?!Chapter\/|Research\/|Snapshots\/)[^/]+\//.test(path)), 'nothing import adds is a folder at the top of the manuscript');
const bare = planImport(project, { ...options, research: false, snapshots: false });
eq(bare.sceneCount, 4, 'Research switch only removes source Research');
eq(bare.snapshotCount, 0, 'snapshot switch off');
ok(bare.files.has(`Novel/Research/Originals/Chapter/Chapter 2/comments.xml`), 'preservation is independent of Research switch');
const zipped = zipSync(Object.fromEntries([...files].map(([p, b]) => [`Novel.scriv/${p}`, b])));
eq(readProject(zipSource(zipped, 'backup.zip')).roots[0].title, 'Manuscrit', 'usual backup wrapper');
rejects(() => zipSource(zipSync({ '../escape.scrivx': files.get('Novel.scrivx') }), 'unsafe.zip'), 'traversal rejected before inflation');
rejects(() => zipSource(zipSync({ 'a.scrivx': bytes('a'), 'b.scrivx': bytes('b') }), 'multiple.zip'), 'multiple projects are not guessed');
rejects(() => zipSource(zipSync({ 'a.scrivx': bytes('a'), 'A.scrivx': bytes('b') }), 'duplicate.zip'), 'case collisions rejected');
const damaged = zipSync({ 'a.scrivx': bytes('writing') }, { level: 0 });
damaged[new DataView(damaged.buffer).getUint16(26, true) + 30] ^= 1;
rejects(() => zipSource(damaged, 'damaged.zip'), 'CRC mismatch refuses corrupt writing');
const overLimit = zipSync({ 'a.scrivx': bytes('writing') });
const central = overLimit.findIndex((_b, i) => i + 4 < overLimit.length && new DataView(overLimit.buffer).getUint32(i, true) === 0x02014b50);
new DataView(overLimit.buffer).setUint32(central + 24, 256 * 1024 * 1024 + 1, true);
rejects(() => zipSource(overLimit, 'bomb.zip'), 'expanded size checked before inflation');
rejects(() => planImport(project, { ...options, settings: { ...DEFAULT_SETTINGS, synopsisProp: 'binder' } }), 'reserved configured scene property refused');
rejects(() => readProject(projectSource(new Map([...files, ['Files/version.txt', bytes('24')]]), 'Novel', async () => true)), 'newer data format refused');

// Supplemental compatibility with projects our own exporter wrote, not evidence of Scrivener-authored input.
const written = writeScriv({ name: 'Book', path: 'Book', labels: [], statuses: [], items: [{ kind: 'note', name: 'Arrival', path: 'Book/Arrival.md', text: 'Mara came ashore. **It was late.**', included: true }] }, { outside: true, snapshots: true, version: '0.33.4' });
const roundTrip = planImport(readProject(projectSource(scrivFiles(written, 'Book'), 'Book', async () => true)), { ...options, name: 'Book import' });
eq(roundTrip.sceneCount, 1, 'exported sample imports');
ok([...roundTrip.files.values()].some((b) => utf8(b).includes('Mara')), 'round-trip writing retained');
// A vault's labels in Obsidian's named colors go out as those colors' shades: coming back they are the same labels.
const labelled = writeScriv({ name: 'Book', path: 'Book', labels: [...DEFAULT_SETTINGS.labels, { name: 'Storm', color: '#1A2b3C' }], statuses: [], items: [{ kind: 'note', name: 'Arrival', path: 'Book/Arrival.md', text: 'Mara came ashore.', included: true, label: 'Red' }] }, { outside: true, snapshots: true, version: '0.44.16' });
const labelPlan = planImport(readProject(projectSource(scrivFiles(labelled, 'Book'), 'Book', async () => true)), { ...options, name: 'Book labels', settings: { ...DEFAULT_SETTINGS, labels: [...DEFAULT_SETTINGS.labels, { name: 'Storm', color: '#1a2B3c' }] } });
eq(labelPlan.labels.map((l) => l.name).join(', '), '', 'a round trip adds no label the vault has already');
eq(labelPlan.warnings.filter((w) => /label of that name/.test(w)).length, 0, 'and warns of no color clash');
ok(utf8(labelPlan.files.get('Book labels/Arrival.md')).includes('label: "Red"'), 'the note keeps its label by the vault’s own name');
// (a label of the vault's name in a color that is not its own still comes in beside it)
const clash = planImport(readProject(projectSource(scrivFiles(labelled, 'Book'), 'Book', async () => true)), { ...options, name: 'Book clash', settings: { ...DEFAULT_SETTINGS, labels: [{ name: 'Red', color: 'blue' }] } });
ok(clash.labels.some((l) => l.name === 'Red (Book clash)') && clash.warnings.some((w) => /label of that name/.test(w)), 'a real clash of colors is still said');

eq(rich("{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0\\fcharset0 Roman;}{\\f1\\fcharset204 Cyrillic;}}\\f1 \\'cf\\f0 \\'e9}").plain, 'Пé', 'returning to ANSI font restores its code page');
eq(rich("{\\rtf1\\ansi{\\fonttbl\\f0\\fcharset0 Roman;\\f1\\fcharset204 Cyrillic;}\\f1 \\'cf\\plain \\'e9}").plain, 'Пé', 'Cocoa flat font tables and plain restore encoding');
rejects(() => projectSource(new Map([...files, ['files/data/' + id(3) + '/content.rtf', bytes('collision')]]), 'Novel', async () => true), 'desktop source rejects case collisions too');
const roots = new Map(files);
roots.set(`Files/Data/${id(1)}/content.rtf`, bytes('{\\rtf1 Draft root writing.}'));
roots.set(`Files/Data/${id(1)}/notes.rtf`, bytes('{\\rtf1 Root notes.}'));
roots.set(`Files/Data/${id(6)}/content.rtf`, bytes('{\\rtf1 Research root writing.}'));
roots.set(`Files/Data/${id(6)}/synopsis.txt`, bytes('Research summary'));
const rootPlan = planImport(readProject(projectSource(roots, 'Novel', async () => true)), options);
ok(utf8(rootPlan.files.get('Novel/Manuscrit text.md')).includes('Draft root writing'), 'Draft root prose is a visible scene');
ok(utf8(rootPlan.files.get('Novel/Novel.md')).includes('Root notes'), 'Draft root metadata belongs to binder');
ok(!utf8(rootPlan.files.get('Novel/Manuscrit text.md')).includes('Root notes'), 'root metadata is not duplicated on synthetic scene');
ok(utf8(rootPlan.files.get('Novel/Research/Sources text.md')).includes('Research root writing'), 'Research root prose is a visible scene');
ok(utf8(rootPlan.files.get('Novel/Research/Research.md')).includes('Research summary'), 'Research root metadata preserved');
roots.set(`Files/Data/${id(6)}/content.rtf`, bytes('unsupported Research content'));
ok(planImport(readProject(projectSource(roots, 'Novel', async () => true)), { ...options, research: false }).sceneCount > 0, 'excluded Research is not converted');
const extensionNames = readProject(source);
extensionNames.roots[0].children[0].title = 'Scene.md';
extensionNames.roots[0].children[1].title = 'Scene';
const extPlan = planImport(extensionNames, options);
ok(extPlan.files.has('Novel/Scene/Scene.md') && extPlan.files.has('Novel/Scene 2.md'), 'folder titles ending in md cannot collide with note names');
const emptyFiles = new Map(files); emptyFiles.delete(`Files/Data/${id(5)}/content.rtf`);
const emptyPlan = planImport(readProject(projectSource(emptyFiles, 'Novel', async () => true)), options);
ok(emptyPlan.files.has('Novel/Snapshots 2.md'), 'a text item with no RTF remains a note');
// (Scrivener writes no file for a document nothing was typed in: an empty note is the whole truth, and no warning)
ok(utf8(emptyPlan.files.get('Novel/Snapshots 2.md')) === '' && !emptyPlan.warnings.some((w) => w.startsWith('Snapshots:') && /text/.test(w)), 'and is an empty note, with nothing said of it');

// What is said is about this document, not about rich text: a file as Scrivener writes every one says nothing.
const usual = rich('{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761{\\fonttbl\\f0\\fnil Palatino;}{\\colortbl;\\red0\\green0\\blue0;}{\\*\\expandedcolortbl;;\\cssrgb\\c0\\c0\\c0;}\\pard\\tx560\\f0\\fs26 \\cf0 An ordinary paragraph.}');
eq(usual.markdown, 'An ordinary paragraph.\n', 'an ordinary document as a Mac writes it');
eq(usual.warnings.join('|'), '', 'has nothing to look at: a size, a color and what a program keeps for itself are in every file');
ok(rich('{\\rtf1 Some {\\ul underlined} words.}').warnings.some((w) => /Underlining/.test(w)), 'what a writer put on words by hand, and is lost, is said');
eq(rich('{\\rtf1 Before{\\*\\annotation{\\*\\atnauthor Me}A note in the margin.} after.}').markdown, 'Before%%A note in the margin.%% after.\n', 'a comment as Word writes one is kept as a comment');
let wrapped: Uint8Array | null = null;
eq(readRtf(bytes('{\\rtf1 A{\\*\\shppict{\\pict\\pngblip 0a0b}}{\\nonshppict{\\pict\\wmetafile8 ffff}}Z}'), { picture: (b) => { wrapped = b; return '![[p.png]]'; } }).markdown, 'A![[p.png]]Z\n', 'a picture as Word wraps one is kept, once');
ok(!!wrapped && equalBytes(wrapped, Uint8Array.of(10, 11)), 'byte for byte');

// Names from the project are never paths: whatever a title or a binder's name says, every file is inside the new
// binder's folder, under a name a vault on any system can hold, and no two are the same file.
{
	let next = 100;
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const made = (type: string, title: string, kids = '') => { const i = ++next; return { i, xml: `<BinderItem UUID="${id(i)}" Type="${type}"><Title>${esc(title)}</Title><MetaData></MetaData>${kids ? `<Children>${kids}</Children>` : ''}</BinderItem>` }; };
	const titles = ['../../escape', '..', '.', '/abs', 'a/b', 'a\\b', '.hidden', 'trail.', 'trail ', ' lead', 'con', 'COM1.txt', 'nul', 'a..md', 'x .md', '.md', 'same', 'same', 'SAME', 'Snapshots', 'Research', 'Attachments', 'Book', 'a:b*c?"<>|', 'tab\there', 'new\nline', '', '   ', '%', '#tag', '[[link]]', 'x^y', 'é', 'é', 'ends.md.', 'LPT9', 'aux.', '~', '-', 'a'.repeat(300), '😀'.repeat(120), 'Originals', 'Exports', 'b..md', 'y .MD'];
	// (the last two are folders only: a folder is where a name that ends in a dot or a space is refused, or silently changed)
	const notes = titles.slice(0, -2).map((t) => made('Text', t)), folders = [...titles.slice(0, 20), ...titles.slice(-2)].map((t) => made('Folder', t, made('Text', t).xml));
	const hostile = new Map<string, Uint8Array>([['Book.scrivx', bytes(`<ScrivenerProject Version="2.0"><Binder><BinderItem UUID="${id(1)}" Type="DraftFolder"><Title>Draft</Title><Children>${[...notes, ...folders].map((k) => k.xml).join('')}</Children></BinderItem><BinderItem UUID="${id(2)}" Type="ResearchFolder"><Title>Research</Title><Children>${made('Text', 'Research').xml}${made('Text', 'Originals').xml}</Children></BinderItem></Binder></ScrivenerProject>`)]]);
	for (const k of notes) hostile.set(`Files/Data/${id(k.i)}/content.rtf`, bytes('{\\rtf1 Words{\\pict\\pngblip 0102ff}.}'));
	hostile.set(`Files/Data/${id(notes[0].i)}/..hidden. /odd name. `, bytes('a sidecar'));
	const bad: string[] = [];
	for (const name of ['../../Evil', 'Book', '.obsidian', 'a/b', 'con', 'x.', ' ', 'Snapshots']) {
		const p = planImport(readProject(projectSource(hostile, 'Book', async () => true)), { ...options, name, parent: 'Parent' }), root = `Parent/${p.name}`, seen = new Set<string>();
		for (const path of [...p.files.keys(), ...p.folders]) {
			if (path !== root && !path.startsWith(root + '/')) bad.push(`${path}: outside ${root}`);
			for (const step of path.split('/')) {
				if (!step || step.startsWith('.') || /[. ]$/.test(step) || /[. ]$/.test(step.replace(/\.(md|snapshot)$/i, ''))) bad.push(`${path}: “${step}” starts with a dot or ends in a dot or a space`);
				// eslint-disable-next-line no-control-regex
				if (/[\\:*?"<>|\x00-\x1f]/.test(step)) bad.push(`${path}: a character a file name can’t have`);
				if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(step)) bad.push(`${path}: a name Windows keeps for itself`);
				if (step.length > 255) bad.push(`${path}: too long a name`);
			}
			const k = path.normalize('NFC').toLowerCase();
			if (seen.has(k)) bad.push(`${path}: twice`);
			seen.add(k);
		}
		ok(p.files.has(`${root}/${p.name}.md`), `the binder “${name}” has its note`);
	}
	eq([...new Set(bad)].slice(0, 6).join('\n'), '', 'no title or name writes outside the binder, under a name a vault can’t hold, or over another file');
	// the check both the plan and the writer make, whatever made the path
	for (const path of ['Parent/Book', 'Parent/Book/Book.md', 'Parent/Book/Part one/Arrival.md']) ok(inBinder('Parent/Book', path), `${path} is in the binder`);
	for (const path of ['Parent/Book/../Other/x.md', 'Parent/Booklet/x.md', 'Parent/x.md', '/Parent/Book/x.md', 'Parent/Book//x.md', 'Parent/Book/.obsidian/x.md', 'Parent/Book/a\\..\\..\\x.md', 'Parent/Book/dir./x.md', 'Parent/Book/dir /x.md', 'Parent/Book/']) ok(!inBinder('Parent/Book', path), `${path} is not`);
}

// A long book is planned in the time a choice in the dialog can wait for: 2,000 documents, 400,000 words.
{
	const big = new Map<string, Uint8Array>(), para = 'The mail coach left her at the turning, where the road gave up being a road. {\\i Mara} stood with her case in the wind.\\par\n';
	let next = 1000, kids = '';
	for (let c = 0; c < 100; c++) {
		let scenes = '';
		for (let s = 0; s < 20; s++) { const i = ++next; scenes += `<BinderItem UUID="${id(i)}" Type="Text"><Title>Scene ${s}</Title><MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData></BinderItem>`; big.set(`Files/Data/${id(i)}/content.rtf`, bytes(`{\\rtf1\\ansi ${para.repeat(8)}}`)); }
		kids += `<BinderItem UUID="${id(++next)}" Type="Folder"><Title>Chapter ${c}</Title><Children>${scenes}</Children></BinderItem>`;
	}
	big.set('Big.scrivx', bytes(`<ScrivenerProject Version="2.0"><Binder><BinderItem UUID="${id(1)}" Type="DraftFolder"><Title>Draft</Title><Children>${kids}</Children></BinderItem></Binder></ScrivenerProject>`));
	const read = readProject(projectSource(big, 'Big', async () => true)), from = performance.now();
	const first = planImport(read, { ...options, name: 'Big' }), once = performance.now() - from;
	planImport(read, { ...options, name: 'Big', research: false });
	const twice = performance.now() - from - once;
	eq(first.sceneCount, 2000, 'two thousand documents are planned');
	ok(once < 6000 && twice < 6000, `in time: ${Math.round(once)} ms, and ${Math.round(twice)} ms when a choice changes`);
}

// A piece that is damaged or missing costs that piece, and is said: it never refuses the rest of the book.
eq(rich('{\\rtf1 Half \\u-10179? a character.}').plain, 'Half � a character.', 'half a character is marked, and the words round it kept');
ok(rich('{\\rtf1 Half \\u-10179? a character.}').warnings.length === 1, 'and it is said');
eq(rich("{\\rtf1\\mac caf\\'8e}").plain, 'café', 'Mac Roman text');
const odd = rich("{\\rtf1\\ansi\\ansicpg437 The caf\\'82 on the corner.}");
ok(odd.plain.startsWith('The caf') && odd.plain.endsWith(' on the corner.'), 'a code page that can’t be read keeps the words');
ok(odd.warnings.some((w) => /characters/.test(w)), 'and says some characters may be wrong');
const hurt = new Map(files);
hurt.set(`Files/Data/${id(3)}/content.rtf`, bytes('This was never rich text.'));
hurt.set(`Snapshots/${id(3)}.snapshots/index.xml`, bytes('<Snapshots Version="1.0"><Snapshot><Title>Gone</Title><Date>2026-08-01 10:00:00 -0400</Date></Snapshot><Snapshot><Title>Undated</Title><Date>last week</Date></Snapshot><Snapshot><Title>Before</Title><Date>2026-09-01 10:00:00 -0400</Date></Snapshot></Snapshots>'));
hurt.set(`Snapshots/${id(4)}.snapshots/index.xml`, bytes('<Snapshots><Snapshot>'));
hurt.set(`Files/Data/${id(4)}/synopsis.txt`, Uint8Array.of(0x41, 0xff, 0x42));
hurt.set('Novel.scrivx', bytes(utf8(files.get('Novel.scrivx')).replace('</Children></BinderItem><BinderItem UUID="' + id(8), `<BinderItem UUID="${id(10)}" Type="PDF"><Title>Lost map</Title><MetaData><FileExtension>pdf</FileExtension></MetaData></BinderItem></Children></BinderItem><BinderItem UUID="` + id(8))));
let hurtPlan: ReturnType<typeof planImport> | null = null;
try { hurtPlan = planImport(readProject(projectSource(hurt, 'Novel', async () => true)), options); } catch (e) { ok(false, `a damaged document refused the whole project: ${e instanceof Error ? e.message : String(e)}`); }
if (hurtPlan) {
	const at = (path: string) => utf8(hurtPlan.files.get(path));
	ok(at('Novel/Chapter/Chapter 3.md').includes('Second child'), 'the documents beside a damaged one are read');
	ok(/\]\]|\]\(/.test(at('Novel/Chapter/Chapter 2.md')) && !at('Novel/Chapter/Chapter 2.md').includes('never rich'), 'a document that can’t be read links to its original');
	ok([...hurtPlan.files].some(([path, data]) => path.includes('Originals') && new TextDecoder().decode(data) === 'This was never rich text.'), 'whose bytes are kept as they are');
	ok(hurtPlan.warnings.some((w) => w.startsWith('Chapter:') && /could not be read/.test(w)), 'and it is said, by name');
	ok(at('Novel/Chapter/Chapter 3.md').includes('synopsis: "A�B"') && hurtPlan.warnings.some((w) => w.startsWith('Chapter:') && /synopsis/.test(w)), 'a synopsis that isn’t text is kept as far as it reads, and said');
	eq(hurtPlan.snapshotCount, 1, 'a snapshot with its text is still brought in');
	ok(hurtPlan.warnings.some((w) => /snapshot/.test(w) && /missing/.test(w)), 'a snapshot without its text is said');
	ok(hurtPlan.warnings.some((w) => /snapshot/.test(w) && /date/.test(w)), 'a snapshot without a date is said');
	ok(hurtPlan.warnings.some((w) => /snapshots/.test(w) && /list/.test(w)), 'a list of snapshots that can’t be read is said');
	ok(hurtPlan.files.has('Novel/Research/Lost map.md') && hurtPlan.warnings.some((w) => w.startsWith('Lost map:') && /missing/.test(w)), 'a research file that is missing leaves its note, and is said');
}
ok(!utf8(plan.files.get('Novel/Chapter/Chapter 3.md')).startsWith('---\n\n---') && utf8(planImport(readProject(projectSource(new Map([...files, [`Files/Data/${id(5)}/content.rtf`, bytes('{\\rtf1 ---\\par Text.}')]]), 'Novel', async () => true)), options).files.get('Novel/Snapshots 2.md')) === '\\---\n\nText.\n', 'a note with no properties has no block of them, and its text can’t be taken for one');
// Binders' own path field is skipped by its id, not its title: a writer's field can be titled "Binders path" as well, and keeps it.
const pathFiles = new Map<string, Uint8Array>([
	['Trail.scrivx', bytes(`<ScrivenerProject Version="2.0"><CustomMetaDataSettings><MetaDataField ID="binderspath"><Title>Binders path</Title></MetaDataField><MetaDataField ID="mine"><Title>Binders path</Title></MetaDataField></CustomMetaDataSettings><Binder>${item(1, 'DraftFolder', 'Draft', '', item(2, 'Text', 'Plain', '<IncludeInCompile>Yes</IncludeInCompile><CustomMetaData><MetaDataItem><FieldID>binderspath</FieldID><Value>Part One/Plain</Value></MetaDataItem><MetaDataItem><FieldID>mine</FieldID><Value>kept</Value></MetaDataItem></CustomMetaData>'))}</Binder></ScrivenerProject>`)],
	[`Files/Data/${id(2)}/content.rtf`, bytes('{\\rtf1 Plain text.}')],
]);
const pathPlan = planImport(readProject(projectSource(pathFiles, 'Trail', async () => true)), { name: 'Trail', parent: '', research: false, snapshots: false, settings: DEFAULT_SETTINGS });
const pathNote = utf8(pathPlan.files.get('Trail/Plain.md'));
ok(!pathNote.includes('Part One/Plain'), 'the path field Binders wrote is not brought in, found by its id');
ok(pathNote.includes('"Binders path": "kept"'), 'a writer’s field with the same title is kept');
done('Scrivener import');
