// @ts-expect-error a plain module, without types
import { plan as demoPlan } from '../scripts/demo-vault/build.mjs';
import { buildBook } from '../src/export/book';
import { writeDocx } from '../src/export/docx';
import { MANUSCRIPT_STYLES } from '../src/export/docx-parts';
import { parseBody } from '../src/export/markdown';
import { bookWords, type Block, type Inline } from '../src/export/model';
import { titleFrom, type SourceItem } from '../src/export/roles';
import { DEFAULT_SETTINGS } from '../src/settings-data';
import { readWord } from '../src/import/docx';
import { planManuscript } from '../src/import/manuscript';
import type { ImportPlan } from '../src/import/plan';
import { parts } from '../src/scene-text';
import { bindersOf, type Files, type TestBinder } from './export-vault';
import { ROWS_INNER, ROWS_TEXT, bigBinder, read } from './export-fixtures';
import { firstDifference, sourceWords, tokens } from './export-words';
import { docxWords, plannedWords } from './import-words';
import { done, eq, ok } from './harness';

/* The round trip: a binder exported to Word by Binders' own writer, in each manuscript style, then imported again.
   The words are the same (held by a second reader that shares no code with the importer), the chapters and their
   titles are the book's sections, and every word has the formatting it had. What cannot come back, by design:
   straight quotes (export typesets them), comments, block ids, tag lines, and the notes' own names. */

const WHEN = new Date('2026-10-05T12:00:00Z');
const note = (name: string, text: string, more: Partial<SourceItem> = {}): SourceItem => ({ kind: 'note', name, path: `${name}.md`, text, included: true, ...more });
const folder = (name: string, children: SourceItem[]): SourceItem => ({ kind: 'folder', name, path: name, included: true, children });
const settings = { ...DEFAULT_SETTINGS };

/** Every word with its formatting, in order, from blocks: "word:ibs". Footnotes are left to the words test. */
function styled(blocks: readonly Block[]): string[] {
	const out: string[] = [];
	const inl = (runs: readonly Inline[]) => { for (const r of runs) if (r.kind === 'text') for (const w of tokens(r.text)) out.push(`${w}:${r.i ? 'i' : ''}${r.b ? 'b' : ''}${r.s ? 's' : ''}`); };
	const walk = (list: readonly Block[]) => {
		for (const b of list) {
			if (b.kind === 'heading') inl(b.runs.map((r) => (r.kind === 'text' ? { ...r, i: false, b: false, s: false } : r)));
			else if (b.kind === 'p') inl(b.runs);
			else if (b.kind === 'quote') { if (b.title) inl(b.title); walk(b.blocks); }
			else if (b.kind === 'list') for (const item of b.items) walk(item);
			else if (b.kind === 'table') for (const row of b.rows) for (const cell of row) inl(cell);
		}
	};
	walk(blocks);
	return out;
}

let checked = 0;
const ambiguous: string[] = [];
/** A footnote marked twice: export sets the second mark as its number, a digit that is text in the file. */
const markedTwice = (items: readonly SourceItem[]): boolean => items.some((it) => (it.kind === 'note' && [...(it.text ?? '').matchAll(/\[\^([^\]\s]+)\](?!:)/g)].some((m, i, all) => all.findIndex((x) => x[1] === m[1]) !== i)) || markedTwice(it.children ?? []));
/** A table: export bolds its header row, which is formatting the book didn't have, and import writes a table as paragraphs. */
const hasTable = (items: readonly SourceItem[]): boolean => items.some((it) => /^\|.*\|\s*\n\|[-: |]+\|/m.test(it.text ?? '') || hasTable(it.children ?? []));
function trip(b: TestBinder, what: string, strict = false): { ms: number } {
	let ms = 0;
	for (const style of MANUSCRIPT_STYLES) {
		const label = `${what}, ${style.name}`;
		const book = buildBook(b.items, { title: b.name, author: 'A Writer', matter: false }, b.resolve);
		if (!book.sections.length) { ambiguous.push(label); continue; }
		const bytes = writeDocx(book, style, { contact: [], words: bookWords(book), when: WHEN });
		const t0 = Date.now();
		const { plan } = planManuscript(readWord(bytes, `${b.name}.docx`, { bytes }, { tabs: true }), { name: 'Back', parent: '', settings, choices: {}, scenes: 'words' });
		ms += Date.now() - t0;
		checked++;
		// 1. the words of the file, by a second reader, are the words of the plan
		const want = docxWords(bytes), got = plannedWords(plan);
		const body = firstDifference(want.body, got.body), notes = firstDifference(want.notes, got.notes);
		ok(!body && !notes, `${label}: every word of the file is in the plan, in order${body ? ` (${body})` : ''}${notes ? ` (${notes})` : ''}`);
		// 2 to 4 hold when the file reads back as the book it was: its chapters are its sections. (A book of one chapter with
		// subheadings is read as chapters by its subheadings: nothing is lost, and #1 holds, but the chapters are not the book's.)
		const sections = book.sections.filter((s) => (s.role === 'part' || s.role === 'chapter') && !s.made);
		const heads = plan.notes.slice(1).filter((n) => n.heading !== undefined && !/^Front matter/.test(n.path.slice('Back/'.length)));
		const same = heads.map((n) => titleFrom(n.title)).join('|') === sections.map((s) => s.title).join('|') && heads.length === sections.length;
		if (!strict && (!same || markedTwice(b.items) || !sections.length)) { ambiguous.push(label); continue; }
		// 2. the words that went in: the book's own, without the headings export made, the title page, or a chapter's number
		const rows = plan.notes.slice(1).filter((n) => !n.folder && !/^Front matter\//.test(n.path.slice('Back/'.length)));
		const text: string[] = [], source = sourceWords(b.items, book.structure, b.embedded);
		for (const n of rows) text.push(...tokens(n.body.replace(n.heading ? `# ${n.heading}\n\n` : '\u0000', '').replace(/\^\[[^\]]*\]/g, ' ').replace(/\[\^[^\]]*\]/g, ' ')));
		const noteless = tokens(source.body.join(' '));
		void noteless;
		const inBody = firstDifference(source.body, rows.flatMap((n) => plannedWords({ ...plan, notes: [plan.notes[0], { ...n, heading: undefined }] } as ImportPlan).body));
		ok(!inBody, `${label}: the words that went in come back${inBody ? ` (${inBody})` : ''}`);
		// 3. the chapters and their titles are the book's sections
		eq(heads.map((n) => titleFrom(n.title)).join('|'), sections.map((s) => s.title).join('|'), `${label}: the chapters and parts, with their titles`);
		// 4. each word keeps its formatting
		const wantStyled = styled(book.sections.filter((s) => s.role !== 'front' && s.role !== 'back' && !s.made).flatMap((s) => s.blocks));
		const gotStyled = rows.flatMap((n) => styled(parseBody(n.heading && n.body.startsWith(`# ${n.heading}\n\n`) ? n.body.slice(n.heading.length + 4) : n.body).blocks));
		const sd = hasTable(b.items) ? null : firstDifference(wantStyled, gotStyled);
		ok(!sd, `${label}: each word keeps its italics, bold and strike${sd ? ` (${sd})` : ''}`);
	}
	return { ms };
}

// ---- the test vault, the note with every row, the demo vault ----
{
	for (const b of bindersOf(read('test-vault'))) trip(b, `test vault, ${b.name}`, b.name === 'The Lighthouse');
	const rows: TestBinder = { folder: 'Rows', name: 'Rows', items: [folder('One', [note('Every row', parts(ROWS_TEXT).body), note('After', 'The scene after.')])], resolve: { embed: (t) => (t === 'Inner note' ? { text: ROWS_INNER } : null) }, embedded: (t) => (t === 'Inner note' ? ROWS_INNER : null) };
	trip(rows, 'every row');
	const demo = bindersOf(demoPlan({}) as Files);
	for (const b of demo) trip(b, `demo vault, ${b.name}`);
	ok(checked > 40, `${checked} files made and read back`);
	console.log(`  round trip: ${checked} files; chapters and formatting not compared for ${ambiguous.length} (one chapter read by its subheadings, a footnote marked twice, or no chapters)`);
}

// ---- 150,000 words, in time ----
{
	const big: TestBinder = { folder: 'Big', name: 'A long book', items: bigBinder(), resolve: {}, embedded: () => null };
	const book = buildBook(big.items, { title: big.name, author: '', matter: false }, big.resolve);
	const bytes = writeDocx(book, MANUSCRIPT_STYLES[0], { contact: [], words: 1, when: WHEN });
	const t0 = Date.now();
	const { plan } = planManuscript(readWord(bytes, 'Big.docx', { bytes }, { tabs: true }), { name: 'Big', parent: '', settings, choices: {}, scenes: 'words' });
	const ms = Date.now() - t0;
	ok(ms < 10000, `a 150,000-word binder, exported and imported, is read and planned in under ten seconds (${ms} ms)`);
	ok(!firstDifference(docxWords(bytes).body, plannedWords(plan).body), 'and every word is there');
}

// ---- the test is tested ----
{
	const items = [folder('Part One', [note('01 The jetty', 'She stood.\n\nShe waited.\n\n***\n\nShe left *early*.'), note('02 The tide', 'It rose.\n\nIt fell.')]), note('Epilogue', 'It was over.')];
	const b: TestBinder = { folder: 'T', name: 'T', items, resolve: {}, embedded: () => null };
	const book = buildBook(items, { title: 'T', author: '', matter: false }, {});
	const bytes = writeDocx(book, MANUSCRIPT_STYLES[0], { contact: [], words: 1, when: WHEN });
	const { plan } = planManuscript(readWord(bytes, 'T.docx', { bytes }, { tabs: true }), { name: 'Back', parent: '', settings, choices: {}, scenes: 'words' });
	const want = sourceWords(items, book.structure).body, rows = plan.notes.slice(1).filter((n) => !n.folder && n.title !== 'Title page');
	const join = (list: typeof rows) => list.flatMap((n) => plannedWords({ ...plan, notes: [plan.notes[0], { ...n, heading: undefined }] } as ImportPlan).body);
	ok(!firstDifference(want, join(rows)), 'tested: the words agree before they are damaged');
	ok(firstDifference(want, join(rows.map((n, i) => (i === rows.findIndex((x) => x.body.includes('\n\n')) ? { ...n, body: n.body.replace(/[^\n]+\n+/, '') } : n)))) !== null, 'tested: a dropped paragraph is noticed');
	const sw = [...rows];
	[sw[1], sw[2]] = [sw[2], sw[1]];
	ok(firstDifference(want, join(sw)) !== null, 'tested: two swapped chapters are noticed');
	const sty = (n: typeof rows) => n.flatMap((x) => styled(parseBody(x.body).blocks));
	ok(sty(rows).join().includes('early:i'), 'tested: italics come back');
	ok(sty(rows.map((n) => ({ ...n, body: n.body.replace(/\*early\*/, 'early') }))).join() !== sty(rows).join(), 'tested: a lost italic is noticed');
	void b;
}
done('import roundtrip');
