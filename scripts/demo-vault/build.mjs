// The demo vault's pure parts: what files it has (the same every time, from a seed) and which of them a re-run may
// write. No file is read or written here, so tests/demo-vault.test.ts can check it; scripts/make-demo-vault.mjs does
// the writing. The example books are in examples/ (one module each, their text written by prose.mjs from the
// sentences in stock/); the stress binders are here.
import { SEED, canvas, hash, int, note, p2, pick, prose, rng, snapshot } from './core.mjs';
import { EXAMPLES } from './examples/index.mjs';

export { SEED, hash, note, prose, rng, snapshot, yamlText } from './core.mjs';
export { EXAMPLES };
/** Where the generator keeps the list of what it wrote, in the vault. */
export const MANIFEST = '.demo-vault.json';
/** The two folders at the top of the vault: the books to try Binders on, and the binders that try to break it. */
export const GROUPS = { examples: 'Examples', stress: 'Stress tests' };

function hex(h, s, l) {
	const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
	return `#${f(0)}${f(8)}${f(4)}`;
}

const PALETTE = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'];
const MORE = ('Amber Apricot Ash Azure Beige Brick Bronze Burgundy Charcoal Cherry Cobalt Copper Coral Cream Crimson Denim Emerald Fawn ' +
	'Forest Fuchsia Garnet Gold Indigo Ivory Jade Khaki Lavender Lemon Lilac Lime Magenta Maroon Mauve Mint Moss Mustard Navy Ochre ' +
	'Olive Peach Pearl Plum Rose Ruby Rust Sage Sand Scarlet Sienna Slate Teal Violet').split(' ');
/** Sixty labels for the vault's settings: Obsidian's eight colors, then 52 with a color of their own. */
export const LABELS = [
	...PALETTE.map((name) => ({ name, color: name.toLowerCase() })),
	...MORE.map((name, i) => ({ name, color: hex(Math.round(i * 360 / MORE.length), 0.55, 0.5) })),
];

// A 1×1 PNG, a 1×1 JPEG and a one-page PDF: real files, so Obsidian opens them
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');
function pdf() {
	const objs = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		null,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
	];
	const stream = 'BT /F1 18 Tf 24 72 Td (A PDF in a binder) Tj ET';
	objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
	let out = '%PDF-1.4\n';
	const at = objs.map((o, i) => { const pos = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return pos; });
	const xref = out.length;
	out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(out, 'latin1');
}


// ---- the binders ----
// Each has a folder, a line for the README, and `make(add, rand, opts)`, which adds its files (paths inside its folder).

/** A small novel as a writer would have it: every kind of card data, and a few snapshots. */
function novel(add, rand) {
	const parts = [
		['Part One', 'Revised', 'Ansa leaves the pans for the city, carrying her father’s ledger.', 18000, [
			['The salt pans', 'Blue', 'Done', 'Ansa rakes the last pan of the season and finds the ledger in the brine shed.', 1200, 900],
			['A buyer from the city', 'Green', 'Done', 'Tomas Reyl offers twice the price, and asks too many questions.', 1500, 1400],
			['What the ledger says', 'Blue', 'Revised', 'Three names, a debt, and a date ten years gone.', 1000, 700],
			['The carter', 'Blue', 'Revised', 'She pays for a place on the salt cart with her mother’s ring.', 1200, 1100],
			['First night on the road', 'Purple', 'Draft', 'The carter tells the story of the drowned toll house.', 1500, 600],
		]],
		['Part Two', 'Draft', 'The city, the guild, and the first of the three names.', 30000, [
			['The gate', 'Blue', 'Draft', 'Ansa is taxed on salt she isn’t carrying.', 1200, 1250],
			['Reyl at the guild hall', 'Green', 'Draft', 'Reyl reports to the masters, and lies about what he saw.', 1800, 1500],
			['The first name', 'Blue', 'Draft', 'A chandler who swears he never met her father.', 1500, 400],
			['Letters home', '#7c3aed', 'draft', 'Three letters she writes and one she sends.', 800, 820],
			['The assay', 'Red', 'Idea', 'The guild tests the pans’ salt, in public.', 2000, 0],
			['A room over the dyer’s', 'Flashback', 'Needs research', 'Her father, ten years ago, in the same room.', 1500, 150],
			['The second name', 'Blue', 'Idea', '', 1500, 0],
		]],
		['Part Three', 'Idea', 'What was owed, and who pays it.', 30000, [
			['The toll house', 'Purple', 'Idea', 'The carter’s story was a map.', 2000, 0],
			['Reyl chooses', 'Green', 'Idea', '', 0, 0],
			['The third name', 'Blue', 'Idea', 'It is her own.', 2500, 60],
		]],
	];
	const contents = ['Prologue'];
	add('Prologue.md', note({ synopsis: 'A cart of salt goes through the ice, ten years before.', status: 'Done', label: 'Purple', target: 600 }, 'The ice held the first cart and the second.\n\n' + prose(rand, 540)));
	for (const [part, status, synopsis, target, scenes] of parts) {
		contents.push(part + '/');
		add(`${part}/${part}.md`, note({ synopsis, status, target }, 'Notes on this part go here: a folder note’s own text.\n'));
		for (const [name, label, st, syn, tgt, words] of scenes) {
			contents.push(`${part}/${name}`);
			add(`${part}/${name}.md`, note({ synopsis: syn || undefined, status: st, label, target: tgt || undefined }, words ? prose(rand, words) : ''));
		}
	}
	contents.push('Epilogue', 'Research/', 'Research/Salt making', 'Research/Guild ranks', 'Research/Map of the road.canvas');
	add('Epilogue.md', note({ synopsis: 'The pans, a year on.', status: 'Idea', label: 'Purple' }, ''));
	add('Research/Research.md', note({ synopsis: 'Not part of the book: left out of every export.', export: false }, ''));
	add('Research/Salt making.md', note({ export: false, label: 'Yellow' }, prose(rand, 300)));
	add('Research/Guild ranks.md', note({ compile: false, label: 'Yellow' }, '- Master\n- Warden\n- Factor\n- Carter\n'));
	add('Research/Map of the road.canvas', canvas([{ type: 'text', text: 'The pans' }, { type: 'text', text: 'The toll house' }, { type: 'text', text: 'The city' }]));
	add('A note the list doesn’t mention.md', note({ synopsis: 'New notes show after the listed ones until they’re moved.' }, prose(rand, 80)));
	add('The Salt Road.md', note({ binder: 1, contents, target: 80000, synopsis: 'A salt raker’s daughter follows her father’s ledger to the city that ruined him.' }, 'Notes on the book: the binder note’s own text.\n'));
	// earlier drafts of three scenes, and one of a note that's gone ("Snapshots of notes that are gone")
	add('Snapshots/Part One/The salt pans/2026-08-02 08.10.05 First draft.snapshot', snapshot('Part One/The salt pans', '2026-08-02 08.10.05', prose(rand, 600)));
	add('Snapshots/Part One/The salt pans/2026-08-20 21.44.31 Before cutting the brother.snapshot', snapshot('Part One/The salt pans', '2026-08-20 21.44.31', prose(rand, 1100)));
	add('Snapshots/Part One/The salt pans/2026-09-12 09.15.40.snapshot', snapshot('Part One/The salt pans', '2026-09-12 09.15.40', prose(rand, 880)));
	add('Snapshots/Part Two/The gate/2026-09-14 17.02.11 Present tense.snapshot', snapshot('Part Two/The gate', '2026-09-14 17.02.11', prose(rand, 1200)));
	add('Snapshots/Prologue/2026-07-30 06.55.00.snapshot', snapshot('Prologue', '2026-07-30 06.55.00', prose(rand, 500)));
	add('Snapshots/Part Two/The ferry/2026-08-11 12.00.00 Cut.snapshot', snapshot('Part Two/The ferry', '2026-08-11 12.00.00', prose(rand, 700)));
}

/** 5,000 notes in 200 folders: ten parts of nineteen chapters, 26 notes a chapter and six loose in each part. */
function huge(add, rand) {
	const contents = [], statuses = ['Idea', 'Draft', 'Revised', 'Done'];
	const scene = (path, n) => {
		contents.push(path);
		add(path + '.md', note({ synopsis: rand() < 0.5 ? `Scene ${n}, in a few words.` : undefined, status: rand() < 0.7 ? pick(rand, statuses) : undefined, label: rand() < 0.3 ? pick(rand, PALETTE) : undefined }, prose(rand, int(rand, 30, 120))));
	};
	let n = 0;
	for (let p = 1; p <= 10; p++) {
		const part = `Part ${p2(p)}`;
		contents.push(part + '/');
		for (let i = 1; i <= 6; i++) scene(`${part}/Interlude ${p2(p)}.${i}`, ++n);
		for (let c = 1; c <= 19; c++) {
			const ch = `${part}/Chapter ${p2(p)}.${p2(c)}`;
			contents.push(ch + '/');
			for (let s = 1; s <= 26; s++) scene(`${ch}/Scene ${String(++n).padStart(4, '0')}`, n);
		}
	}
	add('Five thousand notes.md', note({ binder: 1, contents, target: 400000 }));
}

function deep(add, rand) {
	const contents = [];
	let dir = '';
	for (let i = 1; i <= 15; i++) {
		dir += `Level ${p2(i)}/`;
		contents.push(dir, `${dir}Note at level ${p2(i)}`);
		add(`${dir}Note at level ${p2(i)}.md`, note({ synopsis: `${i} folder${i > 1 ? 's' : ''} down.` }, prose(rand, 60)));
	}
	add('Top.md', prose(rand, 60));
	add('Fifteen folders deep.md', note({ binder: 1, contents: ['Top', ...contents] }));
}

function sixty(add, rand) {
	const contents = [];
	for (let i = 0; i < 120; i++) {
		const label = LABELS[i % 60].name, name = `${p2(i + 1)} ${label}${i >= 60 ? ' again' : ''}`;
		contents.push(name);
		add(name + '.md', note({ label, status: pick(rand, ['Idea', 'Draft', 'Revised', 'Done']) }, prose(rand, 40)));
	}
	add('Sixty labels.md', note({ binder: 1, contents }));
}

/** Names that trip up sorting, links, YAML and file systems. Pairs that only some file systems can hold are left out
    where they can't. */
export function oddNames({ caseSensitive = true, bothForms = true } = {}) {
	const names = [
		'🌊 Tide tables', '👩‍👩‍👧 Three people, one emoji', 'فصل أول', 'פרק שני mixed with English', 'Z̷̢̛a̴͝l̵̕g̶͠o̷',
		'Hash # and caret ^', '[Brackets] (parens) {braces}', 'Percent 50% & ampersand', 'It’s got ‘curly’ and \'straight\' quotes', 'Comma, semicolon; equals = plus +',
		'1984', 'true', 'null', '# starts like a YAML comment', '- starts like a list', 'Two  spaces inside', 'notes.md', 'Dots.in.the.name v1.2', '@at !bang $dollar ~tilde',
		'A very long name ' + 'that goes on and on '.repeat(8).trim(),
		'Caf\u00e9 (one character for \u00e9)',
	];
	if (bothForms) names.push('Cafe\u0301 (e and a combining accent)');
	if (caseSensitive) names.push('Chapter', 'chapter', 'CHAPTER');
	return names;
}
function odd(add, rand, opts) {
	const names = oddNames(opts), contents = [...names];
	for (const n of names) add(n + '.md', note({ synopsis: `Named “${n.length > 60 ? n.slice(0, 60) + '…' : n}”.` }, prose(rand, 40)));
	for (const dir of ['📁 An emoji folder', 'مجلد', 'Folder [with] #signs']) {
		contents.push(dir + '/', `${dir}/Inside`);
		add(`${dir}/Inside.md`, prose(rand, 40));
	}
	add('Odd names.md', note({ binder: 1, contents }, 'Links to try: [[Hash # and caret ^]], [[notes.md]], [[1984]], [[🌊 Tide tables]].\n'));
}

/** Notes whose bytes are unusual. Each is written exactly as given: nothing normalises a line ending on the way. */
export function oddFiles(rand) {
	return {
		'Windows line endings (CRLF)': '---\r\nsynopsis: Every line ends in CR LF.\r\nstatus: Draft\r\n---\r\nFirst line.\r\n\r\nSecond paragraph.\r\n',
		'Old Mac line endings (lone CR)': '---\rsynopsis: Every line ends in a lone CR.\r---\rFirst line.\r\rSecond paragraph.\r',
		'Mixed line endings': '---\nsynopsis: LF in the properties, CRLF and CR below.\n---\nA line ending in LF.\nA line ending in CRLF.\r\nA line ending in CR.\rThe last line.\n',
		'Byte-order mark': '﻿---\nsynopsis: Starts with a byte-order mark.\n---\nThe file’s first three bytes are EF BB BF.\n',
		'Only frontmatter': '---\nsynopsis: Properties and no text.\nstatus: Idea\n---\n',
		'Only frontmatter, no last newline': '---\nsynopsis: Properties, no text, and no newline after the closing dashes.\n---',
		'Empty frontmatter then a rule': '---\n---\n\n---\n\nText after a rule that follows empty properties.\n',
		'A rule on the first line': '---\n\nThe dashes above are a rule, not properties: nothing closes them.\n',
		'Frontmatter never closed': '---\nsynopsis: These dashes are never closed.\n\nSo this is all text.\n',
		'No trailing newline': '---\nsynopsis: The last line has no newline.\n---\nThe file ends right after this full stop.',
		'Invalid YAML': '---\nsynopsis: [an unclosed list\nstatus: : :\n   bad: indent\n---\nThe properties above can’t be read. This text should still be here.\n',
		'Tabs in frontmatter': '---\nsynopsis:\tA tab after the colon.\nstatus:\tDraft\n\tindented: with a tab\n---\nYAML doesn’t allow tabs for indenting.\n',
		'Properties of the wrong type': '---\nsynopsis:\n  - a list\n  - not text\nstatus: 7\nlabel: {a: map}\ntarget: lots\ncompile: maybe\n---\nEvery property here is the wrong type.\n',
		'Empty file': '',
		'Only blank lines': '\n\n   \n\t\n',
		'One very long line': 'word '.repeat(4000).trim() + ' ' + 'x'.repeat(20000) + '\n',
		'Ordinary, for comparison': note({ synopsis: 'Nothing odd about this one.', status: 'Draft' }, prose(rand, 80)),
	};
}

function longform(add, rand, nested) {
	const scenes = nested ? ['Harbor', 'Ticket office', 'The crossing', 'Engine room', 'Island', 'Return'] : ['One', 'Two', 'Three', 'Four', 'Five'];
	for (const s of scenes) add(s + '.md', note({ synopsis: `The scene called ${s}.`, status: 'Draft' }, prose(rand, 150)));
	add('Unlisted scene.md', prose(rand, 60));
	add('Notes on ferries.md', 'Not a scene: `ignoredFiles` has `Notes*`.\n');
	add('Old-draft.md', 'Not a scene: `ignoredFiles` has `*-draft`.\n');
	const list = nested
		? '    - Harbor\n    - - Ticket office\n      - The crossing\n      - - Engine room\n    - Island\n    - Return\n'
		: scenes.map((s) => `    - ${s}\n`).join('');
	add('Index.md', `---\nlongform:\n  format: scenes\n  title: ${nested ? 'The ferry' : 'Five scenes'}\n  workflow: Default Workflow\n  sceneFolder: /\n  scenes:\n${list}  ignoredFiles:\n    - Notes*\n    - "*-draft"\nsynopsis: A Longform project, ${nested ? 'with scenes indented under others' : 'flat'}.\ntarget: 5000\n---\nLongform’s index note. Binders writes only \`longform.scenes\` here.\n`);
}

const NEWER = '---\nbinder: 99\ncontents:\n  - id: a1\n    path: Second\n  - id: b2\n    path: First\nlayout:\n  columns: 3\n---\nA binder note from a version of Binders that doesn’t exist yet. This note must never change.\n';
const STRESS = [
	{ folder: 'The Salt Road', about: 'A small novel as a writer would have it: three parts, labels, statuses, synopses, targets on scenes, folders and the book, research left out of exports (one note by the property’s older name, compile), a note the list doesn’t mention, and snapshots (three scenes, and one of a note that’s gone).', make: novel },
	{ folder: 'Empty binder', about: 'A binder with nothing in it: every mode’s empty state.', make: (add) => add('Empty binder.md', note({ binder: 1, contents: [] })) },
	{ folder: 'One note', about: 'A binder of one note.', make: (add, rand) => { add('One note.md', note({ binder: 1, contents: ['The only scene'] })); add('The only scene.md', note({ synopsis: 'All there is.' }, prose(rand, 200))); } },
	{ folder: 'Five thousand notes', about: '5,000 notes in 200 folders (ten parts of nineteen chapters). For speed: opening, scrolling, filtering, dragging, the file explorer.', make: huge },
	{ folder: 'Fifteen folders deep', about: 'Folders nested fifteen deep, a note at each level: the breadcrumb, indents in the outliner and the explorer, headings in the manuscript.', make: deep },
	{ folder: 'One long note', about: 'A note of 100,000 words between two short ones: the manuscript, word counts, snapshots and compare on a long text.', make: (add, rand) => {
		add('One long note.md', note({ binder: 1, contents: ['Before', 'A hundred thousand words', 'After'], target: 100000 }));
		add('Before.md', prose(rand, 120)); add('A hundred thousand words.md', note({ synopsis: 'Exactly 100,000 words.', target: 100000 }, prose(rand, 100000))); add('After.md', prose(rand, 120));
	} },
	{ folder: 'Sixty labels', about: '120 notes, each with one of sixty labels (the vault’s settings list all sixty): label menus, the filter, arranging by label, dots in the explorer.', make: sixty },
	{ folder: 'Odd names', about: 'Names with emoji, right-to-left text, combining marks, YAML look-alikes (`1984`, `true`, `# …`), characters that need escaping in links, a very long one, and names that differ only in case.', make: odd },
	{ folder: 'Odd files', about: 'Notes with unusual bytes: CRLF, lone CR, a byte-order mark, only properties, empty properties then a rule, no last newline, YAML that can’t be read, tabs in properties, an empty file. None of them should change unless you type in it.', make: (add, rand) => {
		const files = oddFiles(rand);
		for (const [name, text] of Object.entries(files)) add(name + '.md', text);
		add('Odd files.md', note({ binder: 1, contents: Object.keys(files) }));
	} },
	{ folder: 'Longform flat', about: 'A Longform project with a flat list of scenes, two ignored files and a scene the list doesn’t mention.', make: (add, rand) => longform(add, rand, false) },
	{ folder: 'Longform nested', about: 'A Longform project with scenes indented under others, two levels down.', make: (add, rand) => longform(add, rand, true) },
	{ folder: 'Longform scene folder', about: 'A Longform project whose index note is outside its scene folder (`sceneFolder: Scenes`).', make: (add, rand) => {
		for (const s of ['Dawn', 'Noon', 'Dusk']) add(`Scenes/${s}.md`, prose(rand, 120));
		add('Index.md', '---\nlongform:\n  format: scenes\n  title: A day\n  sceneFolder: Scenes\n  scenes:\n    - Dawn\n    - Noon\n    - Dusk\n  ignoredFiles: []\n---\n');
	} },
	{ folder: 'Newer format', about: 'A binder note with `binder: 99`. It must show as read-only, say why, and its note must never be rewritten (compare it with `git diff` or a checksum after trying everything).', make: (add, rand) => { add('Newer format.md', NEWER); add('First.md', prose(rand, 80)); add('Second.md', prose(rand, 80)); } },
	{ folder: 'Broken contents', about: 'A `contents` list with files that don’t exist, duplicates, entries of the wrong type, `..` paths, a `.md` left on, and a folder without its slash. It should open in a sensible order and tidy the list only when you move something.', make: (add, rand) => {
		for (const n of ['Real one', 'Real two', 'Real three', '1984', 'Part/In the part']) add(n + '.md', prose(rand, 60));
		add('Broken contents.md', '---\nbinder: 1\ncontents:\n  - Real two\n  - Missing note\n  - Real one\n  - Real one\n  - Real two.md\n  - 1984\n  - 3.5\n  - true\n  - null\n  - [a, nested, list]\n  - {a: map}\n  - ../Outside the binder\n  - Part\n  - Part/\n  - Part/In the part\n  - Part/Missing too\n  - /Real three\n  - "  "\n  - Broken contents\n---\nThe list above is wrong in every way a list can be.\n');
	} },
	{ folder: 'Contents is not a list', about: 'A binder note whose `contents` is a line of text, not a list. Its notes should show in name order and the text should not be thrown away without asking.', make: (add, rand) => { add('Contents is not a list.md', '---\nbinder: 1\ncontents: Beta, Alpha\n---\n'); add('Alpha.md', prose(rand, 60)); add('Beta.md', prose(rand, 60)); } },
	{ folder: 'Binder in a binder', about: 'A binder with another binder note inside (`Inner/Inner.md`, which is that folder’s note), a binder note that isn’t named like its folder (an ordinary note), and a Longform project (ordinary notes).', make: (add, rand) => {
		add('Binder in a binder.md', note({ binder: 1, contents: ['Outer scene', 'Inner/', 'Inner/Inner scene B', 'Inner/Inner scene A', 'Other/', 'Other/A second binder note', 'Other/Other scene', 'Longform inside/'] }));
		add('Outer scene.md', prose(rand, 80));
		add('Inner/Inner.md', note({ binder: 1, contents: ['Inner scene A', 'Inner scene B'], synopsis: 'A binder note inside a binder: here it’s only a folder note.' }));
		add('Inner/Inner scene A.md', prose(rand, 80)); add('Inner/Inner scene B.md', prose(rand, 80));
		add('Other/A second binder note.md', note({ binder: 1, contents: ['Other scene'] }, 'Has `binder: 1` but isn’t named like its folder: an ordinary note here.\n'));
		add('Other/Other scene.md', prose(rand, 80));
		add('Longform inside/Index.md', '---\nlongform:\n  format: scenes\n  sceneFolder: /\n  scenes:\n    - Z scene\n    - A scene\n---\n');
		add('Longform inside/A scene.md', prose(rand, 60)); add('Longform inside/Z scene.md', prose(rand, 60));
	} },
	{ folder: 'Two binder notes', about: 'Two notes with `binder: 1` in one folder. The one named like the folder is the binder note; the other is a scene.', make: (add, rand) => {
		add('Two binder notes.md', note({ binder: 1, contents: ['Second', 'First', 'Also a binder note'] }));
		add('Also a binder note.md', note({ binder: 1, contents: ['First', 'Second'] }, 'Not the binder note: the other one is named like the folder.\n'));
		add('First.md', prose(rand, 60)); add('Second.md', prose(rand, 60));
	} },
	{ folder: 'Named like its folder', about: 'A folder, `Letters`, with a note called `Letters` that holds real writing, not a folder’s data. Binders takes it for the folder note: check that its text is never lost or hidden for good.', make: (add, rand) => {
		add('Named like its folder.md', note({ binder: 1, contents: ['Before the letters', 'Letters/', 'Letters/To Ansa', 'Letters/To Reyl'] }));
		add('Before the letters.md', prose(rand, 80));
		add('Letters/Letters.md', 'This note is a chapter of its own, three hundred words of it, and happens to be named like its folder.\n\n' + prose(rand, 300));
		add('Letters/To Ansa.md', prose(rand, 80)); add('Letters/To Reyl.md', prose(rand, 80));
	} },
	{ folder: 'A folder called Snapshots', about: 'A binder whose writer has a folder of their own called `Snapshots`, with notes in it. It’s an item like any other, and Binders keeps no snapshots here.', make: (add, rand) => {
		add('A folder called Snapshots.md', note({ binder: 1, contents: ['Scene', 'Snapshots/', 'Snapshots/Polaroids'] }));
		add('Scene.md', prose(rand, 80)); add('Snapshots/Polaroids.md', prose(rand, 80));
	} },
	{ folder: 'Mixed files', about: 'Notes with canvases, images, a PDF and a text file among them, some in the list and some not.', make: (add, rand) => {
		add('Mixed files.md', note({ binder: 1, contents: ['Opening', 'Map.canvas', 'Cover.png', 'Middle', 'Art/', 'Art/Sketch.jpg', 'Art/About the art', 'Contract.pdf', 'Ending'] }));
		for (const n of ['Opening', 'Middle', 'Ending', 'Art/About the art']) add(n + '.md', note({ synopsis: `${n.split('/').pop()}.` }, prose(rand, 80)));
		add('Map.canvas', canvas([{ type: 'file', file: 'Stress tests/Mixed files/Opening.md' }, { type: 'text', text: 'A card on a canvas' }, { type: 'file', file: 'Stress tests/Mixed files/Cover.png' }]));
		add('Cover.png', PNG); add('Art/Sketch.jpg', JPEG); add('Contract.pdf', pdf());
		add('Unlisted picture.png', PNG); add('Unlisted board.canvas', canvas([{ type: 'text', text: 'Not in the list' }])); add('Word list.txt', 'salt\nroad\nledger\n');
	} },
	{ folder: 'Not a binder', binder: false, about: 'An ordinary folder beside the binders: notes, a note named like the folder, a canvas, an image, a single-note Longform project. Binders should leave it alone, and offer “Make this folder a binder”.', make: (add, rand) => {
		add('Not a binder.md', 'Named like its folder, with no `binder` property.\n');
		for (const n of ['Zebra', 'Apple', 'Mango', 'Sub/Deeper']) add(n + '.md', prose(rand, 60));
		add('Single.md', '---\nlongform:\n  format: single\n  title: One note\n---\nA single-note Longform project: not a binder.\n');
		add('Board.canvas', canvas([{ type: 'text', text: 'A canvas outside any binder' }])); add('Picture.png', PNG);
	} },
];

/** Every folder the generator makes, in the order the README lists them: the example books, then the stress
    binders. `path` is where it is in the vault, `folder` its name, `about` what it is for; an example also has
    `tryIt` (what to try in it). `binder: false` marks a folder that is not a binder. */
export const SCENARIOS = [
	...EXAMPLES.map((s) => ({ ...s, group: GROUPS.examples, path: `${GROUPS.examples}/${s.folder}` })),
	...STRESS.map((s) => ({ ...s, group: GROUPS.stress, path: `${GROUPS.stress}/${s.folder}` })),
];

// a note of each folder that a link can open: its binder note, or its Longform index
const first = (s) => s.opens ?? (/^Longform/.test(s.folder) ? 'Index' : s.folder);
const link = (s) => `[[${s.path}/${first(s)}\\|${s.folder}]]`;

function readme(opts) {
	const skipped = [!(opts.caseSensitive ?? true) && 'names that differ only in case', !(opts.bothForms ?? true) && 'the same name written with a combining accent'].filter(Boolean);
	const of = (group) => SCENARIOS.filter((s) => s.group === group);
	return `# Binders demo vault

A vault to try Binders in by hand. \`npm run demo-vault\` in the Binders project makes it, and every build of the
plugin installs itself here. Change anything you like: making the vault again replaces only the files it made that
you haven’t changed, never a file you added, and doesn’t bring back one you deleted or moved. \`npm run demo-vault -- --reset\` puts every generated file back.

The link in each row opens a note of that folder; click the folder itself in the file explorer to open its binder
view.

## Examples

Books as a writer would have them, in \`${GROUPS.examples}/\`. Their text is made up by the generator from sentences
written for it: it reads like writing and means nothing. Every word count below is the manuscript’s.

| Binder | What it is | What to try |
|---|---|---|
${of(GROUPS.examples).map((s) => `| ${link(s)} | ${s.about} | ${s.tryIt} |`).join('\n')}

## Stress tests

Binders that are too big, too deep, oddly named or wrong on purpose, in \`${GROUPS.stress}/\`. Their text is filler.

| Folder | What it’s for |
|---|---|
${of(GROUPS.stress).map((s) => `| ${link(s)} | ${s.about} |`).join('\n')}
${skipped.length ? `\nLeft out of “Odd names”, because this disk can’t hold them: ${skipped.join(', ')}.\n` : ''}
The vault’s Binders settings list sixty labels, for “Sixty labels”.
`;
}

const CORE = { 'file-explorer': true, 'global-search': true, switcher: true, graph: true, backlink: true, canvas: true, 'outgoing-link': true, 'tag-pane': true, properties: true, 'page-preview': true, 'command-palette': true, 'editor-status': true, bookmarks: true, outline: true, 'word-count': true, 'file-recovery': true, bases: true };
const leaf = (id, type, state = {}) => ({ id, type: 'leaf', state: { type, state } });
const WORKSPACE = {
	main: { id: 'demo-main', type: 'split', direction: 'vertical', children: [{ id: 'demo-tabs', type: 'tabs', children: [leaf('demo-readme', 'markdown', { file: 'README.md', mode: 'preview', source: false })] }] },
	left: { id: 'demo-left', type: 'split', direction: 'horizontal', width: 300, children: [{ id: 'demo-left-tabs', type: 'tabs', children: [leaf('demo-explorer', 'file-explorer', { sortOrder: 'alphabetical' }), leaf('demo-search', 'search')] }] },
	right: { id: 'demo-right', type: 'split', direction: 'horizontal', width: 300, collapsed: true, children: [{ id: 'demo-right-tabs', type: 'tabs', children: [leaf('demo-outline', 'outline'), leaf('demo-backlinks', 'backlink')] }] },
	active: 'demo-readme',
	lastOpenFiles: ['README.md'],
};
const json = (o) => JSON.stringify(o, null, 2) + '\n';

/** Every file of the demo vault: its path in the vault → its text, or its bytes. The same every time for the same
    options. `caseSensitive` and `bothForms` say what the disk can hold (see `oddNames`). */
export function plan(opts = {}) {
	const files = new Map();
	for (const s of SCENARIOS) {
		// each binder has its own run of random numbers, so changing one leaves the others' text as it was
		s.make((path, data) => {
			const full = `${s.path}/${path}`;
			if (files.has(full)) throw new Error(`The demo vault makes ${full} twice`);
			files.set(full, data);
		}, rng(`${SEED}:${s.folder}`), opts, s.path);
	}
	files.set('README.md', readme(opts));
	files.set('.obsidian/app.json', json({ alwaysUpdateLinks: true }));
	files.set('.obsidian/core-plugins.json', json(CORE));
	files.set('.obsidian/community-plugins.json', json(['binders']));
	files.set('.obsidian/workspace.json', json(WORKSPACE));
	// what Binders reads as its settings: the sixty labels (everything else takes its default)
	files.set('.obsidian/plugins/binders/data.json', json({ labels: LABELS }));
	// for the Hot Reload plugin, if it's installed here: it reloads a plugin whose folder has this file when its
	// main.js or styles.css changes
	files.set('.obsidian/plugins/binders/.hotreload', '');
	return files;
}

/** What a run should do with each file, so that it never writes over a person's work, or brings back what they moved.
    `next`: path → hash of what the generator makes now. `before`: the same from the last run's manifest. `onDisk(path)`:
    the hash of what's there, or null. Returns the paths to `write` and to `remove`, the ones `kept` because they were
    changed since they were made (or were never ours), the ones `gone` (made before, and since deleted, renamed or
    moved: not made again), and the manifest's new `files`. With `reset`, a generated file that was changed or is gone
    is written again; a file the generator never made is still never touched. */
export function reconcile(next, before, onDisk, reset = false) {
	const write = [], remove = [], kept = [], gone = [], files = {};
	for (const [path, h] of next) {
		const disk = onDisk(path), was = before[path];
		if (disk === h) files[path] = h;
		else if (was === undefined ? disk === null : disk === was || reset) { write.push(path); files[path] = h; }
		// changed or taken away since we made it: leave it so, and keep saying it's one of ours (so --reset can put it back)
		else if (was !== undefined) { (disk === null ? gone : kept).push(path); files[path] = was; }
		// never ours (a file of that name was here first): keep it, and don't claim it
		else kept.push(path);
	}
	for (const [path, was] of Object.entries(before)) {
		if (next.has(path)) continue;
		// something an older generator made and this one doesn't: removed if untouched, kept (and forgotten) if changed
		const disk = onDisk(path);
		if (disk === was) remove.push(path); else if (disk !== null) kept.push(path);
	}
	return { write, remove, kept, gone, files };
}
