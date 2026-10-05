import { TAB_LINE, wrapMode, type ModeState, type Stream } from '../src/paragraphs/mode';
import { pointedAt, repointTabLinks, tabLines, tabsForRender, untab } from '../src/paragraphs/text';
import { DEFAULT_SETTINGS, readSettings } from '../src/settings-data';
import { done, eq, ok } from './harness';

const same = (a: unknown, b: unknown, msg: string) => eq(JSON.stringify(a), JSON.stringify(b), msg);

// the settings: a tab paragraph is on to begin with, the indent off; what was saved is kept
{
	eq(DEFAULT_SETTINGS.tabParagraphs, true, 'tab paragraphs are on in a new vault');
	eq(DEFAULT_SETTINGS.indentParagraphs, false, 'indenting paragraphs is off in a new vault');
	const s = readSettings({ tabParagraphs: false, indentParagraphs: true });
	ok(!s.tabParagraphs && s.indentParagraphs, 'both are read back as saved');
	const odd = readSettings({ tabParagraphs: 'yes', indentParagraphs: 1 });
	ok(odd.tabParagraphs && !odd.indentParagraphs, 'a value that isn’t on or off is the default');
}

// which lines are paragraphs begun with a tab
{
	same(tabLines('\tOne.\n\tTwo.\n\n\tThree.\n'), [0, 1, 3], 'at the start, straight after another, after a blank line');
	same(tabLines('    Four spaces.\n'), [0], 'four spaces are a tab');
	same(tabLines('   Three spaces.\n'), [], 'three are not');
	same(tabLines('Plain.\n\tUnder it.\n\tAnd again.\n'), [], 'a tabbed line that carries on a paragraph is prose to Markdown already');
	same(tabLines('Plain.\n\tUnder it.\n\n\tAfter a blank.\n'), [3], 'but after a blank line it is one');
	same(tabLines('---\nsynopsis: x\nlist:\n    - deep\n---\n\tText.\n'), [5], 'not in the properties; straight after them, yes');
	same(tabLines('\uFEFF---\na: b\n---\n\tText.\n'), [3], 'a byte-order mark before the properties');
	same(tabLines('```\n\tcode\n```\n\n\tText.\n'), [4], 'not in a fenced block');
	same(tabLines('~~~~\n\tcode\n~~~\n\tstill code\n~~~~\n\tText.\n'), [5], 'a fence closes with one as long, of its kind');
	same(tabLines('```\n\tnever closed\n\n\tso all of it is code\n'), [], 'an open fence runs to the end');
	same(tabLines('- item\n\n\tits second paragraph\n\n\tand third\n'), [], 'under a list item the indent is the list’s');
	same(tabLines('- item\n\nA paragraph.\n\n\tText.\n'), [4], 'a paragraph after the list ends it');
	same(tabLines('> quote\n\n\tText.\n'), [], 'after a quote: left alone, in doubt');
	same(tabLines('# Heading\n\tText.\n'), [1], 'straight after a heading');
	same(tabLines('Text.\n\n---\n\tText.\n'), [3], 'straight after a rule');
	same(tabLines('\tOne.\r\n\tTwo.\r\n\r\n\tThree.\r\n'), [0, 1, 3], 'Windows line endings');
	same(tabLines('\t\n\t  \n'), [], 'a line of white space only is a blank line');
	same(tabLines(''), [], 'an empty text');
}

// made ready for a renderer that gets the whole note
{
	const M = '<span class="binders-tab"></span>';
	eq(tabsForRender('\tOne *x*.\n\tTwo.\n\nPlain.\n'), `${M}One *x*.\n${M}Two.\n\nPlain.\n`, 'the white space gives way to the mark; the rest is as it was');
	eq(tabsForRender('\t\tTwo tabs.\n'), `${M}Two tabs.\n`, 'all of the white space');
	const untouched = 'Plain.\n\tUnder it.\n\n```\n\tcode\n```\n\n- item\n\n\tits text\n';
	eq(tabsForRender(untouched), untouched, 'a text with none is returned as it is');
}

// did a link mean the file that was renamed
{
	const OLD = 'Book/Part One/The keeper.md', SRC = 'Book/Part One/Arrival.md';
	ok(pointedAt('The keeper', SRC, OLD, ['Book/Prologue.md']), 'by name');
	ok(pointedAt('the KEEPER', SRC, OLD, []), 'capitals don’t count');
	ok(pointedAt('The keeper.md', SRC, OLD, []), 'with its extension');
	ok(pointedAt('Part One/The keeper', SRC, OLD, []), 'by the end of its path');
	ok(pointedAt('Book/Part One/The keeper', SRC, OLD, []), 'by its whole path');
	ok(pointedAt('/Book/Part One/The keeper', SRC, OLD, []), 'with a slash in front');
	ok(pointedAt('./The keeper', SRC, OLD, []), 'from the note’s own folder');
	ok(pointedAt('../Part One/The keeper.md', SRC, OLD, []), 'up and down again');
	ok(!pointedAt('../The keeper', SRC, OLD, []), 'a path from the note’s folder that leads elsewhere');
	ok(!pointedAt('The keeper', SRC, OLD, ['Notes/The keeper.md']), 'not when another file has the name: it could have meant that one');
	ok(pointedAt('Part One/The keeper', SRC, OLD, ['Notes/The keeper.md']), 'but its folder and name, which no other ends with, yes');
	ok(!pointedAt('keeper', SRC, OLD, []), 'part of a name is another name');
	ok(!pointedAt('One/The keeper', SRC, OLD, []), 'part of a folder’s name is another folder');
	ok(!pointedAt('', SRC, OLD, []), 'a link to nothing (a heading of the note itself)');
	ok(!pointedAt('Prologue', SRC, OLD, []), 'another note');
	ok(pointedAt('map.png', SRC, 'Book/map.png', []), 'a file that isn’t a note, by its name with its extension');
	ok(!pointedAt('map', SRC, 'Book/map.png', []), 'which a bare name doesn’t mean');
}

// links on tab-paragraph lines pointed at a new name: those links, and nothing else
{
	const to = (path: string) => (path.toLowerCase().replace(/\.md$/, '') === 'the keeper' ? 'The warden' : null);
	const text = '---\nsynopsis: "[[The keeper]]"\n---\nPlain [[The keeper]].\n\n\tTab [[The keeper]], [[The keeper|him]], [[The keeper#Past|then]], ![[The keeper]] and [md](<The keeper.md>) and [enc](The%20keeper.md#x).\n\tAnd `[[The keeper]]` in backticks, [[Prologue]] too.\n\n```\n\t[[The keeper]]\n```\n\nPlain.\n\tUnder it [[The keeper]].\n';
	const out = repointTabLinks(text, to);
	const lines = out.split('\n'), was = text.split('\n');
	eq(lines[5], '\tTab [[The warden]], [[The warden|him]], [[The warden#Past|then]], ![[The warden]] and [md](<The warden.md>) and [enc](The%20warden.md#x).', 'every kind of link on the line: the note changes; the shown text, the part and the kind stay');
	eq(lines[6], '\tAnd `[[The keeper]]` in backticks, [[Prologue]] too.', 'not between backticks, and not a link to another note');
	for (const n of [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14]) eq(lines[n], was[n], `line ${n} is as it was (properties, a plain line, a fenced block, a line that carries on a paragraph)`);
	eq(lines.length, was.length, 'no line more or fewer');
	eq(repointTabLinks(text, () => null), text, 'nothing to change: the same text');
	eq(repointTabLinks(text, to, (n) => n !== 5).split('\n')[5], was[5], 'a line the index doesn’t call code is left');
	const crlf = '\uFEFF\tTab [[The keeper]].\r\n\r\n\tMore [[The keeper]].\r\nEnd.';
	eq(repointTabLinks(crlf, to), '\uFEFF\tTab [[The keeper]].\r\n\r\n\tMore [[The warden]].\r\nEnd.', 'Windows line endings and no last line break are kept; a first line behind a byte-order mark doesn’t start with a tab, and is left');
	const twice = repointTabLinks(out, to);
	eq(twice, out, 'done again, nothing changes');
}

// the mode, wrapped: with a stand-in that reads a line as Obsidian's mode does (white space first, then the rest)
{
	type S = ModeState & { indentedCode?: boolean };
	const stream = (text: string) => { const s = { pos: 0, text, sol: () => s.pos === 0, eol: () => s.pos >= text.length }; return s; };
	const mode = {
		startState: (): S => ({ indentation: 0, list: false, quote: 0 }),
		token(st: Stream & { text?: string }, state: S): string | null {
			const s = st as ReturnType<typeof stream>;
			if (s.sol()) {
				const ws = /^\s*/.exec(s.text)![0];
				state.indentation = ws.replace(/\t/g, '    ').length; state.indentationDiff = null;
				if (ws) { s.pos = ws.length; return null; }
			}
			if (state.indentationDiff === null) state.indentationDiff = state.indentation;
			s.pos = s.text.length;
			return (state.indentationDiff ?? 0) >= 4 ? 'inline-code' : 'text';
		},
	};
	const read = (m: typeof mode, text: string, state: S = m.startState()) => { const s = stream(text), out: (string | null)[] = []; while (!s.eol()) out.push(m.token(s, state)); return out; };
	same(read(mode, '\tText'), [null, 'inline-code'], 'the stand-in reads a tabbed line as code, as Obsidian does');
	const wrapped = wrapMode<S, typeof mode>(mode)!;
	ok(!!wrapped, 'a mode with the state known here is wrapped');
	same(read(wrapped, '\tText'), [`hmd-indented-code line-${TAB_LINE}`, 'text'], 'wrapped: the white space is named, the line marked, and the rest read as text');
	same(read(wrapped, '    Text'), [`hmd-indented-code line-${TAB_LINE}`, 'text'], 'four spaces too');
	same(read(wrapped, 'Text'), ['text'], 'a line with no indent is read as it was');
	same(read(wrapped, '  Text'), [null, 'text'], 'less than a tab is left to the mode');
	same(read(wrapped, '\tText', { indentation: 0, list: true, quote: 0 }), [null, 'inline-code'], 'in a list the indent is the list’s: left to the mode');
	same(read(wrapped, '\tText', { indentation: 0, list: false, quote: 1 }), [null, 'inline-code'], 'in a quote too');
	same(read(wrapped, '\t'), [null], 'a line of white space only is left');
	eq(wrapMode(null), null, 'no mode: nothing');
	eq(wrapMode({ token: () => null }), null, 'a mode with no state to look at: nothing');
	eq(wrapMode({ token: () => null, startState: () => ({}) }), null, 'a mode whose state has other fields: nothing (the lines stay code)');
	eq(wrapMode({ token: () => null, startState: () => ({ indentation: 0, list: null, quote: 0 }) }), null, 'or the fields with other values');
	eq(wrapMode({ token: () => null, startState: () => { throw new Error('no'); } }), null, 'or one that throws');
}

// tabs taken off paragraphs, for a note that goes outside a binder (export's "One note")
{
	eq(untab('\tOne.\n\tTwo.\n\n    Three.\nplain\n\n```\n\tcode\n```\n- item\n\tits text\n'), 'One.\nTwo.\n\nThree.\nplain\n\n```\n\tcode\n```\n- item\n\tits text\n', 'a paragraph begun with a tab or spaces loses them; code and a list item’s text keep theirs');
	eq(untab('No tabs here.\n'), 'No tabs here.\n', 'a text without them is as it was');
}

done('paragraphs');
