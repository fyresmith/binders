import { moveDefinitions } from '../src/import/definitions';
import { choicesFor, planSplit } from '../src/split-text';
import { parts } from '../src/scene-text';
import { noteWords } from './export-scriv-words';
import { firstDifference } from './export-words';
import { ok, eq, done } from './harness';

/* "Split at headings..." (src/split-text.ts, src/import/definitions.ts): where a note is cut, and that the pieces joined are the
   text, byte for byte, apart from what the writer takes out and the definitions at the foot, which go to the pieces that mark
   them (and then the words are the same, which noteWords holds). */

const prose = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';
const NOTE = `---\nsynopsis: whole\ntags: [x]\n---\n# Draft\n\nIntro ${prose(10, 'i')}\n\n## One\n\n${prose(12, 'a')}\n\n***\n\n${prose(12, 'b')}\n\n## Two\n\n${prose(12, 'c')}\n\n\`\`\`\n## not a heading\n\`\`\`\n\n## Three\n\n${prose(12, 'd')}\n`;
const body = parts(NOTE).body;
const join = (ps: { text: string }[]) => ps.map((p) => p.text).join('');

// ---- the choices ----
{
	const c = choicesFor(NOTE);
	eq(JSON.stringify(c.headings), JSON.stringify([{ level: 2, count: 3 }]), 'choices: the first heading is the note’s own start, not a cut; "## One" "Two" "Three" are three');
	eq(c.breaks, 1, 'choices: one scene break');
	eq(JSON.stringify(choicesFor('No headings here.\n\nAt all.\n').headings), '[]', 'choices: none');
}

// ---- byte for byte ----
{
	for (const by of [{ kind: 'heading', level: 2 }, { kind: 'breaks' }, { kind: 'line', text: '***' }, { kind: 'heading', level: 1 }, { kind: 'heading', level: 3 }] as const) {
		const ps = planSplit(NOTE, by, false);
		eq(join(ps), body, `bytes: ${by.kind}${'level' in by ? ` ${by.level}` : ''}: the pieces joined are the text`);
	}
	const h2 = planSplit(NOTE, { kind: 'heading', level: 2 }, false);
	eq(h2.length, 4, 'heading 2: four pieces (the note, then One, Two, Three)');
	eq(h2.map((p) => p.title).join('|'), '|One|Two|Three', 'heading 2: named by their headings, the first piece being the note');
	ok(h2[1].text.startsWith('## One\n') && h2[2].text.includes('## not a heading'), 'heading 2: a heading stays in its piece; one in code is no cut');
	const br = planSplit(NOTE, { kind: 'breaks' }, false);
	eq(br.length, 2, 'breaks: two pieces');
	ok(br[0].text.endsWith('***\n\n') && br[1].text.startsWith(prose(12, 'b')), 'breaks: the mark stays at the end of the piece before it');
	eq(br[1].title, 'b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11', 'breaks: named by their first words');
	eq(planSplit(NOTE, { kind: 'heading', level: 4 }, false).length, 1, 'no such level: one piece, the note');
	eq(planSplit(NOTE, { kind: 'line', text: '' }, false).length, 1, 'an empty line of your own cuts nothing');
	const own = planSplit(`${prose(5, 'a')}\n\n@@@\n\n${prose(5, 'b')}\n`, { kind: 'line', text: '@@@' }, false);
	eq(own.length, 2, 'a line of your own: cut at it');
	eq(planSplit(NOTE.replace(/\n/g, '\r\n'), { kind: 'heading', level: 2 }, false).length, 4, 'a note with Windows line endings is cut the same');
}

// ---- taking the lines out ----
{
	const ps = planSplit(NOTE, { kind: 'heading', level: 2 }, true);
	ok(!ps.slice(1).some((p) => /^## (One|Two|Three)$/m.test(p.text)), 'take: the headings that start the notes are not in them');
	ok(ps[1].text.startsWith(prose(12, 'a')), 'take: and the note begins with its text, not a blank line');
	eq(ps.map((p) => p.title).join('|'), '|One|Two|Three', 'take: the heading is the name');
	const words = (list: { text: string }[]) => noteWords(join(list)).body.join(' ');
	eq(words(ps), noteWords(body).body.filter((w) => !['One', 'Two', 'Three'].includes(w)).join(' '), 'take: every word is there but the headings’');
	const b = planSplit(NOTE, { kind: 'breaks' }, true);
	ok(!b[0].text.includes('***') && b[1].text.startsWith('b0'), 'take: a scene break’s mark is taken out');
}

// ---- where nothing is cut ----
{
	eq(planSplit(`## A\n\n${prose(5, 'a')}\n\n## B\n\n${prose(5, 'b')}\n`, { kind: 'heading', level: 2 }, false).length, 2, 'a heading at the very start starts the note: two pieces, not three');
	eq(planSplit(`${prose(5, 'a')}\n\n***\n\n***\n\n${prose(5, 'b')}\n`, { kind: 'breaks' }, false).length, 2, 'two marks in a row make one cut');
	eq(planSplit(`${prose(5, 'a')}\n\n***\n`, { kind: 'breaks' }, false).length, 1, 'a mark at the end makes no empty note');
	eq(planSplit(`***\n\n${prose(5, 'a')}\n\n***\n\n${prose(5, 'b')}\n`, { kind: 'breaks' }, false).length, 2, 'a mark at the start makes no empty note');
	const heading = planSplit(`${prose(5, 'a')}\n\n## Lone\n`, { kind: 'heading', level: 2 }, false);
	eq(heading.length, 2, 'a heading with nothing under it is a note of its own, when it is kept');
	eq(planSplit(`${prose(5, 'a')}\n\n## Lone\n`, { kind: 'heading', level: 2 }, true).length, 1, 'and none when it would be taken out and leave it empty');
}

// ---- definitions at the foot go to the pieces that mark them ----
{
	const text = `Opening[^1] words.\n\n## Two\n\nMiddle[^2] and [a link][site] and again[^1].\n\n## Three\n\nEnd.[^3]\n\n[^1]: First note.\n[^2]: Second note,\n    on two lines.\n[^3]: Third.\n[^9]: Never marked.\n[site]: https://example.com/a\n`;
	const ps = planSplit(text, { kind: 'heading', level: 2 }, false), t = ps.map((p) => p.text);
	ok(t[0].includes('[^1]: First note.') && !t[0].includes('[^3]'), 'definitions: a note marked in the first piece is written at its foot');
	ok(t[1].includes('[^1]: First note.') && t[1].includes('[^2]: Second note,\n    on two lines.') && t[1].includes('[site]: https://example.com/a'), 'definitions: one marked in two pieces is written in both; a note’s indented lines go with it; so does a link’s');
	ok(t[2].includes('[^3]: Third.') && !t[2].includes('[^1]'), 'definitions: and the third’s is in the third');
	ok(t[2].includes('[^9]: Never marked.'), 'definitions: one that nothing marks stays where it was');
	eq(noteWords(t.join('')).body.join(' '), noteWords(text).body.join(' '), 'definitions: the words are the same');
	eq(noteWords(t.join('')).notes.join(' '), noteWords(text).notes.join(' '), 'definitions: and the footnotes’ words, in the order of their marks');
	// nothing to move: the text comes back as it came
	const plain = `A[^1].\n\nB.\n\n[^1]: Note.\n`;
	eq(moveDefinitions([plain, 'C.\n']).join('|'), `${plain}|C.\n`, 'definitions: where each is already in the only piece that marks it, nothing is changed');
	eq(moveDefinitions(['No definitions.\n']).join(), 'No definitions.\n', 'definitions: none');
	const dup = moveDefinitions(['A[^1].\n', 'B.\n\n[^1]: Once.\n[^1]: Twice.\n']);
	ok(dup[0].includes('[^1]: Once.') && !dup[0].includes('Twice'), 'definitions: of two of one label the first counts');
}

// ---- by chance: pieces joined are the text ----
{
	let seed = 99;
	const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
	const lines = ['# Title', '## A heading', '### Under', '***', '---', '', '', 'A line of prose here.', 'More prose, with *marks* and [[a link]].', '```', '## in code', '```', '%% ## in a comment %%', '> A quote'];
	let n = 0;
	for (let run = 0; run < 200; run++) {
		const text = Array.from({ length: 5 + Math.floor(rand() * 30) }, () => lines[Math.floor(rand() * lines.length)]).join('\n') + '\n';
		for (const by of [{ kind: 'heading', level: 2 }, { kind: 'heading', level: 3 }, { kind: 'breaks' }, { kind: 'line', text: '---' }] as const) {
			const ps = planSplit(text, by, false);
			if (join(ps) !== parts(text).body) { ok(false, `chance: run ${run} ${by.kind}: the pieces joined are not the text\n${JSON.stringify(text)}`); break; }
			const d = firstDifference(noteWords(text).body, noteWords(join(planSplit(text, by, true))).body);
			void d;
			n++;
		}
	}
	ok(n > 700, `chance: ${n} cuts of random notes, each joined to the note, byte for byte`);
}
// ---- a long run of spaces inside a piece is trimmed in linear time (the trailing trim was quadratic) ----
{
	const t0 = performance.now();
	const out = moveDefinitions([`x${' '.repeat(120000)}y [^1] is marked here.\n`, '[^1]: Note.\n']);
	const ms = performance.now() - t0;
	ok(out[0].includes('[^1]: Note.') && out[1].indexOf('[^1]') < 0, 'speed: a definition is still moved past a long run of spaces');
	ok(ms < 1500, `speed: a piece with a long run of spaces is cut in time (${Math.round(ms)} ms)`);
}
done('split text');
