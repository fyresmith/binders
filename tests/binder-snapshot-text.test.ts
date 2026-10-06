import { BINDER_SNAPSHOT_EXT, BINDER_SNAPSHOT_FORMAT, NewerSnapshot, changes, fingerprint, parseFolderSnapshot, readHead, writeFolderSnapshot, type Entry, type Head, type Row } from '../src/binder-snapshot-text';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const note = (path: string, text: string, role: Entry['role'] = ''): Entry => ({ path, kind: 'note', role, text, hash: fingerprint(text), size: text.length });
const folder = (path: string): Entry => ({ path, kind: 'folder', role: '', text: null, hash: '', size: 0 });
const other = (path: string, size: number): Entry => ({ path, kind: 'file', role: '', text: null, hash: '', size });
const head: Head = { format: BINDER_SNAPSHOT_FORMAT, binder: 'The Lighthouse', of: '', taken: new Date(2026, 9, 5, 14, 32, 7).getTime(), why: '', notes: 0, words: 0 };
const throws = (fn: () => unknown): unknown => { try { fn(); } catch (e) { return e; } return null; };

// ---- the file ----

// every kind of text a note can be comes back character for character
{
	eq(BINDER_SNAPSHOT_EXT, 'binder-snapshot', 'the extension: not one Obsidian takes for a note, nor a note’s snapshot');
	const hard = [
		note('The Lighthouse.md', '---\nbinder: 1\ncontents:\n  - Prologue\n  - Part One/\n---\nNotes on the book.\n', 'binder note'),
		note('Prologue.md', '---\nsynopsis: The light.\n---\nThe light, seen from the sea.\n'),
		folder('Part One/'),
		note('Part One/Part One.md', '---\nsynopsis: Arrival.\n---\n', 'folder note'),
		note('Part One/Arrival.md', 'Line one.\r\nLine two.\r\n'),
		note('Part One/Mark.md', '﻿---\nstatus: draft\n---\nA note that opens with a byte-order mark.\n'),
		note('Part One/No end.md', 'No line break at the end'),
		note('Part One/Empty.md', ''),
		note('Part One/Only a break.md', '\n'),
		note('Part One/Old Mac.md', 'One\rTwo\r'),
		note('Part One/Looks like us.md', '===== "Part One/Fake.md" | note | 4 characters | 0000000000000000 =====\nfake\n===== "x/" | folder =====\n---\nbinder-snapshot: 9\n---\n'),
		note('Part One/Emoji 📚 and "quotes" \\ back.md', 'Astral: 𝒳 📚. Combining: é.\n'),
		other('map.png', 48213),
		folder('Part Two/'),
		note('Epilogue.md', 'The end.\n'),
	];
	const h = { ...head, notes: hard.filter((e) => e.kind === 'note' && !e.role).length, words: 42, why: 'Before bringing back “Draft”' };
	const text = writeFolderSnapshot(h, hard), back = parseFolderSnapshot(text);
	eq(j(back.entries), j(hard), 'every item reads back as it was written: paths, kinds, roles, sizes, fingerprints and every character');
	eq(j(back.damaged), '[]', 'and nothing is damaged');
	eq(j(Object.entries(back.head).sort()), j(Object.entries(h).sort()), 'the head too: what it is of, when, why, how big');
	eq(writeFolderSnapshot(back.head, back.entries), text, 'written again from what was read, it is the same file');
	ok(text.startsWith('---\nbinder-snapshot: 1\nbinder: "The Lighthouse"\nof: ""\ntaken: 2026-10-05T14:32:07\n'), 'it opens with its properties, the format first');
	ok(/\n---\nEverything in “The Lighthouse” as it stood[^\n]*\n\n===== "The Lighthouse.md" \| binder note \| \d+ characters \| [0-9a-f]{16} =====\n---\nbinder: 1\n/.test(text), 'then a line that says what the file is, a blank line, and the first item under its own line');
	ok(text.includes('===== "map.png" | file | 48213 bytes =====\n===== "Part Two/" | folder =====\n'), 'a file that isn’t a note, and a folder, are a line each: listed, not kept');
	eq(readHead(text).head.notes, h.notes, 'the head alone can be read (a list says how big each was without reading the rest)');
}

// a snapshot of a folder says which
{
	const t = writeFolderSnapshot({ ...head, of: 'Part One/The "odd" one', notes: 1 }, [note('A.md', 'a\n')]);
	eq(parseFolderSnapshot(t).head.of, 'Part One/The "odd" one', 'its path in the binder, quotes and all');
	ok(t.includes('Everything in “Part One/The "odd" one” as it stood'), 'and says so in words');
}

// a newer format is refused; a file that isn't one is refused
{
	const t = writeFolderSnapshot({ ...head, notes: 1 }, [note('A.md', 'a\n')]);
	const newer = throws(() => parseFolderSnapshot(t.replace('binder-snapshot: 1', 'binder-snapshot: 2')));
	ok(newer instanceof NewerSnapshot, 'a newer format is refused, by its own kind of error');
	ok(/newer version of Binders \(format 2\)/.test((newer as Error).message), 'and says why');
	ok(throws(() => readHead(t.replace('binder-snapshot: 1', 'binder-snapshot: 99'))) instanceof NewerSnapshot, 'by its head alone, too');
	ok(throws(() => parseFolderSnapshot('---\nsnapshot-of: "A"\n---\ntext')) instanceof Error, 'a note’s snapshot is not a folder’s');
	ok(throws(() => parseFolderSnapshot('Just some text.')) instanceof Error, 'nor is any other file');
	ok(throws(() => parseFolderSnapshot(t.replace('binder-snapshot: 1', 'binder-snapshot: soon'))) instanceof Error, 'nor one whose format isn’t a number');
	ok(!(throws(() => parseFolderSnapshot(t.replace('binder-snapshot: 1', 'binder-snapshot: soon'))) instanceof NewerSnapshot), '(that one isn’t “newer”)');
}

// a file changed by hand, or cut short, says which notes no longer match
{
	const list = [note('A.md', 'Alpha one.\nAlpha two.\n'), note('B.md', 'Beta.\n'), note('C.md', 'Gamma.\n')];
	const t = writeFolderSnapshot({ ...head, notes: 3 }, list);
	eq(j(parseFolderSnapshot(t.replace('Beta.', 'Bet4.')).damaged), j(['B.md']), 'a letter changed, the length kept: that note doesn’t match its fingerprint');
	eq(j(parseFolderSnapshot(t.replace('Beta.', 'Bet4.')).entries.map((e) => e.text)), j(['Alpha one.\nAlpha two.\n', 'Bet4.\n', 'Gamma.\n']), 'and the rest is read as it is');
	const longer = parseFolderSnapshot(t.replace('Alpha one.', 'Alpha one, and more.'));
	ok(longer.damaged.includes('A.md'), 'words put in: the note it happened in is damaged');
	eq(longer.entries.find((e) => e.path === 'C.md')?.text, 'Gamma.\n', 'and the notes after it are found again at their own lines');
	ok(!longer.damaged.includes('C.md'), 'and still match');
	const cut = parseFolderSnapshot(t.slice(0, t.indexOf('Gamma') + 2));
	ok(cut.damaged.includes('C.md'), 'a file cut short: the note it stops in is damaged');
	ok(parseFolderSnapshot(t.slice(0, t.indexOf('===== "C.md"'))).damaged.length > 0, 'cut between two notes: it has fewer notes than it says, and that is damage too');
	const relined = parseFolderSnapshot(t.replace(/\n/g, '\r\n'));
	eq(j([relined.damaged, relined.entries.map((e) => e.text)]), j([[], list.map((e) => e.text)]), 'every line ending made CR LF by a tool (git on Windows does it): put back, and every note is as it was');
	eq(readHead(t.replace(/\n/g, '\r\n')).head.notes, 3, 'its head reads either way');
	const mixed = [note('A.md', 'Unix.\n'), note('W.md', 'Windows.\r\nLines.\r\n')];
	eq(j(parseFolderSnapshot(writeFolderSnapshot({ ...head, notes: 2 }, mixed).replace(/\r?\n/g, '\r\n')).damaged), j(['W.md']), 'a note that had CR LF of its own can’t be told from the rest then: it is damaged, and says so, rather than guessed at');
}

// the fingerprint
{
	eq(fingerprint('abc').length, 16, 'sixteen hex digits');
	ok(/^[0-9a-f]{16}$/.test(fingerprint('')), 'of nothing, too');
	ok(fingerprint('abc') !== fingerprint('abd') && fingerprint('ab') !== fingerprint('abc') && fingerprint('a\nb') !== fingerprint('a\r\nb'), 'a letter, a length, a line ending: each changes it');
	ok(fingerprint('﻿a') !== fingerprint('a'), 'so does a byte-order mark');
	eq(fingerprint('The same text.'), fingerprint('The same text.'), 'and the same text has the same one');
	const seen = new Set<string>();
	for (let i = 0; i < 20000; i++) seen.add(fingerprint('Scene ' + i));
	eq(seen.size, 20000, 'twenty thousand short texts, no two alike');
}

// ---- what changed ----

const P = (n: number, tag = '') => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1}${tag} of the scene, with enough words in it to be told from the others.`).join('\n\n') + '\n';
const fm = (props: string, body: string) => `---\n${props}\n---\n${body}`;
const book = (): Entry[] => [
	note('Book.md', fm('binder: 1\ntarget: 50000\ncontents:\n  - Prologue', 'About the book.\n'), 'binder note'),
	note('Prologue.md', fm('status: Draft', P(4, ' (prologue)'))),
	folder('One/'),
	note('One/One.md', fm('synopsis: The first part.', ''), 'folder note'),
	note('One/Arrival.md', fm('label: Blue\nstatus: Draft', P(5, ' (arrival)'))),
	note('One/The keeper.md', P(5, ' (keeper)')),
	note('One/Storm.md', P(4, ' (storm)')),
	folder('Two/'),
	note('Two/The wreck.md', P(6, ' (wreck)')),
	note('Two/Lights out.md', P(3, ' (lights)')),
	note('Epilogue.md', P(2, ' (epilogue)')),
];
const said = (r: Row): string => [r.gone ? 'gone' : '', r.fresh ? 'new' : '', r.rewritten ? `rewritten +${r.added} -${r.removed}` : '', r.renamed ? `renamed ${r.renamed}` : '', r.into != null ? `into ${r.into || 'top'}` : '', r.reordered ? 'reordered' : '', r.props.length ? `props ${r.props.join(',')}` : ''].filter((x) => x).join('; ');
const diff = (then: Entry[], now: Entry[]) => { const c = changes(then, now); return { c, by: Object.fromEntries(c.rows.filter((r) => said(r)).map((r) => [(r.then?.role ? '@' : '') + r.name, said(r)])) }; };
const swap = (list: Entry[], path: string, to: Partial<Entry> & { text?: string }) => list.map((e) => (e.path === path ? (to.text != null ? { ...note(to.path ?? e.path, to.text, e.role) } : { ...e, ...to }) : e));
const move = (list: Entry[], path: string, to: string, before: string | null) => { const e = list.find((x) => x.path === path) as Entry, rest = list.filter((x) => x !== e), moved = { ...e, path: to }; const at = before ? rest.findIndex((x) => x.path === before) : rest.length; rest.splice(at, 0, moved); return rest; };

// nothing
{
	const { c } = diff(book(), book());
	ok(c.same, 'the same state twice: nothing is different');
	eq(c.rows.length, 9, 'and every item has a row (the folders’ own notes are theirs, not rows): two at the top, two folders, five in them');
	eq(j(c.rows.map((r) => [r.name, r.depth])), j([['Prologue', 0], ['One', 0], ['Arrival', 1], ['The keeper', 1], ['Storm', 1], ['Two', 0], ['The wreck', 1], ['Lights out', 1], ['Epilogue', 0]]), 'in the order it stood, each at its depth');
}

// rewritten, with the words
{
	const now = swap(book(), 'One/Arrival.md', { text: fm('label: Blue\nstatus: Draft', P(5, ' (arrival)').replace('Paragraph 2 (arrival) of the scene', 'Paragraph 2 (arrival) of the long scene').replace(/Paragraph 4[^\n]*\n\n/, '') + '\nA whole new paragraph of six words.\n') });
	const { c, by } = diff(book(), now);
	eq(j(by), j({ Arrival: 'rewritten +8 -17' }), 'one note rewritten: a word put in, a paragraph taken out, one put in, counted as “Show changes” marks them');
	eq(j([c.rewritten, c.added, c.removed, c.fresh, c.gone, c.moved, c.renamed, c.props]), j([1, 8, 17, 0, 0, 0, 0, 0]), 'and the totals say the same');
	ok(!c.same, 'something is different');
	eq(c.rows.find((r) => r.name === 'One')?.inside, 1, 'its folder knows one thing in it is different');
	eq(c.rows.find((r) => r.name === 'Two')?.inside, 0, 'the other folder, nothing');
}

// line endings alone are not a rewrite; a property alone is not one either
{
	const crlf = swap(book(), 'One/Storm.md', { text: P(4, ' (storm)').replace(/\n/g, '\r\n') });
	eq(j(diff(book(), crlf).by), '{}', 'the same words with other line endings: the file differs, the text doesn’t, and nothing is said');
	const props = swap(swap(book(), 'One/Arrival.md', { text: fm('label: Red\nstatus: Draft\nsynopsis: Mara arrives.', P(5, ' (arrival)')) }), 'Prologue.md', { text: P(4, ' (prologue)') });
	eq(j(diff(book(), props).by), j({ Prologue: 'props status', Arrival: 'props label,synopsis' }), 'properties changed, added and taken away, by name; the text is the same');
}

// a folder's own note is the folder's; the binder's own is a row at the top
{
	const now = swap(swap(book(), 'One/One.md', { text: fm('synopsis: Mara comes to the island.\nstatus: Done', 'Notes on part one.\n') }), 'Book.md', { text: fm('binder: 1\ntarget: 90000\ncontents:\n  - Epilogue\n  - Prologue', 'About the book.\n') });
	const { c, by } = diff(book(), now);
	eq(j(by), j({ '@Book': 'props target', One: 'props synopsis,status,text' }), 'a folder’s synopsis and its note’s text are the folder’s; the binder’s target is the binder’s; its order is not a property');
	eq(c.rows[0].then?.role, 'binder note', 'the binder’s own row comes first');
	eq(c.props, 2, 'two items with other properties');
}

// moved: within its folder, to another folder, out to the top
{
	const within = move(book(), 'One/Storm.md', 'One/Storm.md', 'One/Arrival.md');
	eq(j(diff(book(), within).by), j({ Storm: 'reordered' }), 'one note moved up its folder: that note, and not the two it passed');
	const across = move(book(), 'One/The keeper.md', 'Two/The keeper.md', 'Two/Lights out.md');
	eq(j(diff(book(), across).by), j({ 'The keeper': 'into Two/' }), 'moved to another folder, text unchanged: followed there');
	const out = move(book(), 'Two/Lights out.md', 'Lights out.md', 'Epilogue.md');
	eq(j(diff(book(), out).by), j({ 'Lights out': 'into top' }), 'moved out to the top');
	eq(diff(book(), across).c.moved, 1, 'counted once');
	const folderUp = [...book().slice(0, 2), ...book().slice(7, 10), ...book().slice(2, 7), book()[10]];
	eq(j(Object.values(diff(book(), folderUp).by)), j(['reordered']), 'two folders that changed places: one of them moved, and nothing in either');
}

// renamed: the same text, or most of it, under another name
{
	const renamed = swap(book(), 'One/Arrival.md', { path: 'One/Landing.md' });
	eq(j(diff(book(), renamed).by), j({ Arrival: 'renamed Landing' }), 'renamed, text unchanged: one note, not one gone and one new');
	const edited = swap(book(), 'One/Arrival.md', { path: 'One/Landing.md', text: fm('label: Blue\nstatus: Draft', P(5, ' (arrival)').replace('Paragraph 5', 'Paragraph five')) });
	eq(j(diff(book(), edited).by), j({ Arrival: 'rewritten +1 -1; renamed Landing' }), 'renamed and edited a little: still the same note, by the paragraphs it kept');
	const both = move(edited, 'One/Landing.md', 'Two/Landing.md', null);
	ok(/renamed Landing; into Two\//.test(diff(book(), both).by.Arrival ?? ''), 'renamed, edited and moved to another folder: still followed');
	const other = swap(book(), 'One/Arrival.md', { path: 'One/Landing.md', text: 'Nothing to do with it.\n\nNot a paragraph in common.\n\nNot one.\n' });
	eq(j(Object.entries(diff(book(), other).by).sort()), j([['Arrival', 'gone'], ['Landing', 'new']]), 'another name and another text altogether: one gone, one new');
}

// a note has the name an old one had; the old one is elsewhere
{
	let now = swap(book(), 'One/Arrival.md', { path: 'One/Landing.md' });
	now = [...now.slice(0, 5), note('One/Arrival.md', 'A new scene that took the old name.\n\nIt shares nothing with it.\n\nNot a line.\n'), ...now.slice(5)];
	const by = diff(book(), now).c.rows.filter((r) => said(r)).map((r) => `${r.name}: ${said(r)}`);
	eq(j(by.sort()), j(['Arrival: new', 'Arrival: renamed Landing'].sort()), 'the old note is followed to its new name, and the note that has its old name is new: not “Arrival, rewritten from top to bottom”');
}

// a folder renamed takes its notes with it
{
	const now = book().map((e) => (e.path.startsWith('Two/') ? { ...e, path: 'Part 2/' + e.path.slice(4).replace(/^Two\.md$/, 'Part 2.md') } : e));
	const { c, by } = diff(book(), now);
	eq(j(by), j({ Two: 'renamed Part 2' }), 'a folder renamed: the folder, and none of the notes in it');
	eq(j([c.gone, c.fresh, c.moved, c.renamed]), j([0, 0, 0, 1]), 'nothing gone, nothing new, nothing moved');
}

// gone and new: where they show
{
	const now = [...book().filter((e) => e.path !== 'One/The keeper.md').slice(0, 9), note('Two/The inquiry.md', 'Two men came out on the supply boat.\n'), book()[10]];
	const { c } = diff(book(), now);
	eq(j(c.rows.map((r) => r.name + (said(r) ? ` (${said(r)})` : ''))), j(['Prologue', 'One', 'Arrival', 'The keeper (gone)', 'Storm', 'Two', 'The wreck', 'Lights out', 'The inquiry (new)', 'Epilogue']), 'a gone note stays where it stood; a new one goes in after the note it follows now');
	eq(j([c.gone, c.fresh]), j([1, 1]), 'counted');
	const first = [book()[0], note('Before.md', 'New at the top.\n'), ...book().slice(1)];
	eq(diff(book(), first).c.rows[0].name, 'Before', 'a new note at the very top is first');
	const wholeFolder = [...book(), folder('Three/'), note('Three/Relief.md', 'x\n')];
	eq(j(diff(book(), wholeFolder).c.rows.slice(-2).map((r) => [r.name, r.depth, said(r)])), j([['Three', 0, 'new'], ['Relief', 1, 'new']]), 'a new folder and what is in it');
	const goneFolder = book().filter((e) => !e.path.startsWith('Two/'));
	eq(j(diff(book(), goneFolder).by), j({ Two: 'gone', 'The wreck': 'gone', 'Lights out': 'gone' }), 'a folder gone with its notes');
	const emptied = move(move(book(), 'Two/The wreck.md', 'The wreck.md', 'Epilogue.md'), 'Two/Lights out.md', 'Lights out.md', 'Epilogue.md').filter((e) => e.path !== 'Two/');
	eq(j(diff(book(), emptied).by), j({ Two: 'gone', 'The wreck': 'into top', 'Lights out': 'into top' }), 'ungrouped: the folder is gone, and its notes are followed out of it');
}

// merged and split
{
	const merged = swap(book(), 'One/Arrival.md', { text: fm('label: Blue\nstatus: Draft', P(5, ' (arrival)') + '\n' + P(5, ' (keeper)')) }).filter((e) => e.path !== 'One/The keeper.md');
	const m = diff(book(), merged).by;
	ok(/^rewritten \+\d+ -0$/.test(m.Arrival) && m['The keeper'] === 'gone', 'merged: the note that took the other’s text is rewritten (words put in, none taken out), and the other is gone: ' + j(m));
	const split = [...swap(book(), 'Two/The wreck.md', { text: P(6, ' (wreck)').split('\n\n').slice(0, 3).join('\n\n') + '\n' }).slice(0, 9), note('Two/The wreck 1.md', P(6, ' (wreck)').split('\n\n').slice(3).join('\n\n')), ...book().slice(9)];
	const s = diff(book(), split).by;
	ok(/^rewritten \+0 -\d+$/.test(s['The wreck']) && s['The wreck 1'] === 'new', 'split: the first half is rewritten (words taken out), the second is new: ' + j(s));
}

// files that aren't notes
{
	const then = [...book(), other('map.png', 100), other('plan.pdf', 5)], now = [...book(), other('map.png', 250)];
	eq(j(diff(then, now).by), j({ 'map.png': 'rewritten +0 -0', 'plan.pdf': 'gone' }), 'another file of another size is different; one that isn’t there is gone');
}

// what a YAML reader changes: a block written again in another form is not a change
{
	const a = [note('A.md', fm('tags: [one, two]\nstatus: "Draft"', 'Text.\n'))], b = [note('A.md', fm('tags:\n  - one\n  - two\nstatus: Draft', 'Text.\n'))];
	eq(changes(a, b).rows[0].props.join(), 'tags,status', 'as written, the two blocks differ');
	const yaml = (t: string): unknown => (t.includes('one') ? { tags: ['one', 'two'], status: 'Draft' } : {});
	ok(changes(a, b, { yaml }).same, 'read as YAML they say the same, and nothing is different');
}

// two notes with the same text; many notes; nothing quadratic
{
	const twins = [note('A.md', 'Same.\n'), note('B.md', 'Same.\n')];
	ok(changes(twins, twins).same, 'two notes with the very same text stay themselves');
	eq(j(changes(twins, [note('A.md', 'Same.\n'), note('C.md', 'Same.\n')]).rows.map((r) => r.name + ':' + said(r))), j(['A:', 'B:renamed C']), 'and the one renamed is the one whose name is gone');
	const many = (tag: string) => Array.from({ length: 6000 }, (_, i) => (i % 30 === 0 ? folder(`F${i / 30}/`) : note(`F${Math.floor(i / 30)}/N${i}.md`, `Note ${i}.\n\nSecond paragraph of ${i}${i % 500 === 7 ? tag : ''}.\n\nThird.\n`)));
	const t0 = Date.now(), c = changes(many(''), many(' edited').filter((e) => !/N(100|200|301)\.md$/.test(e.path)).map((e) => (e.path.startsWith('F5/') ? { ...e, path: 'Five/' + e.path.slice(3) } : e)));
	eq(j([c.rewritten, c.gone, c.renamed, c.fresh]), j([12, 3, 1, 0]), 'six thousand items: twelve rewritten, three gone, a folder renamed');
	ok(Date.now() - t0 < 3000, `in good time (${Date.now() - t0} ms)`);
}

done('binder snapshot text');
