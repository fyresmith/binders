import { COMPILE_DEFAULTS, blockIsText, bodyStart, compile, forRender, frontFor, joinBodies, linkTargets, moved, nextName, parts, pointsAt, repointLinks, splitAt, stripComments, synopsisFrom, tidyHead, tidyTail, titleFrom, uniqueFootnotes, useYaml, type CompileItem } from '../src/scene-text';
import { done, eq, ok } from './harness';

const NOTE = '---\nsynopsis: Mara arrives.\nstatus: draft\n---\nThe boat left her on the jetty.\n\nShe had two cases.\n';

// properties and text
{
	const p = parts(NOTE);
	eq(p.front, '---\nsynopsis: Mara arrives.\nstatus: draft\n---\n', 'the properties block, with its last line break');
	eq(p.body, 'The boat left her on the jetty.\n\nShe had two cases.\n', 'the text after it');
	eq(p.front + p.body, NOTE, 'nothing lost between them');
	eq(parts('No properties here.').front, '', 'a note without properties');
	eq(parts('---\nnot closed\ntext').body, '---\nnot closed\ntext', 'an unclosed block is text');
	eq(parts('---\r\na: 1\r\n---\r\nText').body, 'Text', 'Windows line endings');
	eq(parts('---\na: 1\n---').body, '', 'properties only');
}

// splitting: every character ends up in one half or the other
{
	const at = NOTE.indexOf('She had');
	const s = splitAt(NOTE, at);
	ok(!!s && s.head + s.tail === NOTE, 'head + tail is the note');
	eq(s?.tail, 'She had two cases.\n', 'the tail is from the caret on');
	eq(splitAt(NOTE, 10), null, 'not inside the properties');
	eq(splitAt(NOTE, NOTE.length + 1), null, 'not past the end');
	eq(splitAt(NOTE, parts(NOTE).front.length)?.head, parts(NOTE).front, 'at the very start of the text: everything goes');
	eq(splitAt(NOTE, NOTE.length)?.tail, '', 'at the very end: nothing goes');
	eq(tidyHead(s?.head ?? ''), '---\nsynopsis: Mara arrives.\nstatus: draft\n---\nThe boat left her on the jetty.\n', 'the first half ends in one line break');
	eq(tidyHead(parts(NOTE).front), parts(NOTE).front, 'a first half with no text keeps its properties as they are');
	eq(tidyTail('\n\n  \nShe had two cases.\n'), 'She had two cases.\n', 'the second half starts at its text');
	eq(tidyTail('had two cases.'), 'had two cases.', 'a split mid-sentence keeps the sentence');
	// mid-word, mid-line: no character changes
	const mid = NOTE.indexOf('jetty') + 2, m = splitAt(NOTE, mid);
	eq((m?.head ?? '') + (m?.tail ?? ''), NOTE, 'a split mid-word loses nothing');
}

// merging
{
	eq(joinBodies(['One.\n', '\n\nTwo.\n\n\n', 'Three.']), 'One.\n\nTwo.\n\nThree.\n', 'a blank line between, one line break at the end');
	eq(joinBodies(['One.', '   \n', '', 'Two.']), 'One.\n\nTwo.\n', 'blank notes add nothing');
	eq(joinBodies(['', ' ']), '', 'nothing from nothing');
	eq(joinBodies(['  indented first line\nsecond']), '  indented first line\nsecond\n', 'a first line’s indent is kept');
}

// a synopsis from the text
{
	eq(synopsisFrom(NOTE), 'The boat left her on the jetty.', 'the first paragraph');
	eq(synopsisFrom('# Chapter one\n\n---\n\n![[map.png]]\n\n**Mara** met [[Ines|her sister]] at the [harbour](x), *late*.'), 'Mara met her sister at the harbour, late.', 'headings, rules and embeds skipped; Markdown marks removed');
	eq(synopsisFrom('- [ ] first thing\n- second'), 'first thing - second', 'a list’s first marker goes');
	eq(synopsisFrom('%% a note to self %%\n\nReal text.'), 'Real text.', 'comments aren’t the synopsis');
	eq(synopsisFrom('---\na: 1\n---\n'), '', 'no text, no synopsis');
	const long = synopsisFrom('word '.repeat(200), 50);
	ok(long.length <= 51 && long.endsWith('…') && !long.includes('wor…'), 'a long paragraph is cut at a word: ' + long);
	eq(synopsisFrom('snake_case and 2 * 3 * 4 stay'), 'snake_case and 2 * 3 * 4 stay', 'underscores and stars that aren’t emphasis stay');
}

// names
{
	eq(titleFrom('## The **storm** breaks\nmore'), 'The storm breaks', 'the first line, without marks');
	eq(titleFrom('What? No: way / out'), 'What No way out', 'characters a file name can’t have go');
	eq(titleFrom('   \n\n'), '', 'nothing selected');
	eq(titleFrom('...and then.'), 'and then', 'no leading or trailing dots');
	ok(titleFrom('long '.repeat(40)).length <= 80, 'not too long');
	eq(titleFrom('[[Ines|her sister]] arrives'), 'her sister arrives', 'a link’s text');
	const taken = (names: string[]) => (n: string) => names.includes(n);
	eq(nextName('Scene', taken([])), 'Scene 2', 'a second one');
	eq(nextName('Scene 5', taken([])), 'Scene 6', 'counting on from its number');
	eq(nextName('Scene', taken(['Scene 2', 'Scene 3'])), 'Scene 4', 'the first that’s free');
	eq(nextName('1984', taken([])), '1984 2', 'a name that is only a number keeps it');
}

// where properties end: an empty block is one, and the text after it isn't taken for properties up to its first rule
{
	const t = '---\n---\nText of the scene.\n\n---\n\nMore text.\n';
	eq(parts(t).front, '---\n---\n', 'empty properties end at their second fence');
	eq(parts(t).body, 'Text of the scene.\n\n---\n\nMore text.\n', 'and all the text after is the note’s text');
	eq(parts('---\r\n---\r\nA\r\n').body, 'A\r\n', 'with Windows line endings too');
	eq(parts('---\na: 1\n--- \nB').body, 'B', 'a fence with a space after it still closes');
	eq(parts('---\n\nNot properties: a rule, then text.\n').front, '', 'a rule at the top with no second one isn’t properties');
}

// what is a properties block: only one that reads as properties (or holds nothing). Anything else between two rules is
// the writer's text, and the whole note is text
{
	const whole = (t: string, why: string) => { eq(parts(t).front, '', `${why}: no properties`); eq(parts(t).body, t, `${why}: the whole note is its text`); eq(bodyStart(t), 0, `${why}: the text starts at the top`); };
	const RULE = '---\n\nLost paragraph.\n\n---\n\nKept.\n';
	whole(RULE, 'a rule, a paragraph, a rule');
	whole(RULE.replace(/\n/g, '\r\n'), 'the same with Windows line endings');
	// (a byte-order mark is no text: it stays in front, so that whoever writes the text back keeps it)
	const MARK = String.fromCharCode(0xFEFF);
	eq(parts(MARK + RULE).front, MARK, 'the same after a byte-order mark: no properties, the mark in front');
	eq(parts(MARK + RULE).body, RULE, 'and the whole note is its text');
	eq(parts(MARK + 'Text.\n').body, 'Text.\n', 'a note with a mark and no dashes at all');
	eq(frontFor(MARK), MARK, 'text follows a mark with nothing between');
	eq(frontFor('---\na: 1\n---'), '---\na: 1\n---\n', 'properties that end the file get a line break before text follows');
	eq(frontFor('---\na: 1\n---\n') + frontFor(''), '---\na: 1\n---\n', 'and any other front is as it is');
	whole('---\njust a line of prose\n---\nText.\n', 'a line of prose between two rules');
	whole('---\nNote: this\nis text\n---\nText.\n', 'two lines, the second with no key');
	whole('---\n- a\n- b\n---\nText.\n', 'a list between two rules');
	whole('---   \na: 1\n---\nText.\n', 'spaces after the opening rule');
	whole('----\na: 1\n----\nText.\n', 'four dashes');
	whole('\n---\na: 1\n---\nText.\n', 'a blank line above the block');
	whole('---\na: 1\n ---\nText.\n', 'a closing rule that is indented');
	whole('---\na: 1\n...\nText.\n', 'dots don’t close a block');
	whole('---\n', 'a rule alone');
	// with Obsidian's own reader of YAML (scenes.ts hands it over when the plugin loads), its answer is the answer
	const reads = (t: string, value: unknown) => { useYaml(() => { if (value instanceof Error) throw value; return value; }); const p = parts(t); useYaml(null); return p; };
	eq(reads('---\nfoo: [unclosed\n---\nText.\n', new Error('bad')).front, '', 'properties that can’t be read are text');
	eq(reads('---\nfoo: [unclosed\n---\nText.\n', new Error('bad')).body, '---\nfoo: [unclosed\n---\nText.\n', 'all of it');
	eq(reads('---\nLost paragraph.\n---\nText.\n', 'Lost paragraph.').front, '', 'a block that reads as a line of text is text');
	eq(reads('---\n- a\n---\nText.\n', ['a']).front, '', 'so is one that reads as a list');
	eq(reads('---\n{a: 1}\n---\nText.\n', { a: 1 }).body, 'Text.\n', 'and one that reads as properties is properties, however it is written');
	eq(reads('---\n# only a comment\n---\nText.\n', null).body, 'Text.\n', 'a block with nothing in it is asked of no one');

	// properties: one answer from parts and bodyStart, and nothing between front and body
	const props = (t: string, front: string, why: string) => { const p = parts(t); eq(p.front, front, why); eq(p.front + p.body, t, `${why}: nothing lost between them`); eq(bodyStart(t), front.length, `${why}: the text starts after them`); };
	props('---\nstatus: draft\n---\nText.\n', '---\nstatus: draft\n---\n', 'properties');
	props('---\r\nstatus: draft\r\n---\r\nText.\r\n', '---\r\nstatus: draft\r\n---\r\n', 'properties with Windows line endings');
	props('\uFEFF---\nstatus: draft\n---\nText.\n', '\uFEFF---\nstatus: draft\n---\n', 'properties after a byte-order mark');
	props('---\ntags:\n- a\n- b\nsynopsis: |\n  Two\n  lines\n---\nText.\n', '---\ntags:\n- a\n- b\nsynopsis: |\n  Two\n  lines\n---\n', 'a list and a text of several lines');
	props('---\n# a comment\n\nstatus: draft\n---\nText.\n', '---\n# a comment\n\nstatus: draft\n---\n', 'a comment and a blank line among them');
	props('---\nstatus: draft\n---', '---\nstatus: draft\n---', 'properties and nothing else');
	props('---\nstatus: draft\n---\n\nText.\n', '---\nstatus: draft\n---\n', 'the blank line after them is the text’s');
	props('---\na: 1\n---\nb: 2\n---\nText.\n', '---\na: 1\n---\n', 'they end at the first closing rule');
	// (Obsidian closes a block at the first line that starts with three dashes, whatever follows on that line)
	props('---\na: 1\n---  \nText.\n', '---\na: 1\n---  \n', 'spaces after the closing rule go with it');
	props('---\na: 1\n-----\nText.\n', '---\na: 1\n---', 'more after the closing rule on its line is text');
	// a block that holds nothing (Obsidian hides it, as it does properties): nothing of the writer's is in it
	props('---\n---\nFirst.\n\n---\n\nSecond.\n', '---\n---\n', 'an empty block, with a rule further down');
	props('---\n\n---\nText.\n', '---\n\n---\n', 'a block of blank lines');
	props('---\n# only a comment\n---\nText.\n', '---\n# only a comment\n---\n', 'a block of comments');
	eq(parts('---\nstatus: draft\n---\nText.\n').yaml, 'status: draft', 'what the block says, without its rules');
	eq(parts(RULE).yaml, '', 'and nothing for a note without properties');

	// a block that is text is said to be, so that nothing writes properties over it
	ok(blockIsText(RULE), 'a rule, a paragraph, a rule: a block that is text');
	ok(blockIsText('---\n- a\n---\nText.\n'), 'a list between two rules: text');
	ok(!blockIsText('---\nstatus: draft\n---\nText.\n'), 'properties aren’t');
	ok(!blockIsText('---\n---\nText.\n') && !blockIsText('---\n# c\n---\n'), 'nor is a block with nothing in it');
	ok(!blockIsText('---\n\nA rule at the top, and no other.\n') && !blockIsText('Text.\n') && !blockIsText(''), 'nor a note that opens with no block at all');

	// shown by Obsidian's renderer, a text that opens with a rule must not be taken for properties again
	eq(forRender(RULE), '\n' + RULE, 'a text that opens with a rule is rendered from a blank line');
	eq(forRender('---\nstatus: draft\n---\nText.\n'), '\n---\nstatus: draft\n---\nText.\n', 'so nothing in it reads as properties, whatever is between its rules');
	eq(forRender('Text.\n\n---\n'), 'Text.\n\n---\n', 'any other text is rendered as it is');

	// every caller in this file follows: a split, a synopsis
	eq(splitAt(RULE, 5)?.tail, 'Lost paragraph.\n\n---\n\nKept.\n', 'a note that opens with a rule can be split in its first paragraph');
	eq(synopsisFrom(RULE), 'Lost paragraph.', 'and its synopsis is its first paragraph');
	eq(synopsisFrom('---\nsynopsis: x\n---\n---\n\nOpening.\n'), 'Opening.', 'after real properties, a rule is skipped as a rule');
}

// comments are taken out; code is never touched
{
	eq(stripComments('A %%note%% b <!-- c --> d'), 'A  b  d', 'both kinds of comment go');
	eq(stripComments('Use `a %% b %% c` here %%x%%.'), 'Use `a %% b %% c` here .', 'inline code keeps its marks');
	eq(stripComments('```md\n%% kept %%\n<!-- kept -->\n```\nAfter %%gone%%.'), '```md\n%% kept %%\n<!-- kept -->\n```\nAfter .', 'so does a fenced block');
	eq(stripComments('~~~\n%% kept %%\n~~~\n%%gone%%'), '~~~\n%% kept %%\n~~~\n', 'a tilde fence too');
	eq(stripComments('```\n%% an open fence runs to the end %%'), '```\n%% an open fence runs to the end %%', 'and one that’s never closed');
	eq(stripComments('%%\nseveral\nlines\n%%\nText'), '\nText', 'a comment over several lines');
}

// a split keeps the indent of the line it starts at; mid-line, the space before the next word goes
{
	eq(tidyTail('    code\n    more\n', false), '    code\n    more\n', 'an indented block split off at its first line keeps its indent');
	eq(tidyTail('\n\n    - nested\n', false), '    - nested\n', 'and after blank lines');
	eq(tidyTail(' and then she left.\n'), 'and then she left.\n', 'mid-line: no space before the first word');
	eq(tidyTail('\n\n  Indented after a blank line.\n'), '  Indented after a blank line.\n', 'a new line’s indent stays even when the split was mid-line before it');
}

// a cut never ends in half a character
{
	const s = synopsisFrom('a' + '😀'.repeat(300));
	ok(!/[\ud800-\udbff]$/.test(s.replace(/…$/, '')) && !/[\ud800-\udbff](?![\udc00-\udfff])/.test(s), 'a synopsis cut in a run of emoji ends on a whole one');
	const t = titleFrom('😀'.repeat(200));
	ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(t) && Array.from(t).length <= 80, 'and so does a title');
}

// a synopsis is plain words
{
	eq(synopsisFrom('> [!note] A title\n> The quoted body line.'), 'A title The quoted body line.', 'a callout: its title and words, without its marks');
	eq(synopsisFrom('> quoted one\n> quoted two'), 'quoted one quoted two', 'a quote without its marks');
	eq(synopsisFrom('A claim.[^1] And more.^[an aside]\n\n[^1]: The source.'), 'A claim. And more.', 'footnote marks go');
	eq(synopsisFrom('| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter the table.'), 'After the table.', 'a table isn’t a synopsis');
	eq(synopsisFrom('```js\nconst a = 1;\n```\n\nThen the scene starts.'), 'Then the scene starts.', 'nor is code');
	eq(synopsisFrom('[^1]: Only a footnote.'), '', 'a footnote’s own text isn’t the scene');
}

// links pointed at another note: the part, the shown text and the kind of link stay
{
	const to = (from: string, next: string) => (path: string) => (path === from ? next : null);
	eq(repointLinks('See [[Storm warning]] and [[Storm warning#Part|the storm]], not [[Arrival]].', to('Storm warning', 'Arrival')), 'See [[Arrival]] and [[Arrival#Part|the storm]], not [[Arrival]].', 'wikilinks');
	eq(repointLinks('![[Storm warning#^blk]]', to('Storm warning', 'Arrival')), '![[Arrival#^blk]]', 'an embed stays an embed');
	eq(repointLinks('| [[Storm warning\\|the storm]] | [[Storm warning#Part\\|its part]] | ![[Storm warning\\|200]] |', to('Storm warning', 'Arrival')), '| [[Arrival\\|the storm]] | [[Arrival#Part\\|its part]] | ![[Arrival\\|200]] |', 'in a table, where the bar is written with a backslash');
	eq(repointLinks('[the storm](Storm%20warning.md#Part) and [site](https://example.com/Storm%20warning.md)', to('Storm warning', 'Part One/Arrival')), '[the storm](Part%20One/Arrival.md#Part) and [site](https://example.com/Storm%20warning.md)', 'a Markdown link, encoded; a web address is left alone');
	eq(repointLinks('[x](<Storm warning.md>)', to('Storm warning', 'Arrival (new)')), '[x](<Arrival (new).md>)', 'an angled Markdown link');
	eq(repointLinks('`[[Storm warning]]`\n\n```\n[[Storm warning]]\n```\n[[Storm warning]]', to('Storm warning', 'Arrival')), '`[[Storm warning]]`\n\n```\n[[Storm warning]]\n```\n[[Arrival]]', 'links in code are text');
	eq(repointLinks('[[The keeper#The stair]] [[The keeper#Other]] [[The keeper]]', (path, sub) => (path === 'The keeper' && sub === '#The stair' ? 'The keeper 2' : null)), '[[The keeper 2#The stair]] [[The keeper#Other]] [[The keeper]]', 'only the links whose part moved');
	const t = linkTargets('# The Stair\n\nText ^blk1\n\n```\n# not a heading\n```\n## Sub: one\nLast line ^B-2');
	ok(pointsAt('#The stair', t) && pointsAt('#the stair#Sub', t) && pointsAt('#Sub one', t), 'a link’s part finds its heading, whatever its case');
	ok(pointsAt('#^blk1', t) && pointsAt('#^b-2', t), 'and its block');
	ok(!pointsAt('#not a heading', t) && !pointsAt('', t) && !pointsAt('#^nope', t), 'not a heading in code, nor nothing');
}

// footnotes with a label an earlier note used get one of their own
{
	const used = new Set<string>();
	eq(uniqueFootnotes('One.[^1]\n\n[^1]: First.', used), 'One.[^1]\n\n[^1]: First.', 'the first note keeps its labels');
	eq(uniqueFootnotes('Two.[^1] And.[^n]\n\n[^1]: Second.\n[^n]: Note.', used), 'Two.[^1-2] And.[^n]\n\n[^1-2]: Second.\n[^n]: Note.', 'the second note’s clash is renamed, mark and footnote both');
	eq(uniqueFootnotes('`[^1]` stays.[^1]\n\n[^1]: Third.', used), '`[^1]` stays.[^1-3]\n\n[^1-3]: Third.', 'a label in code is text');
}

// compiling
{
	const items: CompileItem[] = [
		{ kind: 'scene', name: 'Prologue', depth: 0, text: 'The light.\n' },
		{ kind: 'folder', name: 'Part One', depth: 0 },
		{ kind: 'scene', name: 'Arrival', depth: 1, text: 'The boat. %%check the tide%%\n\n' },
		{ kind: 'scene', name: 'The keeper', depth: 1, text: '\n\nHe met her.\n' },
		{ kind: 'scene', name: 'Empty', depth: 1, text: '' },
		{ kind: 'folder', name: 'Inner', depth: 1 },
		{ kind: 'scene', name: 'Deep', depth: 2, text: 'Deep text.' },
		{ kind: 'scene', name: 'Epilogue', depth: 0, text: 'Later.' },
	];
	eq(compile('The Lighthouse', items, COMPILE_DEFAULTS),
		'# The Lighthouse\n\nThe light.\n\n## Part One\n\nThe boat.\n\n* * *\n\nHe met her.\n\n### Inner\n\nDeep text.\n\n* * *\n\nLater.\n',
		'the title, folders as headings by depth, a separator between scenes that follow each other, properties, comments and empty notes left out');
	eq(compile('T', items.slice(0, 1), { ...COMPILE_DEFAULTS, title: false }), 'The light.\n', 'without the title');
	eq(compile('T', items.slice(1, 4), { ...COMPILE_DEFAULTS, title: false, separator: '', stripComments: false }), '# Part One\n\nThe boat. %%check the tide%%\n\nHe met her.\n', 'no separator: a blank line; comments kept when asked');
	eq(compile('T', items.slice(1, 4), { ...COMPILE_DEFAULTS, sceneHeadings: true }), '# T\n\n## Part One\n\n### Arrival\n\nThe boat.\n\n### The keeper\n\nHe met her.\n', 'scene names as headings under their folder’s');
	eq(compile('T', items.slice(1, 4), { ...COMPILE_DEFAULTS, folderHeadings: false, title: false }), 'The boat.\n\n* * *\n\nHe met her.\n', 'without folder headings the scenes just follow');
	eq(compile('T', [], COMPILE_DEFAULTS), '# T\n', 'an empty binder is its title');
	eq(compile('T', [], { ...COMPILE_DEFAULTS, title: false }), '', 'or nothing');
	eq(compile('T', [{ kind: 'scene', name: 'A', depth: 0, text: '---\n\nA rule opens this text.\n\n```\n%% code %%\n```\n%%gone%%' }], { ...COMPILE_DEFAULTS, title: false }), '---\n\nA rule opens this text.\n\n```\n%% code %%\n```\n', 'a text is compiled as given: a rule at its top stays, code keeps its marks');
}

// where the text starts (what the manuscript and focus mode count a cursor's place from)
{
	eq(bodyStart(NOTE), parts(NOTE).front.length, 'after the properties');
	eq(bodyStart('No properties here.'), 0, 'a note without properties');
	eq(bodyStart('---\nnot closed\ntext'), 0, 'an unclosed block is text');
	eq(bodyStart('---\r\na: 1\r\n---\r\nText'), 16, 'Windows line endings');
	eq(bodyStart('---\na: 1\n---'), 12, 'properties only');
	eq(bodyStart('---\n---\nText'), 8, 'an empty block');
}

// a cursor's place in a text that changed while its editor was away: nothing typed after lands in the wrong place
{
	const was = 'The boat left.';
	eq(moved(was, was, 9), 9, 'the same text: the same place');
	// a stretch put in before it, after it, and right at it
	const more = 'The old boat left.';
	eq(moved(was, more, 9), 13, 'text put in before it: it moves along');
	eq(more.slice(13), was.slice(9), 'and what follows it is what followed it');
	eq(moved(was, more, 2), 2, 'text put in after it: it stays');
	eq(moved(was, more, 4), 4, 'right where text was put in: before what was put in');
	eq(moved(was, 'The boat left. She waved.', 14), 14, 'text added at the end, the cursor at the end: it stays where it was');
	eq(moved(was, 'Then: The boat left.', 0), 0, 'text added at the start, the cursor at the start: it stays');
	eq(moved(was, 'Then: The boat left.', 4), 10, 'text added at the start: it moves along');
	// a stretch taken out
	eq(moved(more, was, 12), 8, 'text taken out before it: it moves back');
	eq(moved(more, was, 6), 4, 'the text it was in taken out: where that text was');
	eq(moved(more, was, 3), 3, 'text taken out after it: it stays');
	// a stretch changed for another
	eq(moved('one two three', 'one 2 three', 5), 5, 'in a word that was changed: after what it was changed to');
	eq(moved('one two three', 'one 2 three', 10), 8, 'after the change: it moves along');
	eq('one 2 three'.slice(8), 'one two three'.slice(10), 'to before the same letters');
	eq(moved('one two three', 'one twenty-two three', 13), 20, 'at the end: still at the end');
	// everything gone, everything new
	eq(moved('abc', '', 2), 0, 'the text emptied: the start');
	eq(moved('', 'abc', 0), 0, 'an empty text filled: the start');
	// never outside the text, wherever it was
	for (const [a, b] of [['abc', 'abXc'], ['abXc', 'abc'], ['aaaa', 'aa'], ['aa', 'aaaa'], ['abc', 'xyz'], ['', 'x'], ['x', '']]) {
		for (let p = 0; p <= a.length; p++) { const q = moved(a, b, p); ok(q >= 0 && q <= b.length, `${JSON.stringify(a)} to ${JSON.stringify(b)}, from ${p}: inside the text (${q})`); }
	}
}

done('scene text');
