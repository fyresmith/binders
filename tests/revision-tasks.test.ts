import { append, parse, quoted, setDone, taskLines } from '../src/revision/tasks';
import { ok, eq, done } from './harness';

/* The revision note as text: what is a task, what it is about, and that the two writes change what they say and
   nothing else. */

const NOTE = [
	'---', 'tags: [revision]', '---',
	'Things to fix before the board reads it.',
	'',
	'- [ ] [[Arrival]]: Say why nobody meets her',
	'\t> She had been told a man would meet her.',
	'- [x] [[The keeper]]: He says "nineteen years" twice',
	'- [ ] [[Part One/The keeper|Harrow at the door]] and [[Lights out]]: the green door',
	'- [ ] Check every tide against the almanac',
	'- [-] [[Arrival]] cancelled by another plugin',
	'- not a task, [[Arrival]]',
	'* [ ] [Storm warning](Part%20One/Storm%20warning.md): the glass',
	'',
	'## [[The wreck]]',
	'- [ ] Whose flare is it?',
	'- [[Lights out]]',
	'    - [ ] Eleven minutes or twelve',
	'```',
	'- [ ] [[Arrival]] in code',
	'```',
	'1. [ ] numbered, about [[Mara]] the person',
].join('\n');

const J = (x: unknown) => JSON.stringify(x);
const t = parse(NOTE);
eq(t.length, 9, 'nine tasks: not the plain bullet, not the one in code');
eq(t[0].text, 'Say why nobody meets her', 'the leading link and its colon are not part of what it says');
eq(J(t[0].links), J([{ path: 'Arrival', lead: true }]), 'about Arrival');
eq(t[0].quote, 'She had been told a man would meet her.', 'the passage under it');
ok(t[1].done && !t[0].done, 'x is done, a space is not');
eq(J(t[2].links.map((l) => l.path)), J(['Part One/The keeper', 'Lights out']), 'two scenes');
eq(t[2].text, 'the green door', 'links that lead the line together are all what it is about');
eq(J(t[3].links), J([]), 'no link: the whole book');
ok(t[4].done, 'any other character is done, as Obsidian reads it');
eq(J(t[5].links), J([{ path: 'Part One/Storm warning', lead: true }]), 'a Markdown link');
eq(J(t[6].links.map((l) => l.path)), J(['The wreck']), 'under a heading that names a scene');
eq(J(t[7].links.map((l) => l.path)), J(['Lights out']), 'under a bullet that names a scene');
eq(J(t[8].links), J([{ path: 'Mara', lead: false }]), 'a link in the middle is only a word until it names a scene');

// ticking: one character
const ticked = setDone(NOTE, t[0], true) ?? '';
ok(ticked !== '', 'ticked');
eq([...NOTE].filter((c, i) => c !== ticked[i]).length, 1, 'one character differs');
eq(ticked.length, NOTE.length, 'and the length is the same');
eq(setDone(ticked, parse(ticked)[0], false), NOTE, 'and back, byte for byte');
// lines added above: found again by its words
const shifted = `- [ ] new at the top\n${NOTE}`;
eq(setDone(shifted, t[3], true), shifted.replace('- [ ] Check every tide', '- [x] Check every tide'), 'found where it moved to');
// changed since it was read, or twice in the note: nothing
eq(setDone(NOTE.replace('Check every tide', 'Check each tide'), t[3], true), null, 'reworded: not guessed');
eq(setDone(`intro\n${NOTE}\n${t[3].raw}`, t[3], true), null, 'moved and there twice: not guessed');
const crlf = '- [ ] one\r\n- [ ] two\r\n';
eq(setDone(crlf, parse(crlf)[1], true), '- [ ] one\r\n- [x] two\r\n', 'Windows line ends stay');

// adding: everything above is as it was
for (const was of ['', '- [ ] a\n', '- [ ] a', '- [ ] a\n\n\n', 'A paragraph.\n', 'A paragraph.', '- [ ] a\n\t> q\n', '---\nx: 1\n---\n']) {
	const now = append(was, taskLines('[[B]]', '  do  it ', '')) ?? '';
	ok(now.startsWith(was), `what was there is still there: ${J(was)}`);
	ok(now.endsWith('- [ ] [[B]]: do it\n'), 'the task is last');
	eq(parse(now).length, parse(was).length + 1, `one task more: ${J(was)}`);
}
eq(append('A paragraph.', taskLines('', 'x')), 'A paragraph.\n\n- [ ] x\n', 'a blank line after a paragraph');
eq(taskLines('[[A]]', 'x', 'one\n\ntwo   three'), '- [ ] [[A]]: x\n\t> one two three', 'a passage is one line');
ok(quoted('word '.repeat(100)).length <= 241 && quoted('word '.repeat(100)).endsWith('…'), 'a long passage is cut at a word');
eq(parse(taskLines('[[A]]', 'x', 'a passage'))[0].quote, 'a passage', 'and reads back');

// ---- what the design left to the build ----
// a byte-order mark before the properties; Windows line ends throughout
const bom = '﻿---\ntags: [revision]\n---\n- [ ] [[A]]: one\n';
eq(parse(bom).length, 1, 'a byte-order mark and properties above: the task is read');
eq(parse(bom)[0].text, 'one', 'and its text');
const win = '---\r\nx: 1\r\n---\r\n- [ ] [[A]]: one\r\n\t> quoted\r\n- [x] two\r\n';
eq(parse(win).length, 2, 'Windows line ends: both tasks');
eq(parse(win)[0].quote, 'quoted', 'and the passage');
eq(parse(win)[0].text, 'one', 'and no carriage return in what it says');
eq(setDone(win, parse(win)[0], true), win.replace('- [ ] [[A]]', '- [x] [[A]]'), 'ticked in a note with Windows line ends, byte for byte otherwise');
eq(append(win, taskLines('[[B]]', 'three')), `${win}- [ ] [[B]]: three\r\n`, 'added with the note’s own line ends');
eq(append(win, taskLines('[[B]]', 'three', 'a passage')), `${win}- [ ] [[B]]: three\r\n\t> a passage\r\n`, 'and its passage too');
// a last line break or none; a blank line
eq(append('- [ ] a', taskLines('', 'b')), '- [ ] a\n- [ ] b\n', 'no last line break: one added after, nothing else');
eq(append('- [ ] a\n', taskLines('', 'b')), '- [ ] a\n- [ ] b\n', 'a last line break');
eq(append('- [ ] a\n\n', taskLines('', 'b')), '- [ ] a\n\n- [ ] b\n', 'a blank line is left');
// code blocks: tilde fences, a longer fence, an unclosed one
eq(parse('~~~\n- [ ] no\n~~~\n- [ ] yes').length, 1, 'a task in a tilde fence is not one');
eq(parse('````\n```\n- [ ] no\n```\n````\n- [ ] yes').length, 1, 'a shorter fence inside a longer one does not end it');
eq(parse('```\n- [ ] no\nnever closed').length, 0, 'an unclosed fence runs to the end');
eq(append('```\ncode', taskLines('', 'x')), null, 'a note ending in a code block takes no task');
// properties that never close are text
eq(parse('---\n- [ ] a\n- [ ] b').length, 2, 'a rule with no second rule is not properties');
// nested bullets: a child with its own link, a child without, a grandchild
const nest = ['- [[Lights out]]', '\t- [ ] first', '\t- [ ] [[Arrival]]: second', '\t\t- [ ] third', '- [ ] fourth'].join('\n');
eq(J(parse(nest).map((x) => x.links.map((l) => l.path))), J([['Lights out'], ['Arrival'], ['Arrival'], []]), 'a task takes its parent’s link only when it has none, and a grandchild the nearest');
// two links, an alias, a path, a heading
const links = parse('- [ ] [[A|an alias]] and [[Part One/B#Heading]]: text\n- [ ] [[C^block]] x\n- [ ] see [[#Here]] y\n- [ ] [[A]], [[B]], [[C]]: all three');
eq(J(links[0].links.map((l) => l.path)), J(['A', 'Part One/B']), 'an alias and a heading are not part of the name');
eq(links[0].text, 'text', 'what it says');
eq(J(links[1].links), J([{ path: 'C', lead: true }]), 'a block link names its note');
eq(J(links[2].links), J([]), 'a link to a heading of the note itself names no scene');
eq(links[3].links.length, 3, 'three leading links');
// malformed lines are not tasks, and ticking one leaves the others alone
const bad = ['-[ ] no space', '- [] empty', '- [ ]', '- [ ]x', 'text - [ ] midline', '- [  ] two spaces', '- [ ] fine'].join('\n');
eq(parse(bad).length, 1, 'only the well-formed line is a task');
eq(setDone(bad, parse(bad)[0], true), bad.replace('- [ ] fine', '- [x] fine'), 'and ticking it changes nothing else');
// a position that is no longer a box
eq(setDone('- [ ] a', { line: 0, raw: '- [ ] a', markAt: 4 }, true), null, 'a stale position is refused');
done('revision tasks');
