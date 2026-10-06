// Word counts that agree with the book: the views' counter (src/view/book-words.ts) against export's own reader and
// its `bookWords`. The light counter must give what export's parser gives, on every note and every binder of the demo
// vault, on each row of "What Markdown becomes", and on the awkward texts below. If the two ever differ, this fails.
// @ts-expect-error a plain module, without types
import { plan } from '../scripts/demo-vault/build.mjs';
// @ts-expect-error a plain module, without types
import { ROWS } from '../scripts/demo-vault/examples/markdown.mjs';
import { buildBook } from '../src/export/book';
import { bookWords } from '../src/export/model';
import { assignRoles, guessStructure, readStructure, type SourceItem } from '../src/export/roles';
import { Session } from '../src/focus/session';
import { parts } from '../src/scene-text';
import { readSettings } from '../src/settings-data';
import { inBook, opensSection, readBody, readBodyByParser, readWords, type BookRead, type Found } from '../src/view/book-words';
import { countWords } from '../src/view/words';
import { bindersOf, type Files, type TestBinder } from './export-vault';
import { done, eq, ok } from './harness';

const words = (text: string): number => readWords(text).words;
/** What export itself counts for a text that is a book's one chapter (`scene`: a chapter's one scene). */
const exported = (body: string, scene = false, embed: Record<string, string> = {}): number => {
	const note: SourceItem = { kind: 'note', name: 'Note', path: 'B/Note.md', included: true, text: body };
	const items: SourceItem[] = scene ? [{ kind: 'folder', name: 'Chapter', path: 'B/Chapter', included: true, children: [note] }] : [note];
	return bookWords(buildBook(items, { title: 'T', author: '', matter: true, structure: scene ? 'chapters' : 'notes' }, { embed: (t) => (t in embed ? { text: embed[t] } : null), image: () => null }));
};

// ---- the rule, a kind of content at a time (docs/dev/plan.md, "What a word of the book is") ----
{
	eq(words('He met her at the foot of the tower.'), 9, 'a sentence');
	eq(words('---\nsynopsis: Not counted at all.\n---\nThree words here.'), 3, 'properties are no part of the book');
	eq(words('One %%a note to myself%% two.'), 2, 'a comment is left out');
	eq(words('One.\n\n%%\nA comment of\nseveral lines.\n%%\n\nTwo.'), 2, 'a comment of several lines');
	eq(words('One <!-- an HTML comment --> two.'), 2, 'an HTML comment is left out');
	eq(words('She saw [[The keeper|him]] there.'), 4, 'a link is the words it shows');
	eq(words('She saw [[The keeper]] there.'), 5, 'a link without words of its own is the note’s name');
	eq(words('Read [the report](https://example.com/a/long/address) now.'), 4, 'a link’s address is no word');
	eq(words('Read <https://example.com> now.'), 4, 'an address typed between angle brackets is its own words (two: “https” and the rest)');
	eq(words('Text.\n\n```js\nconst a = 1;\n```'), 4, 'a code block is in the book as typed (not the language it names)');
	eq(words('Run `npm test` twice.'), 4, 'so is code in a line');
	eq(words('A claim.[^1] More.\n\n[^1]: The source, in four.'), 7, 'a footnote’s text is in the book, once');
	eq(words('A claim.[^1] Again.[^1]\n\n[^1]: One two.'), 5, 'a footnote marked twice is there once');
	eq(words('A claim.\n\n[^1]: Nothing points here.'), 2, 'a footnote nothing points at is left out');
	eq(words('A claim.^[Said in passing.] More.'), 6, 'a footnote typed where it is marked');
	eq(words('Before.\n\n![[Another note]]\n\nAfter.'), 2, 'what is embedded isn’t this note’s text');
	eq(words('Before.\n\n![a red kite](kite.png)\n\nAfter.'), 2, 'a picture’s description is no word on the page');
	eq(words('> [!note] Mind the gap\n> Two words.'), 5, 'a callout’s title and text, not its kind');
	eq(words('> [!warning]\n> Two words.'), 2, 'a callout without a title');
	eq(words('## A heading\n\nText.'), 3, 'a heading inside a note');
	eq(words('| Name | Age |\n|---|---|\n| Mara | 31 |'), 4, 'a table’s cells, not its rule');
	eq(words('\tA tab-led paragraph.\n\tAnother one.'), 5, 'paragraphs begun with a tab');
	eq(words('    Four spaces are no code.'), 5, 'nor is a line begun with spaces code');
	eq(words('<div class="aside">Two words.</div>'), 2, 'HTML’s text, not its tags');
	eq(words('Kept <span class="x">in a line</span> too.'), 5, 'HTML in a line');
	eq(words('Text here.\n\n#draft #to-check'), 2, 'a line of nothing but tags is left out');
	eq(words('A line with an id. ^abc123'), 5, 'a block’s id is no word');
	eq(words('It was ==very== un==believ==able.'), 4, 'a highlight is its words');
	eq(words('It was *very* un*believ*able, **truly**.'), 5, 'emphasis inside a word doesn’t split it');
	eq(words('1. First\n2. Second\n\n- [ ] a task'), 4, 'a list’s numbers and marks are no words');
	eq(words('Cost: $x + y$ in all.'), 5, 'math is in the book as typed');
	eq(words('A &amp; B, and a\\-b.'), 4, 'a character written by name, and one escaped');
	eq(words('One\n\n---\n\nTwo\n\n* * *\n\nThree'), 3, 'a scene break is no word');
	eq(words('Don’t stop: well-known, co-op; 3.14 and e.g. this.'), 8, 'apostrophes, hyphens and full stops inside a word');
	eq(words(''), 0, 'empty');
	eq(words('---\nstatus: draft\n---\n'), 0, 'only properties');
}

// ---- the same text, as Obsidian's status bar counts it (the setting off): more ----
{
	const t = 'One %%hidden words here%% two [[The keeper|him]] and [a link](https://example.com/x).\n\n```\ncode here\n```';
	eq(words(t), 8, 'the book’s count');
	ok(countWords(t) > words(t), `the status bar’s count is more (${countWords(t)})`);
}

// ---- the title of a chapter: export sets it, and counts it with its own headings, not with the text ----
{
	const r = readWords('# The long way home\n\nThree words here.');
	eq(r.words, 7, 'a level-one heading at a note’s top is its text');
	eq(inBook(r, true, () => null), 3, 'in a note that opens a chapter it is the chapter’s title, which export sets itself');
	eq(inBook(r, false, () => null), 7, 'in a scene it is a heading in the text');
	eq(exported('# The long way home\n\nThree words here.'), 3, 'as export has it: a chapter');
	eq(exported('# The long way home\n\nThree words here.', true), 7, 'as export has it: a scene');
	const fn = readWords('# Title[^1]\n\nText.\n\n[^1]: Gone with the title.');
	eq(inBook(fn, true, () => null), exported('# Title[^1]\n\nText.\n\n[^1]: Gone with the title.'), 'a footnote marked only in the title goes with it');
	ok(opensSection('chapter') && opensSection('part') && opensSection('front') && opensSection('back') && !opensSection('scene') && !opensSection('out') && !opensSection('group'), 'which roles open a section');
}

// ---- what a note embeds is in the book where it is embedded ----
{
	const inner = '# Inner\n\nFour words in it.[^a]\n\n![[Deeper]]\n\n[^a]: A note.';
	const find = (t: string): Found => (t === 'Inner' ? { note: readWords(inner) } : t === 'pic.png' ? 'picture' : null);
	const outer = 'Before.\n\n![[Inner]]\n\n![[Inner]]\n\n![[Missing]]\n\n![[pic.png]]\n\nAfter.';
	eq(inBook(readWords(outer), false, find), exported(outer, true, { Inner: inner }), 'an embedded note’s words, each time it is embedded; what it embeds itself is left out');
	const lead = '![[Missing]]\n\n![[Inner]]\n\nAfter.';
	eq(inBook(readWords(lead), true, find), exported(lead, false, { Inner: inner }), 'a chapter that opens with an embedded note’s heading takes it for its title');
	eq(inBook(readWords(outer), true, find), exported(outer, false, { Inner: inner }), 'and one that opens with text doesn’t');
}

// ---- the light counter and export's parser: the same on awkward texts ----
const same = (body: string, what: string): void => {
	const a = readBody(body), b = readBodyByParser(body);
	const key = (r: BookRead) => JSON.stringify([r.words, r.title, r.embeds, r.lead, r.first]);
	ok(key(a) === key(b), `light and parser agree on ${what}: ${key(a)} against ${key(b)}`);
	for (const scene of [false, true]) eq(inBook(a, !scene, () => null), exported(body, scene), `and with export on ${what}${scene ? ' (a scene)' : ''}`);
};
{
	const prose = 'She said, "Stop." He didn’t — not then; not ever...';
	const awkward: [string, string][] = [
		['plain prose', `${prose}\n\n${prose}\n${prose}`],
		['a plain line inside a fence', `${prose}\n\n\`\`\`\nplain words here\n*not* emphasis\n\nmore plain\n\`\`\`\n\n${prose}`],
		['a fence in a list item', `- item\n\n  \`\`\`\n  plain code line\n  *marked* line\n  \`\`\`\n\n${prose} *after*`],
		['a fence never closed', `${prose}\n\n\`\`\`\nplain\n[[not a link|x]]\n${prose}`],
		['a footnote with more paragraphs', `Text.[^1]\n\n[^1]: First.\n\n    Second paragraph of it.\n\n\tThird, by a tab.\n\nNot the footnote.`],
		['a footnote nothing points at, with more lines', `Text.\n\n[^1]: First\nlazy line of it\n\n    Second paragraph of it.\n\nNot the footnote.`],
		['a link defined elsewhere', `See [the site][s] and [other].\n\n[s]: https://example.com\n"A title"\n\n[other]: <https://example.org>\n\nPlain after.`],
		['a link over three lines', `A [link\nplain middle\nends](https://example.com/x) here.`],
		['emphasis over lines', `*one\nplain two\nthree* four`],
		['code over lines', `\`one\nplain two\nthree\` four`],
		['a quote with lazy lines', `> quoted *words*\nlazy plain line\n> more\n\n${prose}`],
		['a callout', `> [!tip]+ A title here\n> Its text.\nlazy plain\n\n${prose}`],
		['HTML blocks', `<div>\nplain inside\n\n</div>\n\n<pre>\nkept *as* typed\n\nplain\n</pre>\n\n${prose}`],
		['a table', `Name | Age\n--- | ---\nMara | 31\nplain row\n\n${prose}`],
		['a table with no bars around it', `Name\n---\nplain\n\n${prose}`],
		['math over lines', `$$\nx = y\nplain words\n$$\n\n${prose}`],
		['ordered lists and years', `1986. A year it was.\n1) Another\n2024 was plain.\n\n${prose}`],
		['bullets and dashes', `- one\n+ two\n* three\n— Bonjour, dit-il.\n-- typed dash\n\n${prose}`],
		['headings', `# One\n## Two ##\nplain\n###### Six\n####### seven\n#\n\n${prose}`],
		['tags and ids', `#tag #other\nA line #tagged in it.\nplain ^id1\n\n${prose} ^abc`],
		['comments', `One %%two%% three\n%%\nplain hidden\n%%\nfour <!-- five\nsix --> seven\n\`%%kept%%\`\n\n${prose}`],
		['comments that leave their marks', `a %%b%% %% c\n\nplain\n\n%% d`],
		['held characters', `a 0 b [[x|y]]\n\nplain`],
		['Windows line endings', `One *two*\r\n\r\nplain three\r\n[[a|b]]\r\n`],
		['indents', `  two spaces\n\tplain tab\n   *three*\n        eight plain\n\n${prose}`],
		['escapes and entities', `a\\*b\\* &copy; &#35; plain\\\nnext\n\n${prose}`],
		['a top-of-note heading', `# The *title*\n\nplain text\n`],
		['a heading after a blank', `\n\n# Title\nplain`],
		['a heading after plain', `plain\n# Not the title`],
		['an embed first', `![[Other]]\n\n# Heading\n\nplain`],
		['a picture first', `![alt words](pic.png)\n# Heading\nplain`],
		['a rule first', `***\n# Heading\nplain`],
		['embeds in a quote, a list and a footnote', `> ![[A]]\n\n- ![[B]]\n\nText.^[see ![[C]]]\n\n| ![[D]] |\n|---|\n\n# H ![[E]]`],
		['words that stand alone as marks', `a - b / c % d @ e + f\n\n50% and/or @home 1+1`],
		['emphasis that joins a word and emphasis that doesn’t', `She *never* said un*believ*able. It was *over*.\n\nsnake_case and _this_ and a_.b and *x*.y and *it*’s\n\nplain *start\nmiddle plain\nend* plain`],
		['numbers', `1,000 and 3.14 and 10-12 and 5’6\n\n1,000 *and* 3.14`],
		['other scripts', `日本語の文。これは、テストです。\n\nΚαλημέρα κόσμε — привет, мир.\n\nالسلام عليكم`],
		['nothing', ``],
		['only blank lines', `\n\n\n`],
	];
	for (const [what, body] of awkward) same(body, what);
}

// ---- and on notes put together at random from lines of every kind (the same ones every run) ----
{
	const POOL = ['', '', '', 'Plain words here.', 'More plain, "quoted" words — yes.', '\tTab-led plain line.', '    four spaces plain', '  two spaces plain', 'lazy plain after',
		'She *never* said it.', 'It was *over*. Then _under_, and *both*’s.', 'snake_case and a_.b and *x*.y', 'a * b ** c*', 'ends in *stars*...', 'word*’s* and “*quoted*”', 'plain _then\tmore_ words*',
		'*emph* word', 'un*believ*able', '**bold', 'end** here', '~~del~~ete', '[link', 'text](https://example.com/a b)', '[[Note|alias words]]', '![[Embed]]', '![alt](p.png)',
		'# Heading one', '## Two', '- item', '  - nested *x*', '1. first', '12) twelfth', '1986. year', '+ plus', '— Dash line.', '> quote', '> [!note] Title here',
		'```', '~~~', '    ```', '`code', 'span`', '[^1]: a footnote def', '[^2]: another', '\t[^1]: tabbed def', '> - [^1]: nested def', '- [^2]: listed def', 'ref[^1] and[^2]', '^[inline note]',
		'[x]: https://e.com', '"Title words"', '[x] used', '| a | b |', '|---|---|', '---', '***', '<div>', '</div>', '<span>in</span> html', '$$', '$x+y$',
		'%%', '%% c %%', '<!-- c -->', '<!--', '-->', '#tag #two', 'text ^blockid', '==hi==', 'a\\-b &amp; c', '  ', '.', '\t.', 'xxx 1,000 3.14', '    indented *cont*', '\t\tdeep plain'];
	let seed = 12345, differ = 0, first = '';
	const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	for (let i = 0; i < 6000; i++) {
		const lines: string[] = [];
		for (let j = 1 + Math.floor(rnd() * 9); j > 0; j--) lines.push(POOL[Math.floor(rnd() * POOL.length)]);
		const body = lines.join('\n'), a = JSON.stringify(readBody(body)), b = JSON.stringify(readBodyByParser(body));
		if (a !== b) { differ++; first ||= `${JSON.stringify(body)}: ${a} against ${b}`; }
	}
	eq(differ, 0, `the light counter and export’s parser agree on 6,000 notes made at random${first ? ` (${first})` : ''}`);
}

// ---- the demo vault: every note, every row of "What Markdown becomes", every binder ----
const files = plan({}) as Files;
{
	let notes = 0, differ = 0, first = '';
	for (const [path, data] of files) {
		if (!path.endsWith('.md') || typeof data !== 'string') continue;
		notes++;
		const body = parts(data).body, a = readBody(body), b = readBodyByParser(body);
		if (JSON.stringify(a) !== JSON.stringify(b)) { differ++; first ||= `${path}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`; }
	}
	ok(notes > 5000, `every note of the demo vault is read (${notes})`);
	eq(differ, 0, `the light counter and export’s parser agree on every note of the demo vault${first ? ` (${first})` : ''}`);
}
const binders = bindersOf(files);
const finder = (b: TestBinder, from: string) => (target: string, image: boolean): Found => {
	if (image) return b.resolve.image?.(target, from) ? 'picture' : null;
	const got = b.resolve.embed?.(target, from) ?? null;
	return !got ? null : 'picture' in got ? 'picture' : { note: readWords(got.text) };
};
/** A binder's words as the views add them up: each note that is in the book, as the book has it. */
function viewsTotal(b: TestBinder, structure: ReturnType<typeof readStructure>): number {
	let n = 0;
	for (const p of assignRoles(b.items, structure ?? guessStructure(b.items)).placed) {
		if (p.item.kind !== 'note' || p.role === 'out') continue;
		n += inBook(readBody(p.item.text ?? ''), opensSection(p.role), finder(b, p.item.path));
	}
	return n;
}
{
	eq(binders.length, 27, 'the demo vault’s binders');
	for (const b of binders) {
		const own = files.get(`${b.folder}/${b.name}.md`), yaml = typeof own === 'string' ? parts(own).yaml : '';
		const said = readStructure(/^structure:[ \t]*"?([^"\n]*)"?[ \t]*$/m.exec(yaml)?.[1]);
		const book = buildBook(b.items, { title: b.name, author: '', matter: true, structure: said }, b.resolve);
		eq(viewsTotal(b, said), bookWords(book), `${b.folder}: the views’ total is the exported book’s`);
	}
}
{
	const md = binders.find((b) => b.name === 'What Markdown becomes');
	ok(!!md && (ROWS as unknown[]).length > 20, 'the binder of “What Markdown becomes”');
	const notes: SourceItem[] = [];
	const walk = (list: readonly SourceItem[]) => { for (const it of list) { if (it.kind === 'note') notes.push(it); else walk(it.children ?? []); } };
	walk(md?.items ?? []);
	ok(notes.length >= (ROWS as unknown[]).length, `a note for every row (${notes.length})`);
	for (const it of notes) {
		for (const scene of [false, true]) {
			const alone: SourceItem = { ...it, included: true, exportAs: undefined };
			const items: SourceItem[] = scene ? [{ kind: 'folder', name: 'Chapter', path: `${md.folder}/Chapter`, included: true, children: [alone] }] : [alone];
			const want = bookWords(buildBook(items, { title: 'T', author: '', matter: true, structure: scene ? 'chapters' : 'notes' }, md.resolve));
			eq(inBook(readBody(it.text ?? ''), !scene, finder(md, it.path)), want, `“${it.name}” as a ${scene ? 'scene' : 'chapter'}`);
		}
	}
}

// ---- the day's words when the rule changes: a note is recounted, and what was written today stays ----
{
	const s = new Session(null, '2026-10-05');
	s.see('B/One.md', 120, 100);
	s.see('B/Two.md', 50, 80);
	s.see('C/Other.md', 10, 0);
	eq(s.words('B'), 0, 'thirty deleted and twenty written: none (never less)');
	s.see('B/Two.md', 95);
	eq(s.words('B'), 35, 'the day so far');
	s.recount('B/One.md', 90);
	s.recount('B/Two.md', 140);
	eq(s.words('B'), 35, 'recounted by another rule, the day’s words are what they were');
	eq(s.now('B/One.md'), 90, 'and each note has its new count');
	s.see('B/One.md', 100);
	eq(s.words('B'), 45, 'what is written after counts by the new rule');
	s.recount('B/Unseen.md', 12);
	ok(!s.has('B/Unseen.md'), 'a note not counted today isn’t started by a recount');
}

// ---- the setting ----
{
	eq(readSettings({}).bookWords, true, 'on unless said');
	eq(readSettings({ bookWords: false }).bookWords, false, 'off when turned off');
	eq(readSettings({ bookWords: 'no' }).bookWords, true, 'anything else is the default');
}

done('book-words');
