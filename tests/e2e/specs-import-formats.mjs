// Import a manuscript from an OpenDocument (.odt) or rich text (.rtf) file, through the real dialogs: from the device
// (the browser's own file chooser, as a phone has to) and from the vault (the file's menu, "Choose from this vault...").
// The files are LibreOffice's own and the TextEdit-shaped one (tests/fixtures/import/libreoffice); the words a binder
// made of them must hold are pinned to the import's plan by tests/import-libreoffice.test.ts, and the plan to an
// oracle there. The source is held to its bytes afterwards.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { B, j, until, withTidy, texts, same, read, exists, closeMenus, menuItems, clickMenu } from './view-helpers.mjs';

export const specs = [];
const WIN = '.modal.binders-import';
const FIX = 'tests/fixtures/import/libreoffice';
const DIR = resolve('test-dist/import-formats-source');
mkdirSync(DIR, { recursive: true });
const fixture = (name) => readFileSync(`${FIX}/${name}`);
const put = (name, data) => { const at = resolve(DIR, name); writeFileSync(at, data); return at; };
const expected = (name) => JSON.parse(readFileSync(`${FIX}/${name}`, 'utf8'));

const press = async (p, label) => {
	const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b || b.disabled) return false; b.click(); return true; })()`);
	if (!ok) throw new Error(`no enabled import button “${label}”`);
	await p.sleep(100);
};
const said = (p) => p.ev(`document.querySelector('${WIN} .binders-import-said')?.textContent ?? ''`);
const why = (p) => p.ev(`document.querySelector('${WIN} .binders-import-why')?.textContent ?? ''`);
const things = (p) => p.ev(`[...document.querySelectorAll('${WIN} .binders-export-warn .binders-export-warn-text')].map(w => w.textContent)`);
const tree = (p) => p.ev(`[...document.querySelectorAll('${WIN} [role="treeitem"]')].map(r => '  '.repeat(Number(r.getAttribute('aria-level')) - 1) + r.querySelector('.tree-item-inner').textContent + (r.hasAttribute('aria-expanded') ? '/' : ''))`);
const value = (p, key) => p.ev(`document.querySelector('${WIN} [data-binders-key="${key}"]')?.value ?? null`);
const choose = async (p, key, v) => { await p.ev(`(() => { const s = document.querySelector('${WIN} [data-binders-key="${key}"]'); s.value = ${j(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`); await p.sleep(350); };
const closeAll = async (p) => { for (let i = 0; i < 4 && await p.ev(`!!document.querySelector('.modal-container')`); i++) { await p.key('Escape'); await p.sleep(150); } };
const bytesOf = async (p, path) => Buffer.from(await p.ev(`app.vault.adapter.readBinary(${j(path)}).then(b => [...new Uint8Array(b)])`));

/** Opens the first dialog by the command and gives it a file, as the browser's own chooser would. */
async function fromFile(p, path, { fails = false } = {}) {
	await p.ev(`(() => { app.commands.executeCommandById('binders:import-manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN}')`);
	await p.send('Page.setInterceptFileChooserDialog', { enabled: true });
	await press(p, 'Choose a file...');
	const doc = await p.send('DOM.getDocument');
	const found = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: WIN + ' input[type="file"]' });
	await p.send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files: [path] });
	await p.send('Page.setInterceptFileChooserDialog', { enabled: false });
	if (fails) { await until(p, `!!document.querySelector('${WIN} .binders-import-said')?.textContent && !document.querySelector('${WIN} .binders-import-said.is-doing')`, 15000); return; }
	if (!await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000)) throw new Error('import did not load: ' + await said(p));
	await until(p, `document.querySelectorAll('${WIN}').length === 1`, 3000);
	await p.sleep(250);
}
const imported = async (p, root) => {
	await press(p, 'Import');
	if (!await until(p, `!!${B}.binderOf(${j(root)}) && !document.querySelector('${WIN}')`, 20000)) throw new Error('import did not finish: ' + await why(p));
	await p.sleep(300);
};
/** What the notes say, in the binder's order (Research left out), as plain words; a picture's embed isn't words. */
const bodyWords = (p, root) => p.ev(`(async () => { const out = []; for (const f of ${B}.scenes(app.vault.getAbstractFileByPath(${j(root)}))) if (!f.path.slice(${root.length + 1}).startsWith('Research/')) out.push(...((await app.vault.read(f)).replace(/^---\\n[\\s\\S]*?\\n---\\n/, '').replace(/!\\[\\[[^\\]]*\\]\\]/g, '').normalize('NFC').match(/[\\p{L}\\p{N}\\p{M}]+/gu) ?? [])); return out; })()`);
/** The file's menu, as in the file explorer: the row is revealed, then right-clicked. */
async function menuOn(p, path) {
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${j(path)}); const x = app.workspace.getLeavesOfType('file-explorer')[0]; x?.view.revealInFolder(f); return 1; })()`);
	await p.sleep(300);
	await p.ev(`(() => { const e = document.querySelector('.nav-file-title[data-path=${j(path)}]'); if (!e) throw new Error('row missing'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, button: 2 })); return 1; })()`);
	await p.sleep(150);
}
const test = (name, fn, tier) => specs.push({ name: 'Import formats: ' + name, ...(tier ? { tier } : {}), fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	try { await fn(p, h, t, before); } finally {
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		await closeAll(p);
		await closeMenus(p);
	}
}) });

test('LibreOffice’s .odt from the device: the binder shown is the one made, every word in order with the footnote and comment in place, tracked changes accepted, the picture and the file kept byte for byte', async (p, h, t, before) => {
	const bytes = fixture('salt-road.odt'), at = put('salt-road.odt', bytes);
	await fromFile(p, at);
	t.eq((await tree(p)).join('|'), 'Front matter/|  Title page|The jetty/|  Mara came down to the jetty before the|  By noon the wind had come round to the|The tide|The storm/|  It broke a little after midnight. The|  In the morning the jetty was gone. Not|Research/', 'the binder as it will be: chapters by the Heading 1 style, scenes at the scene-break style');
	t.eq(await value(p, 'signal'), 'headings', 'found by its headings');
	t.eq(await value(p, 'name'), 'The Salt Road', 'named for the Title-styled paragraph, not the file');
	t.eq(await value(p, 'revisions'), 'final', 'tracked changes are offered, accepted to start with');
	t.ok(await p.ev(`!!document.querySelector('${WIN} [data-binders-key="comments"]')`), 'comments are offered');
	const said_ = (await things(p)).join(' | ');
	t.ok(/2 tracked changes\. They are brought in as accepted/.test(said_) && /1 comment/.test(said_) && /1 picture is kept/.test(said_), 'what it holds is said: ' + said_);
	await imported(p, 'The Salt Road');
	t.eq((await bodyWords(p, 'The Salt Road')).join(' '), expected('salt-road.odt.words.json').join(' '), 'every word is in the notes, in order');
	const jetty = await read(p, 'The Salt Road/The jetty/By noon the wind had come round to the.md');
	t.ok(jetty.includes('mending nets%%Ann: Is she alone here? Check against chapter 3.%% in the lee'), 'the comment is an Obsidian comment, at the end of the words it is on');
	t.ok((await read(p, 'The Salt Road/The jetty/Mara came down to the jetty before the.md')).includes('every morning^[Corran had had no ferry since 1931.] since'), 'the footnote is in place');
	t.ok((await read(p, 'The Salt Road/The tide.md')).includes('spring tides many times before') && !(await read(p, 'The Salt Road/The tide.md')).includes('and so fast'), 'tracked changes are accepted: inserted words in, deleted words out');
	t.eq((await bytesOf(p, 'The Salt Road/Research/Originals/salt-road.odt')).compare(bytes), 0, 'the .odt is kept, byte for byte, in Research/Originals');
	t.ok(await p.ev(`app.vault.getFiles().some(f => f.path.startsWith('The Salt Road/Research/Attachments/') && f.extension === 'png')`), 'the picture is kept in Research/Attachments');
	t.eq(readFileSync(at).compare(bytes), 0, 'the file on the disk is as it was');
	same(t, before, await texts(p), { skip: [] });
}, 'guard');

test('an .odt with Reject all: the notes made hold the words as they were before the tracked changes', async (p, h, t) => {
	await fromFile(p, put('salt-road.odt', fixture('salt-road.odt')));
	await choose(p, 'revisions', 'original');
	t.ok((await things(p)).some((x) => /They are left out, as if rejected/.test(x)), 'and that is said');
	await imported(p, 'The Salt Road');
	const tide = await read(p, 'The Salt Road/The tide.md');
	t.ok(tide.includes('spring tides before, and storm tides') && tide.includes('so *smoothly*, and so fast, as if'), 'the deleted words are back where they were, the inserted ones gone');
}, 'guard');

test('a rich text file shaped as TextEdit writes it: chapters by their “Chapter One” lines, scenes at its marks, every word in order, the file kept byte for byte', async (p, h, t) => {
	const bytes = fixture('source/salt-road-textedit.rtf'), at = put('salt-road-textedit.rtf', bytes);
	await fromFile(p, at);
	t.eq(await value(p, 'signal'), 'titles', 'found by its lines like “Chapter 12”');
	t.eq((await tree(p)).join('|'), 'Front matter/|  Title page|Chapter One/|  Mara came down to the jetty before the|  By noon the wind had come round to the|Chapter Two|Chapter Three/|  It broke a little after midnight. The|  In the morning the jetty was gone. Not|Research/', 'the binder as it will be');
	t.ok(!(await p.ev(`!!document.querySelector('${WIN} [data-binders-key="revisions"], ${WIN} [data-binders-key="comments"]')`)), 'no rows for what the file doesn’t have');
	t.eq(await value(p, 'name'), 'salt-road-textedit', 'named for the file: TextEdit’s has no Title-styled paragraph');
	await imported(p, 'salt-road-textedit');
	t.eq((await bodyWords(p, 'salt-road-textedit')).join(' '), expected('salt-road-textedit.rtf.words.json').join(' '), 'every word is in the notes, in order');
	t.ok((await read(p, 'salt-road-textedit/Chapter Two.md')).startsWith('\tThe water rose all afternoon.'), 'a paragraph begun with a tab keeps it');
	t.eq((await bytesOf(p, 'salt-road-textedit/Research/Originals/salt-road-textedit.rtf')).compare(bytes), 0, 'the .rtf is kept, byte for byte, in Research/Originals');
	t.eq(readFileSync(at).compare(bytes), 0, 'the file on the disk is as it was');
}, 'guard');

test('an .odt and an .rtf already in the vault: "Import as a binder..." in their menus and both in "Choose from this vault...", the file left as it is and linked', async (p, h, t) => {
	const odt = fixture('salt-road.odt'), rtf = fixture('salt-road.rtf');
	await p.ev(`(async () => { app.vault.setConfig('showUnsupportedFiles', true); await app.vault.createFolder('Sources'); await app.vault.createBinary('Sources/Draft.odt', new Uint8Array(${j([...odt])}).buffer); await app.vault.createBinary('Sources/Other.rtf', new Uint8Array(${j([...rtf])}).buffer); })().then(() => 1)`);
	await p.sleep(400);
	for (const f of ['Sources/Draft.odt', 'Sources/Other.rtf']) {
		await menuOn(p, f);
		t.ok((await menuItems(p)).includes('Import as a binder...'), `${f} has the item in its menu`);
		await closeMenus(p);
	}
	await menuOn(p, 'Sources/Draft.odt');
	await clickMenu(p, 'Import as a binder...');
	await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000);
	t.eq(await value(p, 'name'), 'The Salt Road', 'named for the Title, not the file name');
	await imported(p, 'The Salt Road');
	t.ok((await read(p, 'The Salt Road/The Salt Road.md')).includes('Made from [[Sources/Draft.odt|Draft]].'), 'the binder note links the file by its name');
	t.ok(!(await exists(p, 'Draft/Research/Originals')), 'the file in the vault is not copied');
	t.eq((await bytesOf(p, 'Sources/Draft.odt')).compare(odt), 0, 'and the file is byte for byte as it was');
	await p.ev(`(() => { app.commands.executeCommandById('binders:import-manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN}')`);
	await press(p, 'Choose from this vault...');
	await until(p, `!!document.querySelector('.prompt .suggestion-item')`, 5000);
	t.eq(await p.ev(`[...document.querySelectorAll('.prompt .suggestion-item')].map(e => e.textContent).filter(x => x.startsWith('Sources/')).sort().join('|')`), 'Sources/Draft.odt|Sources/Other.rtf', 'the vault’s OpenDocument and rich text files are listed');
	await p.ev(`(() => { [...document.querySelectorAll('.prompt .suggestion-item')].find(e => e.textContent === 'Sources/Other.rtf').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000);
	t.eq(await value(p, 'name'), 'The Salt Road 2', 'the file picked is the one read: its Title, and the next free name since Draft’s binder took the first');
	t.eq(await value(p, 'signal'), 'headings', 'LibreOffice’s rich text: chapters by the style sheet’s headings');
	await closeAll(p);
	t.eq((await bytesOf(p, 'Sources/Other.rtf')).compare(rtf), 0, 'the .rtf is as it was');
	await p.ev(`(() => { app.vault.setConfig('showUnsupportedFiles', false); return 1; })()`);
});

test('what can’t be read is said in the first dialog, with what to do: a master document, a TextEdit document with pictures, a locked .odt, a damaged .rtf', async (p, h, t) => {
	const cases = [
		['Book.odm', 'PK', 'master document (.odm)'],
		['Notes.rtfd', 'x', 'TextEdit document with pictures in it (.rtfd)'],
		['Locked.odt', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), 'locked with a password'],
		['Broken.rtf', '{\\rtf1 cut short', 'This rich text file can’t be read: the file is cut short.'],
	];
	for (const [name, data, words] of cases) {
		await fromFile(p, put(name, data), { fails: true });
		t.ok((await said(p)).includes(words), `${name}: ${await said(p)}`);
		t.ok(await p.ev(`!document.querySelector('${WIN} [data-binders-key]')`), `${name}: the first dialog stays`);
		await closeAll(p);
	}
	t.ok(await p.ev(`document.querySelector('${WIN}') === null`), 'and closes');
	t.ok(await p.ev(`(() => { app.commands.executeCommandById('binders:import-manuscript'); return 1; })()`).then(() => until(p, `!!document.querySelector('${WIN} p')`)).then(() => p.ev(`document.querySelector('${WIN} p').textContent.includes('a Word, OpenDocument or rich text file')`)), 'the first dialog names the formats it reads');
});
