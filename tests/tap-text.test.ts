import { sourceOffset } from '../src/view/tap-text';
import { done, eq } from './harness';

/** The source position found for the place in the drawn text marked `¦`, shown as the source with `¦` put there. */
const at = (src: string, drawn: string): string => {
	const i = drawn.indexOf('¦'), p = sourceOffset(src, drawn.slice(0, i), drawn.slice(i + 1));
	return p === null ? 'null' : src.slice(0, p) + '¦' + src.slice(p);
};

// plain prose: the place is the place
{
	const P = 'He met her at the foot of the tower and did not move out of the doorway.';
	eq(at(P, 'He met her at the foot of the tower and did not move out of the ¦doorway.'), 'He met her at the foot of the tower and did not move out of the ¦doorway.', 'before a word');
	eq(at(P, 'He met her at the foot of the tower and did not move out of the doorw¦ay.'), 'He met her at the foot of the tower and did not move out of the doorw¦ay.', 'inside a word');
	eq(at(P, '¦' + P), '¦' + P, 'the very start');
	eq(at(P, P + '¦'), P + '¦', 'the very end');
	eq(at(P + '\n', P + '¦'), P + '¦\n', 'the end, with the note’s line break after it');
}

// the same words more than once: the one as far through as the place was
{
	const P = 'the sea and the sea and the sea and the sea';
	eq(at(P, 'the sea and the sea and the ¦sea and the sea'), 'the sea and the sea and the ¦sea and the sea', 'the third of four');
	eq(at('a a a a a a', 'a a a ¦a a a'), 'a a a ¦a a a', 'single letters');
}

// marks the drawn text doesn't have
{
	eq(at('The **keeper** said nothing.', 'The keeper¦ said nothing.'), 'The **keeper¦** said nothing.', 'after a bold word: at the word’s end (a space follows, so the words before it say where)');
	eq(at('The **keeper** said nothing.', 'The keeper ¦said nothing.'), 'The **keeper** ¦said nothing.', 'before the word after it');
	eq(at('He said **nothing**.', 'He said ¦nothing.'), 'He said **¦nothing**.', 'before a bold word: at the word’s start');
	eq(at('The **keeper** said nothing.', 'The kee¦per said nothing.'), 'The **kee¦per** said nothing.', 'inside a bold word');
	eq(at('See [[Arrival|the first night]] again.', 'See the first ¦night again.'), 'See [[Arrival|the first ¦night]] again.', 'inside a link’s shown text');
	eq(at('# The storm', 'The ¦storm'), '# The ¦storm', 'a heading');
	eq(at('# The storm', '¦The storm'), '# ¦The storm', 'the start of a heading: after its mark');
	eq(at('- one\n- two\n- three', 'one\ntwo¦\nthree'), '- one\n- two¦\n- three', 'a list: the end of an item');
	eq(at('- one\n- two\n- three', 'one\ntwo\nth¦ree'), '- one\n- two\n- th¦ree', 'inside an item');
	eq(at('- one\n- two\n- three', 'onetwo¦three'), '- one\n- two\n- ¦three', 'a list drawn with nothing between its items: the start of the next');
	eq(at('> quoted words here\n> and more of them', 'quoted words here and ¦more of them'), '> quoted words here\n> and ¦more of them', 'a quote over two lines');
}

// line breaks in the note are spaces (or nothing) in the drawn text
{
	eq(at('one two\nthree four', 'one two three¦ four'), 'one two\nthree¦ four', 'a line break drawn as a space');
	eq(at('one two\nthree four', 'one two\nthree¦ four'), 'one two\nthree¦ four', 'a line break drawn as one');
	eq(at('one   two', 'one ¦two'), 'one   ¦two', 'several spaces drawn as one');
}

// what can't be told is null
{
	eq(sourceOffset('```\ncode\n```', '', ''), null, 'nothing drawn');
	eq(sourceOffset('quite other words', 'xyz', 'pqr'), null, 'text that isn’t in the source');
}

done('tap text');
