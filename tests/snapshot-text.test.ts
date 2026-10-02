import { SNAPSHOT_EXT, SNAPSHOTS, badSnapshotName, compare, readSnapshot, readSnapshotName, reworded, snapshotFile, snapshotName, stamp, type Piece, type Row } from '../src/snapshot-text';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const at = new Date(2026, 9, 1, 14, 32, 7);

// what a snapshot's file is called
{
	eq(SNAPSHOTS, 'Snapshots', 'the folder');
	eq(SNAPSHOT_EXT, 'snapshot', 'the extension: not one Obsidian takes for a note');
	const free = () => false;
	eq(snapshotName(at, '', free), '2026-10-01 14.32.07', 'the time it was taken, to the second');
	eq(snapshotName(at, 'First draft', free), '2026-10-01 14.32.07 First draft', 'then its name');
	eq(snapshotName(new Date(2026, 0, 5, 9, 5, 3), '', free), '2026-01-05 09.05.03', 'padded, so names sort by time');
	const taken = new Set(['2026-10-01 14.32.07', '2026-10-01 14.32.07 (2)']);
	eq(snapshotName(at, '', (n) => taken.has(n)), '2026-10-01 14.32.07 (3)', 'a name that’s taken counts on, never over a file');
	const names = [snapshotName(new Date(2026, 9, 1, 9, 0, 0), 'b', free), snapshotName(new Date(2026, 8, 30, 23, 59, 59), 'z', free), snapshotName(new Date(2026, 9, 1, 10, 0, 0), 'a', free)];
	eq(j([...names].sort()), j([names[1], names[0], names[2]]), 'sorted by name is sorted by time');
}

// and read back
{
	const r = readSnapshotName('2026-10-01 14.32.07 First draft');
	ok(!!r && r.when.getTime() === at.getTime() && r.title === 'First draft', 'time and name');
	eq(readSnapshotName('2026-10-01 14.32.07')?.title, '', 'no name');
	// the count that keeps two snapshots of one second apart isn't part of a name; a number the writer typed in brackets
	// is. They're told apart by the snapshot beside it: a count is only ever added to a name that's taken
	const beside = (...names: string[]) => (n: string) => names.includes(n);
	eq(readSnapshotName('2026-10-01 14.32.07 (2)', beside('2026-10-01 14.32.07'))?.title, '', 'a count isn’t a name');
	eq(readSnapshotName('2026-10-01 14.32.07 Draft (2)', beside('2026-10-01 14.32.07 Draft'))?.title, 'Draft', 'a count after a name isn’t part of it');
	eq(readSnapshotName('2026-10-01 14.32.07 Draft (3)', beside('2026-10-01 14.32.07 Draft', '2026-10-01 14.32.07 Draft (2)'))?.title, 'Draft', 'nor is the next count');
	eq(readSnapshotName('2026-10-01 14.32.07 Final draft (3)', beside('2026-10-01 14.32.07 Final draft (3)'))?.title, 'Final draft (3)', 'a name that ends in a number in brackets is the name as typed');
	eq(readSnapshotName('2026-10-01 14.32.07 Final draft (3)', beside('2026-10-01 14.32.08 Final draft'))?.title, 'Final draft (3)', 'a snapshot of that name taken at another time doesn’t make it a count');
	eq(readSnapshotName('2026-10-01 14.32.07 Final draft (3)')?.title, 'Final draft (3)', 'and with nothing known of the snapshots beside it, the name is as written');
	eq(readSnapshotName('2026-10-01 14.32.07 (1987)', beside())?.title, '(1987)', 'a name that is only a number in brackets');
	eq(readSnapshotName('2026-10-01 14.32.07 Draft (1)', beside('2026-10-01 14.32.07 Draft'))?.title, 'Draft (1)', 'counts start at two: a one is the writer’s');
	eq(readSnapshotName('2026-10-01 14.32.07 Draft (2) (2)', beside('2026-10-01 14.32.07 Draft (2)'))?.title, 'Draft (2)', 'a count after a name that ends in brackets');
	{
		// what `snapshotName` makes reads back as the name given, whatever the name
		const there = new Set<string>();
		for (const title of ['Draft', 'Draft', 'Draft (2)', 'Draft', '', '', 'Final draft (3)']) {
			const name = snapshotName(at, title, (n) => there.has(n));
			there.add(name);
			eq(readSnapshotName(name, (n) => there.has(n))?.title, title, `“${title}”, kept as “${name}”, reads back as given`);
		}
	}
	eq(readSnapshotName('2026-10-01 14.32.07 Before bringing back')?.title, 'Before bringing back', 'the name Binders gives');
	eq(readSnapshotName('old ending'), null, 'a file named by hand has no time in its name');
	eq(readSnapshotName('2026-13-45 14.32.07'), null, 'nor one whose date isn’t a date');
	eq(readSnapshotName('2026-10-01 25.61.07'), null, 'nor a time that isn’t one');
	eq(readSnapshotName('2026-10-01 1432 First draft'), null, 'nor another spelling');
	for (const title of ['', 'First draft', 'Draft (final) 2', 'né à Paris']) {
		const back = readSnapshotName(snapshotName(at, title, () => false));
		ok(back?.title === title && back.when.getTime() === at.getTime(), `“${title}” reads back as written`);
	}
	eq(stamp(at), '2026-10-01T14:32:07', 'the property: local time, as Obsidian writes one');
}

// names that can't be part of a file's name
{
	eq(badSnapshotName('First draft'), null, 'plain words');
	eq(badSnapshotName('Draft, sent to Sam (2)'), null, 'commas and brackets');
	ok(!!badSnapshotName('a/b') && !!badSnapshotName('what?') && !!badSnapshotName('a:b') && !!badSnapshotName('a\\b') && !!badSnapshotName('"x"') && !!badSnapshotName('a|b') && !!badSnapshotName('a*') && !!badSnapshotName('<a>'), 'characters a file name can’t have');
	ok(!!badSnapshotName('x'.repeat(121)), 'too long');
}

// the file itself: two properties, then the text exactly
{
	const body = 'The boat left.\n\nShe watched it go.\n';
	const text = snapshotFile('Part One/Arrival', at, body);
	eq(text, '---\nsnapshot-of: "Part One/Arrival"\ntaken: 2026-10-01T14:32:07\n---\n' + body, 'as written');
	const r = readSnapshot(text);
	eq(r.body, body, 'the text reads back byte for byte');
	eq(r.of, 'Part One/Arrival', 'what it’s of');
	eq(r.taken, at.getTime(), 'when');
	for (const b of ['', '\n', 'no line break at the end', 'line\r\nbreaks\r\nof Windows\r\n', '---\nlooks: like properties\n---\nbut is the text\n', '---\n', '\n\n  leading space kept', 'ends in spaces   \n\n\n', '%% a comment %%\n# A heading\n[[A link]] #tag\n']) {
		eq(readSnapshot(snapshotFile('A', at, b)).body, b, `text ${j(b.slice(0, 24))} reads back byte for byte`);
	}
	eq(readSnapshot(snapshotFile('A "quoted" name: with a colon', at, 'x')).of, 'A "quoted" name: with a colon', 'a name with quotes and a colon');
	eq(readSnapshot(snapshotFile('Ünïcödé/名前', at, 'x')).of, 'Ünïcödé/名前', 'any letters');
	// a file without the properties (made by hand, or by another tool) is all text
	eq(j(readSnapshot('Just some text.\n')), j({ body: 'Just some text.\n', of: null, taken: null }), 'no properties: all text');
	eq(readSnapshot('---\nstatus: draft\n---\nText\n').body, '---\nstatus: draft\n---\nText\n', 'other properties aren’t ours: all text');
	eq(readSnapshot('---\r\nsnapshot-of: A\r\ntaken: 2026-10-01T14:32:07\r\n---\r\nText\r\n').body, 'Text\r\n', 'Windows line breaks in the properties');
	eq(readSnapshot('---\nsnapshot-of: A\n---\nText').taken, null, 'no time: none');
	eq(readSnapshot('---\nsnapshot-of: A\ntaken: yesterday\n---\nText').taken, null, 'a time that isn’t one: none');
}

// comparing two texts as prose
const show = (rows: Row[]) => rows.map((r) => (r.kind === 'same' ? '=' : r.kind === 'old' ? '-' : '+') + r.pieces.map((p) => (p.changed ? `[${p.text}]` : p.text)).join('')).join('\n');
{
	eq(show(compare('One.\n\nTwo.\n', 'One.\n\nTwo.\n')), '=One.\n=Two.', 'the same text: every paragraph the same');
	eq(show(compare('', '')), '', 'nothing and nothing');
	eq(show(compare('One.\n', '')), '-One.', 'everything taken out');
	eq(show(compare('', 'One.\n')), '+One.', 'everything put in');
	eq(show(compare('One.\n\nTwo.\n', 'One.\n\nNew.\n\nTwo.\n')), '=One.\n+New.\n=Two.', 'a paragraph put in');
	eq(show(compare('One.\n\nGone.\n\nTwo.\n', 'One.\n\nTwo.\n')), '=One.\n-Gone.\n=Two.', 'a paragraph taken out');
	eq(show(compare('One.\r\n\r\nTwo.\r\n', 'One.\n\nTwo.\n')), '=One.\n=Two.', 'line breaks of either kind are the same');
	eq(show(compare('One.\n\n\n\nTwo.', 'One.\nTwo.')), '=One.\n=Two.', 'blank lines aren’t paragraphs');
	// a paragraph reworded: the words that changed are marked, on both sides, the space after them left out
	eq(show(compare('The boat left Mara on the jetty. It was raining. She did not wave.', 'The boat left Mara on the jetty. She did not wave.')),
		'-The boat left Mara on the jetty. [It was raining.] She did not wave.\n+The boat left Mara on the jetty. She did not wave.', 'words taken out');
	eq(show(compare('The island was smaller than she had imagined.', 'The island was smaller than the chart had promised.')),
		'-The island was smaller than [she] had [imagined.]\n+The island was smaller than [the chart] had [promised.]', 'words changed');
	// a paragraph with too little in common isn't one reworded: taken out and put in, whole, nothing marked
	eq(show(compare('The keeper was waiting at the door of the cottage, an old man in a heavy coat.', 'She found the door open and nobody inside, and a net half mended on the table.')),
		'-The keeper was waiting at the door of the cottage, an old man in a heavy coat.\n+She found the door open and nobody inside, and a net half mended on the table.', 'a paragraph replaced isn’t marked word by word');
	// which old paragraph became which new one: the pairing with the most in common, not the first that comes
	const before = 'She picked up the cases and started up the path, and halfway up she stopped to get her breath.\n\nThe keeper was waiting.';
	const after = 'She had been told there would be someone to meet her.\n\nShe picked up the cases and started up the path, and halfway she stopped for breath.\n\nThe keeper was waiting.';
	const rows = compare(before, after);
	eq(rows.map((r) => r.kind).join(' '), 'new old new same', 'a paragraph put in before one that was reworded');
	ok(rows[0].pieces.length === 1 && !rows[0].pieces[0].changed, 'the new paragraph is whole');
	ok(rows[1].pieces.some((p) => p.changed) && rows[2].pieces.some((p) => p.changed), 'the reworded one is marked on both sides');
	// nothing is lost in the showing: each side's rows, put together, are that side's paragraphs
	const side = (kind: 'old' | 'new') => rows.filter((r) => r.kind === kind || r.kind === 'same').map((r) => r.pieces.map((p) => p.text).join(''));
	eq(j(side('old')), j(before.split('\n').filter((l) => l.trim())), 'the old side is the old text');
	eq(j(side('new')), j(after.split('\n').filter((l) => l.trim())), 'the new side is the new text');
}

// long texts: still every paragraph, in order, on both sides
{
	const para = (i: number) => `Paragraph ${i} of the scene, with enough words in it to be a sentence or two of prose.`;
	const a = Array.from({ length: 400 }, (_, i) => para(i)), b = a.filter((_, i) => i % 7 !== 3).map((p, i) => (i % 11 === 5 ? p.replace('enough', 'more than enough') : p));
	b.splice(100, 0, 'A paragraph that is new.');
	const rows = compare(a.join('\n\n'), b.join('\n\n'));
	const text = (kind: 'old' | 'new') => rows.filter((r) => r.kind === kind || r.kind === 'same').map((r) => r.pieces.map((p) => p.text).join(''));
	eq(j(text('old')), j(a), '400 paragraphs: the old side whole');
	eq(j(text('new')), j(b), 'and the new');
	ok(rows.filter((r) => r.kind === 'same').length > 250, 'most of it is the same');
	// a scene replaced by another altogether, too long to compare word by word: both whole
	const x = Array.from({ length: 30 }, (_, i) => `Old ${i} ${'word '.repeat(40)}`), y = Array.from({ length: 30 }, (_, i) => `New ${i} ${'other '.repeat(40)}`);
	const all = compare(x.join('\n'), y.join('\n'));
	eq(all.filter((r) => r.kind === 'old').length + ' ' + all.filter((r) => r.kind === 'new').length, '30 30', 'a scene replaced: every paragraph out, every paragraph in');
}

// a very long note (a whole manuscript kept as one): what's the same is found whatever its length
{
	const line = (i: number) => `Line ${i} of a very long note.`;
	const a = Array.from({ length: 3000 }, (_, i) => line(i));
	const kinds = (rows: Row[]) => { const n = { same: 0, old: 0, new: 0 }; for (const r of rows) n[r.kind]++; return `${n.same} ${n.old} ${n.new}`; };
	const sides = (rows: Row[], kind: 'old' | 'new') => rows.filter((r) => r.kind === kind || r.kind === 'same').map((r) => r.pieces.map((p) => p.text).join(''));
	// one line reworded
	const one = a.map((l, i) => (i === 1500 ? l.replace('very', 'really very') : l));
	const t0 = Date.now(), rows = compare(a.join('\n\n'), one.join('\n\n'));
	eq(kinds(rows), '2999 1 1', '3,000 paragraphs, one reworded: that one is marked, the rest are the same');
	eq(show(rows.filter((r) => r.kind !== 'same')), '-Line 1500 of a very long note.\n+Line 1500 of a [really] very long note.', 'word by word');
	// changes at both ends and in between, lines put in and taken out, and a line that's there many times over
	const b = a.filter((_, i) => i !== 700 && i !== 2998).map((l, i) => (i === 2 || i === 2200 ? l + ' More.' : l));
	b.splice(1200, 0, ...Array.from({ length: 12 }, (_, i) => `A new line ${i}.`));
	const starred = (list: string[]) => list.flatMap((l, i) => (i % 50 === 49 ? [l, '* * *'] : [l]));
	const x = starred(a), y = starred(b), far = compare(x.join('\n'), y.join('\n'));
	eq(j(sides(far, 'old')), j(x), 'changes all through a long note: the old side is the old text, whole and in order');
	eq(j(sides(far, 'new')), j(y), 'and the new side the new');
	const marked = far.filter((r) => r.kind !== 'same').map((r) => r.pieces.map((p) => p.text).join(''));
	ok(far.filter((r) => r.kind === 'same').length >= a.length - 4, `and nearly all of it is the same (${kinds(far)})`);
	ok(marked.filter((l) => l !== '* * *').length === 18 && [line(700), line(2998), line(2), line(2201), 'A new line 0.', 'A new line 11.'].every((l) => marked.includes(l)), `only what changed is marked (and separators that fall elsewhere): two lines out, two reworded, twelve in (${kinds(far)})`);
	// two long texts with nothing in common: every paragraph out, every paragraph in, and no long wait
	const other = Array.from({ length: 3000 }, (_, i) => `Another text altogether, ${i}.`);
	eq(kinds(compare(a.join('\n'), other.join('\n'))), '0 3000 3000', 'nothing in common: all out, all in');
	// one paragraph of thousands of words with a word changed in the middle
	const words = Array.from({ length: 4000 }, (_, i) => `w${i}`), changed = words.map((w, i) => (i === 2000 ? 'CHANGED' : w));
	eq(show(compare(words.join(' '), changed.join(' '))).replace(/w\d+ /g, '').replace(/ w\d+/g, ''), '-[w2000]\n+[CHANGED]', 'a very long paragraph: the word that changed is found');
	ok(Date.now() - t0 < 5000, `and none of it takes long (${Date.now() - t0} ms)`);
}

// a reworded paragraph, as one paragraph: what was taken out, then what was put in, where they fall in the sentence
{
	const same = (text: string): Piece => ({ text, changed: false }), diff = (text: string): Piece => ({ text, changed: true });
	const said = (old: Piece[], now: Piece[]) => reworded(old, now).map((x) => (x.kind === 'same' ? x.words.join(' ') : `${x.kind === 'old' ? '-' : '+'}[${x.words.join(' ')}]`)).join(' ');
	eq(said([same('The '), diff('grey'), same(' sea was calm.')], [same('The '), diff('green'), same(' sea was calm.')]), 'The -[grey] +[green] sea was calm.', 'a word changed: out, then in, where it stood');
	eq(said([same('One '), diff('two '), same('three')], [same('One three')]), 'One -[two] three', 'a word taken out');
	eq(said([same('One three')], [same('One '), diff('two '), same('three')]), 'One +[two] three', 'a word put in');
	eq(said([diff('Before. '), same('The end.')], [same('The end.')]), '-[Before.] The end.', 'at the start');
	eq(said([same('The end.')], [same('The end.'), diff(' And after.')]), 'The end. +[And after.]', 'at the end');
	// a lone word left standing between two rewordings goes into both: one phrase, not a scatter of single words
	eq(said([same('She '), diff('walked slowly'), same(' to '), diff('the shore.')], [same('She '), diff('ran'), same(' to '), diff('a boat.')]), 'She -[walked slowly to the shore.] +[ran to a boat.]', 'one word between two rewordings: one phrase');
	eq(said([same('A '), diff('b'), same(' c d '), diff('e')], [same('A '), diff('x'), same(' c d '), diff('y')]), 'A -[b] +[x] c d -[e] +[y]', 'two words between them: two changes');
	eq(said([same('A '), diff('b'), same(' c '), same('d')], [same('A '), same('c '), diff('x '), same('d')]), 'A -[b] c +[x] d', 'a word between a taking out and a putting in stays between them');
	// every word of both texts is there, in order, whatever the pieces
	const words = (ps: Piece[]) => ps.flatMap((p) => p.text.match(/\S+/g) ?? []);
	for (const [a, b] of [['The grey sea was calm.', 'The green sea was calm.'], ['She walked slowly to the shore and sat.', 'She ran to a boat and sat down.'], ['One two three four five six.', 'One three five seven.']] as const) {
		const rows = compare(a, b);
		eq(rows.map((r) => r.kind).join(' '), 'old new', `“${a}” reworded: its old self, then its new`);
		const out = reworded(rows[0].pieces, rows[1].pieces);
		eq(j(out.filter((x) => x.kind !== 'new').flatMap((x) => x.words)), j(words(rows[0].pieces)), 'the old words, all of them, in order');
		eq(j(out.filter((x) => x.kind !== 'old').flatMap((x) => x.words)), j(words(rows[1].pieces)), 'and the new');
		eq(j(words(rows[0].pieces)), j(a.split(' ')), '(which are the snapshot’s words');
		eq(j(words(rows[1].pieces)), j(b.split(' ')), 'and the note’s)');
	}
	eq(said(compare('The grey sea was calm.', 'The green sea was calm.')[0].pieces, compare('The grey sea was calm.', 'The green sea was calm.')[1].pieces), 'The -[grey] +[green] sea was calm.', 'as “Show changes” has it, from the two texts');
}

done('snapshot text');
