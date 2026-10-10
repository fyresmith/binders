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
	eq(swap('a#Mara http://x/#Mara 1 #1984 #Mara', 'Mara', 'Maren'), 'a#Maren http://x/#Mara 1 #1984 #Mara', 'not a tag after a word; a URL’s fragment is the URL’s; a number alone is no tag');
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

// bare web addresses, block ids and HTML are where something leads
{
	eq(swap('See https://maraproject.org/#Mara and www.mara.example for Mara.', 'Mara', 'Maren'), 'See https://maraproject.org/#Mara and www.mara.example for Maren.', 'bare URLs');
	eq(swap('<https://x.example/Mara> Mara', 'Mara', 'Maren'), '<https://x.example/Mara> Maren', 'an autolink');
	eq(swap('[Mara](https://x.example/Mara) Mara', 'Mara', 'Maren'), '[Maren](https://x.example/Mara) Maren', 'a Markdown link to a URL still shows its words');
	eq(swap('https://x.example/Mara', 'https://x.example/Mara', 'u'), 'u', 'typed with its scheme, an address is found as written');
	eq(swap('xwww.Mara Mara', 'Mara', 'Maren'), 'xwww.Maren Maren', 'www inside a word is no address');
	eq(swap('A line. ^mara\nMara', 'Mara', 'Maren'), 'A line. ^mara\nMaren', 'a block id at a line’s end');
	eq(swap('A line. ^mara\r\nMara', 'Mara', 'Maren'), 'A line. ^mara\r\nMaren', 'a block id before a CRLF');
	eq(swap('^mara\nMara', 'Mara', 'Maren'), '^mara\nMaren', 'a block id alone on its line');
	eq(swap('x^Mara and Mara^2 and ^Mara here', 'Mara', 'Maren'), 'x^Maren and Maren^2 and ^Maren here', 'a ^ in prose, not a block id');
	eq(swap('[[Target#^mara]] Mara', 'Mara', 'Maren'), '[[Target#^mara]] Maren', 'a link to a block id');
	const html = 'An <img src="Mara.png" alt=\'Mara\'> and <a href="https://x.example/Mara">Mara</a> link.';
	eq(swap(html, 'Mara', 'Maren'), 'An <img src="Mara.png" alt=\'Mara\'> and <a href="https://x.example/Mara">Maren</a> link.', 'attribute values are kept, words between tags change');
	eq(swap('<mara>Mara</mara>', 'mara', 'x'), '<mara>x</mara>', 'a tag’s name is kept');
	eq(swap('if a < b and Mara > c, or a<b then Mara>c', 'Mara', 'Maren'), 'if a < b and Maren > c, or a<b then Maren>c', 'a < in prose is no tag');
	eq(swap('<span\n class="Mara">Mara</span>', 'Mara', 'Maren'), '<span\n class="Mara">Maren</span>', 'a tag over two lines');
}

// an escaped first bracket makes no link
{
	eq(swap('Escaped \\[[Mara]] and [[Mara]]', 'Mara', 'Maren'), 'Escaped \\[[Maren]] and [[Mara]]', 'escaped: prose; unescaped: a target');
}

// a block indented four spaces is code; a tab-led paragraph, and a list's lines, are not
{
	eq(swap('Mara.\n\n    Mara code\n\nMara.', 'Mara', 'Maren'), 'Maren.\n\n    Mara code\n\nMaren.', 'indented code');
	eq(swap('    Mara code\n\n    Mara more\n\n\tMara tab\n    Mara five', 'Mara', 'M'), '    Mara code\n\n    Mara more\n\n\tM tab\n    M five', 'a blank line inside the block; a tab line is prose; a line after prose is a continuation of the paragraph');
	eq(swap('Mara\n    Mara continues the paragraph', 'Mara', 'M'), 'M\n    M continues the paragraph', 'indented lines of a paragraph are prose');
	eq(swap('- Mara\n\n    Mara in the item\n\nMara', 'Mara', 'M'), '- M\n\n    M in the item\n\nM', 'indented lines in a list item are prose');
	eq(swap('- Mara\n\nMara\n\n    Mara code', 'Mara', 'M'), '- M\n\nM\n\n    Mara code', 'after the list ended, code again');
	eq(swap('```\nMara\n```\n    Mara\n\n    `x` Mara', 'Mara', 'M'), '```\nMara\n```\n    M\n\n    `x` Mara', 'a line right after a fence, and inline code inside an indented block');
	eq(swap('\tMara\n\n\t    Mara', 'Mara', 'M'), '\tM\n\n\t    M', 'a tab first: prose');
	eq(shielded('    a `b` %% c\n\n    d %%').length, 1, 'overlapping guards are one');
}

// Turkish İ with Match case off; ı is its own letter
{
	eq(found('İstanbul, istanbul, ISTANBUL and İSTANBUL.', 'istanbul'), 'İstanbul@0 istanbul@10 ISTANBUL@20 İSTANBUL@33', 'all four');
	eq(found('İstanbul istanbul', 'İstanbul').split(' ').length, 2, 'the dotted capital in the query');
	eq(found('ıs is IS', 'ı'), 'ı@0', 'dotless apart');
	eq(found('İstanbul istanbul', 'istanbul', { matchCase: true }), 'istanbul@9', 'Match case on: as it is');
}

// Unicode forms: one letter however it is spelled; places are in the text as it is
{
	const dec = 'café', pre = 'café';
	const t = `${pre} and ${dec} and cafe`;
	eq(findIn(t, pre, o).map((h) => t.slice(h.from, h.to)).join('|'), `${pre}|${dec}`, 'both spellings are found by the composed query');
	eq(findIn(t, dec, o).length, 2, 'and by the decomposed one');
	eq(swap(t, pre, 'X'), 'X and X and cafe', 'both replaced, others untouched');
	eq(findIn(`${dec} at dawn`, 'e', o).length, 0, 'a base letter inside a cluster is no match');
	eq(findIn(`${pre} at dawn`, 'e', o).length, 0, 'nor in a composed é');
	eq(swap(`${dec} at dawn.`, 'e', 'x'), `${dec} at dawn.`, 'the text is as it was');
	eq(swap(`${dec} at dawn.`, 'dawn', 'dusk'), `${dec} at dusk.`, 'a match after a cluster is at the right place');
	eq(swap('ée é e', 'e', 'x'), 'éx é x', 'only bare e letters change');
	// mixed text: every other character is left as it was, whatever the forms
	const mixed = `ÅÅ ${dec} é ${pre} İstanbul 𝒳é 日本 ẹ́ Mara`;
	eq(swap(mixed, 'Mara', 'Z'), mixed.replace('Mara', 'Z'), 'mixed forms: only the word is replaced');
	eq(swap(mixed, 'café', 'C'), mixed.replace(dec, 'C').replace(pre, 'C'), 'the cluster is replaced whole');
	eq(swap(mixed, 'Å', 'A'), mixed.replace('Å', 'A').replace('Å', 'A'), 'a ring both ways');
	eq(swap(mixed, 'istanbul', 'T'), mixed.replace('İstanbul', 'T'), 'İ in mixed text');
	eq(swap(mixed, 'ẹ́', 'Q'), mixed.replace('ẹ́', 'Q'), 'two marks on one letter');
	eq(swap(mixed, '日本', 'N'), mixed.replace('日本', 'N'), 'CJK after clusters');
	const edits = findIn(mixed, 'café', o).map((h) => ({ ...h, text: 'C' }));
	eq(edits.length, 2, 'two café, spelled two ways');
	eq(apply(apply(mixed, edits), inverse(mixed, edits)), mixed, 'and they take it back');
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
