import { existsSync, readdirSync, readFileSync } from 'fs';
import { DEFAULT_SETTINGS } from '../src/settings-data';
import { readDocument } from '../src/import/docx';
import { planManuscript } from '../src/import/manuscript';
import type { ImportPlan } from '../src/import/plan';
import { firstDifference, tokens } from './export-words';
import { docxWords, plannedWords } from './import-words';
import { ok, eq, done } from './harness';

/* Files LibreOffice wrote itself (tests/fixtures/import/libreoffice: make.mjs and convert.sh), each book saved as .odt,
   flat .fodt and .rtf, and as the .docx that is the oracle: its words read by tests/import-words.ts, which shares no
   code with the readers. Every format of a book must give the oracle's words, in order, with its footnotes and
   comments, and the same binder: the one the Word import makes of LibreOffice's own .docx. */

const settings = { ...DEFAULT_SETTINGS };
const DIR = 'tests/fixtures/import/libreoffice';
const plan = (file: string, o: { revisions?: 'final' | 'original' } = {}): { plan: ImportPlan; said: string[] } => {
	const bytes = new Uint8Array(readFileSync(`${DIR}/${file}`));
	const r = planManuscript(readDocument(bytes, file, { bytes }, { tabs: true, ...o }), { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' });
	return { plan: r.plan, said: r.plan.said.map((s) => s.text) };
};
const rows = (p: ImportPlan) => p.notes.slice(1).filter((n) => n.title !== 'Research').map((n) => `${'  '.repeat(n.depth - 1)}${n.title}${n.folder ? '/' : ''}`).join('\n');

for (const book of ['salt-road', 'numbered']) {
	const oracle = new Uint8Array(readFileSync(`${DIR}/${book}.oracle.docx`));
	const want = docxWords(oracle, { comments: true });
	const word = plan(`${book}.oracle.docx`).plan;
	for (const ext of ['odt', 'fodt', 'rtf']) {
		const { plan: p, said } = plan(`${book}.${ext}`), got = plannedWords(p);
		const b = firstDifference(want.body, got.body), n = firstDifference(want.notes, got.notes);
		ok(!b, `${book}.${ext}: every word, in order, as LibreOffice's own .docx has them${b ? ` (${b})` : ''}`);
		ok(!n, `${book}.${ext}: every word of the footnotes, in order${n ? ` (${n})` : ''}`);
		eq(rows(p), rows(word), `${book}.${ext}: the same parts, chapters and scenes as LibreOffice's .docx makes`);
		if (book === 'salt-road') {
			ok(said.includes('This file has 2 tracked changes. They are brought in as accepted.'), `${book}.${ext}: the tracked changes are counted`);
			ok(said.includes('This file has 1 comment in its margin. They are kept as Obsidian comments, at the end of the words they are on.'), `${book}.${ext}: the comment is kept`);
			ok([...p.files.keys()].some((f) => /\/Attachments\/.*\.png$/.test(f)), `${book}.${ext}: the picture is kept`);
			const original = plannedWords(plan(`${book}.${ext}`, { revisions: 'original' }).plan).body.join(' ');
			ok(original.includes('spring tides before and storm tides') && original.includes('so smoothly and so fast as if'), `${book}.${ext}: Reject all brings back the words as they were`);
		} else {
			ok(said.includes('This file has hidden text in 2 places. It isn’t brought in; the original file keeps it.'), `${book}.${ext}: hidden text is left out, and said`);
			eq(rows(p), 'The harbour\nChapter 2\nThe road', `${book}.${ext}: a heading the outline numbers, with no words of its own, is named by its place`);
		}
	}
}

// The words the e2e tests find in the binder made in the vault (tests/e2e/specs-import-formats.mjs): the plan's notes'
// words in the binder's order, so that what is written is held to what is planned, and the plan to the oracle above.
for (const [file, list] of [['salt-road.odt', 'salt-road.odt.words.json'], ['source/salt-road-textedit.rtf', 'salt-road-textedit.rtf.words.json']]) {
	const { plan: p } = plan(file), got = p.notes.slice(1).filter((n) => !n.folder && !/\/Research\//.test(n.path)).flatMap((n) => tokens(n.body.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/!\[\[[^\]]*\]\]/g, '')));
	const d = firstDifference(JSON.parse(readFileSync(`${DIR}/${list}`, 'utf8')) as string[], got);
	ok(!d, `${list}: the words the e2e tests expect are the plan's${d ? ` (${d})` : ''}`);
}

// ---- files the maintainer has made (BINDERS_IMPORT_SAMPLES=<folder>; docs/dev/import.md, "Files the maintainer needs") ----
{
	const dir = process.env.BINDERS_IMPORT_SAMPLES;
	if (!dir) console.log('SKIPPED: BINDERS_IMPORT_SAMPLES IS NOT SET, SO NO .odt OR .rtf FROM ANOTHER PROGRAM WAS READ');
	else {
		let n = 0;
		for (const f of readdirSync(dir).filter((x) => /\.(odt|fodt|rtf)$/i.test(x))) {
			const bytes = new Uint8Array(readFileSync(`${dir}/${f}`));
			const p = planManuscript(readDocument(bytes, f, { bytes }, { tabs: true }), { name: 'Book', parent: '', settings, choices: {}, scenes: 'words' }).plan, got = plannedWords(p);
			const docx = `${dir}/${f.replace(/\.[^.]+$/, '.docx')}`, txt = `${dir}/${f.replace(/\.[^.]+$/, '.txt')}`;
			if (existsSync(docx)) {
				const want = docxWords(new Uint8Array(readFileSync(docx)), { comments: true }), d = firstDifference(want.body, got.body);
				ok(!d, `sample ${f}: every word, in order, as the same program's .docx has them${d ? ` (${d})` : ''}`);
			} else if (existsSync(txt)) {
				const key = (l: string[]) => [...l].sort().join(' ');
				ok(key(tokens(readFileSync(txt, 'utf8'))) === key([...got.body, ...got.notes]), `sample ${f}: the words of its own .txt`);
			} else ok(got.body.length > 0, `sample ${f}: read, with no oracle beside it`);
			n++;
		}
		console.log(`  samples: ${n} OpenDocument and rich text files read from ${dir}`);
	}
}

done('import libreoffice');
