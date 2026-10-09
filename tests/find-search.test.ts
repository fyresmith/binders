import { apply, findIn, findPlain, inverse, replaceIn, shielded } from '../src/find/search';
import { done, eq } from './harness';

const o = { matchCase: false };
const found = (text: string, q: string, opt = o) => findIn(text, q, opt).map((h) => text.slice(h.from, h.to) + '@' + h.from).join(' ');
const swap = (text: string, q: string, by: string, opt = o) => replaceIn(text, findIn(text, q, opt), by);

// a note's text, never its properties
{
	const note = '---\nlabel: Mara\nsynopsis: Mara arrives.\n---\nMara came. mara, MARA.\n';
	eq(findIn(note, 'Mara', o).length, 3, 'the text only, any case');
	eq(findIn(note, 'Mara', { matchCase: true }).length, 1, 'match case');
	eq(swap(note, 'mara', 'Maren'), '---\nlabel: Mara\nsynopsis: Mara arrives.\n---\nMaren came. Maren, Maren.\n', 'the properties are as they were, byte for byte');
	eq(swap('a.c abc', 'a.c', '$1'), '$1 abc', 'a query and a replacement are as typed: no patterns');
	eq(swap('---\nnot: closed\nMara', 'Mara', 'x'), '---\nnot: closed\nx', 'a rule that opens nothing is text');
}

// where a link leads is no match; what a link shows is
{
	eq(swap('see [[Mara]].', 'Mara', 'Maren'), 'see [[Mara]].', 'a link’s target');
	eq(swap('see [[Mara|Mara herself]].', 'Mara', 'Maren'), 'see [[Mara|Maren herself]].', 'its shown words change, its target doesn’t');
	eq(swap('see [[Mara#Storm]] and [[Notes#Mara]].', 'Mara', 'Maren'), 'see [[Mara#Storm]] and [[Notes#Mara]].', 'a heading’s part is the target too');
	eq(swap('![[Mara]] ![[Mara.png|200]]', 'Mara', 'Maren'), '![[Mara]] ![[Mara.png|200]]', 'an embed');
	eq(swap('[what Mara kept](Mara.md)', 'Mara', 'Maren'), '[what Maren kept](Mara.md)', 'a Markdown link: its words, not where it leads');
	eq(swap('[[Mara]] met Mara. [[Mara]]', 'Mara', 'Maren'), '[[Mara]] met Maren. [[Mara]]', 'text between two links');
}

// to change a link, the link is typed
{
	eq(swap('see [[Mara]] and [[Mara|her]].', '[[Mara]]', '[[Maren]]'), 'see [[Maren]] and [[Mara|her]].', 'the whole link, as written');
	eq(swap('see [[Mara]], [[Mara|her]], [[Mara#Storm]], ![[Mara]].', '[[Mara', '[[Maren'), 'see [[Maren]], [[Maren|her]], [[Maren#Storm]], ![[Maren]].', 'half typed: every link that starts so');
	eq(found('[[Maran]] [[Mara]]', '[[Mara'), '[[Mara@0 [[Mara@10', 'half typed takes what starts with it (the review shows each)');
	eq(swap('[[Mara|her]]', 'Mara|her', 'Maren|she'), '[[Maren|she]]', 'a query that reaches past the target is taken as written');
	eq(swap('[x](Mara.md)', '](Mara.md)', '](Maren.md)'), '[x](Maren.md)', 'a Markdown link’s destination, with its bracket');
}

// a tag is left as it is, as a link's target is
{
	eq(swap('#Mara and Mara', 'Mara', 'Maren'), '#Mara and Maren', 'a tag is no match');
	eq(swap('see #Mara/sub, (#Mara) and #Mara.', 'Mara', 'Maren'), 'see #Mara/sub, (#Mara) and #Mara.', 'a tag with a path, in brackets, before a full stop');
	eq(swap('#Mara and Mara', '#Mara', '#Maren'), '#Maren and Mara', 'typed with its #, it is found as written');
	eq(swap('# Mara\n\nMara', 'Mara', 'Maren'), '# Maren\n\nMaren', 'a heading is text: its # has a space after it');
	eq(swap('a#Mara http://x/#Mara 1 #1984 #Mara', 'Mara', 'Maren'), 'a#Maren http://x/#Maren 1 #1984 #Mara', 'not a tag after a word or a slash; a number alone is no tag');
	eq(swap('[[Notes#Mara]] #Mara', 'Mara', 'Maren'), '[[Notes#Mara]] #Mara', 'a heading link and a tag');
}

// code and comments are no prose
{
	eq(swap('say `Mara` and Mara', 'Mara', 'Maren'), 'say `Mara` and Maren', 'inline code');
	eq(swap('say `Mara` and Mara', '`Mara`', '`Maren`'), 'say `Maren` and Mara', 'typed with its backticks, it is found as written');
	eq(swap('``a `Mara` b`` Mara', 'Mara', 'Maren'), '``a `Mara` b`` Maren', 'code with a longer fence');
	eq(swap('```js\nMara\n```\nMara', 'Mara', 'Maren'), '```js\nMara\n```\nMaren', 'a fenced block');
	eq(swap('~~~\nMara\n~~~\nMara', 'Mara', 'Maren'), '~~~\nMara\n~~~\nMaren', 'a tilde fence');
	eq(swap('```\nMara\n```', '```\nMara', '```\nMaren'), '```\nMaren\n```', 'a query that includes the fence is found as written');
	eq(swap('```\nMara', 'Mara', 'Maren'), '```\nMara', 'a fence never closed holds the rest of the note');
	eq(swap('```\nMara\n```\n`x` Mara `y`', 'Mara', 'Maren'), '```\nMara\n```\n`x` Maren `y`', 'a fence’s lines are not read as inline code with the next fence’s');
	eq(swap('Mara %% Mara %% Mara', 'Mara', 'Maren'), 'Maren %% Mara %% Maren', 'a comment');
	eq(swap('Mara %% Mara %%.', '%% Mara', '%% Maren'), 'Mara %% Maren %%.', 'typed with its marks, a comment is found as written');
	eq(swap('<!-- Mara -->\nMara', 'Mara', 'Maren'), '<!-- Mara -->\nMaren', 'an HTML comment');
	eq(swap('a ` b\n\nMara ` c', 'Mara', 'Maren'), 'a ` b\n\nMaren ` c', 'a lone backtick opens nothing across a blank line');
	eq(swap('\tIndented Mara\n\tMara again', 'Mara', 'Maren'), '\tIndented Maren\n\tMaren again', 'a tab-led line is a paragraph, not code');
	eq(swap('x', '', 'y'), 'x', 'an empty query finds nothing');
}

// the same in text as drawn, and what the writing part does
{
	const t = '#Mara and Mara';
	eq(findPlain(t, 'Mara', o, [{ from: 1, to: 5 }]).length, 1, 'text as drawn: what the caller guards is no match');
	eq(findPlain(t, '#Mara', o, [{ from: 1, to: 5 }]).length, 1, 'and a query that reaches outside it is');
	eq(shielded('a [[b|c]] d').map((h) => 'a [[b|c]] d'.slice(h.from, h.to)).join(), 'b', 'what is guarded, between its marks');
	const text = 'Mara met Mara.', edits = findIn(text, 'Mara', o).map((h) => ({ ...h, text: 'Maren Smith' }));
	const after = apply(text, edits);
	eq(after, 'Maren Smith met Maren Smith.', 'edits made');
	eq(apply(after, inverse(text, edits)), text, 'and taken back, whatever the lengths');
	eq(swap('Mara Mara', 'Mara', 'Mara Mara'), 'Mara Mara Mara Mara', 'a replacement that holds the query is not looked at again');
	eq(swap('Mara', 'Mara', ''), '', 'replaced with nothing');
	eq(swap('---\nsynopsis: Mara\n---\nMara', 'Mara', ''), '---\nsynopsis: Mara\n---\n', 'with nothing, the properties stay');
}
done('find and replace');
