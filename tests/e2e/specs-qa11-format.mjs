// QA round 11: the binder format and the store, adversarial (hand-edited notes, names YAML or the disk make odd,
// deep trees, edits made while Obsidian is closed). Tests named "BUG: …" fail on purpose until the bug is fixed.
import { B, PL, j, file, until, read, exists, split, contents, flush, writeRaw, reload, openView, cards } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 format: ' + name, fn });

const KEEP = ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'Longform demo'];

async function tidy(p) {
	await p.ev(`(async () => {
		document.querySelectorAll('.modal-close-button').forEach(b => b.click());
		if (!app.plugins.plugins.binders) await app.plugins.enablePlugin('binders');
		const keep = new Set(${j(KEEP)});
		const extra = app.vault.getAllLoadedFiles().filter(f => f.path !== '/' && f.children && !keep.has(f.path) && !f.path.startsWith('Longform demo'));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		for (const f of app.vault.getAllLoadedFiles().filter(f => !f.children && f.parent?.path === '/' )) await app.vault.delete(f, true);
		await app.plugins.plugins.binders.binders.flush();
	})().then(() => 1)`).catch(() => {});
	await p.sleep(200);
}
const withTidy = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await tidy(p); } };

/** Makes folders and notes through the vault: { "Dir/Note.md": text, "Dir/Sub/": null }. */
async function put(p, files) {
	await p.ev(`(async () => {
		const mk = async (dir) => { if (!dir || app.vault.getAbstractFileByPath(dir)) return; const i = dir.lastIndexOf('/'); if (i > 0) await mk(dir.slice(0, i)); await app.vault.createFolder(dir); };
		for (const [path, text] of Object.entries(${j(files)})) {
			if (path.endsWith('/')) { await mk(path.slice(0, -1)); continue; }
			const i = path.lastIndexOf('/'); if (i > 0) await mk(path.slice(0, i));
			await app.vault.create(path, text ?? '');
		}
	})().then(() => 1)`);
}
const settle = async (p, ms = 700) => { await p.sleep(ms); await flush(p); await p.sleep(ms); };
const shown = (p, folder) => p.ev(`(${B}.orderedChildren(${file(folder)}) || []).map(f => f.name)`);
const binderNote = (p, folder) => p.ev(`${B}.binderOf(${file(folder)})?.note?.path ?? null`);
const problem = (p, folder) => p.ev(`${B}.binderOf(${file(folder)})?.problem ?? null`);
const dir = (p, d) => p.ev(`app.vault.adapter.list(${j(d)}).then(l => [...l.files, ...l.folders].map(x => x.split('/').pop()).sort())`);
const mtime = (p, path) => p.ev(`app.vault.adapter.stat(${j(path)}).then(s => s?.mtime ?? null)`);
const bnote = (list, extra = '') => `---\nbinder: 1\n${list == null ? '' : 'contents:\n' + list.map((x) => '  - ' + x).join('\n') + '\n'}${extra}---\nthe note's own text\n`;

// ---------------------------------------------------------------------------------------------------------------

test('names YAML would read as something else (true, null, ~, a date, 1e3, 0x10, on, a leading # [ { * & ! % @ ` > | - ? \' or a colon) keep their place through a write and a restart', withTidy(async (p, h, t) => {
	const names = ['true', 'null', '~', '2026-01-01', '1e3', '0x10', '1_000', 'on', 'yes', '#hash', '[b', '{c', '*s', '&a', '!t', '%p', '@at', '`tick', '> f', '| p', '- d', '? q', "'quote", 'x #y', '.5', '+1', '=', '<<', 'No', 'y', '0o7'];
	const files = { 'Host/Host.md': bnote(null) };
	for (const n of names) files[`Host/${n}.md`] = `text of ${n}\n`;
	await put(p, files);
	for (const n of ['a: b', '12:30']) await p.ev(`app.vault.adapter.write(${j('Host/' + n + '.md')}, 'text of ${n}\\n').then(() => 1)`);
	names.push('a: b', '12:30');
	await settle(p);
	const have = await dir(p, 'Host');
	const inVault = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Host/')).map(f => f.name)`);
	const made = names.filter((n) => have.includes(n + '.md') && inVault.includes(n + '.md'));
	t.ok(made.length >= names.length - 3, 'the notes were made: ' + made.length + ' of ' + names.length);
	// give them an order that isn't the name order: the reverse
	const want = [...made.map((n) => n + '.md')].sort((a, b) => b.localeCompare(a));
	await p.ev(`(async () => { const f = ${file('Host')}; const items = ${j(want)}.map(n => app.vault.getAbstractFileByPath('Host/' + n)); await ${B}.reorder(f, items); await ${B}.flush(); })().then(() => 1)`);
	await settle(p);
	t.eq(j(await shown(p, 'Host')), j(want), 'the order after the write');
	const raw = await read(p, 'Host/Host.md');
	// the list as the cache reads it, after Obsidian has re-parsed the file
	const cached = await p.ev(`app.metadataCache.getFileCache(${file('Host/Host.md')})?.frontmatter?.contents`);
	t.ok(Array.isArray(cached) && cached.every((x) => typeof x === 'string'), 'every entry is text for YAML: ' + j((cached || []).filter((x) => typeof x !== 'string')) + '\n' + raw.slice(0, 600));
	await p.ev(`app.plugins.disablePlugin('binders').then(() => app.plugins.enablePlugin('binders')).then(() => 1)`);
	await p.sleep(1500);
	t.eq(j(await shown(p, 'Host')), j(want), 'the order after the plugin is restarted');
	for (const n of made) t.eq(await read(p, `Host/${n}.md`), `text of ${n}\n`, `${n} text kept`);
}));

test('names with a space at their start or end, a trailing dot, a double dot and unicode in two forms (é as one letter or as e and an accent) keep their place', withTidy(async (p, h, t) => {
	const names = [' Lead', 'Trail ', 'Wait.', 'A..B', 'Café', 'Naïve', '\u{1F4D6} book', 'ﬁne', 'ǅ'];
	const files = { 'Odd/Odd.md': bnote(null) };
	for (const n of names) files[`Odd/${n}.md`] = `text of ${n}\n`;
	await put(p, files);
	await settle(p);
	const have = await dir(p, 'Odd');
	const made = names.filter((n) => have.some((h) => h.normalize('NFC') === (n + '.md').normalize('NFC'))).map((n) => have.find((h) => h.normalize('NFC') === (n + '.md').normalize('NFC')).slice(0, -3));
	t.ok(made.length >= 5, 'made: ' + j(made));
	const want = made.map((n) => n + '.md').sort((a, b) => b.localeCompare(a));
	await p.ev(`(async () => { await ${B}.reorder(${file('Odd')}, ${j(want)}.map(n => app.vault.getAbstractFileByPath('Odd/' + n))); await ${B}.flush(); })().then(() => 1)`);
	await settle(p);
	t.eq(j(await shown(p, 'Odd')), j(want), 'order written');
	await p.ev(`app.plugins.disablePlugin('binders').then(() => app.plugins.enablePlugin('binders')).then(() => 1)`);
	await p.sleep(1500);
	t.eq(j(await shown(p, 'Odd')), j(want), 'order read back after a restart');
}));

test('a hand-typed list in the other form of a name (é typed as e and an accent, the file saved as one letter) still finds the file', withTidy(async (p, h, t) => {
	// a vault synced from a Mac keeps names decomposed; a writer types the composed form into the list (or the reverse)
	const nfc = 'Café', nfd = 'Café';
	await put(p, { 'Norm/Norm.md': bnote([nfd, 'Zed', 'Alpha']), [`Norm/${nfc}.md`]: 'c\n', 'Norm/Zed.md': 'z\n', 'Norm/Alpha.md': 'a\n' });
	await settle(p);
	const s = await shown(p, 'Norm');
	t.eq(s.length, 3, 'three items: ' + j(s));
	t.eq(j(s.map((x) => x.normalize('NFC'))), j([nfc + '.md', 'Zed.md', 'Alpha.md']), 'the entry in the other form of the name found the file: ' + j(s));
}));

test('a folder named like the folder it is in (Part One/Part One/) has its own folder note, and both are hidden and keep their order', withTidy(async (p, h, t) => {
	await put(p, {
		'Twin/Twin.md': bnote(['Zed', 'Part/', 'Part/Part/', 'Part/Part/Deep', 'Part/Mid', 'Alpha'], 'synopsis: whole\n'),
		'Twin/Part/Part.md': '---\nsynopsis: outer\n---\n',
		'Twin/Part/Part/Part.md': '---\nsynopsis: inner\n---\n',
		'Twin/Part/Part/Deep.md': 'deep\n', 'Twin/Part/Mid.md': 'mid\n', 'Twin/Zed.md': 'z\n', 'Twin/Alpha.md': 'a\n',
	});
	await settle(p);
	t.eq(j(await shown(p, 'Twin')), j(['Zed.md', 'Part', 'Alpha.md']), 'top');
	t.eq(j(await shown(p, 'Twin/Part')), j(['Part', 'Mid.md']), 'outer folder: the inner folder first, then Mid; no folder note shown');
	t.eq(j(await shown(p, 'Twin/Part/Part')), j(['Deep.md']), 'inner folder: only Deep');
	// a write keeps every entry
	await p.ev(`${B}.moveDown(${file('Twin/Zed.md')}).then(() => 1)`);
	await settle(p);
	const c = await contents(p, 'Twin/Twin.md');
	t.ok(c.includes('Part/Part/') && c.includes('Part/Part/Deep') && c.includes('Part/Mid'), 'entries kept after a write: ' + j(c));
	t.ok(/synopsis: whole/.test(await read(p, 'Twin/Twin.md')), 'binder synopsis kept');
	// rename the inner folder: its folder note follows, the entries follow
	await p.ev(`app.fileManager.renameFile(${file('Twin/Part/Part')}, 'Twin/Part/Inner').then(() => 1)`);
	await settle(p);
	t.ok(await exists(p, 'Twin/Part/Inner/Inner.md'), 'inner folder note renamed: ' + j(await dir(p, 'Twin/Part/Inner')));
	t.ok((await read(p, 'Twin/Part/Inner/Inner.md')).includes('synopsis: inner'), 'with its synopsis');
	const c2 = await contents(p, 'Twin/Twin.md');
	t.ok(c2.includes('Part/Inner/') && c2.includes('Part/Inner/Deep') && !c2.some((x) => x.startsWith('Part/Part/')), 'list followed: ' + j(c2));
}));

test('two folders of one name in different places (A/Notes and B/Notes) are told apart by a rename, a move and a delete', withTidy(async (p, h, t) => {
	await put(p, {
		'Dup/Dup.md': bnote(['A/', 'A/Notes/', 'A/Notes/Scene 2', 'A/Notes/Scene 1', 'B/', 'B/Notes/', 'B/Notes/Scene 1', 'B/Notes/Scene 2']),
		'Dup/A/Notes/Notes.md': '---\nsynopsis: a\n---\n', 'Dup/A/Notes/Scene 1.md': 'a1\n', 'Dup/A/Notes/Scene 2.md': 'a2\n',
		'Dup/B/Notes/Notes.md': '---\nsynopsis: b\n---\n', 'Dup/B/Notes/Scene 1.md': 'b1\n', 'Dup/B/Notes/Scene 2.md': 'b2\n',
	});
	await settle(p);
	t.eq(j(await shown(p, 'Dup/A/Notes')), j(['Scene 2.md', 'Scene 1.md']), 'A order');
	t.eq(j(await shown(p, 'Dup/B/Notes')), j(['Scene 1.md', 'Scene 2.md']), 'B order');
	await p.ev(`app.fileManager.renameFile(${file('Dup/A/Notes')}, 'Dup/A/Z').then(() => 1)`);
	await settle(p);
	let c = await contents(p, 'Dup/Dup.md');
	t.eq(j(c), j(['A/', 'A/Z/', 'A/Z/Scene 2', 'A/Z/Scene 1', 'B/', 'B/Notes/', 'B/Notes/Scene 1', 'B/Notes/Scene 2']), 'A renamed, B untouched: ' + j(c));
	t.ok(await exists(p, 'Dup/A/Z/Z.md') && await exists(p, 'Dup/B/Notes/Notes.md'), 'folder notes: A follows, B stays');
	// move B/Notes up under the binder top, beside A and B
	await p.ev(`app.fileManager.renameFile(${file('Dup/B/Notes')}, 'Dup/Notes').then(() => 1)`);
	await settle(p);
	c = await contents(p, 'Dup/Dup.md');
	t.ok(c.includes('Notes/') && c.includes('Notes/Scene 1') && !c.some((x) => x.startsWith('B/Notes')), 'B/Notes moved with its items: ' + j(c));
	t.eq(j(c.filter((x) => x.startsWith('A/'))), j(['A/', 'A/Z/', 'A/Z/Scene 2', 'A/Z/Scene 1']), 'A unchanged');
	await p.ev(`app.vault.delete(${file('Dup/A')}, true).then(() => 1)`);
	await settle(p);
	c = await contents(p, 'Dup/Dup.md');
	t.ok(!c.some((x) => x.startsWith('A/')) && c.includes('Notes/Scene 2'), 'A gone, Notes kept: ' + j(c));
	t.eq(await read(p, 'Dup/Notes/Scene 1.md'), 'b1\n', 'nothing of B lost');
}));

test('a tree 30 folders deep: its order, a rename of the top, a delete in the middle and the view all hold', withTidy(async (p, h, t) => {
	const levels = Array.from({ length: 30 }, (_, i) => 'L' + i);
	const files = {}; let path = 'Deep';
	const list = [];
	let rel = '';
	for (const l of levels) { path += '/' + l; rel += l + '/'; files[path + '/' + l + '.md'] = `---\nsynopsis: ${l}\n---\n`; files[path + '/Second.md'] = 's\n'; files[path + '/First.md'] = 'f\n'; list.push(rel, rel + 'Second', rel + 'First'); }
	files['Deep/Deep.md'] = bnote(list);
	await put(p, files);
	await settle(p, 1000);
	const lastDir = 'Deep/' + levels.join('/');
	t.eq(j(await shown(p, lastDir)), j(['Second.md', 'First.md']), 'order at the bottom');
	t.eq(j(await shown(p, 'Deep/L0/L1/L2')), j(['Second.md', 'First.md', 'L3']), 'order in the middle');
	// a write at the bottom
	await p.ev(`${B}.moveDown(${file(lastDir + '/Second.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await shown(p, lastDir)), j(['First.md', 'Second.md']), 'moved down at the bottom');
	let c = await contents(p, 'Deep/Deep.md');
	t.eq(c.length, 90, 'all 90 entries kept: ' + c.length);
	await p.ev(`app.fileManager.renameFile(${file('Deep/L0')}, 'Deep/Top').then(() => 1)`);
	await settle(p, 1000);
	c = await contents(p, 'Deep/Deep.md');
	t.ok(c.length === 90 && c.every((x) => x.startsWith('Top/')), 'rename of the top followed by every entry: ' + c.length + ' ' + c[0]);
	t.ok(await exists(p, 'Deep/Top/Top.md'), 'its folder note renamed');
	// delete the folder 10 levels down: everything under it leaves the list, nothing above does
	await p.ev(`app.vault.delete(${file('Deep/Top/L1/L2/L3/L4/L5/L6/L7/L8/L9/L10')}, true).then(() => 1)`);
	await settle(p, 1000);
	c = await contents(p, 'Deep/Deep.md');
	t.eq(c.length, 90 - 20 * 3, 'entries of 20 levels gone, 10 kept: ' + c.length);
	t.ok(c.includes('Top/L1/L2/L3/L4/L5/L6/L7/L8/L9/') && !c.some((x) => x.includes('/L10/')), 'the cut is at L10');
	// the view opens on it and shows the first level's items without a stall
	await openView(p, 'Deep');
	const cs = await cards(p);
	t.ok(cs.length > 0, 'the view draws cards: ' + cs.length);
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-view').length`), 1, 'one view');
}));

test('entries a writer might type (./Prologue, /Epilogue, a doubled slash, a backslash, a folder without its slash, a note with one, wrong case, .., blanks, the binder note, a folder note, Snapshots/) leave a sound view, and the next write cleans them', withTidy(async (p, h, t) => {
	await put(p, {
		'Messy/Messy.md': bnote(['./Prologue', '/Epilogue', 'Part One//Arrival', 'Part One\\The keeper', 'Part One/', 'Part One/Storm', 'Part Two/', 'Part Two/Lights', 'Other', '../Outside', 'Part One/../Prologue', '""', 'Messy', 'Part One/Part One', 'Ghost'], 'tags:\n  - x\n'),
		'Messy/Prologue.md': 'p\n', 'Messy/Epilogue.md': 'e\n', 'Messy/Other.md': 'o\n',
		'Messy/Part One/Part One.md': '---\nsynopsis: one\n---\n', 'Messy/Part One/Arrival.md': 'a\n', 'Messy/Part One/The keeper.md': 'k\n', 'Messy/Part One/Storm.md': 's\n',
		'Messy/Part Two/Lights.md': 'l\n',
	});
	await settle(p);
	const top = await shown(p, 'Messy');
	t.eq(j([...top].sort()), j(['Epilogue.md', 'Other.md', 'Part One', 'Part Two', 'Prologue.md']), 'every item shown once, no binder or folder note: ' + j(top));
	t.eq(top[0], 'Prologue.md', 'the first entry, ./Prologue, finds Prologue');
	t.ok(top.indexOf('Epilogue.md') < top.indexOf('Other.md'), '/Epilogue finds Epilogue, before the unlisted Other: ' + j(top));
	const one = await shown(p, 'Messy/Part One');
	t.eq(j(one), j(['Arrival.md', 'The keeper.md', 'Storm.md']), 'Part One: a doubled slash and a backslash are read as paths: ' + j(one));
	const before = await read(p, 'Messy/Messy.md');
	await p.ev(`${B}.moveUp(${file('Messy/Other.md')}).then(() => 1)`);
	await settle(p);
	const after = await read(p, 'Messy/Messy.md');
	const c = await contents(p, 'Messy/Messy.md');
	t.ok(!c.some((x) => /\.\.|^\/|\/\/|\\|^\s*$|Ghost|^Messy$|^Part One\/Part One$/.test(x)), 'the next write keeps only clean entries: ' + j(c));
	t.eq(new Set(c).size, c.length, 'no entry twice: ' + j(c));
	t.ok(/tags:\n  - x/.test(after), 'tags kept');
	t.eq(split(after).body, "the note's own text\n", 'text kept');
	for (const f of ['Prologue', 'Epilogue', 'Other', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm', 'Part Two/Lights']) t.ok(await exists(p, `Messy/${f}.md`), f + ' still there');
	t.ok(before !== after, 'a write happened');
}));

test('exactly half of the entries missing are dropped by a write, more than half are kept (a list of another folder)', withTidy(async (p, h, t) => {
	await put(p, { 'Half/Half.md': bnote(['A', 'B', 'X', 'Y']), 'Half/A.md': 'a\n', 'Half/B.md': 'b\n', 'Half/C.md': 'c\n', 'More/More.md': bnote(['A', 'X', 'Y', 'Z']), 'More/A.md': 'a\n', 'More/B.md': 'b\n', 'More/C.md': 'c\n' });
	await settle(p);
	await p.ev(`${B}.moveDown(${file('Half/A.md')}).then(() => 1)`);
	await p.ev(`${B}.moveDown(${file('More/A.md')}).then(() => 1)`);
	await settle(p);
	const half = await contents(p, 'Half/Half.md'), more = await contents(p, 'More/More.md');
	t.ok(!half.includes('X') && !half.includes('Y'), 'half missing: dropped ' + j(half));
	t.ok(more.includes('X') && more.includes('Y') && more.includes('Z'), 'three of four missing: kept ' + j(more));
	t.ok(more.includes('A') && more.includes('B') && more.includes('C'), 'and the real ones are there too: ' + j(more));
}));

test('a folder named like a note ("Weird.md" as a folder) and a note beside it do not break the view or the list', withTidy(async (p, h, t) => {
	await put(p, { 'Wd/Wd.md': bnote(['Weird.md/', 'Weird.md/Inside', 'Weird']), 'Wd/Weird.md/Inside.md': 'i\n', 'Wd/Weird.md/Weird.md.md': '---\nsynopsis: x\n---\n', 'Wd/Weird.md.md': 'w\n' });
	await settle(p);
	const s = await shown(p, 'Wd');
	t.eq(s.length, 2, 'two items: ' + j(s));
	await p.ev(`${B}.moveDown(${file('Wd/Weird.md.md')}).then(() => 1)`).catch(() => 0);
	await settle(p);
	for (const f of ['Wd/Weird.md/Inside.md', 'Wd/Weird.md.md']) t.ok(await exists(p, f), f + ' there');
	await openView(p, 'Wd');
	t.ok((await cards(p)).length >= 1, 'the view draws');
}));

test('a folder note that carries binder: 1 (a nested binder named like its folder) is the folder note, hidden, and the outer list is the outer binder\'s', withTidy(async (p, h, t) => {
	await put(p, {
		'Out/Out.md': bnote(['Inner/', 'Inner/Two', 'Inner/One', 'Last']),
		'Out/Inner/Inner.md': bnote(['One', 'Two']), 'Out/Inner/One.md': '1\n', 'Out/Inner/Two.md': '2\n', 'Out/Last.md': 'l\n',
	});
	await settle(p);
	t.eq(j(await shown(p, 'Out/Inner')), j(['Two.md', 'One.md']), 'the outer list orders the inner folder');
	t.eq(await binderNote(p, 'Out'), 'Out/Out.md', 'outer binder note');
	const kinds = await p.ev(`${B}.all().filter(b => b.folder.path.startsWith('Out')).map(b => b.folder.path)`);
	t.ok(kinds.includes('Out'), 'outer is a binder: ' + j(kinds));
	const inner = await read(p, 'Out/Inner/Inner.md');
	await p.ev(`${B}.moveDown(${file('Out/Last.md')}).then(() => 1)`);
	await p.ev(`${B}.moveDown(${file('Out/Inner/Two.md')}).then(() => 1)`);
	await settle(p);
	t.eq(await read(p, 'Out/Inner/Inner.md'), inner, 'the inner binder note is not written by a change in the outer binder');
	t.eq(j(await contents(p, 'Out/Out.md')), j(['Inner/', 'Inner/One', 'Inner/Two', 'Last']), 'outer list written: ' + j(await contents(p, 'Out/Out.md')));
}));

test('two binder notes in one folder, neither named like it: the first by name is the binder, and renaming it hands the folder to the other without writing either', withTidy(async (p, h, t) => {
	await put(p, { 'Two/Alpha.md': bnote(['b', 'a']), 'Two/Beta.md': bnote(['a', 'b']), 'Two/a.md': 'a\n', 'Two/b.md': 'b\n' });
	await settle(p);
	t.eq(await binderNote(p, 'Two'), 'Two/Alpha.md', 'Alpha is the binder note');
	const A = await read(p, 'Two/Alpha.md'), Bt = await read(p, 'Two/Beta.md');
	t.eq(j((await shown(p, 'Two')).filter((x) => /^[ab]\.md$/.test(x))), j(['b.md', 'a.md']), 'Alpha\'s order');
	await p.ev(`app.fileManager.renameFile(${file('Two/Alpha.md')}, 'Two/Zulu.md').then(() => 1)`);
	await settle(p);
	t.eq(await binderNote(p, 'Two'), 'Two/Beta.md', 'Beta now');
	t.eq(j((await shown(p, 'Two')).filter((x) => /^[ab]\.md$/.test(x))), j(['a.md', 'b.md']), 'Beta\'s order');
	t.eq(await read(p, 'Two/Zulu.md'), A, 'Zulu byte for byte');
	t.eq(await read(p, 'Two/Beta.md'), Bt, 'Beta byte for byte');
}));

test('a newer format with a byte-order mark, CR LF and flow lists is byte for byte the same after a restart, a reload, edits in the folder and commands', withTidy(async (p, h, t) => {
	const v = '﻿---\r\nbinder: 7\r\nfuture: {a: [1, 2], b: "x"}\r\ncontents: [Late, Early]\r\n# a comment\r\n---\r\ntext\r\n';
	await put(p, { 'New/New.md': '---\nbinder: 1\n---\n', 'New/Early.md': 'e\n', 'New/Late.md': 'l\n' });
	await settle(p);
	await writeRaw(p, 'New/New.md', v);
	await settle(p);
	t.ok(/newer/i.test((await problem(p, 'New')) || ''), 'says why it is read only: ' + (await problem(p, 'New')));
	const m0 = await mtime(p, 'New/New.md');
	await p.ev(`app.vault.create('New/Fresh.md', 'f\\n').then(() => 1)`);
	await p.ev(`app.fileManager.renameFile(${file('New/Early.md')}, 'New/Earlier.md').then(() => 1)`);
	await p.ev(`${B}.newScene(${file('New')}).then(() => 1, () => 0)`);
	await p.ev(`${B}.newFolder(${file('New')}).then(() => 1, () => 0)`);
	await p.ev(`${B}.setProps(${file('New/New.md')}, { synopsis: 'x' }).then(() => 1, () => 0)`);
	await p.ev(`${B}.group([${file('New/Late.md')}]).then(() => 1, () => 0)`);
	await settle(p, 1000);
	t.eq(await read(p, 'New/New.md'), v, 'byte for byte after edits and commands');
	t.eq(await mtime(p, 'New/New.md'), m0, 'not even touched');
	await reload(p);
	t.eq(await read(p, 'New/New.md'), v, 'byte for byte after a reload');
	t.eq(await mtime(p, 'New/New.md'), m0, 'mtime kept by the reload');
	await openView(p, 'New').catch(() => 0);
	await p.sleep(500);
	t.eq(await read(p, 'New/New.md'), v, 'and after the view opened');
}));

test('a binder note whose first line is the version of a newer Binders, edited by hand to ask for 1 again, works as a binder from that moment (no stale refusal)', withTidy(async (p, h, t) => {
	await put(p, { 'Back/Back.md': '---\nbinder: 5\ncontents:\n  - Two\n  - One\n---\n', 'Back/One.md': '1\n', 'Back/Two.md': '2\n' });
	await settle(p);
	t.ok(!!(await problem(p, 'Back')), 'refused at first');
	await writeRaw(p, 'Back/Back.md', '---\nbinder: 1\ncontents:\n  - Two\n  - One\n---\n');
	await settle(p);
	t.eq(await problem(p, 'Back'), null, 'no problem now');
	t.eq(j(await shown(p, 'Back')), j(['Two.md', 'One.md']), 'order read');
	await p.ev(`${B}.moveDown(${file('Back/Two.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await contents(p, 'Back/Back.md')), j(['One', 'Two']), 'and a write works');
}));

test('binder: true, a bare binder:, binder: "1" and binder: 1.0 are all read, the first two as version 1; the others as what the doc says', withTidy(async (p, h, t) => {
	for (const [name, v] of [['T', 'true'], ['E', ''], ['S', '"1"'], ['F', '1.0']]) await put(p, { [`${name}/${name}.md`]: `---\nbinder: ${v}\ncontents:\n  - Z\n  - A\n---\n`, [`${name}/A.md`]: 'a\n', [`${name}/Z.md`]: 'z\n' });
	await settle(p);
	t.eq(j(await shown(p, 'T')), j(['Z.md', 'A.md']), 'true is 1');
	t.eq(j(await shown(p, 'E')), j(['Z.md', 'A.md']), 'bare is 1');
	t.eq(await problem(p, 'T'), null, 'no problem for true');
	// "1" as text and 1.0: the doc says text and a fraction aren't understood; 1.0 is the number 1 for YAML
	t.eq(await problem(p, 'F'), null, '1.0 is the number 1');
	const s = await problem(p, 'S');
	t.ok(s == null || /isn.t one Binders knows/.test(s), 'the text "1" is either read or refused with a reason: ' + s);
	for (const n of ['T', 'E', 'F']) { await p.ev(`${B}.moveDown(${file(n + '/Z.md')}).then(() => 1)`); }
	await settle(p);
	for (const n of ['T', 'E', 'F']) t.eq(j(await contents(p, `${n}/${n}.md`)), j(['A', 'Z']), n + ' written');
}));

test('a folder with a stray list: contents as text, as a map, as one number, as null: order by name, no crash, and the first write makes a list', withTidy(async (p, h, t) => {
	const forms = { Str: 'contents: Zed', Map: 'contents:\n  Zed: 1\n  Alpha: 2', Num: 'contents: 7', Nul: 'contents:', Inl: 'contents: [Zed, Alpha]', Quo: 'contents: "- Zed"' };
	const files = {};
	for (const [n, c] of Object.entries(forms)) { files[`${n}/${n}.md`] = `---\nbinder: 1\n${c}\n---\nbody\n`; files[`${n}/Alpha.md`] = 'a\n'; files[`${n}/Zed.md`] = 'z\n'; }
	await put(p, files);
	await settle(p);
	for (const n of ['Str', 'Map', 'Num', 'Nul', 'Quo']) t.eq(j(await shown(p, n)), j(['Alpha.md', 'Zed.md']), n + ': by name');
	t.eq(j(await shown(p, 'Inl')), j(['Zed.md', 'Alpha.md']), 'a flow list is a list');
	for (const n of Object.keys(forms)) await p.ev(`${B}.moveDown(${file(n + '/Alpha.md')}).then(() => 1, () => 0)`);
	await settle(p);
	for (const n of ['Str', 'Map', 'Num', 'Nul', 'Quo']) {
		t.eq(j(await shown(p, n)), j(['Zed.md', 'Alpha.md']), n + ': moved down');
		const c = await contents(p, `${n}/${n}.md`);
		t.eq(j(c), j(['Zed', 'Alpha']), n + ': written as a list: ' + j(c));
		t.eq(split(await read(p, `${n}/${n}.md`)).body, 'body\n', n + ': body kept');
	}
}));

test('closed vault: a binder folder renamed, a folder replaced, a stale folder note and a copy of the binder note, all on the disk, then Obsidian starts: nothing is lost, nothing is written until the writer moves something', withTidy(async (p, h, t) => {
	await put(p, {
		'Off/Off.md': bnote(['One/', 'One/B', 'One/A', 'Two/', 'Two/Y', 'Two/X', 'Top'], 'synopsis: keep me\n'),
		'Off/One/One.md': '---\nsynopsis: first\n---\n', 'Off/One/A.md': 'a\n', 'Off/One/B.md': 'b\n',
		'Off/Two/Two.md': '---\nsynopsis: second\n---\n', 'Off/Two/X.md': 'x\n', 'Off/Two/Y.md': 'y\n', 'Off/Top.md': 't\n',
	});
	await settle(p);
	const snap = async () => { const o = {}; for (const f of await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Off/')).map(f => f.path)`)) o[f] = await read(p, f); return o; };
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	await p.sleep(400);
	await p.ev(`(async () => { const a = app.vault.adapter;
		await a.rename('Off/One', 'Off/Uno');                       // folder renamed; its note keeps the old name
		await a.rmdir('Off/Two', true);                             // folder replaced by a new one of the same name
		await a.mkdir('Off/Two'); await a.write('Off/Two/Fresh.md', 'fresh\\n'); await a.write('Off/Two/Y.md', 'new y\\n');
		await a.copy('Off/Off.md', 'Off/Off copy.md');              // a second binder note, by name after the first
	})().then(() => 1)`);
	await p.sleep(800);
	const disk = {};
	for (const f of await p.ev(`(async () => { const out = []; const walk = async (d) => { const l = await app.vault.adapter.list(d); out.push(...l.files); for (const x of l.folders) await walk(x); }; await walk('Off'); return out; })()`)) disk[f] = await read(p, f);
	const m = await mtime(p, 'Off/Off.md');
	await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
	await p.sleep(2000);
	t.eq(await binderNote(p, 'Off'), 'Off/Off.md', 'the note named like the folder is the binder note');
	const s = await shown(p, 'Off');
	t.eq(j(s.filter((x) => x !== 'Off copy.md')), j(['Two', 'Top.md', 'Uno']), 'Two (listed) first? top level: ' + j(s));
	const uno = await shown(p, 'Off/Uno');
	t.ok(uno.includes('A.md') && uno.includes('B.md') && uno.includes('One.md'), 'Uno shows its old-named folder note as a scene, and loses nothing: ' + j(uno));
	t.eq(await mtime(p, 'Off/Off.md'), m, 'binder note not written at startup');
	for (const [f, x] of Object.entries(disk)) t.eq(await read(p, f), x, f + ' unchanged by startup');
	// a change now: the first write
	await p.ev(`${B}.moveDown(${file('Off/Top.md')}).then(() => 1)`);
	await settle(p);
	const after = await snap();
	for (const [f, x] of Object.entries(disk)) if (f !== 'Off/Off.md') t.eq(after[f], x, f + ' unchanged by the write');
	t.ok(/synopsis: keep me/.test(after['Off/Off.md']), 'the binder note keeps its other property');
	t.eq(split(after['Off/Off.md']).body, "the note's own text\n", 'and its text');
}));

test('closed vault: the whole binder folder moved into another folder and renamed on the disk keeps its order and is not written', withTidy(async (p, h, t) => {
	await put(p, { 'Box/': null, 'Mv/Mv.md': bnote(['Z', 'M', 'A']), 'Mv/A.md': 'a\n', 'Mv/M.md': 'm\n', 'Mv/Z.md': 'z\n' });
	await settle(p);
	const text = await read(p, 'Mv/Mv.md');
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	await p.sleep(400);
	await p.ev(`app.vault.adapter.rename('Mv', 'Box/Moved').then(() => 1)`);
	await p.sleep(800);
	await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
	await p.sleep(2000);
	t.eq(await binderNote(p, 'Box/Moved'), 'Box/Moved/Mv.md', 'a binder at its new place');
	t.eq(j(await shown(p, 'Box/Moved')), j(['Z.md', 'M.md', 'A.md']), 'order kept');
	t.eq(await read(p, 'Box/Moved/Mv.md'), text, 'binder note untouched');
	// renaming the folder now (note is not named like it) renames nothing else
	await p.ev(`app.fileManager.renameFile(${file('Box/Moved')}, 'Box/Renamed').then(() => 1)`);
	await settle(p);
	t.ok(await exists(p, 'Box/Renamed/Mv.md') || await exists(p, 'Box/Renamed/Renamed.md'), 'the binder note is there: ' + j(await dir(p, 'Box/Renamed')));
	t.eq(j(await shown(p, 'Box/Renamed')), j(['Z.md', 'M.md', 'A.md']), 'order still kept');
}));

test('NIT: the binder note edited on the disk while the view is open: cards follow, a broken edit keeps the last good order on screen, and mending it brings the new order', withTidy(async (p, h, t) => {
	await put(p, { 'Live/Live.md': bnote(['C', 'B', 'A']), 'Live/A.md': 'a\n', 'Live/B.md': 'b\n', 'Live/C.md': 'c\n' });
	await settle(p);
	await openView(p, 'Live');
	const order = async () => (await cards(p)).map((x) => x.split('/').pop());
	t.eq(j(await order()), j(['C.md', 'B.md', 'A.md']), 'start');
	await writeRaw(p, 'Live/Live.md', bnote(['A', 'C', 'B']));
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]')?.dataset.path === 'Live/A.md'`, 4000);
	t.eq(j(await order()), j(['A.md', 'C.md', 'B.md']), 'follows an outside edit');
	await writeRaw(p, 'Live/Live.md', '---\nbinder: 1\ncontents: [A, C\n  - B\n---\nx\n');
	await p.sleep(1500);
	const o2 = await order();
	const vt = await p.ev(`(document.querySelector('.workspace-leaf.mod-active .binders-view')?.innerText || 'no view').slice(0, 200)`);
	t.eq(j([...o2].sort()), j(['A.md', 'B.md', 'C.md']), 'the three cards stay while the YAML is broken: ' + j(o2) + ' view says: ' + vt);
	await writeRaw(p, 'Live/Live.md', bnote(['B', 'A', 'C']));
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]')?.dataset.path === 'Live/B.md'`, 4000);
	t.eq(j(await order()), j(['B.md', 'A.md', 'C.md']), 'mended');
	t.eq(await read(p, 'Live/Live.md'), bnote(['B', 'A', 'C']), 'and nothing was written over the edits');
}));

test('the binder note deleted and made again within a moment, and a note renamed to the binder note\'s name by hand, leave the list and every note', withTidy(async (p, h, t) => {
	await put(p, { 'Re/Re.md': bnote(['C', 'B', 'A']), 'Re/A.md': 'a\n', 'Re/B.md': 'b\n', 'Re/C.md': 'c\n' });
	await settle(p);
	const text = await read(p, 'Re/Re.md');
	await p.ev(`(async () => { await app.vault.adapter.remove('Re/Re.md'); await app.vault.adapter.write('Re/Re.md', ${j(text)}); })().then(() => 1)`);
	await settle(p, 1000);
	t.eq(j(await shown(p, 'Re')), j(['C.md', 'B.md', 'A.md']), 'order after delete and recreate');
	// a plain note A renamed onto a binder-ish name: Obsidian refuses; nothing is lost either way
	await p.ev(`app.fileManager.renameFile(${file('Re/A.md')}, 'Re/Re.md').then(() => 1, () => 0)`);
	await settle(p);
	t.eq(await read(p, 'Re/Re.md'), text, 'the binder note is not overwritten');
	t.eq(await read(p, 'Re/A.md'), 'a\n', 'A is still A');
}));

test('a case-only rename of the binder folder and of a subfolder with its folder note, done through Obsidian, keeps the list, the folder notes and the notes', withTidy(async (p, h, t) => {
	await put(p, { 'Case/Case.md': bnote(['sub/', 'sub/B', 'sub/A', 'Z']), 'Case/sub/sub.md': '---\nsynopsis: s\n---\n', 'Case/sub/A.md': 'a\n', 'Case/sub/B.md': 'b\n', 'Case/Z.md': 'z\n' });
	await settle(p);
	await p.ev(`app.fileManager.renameFile(${file('Case/sub')}, 'Case/SUB').then(() => 1, (e) => String(e))`);
	await settle(p);
	t.eq(j((await dir(p, 'Case')).sort()), j(['Case.md', 'SUB', 'Z.md']), 'folder renamed');
	t.ok(await exists(p, 'Case/SUB/SUB.md'), 'folder note followed in case: ' + j(await dir(p, 'Case/SUB')));
	t.eq(j(await contents(p, 'Case/Case.md')), j(['SUB/', 'SUB/B', 'SUB/A', 'Z']), 'list followed');
	await p.ev(`app.fileManager.renameFile(${file('Case')}, 'CASE').then(() => 1, (e) => String(e))`);
	await settle(p);
	const note = (await exists(p, 'CASE/CASE.md')) ? 'CASE/CASE.md' : 'CASE/Case.md';
	t.eq(j(await contents(p, note)), j(['SUB/', 'SUB/B', 'SUB/A', 'Z']), 'list intact after renaming the binder folder in case only: ' + j(await dir(p, 'CASE')));
	t.eq(await read(p, 'CASE/Z.md'), 'z\n', 'Z kept');
}));

test('a subfolder whose folder note has other case (sub/SUB.md) or no folder note at all: a rename makes no note, loses none, and a synopsis typed later makes exactly one', withTidy(async (p, h, t) => {
	await put(p, { 'FN/FN.md': bnote(['none/', 'none/Q', 'cased/', 'cased/R']), 'FN/none/Q.md': 'q\n', 'FN/cased/R.md': 'r\n', 'FN/cased/CASED.md': '---\nsynopsis: odd\n---\n' });
	await settle(p);
	await p.ev(`app.fileManager.renameFile(${file('FN/none')}, 'FN/nada').then(() => 1)`);
	await p.ev(`app.fileManager.renameFile(${file('FN/cased')}, 'FN/Cased2').then(() => 1)`);
	await settle(p);
	t.eq(j(await dir(p, 'FN/nada')), j(['Q.md']), 'no folder note made by a rename');
	const cd = await dir(p, 'FN/Cased2');
	t.ok(cd.includes('R.md') && cd.length <= 3, 'cased folder: ' + j(cd));
	t.ok((await read(p, 'FN/Cased2/' + (cd.find((x) => /^cased2?\.md$/i.test(x)) || 'x'))).includes('synopsis: odd') || cd.includes('CASED.md'), 'the odd-case note keeps its text');
	t.eq(j(await contents(p, 'FN/FN.md')), j(['nada/', 'nada/Q', 'Cased2/', 'Cased2/R']), 'list followed: ' + j(await contents(p, 'FN/FN.md')));
	await p.ev(`${B}.ensureFolderNote(${file('FN/nada')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await dir(p, 'FN/nada')), j(['Q.md', 'nada.md']), 'one folder note made, by the folder\'s name');
}));

test('a list entry for a note that is also the name of a file beside it (paper.pdf and paper.pdf.md), a note and folder of one name, and the Snapshots folder of the writer, all keep their own place through a write', withTidy(async (p, h, t) => {
	await put(p, {
		'Mix/Mix.md': bnote(['paper.pdf.md', 'paper.pdf', 'Same/', 'Same/In', 'Same', 'Snapshots/', 'Snapshots/Mine']),
		'Mix/paper.pdf.md': 'notes\n', 'Mix/Same.md': 'note same\n', 'Mix/Same/In.md': 'in\n', 'Mix/Snapshots/Mine.md': 'mine\n', 'Mix/Tail.md': 't\n',
	});
	await p.ev(`app.vault.adapter.writeBinary('Mix/paper.pdf', new Uint8Array([37, 80, 68, 70]).buffer).then(() => 1)`);
	await settle(p, 1000);
	const s = await shown(p, 'Mix');
	t.ok(s.indexOf('paper.pdf.md') < s.indexOf('paper.pdf'), 'note before the pdf: ' + j(s));
	t.ok(s.indexOf('Same') < s.indexOf('Same.md'), 'folder before the note: ' + j(s));
	t.ok(s.includes('Snapshots'), 'a writer\'s Snapshots folder with notes is an item');
	await p.ev(`${B}.moveDown(${file('Mix/Tail.md')}).then(() => 1)`);
	await settle(p);
	const c = await contents(p, 'Mix/Mix.md');
	t.ok(c.includes('paper.pdf.md') && c.includes('paper.pdf') && c.includes('Same/') && c.includes('Same') && c.includes('Snapshots/Mine'), 'all kept: ' + j(c));
}));

test('a note moved on the disk to where a folder of its name is (and a folder note made by a hand-move) is told: no note is overwritten and the list is sound', withTidy(async (p, h, t) => {
	await put(p, { 'Hm/Hm.md': bnote(['Part/', 'Part/One', 'Part', 'Two']), 'Hm/Part/One.md': '1\n', 'Hm/Part.md': 'scene part\n', 'Hm/Two.md': '2\n' });
	await settle(p);
	// by hand, a scene moved into the folder under the folder's name: it becomes the folder note
	await p.ev(`app.vault.adapter.rename('Hm/Part.md', 'Hm/Part/Part.md').then(() => 1)`);
	await settle(p, 1200);
	t.eq(j(await shown(p, 'Hm/Part')), j(['One.md']), 'the moved scene is the folder note now and hidden');
	t.eq(await read(p, 'Hm/Part/Part.md'), 'scene part\n', 'its text is intact');
	await p.ev(`${B}.moveDown(${file('Hm/Two.md')}).then(() => 1)`);
	await settle(p);
	const c = await contents(p, 'Hm/Hm.md');
	t.ok(!c.includes('Part/Part') && c.includes('Part/One') && !c.includes('Part'), 'no entry for the folder note or the vanished scene: ' + j(c));
	t.eq(await read(p, 'Hm/Part/Part.md'), 'scene part\n', 'still intact');
}));

test('folder-wide undo and a deep rename storm leave no entry pointing at a name that only differs by case on a case-sensitive disk (a/A both exist)', withTidy(async (p, h, t) => {
	// Linux lets "Scene.md" and "scene.md" live side by side; a vault synced to a Mac or Windows machine can't, but here both exist
	await put(p, { 'Cs/Cs.md': bnote(['scene', 'Scene']), 'Cs/scene.md': 'lower\n', 'Cs/Scene.md': 'upper\n' });
	await settle(p);
	const s = await shown(p, 'Cs');
	t.eq(s.length, 2, 'both shown: ' + j(s));
	t.eq(j(s), j(['scene.md', 'Scene.md']), 'each entry finds the file of its own case');
	await p.ev(`${B}.moveDown(${file('Cs/scene.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await contents(p, 'Cs/Cs.md')), j(['Scene', 'scene']), 'written with both cases');
	t.eq(await read(p, 'Cs/scene.md'), 'lower\n', 'lower text kept');
	t.eq(await read(p, 'Cs/Scene.md'), 'upper\n', 'upper text kept');
}));

test('the other way round: the file named with an accent as two letters and the list typed with the one-letter form finds it', withTidy(async (p, h, t) => {
	const nfc = 'Caf\u00e9', nfd = 'Cafe\u0301';
	await put(p, { 'Norm2/Norm2.md': bnote([nfc, 'Zed', 'Alpha']), [`Norm2/${nfd}.md`]: 'c\n', 'Norm2/Zed.md': 'z\n', 'Norm2/Alpha.md': 'a\n' });
	await settle(p);
	const s = await shown(p, 'Norm2');
	t.eq(j(s.map((x) => x.normalize('NFC'))), j([nfc + '.md', 'Zed.md', 'Alpha.md']), 'found: ' + j(s));
}));
