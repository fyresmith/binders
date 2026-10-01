import { COMPILE_DEFAULTS, compile, joinBodies, linkTargets, nextName, parts, pointsAt, repointLinks, splitAt, stripComments, synopsisFrom, tidyHead, tidyTail, titleFrom, uniqueFootnotes, type CompileItem } from '../src/scene-text';
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

done('scene text');
