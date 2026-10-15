// Binder templates and templates for new notes (docs/templates.md; ROADMAP.md item 6). New binder asks what the binder
// starts from (Obsidian's prompt): empty, Binders' two, or a binder kept in the templates folder; a folder chooses a
// template note for its new notes in the toolbar's New menu. Whatever writes a note is guard: the template's text and
// property types reach the note, Binders' own keys don't, Undo and Redo, the folder's `template` property, saving a
// binder as a template with and without its text, a newer format refused.
import { B, PL, VIEW, clickMenu, closeMenus, file, hoverMenu, j, menuItems, newNote, openView, read, reload, tidy, until } from './view-helpers.mjs';
import { startEmpty } from './menu-routes.mjs';

export const specs = [];
const test = (name, fn, o = {}) => specs.push({ name: 'templates: ' + name, fn: wrap(fn), ...o });

const L = 'The Lighthouse';
const T = 'Templates';
const SCENE = `---
status: Idea
words: 1500
cast:
  - Mara
  - Harrow
draft: false
due: 2026-11-01
---
# {{title}}

Begun {{date:YYYY}}. <% tp.file.creation_date() %>
`;

/** The templates folder set as Obsidian's Templates plugin keeps it (in memory: the runner resets files, not this). */
const folderSetting = (p, folder) => p.ev(`(() => { app.internalPlugins.getEnabledPluginById('templates').options.folder = ${j(folder)}; return 1; })()`);
function wrap(fn) {
	return async (p, h, t) => {
		try { await fn(p, h, t); } finally {
			await folderSetting(p, '').catch(() => {});
			await p.ev(`(() => { const ps = app.plugins; delete ps.plugins['templater-obsidian']; ps.enabledPlugins.delete('templater-obsidian'); document.querySelectorAll('.modal-container').forEach(m => m.remove()); document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`).catch(() => {});
			await closeMenus(p).catch(() => {});
			await tidy(p);
		}
	};
}
const write = (p, files) => p.ev(`(async () => {
	for (const [path, text] of Object.entries(${j(files)})) {
		const dir = path.split('/').slice(0, -1).join('/');
		for (let i = 1, parts = dir.split('/'); dir && i <= parts.length; i++) { const d = parts.slice(0, i).join('/'); if (!app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d); }
		const f = app.vault.getAbstractFileByPath(path);
		if (f) await app.vault.modify(f, text); else await app.vault.create(path, text);
	}
	await new Promise(r => setTimeout(r, 600));
	return 1;
})()`);
/** Templates/Scene.md, and the templates folder set. */
async function scene(p, text = SCENE) { await write(p, { [`${T}/Scene.md`]: text, [`${T}/Chapter.md`]: '# {{title}}\n' }); await folderSetting(p, T); }
const fm = (p, path) => p.ev(`(() => { const f = ${file(path)}; return f ? app.metadataCache.getFileCache(f)?.frontmatter ?? null : null; })()`);
const has = (p, path) => p.ev(`!!${file(path)}`);
const undo = (p, at, redo = false) => p.ev(`${B}.undo(${file(at)}, ${redo}).catch(e => 'refused: ' + e.message)`);
const files = (p, dir) => p.ev(`app.vault.getFiles().map(f => f.path).filter(x => x.startsWith(${j(dir + '/')})).sort()`);
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent).join(' | ')`);
/** The new binder's name, being asked in the file explorer, left as it is (Escape). */
async function leaveName(p) {
	await until(p, `!!document.activeElement?.closest('.nav-folder-title') && document.activeElement.isContentEditable`, 4000).catch(() => {});
	await p.key('Escape');
	await p.sleep(300);
}
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById(${j('binders:' + id)}); return 1; })()`);
/** The toolbar's New, then a drawer and a row in it. */
async function fromNew(p, drawer, row) {
	const b = await p.at('.workspace-leaf.mod-active .binders-new-button');
	await p.click(b.x, b.y);
	await until(p, `!!document.querySelector('.menu')`);
	if (!drawer) return menuItems(p);
	await hoverMenu(p, drawer);
	await clickMenu(p, row);
	await p.sleep(500);
	return null;
}
/** The picker's rows, by title and the line under it, and the folder at the end. */
const pickerRows = (p) => p.ev(`[...document.querySelectorAll('.binders-start-picker .suggestion-item')].map(e => [e.querySelector('.suggestion-title')?.textContent, e.querySelector('.suggestion-note')?.textContent, e.querySelector('.suggestion-flair')?.textContent ?? ''])`);

// ---- templates for new notes ----

test('a new note in a folder with a template has the template’s text and property types; {{title}} is filled with the name typed; one Undo takes it away, Redo makes it again byte for byte', async (p, h, t) => {
	await scene(p);
	await openView(p, `${L}/Part One`);
	await fromNew(p, 'Template for new notes', 'Scene');
	await until(p, `app.metadataCache.getFileCache(${file(L + '/Part One/Part One.md')} ?? {})?.frontmatter?.template === '[[Scene]]'`, 4000).catch(() => {});
	t.eq((await fm(p, `${L}/Part One/Part One.md`))?.template, '[[Scene]]', 'the folder’s note names it, as a link');
	await newNote(p, 'The wreck');
	const path = `${L}/Part One/The wreck.md`;
	await until(p, `!!${file(path)}`, 4000);
	await p.sleep(800);
	const text = await read(p, path), year = String(new Date().getFullYear());
	t.eq(text, SCENE.replace('{{title}}', 'The wreck').replace('{{date:YYYY}}', year), 'the template’s text, its {{title}} the name typed and its date filled; Templater’s command left as written');
	const f = await fm(p, path);
	t.ok(f && f.words === 1500 && Array.isArray(f.cast) && f.cast.length === 2 && f.draft === false && f.status === 'Idea' && f.due === '2026-11-01', 'a number, a list, a checkbox, text and a date as the template has them: ' + j(f));
	t.ok(await p.ev(`${PL}.binders.orderedChildren(${file(L + '/Part One')}).some(x => x.path === ${j(path)})`), 'and it is in the binder’s order');
	t.eq(await undo(p, path), 'New note “The wreck”', 'one Undo: making it and naming it are one change');
	await p.sleep(500);
	t.ok(!(await has(p, path)), 'the note is taken away');
	await undo(p, `${L}/Part One`, true);
	await until(p, `!!${file(path)}`, 4000);
	t.eq(await read(p, path), text, 'Redo makes it again, byte for byte');
}, { tier: 'guard' });

test('a note written in since it was made from a template is not taken away by Undo', async (p, h, t) => {
	await scene(p);
	await openView(p, `${L}/Part One`);
	await fromNew(p, 'Template for new notes', 'Scene');
	await until(p, `app.metadataCache.getFileCache(${file(L + '/Part One/Part One.md')} ?? {})?.frontmatter?.template === '[[Scene]]'`, 4000).catch(() => {});
	await newNote(p, 'Kept');
	const path = `${L}/Part One/Kept.md`;
	await until(p, `!!${file(path)}`, 4000);
	await p.sleep(600);
	await p.ev(`app.vault.process(${file(path)}, (s) => s + 'A line of mine.\\n').then(() => 1)`);
	t.ok(/refused: .*written in/.test(await undo(p, path)), 'Undo refuses, saying why');
	t.ok((await read(p, path)).endsWith('A line of mine.\n'), 'and the note, with what was written, stays');
}, { tier: 'guard' });

test('Template for new notes: a folder without one takes its parent’s; None in a subfolder stops it there (an empty `template`); Undo takes a choice back', async (p, h, t) => {
	await scene(p);
	await openView(p, L);
	await fromNew(p, 'Template for new notes', 'Chapter');
	t.eq((await fm(p, `${L}/${L}.md`))?.template, '[[Chapter]]', 'the binder note names it');
	await openView(p, `${L}/Part Two`);
	await fromNew(p);
	await hoverMenu(p, 'Template for new notes');
	const rows = await p.ev(`[...document.querySelectorAll('.menu')].pop() && [...[...document.querySelectorAll('.menu')].pop().querySelectorAll('.menu-item')].map(e => [e.querySelector('.menu-item-title').textContent, e.classList.contains('mod-checked') || !!e.querySelector('.menu-item-icon.mod-checked, .mod-checked')])`);
	t.ok(rows.some(([x, on]) => x === `Same as “${L}”` && on), 'Part Two takes the binder’s, and says so, ticked: ' + j(rows));
	await closeMenus(p);
	await newNote(p, 'Heading in');
	await until(p, `!!${file(L + '/Part Two/Heading in.md')}`, 4000);
	await p.sleep(600);
	t.eq(await read(p, `${L}/Part Two/Heading in.md`), '# Heading in\n', 'a new note there starts from the binder’s template');
	await fromNew(p, 'Template for new notes', 'None');
	const pt = await fm(p, `${L}/Part Two/Part Two.md`);
	t.ok(pt && 'template' in pt && !pt.template, 'None writes an empty `template` in Part Two’s note: ' + j(pt));
	await newNote(p, 'Bare');
	await until(p, `!!${file(L + '/Part Two/Bare.md')}`, 4000);
	await p.sleep(400);
	t.eq(await read(p, `${L}/Part Two/Bare.md`), '', 'a new note there starts empty');
	t.eq(await undo(p, `${L}/Part Two`), 'New note “Bare”', 'Undo takes the note back first');
	t.eq(await undo(p, `${L}/Part Two`), 'No template for “Part Two”', 'then the choice');
	await p.sleep(400);
	t.ok(!('template' in ((await fm(p, `${L}/Part Two/Part Two.md`)) ?? {})), 'and Part Two’s note says nothing of a template again');
}, { tier: 'guard' });

test('New note from template: one note from any template, where New note puts it; the folder’s own choice untouched', async (p, h, t) => {
	await scene(p);
	await openView(p, `${L}/Part One`);
	await fromNew(p, 'New note from template', 'Chapter');
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active :is(.binders-card[data-path], .binders-outliner-row) input')`, 4000);
	await p.type('Chapter four'); await p.key('Enter');
	const path = `${L}/Part One/Chapter four.md`;
	await until(p, `!!${file(path)}`, 4000);
	await p.sleep(600);
	t.eq(await read(p, path), '# Chapter four\n', 'the template’s text, named');
	t.ok(!(await has(p, `${L}/Part One/Part One.md`)) || !('template' in ((await fm(p, `${L}/Part One/Part One.md`)) ?? {})), 'the folder names no template');
	await newNote(p, 'Plain');
	await until(p, `!!${file(L + '/Part One/Plain.md')}`, 4000);
	await p.sleep(400);
	t.eq(await read(p, `${L}/Part One/Plain.md`), '', 'and the next New note is empty again');
}, { tier: 'guard' });

// (a note with `binder` is a binder note, so its folder is a binder, never a note template: `contents` is what can
// reach one, and is taken out as `binder` would be: tests/template-text.test.ts)
test('a template’s `contents` (Binders’ list) never reaches a new note, which stays a scene', async (p, h, t) => {
	await scene(p, '---\nstatus: Idea\ncontents:\n  - X\n---\nText\n');
	await openView(p, `${L}/Part One`);
	await fromNew(p, 'Template for new notes', 'Scene');
	await until(p, `app.metadataCache.getFileCache(${file(L + '/Part One/Part One.md')} ?? {})?.frontmatter?.template === '[[Scene]]'`, 4000).catch(() => {});
	await newNote(p, 'Safe');
	const path = `${L}/Part One/Safe.md`;
	await until(p, `!!${file(path)}`, 4000);
	await p.sleep(600);
	t.eq(await read(p, path), '---\nstatus: Idea\n---\nText\n', 'only the other properties and the text');
	t.ok(await p.ev(`${PL}.binders.scenes(${file(L)}).some(f => f.path === ${j(path)})`), 'and it is a scene of the binder');
}, { tier: 'guard' });

test('Templater, set to run on new files: <% %> is copied as written, and what Templater writes a moment later is part of making the note, so Undo still takes it away', async (p, h, t) => {
	await scene(p, '# {{title}}\n<% tp.file.title %>\n');
	// a stand-in for Templater: its settings, and its write to a new note that has its commands
	await p.ev(`(() => {
		app.plugins.enabledPlugins.add('templater-obsidian');
		app.plugins.plugins['templater-obsidian'] = { settings: { trigger_on_file_creation: true, templates_folder: 'Templates' } };
		window.__seen = [];
		const ref = app.vault.on('create', (f) => { if (f.extension !== 'md') return; setTimeout(async () => { const s = await app.vault.read(f); window.__seen.push(s); if (s.includes('<%')) await app.vault.modify(f, s.replace('<% tp.file.title %>', 'by Templater')); }, 300); });
		window.__off = () => app.vault.offref(ref);
		return 1;
	})()`);
	try {
		await openView(p, `${L}/Part One`);
		await fromNew(p, 'Template for new notes', 'Scene');
		await newNote(p);
		const path = `${L}/Part One/Untitled.md`;
		await until(p, `!!${file(path)}`, 4000);
		await p.sleep(1200);
		t.ok((await p.ev('window.__seen')).some((s) => s.includes('<% tp.file.title %>')), 'Templater found its command as written');
		t.eq(await read(p, path), '# Untitled\nby Templater\n', 'and filled it');
		await p.key('Escape');
		t.ok(/^New note/.test(await undo(p, path)), 'Undo takes the note away');
		await p.sleep(400);
		t.ok(!(await has(p, path)), 'it is gone');
	} finally { await p.ev(`(() => { window.__off?.(); return 1; })()`); }
}, { tier: 'guard' });

// ---- New binder ----

test('New binder asks what the binder starts from: Empty binder first, Binders’ two, then the writer’s with their folder; typing narrows; Enter makes an empty binder', async (p, h, t) => {
	await scene(p);
	await write(p, { [`${T}/Mystery/Mystery.md`]: '---\nbinder: 1\ncontents:\n  - Clue\n---\n', [`${T}/Mystery/Clue.md`]: '' });
	await p.sleep(600);
	await run(p, 'new-binder');
	await until(p, `!!document.querySelector('.binders-start-picker .suggestion-item')`, 4000);
	const rows = await pickerRows(p);
	t.eq(j(rows.map((r) => r[0])), j(['Empty binder', 'Chapters and scenes', 'Three acts', 'Mystery']), 'the rows, in order: ' + j(rows));
	t.eq(rows[3][2], T, 'the writer’s says the folder it is kept in');
	t.ok(!rows.some((r) => r[0] === 'Scene'), 'a note template is not a binder template');
	await p.type('thr');
	await p.sleep(300);
	t.eq(j((await pickerRows(p)).map((r) => r[0])), j(['Three acts']), 'typing narrows the list');
	await p.ev(`(() => { const i = document.querySelector('.binders-start-picker input'); i.value = ''; i.dispatchEvent(new Event('input')); return 1; })()`);
	await p.sleep(300);
	t.ok(await startEmpty(p), 'Enter takes the first row');
	await until(p, `!!${file('Untitled binder/Untitled binder.md')}`, 4000);
	t.ok(await p.ev(`${B}.isBinderFolder(${file('Untitled binder')})`), 'an empty binder');
	await leaveName(p);
}, {});

test('New binder from Three acts: the folders, notes and prompts written, the order in the binder note; one Undo (from its notice) takes the whole binder to the trash', async (p, h, t) => {
	await run(p, 'new-binder');
	t.ok(await startEmpty(p, { name: 'Three acts' }), 'Three acts chosen');
	const N = 'Untitled binder';
	await until(p, `!!${file(N + '/' + N + '.md')} && ${B}.isBinderFolder(${file(N)})`, 5000);
	await until(p, `!!${B}.undoable(${file(N)})`, 5000);
	await p.sleep(200);
	t.eq(j(await files(p, N)), j([`${N}/Act One/Act One.md`, `${N}/Act One/Inciting incident.md`, `${N}/Act One/No going back.md`, `${N}/Act One/Opening.md`, `${N}/Act Three/Act Three.md`, `${N}/Act Three/Climax.md`, `${N}/Act Three/Resolution.md`, `${N}/Act Two/Act Two.md`, `${N}/Act Two/All is lost.md`, `${N}/Act Two/Midpoint.md`, `${N}/Act Two/Rising stakes.md`, `${N}/${N}.md`]), 'three acts, eight scenes, a note for each act');
	t.eq(await read(p, `${N}/Act One/Opening.md`), '---\nsynopsis: Where we are, and whose eyes we see it through.\n---\n', 'a prompt is a synopsis, and no text');
	t.eq(j(await p.ev(`${B}.scenes(${file(N)}).map(f => f.basename)`)), j(['Opening', 'Inciting incident', 'No going back', 'Rising stakes', 'Midpoint', 'All is lost', 'Climax', 'Resolution']), 'in the order of the story');
	t.ok(/Made “Untitled binder”/.test(await notices(p)), 'a notice says so: ' + (await notices(p)));
	await leaveName(p);
	const btn = await p.at('.notice .binders-notice-undo');
	t.ok(!!btn, 'with Undo in it');
	await p.click(btn.x, btn.y);
	await until(p, `!${file(N)}`, 4000);
	t.ok(!(await has(p, N)), 'the binder is taken away (to the trash)');
}, { tier: 'guard' });

test('a binder made from a template and written in since is not taken away by Undo', async (p, h, t) => {
	await run(p, 'new-binder');
	await startEmpty(p, { name: 'Chapters and scenes' });
	const N = 'Untitled binder';
	await until(p, `!!${B}.undoable(${file(N)})`, 5000);
	await leaveName(p);
	await p.ev(`app.vault.modify(${file(N + '/Chapter 1/Scene 1.md')}, 'The first line.').then(() => 1)`);
	t.ok(/refused: .*written in/.test(await undo(p, N)), 'Undo refuses, saying why');
	t.eq(await read(p, `${N}/Chapter 1/Scene 1.md`), 'The first line.', 'and keeps the binder, with what was written');
}, { tier: 'guard' });

test('New binder from a saved template: its files byte for byte (property types and all), not its snapshots; named in the file explorer, Undo still takes it away', async (p, h, t) => {
	await folderSetting(p, T);
	const mine = {
		[`${T}/Mystery/Mystery.md`]: '---\nbinder: 1\ntarget: 80000\nsynopsis: A body and a town.\ncontents:\n  - The crime/\n  - The crime/The body\n---\nNotes on the book.\n',
		[`${T}/Mystery/The crime/The crime.md`]: '---\ntarget: 20000\n---\n',
		[`${T}/Mystery/The crime/The body.md`]: '---\nstatus: Idea\nclues: [3, 5]\n---\nWho found it.\n',
		[`${T}/Mystery/Snapshots/x.md`]: 'not copied',
	};
	await write(p, mine);
	await p.sleep(600);
	await run(p, 'new-binder');
	t.ok(await startEmpty(p, { name: 'Mystery' }), 'Mystery chosen');
	const N = 'Untitled binder';
	await until(p, `!!${B}.undoable(${file(N)})`, 5000);
	t.eq(j(await files(p, N)), j([`${N}/The crime/The body.md`, `${N}/The crime/The crime.md`, `${N}/${N}.md`]), 'its notes, the binder note named like the new binder, no snapshots');
	t.eq(await read(p, `${N}/The crime/The body.md`), mine[`${T}/Mystery/The crime/The body.md`], 'a note byte for byte');
	t.eq(await read(p, `${N}/${N}.md`), mine[`${T}/Mystery/Mystery.md`], 'the binder note too');
	t.eq(j((await fm(p, `${N}/The crime/The body.md`))?.clues), '[3,5]', 'a list of numbers stays one');
	// named in the file explorer (the binder note follows), then undone
	await until(p, `document.activeElement?.closest('.nav-folder-title[data-path="${N}"]') && document.activeElement.isContentEditable`, 4000);
	await p.type('Second mystery'); await p.key('Enter');
	await until(p, `!!${file('Second mystery/Second mystery.md')}`, 4000);
	await p.sleep(600);
	t.ok(/^New binder/.test(await undo(p, 'Second mystery')), 'Undo, after naming it');
	await until(p, `!${file('Second mystery')}`, 4000);
	t.ok(!(await has(p, 'Second mystery')), 'takes it away');
	t.eq(await read(p, `${T}/Mystery/The crime/The body.md`), mine[`${T}/Mystery/The crime/The body.md`], 'and the template is as it was');
}, { tier: 'guard' });

test('a template binder of a newer format is listed, says so, and is not made from', async (p, h, t) => {
	await folderSetting(p, T);
	await write(p, { [`${T}/Future/Future.md`]: '---\nbinder: 99\ncontents:\n  - One\n---\n', [`${T}/Future/One.md`]: 'one' });
	await p.sleep(800);
	await run(p, 'new-binder');
	await until(p, `!!document.querySelector('.binders-start-picker .suggestion-item')`, 4000);
	const row = (await pickerRows(p)).find((r) => r[0] === 'Future');
	t.ok(row && /newer version of Binders/.test(row[1]), 'listed, saying a newer Binders made it: ' + j(row));
	await startEmpty(p, { name: 'Future' });
	await p.sleep(800);
	t.ok(!(await has(p, 'Untitled binder')), 'nothing is made');
	t.ok(/can’t be made into a binder/.test(await notices(p)), 'and a notice says why: ' + (await notices(p)));
	t.eq(await read(p, `${T}/Future/Future.md`), '---\nbinder: 99\ncontents:\n  - One\n---\n', 'the template is untouched');
}, { tier: 'guard' });

test('a Longform project in the templates folder is offered, and copied whole as a Longform project', async (p, h, t) => {
	await folderSetting(p, T);
	await write(p, {
		[`${T}/Serial/Index.md`]: '---\nlongform:\n  format: scenes\n  title: Serial\n  sceneFolder: /\n  scenes:\n    - Part A\n    - Part B\n---\n',
		[`${T}/Serial/Part A.md`]: 'A', [`${T}/Serial/Part B.md`]: 'B',
	});
	await p.sleep(1000);
	await run(p, 'new-binder');
	await until(p, `!!document.querySelector('.binders-start-picker .suggestion-item')`, 4000);
	const row = (await pickerRows(p)).find((r) => r[0] === 'Serial');
	t.ok(row && /Longform/.test(row[1]), 'offered, said to be a Longform project: ' + j(row));
	await startEmpty(p, { name: 'Serial' });
	const N = 'Untitled binder';
	await until(p, `!!${file(N + '/Index.md')}`, 5000);
	await leaveName(p);
	await p.sleep(500);
	t.eq(await read(p, `${N}/Index.md`), await read(p, `${T}/Serial/Index.md`), 'its index note byte for byte');
	t.eq(j(await p.ev(`${B}.binderOf(${file(N + '/Part A.md')})?.kind`)), j('longform'), 'and Binders reads it as a Longform project');
	t.eq(j(await p.ev(`${B}.scenes(${B}.binderOf(${file(N + '/Part A.md')}).folder).map(f => f.basename)`)), j(['Part A', 'Part B']), 'with its scenes in order');
}, { tier: 'guard' });

// ---- Save as binder template ----

async function saveDialog(p, name, keep) {
	const row = await p.at(`.nav-folder-title[data-path="${L}"]`);
	await p.right(row.x, row.y);
	await until(p, `!!document.querySelector('.menu')`);
	await clickMenu(p, 'Save as binder template...');
	await until(p, `!!document.querySelector('.binders-save-template input[type=text]')`, 3000);
	await p.ev(`(() => { const i = document.querySelector('.binders-save-template input[type=text]'); i.value = ${j(name)}; i.dispatchEvent(new Event('input')); if (${keep}) document.querySelector('.binders-save-template input[type=checkbox]').click(); return 1; })()`);
	await p.ev(`(() => { document.querySelector('.binders-save-template button.mod-cta').click(); return 1; })()`);
	await until(p, `!!${file(T + '/' + name + '/' + name + '.md')}`, 6000);
	await p.sleep(600);
}

test('Save as binder template: a copy in the templates folder with every note’s properties and no text; the binder note and folder notes whole; no snapshots', async (p, h, t) => {
	await folderSetting(p, T);
	await write(p, { [`${L}/Snapshots/keep.md`]: 'a snapshot', [`${L}/Part One/Part One.md`]: '---\nsynopsis: The arrival.\n---\nAbout part one.\n' });
	const before = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) if (f.path.startsWith('The Lighthouse/')) o[f.path] = await app.vault.read(f); return o; })()`);
	await saveDialog(p, 'Lighthouse shape', false);
	const S = `${T}/Lighthouse shape`;
	const made = await files(p, S);
	t.ok(made.includes(`${S}/Lighthouse shape.md`) && !made.some((x) => x.includes('/Snapshots/')), 'the binder note named for it, and no snapshots: ' + j(made));
	t.eq(await read(p, `${S}/Lighthouse shape.md`), before[`${L}/${L}.md`], 'the binder note whole');
	t.eq(await read(p, `${S}/Part One/Part One.md`), before[`${L}/Part One/Part One.md`], 'a folder note whole');
	const arrival = before[`${L}/Part One/Arrival.md`], front = /^---\n[\s\S]*?\n---\n/.exec(arrival)?.[0] ?? '';
	t.eq(await read(p, `${S}/Part One/Arrival.md`), front, 'a note: its properties as written, and no text');
	for (const [path, text] of Object.entries(before)) t.eq(await read(p, path), text, `“${path}” is untouched`);
	await run(p, 'new-binder');
	await until(p, `!!document.querySelector('.binders-start-picker .suggestion-item')`, 4000);
	t.ok((await pickerRows(p)).some((r) => r[0] === 'Lighthouse shape'), 'and New binder offers it');
}, { tier: 'guard' });

test('Save as binder template with “Keep the notes’ text”: every note byte for byte', async (p, h, t) => {
	await folderSetting(p, T);
	await saveDialog(p, 'Whole copy', true);
	const S = `${T}/Whole copy`;
	for (const n of ['Prologue', 'Part One/Arrival', 'Part Two/The wreck', 'Epilogue']) {
		if (!(await has(p, `${L}/${n}.md`))) continue;
		t.eq(await read(p, `${S}/${n}.md`), await read(p, `${L}/${n}.md`), `“${n}” byte for byte`);
	}
	t.ok((await files(p, S)).length >= 5, 'its notes are all there');
}, { tier: 'guard' });

test('Save as binder template is refused for a binder of a newer format, and is not offered for one', async (p, h, t) => {
	await folderSetting(p, T);
	await write(p, { 'Future/Future.md': '---\nbinder: 99\ncontents:\n  - One\n---\n', 'Future/One.md': 'one' });
	await p.sleep(800);
	const row = await p.at(`.nav-folder-title[data-path="Future"]`);
	await p.right(row.x, row.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok(!(await menuItems(p)).includes('Save as binder template...'), 'not in its menu');
	await closeMenus(p);
	const said = await p.ev(`(async () => { try { await ${PL}.saveBinderTemplate(${B}.binderOf(${file('Future')}), 'X', false); return 'made'; } catch (e) { return e.message; } })()`);
	t.ok(/newer/.test(said), 'and refused if asked: ' + said);
	t.ok(!(await has(p, `${T}/X`)), 'nothing is written');
}, { tier: 'guard' });

// ---- on a phone ----

const PHONE = [390, 844];
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
async function onPhone(p, fn) {
	await metrics(p, ...PHONE);
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop, .modal-container').forEach(m => m.remove()); return 1; })()`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
	}
}
const tapAt = async (p, sel) => {
	const a = await p.at(sel);
	if (!a) throw new Error('nothing to tap: ' + sel);
	await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
	await p.sleep(40);
	await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await p.sleep(450);
};

/** Taps a menu row by its title (the last one shown, a submenu's over its menu's). */
async function tapRow(p, title) {
	await p.ev(`(() => { document.querySelectorAll('[data-test-row]').forEach(e => e.removeAttribute('data-test-row')); const e = [...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}).pop(); e?.setAttribute('data-test-row', '1'); return 1; })()`);
	await tapAt(p, '.menu .menu-item[data-test-row]');
}

test('phone: the New menu’s template rows work by tap; New binder’s prompt is Obsidian’s mobile prompt, and a tap makes a binder from Chapters and scenes', async (p, h, t) => {
	await onPhone(p, async () => {
		await scene(p);
		await openView(p, `${L}/Part One`);
		await p.sleep(600);
		await tapAt(p, '.workspace-leaf.mod-active .binders-new-button');
		await until(p, `!!document.querySelector('.menu')`);
		const rows = await menuItems(p);
		t.ok(rows.includes('New note from template') && rows.includes('Template for new notes'), 'the two rows: ' + j(rows));
		await tapRow(p, 'Template for new notes');
		await p.sleep(400);
		await tapRow(p, 'Scene');
		await p.sleep(900);
		t.eq((await fm(p, `${L}/Part One/Part One.md`))?.template, '[[Scene]]', 'a folder’s template chosen by tap');
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		await run(p, 'new-binder');
		await until(p, `!!document.querySelector('.binders-start-picker .suggestion-item')`, 4000);
		t.eq(j((await pickerRows(p)).map((r) => r[0])), j(['Empty binder', 'Chapters and scenes', 'Three acts']), 'the rows');
		await p.sleep(500);
		await p.ev(`(() => { const e = [...document.querySelectorAll('.binders-start-picker .suggestion-item')].find(e => e.querySelector('.suggestion-title')?.textContent === 'Chapters and scenes'); e.setAttribute('data-test', 'pick'); return 1; })()`);
		await tapAt(p, '.binders-start-picker .suggestion-item[data-test="pick"]');
		const N = 'Untitled binder';
		await until(p, `!!${file(N + '/Chapter 3/Scene 6.md')} && ${B}.isBinderFolder(${file(N)})`, 5000);
		t.ok(await p.ev(`${B}.isBinderFolder(${file(N)})`), 'a binder of three chapters');
	});
});

test('look: on a phone the prompt’s rows and the New menu’s rows are a finger tall', async (p, h, t) => {
	await onPhone(p, async () => {
		await scene(p);
		await run(p, 'new-binder');
		await until(p, `!!document.querySelector('.binders-start-picker .suggestion-item')`, 4000);
		const hs = await p.ev(`[...document.querySelectorAll('.binders-start-picker .suggestion-item')].map(e => Math.round(e.getBoundingClientRect().height))`);
		t.ok(hs.length && hs.every((x) => x >= 44), 'the prompt’s rows: ' + j(hs));
		await p.ev(`(() => { document.querySelectorAll('.modal-container').forEach(m => m.remove()); return 1; })()`);
		await openView(p, `${L}/Part One`);
		await p.sleep(600);
		await tapAt(p, '.workspace-leaf.mod-active .binders-new-button');
		await until(p, `!!document.querySelector('.menu')`);
		await p.sleep(400);
		const ms = await p.ev(`[...document.querySelectorAll('.menu .menu-item')].map(e => Math.round(e.getBoundingClientRect().height))`);
		t.ok(ms.length === 4 && ms.every((x) => x >= 44), 'the New menu: four rows, each 44 px or more: ' + j(ms));
	});
}, { tier: 'look' });
