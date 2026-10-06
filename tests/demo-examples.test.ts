// The demo vault's example books (scripts/demo-vault/examples/): each is there, is a valid binder by
// docs/file-format.md, and has the shape and the features its line in the README claims, read with the plugin's own
// readers and built into a book by export's own code.
import { readFileSync } from 'fs';
// @ts-expect-error a plain module, without types
import { EXAMPLES, SCENARIOS, hash, plan, reconcile } from '../scripts/demo-vault/build.mjs';
// @ts-expect-error a plain module, without types
import { ROWS } from '../scripts/demo-vault/examples/markdown.mjs';
import { buildBook } from '../src/export/book';
import { blocksText, inlines, type Book } from '../src/export/model';
import { pictureOf } from '../src/export/picture';
import { assignRoles, guessStructure, readStructure } from '../src/export/roles';
import { readProject } from '../src/longform';
import { readIndex } from '../src/model';
import { tabLines } from '../src/paragraphs/text';
import { parts } from '../src/scene-text';
import { readSnapshot, readSnapshotName } from '../src/snapshot-text';
import { countWords } from '../src/view/words';
import { bindersOf, type Files, type TestBinder } from './export-vault';
import { done, eq, ok } from './harness';

interface Example { folder: string; path: string; about: string; tryIt: string; binder?: boolean; opens?: string }
const files = plan({}) as Files, paths = [...files.keys()];
const text = (p: string): string => { const d = files.get(p); return typeof d === 'string' ? d : ''; };
const under = (folder: string) => paths.filter((p) => p.startsWith(folder + '/'));
const examples = (SCENARIOS as Example[]).filter((s) => s.path.startsWith('Examples/'));
const binders = new Map(bindersOf(files).map((b) => [b.folder, b]));
/** A note's properties, as far as these tests need them: each name with its value as written. */
const props = (p: string): Record<string, string> => Object.fromEntries([...parts(text(p)).yaml.matchAll(/^([A-Za-z][\w-]*):[ \t]*(.*)$/gm)].map((m) => [m[1], m[2].replace(/^"(.*)"$/, '$1')]));
const list = (p: string): string[] => { const m = /^contents:\n((?: {2}- .*\n)*)/m.exec(text(p)); return m ? m[1].trimEnd().split('\n').filter(Boolean).map((l) => { const v = l.slice(4); return v.startsWith('"') ? JSON.parse(v) as string : v; }) : []; };
const body = (p: string) => parts(text(p)).body;
/** The book export makes of an example, with what its binder note says of language and structure. */
function bookOf(folder: string, matter = true): { book: Book; b: TestBinder; said: Record<string, string> } {
	const b = binders.get(folder), said = props(`${folder}/${folder.split('/').pop()}.md`);
	return { book: buildBook(b.items, { title: said.title ?? b.name, author: said.author ?? '', language: said.language, structure: readStructure(said.structure), matter }, b.resolve), b, said };
}
const count = (book: Book, role: string) => book.sections.filter((s) => s.role === role).length;
const words = (book: Book) => book.sections.reduce((n, s) => n + countWords(blocksText(s.blocks)), 0);
const E = (name: string) => `Examples/${name}`;

// ---- every example: there, listed in the README, and a valid binder ----
eq(EXAMPLES.length, examples.length, 'every example is in the vault’s Examples folder');
ok(examples.length >= 12, `twelve folders of examples or more (${examples.length})`);
const KNOWN = new Set(['synopsis', 'status', 'label', 'target', 'export', 'export-as', 'binder', 'contents', 'title', 'subtitle', 'author', 'language', 'structure', 'copyright', 'longform', 'pov', 'notes', 'tags', 'aliases', 'role', 'age', 'reviewed', 'a-property-of-my-own']);
for (const s of examples) {
	const mine = under(s.path), notes = mine.filter((p) => p.endsWith('.md'));
	ok(mine.length > 0 && s.about.length > 40 && s.tryIt.length > 20, `${s.folder}: has files, and the README says what it is and what to try`);
	ok(notes.every((p) => !/^compile:/m.test(parts(text(p)).yaml)), `${s.folder}: “export”, never the older “compile”`);
	const odd = notes.flatMap((p) => Object.keys(props(p)).filter((k) => !KNOWN.has(k)).map((k) => `${k} in ${p}`));
	ok(!odd.length, `${s.folder}: only the properties Binders and Obsidian know${odd.length ? ` (${odd[0]})` : ''}`);
	ok(mine.every((p) => p.split('/').every((part) => new TextEncoder().encode(part).length <= 255 && !/[*"\\<>:|?]/.test(part))), `${s.folder}: names any system can hold`);
	if (s.binder === false || s.opens === 'Index') continue;
	const note = `${s.path}/${s.folder}.md`, fm = props(note), contents = list(note);
	eq(fm.binder, '1', `${s.folder}: a binder note, format 1`);
	const read = readIndex({ binder: 1, contents }, s.folder).contents;
	eq(read.length, contents.length, `${s.folder}: the plugin reads every entry of its list`);
	const missing = contents.filter((e) => (e.endsWith('/') ? !under(`${s.path}/${e.slice(0, -1)}`).length : !files.has(`${s.path}/${e}${/\.(png|jpg|pdf|canvas)$/.test(e) ? '' : '.md'}`)));
	ok(!missing.length, `${s.folder}: every entry is a file or a folder that is there${missing.length ? ` (${missing[0]})` : ''}`);
	const folderNote = (p: string) => { const seg = p.split('/'); return seg[seg.length - 1] === `${seg[seg.length - 2]}.md`; };
	ok(contents.every((e) => e.endsWith('/') || !folderNote(`${s.path}/${e}.md`)), `${s.folder}: no folder note is listed as a scene`);
	const unlisted = notes.filter((p) => !folderNote(p) && !p.startsWith(`${s.path}/Snapshots/`) && !contents.includes(p.slice(s.path.length + 1, -3)));
	ok(unlisted.length <= 1, `${s.folder}: every note is in the list (but the one left out on purpose)${unlisted.length > 1 ? ` (${unlisted[1]})` : ''}`);
	ok(!!fm.synopsis && !!fm.author, `${s.folder}: the binder has a synopsis and an author`);
	ok(binders.has(s.path), `${s.folder}: export’s reader finds it`);
	// what its line in the README says of its length holds, as export counts it
	const claim = /about ([\d,]+) words/.exec(s.about);
	if (claim) { const n = words(bookOf(s.path).book), want = Number(claim[1].replace(/,/g, '')); ok(Math.abs(n - want) / want < 0.08, `${s.folder}: about ${claim[1]} words, as its line says (${n})`); }
}

// ---- links: every link in the examples leads to one note, but the ones that are there to be broken ----
{
	const names = new Map<string, string[]>();
	for (const p of paths) { const n = p.split('/').pop().replace(/\.md$/, ''); names.set(n, [...(names.get(n) ?? []), p]); }
	const broken: string[] = [], twice: string[] = [];
	for (const p of under('Examples').filter((x) => x.endsWith('.md'))) {
		for (const m of text(p).replace(/```[\s\S]*?```|`[^`\n]*`/g, '').matchAll(/!?\[\[([^\]|#\n]+)/g)) {
			const target = m[1].replace(/\\$/, '').trim(), hits = files.has(`${target}.md`) || files.has(target) ? [target] : names.get(target) ?? [];
			if (!hits.length) broken.push(`${target} in ${p}`); else if (hits.length > 1) twice.push(`${target} in ${p}`);
		}
	}
	const meant = broken.filter((b) => /What Markdown becomes/.test(b));
	eq(broken.length - meant.length, 0, `no broken link outside “What Markdown becomes”${broken.length > meant.length ? ` (${broken.find((b) => !meant.includes(b))})` : ''}`);
	eq(meant.length, 3, 'which has three, on purpose: a note, a picture and a PDF that aren’t there');
	ok(!twice.length, `no link that could mean two notes${twice.length ? ` (${twice[0]})` : ''}`);
}

// ---- the novel: three levels, front and back matter, a card's worth of data on every scene ----
{
	const at = E('Low Water at Corran'), { book } = bookOf(at), plainBook = bookOf(at, false).book;
	ok(book.structure === 'parts-chapters' && book.guessed, 'the novel: parts, chapters and scenes, guessed from its shape');
	eq([count(book, 'part'), count(book, 'chapter'), count(book, 'front'), count(book, 'back')].join(), '3,32,2,2', 'three parts, thirty chapters with a prologue and an epilogue, two pages before and two after');
	eq(book.sections.filter((s) => s.role === 'chapter' && s.number === null).length, 2, 'the prologue and the epilogue have no number');
	ok(count(plainBook, 'front') + count(plainBook, 'back') === 0, 'a manuscript without front and back matter leaves them out');
	const scenes = under(at).filter((p) => p.split('/').length === 5 && !p.endsWith(`/${p.split('/')[3]}.md`));
	ok(scenes.length >= 90, `ninety scenes or more in chapter folders (${scenes.length})`);
	ok(scenes.every((p) => { const f = props(p); return f.synopsis && f.status && f.label && f.pov && Number(f.target) > 0; }), 'each with a synopsis, a status, a label, a point of view and a target');
	eq([...new Set(scenes.map((p) => props(p).label))].sort().join(), 'Blue,Green,Purple', 'three points of view, three labels');
	ok(['Done', 'Revised', 'Draft'].every((st) => scenes.filter((p) => props(p).status === st).length >= 10), 'statuses spread as a draft has them');
	eq(scenes.filter((p) => props(p).export === 'false').length, 3, 'three scenes left out of export');
	ok(scenes.filter((p) => props(p).notes).length >= 8, 'some have notes');
	ok(scenes.filter((p) => /\n\n\*\*\*\n\n/.test(body(p))).length >= 20, 'scene breaks inside scenes');
	const folders = under(at).filter((p) => p.endsWith(`/${p.split('/').slice(-2)[0]}.md`) && p.split('/').length > 3);
	ok(folders.length === 33 && folders.every((p) => props(p).synopsis), 'every part and chapter has a folder note with a synopsis');
	const n = words(plainBook);
	ok(n >= 80000 && n <= 100000, `80,000 to 100,000 words (${n})`);
	ok(new Set(scenes.map((p) => body(p))).size === scenes.length, 'no two scenes the same');
	// the story bible beside it
	const bible = E('Corran story bible'), people = under(`${bible}/People`);
	ok(!under(bible).some((p) => /^binder:/m.test(parts(text(p)).yaml)) && !binders.has(bible), 'the story bible is not a binder, and is in no export');
	ok(people.length === 10 && people.every((p) => scenes.some((s) => body(s).includes(`[[${p.split('/').pop().replace(/\.md$/, '')}|`))), 'every person in it is linked from a scene');
	ok(scenes.filter((p) => /\[\[/.test(body(p))).length >= 25, 'a good share of the scenes link to it');
}

// ---- the novella and the flat novel: the other two shapes ----
{
	const { book } = bookOf(E('Twelve Hives'));
	ok(book.structure === 'chapters' && book.guessed, 'the novella: chapters and scenes, guessed');
	ok(count(book, 'chapter') === 12 && book.sections.every((s) => s.title === '' && s.number !== null), 'twelve chapters, each a number with no title');
	const scenes = under(E('Twelve Hives')).filter((p) => p.split('/').length === 4 && !p.endsWith(`/${p.split('/')[2]}.md`));
	ok(scenes.length >= 30 && scenes.every((p) => !body(p).includes('"') && !body(p).includes("'")) && scenes.filter((p) => body(p).includes('“')).length > 15, 'typed with curly quotes and apostrophes throughout');
	ok(scenes.filter((p) => /\bI\b/.test(body(p))).length === scenes.length, 'in the first person');

	const at = E('Kettleby Junction'), flat = bookOf(at).book;
	ok(flat.structure === 'notes' && flat.guessed, 'the flat novel: every note a chapter, guessed');
	ok(count(flat, 'chapter') === 36 && flat.sections.every((s) => s.title && !/^\d/.test(s.title)), '36 chapters, each with its title and without the number in its name');
	const chapters = under(at).filter((p) => /\/\d\d [^/]+\.md$/.test(p));
	let lines = 0, led = 0, italic = 0, linked = 0, web = 0;
	for (const p of chapters) {
		const t = body(p), all = t.split('\n'), tabbed = new Set(tabLines(t));
		all.forEach((l, i) => { if (!l.trim() || l === '***') return; lines++; if (l.startsWith('\t') && tabbed.has(i)) led++; if (/^\t.*\*[^*]+\*/.test(l)) italic++; if (/^\t.*\[\[/.test(l)) linked++; if (/^\t.*\]\(https:/.test(l)) web++; });
	}
	ok(lines > 2000 && led === lines, `every paragraph begins with a tab, and the plugin reads each as one (${led} of ${lines})`);
	ok(italic > 50 && linked >= 30 && web >= 3, `italics, links to notes and links to the web on those lines (${italic}, ${linked}, ${web})`);
	ok(!blocksText(flat.sections[0].blocks).includes('\t') && !flat.sections.some((s) => s.blocks.some((b) => b.kind === 'code')), 'and export drops the tabs: no tab, and no code, in the book');
}

// ---- the collection and the handbook ----
{
	const { book, b, said } = bookOf(E('Nine Kinds of Weather'));
	ok(!book.guessed && book.structure === 'chapters' && said.structure === 'chapters and scenes' && guessStructure(b.items) === 'parts-chapters', 'the collection: its structure is said, where the guess would have been wrong');
	eq(count(book, 'chapter'), 9, 'nine stories, nine chapters');
	eq(assignRoles(b.items, book.structure).deep.map((d) => d.name).join(), 'Night', 'one folder is deeper than the structure reaches');
	ok(book.sections.some((s) => s.title === 'Fog, or the ferryman’s wife'), 'a story takes its title from its first heading');
	ok(body(E('Nine Kinds of Weather/Still air.md')) === '' && (body(E('Nine Kinds of Weather/Frost.md')).match(/^\*\*\*$/gm) ?? []).length === 8, 'a story that is only a card, and one in nine fragments');

	const at = E('The Kitchen Table Press'), press = bookOf(at), src = under(at).filter((p) => p.endsWith('.md')).map(body).join('\n');
	ok(press.book.structure === 'parts' && press.book.guessed, 'the handbook: parts and chapters, guessed from the folders’ names');
	eq([count(press.book, 'part'), count(press.book, 'chapter'), count(press.book, 'front'), count(press.book, 'back')].join(), '3,11,2,3', 'three parts, a preface and ten chapters, front and back matter from their folders');
	ok(press.book.notes.length >= 25, `footnotes (${press.book.notes.length})`);
	ok((src.match(/\^\[/g) ?? []).length >= 3 && /\[\^gsm\][\s\S]*\[\^gsm\][\s\S]*\[\^gsm\]: /.test(body(`${at}/Part One - Paper/Grain.md`) + body(`${at}/Part One - Paper/Choosing paper.md`)) && /\[\^tapes\]: .*\n {4}\S/.test(src) && src.includes('[^unused]:'), 'typed in place, marked twice, in two paragraphs, and never marked');
	const kinds = new Set(press.book.sections.flatMap((s) => s.blocks.map((x) => x.kind)));
	ok(['table', 'list', 'quote', 'heading', 'image'].every((k) => kinds.has(k)), `tables, lists, quotations, subheadings and pictures in the book (${[...kinds].join(' ')})`);
	ok((src.match(/^\|[ :]*-/gm) ?? []).length >= 6 && (src.match(/^> \[!/gm) ?? []).length >= 3 && /^- \[x\] /m.test(src), 'six tables, three callouts and a checklist in the notes');
	const pics = under(`${at}/Figures`).filter((p) => p.endsWith('.png'));
	ok(pics.length === 4 && pics.every((p) => { const pic = pictureOf(files.get(p) as Uint8Array); return pic?.type === 'png' && pic.width >= 300 && pic.height >= 300; }), 'four figures, real pictures of a real size');
	ok(press.book.sections.flatMap((s) => s.blocks).filter((x) => x.kind === 'image').length === 4 && !press.book.warnings.some((w) => /picture/i.test(w.text)), 'each one found and set where a chapter shows it');
	ok(/\]\(https:\/\/example\.(com|org)/.test(src) && /<https:\/\/example\.org/.test(src) && /\[\[Grain\]\]/.test(src), 'links to the web and between chapters');
}

// ---- the draft in progress ----
{
	const at = E('The Varga Job'), { book } = bookOf(at), notes = under(at).filter((p) => p.endsWith('.md') && !p.startsWith(`${at}/Snapshots/`));
	ok(book.structure === 'chapters' && book.guessed, 'the draft: chapters and scenes, guessed');
	eq(book.outline.filter((r) => r.role !== r.auto && r.role !== 'out').map((r) => `${r.name}: ${r.auto} to ${r.role}`).join('; '), 'A note before: chapter to front; The letter Varga never sent: scene to chapter; The vault, three tries: chapter to group; Coda: chapter to scene; Thanks: chapter to back', 'export-as overrules the guess on five items');
	const statuses = new Set(notes.map((p) => props(p).status).filter(Boolean));
	ok(['Idea', 'Draft', 'draft', 'Revised', 'Needs research', 'Cut'].every((st) => statuses.has(st)), `mixed statuses, some the writer’s own (${[...statuses].join(', ')})`);
	const empty = notes.filter((p) => props(p).synopsis && !body(p).trim() && props(p).status === 'Idea');
	ok(empty.length >= 4, `scenes that are only a synopsis (${empty.length})`);
	const one = body(`${at}/The plan/Four locks.md`);
	ok(one.trim().split('\n').length === 1 && countWords(one) > 700, `a scene that is one long paragraph (${countWords(one)} words)`);
	const over = notes.filter((p) => Number(props(p).target) && countWords(body(p)) > Number(props(p).target) * 1.3), short = notes.filter((p) => Number(props(p).target) && countWords(body(p)) && countWords(body(p)) < Number(props(p).target) * 0.5);
	ok(over.length >= 1 && short.length >= 3, `targets overshot (${over.length}) and far from met (${short.length})`);
	const names = notes.map((p) => p.split('/').pop());
	ok(['Opening.md', 'Lena.md', 'Notes.md'].every((nm) => names.filter((x) => x === nm).length >= 2), 'the same name in two folders, three times over');
	const all = notes.map(body).join('\n'), out = book.sections.map((s) => blocksText(s.blocks)).join('\n');
	ok(/%%[^%]+%%/.test(all) && /%%\n[\s\S]+?\n%%/.test(all) && /<!--/.test(all) && /==TK/.test(all), 'comments of each kind and a highlighted note to self in the text');
	ok(!/%%|<!--|NOTE TO SELF|is this where she sees/.test(out) && out.includes('TK: the name of the street'), 'no comment reaches the book, and a highlight’s words do');
	ok(props(`${at}/Cut scenes/Cut scenes.md`).export === 'false' && !out.includes(body(`${at}/Cut scenes/The tunnel (cut).md`).split('\n')[0].slice(0, 60)), 'the cut scenes are left out, as a folder');
	ok(!list(`${at}/The Varga Job.md`).includes('Scratch') && files.has(`${at}/Scratch.md`), 'a note the list doesn’t mention');
	const snaps = under(`${at}/Snapshots`);
	eq(snaps.length, 6, 'six snapshots');
	ok(snaps.every((p) => { const of = p.split('/').slice(3, -1).join('/'), r = readSnapshot(text(p)); return r.of === of && r.taken !== null && !!readSnapshotName(p.split('/').pop().replace(/\.snapshot$/, '')) && r.body.length > 500; }), 'each where the plugin keeps them, named and dated as it does');
	eq(snaps.filter((p) => !files.has(`${at}/${p.split('/').slice(3, -1).join('/')}.md`)).length, 1, 'one of a note that is gone');
	eq(snaps.filter((p) => p.includes('/Opening/The door/')).length, 3, 'three of one scene');
}

// ---- other languages and scripts ----
{
	const de = bookOf(E('Die Uhr von Sankt Veit')).book, fr = bookOf(E('Le Bac de minuit')).book;
	const out = (b: Book) => b.sections.map((s) => blocksText(s.blocks)).join('\n');
	ok(de.language === 'de' && /„Sie steht auf zehn nach vier“, sagte er/.test(out(de)) && out(de).includes(' — ') && out(de).includes('…'), 'German: its quotes, a dash and an ellipsis are set');
	ok(fr.language === 'fr' && out(fr).includes('« Écoutez », dit-il') && !out(fr).includes('"'), 'French: its quotes are set, with their no-break spaces');
	ok(/[äöüß]/.test(out(de)) && /[éèàùçû]/.test(out(fr)), 'accents in both');
	const at = E('Other Alphabets'), t = (name: string) => body(`${at}/${name}.md`), book = bookOf(at).book;
	ok(/[֐-׿]{3}/.test(t('Hebrew')) && /[؀-ۿ]{3}/.test(t('Arabic')) && /[֐-׿]/.test(t('A line in two directions')) && /[؀-ۿ]/.test(t('A line in two directions')), 'right-to-left text, alone and inside an English line');
	ok(/\p{Script=Han}/u.test(t('Chinese')) && /\p{Script=Hiragana}/u.test(t('Japanese')) && /\p{Script=Katakana}/u.test(t('Japanese')) && /\p{Script=Hangul}/u.test(t('Korean')) && /\p{Script=Greek}/u.test(t('Greek and Russian')) && /\p{Script=Cyrillic}/u.test(t('Greek and Russian')), 'Chinese, Japanese, Korean, Greek and Cyrillic');
	ok(countWords(t('Chinese')) > 30 && countWords(t('Japanese')) > 40, 'text without spaces is counted by its characters');
	ok(/‍/.test(t('Emoji')) && /\p{Regional_Indicator}{2}/u.test(t('Emoji')) && /\p{Emoji_Modifier}/u.test(t('Emoji')), 'emoji: joined, a flag, a skin tone');
	ok(t('Accents').includes('café') && t('Accents').includes('café'), 'é written two ways');
	ok(/ {2}\n/.test(t('Verse')) && /\\\n/.test(t('Verse')) && /\n {4}\S/.test(t('Verse')), 'verse: lines ended with two spaces, with a backslash, and a verse indented by four spaces');
	const verse = book.sections.find((s) => s.title === 'Verse'), breaks = [...inlines(verse.blocks)].flat().filter((r) => r.kind === 'br').length;
	ok(breaks >= 6 && !verse.blocks.some((x) => x.kind === 'code'), `and in the book its lines are still lines, and none of it is code (${breaks} line breaks)`);
	ok(/-- /.test(t('Dashes and dots')) && /\.\.\./.test(t('Dashes and dots')) && /[—–…“‘ ]/.test(t('Dashes and dots')), 'dashes and dots, typed and already set');
	ok(/Dear Mr Varga,/.test(t('Letters')) && /\n> TELEGRAM {2}\n/.test(t('Letters')) && (t('Letters').match(/ {2}\n/g) ?? []).length >= 5, 'a chapter of letters, with addresses line by line');
	eq(count(book, 'chapter'), 12, 'twelve pieces, each a chapter');
}

// ---- the Longform project ----
{
	const at = E('The Cartographer’s Winter'), index = text(`${at}/Index.md`);
	const names = [...index.matchAll(/^ {4,6}-(?: -)? (.+)$/gm)].map((m) => m[1]).filter((n) => n !== 'Research*');
	const nested = [...index.matchAll(/^ {4}- - (.+)\n {6}- (.+)$/gm)].flatMap((m) => [m[1], m[2]]);
	const scenes: unknown[] = [];
	for (const n of names) { if (nested.includes(n)) { const last = scenes[scenes.length - 1]; if (Array.isArray(last)) last.push(n); else scenes.push([n]); } else scenes.push(n); }
	const project = readProject({ longform: { format: 'scenes', sceneFolder: '/', scenes, ignoredFiles: ['Research*'] } });
	ok(/^---\nlongform:\n {2}format: scenes\n/.test(index) && !/^binder:/m.test(index), 'a Longform project, in Longform’s own format, and not a binder');
	eq(project.scenes.length, 14, 'fourteen scenes, as the plugin reads the list');
	eq(project.scenes.filter((s) => s.indent === 1).map((s) => s.title).join(), 'Forty feet,Brandt\'s figures', 'two of them indented under another');
	ok(project.scenes.every((s) => files.has(`${at}/${s.title}.md`) && props(`${at}/${s.title}.md`).synopsis), 'each a note in the project’s folder, with a synopsis');
	ok(files.has(`${at}/A page found later.md`) && !names.includes('A page found later') && files.has(`${at}/Research - surveying.md`), 'a scene the list doesn’t mention, and a file Longform ignores');
	ok(readSnapshot(text(`${at}/Snapshots/First ink/2026-09-18 20.12.44 Before Brandt speaks.snapshot`)).of === 'First ink', 'a snapshot, by scene name');
	const n = project.scenes.reduce((sum, s) => sum + countWords(text(`${at}/${s.title}.md`)), 0);
	ok(n > 10000 && n < 14000, `about 12,000 words (${n})`);
}

// ---- What Markdown becomes: a scene for each row of the doc's table ----
{
	const doc = readFileSync('docs/export.md', 'utf8'), table = /\*\*What Markdown becomes\.\*\*\n\n\| In the note \| In the book \|\n\|---\|---\|\n((?:\|.*\n)+)/.exec(doc);
	const rows = table ? table[1].trim().split('\n') : [];
	ok(rows.length >= 20, `the doc’s table is found (${rows.length} rows)`);
	const numbered = (ROWS as string[][]).filter((r) => /^\d\d /.test(r[0]));
	eq(numbered.length, rows.length, 'a scene for every row of the table, and no more');
	ok((ROWS as string[][]).every((r) => r[1].length > 30), 'each says in its synopsis what an export should do');
	const { book } = bookOf(E('What Markdown becomes')), out = book.sections.map((s) => blocksText(s.blocks)).join('\n');
	const warned = (re: RegExp) => book.warnings.some((w) => re.test(w.text));
	ok(warned(/picture/) && warned(/embedded in a note that is itself embedded/) && warned(/footnote/i) && warned(/tag/i) && warned(/Math/) && warned(/HTML/), 'export warns of each thing it leaves out or leaves as typed');
	ok(!/a-property-of-my-own|this is an Obsidian comment|this is an HTML comment|Two levels down|Nothing marks this one|\^first-block|#draft/.test(out), 'what should be left out is not in the book');
	const kept = ['This paragraph begins with a tab.', 'This is the text of the embedded note', 'three highlighted words', 'A sentence with a #tag inside it', 'const kept = "as typed"; // -- and ... too', '“Double quotes,” she said, “and ‘single ones’ inside them.”'];
	ok(kept.every((x) => out.includes(x)), `and what should be in it is${kept.filter((x) => !out.includes(x)).map((x) => ` (not: ${x})`).join('')}`);
	eq(book.notes.length, 5, 'four footnotes of the scene’s own (one marked twice is one), and the embedded note’s');
}

// ---- a second run changes nothing ----
{
	const again = plan({}) as Files;
	ok(again.size === files.size && [...again].every(([p, d]) => hash(d) === hash(files.get(p))), 'a second plan is the same, byte for byte');
	const made = Object.fromEntries([...files].map(([p, d]) => [p, hash(d) as string]));
	const r = reconcile(new Map(Object.entries(made)), made, (p: string) => made[p] ?? null);
	eq([r.write.length, r.remove.length, r.kept.length, r.gone.length].join(), '0,0,0,0', 'and a second run over an untouched vault writes nothing');
}

done('demo examples');
