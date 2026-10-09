import { BINDER_SNAPSHOT_EXT, BINDER_SNAPSHOT_FORMAT, NewerSnapshot, changes, fingerprint, inFolder, parseFolderSnapshot, mayPlace, planBack, readHead, sameButLinks, shape, writeFolderSnapshot, type BackOptions, type Entry, type Head, type Plan, type Row, type Scope } from '../src/binder-snapshot-text';
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

// an item whose path would land outside the folder (a file made to do harm, or mangled) is not an item at all
{
	const t = writeFolderSnapshot({ ...head, notes: 3 }, [note('A.md', 'Alpha.\n'), folder('Part/'), note('Part/B.md', 'Beta.\n'), note('C.md', 'Gamma.\n')]);
	for (const bad of ['../A.md', '../../A.md', '/A.md', 'x/../../A.md', './A.md', 'x//A.md', 'x\\..\\..\\A.md', '..\\A.md', 'A.js', '.obsidian/A.md', '']) {
		const got = parseFolderSnapshot(t.replace('"A.md"', JSON.stringify(bad)));
		eq(j([got.entries.map((e) => e.path), got.damaged.length > 0]), j([['Part/', 'Part/B.md', 'C.md'], true]), `a note at ${j(bad)}: left out, the snapshot damaged, the notes after it still read`);
	}
	const dir = parseFolderSnapshot(t.replace('"Part/"', '"../Part/"'));
	eq(j([dir.entries.some((e) => e.path.includes('..')), dir.damaged.length > 0]), j([false, true]), 'a folder that climbs out: left out too');
	for (const good of ['Part/A.md', 'A b.c.md', 'Ünï/x .. y.md', 'a..b.md', 'C: a \\ b.md']) eq(j(parseFolderSnapshot(t.replace('"A.md"', JSON.stringify(good))).damaged), '[]', `${j(good)} is a name like any other`);
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

// ---- bringing one back: what will be written ----

const plan = (then: Entry[], now: Entry[], scope: Scope = 'both') => planBack(changes(then, now), then, now, scope);
const called = (rows: Row[]) => rows.map((r) => r.name).join(',');
const dirOf = (path: string) => { const p = path.replace(/\/$/, ''), i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); };
/** A state after a plan has been carried out, as the vault side carries it out: each text in its note (its
    properties staying), each folder's items in the order given. */
function carriedOut(now: Entry[], p: ReturnType<typeof plan>): Entry[] {
	const texts = new Map(p.texts.map((t) => [t.path, t])), order = new Map(p.orders.map((o) => [o.folder, o.items]));
	const list = now.map((e) => { const t = texts.get(e.path); if (!t || e.text == null) return e; ok(e.text.endsWith(t.expect), `“${e.path}” says what was expected of it`); return note(e.path, e.text.slice(0, e.text.length - t.expect.length) + t.text, e.role); });
	const out: Entry[] = [], walk = (dir: string) => {
		const kids = list.filter((e) => dirOf(e.path) === dir), own = kids.filter((e) => e.role), rest = kids.filter((e) => !e.role), want = order.get(dir);
		out.push(...own);
		for (const e of want ? want.map((path) => rest.find((x) => x.path === path)) : rest) { if (!e) throw new Error('an item to order that isn’t there'); out.push(e); if (e.kind === 'folder') walk(e.path); }
	};
	walk('');
	return out;
}

// nothing is different: nothing to write
{
	const p = plan(book(), book());
	ok(p.nothing && !p.unsafe && !p.texts.length && !p.orders.length, 'the same state: nothing to bring back');
	eq(j(Object.values(p.left).map((l) => l.length)), j([0, 0, 0, 0, 0, 0, 0]), 'and nothing left as it is');
}

// the text: only a note that is there both times and reads differently, its text and not its properties
{
	const then = book();
	let now = swap(book(), 'One/Arrival.md', { text: fm('label: Red\nstatus: Done', P(5, ' (arrival)') + '\nA paragraph written since.\n') });
	now = swap(now, 'Two/The wreck.md', { text: fm('status: Done', P(6, ' (wreck)')) });
	const p = plan(then, now);
	eq(j(p.texts), j([{ path: 'One/Arrival.md', was: 'One/Arrival.md', expect: P(5, ' (arrival)') + '\nA paragraph written since.\n', text: P(5, ' (arrival)') }]), 'one note’s text: the text it has (what is expected of it at the write) and the text it had, neither with its properties');
	eq(called(p.rewritten), 'Arrival', 'said by its name');
	eq(j([p.back, p.away]), j([0, 4]), 'and by its words: none come back, four written since go');
	eq(called(p.left.props), 'Arrival,The wreck', 'properties that are different are left, and said: of the note whose text comes back, and of one that only has other properties');
	ok(!p.orders.length && !p.nothing, 'no order to give');
	ok(changes(then, carriedOut(now, p)).rewritten === 0, 'carried out, no note reads differently');
	ok(plan(then, carriedOut(now, p)).nothing, 'and a second time there is nothing to do');
	eq(carriedOut(now, p).find((e) => e.path === 'One/Arrival.md')?.text, fm('label: Red\nstatus: Done', P(5, ' (arrival)')), 'the note is its properties as they are now and its text as it was');
}

// exact text: a byte-order mark and the properties stay with the note; the text comes back with its own line endings
{
	const then = [note('A.md', '﻿---\nstatus: draft\n---\nOne.\r\nTwo.\r\n'), note('B.md', 'Same.\r\nLines.\r\n'), note('C.md', '﻿No properties.\n'), note('D.md', fm('status: x', ''))];
	const now = [note('A.md', '﻿---\nstatus: done\n---\nOne.\r\nThree.\r\n'), note('B.md', 'Same.\nLines.\n'), note('C.md', '﻿None at all.\n'), note('D.md', fm('status: x', 'Written since.\n'))];
	const p = plan(then, now);
	eq(j(p.texts.map((t) => [t.path, t.expect, t.text])), j([['A.md', 'One.\r\nThree.\r\n', 'One.\r\nTwo.\r\n'], ['C.md', 'None at all.\n', 'No properties.\n'], ['D.md', 'Written since.\n', '']]), 'CR LF as it was; the mark is no part of the text; a note that was empty is emptied; one that differs only in its line endings is not written at all');
	eq(carriedOut(now, p).find((e) => e.path === 'A.md')?.text, '﻿---\nstatus: done\n---\nOne.\r\nTwo.\r\n', 'so the file is the mark and the properties it has now, then the text it had, to the byte');
	eq(carriedOut(now, p).find((e) => e.path === 'C.md')?.text, then[2].text, 'and a note with no properties is, byte for byte, the file it was');
}

// a note is followed: renamed or moved since, its text goes where the note is now; nothing is renamed or moved back
{
	const then = book();
	let now = swap(book(), 'One/The keeper.md', { path: 'One/The old keeper.md', text: P(5, ' (keeper)') + '\nMore.\n' });
	now = move(now, 'One/Storm.md', 'Two/Storm.md', 'Two/The wreck.md');
	now = swap(now, 'Two/Storm.md', { text: P(4, ' (storm)').replace('Paragraph 1', 'Paragraph one') });
	const p = plan(then, now);
	eq(j(p.texts.map((t) => [t.path, t.was])), j([['One/The old keeper.md', 'One/The keeper.md'], ['Two/Storm.md', 'One/Storm.md']]), 'each text goes to the note as it stands, under the name and in the folder it has now');
	eq(j([called(p.left.renamed), called(p.left.elsewhere)]), j(['The keeper', 'Storm']), 'the name and the folder are left, and said');
	ok(!p.orders.length, 'and a note that left its folder is no change to the order of those that stayed');
	const after = carriedOut(now, p);
	eq(j(after.map((e) => e.path)), j(now.map((e) => e.path)), 'carried out: every item is where it was a moment ago');
}

// the order: in each folder, the items that were there go back to the order they had; what has come since follows what it follows now
{
	const then = book();
	let now = move(book(), 'Epilogue.md', 'Epilogue.md', 'Prologue.md');
	now = move(now, 'One/Arrival.md', 'One/Arrival.md', 'Two/');
	now = move(now, 'One/The keeper.md', 'One/The keeper.md', 'One/Arrival.md');
	now = [...now.slice(0, now.findIndex((e) => e.path === 'One/Arrival.md')), note('One/New.md', 'Written since.\n'), ...now.slice(now.findIndex((e) => e.path === 'One/Arrival.md'))];
	now = move(now, 'Two/Lights out.md', 'One/Lights out.md', 'One/Storm.md');
	// now: Epilogue, Prologue, One/[Lights out (from Two), Storm, The keeper, New, Arrival], Two/[The wreck]
	const p = plan(then, now);
	eq(j(p.orders), j([
		{ folder: '', from: ['Epilogue.md', 'Prologue.md', 'One/', 'Two/'], items: ['Prologue.md', 'One/', 'Two/', 'Epilogue.md'] },
		{ folder: 'One/', from: ['One/Lights out.md', 'One/Storm.md', 'One/The keeper.md', 'One/New.md', 'One/Arrival.md'], items: ['One/Lights out.md', 'One/Arrival.md', 'One/The keeper.md', 'One/New.md', 'One/Storm.md'] },
	]), 'two folders to order, each with all its items: the new note after the one it follows now, the one that came from another folder where it is (it follows nothing that was there)');
	ok(p.orders.every((o) => j([...o.from].sort()) === j([...o.items].sort())), 'the same items, in another order: none added, none dropped');
	eq(j([called(p.left.fresh), called(p.left.elsewhere)]), j(['New', 'Lights out']), 'what is new and what is in another folder is said, and left');
	const after = carriedOut(now, p);
	eq(j(after.filter((e) => !e.role).map((e) => e.path)), j(['Prologue.md', 'One/', 'One/Lights out.md', 'One/Arrival.md', 'One/The keeper.md', 'One/New.md', 'One/Storm.md', 'Two/', 'Two/The wreck.md', 'Epilogue.md']), 'carried out: the order it had, with what has come since in it');
	ok(plan(then, after).nothing && changes(then, after).rows.every((r) => !r.reordered), 'and a second time there is nothing to do: nothing is out of its order');
	eq(p.moved.length, changes(then, now).rows.filter((r) => r.reordered).length, 'the items said to go back are the ones “Show changes” says moved');
}

// a folder renamed since: its items are ordered in the folder as it stands
{
	const then = book(), now = move(book(), 'One/Storm.md', 'One/Storm.md', 'One/Arrival.md').map((e) => (e.path === 'One/One.md' ? { ...e, path: 'Uno/Uno.md' } : e.path.startsWith('One/') ? { ...e, path: 'Uno/' + e.path.slice(4) } : e));
	const p = plan(then, now);
	eq(j(p.orders), j([{ folder: 'Uno/', from: ['Uno/Storm.md', 'Uno/Arrival.md', 'Uno/The keeper.md'], items: ['Uno/Arrival.md', 'Uno/The keeper.md', 'Uno/Storm.md'] }]), 'by the paths its items have now');
	eq(called(p.left.renamed), 'One', 'and the folder keeps the name it has');
}

// one of the two: the other is left, and said
{
	const then = book(), now = move(swap(book(), 'Prologue.md', { text: fm('status: Draft', 'All new.\n') }), 'Epilogue.md', 'Epilogue.md', 'Prologue.md');
	const both = plan(then, now), text = plan(then, now, 'text'), order = plan(then, now, 'order');
	eq(j([both.texts.length, both.orders.length, text.texts.length, text.orders.length, order.texts.length, order.orders.length]), j([1, 1, 1, 0, 0, 1]), 'both, the text alone, the order alone');
	eq(j([called(both.left.text), called(both.left.order), called(text.left.order), called(text.left.text), called(order.left.text), called(order.left.order)]), j(['', '', 'Epilogue', '', 'Prologue', '']), 'what isn’t asked for is said to stay: the place of the item that moved, the text of the note that was rewritten');
	ok(!text.moved.length && !order.rewritten.length && !order.back && !order.away, 'and isn’t counted as coming back');
}

// what this never brings back is all said: gone, new, another folder, another name, properties (the binder's own too)
{
	const then = [...book(), other('map.png', 10)];
	let now = swap(book(), 'Book.md', { text: fm('binder: 1\ntarget: 60000\ncontents:\n  - Prologue', 'About the book.\n') });
	now = now.filter((e) => e.path !== 'Two/Lights out.md');
	now.push(note('Coda.md', 'New since.\n'));
	const p = plan(then, now);
	ok(p.nothing, 'a note gone, a note new, a file gone, a target changed: nothing this can write');
	eq(j([called(p.left.gone), called(p.left.fresh), p.left.props.map((r) => r.props.join()).join('|')]), j(['Lights out,map.png', 'Coda', 'target']), 'and each is said');
}

// a snapshot is a file anyone can have written: an item that says it is somewhere else, and nothing is planned at all
for (const bad of ['../Out.md', '/etc/passwd.md', 'One/../../Out.md', '.obsidian/app.md', 'One\\..\\..\\Out.md', 'One//Arrival.md', 'Arrival.txt', '']) {
	const then = [...book(), note(bad, 'Planted.\n')], now = [...swap(book(), 'Prologue.md', { text: 'Rewritten.\n' }), note(bad, 'There now.\n')];
	const p = planBack(changes(then, now), then, now, 'both'), q = planBack(changes(then, book()), then, move(swap(book(), 'Prologue.md', { text: 'Rewritten.\n' }), 'Epilogue.md', 'Epilogue.md', 'Prologue.md'), 'both');
	ok(p.unsafe && p.nothing && !p.texts.length && !p.orders.length, `“${bad}” in both: nothing is planned`);
	ok(q.unsafe && q.nothing && !q.texts.length && !q.orders.length, `“${bad}” in the snapshot alone: nothing is planned, not even for the notes that are in the folder`);
}
ok(planBack(changes([folder('../Up/')], [folder('../Up/')]), [folder('../Up/')], [folder('../Up/')], 'order').unsafe, 'a folder that climbs out, too');

// every path a plan names is a path in the folder, of an item that is there now
{
	const then = book(), now = move(swap(book(), 'One/The keeper.md', { path: 'One/Keeper.md', text: P(5, ' (keeper)') + '\nNow.\n' }), 'Epilogue.md', 'Epilogue.md', 'Prologue.md');
	const p = plan(then, now), there = new Set(now.map((e) => e.path));
	ok(p.texts.length > 0 && p.orders.length > 0 && p.texts.every((t) => there.has(t.path) && inFolder(t.path, 'note')) && p.orders.every((o) => o.items.every((x) => there.has(x) && inFolder(x, x.endsWith('/') ? 'folder' : 'note'))), 'texts and orders alike');
}


// ---- everything brought back: what is made, renamed, moved and written ----

const everything = (then: Entry[], now: Entry[], opts: BackOptions = {}) => planBack(changes(then, now), then, now, 'all', { name: 'Book', ...opts });
/** A state after a plan to bring everything back has been carried out, as the vault side carries it out: what is new
    gathered, folders made and put back (what is in them going along), notes put back, each file written or made,
    each folder's items in the order given. An item is followed as the file it is, not by its path. */
function carriedOutAll(now: Entry[], p: Plan): Entry[] {
	const all = p.all;
	if (!all) throw new Error('no plan for everything');
	const list = now.map((e) => ({ ...e })), at = (path: string) => list.find((e) => e.path === path);
	const moves = [...(all.gather?.items ?? []), ...all.places].filter((x) => x.from != null).map((x) => ({ x, e: at(x.from ?? '') }));
	const files = all.files.map((f) => ({ f, e: f.from == null ? undefined : at(f.from) }));
	ok(moves.every((m) => !!m.e) && files.every((x) => x.f.from == null || !!x.e), 'everything a plan moves or writes is there now');
	const to = (e: Entry, path: string) => { const was = e.path; e.path = path; if (e.kind === 'folder') for (const k of list) if (k !== e && k.path.startsWith(was)) k.path = path + k.path.slice(was.length); };
	if (all.gather?.make) list.push(folder(all.gather.folder));
	for (const x of all.places) if (x.from == null) list.push(folder(x.to));
	for (const m of moves.filter((m) => m.x.kind === 'folder')) if (m.e) to(m.e, m.x.to);
	for (const m of moves.filter((m) => m.x.kind !== 'folder')) if (m.e) to(m.e, m.x.to);
	for (const { f, e } of files) {
		if (!e) { list.push(note(f.path, f.text, f.role)); continue; }
		eq(e.text, f.expect, `“${f.path}” says what was expected of it`);
		eq(e.path, f.path, `“${f.path}” is where its file is to be written`);
		Object.assign(e, note(e.path, f.text, e.role));
	}
	eq(new Set(list.map((e) => e.path.toLowerCase())).size, list.length, 'no two items at one path');
	const order = new Map(all.orders.map((o) => [o.folder, o.items])), out: Entry[] = [], walk = (dir: string) => {
		const kids = list.filter((e) => dirOf(e.path) === dir), own = kids.filter((e) => e.role), rest = kids.filter((e) => !e.role), want = order.get(dir) ?? [];
		out.push(...own);
		for (const e of [...want.map((path) => rest.find((x) => x.path === path)), ...rest.filter((x) => !want.includes(x.path))]) { if (!e) throw new Error('an item to order that isn’t there'); out.push(e); if (e.kind === 'folder') walk(e.path); }
	};
	walk('');
	return out;
}
const paths = (list: Entry[]) => list.map((e) => e.path);

// nothing is different: nothing to do
{
	const p = everything(book(), book());
	ok(p.nothing && !p.unsafe && !!p.all && !p.all.places.length && !p.all.files.length && !p.all.gather, 'everything, the same state: nothing to bring back');
	eq(p.all?.notes.length, book().filter((e) => e.kind === 'note').length, 'every note of the snapshot is named, to be checked at the end');
}

// a month's work of every kind, and all of it comes back: the state is the snapshot's, entry for entry
{
	const then = book();
	let now = swap(book(), 'One/Arrival.md', { text: fm('label: Red', P(5, ' (arrival)') + '\nWritten since.\n') });
	now = swap(now, 'One/The keeper.md', { path: 'One/The old keeper.md', text: P(5, ' (keeper)') + '\nMore.\n' });
	now = move(now, 'One/Storm.md', 'Two/Storm.md', 'Two/The wreck.md');
	now = now.filter((e) => e.path !== 'Two/Lights out.md');
	now = move(now, 'Epilogue.md', 'Epilogue.md', 'Prologue.md');
	now = swap(now, 'Book.md', { text: fm('binder: 1\ntarget: 60000\ncontents:\n  - Epilogue', 'About the book.\n') });
	now = swap(now, 'One/One.md', { text: fm('synopsis: Changed.', '') });
	const p = everything(then, now), a = p.all;
	ok(!!a && !p.nothing && !p.unsafe, 'everything: there is a plan');
	eq(j(a?.places), j([{ kind: 'note', role: '', from: 'One/The old keeper.md', to: 'One/The keeper.md' }, { kind: 'note', role: '', from: 'Two/Storm.md', to: 'One/Storm.md' }]), 'a note renamed back, a note moved back');
	eq(j(a?.files.map((f) => [f.path, f.from, f.role, f.own])), j([['One/One.md', 'One/One.md', 'folder note', false], ['One/Arrival.md', 'One/Arrival.md', '', false], ['One/The keeper.md', 'One/The old keeper.md', '', false], ['Two/Lights out.md', null, '', false], ['Book.md', 'Book.md', 'binder note', true]]), 'the files written: a folder’s note, two notes (one where it will be, from where it is), one made again, and the binder note, marked as the folder’s own');
	ok(!!a && a.files.every((f) => f.text === then.find((e) => e.path === f.path)?.text && f.expect === (f.from == null ? null : now.find((e) => e.path === f.from)?.text)), 'each with the whole file it had, properties and text, and the whole file it has now');
	eq(j([called(a?.made ?? []), called(a?.renamed ?? []), called(a?.moved ?? []), called(p.rewritten), called(p.moved), a?.props.map((r) => r.name + ':' + r.props.join()).join('|')]), j(['Lights out', 'The keeper', 'Storm', 'Arrival,The keeper', 'Epilogue', 'Book:target|One:synopsis|Arrival:label,status']), 'and the screen has each by name: made again, renamed back, moved back, rewritten, back in the order, properties');
	eq(j(Object.values(p.left).map((l) => l.length)), j([0, 0, 0, 0, 0, 0, 0]), 'nothing is “left as it is now” in the way the other scopes leave it');
	ok(!p.texts.length, 'no text is written by itself: the files are');
	const after = carriedOutAll(now, p);
	eq(j(after), j(then), 'carried out: the folder is the snapshot, entry for entry, in its order');
	ok(everything(then, after).nothing, 'and a second time there is nothing to do');
}

// two notes that changed names with each other, and a name that differs only in its capitals
{
	const then = book();
	let now = swap(book(), 'One/Arrival.md', { path: 'One/Tmp.md' });
	now = swap(now, 'One/The keeper.md', { path: 'One/Arrival.md' });
	now = swap(now, 'One/Tmp.md', { path: 'One/The keeper.md' });
	now = swap(now, 'Prologue.md', { path: 'prologue.md' });
	const p = everything(then, now);
	eq(j(p.all?.places.map((x) => [x.from, x.to])), j([['prologue.md', 'Prologue.md'], ['One/The keeper.md', 'One/Arrival.md'], ['One/Arrival.md', 'One/The keeper.md']]), 'each goes to the name the other has, and the capital comes back');
	ok(!p.all?.files.length && !p.all?.named.length, 'no file is written, and no name is refused: the notes are followed by their text');
	eq(j(carriedOutAll(now, p)), j(then), 'carried out: the snapshot');
}

// a folder renamed and another gone: the one put back with what is in it, the other made again with its note and its notes
{
	const then = [...book(), other('One/map.png', 10)];
	const now = [...book(), other('One/map.png', 10)].filter((e) => !e.path.startsWith('Two/')).map((e) => (e.path === 'One/One.md' ? { ...e, path: 'Uno/Uno.md' } : e.path.startsWith('One/') ? { ...e, path: 'Uno/' + e.path.slice(4) } : e));
	const p = everything(then, now), a = p.all;
	eq(j(a?.places), j([{ kind: 'folder', role: '', from: 'Uno/', to: 'One/' }, { kind: 'note', role: 'folder note', from: 'Uno/Uno.md', to: 'One/One.md' }, { kind: 'folder', role: '', from: null, to: 'Two/' }]), 'one folder renamed (its own note after it; its notes are not moved one by one), one made again');
	eq(j(a?.files.map((f) => [f.path, f.from])), j([['Two/The wreck.md', null], ['Two/Lights out.md', null]]), 'and the notes of the one that is gone, made again');
	eq(j([called(a?.made ?? []), called(a?.cannot ?? []), called(a?.stays ?? [])]), j(['Two,The wreck,Lights out', '', '']), 'the file that isn’t a note is in the folder under its new name: it is neither gone nor new');
	const after = carriedOutAll(now, p);
	eq(j(after.filter((e) => e.kind !== 'file')), j(then.filter((e) => e.kind !== 'file')), 'carried out: the snapshot');
	// a folder's own note that is gone is made again; one made since stays, and is said
	const bare = book().filter((e) => e.path !== 'One/One.md'), q = everything(book(), bare), r = everything(bare, book());
	eq(j(q.all?.files.map((f) => [f.path, f.from, f.role])), j([['One/One.md', null, 'folder note']]), 'a folder’s note that is gone is made again');
	ok(r.nothing && called(r.all?.ownStay ?? []) === 'One', 'one that was made since stays (a note is never deleted), and the screen says which folder keeps it');
	// a file that isn't a note and is gone can't come back
	const gone = everything([...book(), other('map.png', 10)], book());
	ok(gone.nothing && called(gone.all?.cannot ?? []) === 'map.png', 'a file that isn’t a note is listed in a snapshot, not kept: it can’t be made again, and that is said');
}

// what is new since stays where it is, after the item it follows now; or goes to one folder
{
	const then = book();
	let now = [...book(), folder('Three/'), note('Three/Deep.md', 'In a new folder.\n'), note('Coda.md', 'New since.\n')];
	now.splice(now.findIndex((e) => e.path === 'One/The keeper.md'), 0, note('One/New.md', 'Written since.\n'));
	now = move(now, 'One/Storm.md', 'One/Storm.md', 'One/Arrival.md');
	const p = everything(then, now), a = p.all;
	ok(!!a && !a.gather && !a.places.length && !a.files.length && !p.nothing, 'only the order is to give');
	eq(called(a?.stays ?? []), 'New,Three,Deep,Coda', 'what is new is said to stay');
	eq(j(a?.orders.find((o) => o.folder === 'One/')?.items), j(['One/Arrival.md', 'One/New.md', 'One/The keeper.md', 'One/Storm.md']), 'the folder’s order: as it was, the new note after the one it follows now');
	eq(j(paths(carriedOutAll(now, p)).filter((x) => !then.some((e) => e.path === x))), j(['One/New.md', 'Three/', 'Three/Deep.md', 'Coda.md']), 'carried out: nothing new is gone or moved');
	eq(j(carriedOutAll(now, p).filter((e) => then.some((x) => x.path === e.path))), j(then), 'and the rest is the snapshot');
	// the choice: one folder, at the end
	const more = [...now, note('Two/New.md', 'Another of the same name.\n')];
	const g = everything(then, more, { since: 'gather', sinceName: 'Since Draft: sent/to Sam' }), ga = g.all;
	eq(j(ga?.gather), j({ folder: 'Since Draft sent to Sam/', make: true, items: [{ kind: 'note', role: '', from: 'One/New.md', to: 'Since Draft sent to Sam/New.md' }, { kind: 'folder', role: '', from: 'Three/', to: 'Since Draft sent to Sam/Three/' }, { kind: 'note', role: '', from: 'Coda.md', to: 'Since Draft sent to Sam/Coda.md' }, { kind: 'note', role: '', from: 'Two/New.md', to: 'Since Draft sent to Sam/New 2.md' }] }), 'one new folder, named for the snapshot in letters a file can have; each new item under its own name, counted on where two share one; a new folder whole');
	eq(j([called(ga?.gathered ?? []), called(ga?.stays ?? [])]), j(['New,Three,Coda,New', '']), 'said as going there; nothing new stays where it is');
	const after = carriedOutAll(more, g);
	eq(j(after.filter((e) => !e.path.startsWith('Since '))), j(then), 'carried out: outside that folder, the snapshot and nothing else');
	eq(j(paths(after).filter((x) => x.startsWith('Since '))), j(['Since Draft sent to Sam/', 'Since Draft sent to Sam/New.md', 'Since Draft sent to Sam/Three/', 'Since Draft sent to Sam/Three/Deep.md', 'Since Draft sent to Sam/Coda.md', 'Since Draft sent to Sam/New 2.md']), 'and in it, everything that was new: nothing is deleted');
	// made twice (after an interruption): the folder that is there serves, and is not put into itself
	const again = everything(then, [...after, note('Late.md', 'Later still.\n')], { since: 'gather', sinceName: 'Since Draft: sent/to Sam' });
	eq(j(again.all?.gather), j({ folder: 'Since Draft sent to Sam/', make: false, items: [{ kind: 'note', role: '', from: 'Late.md', to: 'Since Draft sent to Sam/Late.md' }] }), 'a second time: the same folder, and only what has come since');
	ok(everything(then, after, { since: 'gather', sinceName: 'Since Draft: sent/to Sam' }).nothing, 'and with nothing new, nothing to do');
}

// a name an item that is new since has now: that item keeps it, and nothing is written over
{
	const then = book();
	// "Arrival" was renamed, and a new note has its name; "Storm" went to another folder, and a new note has its name
	// where it was. (New notes of some length: a short one at an old path is taken for the old note, rewritten.)
	let now = swap(book(), 'One/Arrival.md', { path: 'One/Landing.md' });
	now = move(now, 'One/Storm.md', 'Two/Storm.md', null);
	now.push(note('One/Arrival.md', P(4, ' (a new note under an old name)')), note('One/Storm.md', P(4, ' (another new note)')));
	const p = everything(then, now), a = p.all;
	eq(j(a?.named.map((n) => [n.row.name, n.as])), j([['Arrival', 'Landing'], ['Storm', 'Storm 2']]), 'the renamed note keeps the name it has; the one that comes back from another folder is named by counting on; both are said');
	eq(j(a?.places), j([{ kind: 'note', role: '', from: 'Two/Storm.md', to: 'One/Storm 2.md' }]), 'so one note is moved back, beside the new one, and none is renamed');
	eq(j(a?.files), j([]), 'and no file is written');
	const after = carriedOutAll(now, p);
	eq(j([after.find((e) => e.path === 'One/Arrival.md')?.text, after.find((e) => e.path === 'One/Storm.md')?.text]), j([P(4, ' (a new note under an old name)'), P(4, ' (another new note)')]), 'the new notes are untouched');
	ok(everything(then, after).nothing, 'a second time: nothing to do (the two are followed under the names they have)');
	// with what is new moved to one folder, the names are free again
	const g = everything(then, now, { since: 'gather', sinceName: 'Since Draft' });
	eq(j([g.all?.named.length, g.all?.places.map((x) => [x.from, x.to]), g.all?.files.length]), j([0, [['One/Landing.md', 'One/Arrival.md'], ['Two/Storm.md', 'One/Storm.md']], 0]), 'gathered: the old names come back');
	eq(j(carriedOutAll(now, g).filter((e) => !e.path.startsWith('Since '))), j(then), 'and the folder is the snapshot');
}

// a folder of a binder, from a snapshot of the folder: its own note is the folder's, under the name the folder has now
{
	const then = [note('One.md', fm('synopsis: The first part.', ''), 'folder note'), note('Arrival.md', 'A.\n'), note('Storm.md', 'S.\n')];
	const p = everything(then, [note('Arrival.md', 'A.\n'), note('Storm.md', 'S.\n')], { name: 'Part 1', of: 'Part 1' });
	eq(j(p.all?.files.map((f) => [f.path, f.from, f.own])), j([['Part 1.md', null, true]]), 'made again, named like the folder is named now');
}

// where a plan may put anything: in the folder, by names a vault writes, and never in the binder's folder of snapshots
{
	ok(mayPlace('One/Arrival.md', 'note') && mayPlace('One/', 'folder') && mayPlace('Snapshots/x.md', 'note', 'Part One') && mayPlace('One/Snapshots/x.md', 'note'), 'an ordinary place; and “Snapshots” is only the binder’s own at its top');
	for (const bad of ['../Out.md', '/Out.md', 'One/../../Out.md', '.obsidian/x.md', 'One\\Out.md', 'Snapshots/x.md', 'snapshots/Deep/x.md', ' Snapshots /x.md', '../Export styles/x.md', '../Other binder/x.md', 'x.txt']) ok(!mayPlace(bad, 'note'), `not “${bad}”`);
	ok(!mayPlace('Snapshots/', 'folder') && !mayPlace('../Up/', 'folder'), 'nor a folder there');
	// a snapshot that names such a place brings nothing back at all
	for (const bad of ['Snapshots/Planted.md', 'Snapshots/Deep/Planted.md', 'One\\Planted.md']) {
		const then = [...book(), note(bad, 'Planted.\n')], p = everything(then, swap(book(), 'Prologue.md', { text: 'Rewritten.\n' }));
		ok(p.unsafe && p.nothing && !p.all, `“${bad}” in the snapshot: nothing is planned, not even for the notes that are in the folder`);
	}
	const sub = [folder('Snapshots/'), note('Snapshots/Mine.md', 'A chapter called Snapshots, in a folder.\n')];
	ok(!everything(sub, [], { of: 'Part One', name: 'Part One' }).unsafe, '(in a folder of the binder, “Snapshots” is a folder like any other)');
	for (const bad of ['../Out.md', '/etc/x.md', '']) ok(everything([...book(), note(bad, 'x')], book()).unsafe, `“${bad}”: unsafe, as for every scope`);
}

// a note is the same but for where its links lead
{
	ok(sameButLinks('See [[The old keeper]] and [[The old keeper|him]].\n', 'See [[The keeper]] and [[Part One/The keeper|him]].\n'), 'a link’s target');
	ok(sameButLinks('A [map](Old/map.png) and ![[old.png]].\n', 'A [map](New/map.png) and ![[new.png]].\n'), 'a Markdown link’s, an embed’s');
	ok(sameButLinks('﻿One.\r\nTwo.\r\n', 'One.\nTwo.\n'), 'a byte-order mark and the kind of line ending');
	ok(!sameButLinks('See [[A|him]].\n', 'See [[A|her]].\n') && !sameButLinks('A [map](x).\n', 'A [chart](x).\n'), 'not a link’s own words: those are the writer’s');
	ok(!sameButLinks('See [[A]].\n', 'See [[A]]. And a word.\n') && !sameButLinks('---\nstatus: a\n---\nx', '---\nstatus: b\n---\nx'), 'and not a word anywhere else, in the text or the properties');
}

// what makes a plan another plan: an item made, renamed or moved; not a word written in a note
{
	const then = book(), now = swap(book(), 'One/The keeper.md', { path: 'One/The old keeper.md' }), base = everything(then, now);
	const typed = everything(then, swap(now, 'One/Arrival.md', { text: fm('label: Blue\nstatus: Draft', P(5, ' (arrival)') + '\nTyped meanwhile.\n') }));
	const arrived = everything(then, [...now, note('Arrived.md', 'From another device.\n')]);
	ok(!!base.all && !!typed.all && shape(base.all) === shape(typed.all), 'a note written in meanwhile: the same plan (that note alone is left)');
	ok(!!base.all && !!arrived.all && shape(base.all) !== shape(arrived.all), 'a note that arrived meanwhile: another plan');
}
done('binder snapshot text');
