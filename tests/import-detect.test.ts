import { detect, isMarker, readsAsTitle, unit, type Choices, type Unit } from '../src/import/detect';
import { ok, eq, done } from './harness';

/* The rules that find chapters, parts and scenes (src/import/detect.ts), one block each: R0 to R6. */

const prose = (n: number, seed = 'word'): Unit => unit(Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.');
const head = (level: number, text: string) => unit(text, { heading: level });
const at = (cuts: { at: number }[]) => cuts.map((c) => c.at).join(',');
const levels = (cuts: { level: string }[]) => cuts.map((c) => c.level).join(',');
/** n chapters under headings of `level`, each with a paragraph of 250 words. */
const book = (level: number, names: string[]): Unit[] => names.flatMap((n) => [head(level, n), prose(250, n)]);

// ---- R1: headings ----
{
	const r = detect(book(2, ['One', 'Two', 'Three']));
	eq(r.found.signal, 'headings', 'R1: a level that occurs three times is the chapters');
	eq(at(r.cuts), '0,2,4', 'R1: a cut at each heading');
	ok(r.cuts.every((c) => c.level === 'chapter' && c.drop && c.by === 'heading'), 'R1: chapters, and the heading is the name and not the text');
	eq(r.cuts[0].title, 'One', 'R1: the title is the heading as it reads');
	eq(r.found.counts.headings, 3, 'R1: and counted for the dialog');
	eq(detect(book(2, ['One'])).found.signal, 'none', 'R1: one heading is not a signal');
	eq(detect([head(1, 'A'), prose(300), head(2, 'B'), prose(300), head(3, 'C'), prose(300)]).found.signal, 'none', 'R1: three levels of one heading each are not chapters');
}
{
	// a lone first heading above the rest is the book's title
	const r = detect([head(1, 'The Lighthouse'), prose(20), ...book(2, ['One', 'Two'])]);
	eq(r.found.book, 0, 'R1: a lone first level-one heading is the book’s title');
	eq(at(r.cuts), '2,4', 'R1: and no chapter');
	eq(r.found.front, 2, 'R1: it and what follows it are the front matter');
	eq(detect([head(1, 'One'), prose(250), head(1, 'Two'), prose(250)]).found.book, null, 'R1: two level-one headings are chapters, not a title');
}
{
	// parts: the shallowest level, when every text reads as a part and a deeper level exists
	const r = detect([head(1, 'Part One'), head(2, 'A'), prose(250), head(2, 'B'), prose(250), head(1, 'Part Two'), head(2, 'C'), prose(250)]);
	eq(levels(r.cuts), 'part,chapter,chapter,part,chapter', 'R1: parts and chapters');
	eq(r.found.levels.map((l) => `${l.level}:${l.count}:${l.role}`).join(' '), '1:2:part 2:3:chapter', 'R1: the levels are listed with their roles');
	// level one named otherwise is chapters, and level two is scenes when half the chapters have it
	const s = detect([head(1, 'Arrival'), head(2, 'x1'), prose(250), head(2, 'x2'), prose(250), head(1, 'Leaving'), prose(250), head(1, 'Home'), head(2, 'y'), prose(250)]);
	eq(levels(s.cuts), 'chapter,scene,scene,chapter,chapter,scene', 'R1: a level under the chapters is scenes where half of them have it');
	const t = detect([head(1, 'Arrival'), head(2, 'x1'), prose(250), head(2, 'x2'), prose(250), head(1, 'Leaving'), prose(250), head(1, 'Home'), prose(250)]);
	eq(t.found.levels.find((l) => l.level === 2)?.role, 'text', 'R1: and kept in the text where fewer do');
	eq(levels(t.cuts), 'chapter,chapter,chapter', 'R1: a heading kept in the text is no cut');
	// the writer's choice is over the guess
	const o = detect(book(2, ['One', 'Two']), { roles: new Map([[2, 'text' as const]]) });
	eq(o.found.signal, 'none', 'R1: a level made text makes no chapters');
	const p = detect([head(1, 'Part One'), head(2, 'A'), prose(250), head(2, 'B'), prose(250)], { roles: new Map([[1, 'text' as const]]) });
	eq(levels(p.cuts), 'chapter,chapter', 'R1: a part level made text leaves its chapters');
}

// ---- R2: lines that read as titles ----
{
	const lines = ['Chapter 1', 'CHAPTER TWO', 'Chapter 3: The storm', 'chapter four', 'Chapter XII.', 'Prologue', 'Epilogue'];
	for (const l of lines) ok(readsAsTitle(l), `R2: “${l}” reads as a title`);
	for (const l of ['Chapter 1 was the worst day of his life.', 'Chapter 1 was grim', 'The end.', 'Mix', 'He said, Chapter one.', 'Chapter', 'Part of the problem', 'Prologue to murder']) ok(!readsAsTitle(l), `R2: “${l}” does not`);
	const r = detect([unit('Prologue'), prose(250), unit('Chapter 1'), prose(250), unit('Chapter 2'), prose(250)]);
	eq(r.found.signal, 'titles', 'R2: lines that read as titles, with no headings');
	eq(at(r.cuts), '0,2,4', 'R2: a cut at each');
	ok(r.cuts.every((c) => c.by === 'title' && c.drop), 'R2: and the line is the name');
	eq(detect([unit('Chapter 1'), prose(250)]).found.signal, 'none', 'R2: one is not a signal');
	// a bare figure is a title only where something says it is: centered, or after a page break
	const bare = (o: Partial<Unit>) => detect([unit('7', o), prose(250), unit('8', o), prose(250)]).found.signal;
	eq(bare({}), 'none', 'R2: a number alone on a line is a number');
	eq(bare({ centered: true }), 'titles', 'R2: centered it is a chapter');
	eq(bare({ pageBefore: true }), 'titles', 'R2: after a page break it is a chapter');
	// parts are parts beside chapters, and chapters alone
	eq(levels(detect([unit('Part One'), unit('Chapter 1'), prose(250), unit('Chapter 2'), prose(250), unit('Part Two'), unit('Chapter 3'), prose(250)]).cuts), 'part,chapter,chapter,part,chapter', 'R2: Part One beside chapters is a part');
	eq(levels(detect([unit('Part One'), prose(250), unit('Part Two'), prose(250)]).cuts), 'chapter,chapter', 'R2: and alone they are the chapters');
	// headings win when there are chapters in them
	eq(detect([...book(2, ['A', 'B']), unit('Chapter 1'), unit('Chapter 2')]).found.signal, 'headings', 'R2: only when headings give fewer than two');
}

// ---- R0: a contents list is no chapter ----
{
	const toc = [unit('Contents'), unit('Chapter 1'), unit('Chapter 2'), unit('Chapter 3'), prose(250), unit('Chapter 1'), prose(250)];
	const r = detect(toc);
	eq(r.found.signal, 'none', 'R0: a typed list of chapters is not chapters, and one chapter after it is not a signal');
	eq(detect([...toc, unit('Chapter 2'), prose(250)]).cuts.map((c) => c.at).join(','), '5,7', 'R0: the list is left in the front, the real ones are cut');
	eq(detect([unit('Chapter 1'), prose(60), unit('Chapter 2'), prose(60), unit('Chapter 3'), prose(60)]).found.signal, 'titles', 'R0: with words between them they are chapters');
	eq(detect([unit('Chapter 1', { toc: true }), unit('Chapter 2', { toc: true }), prose(250), unit('Chapter 1'), prose(250), unit('Chapter 2'), prose(250)]).cuts.map((c) => c.at).join(','), '3,5', 'R0: a unit a reader says is in a contents is never a start');
}

// ---- R3: a page break and a set-apart line ----
{
	const t = (o: Partial<Unit>) => detect([prose(250), unit('THE STORM', { pageBefore: true, ...o }), prose(250), unit('The Calm', { pageBefore: true, ...o }), prose(250)]).found.counts.pages;
	eq(t({ centered: true }), 2, 'R3: a short centered line after a page break');
	eq(t({ emphatic: true }), 2, 'R3: or an emphatic one');
	eq(detect([prose(250), unit('THE STORM', { pageBefore: true }), prose(250), unit('THE CALM', { pageBefore: true }), prose(250)]).found.signal, 'pages', 'R3: or one in capitals');
	eq(detect([prose(250), unit('The storm', { pageBefore: true }), prose(250), unit('The calm', { pageBefore: true }), prose(250)]).found.signal, 'none', 'R3: a plain line is not');
	eq(detect([prose(250), { ...prose(12), pageBefore: true, centered: true }, prose(250), { ...prose(12), pageBefore: true, centered: true }]).found.signal, 'none', 'R3: a page break before prose is not a chapter');
}

// ---- R4: scene breaks ----
{
	for (const m of ['***', '* * *', '---', '#', '~', '•••', '⁂', '§', 'xxx', 'OOO', 'o0o', '. . .', '— — —']) ok(isMarker(unit(m)), `R4: “${m}” is a mark`);
	for (const m of ['-', '>', '|', 'a', '1', '', 'The end', '************* ***', 'x x']) ok(!isMarker(unit(m)), `R4: “${m}” is not`);
	ok(isMarker(unit('Anything', { marker: true })), 'R4: a reader’s own word makes a mark');
	const r = detect([...book(2, ['A']), unit('***'), prose(250), unit('***'), prose(250), ...book(2, ['B'])]);
	eq(levels(r.cuts), 'chapter,scene,scene,chapter', 'R4: a mark between scenes is a scene');
	ok(r.cuts[1].drop && r.cuts[1].by === 'break', 'R4: and is no text');
	eq(r.found.breaks, 2, 'R4: counted');
	eq(detect([...book(2, ['A']), unit('***'), prose(250), ...book(2, ['B'])], { breaks: 'keep' }).cuts.length, 2, 'R4: kept in the text on request: no cut');
	eq(detect([unit('***'), prose(5), ...book(2, ['A', 'B'])]).cuts.map((c) => c.level).join(','), 'chapter,chapter', 'R4: a mark in the front matter is text');
	// blank lines: where two are rare, they are a break
	const blanks = (n: number, wide: number) => Array.from({ length: n }, (_, i) => prose(30, `p${i}`)).map((u, i) => (i < wide ? { ...u, gap: 2 } : u));
	eq(detect(blanks(30, 0).map((u, i) => (i === 10 ? { ...u, gap: 3 } : u))).found.breakStyle, 'blank', 'R4: a few double blank lines among many single ones');
	eq(detect(blanks(30, 29).map((u, i) => (i === 0 ? { ...u, gap: 1 } : u))).found.breakStyle, 'none', 'R4: but when most gaps are wide, wide is not a break');
	eq(detect(blanks(30, 0).map((u, i) => (i === 10 ? { ...u, gap: 3 } : u))).cuts.length, 1, 'R4: and a cut starts the scene, text and all');
	ok(!detect(blanks(30, 0).map((u, i) => (i === 10 ? { ...u, gap: 3 } : u))).cuts[0].drop, 'R4: the paragraph is the scene’s first');
	// marks win over blank lines
	eq(detect([...blanks(30, 0).map((u, i) => (i === 10 ? { ...u, gap: 3 } : u)), unit('***'), prose(30)]).found.breakStyle, 'marker', 'R4: marks win over blank lines');
}

// ---- R5: sanity ----
{
	eq(detect(book(2, ['A', 'B', 'C'])).found.doubtful, false, 'R5: chapters of 250 words are chapters');
	eq(detect([head(2, 'A'), prose(20), head(2, 'B'), prose(20), head(2, 'C'), prose(400)]).found.doubtful, true, 'R5: more than 30 in 100 under 50 words are doubtful');
	eq(detect([head(2, 'A'), prose(120), head(2, 'B'), prose(120), head(2, 'C'), prose(120)]).found.doubtful, true, 'R5: a median under 200 is doubtful');
	eq(detect([head(2, 'A'), prose(20)]).found.doubtful, false, 'R5: one chapter is not judged');
}

// ---- R6: nothing found ----
{
	const r = detect([prose(500), prose(500)]);
	eq(r.found.signal, 'none', 'R6: nothing found');
	eq(r.cuts.length, 0, 'R6: no cuts: never by word count');
	eq(r.found.front, 0, 'R6: and no front matter');
	const s = detect([prose(500), unit('***'), prose(500)]);
	eq(levels(s.cuts), 'scene', 'R6: scenes only, when there are marks');
}

// ---- the writer's choices ----
{
	const mixed = [...book(2, ['A', 'B']), unit('Chapter 1'), prose(250), unit('Chapter 2'), prose(250)];
	const via = (signal: Choices['signal']) => detect(mixed, { signal }).found.signal;
	eq(via(null), 'headings', 'choices: the best guess');
	eq(via('titles'), 'titles', 'choices: another way chosen');
	eq(via('pages'), 'none', 'choices: a way that finds nothing is none');
	eq(via('none'), 'none', 'choices: nowhere');
	eq(detect(mixed).found.counts.titles, 2, 'choices: every way is counted');
}

// ---- the same title patterns export reads ----
{
	// "Chapter 12 - The Storm" is how a title is written for export to strip its number (export/roles.ts titleFrom)
	ok(readsAsTitle('Chapter twenty-one'), 'agreement: a spelled number');
	ok(readsAsTitle('Book II'), 'agreement: Book and a Roman numeral');
}
done('import detect');
