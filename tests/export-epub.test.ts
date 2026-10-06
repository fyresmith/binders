import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve as abs } from 'path';
// @ts-expect-error a plain module, without types
import { plan } from '../scripts/demo-vault/build.mjs';
import { buildBook } from '../src/export/book';
import { bookId, writeEpub } from '../src/export/epub';
import { leadWords } from '../src/export/epub-text';
import type { Picture } from '../src/export/model';
import { pictureOf } from '../src/export/picture';
import type { SourceItem } from '../src/export/roles';
import { CLASSIC } from '../src/export/style';
import { parts } from '../src/scene-text';
import { readEpub } from './export-epub-read';
import { ROWS_INNER, ROWS_TEXT, bigBinder, grayPng, read } from './export-fixtures';
import { bindersOf, type Files, type TestBinder } from './export-vault';
import { firstDifference, sourceWords, tokens } from './export-words';
import { done, eq, ok } from './harness';

const WHEN = new Date('2026-10-05T12:00:00Z');
const note = (name: string, text: string, more: Partial<SourceItem> = {}): SourceItem => ({ kind: 'note', name, path: `${name}.md`, text, included: true, ...more });
const folder = (name: string, children: SourceItem[]): SourceItem => ({ kind: 'folder', name, path: name, included: true, children });
const png = (w: number, h: number): Picture => pictureOf(grayPng(w, h)) as Picture;

/** What must hold of any EPUB this writer makes, before a validator is asked: the zip as an EPUB must be, every file
    listed and every listed file there, every link leading somewhere, well-formed text. */
function sound(bytes: Uint8Array, what: string): void {
	const e = readEpub(bytes), problems: string[] = [];
	const u16 = (at: number) => bytes[at] + bytes[at + 1] * 256;
	if (e.names[0] !== 'mimetype' || e.files.mimetype !== 'application/epub+zip' || u16(8) !== 0 || u16(28) !== 0 || String.fromCharCode(...bytes.slice(30, 38)) !== 'mimetype') problems.push('mimetype isn’t first, stored and bare');
	const listed = new Map([...e.opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map((m) => [`OEBPS/${m[2]}`, m[1]] as const));
	for (const name of e.names) if (name.startsWith('OEBPS/') && name !== 'OEBPS/package.opf' && !listed.has(name)) problems.push(`${name} isn’t in the manifest`);
	for (const name of listed.keys()) if (!e.raw[name]) problems.push(`${name} is in the manifest and not in the file`);
	if (new Set(listed.values()).size !== listed.size) problems.push('two files have one id');
	for (const m of e.opf.matchAll(/<itemref idref="([^"]+)"/g)) if (![...listed.values()].includes(m[1])) problems.push(`the reading order names ${m[1]}, which isn’t there`);
	for (const [name, x] of Object.entries(e.files)) {
		if (!/\.(xhtml|ncx)$/.test(name)) continue;
		const dir = name.slice(0, name.lastIndexOf('/') + 1), ids = new Set([...x.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
		if (ids.size !== [...x.matchAll(/ id="([^"]+)"/g)].length) problems.push(`${name}: an id is there twice`);
		for (const m of x.matchAll(/ (?:href|src)="([^"]+)"/g)) {
			if (/^[a-z][\w+.-]*:/i.test(m[1])) continue;
			const [path, frag] = m[1].split('#'), target = path ? join(dir, path).replace(/\\/g, '/') : name;
			if (!e.raw[target]) problems.push(`${name} points at ${m[1]}, which isn’t there`);
			else if (frag && !new RegExp(` id="${frag}"`).test(e.files[target] ?? '')) problems.push(`${name} points at ${m[1]}: no such place`);
		}
	}
	for (const [name, xml] of Object.entries(e.files)) {
		if (name === 'mimetype' || name.endsWith('.css')) continue;
		const open: string[] = [];
		for (const m of xml.replace(/<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/g, '').matchAll(/<(\/?)([\w:]+)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
			if (m[4]) continue;
			if (!m[1]) open.push(m[2]); else if (open.pop() !== m[2]) { problems.push(`${name}: </${m[2]}> closes nothing`); break; }
		}
		if (open.length) problems.push(`${name}: <${open[open.length - 1]}> is never closed`);
	}
	ok(!problems.length, `${what}: a sound EPUB${problems.length ? ` (${problems.slice(0, 4).join('; ')})` : ''}`);
}

/** The word-for-word test: the words read back out of the file are the words that went in, in order. Front and back
    matter are in an ebook, and so are the pages Binders makes, which are no words of the writer's. */
function wordForWord(b: TestBinder, what: string): { words: number; ms: number; bytes: Uint8Array } {
	const t0 = Date.now();
	const book = buildBook(b.items, { title: b.name, author: 'A Writer', matter: true, made: {}, year: 2026 }, b.resolve);
	const bytes = writeEpub(book, CLASSIC, { when: WHEN });
	const ms = Date.now() - t0;
	const got = readEpub(bytes), want = sourceWords(b.items, book.structure, b.embedded, true);
	const body = firstDifference(want.body, got.body), notes = firstDifference(want.notes, got.notes);
	ok(!body, `${what}: every word of the text, in order${body ? ` (${body})` : ''}`);
	ok(!notes, `${what}: every word of the footnotes, in order${notes ? ` (${notes})` : ''}`);
	sound(bytes, what);
	return { words: want.body.length + want.notes.length, ms, bytes };
}

const samples: [string, Uint8Array][] = [];

// ---- the shape of an ebook ----
{
	const items = [
		note('Dedication', 'For M.'),
		note('Prologue', 'It began with a letter she had not opened, on the jetty.[^1] See [[01 The jetty|the jetty]] and [[Elsewhere]].\n\n[^1]: A *first* note.'),
		folder('Part One', [note('01 The jetty', 'She said "no" -- twice, and then once more for luck.\n***\nA [link](https://example.com/a?b=1&c=2) and *stress*.\n\n## Later\n\nAfter.'), note('Chapter 2', '> [!note] Mind\n> Quoted.\n\n- one\n- two\n\n3. third\n4. fourth\n\n| a | b |\n|---|:-:|\n| c | d |\n\n```\ncode <here>\n```\n\nEnd.^[Typed in place.]')]),
		note('About the author', 'She writes.'),
	];
	for (const c of items[2].children ?? []) c.path = `Part One/${c.name}.md`;
	const book = buildBook(items, { title: 'The Lighthouse', subtitle: 'A tale', author: 'Mara Lindqvist', language: 'en-GB', matter: true, made: {}, year: 2026, cover: png(1600, 2560) }, { link: (t) => (t.startsWith('01 The jetty') ? 'Part One/01 The jetty.md' : null) });
	const bytes = writeEpub(book, CLASSIC, { when: WHEN }), e = readEpub(bytes), f = (id: string) => e.files[`OEBPS/text/${id}.xhtml`] ?? '';
	sound(bytes, 'an ebook');
	samples.push(['shape', bytes]);
	eq(e.spine.map((s) => s.replace(/^OEBPS\/(text\/)?|\.xhtml$/g, '')).join(' '), 'title-page copyright dedication nav prologue part-1 chapter-1 chapter-2 about-the-author', 'a file to a section, in the book’s order: the made pages, the front matter, the contents, the text');
	eq(e.headings.join('|'), 'Dedication|Prologue|Part One|Chapter One The jetty|Chapter Two|About the author', 'headings as Classic sets them');
	ok(/<h1 id="h"><span class="hl hl0">Chapter One<\/span> <span class="hl hl1">The jetty<\/span><\/h1>/.test(f('chapter-1')), 'a heading’s lines can each be set');
	ok(f('title-page').includes('<h1 id="h">The Lighthouse</h1>') && f('title-page').includes('<p class="subtitle">A tale</p>') && f('title-page').includes('<p class="author">Mara Lindqvist</p>') && !/\bby\b/.test(f('title-page')), 'the title page: the title, the subtitle, the author, and no word of Binders’ own');
	ok(f('copyright').includes('<p class="first">© 2026 Mara Lindqvist</p>') && f('copyright').includes('epub:type="copyright-page"'), 'the copyright page');
	ok(/<p class="first"><span class="lead">She said “no” —<\/span> twice/.test(f('chapter-1')), 'a chapter’s first paragraph isn’t indented, and its first words are marked');
	ok(f('chapter-1').includes('<p class="break" role="separator">*&#160;*&#160;*</p>\n<p class="first">A <a href="https://example.com/a?b=1&amp;c=2">link</a> and <em>stress</em>.</p>'), 'a scene break is the style’s mark, and the paragraph after it isn’t indented; a web link is a link');
	ok(f('chapter-1').includes('<h2>Later</h2>\n<p class="first">After.</p>') && !f('prologue').includes('class="lead"') === false, 'a subheading; a prologue is a chapter too');
	ok(f('prologue').includes('<a href="chapter-1.xhtml">the jetty</a>') && f('prologue').includes(' and Elsewhere.'), 'a link to a note of the book leads to its chapter; one out of the book is its words');
	ok(/<a class="noteref" epub:type="noteref" role="doc-noteref" id="r1" href="#n1">1<\/a>/.test(f('prologue')) && /<aside epub:type="footnote" role="doc-footnote" id="n1">\n<p class="first"><a href="#r1" role="doc-backlink">1<\/a> A <em>first<\/em> note\.<\/p>/.test(f('prologue')), 'a footnote is a note a reader pops up, under its chapter, with the way back');
	ok(/id="r2" href="#n2">1<\/a>/.test(f('chapter-2')), 'footnotes are numbered from one in each chapter');
	ok(f('chapter-2').includes('<blockquote><p class="first"><strong>Mind</strong></p><p class="first">Quoted.</p></blockquote>') && f('chapter-2').includes('<ul><li><p class="first">one</p></li>') && f('chapter-2').includes('<ol start="3">') && f('chapter-2').includes('<thead><tr><th>a</th><th class="center">b</th></tr></thead><tbody><tr><td>c</td><td class="center">d</td></tr></tbody>') && f('chapter-2').includes('<pre><code>code &lt;here&gt;</code></pre>'), 'a callout, lists, a table and code');
	ok(f('chapter-1').includes('epub:type="chapter" role="doc-chapter"') && f('prologue').includes('epub:type="prologue" role="doc-prologue"') && f('part-1').includes('epub:type="part" role="doc-part"') && f('dedication').includes('role="doc-dedication"') && /<body epub:type="frontmatter">/.test(f('dedication')) && /<body epub:type="backmatter">/.test(f('about-the-author')), 'each section says what it is');
	const toc = /<nav epub:type="toc"[\s\S]*?<\/nav>/.exec(e.nav)?.[0] ?? '';
	eq([...toc.matchAll(/<a href="text\/([\w-]+)\.xhtml">([^<]*)<\/a>/g)].map((m) => `${m[1]}=${m[2]}`).join('|'), 'title-page=The Lighthouse|dedication=Dedication|prologue=Prologue|part-1=Part One|chapter-1=Chapter One · The jetty|chapter-2=Chapter Two|about-the-author=About the author', 'the contents: every section with a name');
	ok(/part-1\.xhtml">Part One<\/a><ol><li>.*chapter-2.*<\/ol><\/li><li><a href="text\/about/.test(toc), 'chapters are under their part');
	ok(/<nav epub:type="landmarks" hidden="hidden">.*epub:type="titlepage".*epub:type="toc" href="nav.xhtml#toc".*epub:type="bodymatter" href="text\/prologue.xhtml"/.test(e.nav), 'landmarks: the title page, the contents, where the text starts');
	ok((e.files['OEBPS/toc.ncx'] ?? '').includes('<navPoint id="np5" playOrder="5"><navLabel><text>Chapter One · The jetty</text></navLabel><content src="text/chapter-1.xhtml"/>'), 'and the same list for old readers');
	ok(e.opf.includes(`<dc:identifier id="bookid">${bookId(book)}</dc:identifier>`) && /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(bookId(book)) && bookId(book) !== bookId({ ...book, title: 'Other' }), 'the book’s identifier is its own, and the same each time');
	ok(e.opf.includes('<dc:title>The Lighthouse</dc:title>') && e.opf.includes('<dc:creator id="creator">Mara Lindqvist</dc:creator>') && e.opf.includes('<dc:language>en-GB</dc:language>') && e.opf.includes('<meta property="dcterms:modified">2026-10-05T12:00:00Z</meta>') && e.opf.includes('<dc:rights>© 2026 Mara Lindqvist</dc:rights>'), 'the package says whose book it is, in what language, and when it was made');
	ok(e.opf.includes('<item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>') && e.opf.includes('<meta name="cover" content="cover-image"/>') && !!e.raw['OEBPS/images/cover.png'], 'the cover is the package’s cover image');
	ok(['accessMode">textual', 'accessModeSufficient">textual', 'accessibilityFeature">tableOfContents', 'accessibilityHazard">none'].every((m) => e.opf.includes(m)), 'and what stores ask about accessibility');
	const css = e.files['OEBPS/css/book.css'] ?? '';
	ok(css.includes('p { margin: 0; text-indent: 1.4em;') && css.includes('p.first { text-indent: 0; }') && css.includes('.lead { text-transform: uppercase;') && /h1 \{[^}]*text-align: center; text-transform: uppercase;/.test(css), 'Classic’s shape: indents, first words, a centred heading in capitals');
	ok(!/font-family: (?!monospace)|font-size: \d+p[tx]|(^|[^-])color:|text-align: justify|@font-face/.test(css), 'the typeface, the size, the colours and the justification are left to the reader');
	const own = readEpub(writeEpub(book, { ...CLASSIC, name: 'Mine', 'scene-break': '', 'first-words': 'as the rest', paragraphs: 'spaced', 'heading-alignment': 'left', 'chapter-heading': '{number:roman}', css: 'p.break { color: red; }' }, { when: WHEN }));
	ok(own.headings.includes('I') && own.files['OEBPS/css/book.css'].includes('p + p { margin-top: 0.7em; }') && own.files['OEBPS/css/book.css'].trim().endsWith('p.break { color: red; }') && !own.files['OEBPS/text/chapter-1.xhtml'].includes('class="lead"') && own.files['OEBPS/text/chapter-1.xhtml'].includes('<p class="break" role="separator">&#160;</p>'), 'a style is data: another one sets the same book another way, and its own CSS comes last');
	const linked = readEpub(writeEpub(buildBook([note('Storm', '[[Ines]] entered the day in the harbour log, *late*.')], { title: 'T', author: '', matter: true, made: {} }), CLASSIC, { when: WHEN }));
	ok(linked.files['OEBPS/text/chapter-1.xhtml'].includes('<p class="first"><span class="lead">Ines entered the day</span> in the harbour log, <em>late</em>.</p>'), 'the first words are marked across a link that is only its words');
	eq([String(leadWords('One two three four five')), String(leadWords('One two three four')), String(leadWords('東京の夏は暑い'))].join('|'), 'One two three four, five|null|null', 'the first words: four, when there are more');
}

// ---- pictures; a footnote marked twice; a footnote in a footnote; other scripts; an empty book ----
{
	const pic = png(1024, 768);
	const book = buildBook([note('1', 'Before.\n\n![[map.png]]\n\n![A chart](map.png)\n\nOnce[^n] and again[^n].^[Outer, with one inside.[^n]]\n\n[^n]: The note.')], { title: 'T', author: '', matter: true, made: {} }, { embed: () => ({ picture: pic }), image: () => pic });
	const bytes = writeEpub(book, CLASSIC, { when: WHEN }), e = readEpub(bytes), ch = e.files['OEBPS/text/chapter-1.xhtml'];
	sound(bytes, 'pictures');
	samples.push(['pictures', bytes]);
	ok(!!e.raw['OEBPS/images/img-1.png'] && !e.raw['OEBPS/images/img-2.png'] && ch.includes('<img src="../images/img-1.png" alt="" role="presentation"/>') && ch.includes('<img src="../images/img-1.png" alt="A chart"/>') && e.opf.includes('accessMode">visual'), 'a picture is in the file once, with its alt text');
	ok(ch.includes('id="r1" href="#n1">1</a>') && ch.includes('id="r1-2" href="#n1">1</a>') && (ch.match(/<aside /g) ?? []).length === 2, 'a footnote marked twice is one footnote');
	ok(tokens((/<aside [^>]*id="n2">[\s\S]*?<\/aside>/.exec(ch)?.[0] ?? '').replace(/<[^>]+>/g, ' ')).join(' ').includes('Outer with one inside The note'), 'a footnote in a footnote is set in its place');
	ok(e.spine.join().includes('title-page') && !e.spine.join().includes('copyright') && !e.spine.includes('OEBPS/nav.xhtml'), 'no author: no copyright page; no chapter with a title: the contents are no page (the reader’s own list has them)');

	const ar = writeEpub(buildBook([note('باب', 'مرحبا بالعالم. "نص" آخر.')], { title: 'كتاب', author: 'كاتب', language: 'ar', matter: true, made: { contents: 'always' } }), CLASSIC, { when: WHEN }), a = readEpub(ar);
	sound(ar, 'a book from right to left');
	samples.push(['arabic', ar]);
	ok(/<html [^>]*lang="ar" xml:lang="ar" dir="rtl">/.test(a.files['OEBPS/text/chapter-1.xhtml']) && a.opf.includes('<spine toc="ncx" page-progression-direction="rtl">') && a.headings[0] === 'الفصل 1 باب' && a.nav.includes('<h1 id="h">المحتويات</h1>'), 'Arabic: right to left, pages turned that way, the headings in its words');
	const ja = writeEpub(buildBook([note('夏', '東京の夏は暑い。彼女は窓を開けた。')], { title: '本', author: '作家', language: 'ja', matter: true, made: {} }), CLASSIC, { when: WHEN }), jp = readEpub(ja);
	sound(ja, 'a book in Japanese');
	samples.push(['japanese', ja]);
	ok(jp.headings[0] === '第1章 夏' && jp.files['OEBPS/text/chapter-1.xhtml'].includes('<p class="first">東京の夏は暑い。彼女は窓を開けた。</p>') && !/dir="rtl"/.test(jp.opf), 'Japanese: its text whole, no first words to mark');
	const mixed = readEpub(writeEpub(buildBook([note('Mixed', 'An English line.\n\nהגשם התחיל בלילה.\n\n## שלום\n\n- بدأ المطر')], { title: 'T', author: '', matter: true, made: {} }), CLASSIC, { when: WHEN })).files['OEBPS/text/chapter-1.xhtml'];
	ok(mixed.includes('<p class="first">An English line.</p>') && mixed.includes('<p dir="auto">הגשם התחיל בלילה.</p>') && mixed.includes('<h2 dir="auto">שלום</h2>') && mixed.includes('<li><p class="first" dir="auto">بدأ المطر</p></li>'), 'a paragraph in a script that runs the other way from the book’s says so, and is set its own way');
	ok(a.files['OEBPS/text/chapter-1.xhtml'].includes('<p class="first">مرحبا') && readEpub(writeEpub(buildBook([note('باب', 'English here.')], { title: 'ك', author: '', language: 'ar', matter: true, made: {} }), CLASSIC, { when: WHEN })).files['OEBPS/text/chapter-1.xhtml'].includes('<p class="first" dir="auto">English here.</p>'), 'and so does a left-to-right paragraph in a right-to-left book');
	const sw = readEpub(writeEpub(buildBook([note('Mwanzo', 'Habari.')], { title: 'Kitabu', author: '', language: 'sw', matter: true, made: { contents: 'always' } }), CLASSIC, { when: WHEN }));
	ok(sw.headings[0] === '1 Mwanzo' && sw.nav.includes('<h1 id="h">Kitabu</h1>'), 'a language Binders has no words for: a number alone, and the book’s title over its contents');
	const empty = writeEpub(buildBook([], { title: '', author: '', matter: true, made: { titlePage: false } }), CLASSIC, { when: WHEN });
	sound(empty, 'an empty binder');
	samples.push(['empty', empty]);
}

// ---- word for word: the test vault; every row of "What Markdown becomes"; the demo vault; 150,000 words ----
const results: string[] = [];
{
	const binders = bindersOf(read('test-vault'));
	ok(binders.some((b) => b.name === 'The Lighthouse'), 'the test vault’s binder is found');
	for (const b of binders) { const r = wordForWord(b, `test vault, ${b.name}`); results.push(`${b.name}: ${r.words} words, ${r.ms} ms`); samples.push([b.name, r.bytes]); }
}
{
	const b: TestBinder = { folder: 'Rows', name: 'Rows', items: [folder('One', [note('Every row', parts(ROWS_TEXT).body), note('After', 'The scene after.')])], resolve: { embed: (t) => (t === 'Inner note' ? { text: ROWS_INNER } : null) }, embedded: (t) => (t === 'Inner note' ? ROWS_INNER : null) };
	const r = wordForWord(b, 'every row of the table');
	ok(r.words > 150, `it has its words (${r.words})`);
	samples.push(['rows', r.bytes]);
}
const demo: [string, Uint8Array][] = [];
{
	const binders = bindersOf(plan({}) as Files);
	ok(binders.length > 10, `the demo vault’s binders are found (${binders.length})`);
	let words = 0, ms = 0;
	for (const b of binders) { const r = wordForWord(b, `demo vault, ${b.name}`); words += r.words; ms += r.ms; demo.push([b.name, r.bytes]); }
	results.push(`demo vault, ${binders.length} binders: ${words} words, ${ms} ms`);
}
{
	const big: TestBinder = { folder: 'Big', name: 'A long book', items: bigBinder(), resolve: {}, embedded: () => null };
	const r = wordForWord(big, 'a binder of 150,000 words');
	ok(r.words > 150000, `it has its words (${r.words})`);
	ok(r.ms < 10000, `read and written in under ten seconds (${r.ms} ms)`);
	results.push(`150,000-word binder: ${r.words} words, ${r.ms} ms, ${Math.round(r.bytes.length / 1024)} kB`);
	samples.push(['150k', r.bytes]);
}
// the test itself would notice: a paragraph taken out of the file, or two sections changing places, is a difference
{
	const b = bindersOf(read('test-vault')).find((x) => x.name === 'The Lighthouse') as TestBinder;
	const make = () => buildBook(b.items, { title: b.name, author: '', matter: true, made: {} }, b.resolve);
	const want = sourceWords(b.items, make().structure, b.embedded, true);
	const whole = make();
	whole.sections[whole.sections.length - 1].blocks.pop();
	ok(!!firstDifference(want.body, readEpub(writeEpub(whole, CLASSIC)).body), 'a dropped paragraph is noticed');
	const swapped = make(), last = swapped.sections.length - 1;
	[swapped.sections[last], swapped.sections[last - 1]] = [swapped.sections[last - 1], swapped.sections[last]];
	ok(!!firstDifference(want.body, readEpub(writeEpub(swapped, CLASSIC)).body), 'two sections out of order are noticed');
}
console.log(`  word for word: ${results.join('; ')}`);

// ---- EPUBCheck, the validator every store names: a dev-time tool (`npm run get-epubcheck`), run when it is there ----
void (async () => {
	const out = abs('test-dist/export-epub');
	rmSync(out, { recursive: true, force: true });
	mkdirSync(join(out, 'demo'), { recursive: true });
	const safe = (name: string) => name.replace(/[^\p{L}\p{N} _-]+/gu, '_');
	for (const [name, bytes] of samples) writeFileSync(join(out, `${safe(name)}.epub`), bytes);
	for (const [name, bytes] of demo) writeFileSync(join(out, 'demo', `${safe(name)}.epub`), bytes);
	const tools = process.env.BINDERS_TOOLS || join(homedir(), '.cache', 'binders-tools'), jar = join(tools, 'epubcheck', 'epubcheck.jar');
	const java = [join(tools, 'jre', 'bin', 'java'), join(tools, 'jre', 'Contents', 'Home', 'bin', 'java')].find((p) => existsSync(p)) ?? (spawnSync('which', ['java']).status === 0 ? 'java' : '');
	if (process.env.BINDERS_NO_EPUBCHECK) console.log('  (BINDERS_NO_EPUBCHECK is set: EPUBCheck not run)');
	else if (!existsSync(jar) || !java) console.log(`\n  ******** EPUBCheck WAS NOT RUN: it isn’t installed. ********\n  The EPUBs these tests made were not validated. Get it once with: npm run get-epubcheck\n  (looked for ${jar}${java ? '' : ', and for Java'})\n`);
	else {
		const check = (path: string) => new Promise<{ fine: boolean; said: string }>((done) => {
			const c = spawn(java, ['-jar', jar, path, '--failonwarnings']);
			let text = '';
			c.stdout.on('data', (d: Buffer) => { text += d.toString(); });
			c.stderr.on('data', (d: Buffer) => { text += d.toString(); });
			c.on('error', (e) => done({ fine: false, said: String(e) }));
			c.on('close', (code) => done({ fine: code === 0, said: text.split('\n').filter((l) => /^(ERROR|WARNING|FATAL)/.test(l)).slice(0, 4).join(' | ') }));
		});
		// every sample, and of the demo vault every binder unless told to hurry (BINDERS_EPUBCHECK=some: one in four)
		const few = process.env.BINDERS_EPUBCHECK === 'some';
		const all = [...samples.map(([n]) => join(out, `${safe(n)}.epub`)), ...demo.filter((_d, i) => !few || i % 4 === 0).map(([n]) => join(out, 'demo', `${safe(n)}.epub`))];
		const t0 = Date.now();
		let bad = 0;
		// (a Java starts for each file: four at a time)
		const said = new Map<string, { fine: boolean; said: string }>(), queue = [...all];
		await Promise.all(Array.from({ length: 4 }, async () => { for (let path = queue.shift(); path; path = queue.shift()) said.set(path, await check(path)); }));
		for (const path of all) { const r = said.get(path) ?? { fine: false, said: 'not run' }; if (!r.fine) bad++; ok(r.fine, `EPUBCheck passes ${path.slice(out.length + 1)} without errors or warnings${r.fine ? '' : ` (${r.said})`}`); }
		console.log(`  EPUBCheck: ${all.length - bad} of ${all.length} files pass, ${Math.round((Date.now() - t0) / 1000)} s`);
	}
	done('export epub');
})();
