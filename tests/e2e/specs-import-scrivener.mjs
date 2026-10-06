// Import from Scrivener, through the real dialog. The source is a throwaway project outside the throwaway vault. Only the system's own dialog for choosing a folder is
// stood in for; the desktop's reader, the browser's file chooser for a zip, the plan, the preview and every write are real.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { zipSync } from 'fflate';
import { B, PL, VIEW, j, until, withTidy, texts, same, read, exists, openView, reload, closeMenus, menuItems } from './view-helpers.mjs';

export const specs = [];
const WIN = '.modal.binders-import', ROOT = 'Imported book', SCENE = `${ROOT}/Chapter/Arrival.md`;
const ID = (n) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;
const item = (n, type, title, meta = '', kids = '') => `<BinderItem UUID="${ID(n)}" Type="${type}"><Title>${title}</Title><MetaData>${meta}</MetaData>${kids ? `<Children>${kids}</Children>` : ''}</BinderItem>`;
const included = '<IncludeInCompile>Yes</IncludeInCompile>', enc = new TextEncoder();
const fixture = new Map([
	[`${ROOT}.scrivx`, enc.encode(`<ScrivenerProject Version="2.0" Creator="Test"><LabelSettings><Labels><Label ID="0" Color="1.0 0.0 0.0">Red</Label></Labels></LabelSettings><StatusSettings><StatusItems><Status ID="0">Needs polish</Status></StatusItems></StatusSettings><Binder>${item(1, 'DraftFolder', 'Manuscrit', included, item(2, 'Folder', 'Chapter', included, item(3, 'Text', 'Arrival', included + '<LabelID>0</LabelID><StatusID>0</StatusID>') + item(4, 'Text', 'Cut scene', '')))}${item(5, 'ResearchFolder', 'Sources', '', item(6, 'Text', 'Research note'))}${item(7, 'TrashFolder', 'Trash', '', item(8, 'Text', 'Trashed'))}</Binder></ScrivenerProject>`)],
	[`Files/Data/${ID(2)}/content.rtf`, enc.encode('{\\rtf1 Chapter opening.}')],
	[`Files/Data/${ID(3)}/content.rtf`, enc.encode('{\\rtf1\\ansi\\uc1 Mara arrived. {\\b Bold} \\u-10179?\\u-8704?\\par\\tab Second paragraph.}')],
	[`Files/Data/${ID(3)}/synopsis.txt`, enc.encode('A boat arrives.')],
	[`Files/Data/${ID(3)}/notes.rtf`, enc.encode('{\\rtf1 Ask about the tide.}')],
	[`Files/Data/${ID(4)}/content.rtf`, enc.encode('{\\rtf1 Cut writing stays.}')],
	[`Files/Data/${ID(6)}/content.rtf`, enc.encode('{\\rtf1 Research writing.}')],
	[`Snapshots/${ID(3)}.snapshots/index.xml`, enc.encode('<Snapshots Version="1.0"><Snapshot><Title>Before rewrite</Title><Date>2026-09-01 10:00:00 -0400</Date></Snapshot></Snapshots>')],
	[`Snapshots/${ID(3)}.snapshots/2026-09-01-10-00-00-0400.rtf`, enc.encode('{\\rtf1 Earlier arrival.}')],
]);
const sourceDir = resolve('test-dist/import-source', `${ROOT}.scriv`), zipPath = resolve('test-dist/import-source/backup.zip');
function resetSource() {
	for (const [path, data] of fixture) { const at = join(sourceDir, path); mkdirSync(at.slice(0, at.lastIndexOf('/')), { recursive: true }); writeFileSync(at, data); }
	writeFileSync(zipPath, zipSync(Object.fromEntries([...fixture].map(([p, b]) => [`${ROOT}.scriv/${p}`, b]))));
}
resetSource();
const sourceUnchanged = (t) => { for (const [path, data] of fixture) t.eq(Buffer.compare(readFileSync(join(sourceDir, path)), data), 0, `source ${path} is unchanged`); };
/** A zip of the fixture with some files changed, added (a value) or taken out (null). Returns its path. */
function zipOf(name, changes = {}) {
	const files = new Map(fixture);
	for (const [path, data] of Object.entries(changes)) { if (data == null) files.delete(path); else files.set(path, typeof data === 'string' ? enc.encode(data) : data); }
	const at = resolve('test-dist/import-source', name);
	writeFileSync(at, zipSync(Object.fromEntries([...files].map(([p, b]) => [`${ROOT}.scriv/${p}`, b]))));
	return at;
}
const press = async (p, label) => {
	const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b || b.disabled) return false; b.click(); return true; })()`);
	if (!ok) throw new Error(`no enabled import button “${label}”`);
	await p.sleep(100);
};
const text = (p, sel) => p.ev(`document.querySelector('${WIN} ${sel}')?.textContent ?? ''`);
/** What the first dialog says (what it is doing, or why it couldn't), and why the second can't import as it is. */
const said = (p) => text(p, '.binders-import-said'), why = (p) => text(p, '.binders-import-why');
const things = (p) => p.ev(`[...document.querySelectorAll('${WIN} .binders-export-warn')].map(w => w.querySelector('.binders-export-warn-note').textContent + ': ' + w.querySelector('.binders-export-warn-text').textContent)`);
const NOTES = `${WIN} [role="treeitem"][aria-selected]`;
/** The binder as the dialog lists it: each row indented by its level, a folder with "/", a status in brackets. */
const tree = (p) => p.ev(`[...document.querySelectorAll('${WIN} [role="treeitem"]')].map(r => '  '.repeat(Number(r.getAttribute('aria-level')) - 1) + r.querySelector('.tree-item-inner').textContent + (r.hasAttribute('aria-expanded') ? '/' : '') + (r.querySelector('.tree-item-flair') ? ' [' + r.querySelector('.tree-item-flair').textContent + ']' : ''))`);
const shown = (p) => p.ev(`document.querySelector('${WIN} .binders-import-note')?.innerText ?? ''`);
const pick = async (p, name) => { await p.ev(`(() => { [...document.querySelectorAll('${NOTES}')].find(r => r.querySelector('.tree-item-inner').textContent === ${j(name)}).click(); return 1; })()`); await p.sleep(200); };
/** Opens the dialog and chooses a project: its folder through the desktop's reader (the system's dialog alone is
    stood in for), or a zip through the browser's own file chooser. `fails`: the first dialog is expected to stay. */
const begin = async (p, { desktop = false, zip = zipPath, dir = sourceDir, fails = false } = {}) => {
	await p.ev(`(() => { const pl = ${PL}; window.__importHost ??= pl.importHost.desktop; pl.importHost.desktop = ${desktop ? `(app) => { const d = window.__importHost(app); if (!d) throw new Error('desktop reader missing'); return {...d, pick: async () => ${j(dir)}}; }` : '() => null'}; app.commands.executeCommandById('binders:import-scrivener'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN}')`);
	if (desktop) await press(p, 'Choose a project...'); else {
		await p.send('Page.setInterceptFileChooserDialog', { enabled: true });
		await press(p, 'Choose a zipped backup...');
		const doc = await p.send('DOM.getDocument');
		const found = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: WIN + ' input[type="file"]' });
		await p.send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files: [zip] });
		await p.send('Page.setInterceptFileChooserDialog', { enabled: false });
	}
	if (fails) { await until(p, `!!document.querySelector('${WIN} .binders-import-said')?.textContent && !document.querySelector('${WIN} .binders-import-said.is-doing')`, 15_000); return; }
	// (the second dialog: its choices are in the page on a computer and on a phone, where the list waits behind Preview)
	const ready = await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15_000);
	if (!ready) throw new Error('import did not load: ' + await said(p));
	// (a phone slides the first dialog away as the second comes: the second is alone once that is done)
	await until(p, `document.querySelectorAll('${WIN}').length === 1`, 3000);
	await p.sleep(150);
};
const imported = async (p, root = ROOT) => {
	await press(p, 'Import');
	const ready = await until(p, `!!${B}.binderOf(${j(root)}) && !document.querySelector('${WIN}')`, 20_000);
	if (!ready) throw new Error('import did not finish: ' + await why(p));
	await p.sleep(300);
};
const closeAll = async (p) => { for (let i = 0; i < 4 && await p.ev(`!!document.querySelector('.modal-container')`); i++) { await p.key('Escape'); await p.sleep(150); } };
const test = (name, fn) => specs.push({ name: 'Scrivener import: ' + name, fn: withTidy(async (p, h, t) => {
	resetSource();
	const before = await texts(p);
	try { await fn(p, h, t, before); } finally {
		await p.ev(`(() => { if (window.__importHost) ${PL}.importHost.desktop = window.__importHost; if (window.__importCreate) { app.vault.createBinary = window.__importCreate; delete window.__importCreate; } document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		await closeAll(p);
	}
}) });

test('a zip is read without anything being made: the binder as it will be, a note as it will read, both switches on; only in the command palette', async (p, h, t, before) => {
	await p.ev(`(() => { const e=document.querySelector('.nav-folder-title[data-path="Longform demo"]'); if(!e) throw new Error('folder row missing'); const r=e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10,button:2})); return 1; })()`);
	await p.sleep(100); const folderMenus = await menuItems(p);
	t.ok(!folderMenus.some((s) => /Scrivener/i.test(s)), 'a folder’s menu has no import in it'); await closeMenus(p);
	await begin(p);
	t.eq((await tree(p)).join('\n'), ['Chapter/', '  Chapter text', '  Arrival [Needs polish]', '  Cut scene', 'Research/', '  Research note'].join('\n'), 'the binder as it will be, in Scrivener’s order, with a status at its row’s end');
	t.eq(await p.ev(`document.querySelectorAll('${WIN} .checkbox-container.is-enabled').length`), 2, 'Research and Snapshots are on');
	t.ok((await shown(p)).includes('Chapter opening'), 'the first note is shown as it will read');
	t.ok(await p.ev(`(() => { const r=document.querySelector('${WIN} .binders-import-note').getBoundingClientRect(); return r.width>250 && r.height>80; })()`), 'with room to read it');
	t.eq(await text(p, '.binders-snapshots-detail'), '4 notes · 2 folders · 1 snapshot', 'the bar counts what will be made');
	t.eq(await text(p, '.binders-export-place'), `Goes to ${ROOT}, in this vault`, 'and the choices say where');
	t.ok((await text(p, '.binders-export-needs')).includes('1 document in Scrivener’s Trash is left out'), 'what is in the Trash is said to be left');
	await pick(p, 'Arrival');
	t.ok((await shown(p)).includes('Mara arrived. Bold 😀') && (await shown(p)).includes('Second paragraph'), 'another note is shown when its row is clicked');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-import-note code, ${WIN} .binders-import-note pre') ? 'code' : 'prose'`), 'prose', 'a paragraph begun with a tab is shown as a paragraph, not as code');
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="research"]').click(); return 1; })()`); await p.sleep(300);
	t.eq((await tree(p)).join('|'), 'Chapter/|  Chapter text|  Arrival [Needs polish]|  Cut scene|Research/', 'with Research off its documents are left, and the folder is there for the originals');
	t.ok(!(await exists(p, ROOT)), 'nothing has been made');
	await closeAll(p);
	t.ok(!(await exists(p, ROOT)), 'and closing the dialog makes nothing'); same(t, before, await texts(p)); sourceUnchanged(t);
});

test('a project’s folder becomes a binder: Scrivener’s order, the writing in every view, snapshots, the originals, and an editor’s undo', async (p, h, t, before) => {
	await begin(p, { desktop: true }); await imported(p);
	t.ok(await exists(p, `${ROOT}/Chapter/Chapter text.md`), 'a folder’s own text is its first note');
	// (asked of the binder itself, not of what a note says: alphabetical would be Arrival, Chapter text, Cut scene)
	t.eq(await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath(${j(ROOT)})).map(f => f.path.slice(${ROOT.length + 1}, -3)).join('|')`), 'Chapter/Chapter text|Chapter/Arrival|Chapter/Cut scene|Research/Research note', 'the binder has Scrivener’s order');
	t.eq(await p.ev(`app.metadataCache.getCache(${j(SCENE)})?.frontmatter?.synopsis`), 'A boat arrives.', 'a synopsis is the note’s');
	t.eq(await p.ev(`app.metadataCache.getCache(${j(SCENE)})?.frontmatter?.status`), 'Needs polish', 'and its status');
	t.ok((await read(p, SCENE)).endsWith('Mara arrived. **Bold** 😀\n\n\tSecond paragraph.\n'), 'the text is the writer’s: bold, a character outside the first plane, a tab, and no backslash after a sentence');
	t.eq(await read(p, `${ROOT}/Research/Originals/Chapter/Arrival/content.rtf`), new TextDecoder().decode(fixture.get(`Files/Data/${ID(3)}/content.rtf`)), 'the original file is kept as it was, under its note’s name');
	t.ok(await p.ev(`app.metadataCache.getCache(${j(`${ROOT}/Chapter/Cut scene.md`)})?.frontmatter?.export === false`), 'a document left out of compile is kept, and left out of exports');
	t.ok(await p.ev(`app.metadataCache.getCache(${j(`${ROOT}/Research/Research.md`)})?.frontmatter?.export === false`), 'Research is left out of exports');
	t.ok(await p.ev(`${PL}.settings.statuses.includes('Needs polish') && ${PL}.settings.labels.some(l => l.name === 'Red')`), 'the project’s status and label are among the vault’s');
	t.ok(await p.ev(`(() => { const b=[...document.querySelectorAll('.notice button')].find(x=>x.textContent==='Open import notes'); if(!b) return false; b.click(); return true; })()`), 'the notice leads to what import had to say');
	await until(p, `app.workspace.getActiveFile()?.path===${j(`${ROOT}/${ROOT}.md`)}`, 4000);
	t.ok((await read(p, `${ROOT}/${ROOT}.md`)).includes('## Import notes'), 'which is in the binder’s own note');
	for (const mode of ['corkboard', 'outliner', 'manuscript']) {
		await openView(p, `${ROOT}/Chapter`); await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`); await p.sleep(500);
		t.ok((await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view').innerText`)).includes('Arrival'), `the ${mode} shows the imported notes`);
	}
	const snapshots = await p.ev(`app.vault.adapter.list(${j(`${ROOT}/Snapshots/Chapter/Arrival`)}).then(x => x.files)`);
	t.eq(snapshots.length, 1, 'a document’s snapshot is its note’s');
	t.ok((await read(p, snapshots[0])).includes('Earlier arrival'), 'with the text it had');
	t.eq(await p.ev(`${PL}.binders.binderOf(${j(ROOT)})?.problem ?? null`), null, 'the binder is one Binders can write');
	const original = await read(p, SCENE);
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(SCENE)}), {state:{mode:'source'}}).then(()=>1)`);
	await p.sleep(500);
	await p.ev(`(() => { const e = app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===${j(SCENE)}).view.editor; e.focus(); e.setCursor(e.lastLine(), e.getLine(e.lastLine()).length); e.replaceSelection('New words'); return 1; })()`);
	await p.key('s', 'ctrl'); await until(p, `app.vault.adapter.read(${j(SCENE)}).then(s=>s.includes('New words'))`, 6000);
	t.ok((await read(p, SCENE)).includes('New words'), 'typing in an imported note is saved');
	await p.key('z', 'ctrl'); await p.key('s', 'ctrl');
	await until(p, `app.vault.adapter.read(${j(SCENE)}).then(s=>s===${j(original)})`, 6000);
	t.eq(await read(p, SCENE), original, 'and undone, the note is as it was imported');
	same(t, before, await texts(p)); sourceUnchanged(t);
});

test('a document nothing was typed in is an empty note, shown as one', async (p, h, t, before) => {
	await begin(p, { zip: zipOf('empty.zip', { [`Files/Data/${ID(3)}/content.rtf`]: null }) });
	await pick(p, 'Arrival');
	t.ok((await shown(p)).includes('This document has no text.'), 'the dialog says it has no text');
	await imported(p);
	t.ok(!(await read(p, SCENE)).includes('Mara arrived') && (await read(p, SCENE)).includes('synopsis'), 'the note has its properties and no text made up for it');
	same(t, before, await texts(p)); sourceUnchanged(t);
});

test('a folder that arrives under the binder’s name while the dialog is open is never written into', async (p, h, t, before) => {
	await begin(p);
	await p.ev(`(async()=>{ await app.vault.createFolder(${j(ROOT)}); await app.vault.create(${j(`${ROOT}/Keep.md`)}, 'Outside writing'); })().then(()=>1)`);
	await press(p, 'Import');
	t.ok((await why(p)).includes(`“${ROOT}” is already there`), 'import says the name is taken, and stays');
	t.ok(await p.ev(`[...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Import').disabled`), 'and Import waits for another name');
	t.eq(await read(p, `${ROOT}/Keep.md`), 'Outside writing', 'what is there is untouched');
	t.ok(!(await exists(p, SCENE)), 'and nothing was put beside it'); same(t, before, await texts(p));
});

test('the name: one that is free is offered, one that is taken or empty is refused as it is typed, and a name’s odd characters never leave the folder', async (p, h, t, before) => {
	await p.ev(`(async()=>{ await app.vault.createFolder(${j(ROOT)}); })().then(()=>1)`);
	await begin(p);
	const name = (v) => p.ev(`(() => { const i = document.querySelector('${WIN} [data-binders-key="name"]'); i.value = ${j(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`).then(() => p.sleep(150));
	const off = () => p.ev(`[...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Import').disabled`);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').value`), `${ROOT} 2`, 'a name that is free is offered');
	await name(ROOT);
	t.ok((await why(p)).includes('already there') && await off(), 'a name that is taken is refused as it is typed');
	await name('  ');
	t.ok((await why(p)).includes('needs a name') && await off(), 'and so is none');
	await name('../../Outside: the “vault”?');
	t.eq(await text(p, '.binders-export-place'), 'Goes to Outside the “vault”, in this vault', 'a name with a path in it is a name, and the dialog says which');
	t.eq(await why(p), '', 'which is free');
	await imported(p, 'Outside the “vault”');
	t.ok(await exists(p, 'Outside the “vault”/Chapter/Arrival.md'), 'the binder is made under that name, in the vault');
	t.eq(await p.ev(`app.vault.getRoot().children.map(c => c.name).sort().join('|')`), [ROOT, 'Longform demo', 'Outside the “vault”', 'The Lighthouse'].sort().join('|'), 'and nothing else is at the top of the vault');
	same(t, before, await texts(p));
});

test('titles from the project are never paths: a hostile project is a binder with every file inside it', async (p, h, t, before) => {
	const titles = ['../../../escape', '..\\\\..\\\\up', '/abs', '.obsidian', 'con', 'trail. ', 'a/b', 'same', 'same', 'x:y*z?'];
	const kids = titles.map((title, i) => item(20 + i, 'Text', title.replace(/&/g, '&amp;').replace(/</g, '&lt;'), included)).join('');
	const scrivx = `<ScrivenerProject Version="2.0"><Binder>${item(1, 'DraftFolder', 'Draft', included, item(2, 'Folder', '../Folder', included, kids))}</Binder></ScrivenerProject>`;
	const changes = { [`${ROOT}.scrivx`]: scrivx };
	titles.forEach((title, i) => { changes[`Files/Data/${ID(20 + i)}/content.rtf`] = `{\\rtf1 Words of ${i}.}`; });
	const outside = await p.ev(`app.vault.adapter.list('/').then(l => [...l.files, ...l.folders].sort().join('|'))`);
	await begin(p, { zip: zipOf('hostile.zip', changes) }); await imported(p);
	t.eq(await p.ev(`app.vault.adapter.list('/').then(l => [...l.files, ...l.folders].filter(x => x !== ${j(ROOT)}).sort().join('|'))`), outside, 'nothing is made outside the binder’s folder');
	const made = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith(${j(ROOT + '/')}) && f.extension === 'md' && !f.path.includes('/Research/')).map(f => f.path.slice(${ROOT.length + 1})).sort()`);
	t.eq(made.length, titles.length + 3, 'every document is a note in it (with the binder’s note, the folder’s, and the folder’s own text)');
	t.ok(made.every((path) => path.split('/').every((step) => step && !step.startsWith('.') && !/[. ]$/.test(step.replace(/\.md$/, '')) && !/[\\:*?"<>|]/.test(step))), `under names a vault on any system holds: ${made.join(', ')}`);
	const words = await p.ev(`Promise.all(app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(ROOT + '/Folder/')})).map(f => app.vault.read(f))).then(a => a.join(' '))`);
	t.ok(titles.every((_, i) => words.includes(`Words of ${i}.`)), 'and no document’s words are lost to another of its name');
	same(t, before, await texts(p));
});

test('a project that changed on the disk since it was read is refused, with nothing made', async (p, h, t, before) => {
	await begin(p, { desktop: true });
	const at = join(sourceDir, `Files/Data/${ID(3)}/content.rtf`); writeFileSync(at, '{\\rtf1 Changed externally.}');
	await press(p, 'Import');
	await until(p, `document.querySelector('${WIN} .binders-import-why').textContent.includes('has changed')`, 6000);
	t.ok((await why(p)).includes('The project has changed since it was read'), 'import says so, and stays');
	t.ok(!(await exists(p, ROOT)), 'nothing was made'); same(t, before, await texts(p));
});

test('what can’t be read is said in the first dialog, which stays: an older Scrivener’s project, a file that isn’t a zip, a zip with no project', async (p, h, t, before) => {
	await begin(p, { zip: zipOf('old.zip', { [`${ROOT}.scrivx`]: '<ScrivenerProject Version="1.0"><Binder></Binder></ScrivenerProject>' }), fails: true });
	t.ok((await said(p)).includes('older Scrivener') && (await said(p)).includes('Open it in Scrivener 3'), `an older project says what to do: ${await said(p)}`);
	t.ok(!(await p.ev(`[...document.querySelectorAll('${WIN} button')].some(b => b.disabled)`)), 'and another can be chosen');
	await closeAll(p);
	writeFileSync(resolve('test-dist/import-source/not.zip'), 'This is a text file with the wrong name, long enough to be looked at.');
	await begin(p, { zip: resolve('test-dist/import-source/not.zip'), fails: true });
	t.ok((await said(p)).includes('isn’t a zip file'), `a file that isn’t a zip: ${await said(p)}`);
	await closeAll(p);
	writeFileSync(resolve('test-dist/import-source/none.zip'), zipSync({ 'notes.txt': enc.encode('no project here') }));
	await begin(p, { zip: resolve('test-dist/import-source/none.zip'), fails: true });
	t.ok((await said(p)).includes('no Scrivener project'), `a zip with no project in it: ${await said(p)}`);
	await closeAll(p);
	await begin(p, { zip: zipOf('newer.zip', { 'Files/version.txt': '24' }), fails: true });
	t.ok((await said(p)).includes('newer Scrivener'), `a newer format is refused, not guessed at: ${await said(p)}`);
	same(t, before, await texts(p));
});

test('one damaged document costs that document: the rest is imported, and it is said by name with its original kept', async (p, h, t, before) => {
	await begin(p, { zip: zipOf('hurt.zip', { [`Files/Data/${ID(4)}/content.rtf`]: 'Not rich text at all.', [`Snapshots/${ID(3)}.snapshots/2026-09-01-10-00-00-0400.rtf`]: null }) });
	const told = await things(p);
	t.ok(told.some((s) => s.startsWith('Cut scene: Its text could not be read')), `the dialog names the document: ${told.join(' / ')}`);
	t.ok(told.some((s) => s.startsWith('Arrival: The snapshot “Before rewrite” is missing its text')), 'and the snapshot that has no text');
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} .binders-export-warn-open')].find(b => b.textContent.startsWith('Cut scene')).click(); return 1; })()`); await p.sleep(200);
	t.eq(await p.ev(`document.querySelector('${NOTES}.is-active .tree-item-inner').textContent`), 'Cut scene', 'what is said leads to its note in the list');
	await imported(p);
	t.ok((await read(p, SCENE)).includes('Mara arrived'), 'the documents beside it are imported');
	t.eq(await read(p, `${ROOT}/Research/Originals/Chapter/Cut scene/content.rtf`), 'Not rich text at all.', 'its bytes are kept as they are');
	t.ok((await read(p, `${ROOT}/Chapter/Cut scene.md`)).includes(`[[${ROOT}/Research/Originals/Chapter/Cut scene/content.rtf|content.rtf]]`), 'and its note links to them');
	same(t, before, await texts(p)); sourceUnchanged(t);
});

test('where a binder can’t be made isn’t offered: in a binder, among its snapshots, or where exports are kept', async (p, h, t, before) => {
	await p.ev(`(async () => { for (const f of ['Plain', 'Plain/Inner', 'Exports', 'Exports/Old', 'The Lighthouse/Snapshots']) if (!app.vault.getAbstractFileByPath(f)) await app.vault.createFolder(f); })().then(() => 1)`);
	await p.sleep(300);
	await begin(p);
	const offered = await p.ev(`[...document.querySelector('${WIN} [data-binders-key="parent"]').options].map(o => o.textContent)`);
	t.eq(offered.join('|'), 'Vault folder|Plain|Plain/Inner', `only folders outside every binder are offered: ${offered.join(', ')}`);
	await p.ev(`(() => { const s = document.querySelector('${WIN} [data-binders-key="parent"]'); s.value = 'Plain/Inner'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`); await p.sleep(300);
	t.eq(await text(p, '.binders-export-place'), `Goes to Plain/Inner/${ROOT}, in this vault`, 'the dialog says where it goes');
	// the folder becomes a binder while the dialog is open: asked again at Import
	await p.ev(`app.vault.create('Plain/Inner/Inner.md', '---\\nbinder: 1\\n---\\n').then(() => 1)`);
	await until(p, `!!${B}.binderOf('Plain/Inner')`, 5000);
	await press(p, 'Import');
	t.ok((await why(p)).includes('inside another binder'), `a folder that has become a binder is refused: ${await why(p)}`);
	t.ok(!(await exists(p, `Plain/Inner/${ROOT}`)), 'and nothing is made in it');
	same(t, before, await texts(p), { skip: ['Plain/Inner/Inner.md'] });
});

test('a write that fails stops the import: what was made stays as plain notes, an edit made meanwhile is kept, and there is no binder', async (p, h, t, before) => {
	await begin(p);
	await p.ev(`(() => { window.__importCreate = app.vault.createBinary; let failed=false; app.vault.createBinary = async function(path,data,...rest) { const first=app.vault.getAbstractFileByPath(${j(`${ROOT}/Chapter/Chapter text.md`)}); if(first && !failed) { failed=true; await app.vault.modify(first, 'Outside edit made during import'); throw new Error('Injected write failure.'); } return window.__importCreate.call(this,path,data,...rest); }; return 1; })()`);
	await press(p, 'Import');
	await until(p, `document.querySelector('${WIN} .binders-import-why').textContent.includes('Injected write failure')`, 6000);
	t.ok((await why(p)).includes(`What was made so far is in “${ROOT}”, as plain notes`), `the dialog says what stopped it and where the notes are: ${await why(p)}`);
	t.eq(await read(p, `${ROOT}/Chapter/Chapter text.md`), 'Outside edit made during import', 'an edit made meanwhile is never deleted');
	t.ok(!(await exists(p, `${ROOT}/${ROOT}.md`)), 'there is no binder note, so no half a binder');
	t.ok(await p.ev(`!${B}.binderOf(${j(ROOT)})`), 'and Binders takes the folder for no binder');
	same(t, before, await texts(p)); sourceUnchanged(t);
});

test('Cancel while it is importing: the bar says how far it is, the notes made stay, and there is no binder', async (p, h, t, before) => {
	await begin(p);
	await p.ev(`(() => { window.__importCreate = app.vault.createBinary; window.__importPaused=false; app.vault.createBinary = async function(...args) { const f=await window.__importCreate.apply(this,args); if(args[0]===${j(`${ROOT}/Chapter/Chapter text.md`)}) { window.__importPaused=true; await new Promise(r=>window.__importRelease=r); } return f; }; return 1; })()`);
	await press(p, 'Import'); await until(p, 'window.__importPaused', 6000);
	t.ok(/^Importing… \d+ of \d+ files$/.test(await text(p, '.binders-export-status')), `the bar says how far it is: ${await text(p, '.binders-export-status')}`);
	t.ok(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').disabled && document.querySelector('${WIN} [data-binders-key="parent"]').disabled`), 'and the choices are held while it runs');
	await press(p, 'Cancel');
	await p.ev(`(() => { window.__importRelease(); return 1; })()`); await until(p, `!document.querySelector('${WIN}')`, 6000);
	t.ok((await p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent).join('|')`)).includes('The import was cancelled. What was made so far is in'), 'a notice says it was cancelled, and where the notes are');
	t.ok(!(await exists(p, `${ROOT}/${ROOT}.md`)), 'there is no binder note');
	t.ok((await read(p, `${ROOT}/Chapter/Chapter text.md`)).includes('Chapter opening'), 'the notes made are kept');
	same(t, before, await texts(p)); sourceUnchanged(t);
});

test('the dialog is one of the family: Export’s bones, one filled button on the bar’s line, a tree walked with the keys, and names for a screen reader', async (p, h, t) => {
	await begin(p, { desktop: true });
	const cls = await p.ev(`document.querySelector('${WIN}').className`);
	t.ok(['mod-sidebar-layout', 'binders-export', 'binders-snapshots'].every((c) => cls.split(' ').includes(c)), 'it is Obsidian’s two-pane dialog, as Export and Snapshots wear it');
	t.eq(await p.ev(`document.querySelectorAll('${WIN} .mod-cta').length`), 1, 'one filled button: Import');
	const row = await p.ev(`(() => { const m = document.querySelector('${WIN}'), b = m.querySelector('.binders-snapshots-bar button.mod-cta').getBoundingClientRect(), x = m.querySelector(':scope > .modal-close-button, :scope > .modal-header-button').getBoundingClientRect(), i = m.querySelector('.binders-snapshots-head .clickable-icon').getBoundingClientRect(); return { b: [b.top + b.height / 2, b.height], x: [x.top + x.height / 2, x.height], i: [i.top + i.height / 2, i.height], modal: [m.getBoundingClientRect().bottom, m.querySelector('.modal-content').getBoundingClientRect().bottom] }; })()`);
	t.ok(Math.abs(row.b[0] - row.x[0]) <= 1 && Math.abs(row.b[0] - row.i[0]) <= 1, `Import, the closing button and “Choose another project” are on one line: ${JSON.stringify(row)}`);
	t.ok(row.b[1] === row.x[1] && row.b[1] === row.i[1], 'and one height');
	t.ok(row.modal[1] <= row.modal[0] + 1, 'the dialog holds its content: nothing runs under its foot');
	t.eq(await p.ev(`document.querySelector('${WIN} [role="tree"]').getAttribute('aria-label')`), 'The binder as it will be', 'the list is a tree with a name');
	t.eq(await p.ev(`document.querySelector('${WIN} [role="treeitem"][aria-expanded]').getAttribute('aria-label')`), 'Chapter, a folder', 'a folder is said to be one');
	t.eq(await p.ev(`[...document.querySelectorAll('${NOTES}')].find(r => r.textContent.startsWith('Arrival')).getAttribute('aria-label')`), 'Arrival, Needs polish', 'a note is named with its status');
	t.eq(await p.ev(`[...document.querySelectorAll('${NOTES}')].find(r => r.textContent.startsWith('Research note')).getAttribute('aria-label')`), 'Research note, left out of exports', 'and one that no export takes says so');
	t.eq(await p.ev(`document.querySelectorAll('${WIN} [role="treeitem"][tabindex="0"]').length`), 1, 'one row is the list’s stop for Tab');
	t.eq(await p.ev(`document.activeElement?.querySelector?.('.tree-item-inner')?.textContent ?? ''`), 'Chapter text', 'the keyboard starts on the note shown');
	await p.key('ArrowDown'); await p.sleep(150);
	t.eq(await p.ev(`document.querySelector('${NOTES}.is-active .tree-item-inner').textContent`), 'Arrival', 'Down goes to the next row and shows it');
	t.ok((await shown(p)).includes('Mara arrived'), 'its text is the one shown');
	t.eq(await p.ev(`document.querySelector('${NOTES}.is-active').getAttribute('aria-selected')`), 'true', 'and it is the selected one');
	t.ok(await p.ev(`(() => { const s = getComputedStyle(document.activeElement); return s.boxShadow !== 'none' || s.outlineStyle !== 'none'; })()`), 'the row the keyboard is on is ringed');
	await p.key('ArrowLeft'); await p.sleep(100);
	t.eq(await p.ev(`document.activeElement.getAttribute('aria-label')`), 'Chapter, a folder', 'Left goes out to the folder');
	await p.key('ArrowLeft'); await p.sleep(100);
	t.eq(await p.ev(`document.activeElement.getAttribute('aria-expanded')`), 'false', 'and Left again shuts it');
	t.eq(await p.ev(`[...document.querySelectorAll('${NOTES}')].filter(r => r.getBoundingClientRect().height > 0).map(r => r.querySelector('.tree-item-inner').textContent).join('|')`), 'Research note', 'its notes are out of sight');
	await p.key('ArrowRight'); await p.sleep(100);
	t.eq(await p.ev(`document.activeElement.getAttribute('aria-expanded')`), 'true', 'Right opens it');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').getAttribute('aria-label')`), 'The new binder’s name', 'the name field has a name');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-import-why').getAttribute('aria-live')`), 'polite', 'why a name is refused is read out');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-snapshots-head .clickable-icon').getAttribute('aria-label')`), 'Choose another project', 'the head’s button says what it does');
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-head .clickable-icon').click(); return 1; })()`); await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-import-said') && !document.querySelector('${WIN} [role="tree"]')`), 'which goes back to the first dialog');
	t.eq(await p.ev(`[...document.querySelectorAll('${WIN} button')].map(b => b.textContent + (b.classList.contains('mod-cta') ? '*' : '')).join('|')`), 'Choose a project...*|Choose a zipped backup...|Cancel', 'its buttons: the one it is for filled, Cancel last');
});

test('a phone: the choices first with Import in reach, then the binder’s list, then a note, and back', async (p, h, t) => {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }); await reload(p, true);
	await p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	try {
		await p.ev(`(() => { app.commands.executeCommandById('binders:import-scrivener'); return 1; })()`);
		await until(p, `!!document.querySelector('${WIN}')`);
		t.eq(await p.ev(`[...document.querySelectorAll('${WIN} button')].map(b => b.textContent).join('|')`), 'Choose a zipped backup...|Cancel', 'a phone is offered a zipped backup, and no folder');
		t.ok((await text(p, '.binders-import-how')).includes('zipped backup'), 'and is told what that is');
		await p.key('Escape'); await p.sleep(200);
		await begin(p);
		t.ok(!(await p.ev(`!!document.querySelector('${WIN} .binders-export-preview')?.getBoundingClientRect().width`)), 'the choices come first');
		const fits = async (what) => { const b = await p.ev(`(() => { const m=document.querySelector('${WIN}'), b=[...m.querySelectorAll('button')].filter(b=>b.textContent==='Import' && b.getBoundingClientRect().width).pop(), r=b.getBoundingClientRect(); return {width:m.scrollWidth,client:m.clientWidth,bottom:r.bottom,top:r.top,height:r.height,view:innerHeight}; })()`); t.ok(b.width <= b.client + 1, `${what}: nothing runs off the side`); t.ok(b.bottom <= b.view && b.top >= 0 && b.height >= 40, `${what}: Import is in reach, and big enough for a thumb (${JSON.stringify(b)})`); };
		await fits('the choices');
		await p.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 360, deviceScaleFactor: 1, mobile: true }); await p.sleep(250);
		await p.ev(`(() => { [...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Import').scrollIntoView({ block: 'nearest' }); return 1; })()`); await p.sleep(100);
		await fits('with the keyboard up');
		await p.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }); await p.sleep(250);
		await press(p, 'Preview'); await p.sleep(250);
		t.ok(await p.ev(`document.querySelector('${WIN} [role="tree"]').getBoundingClientRect().width > 250 && !document.querySelector('${WIN} .binders-import-note')?.getBoundingClientRect().width`), 'Preview shows the binder’s list, the width of the screen');
		t.ok(await p.ev(`[...document.querySelectorAll('${NOTES}')].every(r => r.getBoundingClientRect().height >= 44)`), 'its rows are 44px, a thumb’s');
		await pick(p, 'Arrival'); await p.sleep(250);
		t.ok((await shown(p)).includes('Mara arrived'), 'a note tapped is shown');
		t.ok(await p.ev(`(() => { const r=document.querySelector('${WIN} .binders-import-note').getBoundingClientRect(); return r.width>250 && r.height>100; })()`), 'with the screen to itself');
		await fits('the note');
		const back = () => p.ev(`(() => { document.querySelector('${WIN} .modal-setting-back-button').click(); return 1; })()`).then(() => p.sleep(200));
		await back();
		t.ok(await p.ev(`document.querySelector('${WIN} [role="tree"]').getBoundingClientRect().width > 250`), 'Back goes to the list');
		await back();
		t.ok(await p.ev(`!!document.querySelector('${WIN} [data-binders-key="name"]')?.getBoundingClientRect().width`), 'and Back again to the choices');
	} finally { await closeAll(p); await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); await reload(p, false); }
});
