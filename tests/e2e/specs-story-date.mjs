// The story date (src/time/date.ts, src/view/props.ts): a scene's `story-date` property, set and cleared from the
// outliner's column, the inspector's row and the item menu, one note or several; the column sorted in story time, with
// undated notes last whichever way it runs, and kept as the binder's order, undoably. Every test that changes a note
// asserts the file's bytes: the body unchanged, undo and redo exact, a byte-order mark, Windows line breaks, an edit from
// outside, typing not yet saved, a Longform project, a read-only binder, a phone.
import { mkdirSync } from 'fs';
import { B, NOTE, PL, VIEW, answer, clickMenu, closeMenus, contents, flush, j, menuItems, openView, read, reload, split, texts, tidy, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'story date: ' + name, fn: withTidy(fn) });

const SHOTS = process.env.STORY_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };

const L = 'The Lighthouse/';
const ARRIVAL = 'Part One/Arrival.md', KEEPER = 'Part One/The keeper.md', STORM = 'Part One/Storm warning.md', WRECK = 'Part Two/The wreck.md', LIGHTS = 'Part Two/Lights out.md', PROLOGUE = 'Prologue.md', EPILOGUE = 'Epilogue.md';
const O = '.workspace-leaf.mod-active .binders-outliner';
const R = `${O} .binders-outliner-row`;
const rowSel = (path) => `${R}[data-path="${L}${path}"]`;
const cellSel = (path, col) => `${rowSel(path)} [data-col="${col}"]`;
const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
const KEY = 'story-date';

/** Opens the outliner on a folder with these columns. */
async function open(p, folder = 'The Lighthouse', columns = [{ id: 'storydate' }], extra = {}) {
	await openView(p, folder);
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: ${j(columns)}, ...${j(extra)} } }; v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${R}')`);
	await p.sleep(300);
}
const names = (p) => p.ev(`[...document.querySelectorAll('${R}')].map(r => r.dataset.path.slice(${L.length}))`);
const cellText = (p, path, col = 'storydate') => p.ev(`document.querySelector(${j(cellSel(path, col))})?.textContent ?? null`);
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter ?? {})`).then(JSON.parse);
const raw = (p, path) => read(p, L + path);
/** The property's line on disk, or null. */
const line = async (p, path, key = KEY) => split(await raw(p, path)).yaml.split(/\r?\n/).find((l) => l.startsWith(key + ':')) ?? null;
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent)`);
/** Seeds properties the way Obsidian writes them, then waits for the cache. */
async function seed(p, path, obj) {
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + path)}), (fm) => { Object.assign(fm, ${j(obj)}); }).then(() => 1)`);
	await until(p, `Object.entries(${j(obj)}).every(([k, v]) => JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter?.[k]) === JSON.stringify(v))`);
}
/** Selects a row, clicks the cell and types into it (Enter saves, unless `end` is something else). */
async function type(p, path, text, { col = 'storydate', end = 'Enter' } = {}) {
	const n = await p.at(`${rowSel(path)} .binders-outliner-name`);
	await p.click(n.x, n.y);
	const c = await p.at(cellSel(path, col));
	await p.click(c.x, c.y);
	await until(p, `document.activeElement?.matches('${R} [data-col="${col}"] input')`);
	await p.ev(`document.activeElement.select()`);
	if (text) await p.type(text);
	else await p.key('Backspace');
	if (end) await p.key(end);
	await p.sleep(450);
	await flush(p);
}
const undo = async (p, redo = false) => { await p.ev(`(() => { app.commands.executeCommandById(${j(redo ? 'binders:redo-move' : 'binders:undo-move')}); return 1; })()`); await p.sleep(500); await flush(p); };
const headerMenu = async (p, col, item) => { const th = await p.at(`${O} .binders-outliner-th[data-col="${col}"]`); await p.right(th.x, th.y); await clickMenu(p, item); await p.sleep(300); };
/** What `texts` has for every note but the ones named is as it was. */
const onlyThese = (t, before, after, changed, why = "") => { for (const [path, text] of Object.entries(before)) if (!changed.includes(path)) t.eq(after[path], text, `“${path}” is unchanged${why}`); };

// ---- the column ----

test('the column shows a date in words and takes one typed in any shape; the file gets ISO text, the body and the other properties stay, and nothing typed that isn’t a date is written', async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	const at = L + EPILOGUE, was = before[at], wasYaml = split(was).yaml.split('\n');
	t.eq(await cellText(p, EPILOGUE), '', 'a note with no story date has an empty cell');
	await type(p, EPILOGUE, '14 June 1987');
	t.ok(/^story-date: ["']?1987-06-14["']?$/.test(await line(p, EPILOGUE) ?? ''), 'a day typed in words is written in ISO shape: ' + await line(p, EPILOGUE));
	t.eq(split(await raw(p, EPILOGUE)).body, split(was).body, 'the note’s text is exactly as it was');
	t.eq(j(split(await raw(p, EPILOGUE)).yaml.split('\n').filter((l) => !l.startsWith(KEY))), j(wasYaml), 'and so are the other properties');
	t.eq(await cellText(p, EPILOGUE), '14 June 1987', 'the cell shows it in words');
	await type(p, EPILOGUE, 'June 1987');
	t.ok(/^story-date: ["']?1987-06["']?$/.test(await line(p, EPILOGUE) ?? ''), 'a month stays a month: ' + await line(p, EPILOGUE));
	t.eq(await cellText(p, EPILOGUE), 'June 1987', 'and is shown as one');
	await type(p, EPILOGUE, '1987');
	t.eq(await line(p, EPILOGUE), 'story-date: 1987', 'a year is written as the number YAML reads');
	t.eq((await fm(p, EPILOGUE))[KEY], 1987, 'and is a number to Obsidian');
	t.eq(await cellText(p, EPILOGUE), '1987', 'shown as the year');
	await type(p, EPILOGUE, '1987-06-14');
	t.ok(/^story-date: ["']?1987-06-14["']?$/.test(await line(p, EPILOGUE) ?? ''), 'ISO shape typed is taken as it is');
	const quoted = /"|'/.test(await line(p, EPILOGUE) ?? '');
	console.log('  (Obsidian writes a day ' + (quoted ? 'quoted' : 'plain') + ': ' + await line(p, EPILOGUE) + ')');
	// something that isn't a date stays in its field, says why, and writes nothing
	const keep = await raw(p, EPILOGUE);
	await type(p, EPILOGUE, 'sometime in spring', { end: 'Enter' });
	t.eq(await raw(p, EPILOGUE), keep, 'a non-date written nothing');
	t.ok((await notices(p)).some((x) => /isn’t a date/.test(x)), 'it says it isn’t a date: ' + j(await notices(p)));
	t.ok(await p.ev(`!!document.querySelector('${R} .binders-outliner-field.is-invalid')`), 'the field is marked');
	t.eq(await p.ev(`document.activeElement.value`), 'sometime in spring', 'what was typed is still there');
	await p.key('Escape');
	await p.sleep(250);
	await type(p, EPILOGUE, '30 February 2001');
	t.eq(await raw(p, EPILOGUE), keep, 'a day the month hasn’t got is refused too');
	await p.key('Escape');
	// nothing typed takes the property away, whole
	await type(p, EPILOGUE, '');
	t.eq(await line(p, EPILOGUE), null, 'emptied: the property is gone, not left empty');
	t.eq(split(await raw(p, EPILOGUE)).body, split(was).body, 'the body is as it was');
	t.eq(j(split(await raw(p, EPILOGUE)).yaml.split('\n')), j(wasYaml), 'and the properties are as they were');
	t.eq(await raw(p, EPILOGUE), was, 'the whole file is as it was');
	onlyThese(t, before, await texts(p), [at]);
});

test('a short year and a year before 0 are written as padded text and read back as what was typed', async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	for (const [typed, shown, written] of [['412', '412', '0412'], ['5 March 412', '5 March 412', '0412-03-05'], ['-30', '−30', '-0030'], ['1 February -30', '1 February −30', '-0030-02-01'], ['0', '0', '0000'], ['29 February 2000', '29 February 2000', '2000-02-29']]) {
		await type(p, EPILOGUE, typed);
		const l = await line(p, EPILOGUE) ?? '';
		console.log(`  (${typed} is written as ${l})`);
		t.ok(l.replace(/["']/g, '') === `story-date: ${written}`, `${typed} is written as ${written}: ${l}`);
		t.eq(typeof (await fm(p, EPILOGUE))[KEY], 'string', 'and is text to Obsidian');
		t.eq(await cellText(p, EPILOGUE), shown, 'shown as ' + shown);
		await p.sleep(100);
		await undo(p, false);
		t.eq(await raw(p, EPILOGUE), before[L + EPILOGUE], 'undone, byte for byte');
	}
	// a year that is a number: four digits
	await type(p, EPILOGUE, '1999');
	t.eq(await line(p, EPILOGUE), 'story-date: 1999', 'a four-digit year is the number');
	t.eq(typeof (await fm(p, EPILOGUE))[KEY], 'number', 'a number to Obsidian');
	await type(p, EPILOGUE, '30 February 2001');
	await p.key('Escape');
	t.eq(await line(p, EPILOGUE), 'story-date: 1999', 'a day the month hasn’t got changes nothing');
});

test('a time is kept: a note that has one shows its day, and the time stays when it is edited and left as it is', async (p, h, t) => {
	await seed(p, STORM, { [KEY]: '1987-06-14T21:30' });
	const before = await texts(p);
	await open(p);
	t.eq(await cellText(p, STORM), '14 June 1987', 'the finest thing shown is a day');
	const n = await p.at(`${rowSel(STORM)} .binders-outliner-name`);
	await p.click(n.x, n.y);
	const c = await p.at(cellSel(STORM, 'storydate'));
	await p.click(c.x, c.y);
	await until(p, `document.activeElement?.matches('${R} [data-col="storydate"] input')`);
	t.eq(await p.ev(`document.activeElement.value`), '1987-06-14T21:30', 'editing it shows it as written, time and all');
	await p.key('Enter');
	await p.sleep(400);
	await flush(p);
	t.eq(await texts(p).then((x) => x[L + STORM]), before[L + STORM], 'left as it is, nothing is written');
	await type(p, STORM, '1987-06-14T09:05');
	t.ok(/1987-06-14T09:05/.test(await line(p, STORM) ?? ''), 'a time typed in ISO shape is kept: ' + await line(p, STORM));
});

// ---- sorting ----

/** Dates for a sort: a day, a month, a year (a number), a time, a negative year, a non-date with a comment after it, and
    two notes with none. */
async function dated(p) {
	await seed(p, ARRIVAL, { [KEY]: '1987-06-14' });
	await seed(p, KEEPER, { [KEY]: '1986-12-31' });
	await seed(p, WRECK, { [KEY]: 1987 });
	await seed(p, PROLOGUE, { [KEY]: '-0030-02-01' });
	await seed(p, EPILOGUE, { [KEY]: '2001-01' });
	await writeRaw(p, L + STORM, (await raw(p, STORM)).replace(/^---\n/, '---\nstory-date: sometime in spring # not a date\n'));
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + STORM)}))?.frontmatter?.['story-date'] === 'sometime in spring'`);
}

test('sorted by story time, either way, undated and non-dates last; a value that isn’t a date is shown as typed, in muted text, and the file is never rewritten by looking', async (p, h, t) => {
	await dated(p);
	const before = await texts(p);
	t.ok(before[L + STORM].includes('# not a date'), 'the non-date has a comment after it in the file');
	await open(p);
	t.eq(await cellText(p, STORM), 'sometime in spring', 'a non-date is shown as it was typed');
	t.eq(await p.ev(`document.querySelector(${j(cellSel(STORM, 'storydate') + ' .binders-outliner-field')}).classList.contains('is-unread')`), true, 'marked as unread');
	t.eq(await p.ev(`getComputedStyle(document.querySelector(${j(cellSel(STORM, 'storydate') + ' .binders-outliner-field')})).color === getComputedStyle(document.querySelector(${j(cellSel(ARRIVAL, 'storydate') + ' .binders-outliner-field')})).color`), false, 'in a color of its own, muted');
	t.eq(await cellText(p, PROLOGUE), '1 February −30', 'a year before 0 is shown with a minus');
	t.eq(await cellText(p, 'Part One'), '31 December 1986', 'a folder with no date of its own shows its first note’s, as a placeholder is shown');
	t.eq(await p.ev(`document.querySelector(${j(cellSel('Part One', 'storydate') + ' .binders-outliner-field')}).getAttribute('class').includes('is-empty')`), true, 'but it is placed by its first note, in a placeholder color');
	await headerMenu(p, 'storydate', 'Sort ascending');
	t.eq(j(await names(p)), j([PROLOGUE, 'Part One', KEEPER, ARRIVAL, STORM, 'Part Two', WRECK, LIGHTS, EPILOGUE]), 'ascending: the earliest first, in every folder, a folder by its earliest note, the non-date and the undated last');
	await headerMenu(p, 'storydate', 'Sort descending');
	t.eq(j(await names(p)), j([EPILOGUE, 'Part Two', WRECK, LIGHTS, 'Part One', ARRIVAL, KEEPER, STORM, PROLOGUE]), 'descending: the latest first, and the undated and the non-date still last');
	await headerMenu(p, 'storydate', 'Binder order');
	t.eq(j(await names(p)), j([PROLOGUE, 'Part One', ARRIVAL, KEEPER, STORM, 'Part Two', WRECK, LIGHTS, EPILOGUE]), 'binder order puts them back');
	await p.sleep(300);
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'opened, sorted both ways and put back: not one note was written, the non-date’s comment included');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(500);
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'and closed: still not one');
});

test('“Make this the binder order” on the story date puts the book in chronological order, as one step that undoes and redoes', async (p, h, t) => {
	await dated(p);
	const before = await texts(p), wasOrder = await contents(p);
	await open(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	await headerMenu(p, 'storydate', 'Sort ascending');
	await headerMenu(p, 'storydate', 'Make this the binder order');
	const want = [PROLOGUE.replace('.md', ''), 'Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.indexOf('The keeper') < s.indexOf('Part One/Arrival'))`);
	t.eq(j(await contents(p)), j(want), 'the binder’s list is chronological: ' + j(await contents(p)));
	t.eq(j(await names(p)), j([PROLOGUE, 'Part One', KEEPER, ARRIVAL, STORM, 'Part Two', WRECK, LIGHTS, EPILOGUE]), 'and so are the rows, with the sort let go');
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Sort by story date', 'it can be undone, by name');
	const after = await texts(p);
	onlyThese(t, before, after, [NOTE]);
	await undo(p);
	t.eq(j(await contents(p)), j(wasOrder), 'one undo puts the order back');
	t.eq(await read(p, NOTE), before[NOTE], 'the binder note is byte for byte what it was');
	await undo(p, true);
	t.eq(j(await contents(p)), j(want), 'redo makes it again');
	t.eq(await read(p, NOTE), after[NOTE], 'byte for byte');
	await undo(p);
	t.eq(await read(p, NOTE), before[NOTE], 'and undo again');
	t.eq(j(await texts(p)), j(before), 'no note’s dates or text moved');
});

// ---- the inspector ----

/** Both sidebar views, the inspector open, on the outliner. */
async function side(p) {
	await p.ev(`(async () => {
		const ws = app.workspace;
		for (const t of ['binders-inspector', 'binders-contents']) ws.detachLeavesOfType(t);
		ws.rightSplit.expand();
		const b = ws.getRightLeaf(false); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b);
		const main = ws.getMostRecentLeaf(ws.rootSplit); if (main) ws.setActiveLeaf(main, { focus: true });
	})().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(I)})`);
	await p.sleep(250);
}
const select = async (p, ...paths) => { let first = true; for (const path of paths) { const n = await p.at(`.binders-outliner-row[data-path="${L}${path}"] .binders-outliner-name`); await p.click(n.x, n.y, first ? {} : { modifiers: 2 }); first = false; } await p.sleep(450); };
const fieldSel = `${I} [data-field="story-date"]`;
const shown = (p) => p.ev(`document.querySelector(${j(fieldSel)})?.textContent ?? null`);
async function inspectorType(p, text) {
	await p.ev(`document.querySelector(${j(fieldSel)})?.scrollIntoView({ block: 'center' })`);
	const at = await p.at(fieldSel);
	await p.click(at.x, at.y);
	await until(p, `!!document.querySelector(${j(fieldSel + ' input')})`);
	await p.ev(`document.querySelector(${j(fieldSel + ' input')}).select()`);
	if (text) await p.type(text); else await p.key('Backspace');
	await p.key('Enter');
	await p.sleep(450);
	await flush(p);
}

test('the inspector has a story date row like the target’s: set, changed and cleared for a note, Mixed and set for several', async (p, h, t) => {
	await seed(p, ARRIVAL, { [KEY]: '1987-06' });
	const before = await texts(p);
	await open(p);
	await side(p);
	await select(p, ARRIVAL);
	t.eq(await shown(p), 'June 1987', 'the row shows the date in words');
	t.ok(await p.ev(`document.querySelector(${j(I + ' .metadata-property:has([data-field="story-date"]) .metadata-property-key')})?.textContent.includes('Story date')`), 'named for it');
	await shot(p, 'inspector-dark');
	await inspectorType(p, '3 March 1990');
	t.ok(/^story-date: ["']?1990-03-03["']?$/.test(await line(p, ARRIVAL) ?? ''), 'changed: ' + await line(p, ARRIVAL));
	t.eq(split(await raw(p, ARRIVAL)).body, split(before[L + ARRIVAL]).body, 'the body is as it was');
	await inspectorType(p, '');
	t.eq(await line(p, ARRIVAL), null, 'cleared: the property goes');
	t.eq(await raw(p, ARRIVAL).then((x) => x.includes('story-date')), false, 'nowhere in the file');
	await inspectorType(p, 'sometime in spring');
	t.eq(await line(p, ARRIVAL), null, 'a non-date is refused, and nothing is written');
	t.ok(await p.ev(`!!document.querySelector(${j(fieldSel + '.is-invalid, ' + fieldSel + ' .is-invalid')})`) || (await notices(p)).some((x) => /isn’t a date/.test(x)), 'with why');
	await p.key('Escape');
	// several
	await select(p, ARRIVAL, KEEPER, STORM);
	t.eq(await p.ev(`document.querySelector(${j(fieldSel)}).textContent`), 'No story date', 'none of three has one');
	await inspectorType(p, '1 January 1990');
	for (const path of [ARRIVAL, KEEPER, STORM]) t.ok(/1990-01-01/.test(await line(p, path) ?? ''), `${path} has it`);
	await seed(p, KEEPER, { [KEY]: '1991' });
	await select(p, ARRIVAL, KEEPER);
	t.eq(await shown(p), 'Mixed', 'two that differ say Mixed');
	onlyThese(t, before, await texts(p), [L + ARRIVAL, L + KEEPER, L + STORM]);
});

// ---- the menu ----

async function menuOf(p, path) { const n = await p.at(`${rowSel(path)} .binders-outliner-name`); await p.right(n.x, n.y); await p.sleep(250); }

test('“Set story date...” and “Remove story date” in the item menu: for one note and for several, one undoable step each', async (p, h, t) => {
	await seed(p, KEEPER, { [KEY]: '1986-12-31' });
	const before = await texts(p);
	await open(p, 'The Lighthouse', [{ id: 'label' }]);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	await select(p, ARRIVAL);
	await menuOf(p, ARRIVAL);
	let items = await menuItems(p);
	t.ok(items.includes('Set story date...'), 'a note’s menu has it: ' + items.join(', '));
	t.ok(!items.includes('Remove story date'), 'but not Remove, with none to remove');
	await clickMenu(p, 'Set story date...');
	await until(p, `!!document.querySelector('.modal .binders-ask input, .modal input[type="text"]')`);
	t.eq(await p.ev(`document.querySelector('.modal .modal-title')?.textContent`), 'Story date', 'a dialog, titled');
	await p.type('nonsense');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.modal')`), 'a non-date keeps it open');
	t.ok(/isn’t a date/.test(await p.ev(`document.querySelector('.modal')?.textContent ?? ''`)), 'and says why');
	await p.ev(`document.querySelector('.modal input[type="text"]').select()`);
	await p.type('June 14, 1987');
	await p.key('Enter');
	await p.sleep(500);
	await flush(p);
	t.ok(/^story-date: ["']?1987-06-14["']?$/.test(await line(p, ARRIVAL) ?? ''), 'set: ' + await line(p, ARRIVAL));
	t.eq(split(await raw(p, ARRIVAL)).body, split(before[L + ARRIVAL]).body, 'the body is as it was');
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Set story date of “Arrival”', 'one step, named');
	await undo(p);
	t.eq(await raw(p, ARRIVAL), before[L + ARRIVAL], 'undone: the file is as it was, byte for byte');
	// several at once
	await select(p, ARRIVAL, KEEPER, STORM);
	await menuOf(p, STORM);
	items = await menuItems(p);
	t.ok(items.includes('Set story date...') && items.includes('Remove story date'), 'several: Set, and Remove since one has a date');
	await clickMenu(p, 'Set story date...');
	await until(p, `!!document.querySelector('.modal input[type="text"]')`);
	t.eq(await p.ev(`document.querySelector('.modal input[type="text"]').value`), '', 'dates that differ leave the field empty');
	await p.type('1990');
	await p.key('Enter');
	await p.sleep(500);
	await flush(p);
	for (const path of [ARRIVAL, KEEPER, STORM]) t.eq(await line(p, path), 'story-date: 1990', `${path} has it`);
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Set story date of 3 items', 'one step for all three');
	await undo(p);
	for (const path of [ARRIVAL, KEEPER, STORM]) t.eq(await raw(p, path), before[L + path], `${path}: one undo and it is as it was, byte for byte`);
	await undo(p, true);
	for (const path of [ARRIVAL, KEEPER, STORM]) t.eq(await line(p, path), 'story-date: 1990', `${path}: redo`);
	await undo(p);
	// remove
	await select(p, KEEPER);
	await menuOf(p, KEEPER);
	t.ok((await menuItems(p)).includes('Remove story date'), 'a note with a date has Remove');
	await clickMenu(p, 'Remove story date');
	await p.sleep(500);
	await flush(p);
	t.eq(await line(p, KEEPER), null, 'removed');
	t.eq(await raw(p, KEEPER).then((x) => x.includes('story-date')), false, 'property and all');
	t.eq(split(await raw(p, KEEPER)).body, split(before[L + KEEPER]).body, 'the body is as it was');
	await undo(p);
	t.eq(await raw(p, KEEPER), before[L + KEEPER], 'undone: the date and the file are back, byte for byte');
});

test('a folder can have a date of its own, in its folder note, made only when one is set; Remove on a folder with no note makes none', async (p, h, t) => {
	const before = await texts(p), note = L + 'Part Two/Part Two.md';
	await open(p);
	await select(p, 'Part Two');
	await menuOf(p, 'Part Two');
	t.ok(!(await menuItems(p)).includes('Remove story date'), 'no Remove: it has none');
	await closeMenus(p);
	t.eq(await p.ev(`app.vault.adapter.exists(${j(note)})`), false, 'no folder note to begin with');
	await type(p, 'Part Two', '5 May 2005');
	t.eq(await p.ev(`app.vault.adapter.exists(${j(note)})`), true, 'the folder note is made when a date is set');
	t.ok(/story-date: ["']?2005-05-05/.test(await read(p, note)), 'with the date');
	t.eq(await cellText(p, 'Part Two'), '5 May 2005', 'and the row shows it');
	t.eq(await p.ev(`document.querySelector(${j(cellSel('Part Two', 'storydate') + ' .binders-outliner-field')}).classList.contains('is-empty')`), false, 'as its own, not a placeholder');
	onlyThese(t, before, await texts(p), [note, NOTE].filter((x) => x in before));
});

test('story-order: sorting puts one day’s scenes in that order; a changed date takes it away in the same step, undo puts both back exactly, the same date keeps it, clearing removes it', async (p, h, t) => {
	await seed(p, ARRIVAL, { [KEY]: '1987-06-14', 'story-order': 2 });
	await seed(p, KEEPER, { [KEY]: '1987-06-14', 'story-order': '1' });
	await seed(p, STORM, { [KEY]: '1987-06-14' });
	await open(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	await headerMenu(p, 'storydate', 'Sort ascending');
	t.eq(j((await names(p)).filter((n) => n.startsWith('Part One/'))), j([KEEPER, ARRIVAL, STORM]), 'one day: by story-order, the one without after');
	await headerMenu(p, 'storydate', 'Sort descending');
	t.eq(j((await names(p)).filter((n) => n.startsWith('Part One/'))), j([STORM, ARRIVAL, KEEPER]), 'descending runs it the other way');
	await headerMenu(p, 'storydate', 'Binder order');
	const was = await raw(p, ARRIVAL);
	t.ok(/story-order: 2/.test(was), 'the order is in the file');
	await type(p, ARRIVAL, '14 June 1987');
	t.eq(await raw(p, ARRIVAL), was, 'the same date again: nothing written, the order stays');
	await type(p, ARRIVAL, '15 June 1987');
	let now = await raw(p, ARRIVAL);
	t.ok(/story-date: 1987-06-15/.test(now) && !now.includes('story-order'), 'another day: the order goes in the same write: ' + JSON.stringify(now.slice(0, 120)));
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Set story date of “Arrival”', 'one step, named for the date');
	await undo(p);
	t.eq(await raw(p, ARRIVAL), was, 'undo puts both back, byte for byte');
	await undo(p, true);
	t.eq(await raw(p, ARRIVAL), now, 'redo: byte for byte');
	await undo(p);
	await type(p, ARRIVAL, '');
	now = await raw(p, ARRIVAL);
	t.ok(!now.includes('story-date') && !now.includes('story-order'), 'cleared: both go');
	await undo(p);
	t.eq(await raw(p, ARRIVAL), was, 'undo: both back, byte for byte');
});

// ---- never lose writing ----

test('undo, redo, undo are exact: a month stays a month, a note with no property gets none back, other properties keep their places', async (p, h, t) => {
	await seed(p, ARRIVAL, { [KEY]: '1987-06' });
	await open(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	const none = await raw(p, KEEPER), month = await raw(p, ARRIVAL);
	await type(p, KEEPER, '1990-02-03');
	const setNone = await raw(p, KEEPER);
	t.ok(setNone !== none && setNone.includes('1990-02-03'), 'set on a note with none');
	await type(p, ARRIVAL, '14 June 1987');
	const setDay = await raw(p, ARRIVAL);
	t.ok(/1987-06-14/.test(setDay), 'a month changed to a day');
	await undo(p);
	t.eq(await raw(p, ARRIVAL), month, 'undo: `1987-06` is `1987-06`, byte for byte');
	t.eq(await line(p, ARRIVAL), (month.match(/^story-date:.*$/m) ?? [null])[0], 'the same line');
	await undo(p);
	t.eq(await raw(p, KEEPER), none, 'undo: no property is no property, byte for byte');
	await undo(p, true);
	t.eq(await raw(p, KEEPER), setNone, 'redo: exactly as it was set');
	await undo(p, true);
	t.eq(await raw(p, ARRIVAL), setDay, 'redo: the day');
	await undo(p);
	await undo(p);
	t.eq(await raw(p, ARRIVAL), month, 'undo again: the month');
	t.eq(await raw(p, KEEPER), none, 'and none');
});

test('an edit from outside between opening and setting is kept, and a change from outside since the set stops its undo', async (p, h, t) => {
	await open(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	const was = await raw(p, KEEPER);
	// somebody else, a sync, writes the body and a property
	const theirs = was.replace('---\n', '---\nmood: wet\n') + 'Added by another program.\n';
	await writeRaw(p, L + KEEPER, theirs);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + KEEPER)}))?.frontmatter?.mood === 'wet'`);
	await type(p, KEEPER, '1990');
	const after = await raw(p, KEEPER);
	t.ok(after.includes('Added by another program.') && after.includes('mood: wet') && /story-date: 1990/.test(after), 'their text and property are kept, and the date set');
	t.eq(split(after).body, split(theirs).body, 'the body is theirs, byte for byte');
	// and a second time, since the set
	await writeRaw(p, L + KEEPER, after.replace('story-date: 1990', 'story-date: 1999'));
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + KEEPER)}))?.frontmatter?.['story-date'] === 1999`);
	const mid = await raw(p, KEEPER);
	await undo(p);
	t.eq(await raw(p, KEEPER), mid, 'changed since, the undo writes nothing');
	t.ok((await notices(p)).some((x) => /changed since/.test(x)), 'and says so: ' + j(await notices(p)));
});

test('typing in the manuscript that is not saved yet is kept when a story date is set from the inspector', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await p.sleep(1200);
	await side(p);
	await p.ev(`(() => { const v = ${VIEW}; app.workspace.setActiveLeaf(v.leaf, { focus: true }); v.revealItem(app.vault.getAbstractFileByPath(${j(L + ARRIVAL)})); return 1; })()`);
	await p.sleep(700);
	const at = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.textContent.includes('The supply boat left')); const x = s?.querySelector('.cm-line, p'); const r = x?.getBoundingClientRect(); return r ? { x: r.left + 60, y: r.top + 12 } : null; })()`);
	await p.click(at.x, at.y);
	await p.key('End');
	await p.type(' TYPED-NOT-SAVED');
	await until(p, `${VIEW}.currentItem()?.path === ${j(L + ARRIVAL)}`);
	await until(p, `!!document.querySelector(${j(fieldSel)})`);
	await inspectorType(p, '1987-06-14');
	await p.sleep(800);
	await flush(p);
	const file = await raw(p, ARRIVAL);
	t.ok(file.includes('TYPED-NOT-SAVED'), 'the typing is in the file');
	t.ok(/story-date: ["']?1987-06-14/.test(file), 'and so is the date');
	t.ok(file.includes('The supply boat left Mara on the jetty with two cases and a letter she had not opened.'), 'and the text that was there');
});

test('a note that starts with a byte-order mark keeps it, and its text; one with Windows line breaks keeps its text byte for byte', async (p, h, t) => {
	const bom = '﻿---\nstatus: draft\nsynopsis: Marked.\n---\nThe first line, with a mark before it.\n\nA second paragraph.\n';
	const crlf = '---\r\nstatus: draft\r\nsynopsis: Windows.\r\n---\r\nThe first line.\r\n\r\nA second paragraph, with a é.\r\n';
	await writeRaw(p, L + STORM, bom);
	await writeRaw(p, L + WRECK, crlf);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + WRECK)}))?.frontmatter?.synopsis === 'Windows.'`);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + STORM)}))?.frontmatter?.synopsis === 'Marked.'`);
	await open(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	await type(p, STORM, '12 May 1500');
	const b = await raw(p, STORM);
	t.ok(b.startsWith('﻿---'), 'the mark is still first');
	t.eq(b.slice(b.indexOf('\n---\n') + 5), bom.slice(bom.indexOf('\n---\n') + 5), 'the text is byte for byte what it was');
	t.ok(/story-date: ["']?1500-05-12/.test(b) && b.includes('status: draft') && b.includes('synopsis: Marked.'), 'the date set and the properties kept: ' + JSON.stringify(b.slice(0, 90)));
	await undo(p);
	t.eq(await raw(p, STORM), bom, 'undone: byte for byte, mark and all');
	await type(p, WRECK, 'June 1987');
	const c = await raw(p, WRECK);
	const body = c.slice(c.search(/\n---\r?\n/) + 1).replace(/^---\r?\n/, '');
	t.eq(body, 'The first line.\r\n\r\nA second paragraph, with a é.\r\n', 'Windows line breaks: the text is byte for byte what it was');
	t.ok(/story-date: ["']?1987-06/.test(c) && c.includes('synopsis: Windows.'), 'and the date is set: ' + JSON.stringify(c.slice(0, 100)));
	console.log('  (Obsidian wrote the properties of a Windows-line-break note with ' + (/\r\n/.test(c.slice(0, c.search(/\n---\r?\n/) + 5)) ? 'CRLF' : 'LF') + ')');
	await undo(p);
	const u = await raw(p, WRECK);
	t.eq(u.slice(u.search(/\n---\r?\n/) + 1).replace(/^---\r?\n/, ''), 'The first line.\r\n\r\nA second paragraph, with a é.\r\n', 'undone: the text is still byte for byte');
	t.ok(!u.includes('story-date'), 'and the date is gone');
});

test('a Longform project: the story date is written to the scene, and only the scene', async (p, h, t) => {
	const before = await texts(p);
	await open(p, 'Longform demo');
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	const LF = 'Longform demo/', row = (n) => `${R}[data-path="${LF}${n}"]`;
	const n = await p.at(`${row('Island.md')} .binders-outliner-name`);
	await p.click(n.x, n.y);
	const c = await p.at(`${row('Island.md')} [data-col="storydate"]`);
	await p.click(c.x, c.y);
	await until(p, `document.activeElement?.matches('${R} [data-col="storydate"] input')`);
	await p.type('2 May 1999');
	await p.key('Enter');
	await p.sleep(500);
	await flush(p);
	const island = await read(p, LF + 'Island.md');
	t.ok(/story-date: ["']?1999-05-02/.test(island), 'the scene has it: ' + JSON.stringify(island.slice(0, 80)));
	const after = await texts(p);
	onlyThese(t, before, after, [LF + 'Island.md']);
	t.eq(after[LF + 'Index.md'], before[LF + 'Index.md'], 'the index note is byte for byte what it was');
	t.eq(split(island).body, split(before[LF + 'Island.md']).body, 'and the scene’s text');
	await undo(p);
	t.eq(await read(p, LF + 'Island.md'), before[LF + 'Island.md'], 'undone, byte for byte');
});

test('a binder in a newer format is read only: no story date can be set, changed or removed', async (p, h, t) => {
	await seed(p, ARRIVAL, { [KEY]: '1987-06' });
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2'));
	try {
		await p.sleep(700);
		await open(p);
		await side(p);
		const before = await texts(p);
		t.eq(await cellText(p, ARRIVAL), 'June 1987', 'the date shows');
		const c = await p.at(cellSel(ARRIVAL, 'storydate'));
		await p.click(c.x, c.y);
		await p.click(c.x, c.y);
		t.ok(!(await p.ev(`!!document.querySelector('${O} input, ${O} textarea')`)), 'the cell opens no field');
		const n = await p.at(`${rowSel(ARRIVAL)} .binders-outliner-name`);
		await p.click(n.x, n.y);
		await p.right(n.x, n.y);
		const items = await menuItems(p);
		t.ok(!items.includes('Set story date...') && !items.includes('Remove story date'), 'the menu has neither: ' + items.join(', '));
		await closeMenus(p);
		await p.sleep(300);
		const at = await p.at(fieldSel);
		if (at) { await p.click(at.x, at.y); t.ok(!(await p.ev(`!!document.querySelector(${j(fieldSel + ' input')})`)), 'the inspector’s row opens no field'); }
		t.eq(j(await texts(p)), j(before), 'nothing was written');
	} finally { await writeRaw(p, NOTE, orig); await p.sleep(500); }
});

test('the property’s name is settable: a note with the date under another name shows it, and sets it there', async (p, h, t) => {
	await seed(p, ARRIVAL, { when: '1987-06-14' });
	await p.ev(`(async () => { ${PL}.settings.storyDateProp = 'when'; await ${PL}.saveSettings(); })().then(() => 1)`);
	try {
		await open(p);
		t.eq(await cellText(p, ARRIVAL), '14 June 1987', 'read from the other name');
		await type(p, KEEPER, '1990');
		t.eq(await line(p, KEEPER, 'when'), 'when: 1990', 'and written there');
		t.eq(await line(p, KEEPER, KEY), null, 'not under the default name');
	} finally { await p.ev(`(async () => { ${PL}.settings.storyDateProp = 'story-date'; await ${PL}.saveSettings(); })().then(() => 1)`); }
});

// ---- a phone ----

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
async function onPhone(p, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		await p.ev(`document.activeElement?.blur?.()`);
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
		await tidy(p);
	}
}

test('a phone: a held row’s menu has “Set story date...”, a tap in a finger-tall dialog sets it, and the column is read in words', async (p, h, t) => {
	await seed(p, KEEPER, { [KEY]: '1986-12-31' });
	const before = await texts(p);
	await onPhone(p, async () => {
		await open(p, 'The Lighthouse', [{ id: 'storydate' }]);
		await p.sleep(50);
		t.eq(await cellText(p, KEEPER), '31 December 1986', 'the cell shows the date in words');
		await p.ev(`document.querySelector(${j(rowSel(ARRIVAL))}).scrollIntoView({ block: 'center' })`);
		await p.sleep(300);
		const g = await p.at(`${rowSel(ARRIVAL)} .binders-outliner-name`);
		await touch(p, 'touchStart', g.l + 14, g.y);
		await p.sleep(750);
		await touch(p, 'touchEnd');
		await p.sleep(600);
		const items = await menuItems(p);
		t.ok(items.includes('Set story date...'), 'the held row’s menu has it: ' + items.join(', '));
		const find = `[...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.menu-item-title')?.textContent === 'Set story date...').pop()`;
		await p.ev(`${find}.scrollIntoView({ block: 'center' })`);
		await p.sleep(250);
		const at = await p.ev(`(() => { const r = (${find}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; })()`);
		t.ok(at.h >= 44, `a finger tall (${Math.round(at.h)} px)`);
		await tap(p, at.x, at.y);
		await until(p, `!!document.querySelector('.modal input[type="text"]')`);
		await p.sleep(400);
		const d = await p.ev(`(() => { const m = document.querySelector('.modal').getBoundingClientRect(), i = document.querySelector('.modal input[type="text"]').getBoundingClientRect(); return { fits: m.left >= 0 && m.right <= innerWidth && i.right <= innerWidth, menus: document.querySelectorAll('.menu').length, mode: document.querySelector('.modal input[type="text"]').inputMode }; })()`);
		t.ok(d.fits, 'the dialog fits the screen');
		t.eq(d.menus, 0, 'the sheet is gone');
		await p.type('June 1987');
		await p.key('Enter');
		await p.sleep(700);
		await flush(p);
		t.ok(/story-date: ["']?1987-06/.test(await line(p, ARRIVAL) ?? ''), 'set on the phone: ' + await line(p, ARRIVAL));
		t.eq(split(await raw(p, ARRIVAL)).body, split(before[L + ARRIVAL]).body, 'the text is as it was');
		await shot(p, 'phone-dark');
	});
});

// ---- the look ----

test('screenshots: the column and the inspector', async (p, h, t) => {
	await dated(p);
	await open(p, 'The Lighthouse', [{ id: 'label' }, { id: 'status' }, { id: 'storydate' }, { id: 'words' }]);
	await side(p);
	await select(p, ARRIVAL);
	await p.sleep(400);
	await shot(p, 'outliner-dark');
	await headerMenu(p, 'storydate', 'Sort ascending');
	await shot(p, 'outliner-sorted-dark');
	t.ok(true, 'shot');
});
