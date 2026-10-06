// The demo vault's generator (scripts/demo-vault/build.mjs): the same files every time, in the plugin's own format
// (checked with the plugin's own readers), and a re-run that never writes over a person's work.
// @ts-expect-error a plain module, without types
import { LABELS, SCENARIOS, hash, note, oddFiles, oddNames, plan, prose, reconcile, rng, snapshot, yamlText } from '../scripts/demo-vault/build.mjs';
import { readIndex } from '../src/model';
import { readLabels } from '../src/view/labels';
import { countWords } from '../src/view/words';
import { readSnapshot, readSnapshotName } from '../src/snapshot-text';
import { done, eq, ok } from './harness';

type Files = Map<string, string | Uint8Array>;
interface Scenario { folder: string; group: string; path: string; about: string; tryIt?: string; binder?: boolean }
const j = (x: unknown) => JSON.stringify(x);
const text = (files: Files, path: string): string => { const d = files.get(path); return typeof d === 'string' ? d : ''; };
/** A `contents` list as this generator writes one, read back (one entry to a line, quoted or bare). */
const contents = (noteText: string): string[] => {
	const m = /^contents:\n((?: {2}- .*\n)*)/m.exec(noteText);
	return m ? m[1].trimEnd().split('\n').filter(Boolean).map((l) => { const v = l.slice(4); return v.startsWith('"') ? JSON.parse(v) as string : v; }) : [];
};

// the same every time
{
	const a = rng('x'), b = rng('x'), c = rng('y');
	const run = (r: () => number) => [r(), r(), r()].join();
	const first = run(a);
	eq(first, run(b), 'one seed, one run of numbers');
	ok(first !== run(c), 'another seed, another run');
	eq(prose(rng('p'), 500), prose(rng('p'), 500), 'the same prose from the same seed');
	eq(countWords(prose(rng('p'), 500)), 500, 'as many words as asked for, as the plugin counts them');
	eq(countWords(prose(rng('q'), 1)), 1, 'one word');
	const one = plan() as Files, two = plan() as Files;
	eq(one.size, two.size, 'the same number of files');
	eq(j([...one].map(([p, d]) => [p, hash(d)])), j([...two].map(([p, d]) => [p, hash(d)])), 'every file the same, in the same order');
}

// YAML as Obsidian reads it back
{
	eq(yamlText('Part One/Arrival'), 'Part One/Arrival', 'a plain name is written bare');
	eq(yamlText('1984'), '"1984"', 'a number is quoted, to stay a name');
	eq(yamlText('true'), '"true"', 'so is a word YAML reads as yes or no');
	eq(yamlText('# hash'), '"# hash"', 'and one that starts like a comment');
	eq(yamlText('a: b'), '"a: b"', 'and one with a colon');
	eq(yamlText('#7c3aed'), '"#7c3aed"', 'a hex color');
	eq(note({ synopsis: 'One.', target: 5, contents: ['A', 'B/'], none: undefined }, 'Text\n'), '---\nsynopsis: One.\ntarget: 5\ncontents:\n  - A\n  - B/\n---\nText\n', 'a note: properties, then text');
	eq(note({ contents: [] }), '---\ncontents: []\n---\n', 'an empty list');
	eq(note({}, 'Text'), 'Text', 'no properties, no dashes');
}

// what's in the vault
{
	const files = plan() as Files, paths = [...files.keys()];
	const under = (folder: string) => paths.filter((p) => p.startsWith(folder + '/'));
	for (const s of SCENARIOS as Scenario[]) {
		ok(under(s.path).length > 0, `${s.folder} has files`);
		ok(s.path === `${s.group}/${s.folder}` && ['Examples', 'Stress tests'].includes(s.group), `${s.folder} is in one of the vault’s two folders`);
		ok(text(files, 'README.md').includes(`|${s.folder}]] | ${s.about} |${s.tryIt ? ` ${s.tryIt} |` : ''}`), `the README says what ${s.folder} is for`);
	}
	ok(paths.every((p) => /^(Examples|Stress tests|\.obsidian)\/|^README\.md$/.test(p)), 'nothing else is at the top of the vault');
	ok(paths.every((p) => !p.startsWith('/') && !p.split('/').includes('..')), 'every path stays in the vault');
	ok(paths.every((p) => p.split('/').every((part) => new TextEncoder().encode(part).length <= 255 && !/[*"\\<>:|?]/.test(part))), 'every name is one any system can hold');

	// the huge binder: 5,000 notes in 200 folders, every one of them in the list
	const huge = under('Stress tests/Five thousand notes'), hugeNote = text(files, 'Stress tests/Five thousand notes/Five thousand notes.md');
	eq(huge.length, 5001, '5,000 notes and the binder note');
	const folders = new Set(huge.flatMap((p) => { const parts = p.split('/').slice(2, -1); return parts.map((_, i) => parts.slice(0, i + 1).join('/')); }));
	eq(folders.size, 200, '200 folders');
	const list = readIndex({ binder: 1, contents: contents(hugeNote) }, 'Five thousand notes').contents;
	eq(list.length, 5200, 'the list has every note and folder, as the plugin reads it');
	ok(list.every((e) => (e.endsWith('/') ? folders.has(e.slice(0, -1)) : files.has(`Stress tests/Five thousand notes/${e}.md`))), 'and nothing that isn’t there');

	// fifteen deep
	eq(Math.max(...under('Stress tests/Fifteen folders deep').map((p) => p.split('/').length - 3)), 15, 'fifteen folders deep');
	eq(countWords(text(files, 'Stress tests/One long note/A hundred thousand words.md')), 100000, 'a note of 100,000 words');
	eq(under('Stress tests/Empty binder').length, 1, 'the empty binder has only its note');
	eq(under('Stress tests/One note').length, 2, 'the binder of one note');

	// sixty labels, as the plugin's settings read them, and each used
	const data = JSON.parse(text(files, '.obsidian/plugins/binders/data.json')) as { labels: unknown };
	eq(readLabels(data.labels)?.length, 60, 'sixty labels in settings, none dropped as a duplicate');
	eq(j(readLabels(data.labels)), j(LABELS), 'each read back as written (a color the plugin knows)');
	const used = new Set(under('Stress tests/Sixty labels').map((p) => /^label: (.*)$/m.exec(text(files, p))?.[1]).filter(Boolean));
	eq(used.size, 60, 'every one of them on a note');
	ok(under('Stress tests/Sixty labels').filter((p) => p !== 'Stress tests/Sixty labels/Sixty labels.md').every((p) => /^label: /m.test(text(files, p))), 'and every note has one');

	// the novel: every listed item is there, and its snapshots read back
	const novel = contents(text(files, 'Stress tests/The Salt Road/The Salt Road.md'));
	ok(novel.length > 20 && novel.every((e) => (e.endsWith('/') ? under('Stress tests/The Salt Road/' + e.slice(0, -1)).length > 0 : files.has(`Stress tests/The Salt Road/${e}${/\.\w+$/.test(e) ? '' : '.md'}`))), 'the novel’s list names what’s there');
	const snaps = under('Stress tests/The Salt Road/Snapshots');
	ok(snaps.length >= 5 && snaps.every((p) => p.endsWith('.snapshot')), 'snapshots, in the folder the plugin keeps them in');
	for (const p of snaps) {
		const of = p.split('/').slice(3, -1).join('/'), read = readSnapshot(text(files, p));
		eq(read.of, of, `${p} says whose it is`);
		ok(!!readSnapshotName(p.split('/').pop().replace(/\.snapshot$/, '')) && read.taken !== null, `${p} is named and dated as the plugin does it`);
	}
	ok(snaps.some((p) => !files.has(`Stress tests/The Salt Road/${p.split('/').slice(3, -1).join('/')}.md`)), 'one is of a note that’s gone');
	eq(snapshot('A/B', '2026-09-12 09.15.40', 'Text\n'), '---\nsnapshot-of: "A/B"\ntaken: 2026-09-12T09:15:40\n---\nText\n', 'a snapshot’s file');

	// a newer format: refused by the plugin's own reader
	let refused = false;
	try { readIndex({ binder: 99, contents: [] }); } catch { refused = true; }
	ok(refused && /^---\nbinder: 99\n/.test(text(files, 'Stress tests/Newer format/Newer format.md')), 'the newer-format binder note is one the plugin refuses');

	// Longform: flat, indented, ignored files
	ok(/ {4}- - Ticket office\n {6}- The crossing\n {6}- - Engine room\n/.test(text(files, 'Stress tests/Longform nested/Index.md')), 'scenes indented under others, two levels');
	ok(!/- - /.test(text(files, 'Stress tests/Longform flat/Index.md')) && /ignoredFiles:\n {4}- Notes\*\n/.test(text(files, 'Stress tests/Longform flat/Index.md')), 'a flat project, with ignored files');
	ok(files.has('Stress tests/Longform flat/Notes on ferries.md') && files.has('Stress tests/Longform flat/Old-draft.md'), 'and the files they ignore');

	// the rest
	ok(files.has('Stress tests/Binder in a binder/Inner/Inner.md') && /^---\nbinder: 1\n/.test(text(files, 'Stress tests/Binder in a binder/Inner/Inner.md')), 'a binder note inside a binder');
	ok(files.has('Stress tests/Named like its folder/Letters/Letters.md') && !text(files, 'Stress tests/Named like its folder/Letters/Letters.md').startsWith('---'), 'a note named like its folder that is all text');
	ok(!/^binder:/m.test(text(files, 'Stress tests/Not a binder/Not a binder.md')) && under('Stress tests/Not a binder').every((p) => !/^binder:/m.test(text(files, p))), 'a folder that is not a binder');
	const kinds = new Set(under('Stress tests/Mixed files').map((p) => p.split('.').pop()));
	ok(['md', 'canvas', 'png', 'jpg', 'pdf'].every((k) => kinds.has(k)), 'canvases, images and a PDF among the notes');
	const png = files.get('Stress tests/Mixed files/Cover.png'), pdf = files.get('Stress tests/Mixed files/Contract.pdf');
	ok(typeof png !== 'string' && png[0] === 0x89 && png[1] === 0x50, 'a real PNG');
	ok(typeof pdf !== 'string' && String.fromCharCode(...pdf.slice(0, 5)) === '%PDF-', 'a real PDF');
	ok(JSON.parse(text(files, 'Stress tests/Mixed files/Map.canvas')).nodes.length === 3, 'a canvas Obsidian can read');

	// settings that turn the plugin on, and a workspace that opens the README
	eq(text(files, '.obsidian/community-plugins.json').trim(), '[\n  "binders"\n]', 'the plugin is turned on');
	const ws = JSON.parse(text(files, '.obsidian/workspace.json')) as { active: string; main: { children: { children: { id: string; state: { state: { file: string } } }[] }[] } };
	const leaf = ws.main.children[0].children[0];
	ok(leaf.id === ws.active && leaf.state.state.file === 'README.md' && files.has('README.md'), 'the workspace opens the README');
	eq(text(files, '.obsidian/plugins/binders/.hotreload'), '', 'the marker the Hot Reload plugin looks for');
}

// odd names and odd files
{
	const all = oddNames() as string[];
	ok(all.includes('Chapter') && all.includes('chapter') && all.includes('CHAPTER'), 'names that differ only in case');
	ok(!(oddNames({ caseSensitive: false }) as string[]).includes('chapter'), 'left out where the disk can’t hold them');
	const accents = all.filter((n) => n.normalize('NFC').startsWith('Café'));
	ok(accents.length === 2 && accents[0].slice(0, 4) !== accents[1].slice(0, 4), 'one name written two ways');
	eq((oddNames({ bothForms: false }) as string[]).filter((n) => n.normalize('NFC').startsWith('Café')).length, 1, 'one of them where the disk takes them for the same');
	ok(all.some((n) => /\p{Extended_Pictographic}/u.test(n)) && all.some((n) => /[\u0600-\u06ff]/.test(n)) && all.some((n) => /[\u0590-\u05ff]/.test(n)) && all.some((n) => /[\u0300-\u036f]/.test(n)), 'emoji, right-to-left, combining marks');
	ok(all.some((n) => n.length > 150) && all.some((n) => /[#^[\]]/.test(n)), 'a very long name, and ones a link has to escape');
	eq(new Set(all).size, all.length, 'no name twice');
	const odd = plan() as Files, inList = contents(text(odd, 'Stress tests/Odd names/Odd names.md'));
	ok(all.every((n) => inList.includes(n)), 'each written in the list so that it reads back as itself');

	const f = oddFiles(rng('f')) as Record<string, string>;
	ok(/\r\n/.test(f['Windows line endings (CRLF)']) && !/[^\r]\n/.test(f['Windows line endings (CRLF)']), 'CRLF throughout');
	ok(!f['Old Mac line endings (lone CR)'].includes('\n') && f['Old Mac line endings (lone CR)'].includes('\r'), 'lone CR throughout');
	eq(f['Byte-order mark'].charCodeAt(0), 0xfeff, 'a byte-order mark');
	ok(f['Only frontmatter'].endsWith('---\n') && f['Only frontmatter, no last newline'].endsWith('---'), 'only frontmatter, with and without a last newline');
	ok(f['Empty frontmatter then a rule'].startsWith('---\n---\n\n---\n'), 'empty frontmatter, then a rule');
	ok(!f['No trailing newline'].endsWith('\n'), 'no trailing newline');
	ok(f['Tabs in frontmatter'].includes('\n\tindented'), 'a tab indenting a property');
	eq(f['Empty file'], '', 'an empty file');
	eq(new TextDecoder().decode(new TextEncoder().encode(f['Byte-order mark'])).length, f['Byte-order mark'].length - 1, '(a decoder drops the mark: the file has to be compared as bytes)');
}

// a re-run: only what the generator made, and only if it's still as it was left
{
	const h = (s: string) => hash(s) as string;
	const disk = new Map<string, string>(), onDisk = (p: string) => disk.get(p) ?? null;
	const next = new Map([['a.md', h('a1')], ['b.md', h('b1')], ['c.md', h('c1')]]);
	// the first run, into a folder that already has a c.md of the person's own
	disk.set('c.md', h('mine'));
	let r = reconcile(next, {}, onDisk);
	eq(j(r.write), j(['a.md', 'b.md']), 'the first run writes what isn’t there');
	eq(j(r.kept), j(['c.md']), 'and leaves a file that was there first');
	ok(!('c.md' in r.files), 'which it doesn’t count as its own');
	for (const p of r.write) disk.set(p, next.get(p));
	const made = r.files as Record<string, string>;

	// nothing changed
	r = reconcile(next, made, onDisk);
	eq(j([r.write, r.remove, r.kept, r.gone]), j([[], [], ['c.md'], []]), 'a second run writes nothing');

	// the generator changes a.md and b.md and adds d.md; the person changed b.md, and added e.md
	disk.set('b.md', h('my b')); disk.set('e.md', h('my e'));
	const next2 = new Map([['a.md', h('a2')], ['b.md', h('b2')], ['c.md', h('c1')], ['d.md', h('d1')]]);
	r = reconcile(next2, made, onDisk);
	eq(j(r.write), j(['a.md', 'd.md']), 'an untouched file is updated, a new one written');
	eq(j(r.kept), j(['b.md', 'c.md']), 'a changed one is kept');
	eq(r.files['b.md'], made['b.md'], 'and still counted as generated');
	ok(!r.write.includes('e.md') && !r.remove.includes('e.md'), 'a file the person added is never touched');

	// a generated file the person deleted (or moved, which is the same from here) stays gone
	disk.delete('a.md');
	r = reconcile(next, made, onDisk);
	eq(j([r.write, r.gone]), j([[], ['a.md']]), 'a deleted file is not made again');
	disk.set('a.md', made['a.md']);

	// the generator stops making a.md and b.md
	const next3 = new Map([['c.md', h('c1')]]);
	r = reconcile(next3, made, onDisk);
	eq(j(r.remove), j(['a.md']), 'a file the generator no longer makes is removed if untouched');
	ok(r.kept.includes('b.md') && !('b.md' in r.files), 'and kept, and let go of, if changed');

	// --reset
	disk.delete('a.md');
	r = reconcile(next, made, onDisk, true);
	eq(j(r.write), j(['a.md', 'b.md']), 'reset puts back generated files that were changed or deleted');
	eq(j(r.kept), j(['c.md']), 'but still not a file that was never generated');

	// a lost manifest: files identical to what would be written are adopted, the rest kept
	disk.set('a.md', h('a1'));
	r = reconcile(next, {}, onDisk);
	ok(r.files['a.md'] === h('a1') && !r.write.length && j(r.kept) === j(['b.md', 'c.md']), 'without its list, it claims only files identical to its own');
}

done('demo vault');
