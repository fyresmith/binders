import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, resolve as abs } from 'path';
import { strFromU8, zipSync } from 'fflate';
// @ts-expect-error a plain module, without types
import { plan, prose, rng } from '../scripts/demo-vault/build.mjs';
import { scrivFiles, writeScriv, type ScrivItem, type ScrivOptions, type ScrivSource } from '../src/export/scriv/project';
import { DEFAULT_LABELS, DEFAULT_STATUSES } from '../src/view/labels';
import { noteWords, rtfText, rtfWords } from './export-scriv-words';
import { checkProject, pictureIn, sourceOf } from './export-scriv-tools';
import { bindersOf, type Files } from './export-vault';
import { firstDifference, tokens } from './export-words';
import { done, eq, ok } from './harness';

/* The word-for-word test for the Scrivener project: the words read back out of every RTF file, in binder order, are
   the words that went in. And the structural checks of every project made on the way: the tree against the files,
   the XML, the ids, the lists. On the test vault, the demo vault and a binder of 150,000 words under a time limit. */

const WHEN = new Date('2026-10-05T12:00:00Z');
const OPTS: ScrivOptions = { outside: true, snapshots: true, version: '0.0.0', when: WHEN };

interface Result { words: number; ms: number; files: Map<string, Uint8Array>; documents: number; rtfs: number }

function wordForWord(src: ScrivSource, what: string, o: Partial<ScrivOptions> = {}, shown: (name: string) => boolean = () => false): Result {
	const t0 = Date.now(), p = writeScriv(src, { ...OPTS, ...o }), files = scrivFiles(p, src.name), ms = Date.now() - t0;
	const { problems, items } = checkProject(files, src.name);
	ok(!problems.length, `${what}: a sound project${problems.length ? ` (${problems.length}: ${problems.slice(0, 3).join('; ')})` : ''}`);

	// what the binder has, in its order, read from what the writer was handed (not from what it made)
	const rel = (it: ScrivItem) => it.path.slice(src.path.length + 1).replace(/\.md$/i, '') + (it.kind === 'folder' ? '/' : '');
	const flat = (list: readonly ScrivItem[], depth = 0, above = true): { it: ScrivItem; path: string; depth: number; included: boolean }[] => list.flatMap((it) => [{ it, path: rel(it), depth, included: it.included && above }, ...flat(it.children ?? [], depth + 1, it.included && above)]);
	const draft = flat(src.items.filter((it) => it.included)), outside = flat(src.items.filter((it) => !it.included)), own = src.note?.text?.trim() ? [{ it: src.note, path: src.name, depth: 0, included: true }] : [];
	const want = [...draft, ...own, ...outside, ...flat(src.loose ?? [])];
	const got = items.filter((i) => i.depth > 0 && i.type !== 'Image');
	const order = firstDifference(want.map((w) => w.path), got.map((g) => g.path));
	ok(!order, `${what}: every note and folder is there once, in the binder’s order${order ? ` (${order})` : ''}`);
	ok(want.every((w, i) => !got[i] || (got[i].depth - 1 === w.depth && got[i].title === (w.it === src.note ? `${src.name} (binder note)` : w.it.name) && got[i].type === (w.it.kind === 'folder' ? 'Folder' : 'Text') && got[i].included === w.included)), `${what}: titles, nesting, folders and “included” are the binder’s`);
	const byId = new Map(items.map((i) => [i.id, i]));
	ok(got.every((g) => { const parent = g.parent ? byId.get(g.parent) : null; return !parent || parent.depth === 0 || g.path.startsWith(parent.path); }), `${what}: every item is inside the folder it is in`);

	// word for word, document by document
	let words = 0, rtfs = 0, bad = '';
	const all: { want: string[]; got: string[] } = { want: [], got: [] };
	want.forEach((w, i) => {
		const g = got[i], data = g ? files.get(`Files/Data/${g.id}/content.rtf`) : undefined;
		const expected = noteWords(w.it.text ?? '', shown), read = data ? rtfWords(strFromU8(data, true)) : { body: [], notes: [] };
		if (data) rtfs++;
		const body = firstDifference(expected.body, read.body), notes = firstDifference(expected.notes, read.notes);
		if (!bad && (body || notes)) bad = `${w.path}: ${body ?? `footnotes ${notes}`}`;
		words += expected.body.length + expected.notes.length;
		all.want.push(...expected.body, ...expected.notes);
		all.got.push(...read.body, ...read.notes);
		if (w.it.synopsis?.trim()) { const s = files.get(`Files/Data/${g?.id}/synopsis.txt`); if (!bad && (!s || strFromU8(s) !== w.it.synopsis.trim())) bad = `${w.path}: its synopsis`; }
	});
	ok(!bad, `${what}: every document’s words, in order${bad ? ` (${bad})` : ''}`);
	const whole = firstDifference(all.want, all.got);
	ok(!whole, `${what}: the whole binder’s words, in binder order${whole ? ` (${whole})` : ''}`);
	return { words, ms, files, documents: got.length, rtfs };
}

const read = (dir: string, files: Files = new Map(), at = ''): Files => {
	for (const name of readdirSync(join(dir, at))) {
		if (name.startsWith('.')) continue;
		const rel = at ? `${at}/${name}` : name, full = join(dir, rel);
		if (statSync(full).isDirectory()) read(dir, files, rel);
		else files.set(rel, /\.(md|txt|canvas|snapshot)$/.test(name) ? readFileSync(full, 'utf8') : new Uint8Array(readFileSync(full)));
	}
	return files;
};
const results: string[] = [], samples = new Map<string, Map<string, Uint8Array>>();
const shownIn = (files: Files) => { const picture = pictureIn(files); return (name: string) => { const p = picture(name, ''); return !!p && p.picture.type !== 'gif'; }; };

// ---- the test vault ----
{
	const files = read('test-vault'), binders = bindersOf(files);
	ok(binders.some((b) => b.name === 'The Lighthouse'), 'the test vault’s binder is found');
	for (const b of binders) {
		const r = wordForWord(sourceOf(files, b), `test vault, ${b.name}`, { picture: pictureIn(files) }, shownIn(files));
		results.push(`${b.name}: ${r.words} words in ${r.documents} items, ${r.ms} ms`);
		if (b.name === 'The Lighthouse') samples.set('The Lighthouse', r.files);
	}
}

// ---- the demo vault: the example books and the extremes ----
{
	const files = plan({}) as Files, binders = bindersOf(files);
	ok(binders.length > 10, `the demo vault’s binders are found (${binders.length})`);
	let words = 0, ms = 0, documents = 0, snapshots = 0;
	for (const b of binders) {
		const r = wordForWord(sourceOf(files, b), `demo vault, ${b.name}`, { picture: pictureIn(files) }, shownIn(files));
		words += r.words; ms += r.ms; documents += r.documents;
		snapshots += [...r.files.keys()].filter((p) => p.startsWith('Snapshots/') && p.endsWith('.rtf')).length;
		if (b.name === 'Low Water at Corran' || b.name === 'Other Alphabets' || b.name === 'What Markdown becomes') samples.set(b.name, r.files);
	}
	ok(snapshots > 0, `the demo vault’s snapshots are carried across (${snapshots})`);
	results.push(`demo vault, ${binders.length} binders: ${words} words in ${documents} items, ${ms} ms`);
}

// ---- in time: a binder of 150,000 words ----
{
	const rand = rng('export-150k') as () => number, items: ScrivItem[] = [];
	for (let p = 1; p <= 3; p++) {
		const chapters: ScrivItem[] = [];
		for (let c = 1; c <= 10; c++) {
			const name = `Chapter ${(p - 1) * 10 + c}`, path = `Big/Part ${p}/${name}`;
			chapters.push({ kind: 'folder', name, path, included: true, synopsis: `Chapter ${c} of part ${p}.`, children: Array.from({ length: 5 }, (_, s): ScrivItem => ({
				kind: 'note', name: `Scene ${s + 1}`, path: `${path}/Scene ${s + 1}.md`, included: true, synopsis: `Scene ${s + 1}.`, label: DEFAULT_LABELS[(c + s) % 8].name, status: DEFAULT_STATUSES[s % 4], target: 1000,
				text: `\t${(prose(rand, 500) as string).replace(/\. /g, '.\n\t')}[^a]\n\n***\n\n${prose(rand, 500) as string} %%${prose(rand, 6) as string}%%\n\n[^a]: ${prose(rand, 12) as string}`,
			})) });
		}
		items.push({ kind: 'folder', name: `Part ${p}`, path: `Big/Part ${p}`, included: true, children: chapters });
	}
	const r = wordForWord({ name: 'A long book', path: 'Big', items, labels: DEFAULT_LABELS, statuses: DEFAULT_STATUSES }, 'a binder of 150,000 words');
	ok(r.words > 150000, `it has its words (${r.words})`);
	ok(r.ms < 10000, `read and written in under ten seconds (${r.ms} ms)`);
	const kB = Math.round([...r.files.values()].reduce((n, d) => n + d.length, 0) / 1024);
	results.push(`150,000-word binder: ${r.words} words in ${r.documents} items, ${r.ms} ms, ${kB} kB`);
	samples.set('A long book', r.files);
}

// the test itself would notice: a paragraph gone from a file, or two documents changing places
{
	const text = 'The first paragraph.\n\nA second one, longer.\n\nAnd the third and last.';
	const p = writeScriv({ name: 'x', path: 'x', items: [{ kind: 'note', name: 'One', path: 'x/One.md', included: true, text }], labels: [], statuses: [] }, OPTS) as ReturnType<typeof writeScriv> | null;
	const id = p ? checkProject(scrivFiles(p, 'x'), 'x').items.find((i) => i.title === 'One')?.id : '';
	const whole = p ? strFromU8(p.files.get(`Files/Data/${id}/content.rtf`) ?? new Uint8Array(), true) : '';
	ok(whole.length > 0 && !firstDifference(noteWords(text).body, rtfWords(whole).body), 'a note of three paragraphs reads word for word');
	ok(!!firstDifference(noteWords(text).body, rtfWords(whole.replace(/\\par\n[^\n]*\}$/, '}')).body), 'a dropped paragraph is noticed');
	const paras = whole.split('\\par\n');
	ok(paras.length > 2 && !!firstDifference(noteWords(text).body, rtfWords([paras[0], paras[2], paras[1], ...paras.slice(3)].join('\\par\n')).body), 'two paragraphs out of order are noticed');
}
console.log(`  word for word: ${results.join('; ')}`);

// ---- another reader of the same files: LibreOffice reads every RTF, and sees the words this test's own reader sees ----
{
	const has = (cmd: string) => spawnSync('which', [cmd]).status === 0, out = abs('test-dist/export-scriv');
	rmSync(out, { recursive: true, force: true });
	mkdirSync(join(out, 'in'), { recursive: true });
	const rtfs: [string, string][] = [];
	for (const [name, files] of samples) { let n = 0; for (const [path, data] of files) if (path.endsWith('.rtf') && (name !== 'A long book' || n++ % 25 === 0)) rtfs.push([`${name}: ${path}`, strFromU8(data, true)]); }
	if (has('soffice') && !process.env.BINDERS_NO_SOFFICE) {
		rtfs.forEach(([, text], i) => writeFileSync(join(out, 'in', `${i}.rtf`), text, 'latin1'));
		try { execFileSync('soffice', [`-env:UserInstallation=file://${join(out, 'profile')}`, '--headless', '--convert-to', 'txt:Text (encoded):UTF8', '--outdir', join(out, 'txt'), ...rtfs.map((_r, i) => join(out, 'in', `${i}.rtf`))], { stdio: 'ignore', timeout: 300000 }); } catch { /* said below */ }
		let readN = 0, bad = '';
		rtfs.forEach(([name, text], i) => {
			let txt: string;
			try { txt = readFileSync(join(out, 'txt', `${i}.txt`), 'utf8').replace(/^\uFEFF/, ''); } catch { if (!bad) bad = `${name}: LibreOffice made nothing of it`; return; }
			readN++;
			const d = firstDifference(tokens(rtfText(text)), tokens(txt));
			if (d && !bad) bad = `${name}: ${d}`;
		});
		ok(readN === rtfs.length && !bad, `LibreOffice reads all ${rtfs.length} RTF files, and the same words in the same order${bad ? ` (${bad})` : ''}`);
		rmSync(join(out, 'profile'), { recursive: true, force: true });
	} else console.log(`  (LIBREOFFICE ISN’T INSTALLED, or BINDERS_NO_SOFFICE is set: ${rtfs.length} RTF files were NOT read by a second reader)`);
	if (has('xmllint')) {
		let bad = '', n = 0;
		for (const [name, files] of samples) for (const [path, data] of files) if (/\.(xml|scrivx)$/.test(path)) { const f = join(out, `${n++}.xml`); writeFileSync(f, data); if (spawnSync('xmllint', ['--noout', f]).status !== 0) bad += ` ${name}/${path}`; }
		ok(!bad, `xmllint reads every XML file${bad}`);
	} else console.log('  (XMLLINT ISN’T INSTALLED: not run)');

	// the projects themselves, zipped, for a Scrivener to open: only when asked for
	const to = process.env.BINDERS_SCRIV_SAMPLES;
	if (to) {
		mkdirSync(to, { recursive: true });
		for (const [name, files] of samples) {
			const zip: Record<string, Uint8Array> = {};
			for (const [path, data] of files) zip[`${name}.scriv/${path}`] = data;
			writeFileSync(join(to, `${name}.scriv.zip`), zipSync(zip));
		}
		console.log(`  ${samples.size} sample projects written to ${to}`);
	}
}
eq(samples.size, 5, 'the sample projects');

done('export scriv, word for word');
