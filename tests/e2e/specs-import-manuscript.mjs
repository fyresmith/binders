// Import a manuscript, through the real dialogs: a note of the vault (from its menu) and a file from the device (through
// the browser's own file chooser, as a phone has to). The source is a throwaway note or file; the plan, the preview and every
// write are real. The source is held to its bytes afterwards, and the binder is held to the word-for-word rule.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zipSync } from 'fflate';
import { B, PL, j, until, withTidy, texts, same, read, exists, reload, closeMenus, menuItems, clickMenu } from './view-helpers.mjs';

export const specs = [];
const WIN = '.modal.binders-import', enc = new TextEncoder();
const DIR = resolve('test-dist/import-manuscript-source');
mkdirSync(DIR, { recursive: true });

const words = (n, seed) => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';
const para = (seed) => `${words(60, seed)} It was *not* what **Mara** had hoped.`;
const CLEAN = `# The Salt Road\n\nBy Mara.\n\n## The jetty\n\n${para('a')}\n\nSecond ${words(20, 'a2')}\n\n***\n\n${para('b')}\n\n## The tide\n\n${para('c')}\n\n## The storm\n\n${para('d')}\n`;
const LINES = `Chapter 1\n\n${para('e')}\n\nChapter 2\n\n${para('f')}\n\nChapter 3\n\n${para('g')}\n`;
const FLAT = `${para('h')}\n\n${para('i')}\n\n${para('k')}\n`;

// a Word file written by hand (a zip of XML): three chapters under heading styles, a tracked change, a footnote
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const wr = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`, wp = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${t.startsWith('<') ? t : wr(t)}</w:p>`;
const DOCX_BODY = [wp('The Tide Book', 'Title'), wp('One', 'Heading1'), wp(words(60, 'wa')), wp(`${wr('Kept ')}<w:del w:id="1" w:author="Ann" w:date="2026-10-01T10:00:00Z"><w:r><w:delText>cut </w:delText></w:r></w:del><w:ins w:id="2" w:author="Ann" w:date="2026-10-01T10:00:00Z">${wr('added ')}</w:ins>${wr('end')}<w:r><w:footnoteReference w:id="1"/></w:r>`), wp('Two', 'Heading1'), wp(words(60, 'wb')), wp('Three', 'Heading1'), wp(words(60, 'wc'))].join('');
const DOCX_WORDS = ['The Tide Book', 'One', words(60, 'wa'), 'Kept added end', 'A footnote of words.', 'Two', words(60, 'wb'), 'Three', words(60, 'wc')].join(' ');
const docxBytes = () => zipSync({
	'[Content_Types].xml': enc.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
	'_rels/.rels': enc.encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
	'word/document.xml': enc.encode(`<w:document ${W}><w:body>${DOCX_BODY}</w:body></w:document>`),
	'word/_rels/document.xml.rels': enc.encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="f" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>'),
	'word/styles.xml': enc.encode(`<w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style></w:styles>`),
	'word/footnotes.xml': enc.encode(`<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r>${wr(' A footnote of words.')}</w:p></w:footnote></w:footnotes>`),
});
const press = async (p, label) => {
	const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b || b.disabled) return false; b.click(); return true; })()`);
	if (!ok) throw new Error(`no enabled import button “${label}”`);
	await p.sleep(100);
};
const text = (p, sel) => p.ev(`document.querySelector('${WIN} ${sel}')?.textContent ?? ''`);
const said = (p) => text(p, '.binders-import-said'), why = (p) => text(p, '.binders-import-why');
const things = (p) => p.ev(`[...document.querySelectorAll('${WIN} .binders-export-warn')].map(w => w.querySelector('.binders-export-warn-note').textContent + ': ' + w.querySelector('.binders-export-warn-text').textContent)`);
const tree = (p) => p.ev(`[...document.querySelectorAll('${WIN} [role="treeitem"]')].map(r => '  '.repeat(Number(r.getAttribute('aria-level')) - 1) + r.querySelector('.tree-item-inner').textContent + (r.hasAttribute('aria-expanded') ? '/' : ''))`);
const shown = (p) => p.ev(`document.querySelector('${WIN} .binders-import-note')?.innerText ?? ''`);
const choose = async (p, key, value) => { await p.ev(`(() => { const s = document.querySelector('${WIN} [data-binders-key="${key}"]'); s.value = ${j(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`); await p.sleep(350); };
const options = (p, key) => p.ev(`[...document.querySelector('${WIN} [data-binders-key="${key}"]').options].map(o => o.textContent + (o.disabled ? ' (off)' : ''))`);
const closeAll = async (p) => { for (let i = 0; i < 4 && await p.ev(`!!document.querySelector('.modal-container')`); i++) { await p.key('Escape'); await p.sleep(150); } };
const put = (name, data) => { const at = resolve(DIR, name); writeFileSync(at, data); return at; };
const make = (p, path, body) => p.ev(`(async () => { const dir = ${j(path.slice(0, path.lastIndexOf('/')))}; if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir); await app.vault.create(${j(path)}, ${j(body)}); })().then(() => 1)`);

/** The note's file menu, as in the file explorer: the row is revealed, then right-clicked. */
async function menuOn(p, path) {
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${j(path)}); const x = app.workspace.getLeavesOfType('file-explorer')[0]; x?.view.revealInFolder(f); return 1; })()`);
	await p.sleep(300);
	await p.ev(`(() => { const e = document.querySelector('.nav-file-title[data-path=${j(path)}]'); if (!e) throw new Error('row missing'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, button: 2 })); return 1; })()`);
	await p.sleep(150);
}
/** Opens the second dialog on a note of the vault, from its menu. */
async function fromNote(p, path) {
	await menuOn(p, path);
	await clickMenu(p, 'Make a binder from this note...');
	await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000);
	await p.sleep(250);
}
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
/** The words of a text: runs of letters and digits. */
const tokens = (s) => s.normalize('NFC').match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
/** The binder's writing in its order (a chapter's or folder's name, then the text of its notes), as plain words. */
const binderWords = (p, root) => p.ev(`(async () => {
	const folder = app.vault.getAbstractFileByPath(${j(root)}), out = [], seen = new Set();
	const t = (s) => (s.normalize('NFC').match(/[\\p{L}\\p{N}\\p{M}]+/gu) ?? []);
	for (const f of ${B}.scenes(folder)) {
		const rel = f.path.slice(${root.length + 1}).split('/');
		if (rel[0] === 'Research') continue;
		for (let i = 0; i < rel.length - 1; i++) { const dir = rel.slice(0, i + 1).join('/'); if (!seen.has(dir)) { seen.add(dir); if (rel[0] !== 'Front matter') out.push(...t(rel[i])); } }
		if (rel.length === 1 && rel[0] !== 'Front matter') out.push(...t(f.basename));
		out.push(...t((await app.vault.read(f)).replace(/^---\\n[\\s\\S]*?\\n---\\n/, '')));
	}
	return out;
})()`);
/** Only what the notes say, in the binder's order: for a binder whose names were put right by hand, and no longer the headings. */
const bodyWords = (p, root) => p.ev(`(async () => { const out = []; for (const f of ${B}.scenes(app.vault.getAbstractFileByPath(${j(root)}))) if (!f.path.slice(${root.length + 1}).startsWith('Research/')) out.push(...((await app.vault.read(f)).replace(/^---\\n[\\s\\S]*?\\n---\\n/, '').normalize('NFC').match(/[\\p{L}\\p{N}\\p{M}]+/gu) ?? [])); return out; })()`);
const test = (name, fn) => specs.push({ name: 'Manuscript import: ' + name, fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	try { await fn(p, h, t, before); } finally {
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		await closeAll(p);
		await closeMenus(p);
	}
}) });

test('a note with clean headings: from its menu, the binder is shown before anything is made, and made as shown; the note is as it was; every word is there in order', async (p, h, t, before) => {
	await make(p, 'Sources/Clean.md', CLEAN);
	await menuOn(p, 'Sources/Clean.md');
	t.ok((await menuItems(p)).includes('Make a binder from this note...'), 'a note outside a binder has the item in its menu');
	await closeMenus(p);
	await fromNote(p, 'Sources/Clean.md');
	t.eq((await tree(p)).join('|'), ['Front matter/', '  Title page', 'The jetty/', '  a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11', '  b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11', 'The tide', 'The storm'].join('|'), 'the binder as it will be: front matter, a chapter of two scenes as a folder, the rest single notes');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').value`), 'The Salt Road', 'named for the book’s title');
	t.eq(await text(p, '.binders-snapshots-detail'), '5 notes · 2 folders', 'the bar counts what will be made');
	t.eq((await options(p, 'signal')).join('|'), 'Headings (3)|Lines like “Chapter 12” (0) (off)|Page breaks (0) (off)|Nowhere', 'where chapters start: each way with its count, those that find nothing off');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="signal"]').value`), 'headings', 'headings chosen');
	t.eq((await options(p, 'level-2')).join('|'), 'Part|Chapter|Scene|Keep in the text', 'each level of heading has its role');
	t.eq(await text(p, '.setting-item:has([data-binders-key="level-2"]) .setting-item-name'), 'Heading 2 (3)', 'with its count');
	t.ok((await options(p, 'breaks')).length === 2, 'scene breaks have their choice');
	t.ok(!(await exists(p, 'The Salt Road')), 'nothing has been made yet');
	await choose(p, 'signal', 'none');
	t.eq((await tree(p)).join('|').replace(/b11.*$/, 'b11'), 'Chapter 1/|  The Salt Road|  b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11', 'with nowhere chosen, only the scene break is a cut');
	await choose(p, 'signal', 'headings');
	await choose(p, 'scenes', 'numbers');
	t.ok((await tree(p)).includes('  Scene 2'), 'scenes can be numbered instead');
	await choose(p, 'scenes', 'words');
	await imported(p, 'The Salt Road');
	t.eq(await read(p, 'Sources/Clean.md'), CLEAN, 'the source note is exactly as it was');
	t.eq(await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('The Salt Road')).map(f => f.path.slice('The Salt Road/'.length, -3)).join('|')`), ['Front matter/Title page', 'The jetty/a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11', 'The jetty/b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11', 'The tide', 'The storm'].join('|'), 'the binder has the text’s order');
	const note = await read(p, 'The Salt Road/The Salt Road.md');
	t.ok(note.includes('binder: 1') && /structure: "chapters and scenes"/.test(note), 'the binder note says which rule its folders follow');
	t.ok(note.includes('Made from [[Sources/Clean|Clean]]. That note is unchanged.'), 'and links the note it was made from');
	t.eq(await p.ev(`${PL}.binders.binderOf('The Salt Road')?.problem ?? null`), null, 'a binder Binders can write');
	t.ok(!(await exists(p, 'The Salt Road/Research')), 'a note of the vault is not copied');
	t.eq((await read(p, 'The Salt Road/The tide.md')), `${para('c')}\n`, 'a chapter’s note is its text, byte for byte');
	const want = tokens(CLEAN), got = await binderWords(p, 'The Salt Road');
	t.eq(got.join(' '), want.join(' '), 'every word is there, in order');
	same(t, { ...before, 'Sources/Clean.md': CLEAN }, await texts(p), { skip: [] });
});

test('"Chapter 12" lines with no headings are chapters, as a note each', async (p, h, t, before) => {
	await make(p, 'Sources/Lines.md', LINES);
	await fromNote(p, 'Sources/Lines.md');
	t.eq((await tree(p)).join('|'), 'Chapter 1|Chapter 2|Chapter 3', 'a note each, and no folders');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="signal"]').value`), 'titles', 'found by what the lines read as');
	t.eq((await options(p, 'signal'))[0], 'Headings (0) (off)', 'headings found none');
	t.eq(await p.ev(`!!document.querySelector('${WIN} [data-binders-key^="level-"]')`), false, 'and so there is no row for heading levels');
	await imported(p, 'Lines');
	t.ok(/structure: "every note a chapter"/.test(await read(p, 'Lines/Lines.md')), 'every note a chapter');
	t.eq(await read(p, 'Lines/Chapter 2.md'), `${para('f')}\n`, 'the line is the name and not the text');
	t.eq((await binderWords(p, 'Lines')).join(' '), tokens(LINES).join(' '), 'every word is there, in order');
	t.eq(await read(p, 'Sources/Lines.md'), LINES, 'the source note is as it was');
});

test('a note with nothing to split at comes in as one note, and says so', async (p, h, t, before) => {
	await make(p, 'Sources/Flat.md', FLAT);
	await fromNote(p, 'Sources/Flat.md');
	t.eq((await tree(p)).join('|'), 'Manuscript', 'one note');
	t.ok((await things(p)).some((x) => /No chapters were found\. Everything comes in as one note\. Split it where you like with Split scene at cursor\./.test(x)), 'and what to do next is said');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="signal"]').value`), 'none', 'Nowhere is chosen');
	await imported(p, 'Flat');
	t.eq(await read(p, 'Flat/Manuscript.md'), FLAT, 'the one note is the text, exactly');
	t.eq(await read(p, 'Sources/Flat.md'), FLAT, 'and the source is as it was');
});

test('a name already taken is refused as it is typed, and nothing is written into the folder that is there', async (p, h, t, before) => {
	await make(p, 'Sources/Clean.md', CLEAN);
	await p.ev(`(async () => { await app.vault.createFolder('The Salt Road'); await app.vault.create('The Salt Road/Keep.md', 'Outside writing'); })().then(() => 1)`);
	await fromNote(p, 'Sources/Clean.md');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').value`), 'The Salt Road 2', 'a free name is offered');
	await p.ev(`(() => { const i = document.querySelector('${WIN} [data-binders-key="name"]'); i.value = 'The Salt Road'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await p.sleep(200);
	t.ok((await why(p)).includes('already there') && await p.ev(`[...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Import').disabled`), 'the name that is taken is refused, and Import waits');
	t.eq(await read(p, 'The Salt Road/Keep.md'), 'Outside writing', 'what is there is untouched');
	t.ok(!(await exists(p, 'The Salt Road/The jetty')), 'and nothing was put beside it');
});

test('a file from the device: CRLF line endings and a byte-order mark are no part of the writing, and the file is kept as it was', async (p, h, t, before) => {
	const crlf = CLEAN.replace(/\n/g, '\r\n'), bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CLEAN.replace('The Salt Road', 'The Salt Road Two'))]);
	const a = put('crlf.md', crlf);
	await fromFile(p, a);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').value`), 'The Salt Road', 'read');
	t.eq((await tree(p)).join('|').replace(/\|The jetty.*The tide/, '|…|The tide'), 'Front matter/|  Title page|…|The tide|The storm|Research/', 'the same binder as the note’s, and the original kept in Research');
	await imported(p, 'The Salt Road');
	t.ok(!(await read(p, 'The Salt Road/The tide.md')).includes('\r'), 'no carriage return comes across');
	t.eq(await read(p, 'The Salt Road/The tide.md'), `${para('c')}\n`, 'and the text is the writer’s');
	t.eq(Buffer.from(await p.ev(`app.vault.adapter.readBinary('The Salt Road/Research/Originals/crlf.md.original').then(b => [...new Uint8Array(b)])`)).compare(readFileSync(a)), 0, 'the file is kept, byte for byte, in Research/Originals');
	t.ok(/export: false/.test(await read(p, 'The Salt Road/Research/Research.md')), 'where no export takes it');
	t.eq(await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('The Salt Road')).some(f => f.path.includes('/Research/'))`), false, 'and it is not a note of the binder');
	t.ok((await read(p, 'The Salt Road/The Salt Road.md')).includes('is kept as it was in Research/Originals'), 'the binder’s note says so');
	t.eq(readFileSync(a).toString(), crlf, 'the file on the disk is as it was');
	await closeAll(p);
	await fromFile(p, put('bom.md', bom));
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').value`), 'The Salt Road Two', 'a byte-order mark does not hide the first heading');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="signal"]').value`), 'headings', 'and the headings are found');
	await imported(p, 'The Salt Road Two');
	t.eq((await binderWords(p, 'The Salt Road Two')).join(' '), tokens(CLEAN.replace('The Salt Road', 'The Salt Road Two')).join(' '), 'every word is there');
});

test('a text file in an old encoding is read as Windows-1252, and said', async (p, h, t, before) => {
	const body = 'Chapter 1\n\n' + para('x').replace('Mara', 'Zoë') + '\n\nChapter 2\n\n' + para('y') + '\n';
	await fromFile(p, put('old.txt', Buffer.from(body, 'latin1')));
	t.ok((await things(p)).some((x) => /Windows-1252/.test(x)), 'it is said');
	t.ok((await shown(p)).includes('Zoë'), 'and the accent is right');
});

test('cancel writes nothing, and the source is as it was', async (p, h, t, before) => {
	await make(p, 'Sources/Clean.md', CLEAN);
	const files = await p.ev(`app.vault.getFiles().map(f => f.path).sort().join('|')`);
	await fromNote(p, 'Sources/Clean.md');
	await choose(p, 'signal', 'none');
	await press(p, 'Cancel').catch(() => closeAll(p));
	await closeAll(p);
	t.ok(!(await p.ev(`!!document.querySelector('${WIN}')`)), 'the dialog closes');
	t.eq(await p.ev(`app.vault.getFiles().map(f => f.path).sort().join('|')`), files, 'no file was made');
	t.eq(await read(p, 'Sources/Clean.md'), CLEAN, 'and the note is as it was');
	same(t, { ...before, 'Sources/Clean.md': CLEAN }, await texts(p));
});

test('the first dialog: a Scrivener backup goes on to the Scrivener import, and what can’t be read is said', async (p, h, t) => {
	await make(p, 'Sources/Some.md', FLAT);
	const scrivx = '<ScrivenerProject Version="2.0"><Binder><BinderItem UUID="11111111-1111-1111-1111-000000000001" Type="DraftFolder"><Title>Draft</Title><MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData><Children><BinderItem UUID="11111111-1111-1111-1111-000000000002" Type="Text"><Title>Only</Title><MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData></BinderItem></Children></BinderItem></Binder></ScrivenerProject>';
	const zip = put('Tiny.zip', zipSync({ 'Tiny.scriv/Tiny.scrivx': enc.encode(scrivx), 'Tiny.scriv/Files/Data/11111111-1111-1111-1111-000000000002/content.rtf': enc.encode('{\\rtf1 Words.}') }));
	await fromFile(p, zip);
	t.eq(await p.ev(`document.querySelector('${WIN} .modal-title')?.textContent`), 'Import “Tiny”', 'the Scrivener import’s dialog opens on it');
	t.eq(await p.ev(`document.querySelectorAll('${WIN} [data-binders-key="research"]').length`), 0, 'with no manuscript choices in it');
	await closeAll(p);
	await fromFile(p, put('Book.odt', 'PK'), { fails: true });
	t.ok((await said(p)).includes('can’t be imported yet'), 'a kind of file that isn’t read yet is said so, with what to do');
	await closeAll(p);
	await fromFile(p, put('Old.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), { fails: true });
	t.ok((await said(p)).includes('older Word file (.doc), or one locked with a password'), 'an older Word file, or a locked one, is refused by its first bytes, in plain words');
	await closeAll(p);
	await fromFile(p, put('Broken.docx', Buffer.from('PK nonsense')), { fails: true });
	t.ok((await said(p)).length > 10, 'a damaged Word file is refused, and the first dialog stays');
	t.ok(await p.ev(`!!document.querySelector('${WIN} [data-binders-key]') === false`), 'and the first dialog stays');
	await closeAll(p);
	await fromFile(p, put('Empty.txt', '  \n'), { fails: true });
	t.ok((await said(p)).includes('has no text'), 'a file with nothing in it is said to have none');
	t.eq(await p.ev(`[...document.querySelectorAll('${WIN} button')].map(b => b.textContent + (b.classList.contains('mod-cta') ? '*' : '')).join('|')`), 'Choose a file...*|Choose from this vault...|Cancel', 'its buttons: the one it is for filled, Cancel last');
});

test('a Word file from the device: chapters by its heading styles, tracked changes accepted and said, the footnote in place, the file kept as it was', async (p, h, t, before) => {
	const bytes = docxBytes(), a = put('Tide.docx', Buffer.from(bytes));
	await fromFile(p, a);
	t.eq((await tree(p)).join('|'), 'Front matter/|  Title page|One|Two|Three|Research/', 'the binder as it will be: the title in the front matter, a note for each chapter');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="signal"]').value`), 'headings', 'found by its heading styles');
	t.ok((await things(p)).some((x) => /1 tracked change|2 tracked changes/.test(x) && /accepted/.test(x)), 'tracked changes are said to be accepted');
	await imported(p, 'Tide');
	const one = await read(p, 'Tide/One.md');
	t.ok(one.includes('Kept added end^[A footnote of words.]') && !one.includes('cut'), 'the accepted text, the footnote in place');
	t.eq(await read(p, 'Tide/Two.md'), `${words(60, 'wb')}\n`, 'a chapter’s note is its text');
	t.eq(Buffer.from(await p.ev(`app.vault.adapter.readBinary('Tide/Research/Originals/Tide.docx').then(b => [...new Uint8Array(b)])`)).compare(Buffer.from(bytes)), 0, 'the Word file is kept, byte for byte, in Research/Originals');
	t.ok(/structure: "every note a chapter"/.test(await read(p, 'Tide/Tide.md')), 'every note a chapter');
	t.eq((await binderWords(p, 'Tide')).join(' '), tokens(DOCX_WORDS).join(' '), 'every word is there, in order, footnote words after');
	t.eq(readFileSync(a).compare(Buffer.from(bytes)), 0, 'the file on the disk is as it was');
});

test('a Word file already in the vault: "Import as a binder..." in its menu, the file left as it is and linked', async (p, h, t) => {
	const bytes = docxBytes();
	await p.ev(`(async () => { app.vault.setConfig('showUnsupportedFiles', true); await app.vault.createFolder('Sources'); await app.vault.createBinary('Sources/Draft.docx', new Uint8Array(${j([...bytes])}).buffer); })().then(() => 1)`);
	await p.sleep(400);
	await menuOn(p, 'Sources/Draft.docx');
	t.ok((await menuItems(p)).includes('Import as a binder...'), 'a .docx has the item in its menu');
	await clickMenu(p, 'Import as a binder...');
	await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').value`), 'Draft', 'named for the file');
	t.eq((await tree(p)).join('|'), 'Front matter/|  Title page|One|Two|Three', 'the same binder, with no original copied');
	await imported(p, 'Draft');
	t.ok((await read(p, 'Draft/Draft.md')).includes('Made from [[Sources/Draft.docx|Draft]]. That note is unchanged.'.replace('note', 'note')), 'the binder note links the file');
	t.ok(!(await exists(p, 'Draft/Research')), 'the file in the vault is not copied');
	t.eq(Buffer.from(await p.ev(`app.vault.adapter.readBinary('Sources/Draft.docx').then(b => [...new Uint8Array(b)])`)).compare(Buffer.from(bytes)), 0, 'and the file is byte for byte as it was');
	await p.ev(`(() => { app.vault.setConfig('showUnsupportedFiles', false); return 1; })()`);
});

test('"Choose from this vault...": a note and a Word file are listed, and the one picked is the one imported', async (p, h, t) => {
	await make(p, 'Sources/Pick.md', CLEAN);
	await p.ev(`app.vault.createBinary('Sources/Pick.docx', new Uint8Array(${j([...docxBytes()])}).buffer).then(() => 1)`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:import-manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN}')`);
	await press(p, 'Choose from this vault...');
	await until(p, `!!document.querySelector('.prompt .suggestion-item')`, 5000);
	t.eq(await p.ev(`[...document.querySelectorAll('.prompt .suggestion-item')].map(e => e.textContent).filter(x => x.startsWith('Sources/')).sort().join('|')`), 'Sources/Pick|Sources/Pick.docx', 'the vault’s notes outside a binder and its Word files are listed');
	await p.ev(`(() => { [...document.querySelectorAll('.prompt .suggestion-item')].find(e => e.textContent === 'Sources/Pick.docx').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="name"]').value`), 'Pick', 'the Word file picked is the one read');
	t.eq((await tree(p)).join('|'), 'Front matter/|  Title page|One|Two|Three', 'its chapters');
	await closeAll(p);
	await p.ev(`(() => { app.commands.executeCommandById('binders:import-manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN}')`);
	await press(p, 'Choose from this vault...');
	await until(p, `!!document.querySelector('.prompt .suggestion-item')`, 5000);
	await p.ev(`(() => { [...document.querySelectorAll('.prompt .suggestion-item')].find(e => e.textContent === 'Sources/Pick').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="signal"]').value`), 'headings', 'and the note picked is the note read');
	await imported(p, 'The Salt Road');
	t.eq(await read(p, 'Sources/Pick.md'), CLEAN, 'the note is as it was');
	t.eq((await binderWords(p, 'The Salt Road')).join(' '), tokens(CLEAN).join(' '), 'every word is there');
});

/** The menu of a row of the tree, as a right click (and a long press, and the menu key) opens it. */
async function rowMenu(p, title) {
	await p.ev(`(() => { const e = [...document.querySelectorAll('${WIN} [role="treeitem"]')].find(r => r.querySelector('.tree-item-inner').textContent === ${j(title)}); if (!e) throw new Error('row missing'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 5, button: 2 })); return 1; })()`);
	await p.sleep(200);
}
const treeOf = async (p) => (await tree(p)).join('|');
const CLEAN_TREE = 'Front matter/|  Title page|The jetty/|  a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11|  b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 b10 b11|The tide|The storm';

test('the preview put right by hand: a row’s menu (join, make a scene, rename), kept when a choice changes, and no word is lost or repeated', async (p, h, t) => {
	await make(p, 'Sources/Clean.md', CLEAN);
	await fromNote(p, 'Sources/Clean.md');
	t.eq(await treeOf(p), CLEAN_TREE, 'the binder as found');
	await rowMenu(p, 'The tide');
	t.eq((await menuItems(p)).join('|'), 'Join with the one before|Make this a scene|Make this a part|Rename...', 'a chapter’s menu');
	await closeMenus(p);
	await rowMenu(p, 'a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11');
	t.eq((await menuItems(p)).join('|'), 'Make this a chapter|Make this a part|Rename...', 'a scene that opens a chapter has no cut of its own to join');
	await closeMenus(p);
	await rowMenu(p, 'The storm'); await clickMenu(p, 'Join with the one before');
	t.eq(await treeOf(p), CLEAN_TREE.replace('|The storm', ''), 'Join with the one before: the chapter goes into the one before');
	t.ok((await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail')?.textContent`)).includes('4 notes'), 'and the bar counts again');
	await rowMenu(p, 'The tide'); await clickMenu(p, 'Make this a scene');
	t.ok((await tree(p)).includes('  The tide') && !(await tree(p)).includes('The tide'), 'Make this a scene: it is a scene of the chapter before');
	await rowMenu(p, 'The jetty'); await clickMenu(p, 'Rename...');
	await until(p, `!!document.querySelector('.modal input')`, 3000);
	await p.ev(`(() => { const i = document.querySelector('.modal-container:last-of-type input') || [...document.querySelectorAll('.modal input')].pop(); i.value = 'Arrival'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Rename').click(); return 1; })()`); await p.sleep(400);
	t.ok((await tree(p)).includes('Arrival/'), 'Rename...: the name is the writer’s');
	await choose(p, 'scenes', 'numbers');
	t.ok((await tree(p)).includes('Arrival/') && (await tree(p)).includes('  Scene 1'), 'what was done by hand is kept when a choice changes');
	await choose(p, 'scenes', 'words');
	await imported(p, 'The Salt Road');
	t.eq((await bodyWords(p, 'The Salt Road')).join(' '), tokens(CLEAN).join(' '), 'every word is there, in order, once');
	t.ok((await read(p, 'The Salt Road/Arrival/Arrival.md')) !== undefined && !!(await exists(p, 'The Salt Road/Arrival')), 'the renamed folder is made');
	t.ok((await p.ev(`app.vault.getMarkdownFiles().filter(f => f.path.startsWith('The Salt Road/Arrival/')).map(f => f.basename)`)).length > 2, 'with the joined and made scenes in it');
	t.eq(await read(p, 'Sources/Clean.md'), CLEAN, 'the source is as it was');
});

test('start a note here: on a paragraph of the preview, by the keyboard and the mouse; and a row’s menu by the keyboard', async (p, h, t) => {
	await make(p, 'Sources/Clean.md', CLEAN);
	await fromNote(p, 'Sources/Clean.md');
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="treeitem"]')].find(r => r.querySelector('.tree-item-inner').textContent === 'The tide').click(); return 1; })()`); await p.sleep(400);
	const buttons = await p.ev(`[...document.querySelectorAll('${WIN} .binders-import-start')].length`);
	t.eq(buttons, 0, 'a one-paragraph note has no paragraph to start a note at but its first');
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="treeitem"]')].find(r => r.querySelector('.tree-item-inner').textContent === 'Title page').click(); return 1; })()`); await p.sleep(400);
	t.eq(await p.ev(`document.querySelectorAll('${WIN} .binders-import-start').length`), 1, 'a note of two paragraphs has one');
	await p.ev(`(() => { document.querySelector('${WIN} .binders-import-start').focus(); return 1; })()`);
	t.ok(await p.ev(`document.activeElement.classList.contains('binders-import-start') && !!document.activeElement.getAttribute('aria-label')`), 'it can be reached by the keyboard, and has a name');
	await p.key('Enter'); await p.sleep(500);
	t.eq((await tree(p)).slice(0, 4).join('|'), 'Front matter/|  Title page|  By Mara|The jetty/', 'a note starts there: the front matter is two notes');
	// the menu key: the browser fires a context menu event at the focused row
	await p.ev(`(() => { const r = [...document.querySelectorAll('${WIN} [role="treeitem"]')].find(x => x.querySelector('.tree-item-inner').textContent === 'The storm'); r.focus(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 0, clientY: 0 })); return 1; })()`); await p.sleep(200);
	t.ok((await menuItems(p)).includes('Rename...'), 'the focused row’s menu opens from the keyboard');
	await closeMenus(p);
	await imported(p, 'The Salt Road');
	t.eq((await binderWords(p, 'The Salt Road')).join(' '), tokens(CLEAN).join(' '), 'every word is there');
});

test('a phone: a row’s own button opens its menu, a paragraph has its button, and the words are all there', async (p, h, t) => {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }); await reload(p, true);
	await p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	try {
		await fromFile(p, put('Edits.md', CLEAN));
		await press(p, 'Preview'); await p.sleep(250);
		t.ok(await p.ev(`[...document.querySelectorAll('${WIN} .binders-import-more')].every(b => b.getBoundingClientRect().width > 20 && getComputedStyle(b).opacity === '1')`), 'every row has its button, seen without hovering');
		await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="treeitem"]')].find(r => r.querySelector('.tree-item-inner').textContent === 'The tide').querySelector('.binders-import-more').click(); return 1; })()`); await p.sleep(250);
		t.ok((await menuItems(p)).includes('Join with the one before'), 'its button opens the row’s menu');
		await clickMenu(p, 'Join with the one before');
		t.ok(!(await tree(p)).includes('The tide'), 'and Join works');
		await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="treeitem"]')].find(r => r.querySelector('.tree-item-inner').textContent === 'Title page').click(); return 1; })()`); await p.sleep(400);
		const b = await p.ev(`(() => { const e = document.querySelector('${WIN} .binders-import-start'); const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, o: getComputedStyle(e).opacity }; })()`);
		t.ok(b.h >= 30 && b.o === '1', `a paragraph’s button is seen and big enough to touch (${JSON.stringify(b)})`);
		await p.ev(`(() => { document.querySelector('${WIN} .binders-import-start').click(); return 1; })()`); await p.sleep(400);
		await p.ev(`(() => { document.querySelector('${WIN} .modal-setting-back-button').click(); return 1; })()`); await p.sleep(250);
		await p.ev(`(() => { document.querySelector('${WIN} .modal-setting-back-button')?.click(); return 1; })()`); await p.sleep(250);
		await imported(p, 'The Salt Road');
		t.eq((await binderWords(p, 'The Salt Road')).join(' '), tokens(CLEAN).join(' '), 'imported on a phone, every word is there');
	} finally { await closeAll(p); await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); await reload(p, false); }
});

test('a phone: the choices first with Import in reach, then the binder’s list, then a note, and back', async (p, h, t) => {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }); await reload(p, true);
	await p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	try {
		await fromFile(p, put('Phone.md', CLEAN));
		t.ok(!(await p.ev(`!!document.querySelector('${WIN} .binders-export-preview')?.getBoundingClientRect().width`)), 'the choices come first');
		t.ok(await p.ev(`!!document.querySelector('${WIN} [data-binders-key="signal"]')?.getBoundingClientRect().width`), 'with where chapters start among them');
		const fits = async (what) => { const b = await p.ev(`(() => { const m=document.querySelector('${WIN}'), b=[...m.querySelectorAll('button')].filter(b=>b.textContent==='Import' && b.getBoundingClientRect().width).pop(), r=b.getBoundingClientRect(); return {width:m.scrollWidth,client:m.clientWidth,bottom:r.bottom,top:r.top,height:r.height,view:innerHeight}; })()`); t.ok(b.width <= b.client + 1, `${what}: nothing runs off the side`); t.ok(b.bottom <= b.view && b.top >= 0 && b.height >= 40, `${what}: Import is in reach, and big enough for a thumb (${JSON.stringify(b)})`); };
		await fits('the choices');
		await p.send('Page.captureScreenshot', {}).catch(() => null);
		await press(p, 'Preview'); await p.sleep(250);
		t.ok(await p.ev(`document.querySelector('${WIN} [role="tree"]').getBoundingClientRect().width > 250`), 'Preview shows the binder’s list, the width of the screen');
		t.ok(await p.ev(`[...document.querySelectorAll('${WIN} [role="treeitem"]')].every(r => r.getBoundingClientRect().height >= 44)`), 'its rows are 44px, a thumb’s');
		await p.ev(`(() => { [...document.querySelectorAll('${WIN} [role="treeitem"]')].find(r => r.textContent === 'The tide').click(); return 1; })()`); await p.sleep(250);
		t.ok((await shown(p)).includes('c0 c1'), 'a note tapped is shown');
		await fits('the note');
		const back = () => p.ev(`(() => { document.querySelector('${WIN} .modal-setting-back-button').click(); return 1; })()`).then(() => p.sleep(200));
		await back(); await back();
		t.ok(await p.ev(`!!document.querySelector('${WIN} [data-binders-key="name"]')?.getBoundingClientRect().width`), 'Back twice is the choices');
		await imported(p, 'The Salt Road');
		t.eq((await binderWords(p, 'The Salt Road')).join(' '), tokens(CLEAN).join(' '), 'imported on a phone, every word is there');
	} finally { await closeAll(p); await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); await reload(p, false); }
});
