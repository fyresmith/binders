import { DEFAULT_SETTINGS } from '../src/settings-data';
import { scanMarkdown } from '../src/import/text';
import { readWord } from '../src/import/docx';
import { actionsFor, applyAction, noEdits, planManuscript, type Edits, type ManuscriptRead } from '../src/import/manuscript';
import { inBinder, type ImportPlan, type PlannedNote } from '../src/import/plan';
import { firstDifference } from './export-words';
import { noteWords } from './export-scriv-words';
import { plannedWords } from './import-words';
import { docx, p, words } from './import-docx-fixtures';
import { ok, eq, done } from './harness';

/* What the writer can put right by hand in the preview (src/import/manuscript.ts: Edits, actionsFor, applyAction): join with
   the one before, make a row a part, chapter or scene, rename it, start a note at a paragraph. Each is a change to where the
   text is cut, kept over the detector's cuts, so no change can drop or repeat a word: held here by the word-for-word test,
   by hand and by chance (seeded). */

const settings = { ...DEFAULT_SETTINGS };
const prose = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';
const para = (seed: string) => `${prose(40, seed)} It was *not* what **Mara** had hoped.`;
const CLEAN = `# The Salt Road\n\nBy Mara.\n\n## The jetty\n\n${para('a')}\n\nSecond ${prose(20, 'a2')}\n\n***\n\n${para('b')}\n\n## The tide\n\n${para('c')}\n\n${para('c2')}\n\n## The storm\n\n${para('d')}\n\n### Weight\n\n${para('e')}\n\n## The end\n\n${para('f')}\n`;
const md = (t: string): ManuscriptRead => ({ name: 'Book', file: 'Book.md', origin: { path: 'Book.md' }, scan: scanMarkdown(t) });
const plan = (read: ManuscriptRead, edits?: Edits, more: object = {}) => planManuscript(read, { name: 'Book', parent: '', settings, choices: {}, scenes: 'words', edits, ...more }).plan;
const row = (pl: ImportPlan, title: string): PlannedNote => { const r = pl.notes.find((n) => n.title === title); if (!r) throw new Error(`no row “${title}” in ${pl.notes.map((n) => n.title).join(', ')}`); return r; };
const rows = (pl: ImportPlan) => pl.notes.slice(1).map((n) => `${'  '.repeat(n.depth - 1)}${n.title}${n.folder ? '/' : ''}`).join('|');
const want = (t: string) => noteWords(t.replace(/^---\n[\s\S]*?\n---\n/, '')).body;
const same = (pl: ImportPlan, t: string, what: string) => { const d = firstDifference(want(t), plannedWords(pl).body); ok(!d, `${what}: every word, in order${d ? ` (${d})` : ''}`); };
const read = md(CLEAN);

// ---- by hand, on a note ----
{
	const base = plan(read);
	eq(rows(base), 'Front matter/|  Title page|The jetty/|  a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11|  b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11|The tide|The storm|The end', 'edits: the plan with none');
	ok(row(base, 'The tide').at !== undefined && row(base, 'The tide').key === row(base, 'The tide').at && row(base, 'The tide').level === 'chapter', 'edits: a row knows where its own cut is, what it is, and its key');
	eq(actionsFor(row(base, 'The tide')).join(), 'join,scene,part,rename', 'edits: what can be done to a chapter');
	eq(actionsFor(row(base, 'Title page')).join(), 'chapter,scene,part,rename', 'edits: and to front matter, which has no cut of its own to join');
	eq(actionsFor(base.notes[1]).length, 0, 'edits: the front matter folder has no key, and nothing to do');

	const joined = plan(read, applyAction(noEdits(), row(base, 'The tide'), { kind: 'join' }));
	ok(!joined.notes.some((n) => n.title === 'The tide'), 'join: the chapter is gone');
	ok(joined.notes.some((n) => n.body.includes('## The tide')), 'join: its heading is in the text of the one before, as a line');
	same(joined, CLEAN, 'join');

	const scene = plan(read, applyAction(noEdits(), row(base, 'The storm'), { kind: 'make', level: 'scene' }));
	ok(scene.notes.some((n) => n.title === 'The storm' && n.depth === 2 && n.body.includes('## The storm')), 'scene: made a scene, its heading stays in the text');
	same(scene, CLEAN, 'scene');

	const chapter = plan(read, applyAction(noEdits(), row(base, 'b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11'), { kind: 'make', level: 'chapter' }));
	ok(chapter.notes.some((n) => n.folder === false && n.depth === 1 && n.title.startsWith('b0 b1')), 'chapter: a scene made a chapter is a note at the top, named by its first words');
	same(chapter, CLEAN, 'chapter');

	const part = plan(read, applyAction(noEdits(), row(base, 'The tide'), { kind: 'make', level: 'part' }));
	ok(part.notes.some((n) => n.title === 'The tide' && n.folder), 'part: a part is a folder');
	same(part, CLEAN, 'part');
	ok(/structure: "parts/.test(new TextDecoder().decode(part.files.get('Book/Book.md'))), 'part: and the binder note says parts');

	const named = plan(read, applyAction(noEdits(), row(base, 'The tide'), { kind: 'rename', name: 'Low water' }));
	const low = row(named, 'Low water');
	ok(low.body.startsWith('# The tide\n\n') && low.heading === 'The tide', 'rename: a note renamed keeps its heading as its first line');
	same(named, CLEAN, 'rename a note');
	const folderRenamed = plan(read, applyAction(noEdits(), row(base, 'The jetty'), { kind: 'rename', name: 'Arrival' }));
	ok(row(folderRenamed, 'Arrival').folder && folderRenamed.notes.some((n) => n.body.startsWith('# The jetty\n\n')), 'rename: a folder renamed puts its heading as the first line of its first note');
	same(folderRenamed, CLEAN, 'rename a folder');
	const sceneRenamed = plan(read, applyAction(noEdits(), row(base, 'b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11'), { kind: 'rename', name: 'The second scene' }));
	ok(sceneRenamed.notes.some((n) => n.title === 'The second scene'), 'rename: a scene');
	same(sceneRenamed, CLEAN, 'rename a scene');
	const blank = plan(read, applyAction(applyAction(noEdits(), row(base, 'The tide'), { kind: 'rename', name: 'X' }), row(base, 'The tide'), { kind: 'rename', name: '  ' }));
	ok(blank.notes.some((n) => n.title === 'The tide'), 'rename: an empty name is the name it had');

	// start a note here
	const tide = row(base, 'The tide'), at = (tide.units?.[0] ?? 0) + 1;
	const started = plan(read, applyAction(noEdits(), tide, { kind: 'start', unit: at }));
	ok(started.notes.some((n) => n.folder && n.title === 'The tide') && started.notes.some((n) => n.title.startsWith('c20')), 'start: a note started at a paragraph makes the chapter a folder of two');
	same(started, CLEAN, 'start');
	const title = row(base, 'Title page');
	same(plan(read, applyAction(noEdits(), title, { kind: 'start', unit: (title.units?.[0] ?? 0) + 1 })), CLEAN, 'start in the front matter');
	const flat = md(`${para('p')}\n\n${para('q')}\n\n${para('r')}\n`);
	const one = plan(flat);
	eq(rows(one), 'Manuscript', 'start: a text with nothing found is one note');
	const split = plan(flat, applyAction(noEdits(), one.notes[1], { kind: 'start', unit: 1 }));
	eq(split.notes.filter((n) => !n.folder).length, 2, 'start: and a note started in it makes two');
	same(split, `${para('p')}\n\n${para('q')}\n\n${para('r')}\n`, 'start in one note');

	// the edits survive a change of any choice
	const edits = applyAction(noEdits(), row(base, 'The tide'), { kind: 'rename', name: 'Low water' });
	const again = plan(read, edits, { scenes: 'numbers', choices: { breaks: 'keep' } });
	ok(again.notes.some((n) => n.title === 'Low water'), 'edits: kept over a change of a choice');
	const nothing = plan(read, edits, { choices: { signal: 'none' } });
	ok(nothing.notes.length > 0, 'edits: and when nothing is found');
}

// ---- by chance: any run of edits, on a note and on a Word file, is still every word in order ----
{
	let seed = 20261010;
	const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
	const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
	const dx = docx([p('The Salt Road', { style: 'Title' }), p('By Mara.'), ...['One', 'Two', 'Three', 'Four'].flatMap((c, k) => [p(c, { style: 'Heading1' }), p(words(40, `w${k}`)), p(words(30, `x${k}`)), p('* * *', { style: 'SceneBreak' }), p(words(30, `y${k}`)), p('Sub', { style: 'Heading2' }), p(words(20, `z${k}`))])].join(''));
	const sources: [string, ManuscriptRead, string[]][] = [['note', md(CLEAN), want(CLEAN)], ['Word file', readWord(dx, 'Book.docx', { bytes: dx }, { tabs: true }), []]];
	sources[1][2] = plannedWords(plan(sources[1][1])).body;
	let ran = 0;
	for (const [what, src, expected] of sources) {
		for (let run = 0; run < 60; run++) {
			let edits = noEdits(), pl = plan(src);
			for (let step = 0; step < 1 + Math.floor(rand() * 6); step++) {
				const candidates = pl.notes.slice(1).filter((n) => actionsFor(n).length);
				const target = pick(candidates);
				const kind = pick(actionsFor(target));
				const action = kind === 'join' ? { kind: 'join' as const } : kind === 'rename' ? { kind: 'rename' as const, name: pick(['Renamed', 'A: name?', 'x'.repeat(130), 'Chapter 9 - Nine']) } : { kind: 'make' as const, level: kind };
				// (and now and then a note started at one of its paragraphs)
				const withText = target.units && target.units[1] - target.units[0] > 1 && rand() < 0.3;
				edits = applyAction(edits, target, withText ? { kind: 'start', unit: target.units![0] + 1 } : action);
				try { pl = plan(src, edits, { scenes: pick(['words', 'numbers'] as const) }); } catch (e) { ok(false, `${what}: run ${run} threw: ${e instanceof Error ? e.message : String(e)}`); break; }
				const d = firstDifference(expected, plannedWords(pl).body);
				if (d) { ok(false, `${what}: run ${run}, step ${step}: ${d} -- ${JSON.stringify([...edits.cuts])} ${JSON.stringify([...edits.names])} -- ${rows(pl)}`); break; }
				if (![...pl.files.keys()].every((f) => inBinder('Book', f)) || new Set([...pl.files.keys()].map((f) => f.toLowerCase())).size !== pl.files.size) { ok(false, `${what}: run ${run}: files outside the folder or twice`); break; }
				ran++;
			}
		}
	}
	ok(ran > 300, `chance: ${ran} runs of edits, each leaving every word in order, inside the folder, once`);
}
done('import edits');
