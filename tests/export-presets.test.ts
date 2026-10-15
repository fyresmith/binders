import { buildBook } from '../src/export/book';
import { imprintOf, readDetails, seriesLine } from '../src/export/details';
import { readEpub } from './export-epub-read';
import { writeEpub } from '../src/export/epub';
import { blank, editPresets, followInExports, namesStyle, renameStyleInExports, freeName, readPreset, readPresets, seeds, takes, writePreset } from '../src/export/presets';
import type { SourceItem } from '../src/export/roles';
import { CLASSIC } from '../src/export/style';
import { done, eq, ok } from './harness';

const NAMES = { manuscript: 'Manuscript', ebook: 'Ebook', paperback: 'Paperback', scrivener: 'Scrivener project', note: 'One note' } as const;
const SEEDS = seeds({ ...NAMES });
const j = JSON.stringify;

// ---- a binder's exports, as its note has them ----
{
	eq(SEEDS.map((p) => `${p.name}:${p.kind}`).join(), 'Manuscript:manuscript,Ebook:ebook,Paperback:paperback,Scrivener project:scrivener,One note:note', 'a binder that has said nothing has one export of each kind, named for it');
	eq(j(readPresets(undefined, SEEDS)), j(SEEDS), 'no `exports`: the seeds');
	eq(readPresets([{ name: 'Kindle', kind: 'ebook' }, 'not one', { kind: 'ebook' }], SEEDS).map((p) => p.name).join(), 'Kindle', 'an entry that isn’t an export (no name, no kind it knows) is passed over');
	eq(j(readPresets([{ name: 'x', kind: 'fax' }], SEEDS)), j(SEEDS), 'a list with nothing readable in it is the seeds');
	const p = readPreset({ name: 'Critique group', kind: 'Manuscript', file: 'Word', folder: 'Part Two', numbering: 'from 1', 'leave out': ['[[B/Also by]]', 'title page'], isbn: '978-1' });
	ok(!!p && p.kind === 'manuscript' && p.file === 'docx' && p.scope.kind === 'folder' && p.fromOne && p.leaveOut?.length === 2 && p.isbn === '978-1', 'every key read, in the words a hand might write');
	eq(j(readPreset({ name: 'Arc', kind: 'ebook', filter: 'Mara' })?.scope), j({ kind: 'filter', name: 'Mara' }), 'a saved filter as what goes out');
	eq(j(writePreset(blank('Kindle', 'ebook'))), j({ name: 'Kindle', kind: 'ebook' }), 'a preset that says nothing more is its name and kind');
	eq(j(writePreset({ ...blank('A', 'manuscript'), fromOne: true })), j({ name: 'A', kind: 'manuscript' }), 'numbering is only written with a part of the book');
	if (p) eq(j(readPreset(writePreset(p))), j(p), 'what is written reads back the same');
	eq(freeName('Kindle', ['kindle', 'Kindle 2']), 'Kindle 3', 'a name not taken, compared as text is');
}

// ---- edits: the seeds written first, others' keys kept, nothing lost ----
{
	const added = editPresets(undefined, SEEDS, { kind: 'add', preset: blank('Kindle', 'ebook'), after: 'Ebook' });
	eq(added.map((e) => (e as { name: string }).name).join(), 'Manuscript,Ebook,Kindle,Paperback,Scrivener project,One note', 'the first edit writes the seeds out, and adds after the one chosen');
	eq(j(editPresets(added, SEEDS, { kind: 'add', preset: blank('kindle', 'ebook') })), j(added), 'a name taken: nothing changes');
	const raw = [{ name: 'Kindle', kind: 'ebook', future: 1 }, 'a note of the writer’s', { name: 'Kobo', kind: 'ebook' }];
	const set = editPresets(raw, SEEDS, { kind: 'set', name: 'kindle', preset: { ...blank('Kindle', 'ebook'), isbn: '978' } });
	eq(j(set), j([{ name: 'Kindle', kind: 'ebook', isbn: '978', future: 1 }, 'a note of the writer’s', { name: 'Kobo', kind: 'ebook' }]), 'a change keeps a key this Binders doesn’t know, and an entry that isn’t an export, in their places');
	eq(j(raw[0]), j({ name: 'Kindle', kind: 'ebook', future: 1 }), 'and never changes what it was given');
	eq((editPresets(raw, SEEDS, { kind: 'rename', name: 'Kindle', to: 'Kobo' })[0] as { name: string }).name, 'Kindle', 'a rename to a name taken is refused');
	eq((editPresets(raw, SEEDS, { kind: 'rename', name: 'Kindle', to: 'Amazon' })[0] as { name: string }).name, 'Amazon', 'a rename');
	eq(editPresets(raw, SEEDS, { kind: 'delete', name: 'Kobo' }).length, 2, 'a delete');
	eq(editPresets([{ name: 'Only', kind: 'ebook' }], SEEDS, { kind: 'delete', name: 'Only' }).length, 1, 'the last export is never deleted');
}

// ---- which front and back matter an export takes ----
{
	const p = { ...blank('Kindle', 'ebook'), leaveOut: ['[[B/Also by (Kobo)]]', 'copyright page'] };
	ok(takes(blank('M', 'manuscript'), 'B/Dedication', false) === false && takes(blank('E', 'ebook'), 'B/Dedication', true), 'an export that says nothing takes what its kind takes');
	ok(!takes(p, 'B/Also by (Kobo)', true) && takes(p, 'B/Also by (Kindle)', true), 'a note left out by its link; the rest are in');
	ok(!takes(p, 'copyright page', true) && takes(p, 'title page', true), 'a page Binders makes, by its words');
	ok(!takes({ ...p, leaveOut: ['[[Also by (Kobo)|the Kobo page]]'] }, 'B/Also by (Kobo)', true, (l) => (l === 'Also by (Kobo)' ? 'B/Also by (Kobo)' : l)), 'a short link, followed as Obsidian follows it');
}

// ---- renames followed ----
{
	const raw = [{ name: 'Critique', kind: 'manuscript', folder: 'Part Two/Act 1' }, { name: 'Kindle', kind: 'ebook', 'leave out': ['[[B/Also by (Kobo)]]', 'title page', '[[Also by (Kobo)]]'] }];
	const lead = () => false;
	eq((followInExports(raw, { folder: ['Part Two', 'Part 2'], leads: lead })?.[0] as { folder: string }).folder, 'Part 2/Act 1', 'a folder kept as what goes out follows its folder renamed, or one it is in');
	eq(followInExports(raw, { folder: ['Part Three', 'Part 3'], leads: lead }), null, 'nothing to follow: null, and nothing is written');
	const notes = followInExports(raw, { note: ['B/Also by (Kobo)', 'B/Back/Also by Kobo'], leads: lead })?.[1] as { 'leave out': string[] };
	eq(notes['leave out'].join('|'), '[[B/Back/Also by Kobo]]|title page|[[B/Back/Also by Kobo]]', 'a note left out follows its rename, written in full or short');
	eq(followInExports(raw, { note: ['B/Also by (Kobo)', 'B/X'], leads: () => true }), null, 'a link that still leads somewhere (Obsidian updated it) is left as it is');
	eq(j(raw[0]), j({ name: 'Critique', kind: 'manuscript', folder: 'Part Two/Act 1' }), 'what it was given is not changed');
}

// ---- a style renamed: the exports that name it follow ----
{
	const raw = [{ name: 'Kindle', kind: 'ebook', style: 'House' }, { name: 'Sub', kind: 'manuscript', style: 'House' }, { name: 'Print', kind: 'paperback' }];
	eq(j(renameStyleInExports(raw, 'book', 'House', 'Home')), j([{ name: 'Kindle', kind: 'ebook', style: 'Home' }, raw[1], raw[2]]), 'a book style renamed: the ebook that named it follows; a manuscript style of the same name is another style');
	eq(renameStyleInExports(raw, 'book', 'Other', 'X'), null, 'none named it: null');
	ok(namesStyle(raw, 'manuscript', 'House') && !namesStyle(raw, 'manuscript', 'Home'), 'whether a binder’s exports name a style');
}

// ---- part of the book: what goes out, and how it is numbered ----
const note = (path: string, text = 'Words here.', more: Partial<SourceItem> = {}): SourceItem => ({ kind: 'note', name: path.split('/').pop() ?? path, path: `${path}.md`, text, included: true, ...more });
const folder = (path: string, children: SourceItem[]): SourceItem => ({ kind: 'folder', name: path.split('/').pop() ?? path, path, included: true, children });
const ITEMS = [
	note('B/Dedication', 'For M.'),
	folder('B/Part One', [note('B/Part One/Arrival', 'One.'), note('B/Part One/Keeper', 'Two.')]),
	folder('B/Part Two', [note('B/Part Two/Wreck', 'Three.'), note('B/Part Two/Lights', 'Four.')]),
	note('B/Also by', 'Others.'),
];
{
	const base = { title: 'T', author: 'A', structure: 'parts' as const, matter: true };
	const whole = buildBook(ITEMS, base);
	eq(whole.sections.map((s) => `${s.role}${s.number ?? ''}`).join(), 'front,part1,chapter1,chapter2,part2,chapter3,chapter4,back', 'the whole book');
	const two = buildBook(ITEMS, { ...base, keep: (p) => p.startsWith('B/Part Two/') });
	eq(two.sections.map((s) => `${s.role}${s.number ?? ''}`).join(), 'part2,chapter3,chapter4', 'a folder: its part and chapters, numbered as in the whole book, and no front or back matter');
	eq(two.outline.map((r) => r.name).join(), 'Part Two,Wreck,Lights', 'Contents lists only what goes out');
	ok(!two.sections.some((s) => s.blocks.some((b) => b.kind === 'p' && JSON.stringify(b).includes('One.'))), 'and no word of what doesn’t');
	eq(buildBook(ITEMS, { ...base, keep: (p) => p.startsWith('B/Part Two/'), fromOne: true }).sections.map((s) => `${s.role}${s.number ?? ''}`).join(), 'part1,chapter1,chapter2', 'numbered from 1');
	eq(buildBook(ITEMS, { ...base, keep: (p) => p.endsWith('Keeper.md') || p.endsWith('Lights.md') }).sections.map((s) => `${s.role}${s.number ?? ''}`).join(), 'part1,chapter2,part2,chapter4', 'notes a filter keeps, each with the folders that hold it');
	eq(buildBook(ITEMS, { ...base, keep: () => false }).sections.length, 0, 'nothing kept: nothing goes out');
	const some = buildBook(ITEMS, { ...base, matter: (p) => p !== 'B/Also by.md' });
	eq(some.sections.map((s) => s.role).join(), 'front,part,chapter,chapter,part,chapter,chapter', 'front and back matter by the note: “Also by” left out');
	eq(some.outline.filter((r) => r.taken !== undefined).map((r) => `${r.name}=${r.taken}`).join(), 'Dedication=true,Also by=false', 'and Contents says which it takes');
}

// ---- publishing: the title and copyright pages, and the ebook's own metadata ----
{
	const d = readDetails({ series: 'The Corran Light', 'series-number': 2, publisher: 'Lantern Press', edition: 'First edition', published: '2026-11-03', description: 'A keeper & a light.', keywords: ['sea', 'Cornwall'], contributors: ['Editor: June Hale', 'Cover designer: Tom Reyes', 'nonsense'], rights: 'All rights reserved.\nA work of fiction.' });
	eq(d.contributors.map((c) => `${c.role}=${c.name}`).join(), 'editor=June Hale,cover designer=Tom Reyes', 'contributors as “Role: Name”; a line that isn’t one is passed over');
	eq(seriesLine(d), 'The Corran Light, Book Two', 'the series line, its number in words');
	eq(seriesLine({ ...d, seriesNumber: '' }), 'The Corran Light', 'and without a number');
	eq(imprintOf(d, '978-1-7390112-0-4', true).join('|'), '|All rights reserved.|A work of fiction.||First edition, 2026|ISBN 978-1-7390112-0-4||Edited by June Hale|Cover design by Tom Reyes||Published by Lantern Press', 'the copyright page in its groups, with a line between them');
	eq(imprintOf(d, '978', false).length, 0, 'a manuscript has no copyright page');
	const book = buildBook([note('B/One', 'Text.')], { title: 'The Lighthouse', author: 'Iris Calloway', matter: true, year: 2026, series: seriesLine(d), publisher: d.publisher, imprint: imprintOf(d, '978-1-7390112-0-4', true), made: { titlePage: true }, about: { isbn: '978-1-7390112-0-4', series: d.series, seriesNumber: d.seriesNumber, publisher: d.publisher, published: d.published, description: d.description, keywords: d.keywords, contributors: d.contributors } });
	const page = book.sections.find((s) => s.matter === 'copyright');
	eq(page?.blocks.map((b) => (b.kind === 'p' ? b.runs.map((r) => (r.kind === 'text' ? r.text : '')).join('') : '')).join('|'), '© 2026 Iris Calloway|All rights reserved.|A work of fiction.| |First edition, 2026|ISBN 978-1-7390112-0-4| |Edited by June Hale|Cover design by Tom Reyes| |Published by Lantern Press', 'the copyright page: the line and the rights under it, then the groups with a line between');
	const e = readEpub(writeEpub(book, CLASSIC, { when: new Date('2026-10-15T12:00:00Z') }));
	for (const [want, what] of [
		['<dc:identifier id="isbn">urn:isbn:9781739011204</dc:identifier>', 'the ISBN'],
		['<dc:publisher>Lantern Press</dc:publisher>', 'the publisher'],
		['<dc:date>2026-11-03</dc:date>', 'the date'],
		['<dc:description>A keeper &amp; a light.</dc:description>', 'the description'],
		['<dc:subject>Cornwall</dc:subject>', 'a keyword'],
		['<meta refines="#contrib1" property="role" scheme="marc:relators">edt</meta>', 'an editor’s role'],
		['<meta property="belongs-to-collection" id="series">The Corran Light</meta>', 'the series'],
		['<meta refines="#series" property="group-position">2</meta>', 'its number'],
	]) ok(e.opf.includes(want), `the ebook’s package says ${what}`);
	const title = Object.entries(e.files).find(([n]) => /title/.test(n))?.[1] ?? '';
	ok(title.includes('<p class="series">The Corran Light, Book Two</p>') && title.includes('<p class="imprint">Lantern Press</p>'), 'the ebook’s title page has the series and the publisher');
}

done('export presets');
