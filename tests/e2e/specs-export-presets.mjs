// A book's exports (src/view/export-presets.ts, src/export/presets.ts): named exports kept in the binder note's
// `exports`, each with its own style, page, ISBN, what part of the book goes out and which front and back matter it
// takes; publishing details on the title and copyright pages and in the ebook; "Export with..." and "Export again".
// The save dialog is stood in for as in specs-export.mjs. Every test checks that no note but the binder note changed.
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, clickMenu, hoverMenu, j, openView, same, texts, until, withTidy, writeRaw, answer } from './view-helpers.mjs';
import { WIN, closeAll, docx, epub, epubcheck, open, pick, press, run, saved, standIn, withAuthor } from './specs-export.mjs';

export const specs = [];
const L = 'The Lighthouse/', BINDER = `${L}The Lighthouse.md`;
const test = (name, fn, o = {}) => specs.push({ name: 'export presets: ' + name, ...(o.tier ? { tier: o.tier } : {}), fn: withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p);
	await withAuthor(p);
	const before = await texts(p);
	try { await fn(p, h, t, before); same(t, before, await texts(p), { skip: [BINDER, ...(o.skip ?? [])] }); } finally {
		await closeAll(p);
		await p.ev(`(async () => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });

/** The binder note's `exports`, as Obsidian has read it. */
const exportsOf = (p) => p.ev(`JSON.stringify(app.metadataCache.getCache(${j(BINDER)})?.frontmatter?.exports ?? null)`).then((s) => JSON.parse(s));
const waitExports = (p, test, ms = 6000) => until(p, `(() => { const e = app.metadataCache.getCache(${j(BINDER)})?.frontmatter?.exports; return !!e && (${test})(e); })()`, ms);
const note = (p, fn) => p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(BINDER)}), (fm) => { ${fn} }).then(() => 1)`);
/** The binder note's text with its `exports` taken out: what must be as it was. */
const withoutExports = (text) => text.replace(/\nexports:\n(?:  .*\n)+/, '\n');
const row = (name) => `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(name)})`;
const names = (p) => p.ev(`[...document.querySelectorAll('${WIN} [role="option"] .binders-snapshots-item-name')].map(e => e.textContent)`);
const chosen = (p) => p.ev(`document.querySelector('${WIN} [role="option"][aria-selected="true"] .binders-snapshots-item-name')?.textContent`);
const rowMenu = (p, name) => p.ev(`(() => { const r = ${row(name)}, b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: b.x + 40, clientY: b.y + 10 })); return 1; })()`);
/** Types into the dialog that asks for a name, and presses its button. */
const typeName = async (p, value, button) => {
	await until(p, `!!document.querySelector('.modal-container:last-of-type input[type="text"]')`, 4000);
	await p.ev(`(() => { const i = document.querySelector('.modal-container:last-of-type input[type="text"]'); i.value = ${j(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await answer(p, button);
	await p.sleep(400);
};
const select = (p, key, value) => p.ev(`(() => { const s = document.querySelector('${WIN} select[data-binders-key="${key}"]'); s.value = ${j(value)}; s.dispatchEvent(new Event('change')); return 1; })()`).then(() => p.sleep(600));
const detail = (p) => p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`);
const file = (p, name) => join(p.vaultDir, 'Exports', name);
/** Exports from the window, and waits for the file. */
const exportNow = async (p) => { await press(p, 'Export'); return saved(p, 20000); };
const bodies = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(L)}) && f.path !== ${j(BINDER)})) o[f.basename] = (await app.vault.read(f)).replace(/^---\\n[\\s\\S]*?\\n---\\n/, '').trim().slice(0, 40); return o; })()`);

test('a binder that has named none has the five kinds as its exports, and opening the window writes nothing', async (p, h, t) => {
	await open(p);
	t.eq((await names(p)).join('|'), 'Manuscript|Ebook|Paperback|Scrivener project|One note', 'one export of each kind, named for it');
	await pick(p, 'Ebook');
	await pick(p, 'Manuscript');
	await closeAll(p);
	t.eq(await exportsOf(p), null, 'choosing among them writes no `exports` to the binder note');
});

test('New, Duplicate, Rename and Delete: each kept in the binder note’s `exports`, and nothing else in the note changes', async (p, h, t, before) => {
	await open(p);
	await rowMenu(p, 'Ebook');
	await hoverMenu(p, 'New export');
	await clickMenu(p, 'Ebook');
	await typeName(p, 'Kindle', 'Add');
	t.ok(await waitExports(p, `(e) => e.some(x => x.name === 'Kindle' && x.kind === 'ebook')`), 'a new ebook export, named Kindle, is written');
	t.eq((await exportsOf(p)).map((e) => e.name).join('|'), 'Manuscript|Ebook|Kindle|Paperback|Scrivener project|One note', 'the five it had are written out first, and the new one goes after the one chosen');
	t.eq(await chosen(p), 'Kindle', 'and is the one chosen');
	await rowMenu(p, 'Kindle');
	await clickMenu(p, 'Duplicate');
	await typeName(p, 'Kobo', 'Add');
	t.ok(await waitExports(p, `(e) => e.some(x => x.name === 'Kobo' && x.kind === 'ebook')`), 'duplicated, under the name given');
	await rowMenu(p, 'Kobo');
	await clickMenu(p, 'Rename...');
	await typeName(p, 'Kindle', 'Rename');
	t.ok(await p.ev(`!!document.querySelector('.modal-container:last-of-type input[type="text"]')`), 'a name another export has is refused: the dialog stays');
	await typeName(p, 'Kobo store', 'Rename');
	t.ok(await waitExports(p, `(e) => e.some(x => x.name === 'Kobo store') && !e.some(x => x.name === 'Kobo')`), 'renamed');
	t.eq(await chosen(p), 'Kobo store', 'the window says the new name');
	await rowMenu(p, 'Kobo store');
	await clickMenu(p, 'Delete');
	await answer(p, 'Delete');
	t.ok(await waitExports(p, `(e) => !e.some(x => x.name === 'Kobo store')`), 'deleted');
	t.eq((await names(p)).join('|'), 'Manuscript|Ebook|Kindle|Paperback|Scrivener project|One note', 'the list is as the note says');
	const now = await p.ev(`app.vault.adapter.read(${j(BINDER)})`);
	t.eq(withoutExports(now), before[BINDER], 'the binder note gained `exports`, and nothing else in it changed');
}, { tier: 'guard' });

test('an export’s own choices are its own: an ISBN, a style and a file named for it; another of the same kind keeps its own', async (p, h, t) => {
	await note(p, `fm.exports = [{ name: 'Ebook', kind: 'ebook' }, { name: 'Kindle', kind: 'ebook' }];`);
	await open(p);
	await pick(p, 'Kindle');
	await p.ev(`(() => { const i = document.querySelector('${WIN} input[data-binders-key="isbn"]'); i.value = '978-1-7390112-0-4'; i.dispatchEvent(new Event('change')); return 1; })()`);
	t.ok(await waitExports(p, `(e) => e.find(x => x.name === 'Kindle')?.isbn === '978-1-7390112-0-4'`), 'the ISBN is kept with Kindle');
	await select(p, 'style', 'Modern');
	t.ok(await waitExports(p, `(e) => e.find(x => x.name === 'Kindle')?.style === 'Modern'`), 'and its style');
	t.eq(await p.ev(`${row('Kindle')}.querySelector('.binders-snapshots-item-detail').textContent`), 'EPUB · Modern', 'its row says what it makes');
	t.ok(await exportNow(p), 'exported');
	const k = epub(file(p, 'The Lighthouse (Kindle).epub'));
	t.ok(k.opf.includes('urn:isbn:9781739011204') && k.x('OEBPS/css/book.css').includes('“Modern”'), 'its file is named for it, and has its ISBN and its style');
	await pick(p, 'Ebook');
	t.eq(await p.ev(`document.querySelector('${WIN} input[data-binders-key="isbn"]').value`), '', 'the other ebook has no ISBN');
	t.eq(await p.ev(`document.querySelector('${WIN} select[data-binders-key="style"]').value`), 'Classic', 'and its own style');
	t.ok(await exportNow(p), 'exported');
	const e = epub(file(p, 'The Lighthouse.epub'));
	t.ok(!e.opf.includes('urn:isbn') && existsSync(file(p, 'The Lighthouse (Kindle).epub')), 'its file is the book’s own name, without the ISBN, and Kindle’s is still there');
}, { tier: 'guard' });

test('what goes out: a folder, numbered as in the whole book or from 1, without front and back matter, word for word', async (p, h, t) => {
	const b = await bodies(p);
	await note(p, `fm.exports = [{ name: 'Critique group', kind: 'manuscript', folder: 'Part Two' }];`);
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} select[data-binders-key="scope"]').value`), 'folder:Part Two', 'the folder is chosen');
	t.ok(/^Part Two · \d+ words · 2 chapters$/.test(await detail(p)), `the bar says what goes out (${await detail(p)})`);
	t.ok(await exportNow(p), 'exported');
	let d = docx(file(p, 'The Lighthouse (Critique group).docx'));
	t.ok(d.all.includes(b['The wreck']) && d.all.includes(b['Lights out']), 'Part Two’s chapters are in it');
	t.ok(!d.all.includes(b['Arrival']) && !d.all.includes(b['Prologue']) && !d.all.includes(b['Epilogue']), 'and nothing outside Part Two');
	t.ok(d.headings.some((x) => x.includes('Chapter Four')) && !d.headings.some((x) => x.includes('Chapter One')), `numbered as in the whole book (${d.headings.join(' / ')})`);
	await select(p, 'numbering', 'one');
	t.ok(await waitExports(p, `(e) => e[0].numbering === 'from 1'`), 'numbering from 1 is kept with the export');
	t.ok(await exportNow(p), 'exported again');
	d = docx(file(p, 'The Lighthouse (Critique group).docx'));
	t.ok(d.headings.some((x) => x.includes('Chapter One')) && !d.headings.some((x) => x.includes('Chapter Four')), `numbered from 1 (${d.headings.join(' / ')})`);
}, { tier: 'guard' });

test('what goes out: a saved filter, the notes it keeps and the folders that hold them', async (p, h, t) => {
	const b = await bodies(p);
	await note(p, `fm.filters = [{ name: 'The secret', match: 'all', conditions: [{ property: 'plotlines', operator: 'contains any of', value: ["The keeper's secret"] }] }]; fm.exports = [{ name: 'Arc', kind: 'manuscript', filter: 'The secret' }];`);
	await open(p);
	t.eq(await p.ev(`document.querySelector('${WIN} select[data-binders-key="scope"]').value`), 'filter:The secret', 'the filter is chosen');
	t.ok(await exportNow(p), 'exported');
	const d = docx(file(p, 'The Lighthouse (Arc).docx'));
	for (const n of ['The keeper', 'The wreck', 'Lights out']) t.ok(d.all.includes(b[n]), `${n}, which the filter keeps, is in it`);
	for (const n of ['Arrival', 'Storm warning', 'Epilogue']) t.ok(!d.all.includes(b[n]), `${n}, which it doesn’t, isn’t`);
}, { tier: 'guard' });

test('what goes out: the selected cards are offered when the window opens with them, and never kept in the export', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { ${VIEW}.current.select([${j(L + 'Part One/Arrival.md')}, ${j(L + 'Part Two/Lights out.md')}], ${j(L + 'Part One/Arrival.md')}); return 1; })()`);
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} select[data-binders-key="scope"]')`, 6000);
	t.ok(await p.ev(`!!document.querySelector('${WIN} select[data-binders-key="scope"] option[value="selection"]')`), 'the selected cards are offered');
	await select(p, 'scope', 'selection');
	t.ok(await until(p, `/^2 selected · \\d+ words/.test(document.querySelector('${WIN} .binders-snapshots-detail').textContent)`, 6000), `the bar says so (${await detail(p)})`);
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-compare').click(); return 1; })()`);
	await p.sleep(300);
	t.eq(await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row .nav-file-title-content')].map(e => e.textContent).join('|')`), 'Part One|Arrival|Part Two|Lights out', 'Contents lists the two, with the parts that hold them');
	t.eq(await exportsOf(p), null, 'nothing is written to the binder note');
	await closeAll(p);
	await p.ev(`(() => { ${VIEW}.current.select([]); return 1; })()`);
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} select[data-binders-key="scope"]')`, 6000);
	t.eq(await p.ev(`document.querySelector('${WIN} select[data-binders-key="scope"]').value`), 'book', 'opened again without them: the whole book');
});

test('a folder or a saved filter that is gone: said with the things to look at, and Export is off', async (p, h, t) => {
	await note(p, `fm.exports = [{ name: 'Lost', kind: 'manuscript', folder: 'Part Nine' }, { name: 'Lost filter', kind: 'ebook', filter: 'Nobody' }];`);
	await open(p);
	t.ok(await until(p, `[...document.querySelectorAll('${WIN} .binders-export-warn-text')].some(e => e.textContent.includes('Part Nine'))`, 4000), 'the folder that is gone is said');
	t.ok(await p.ev(`document.querySelector('${WIN} button.mod-cta').disabled`), 'and Export is off');
	await pick(p, 'Lost filter');
	t.ok(await until(p, `[...document.querySelectorAll('${WIN} .binders-export-warn-text')].some(e => e.textContent.includes('“Nobody” isn’t one of this binder’s saved filters'))`, 4000), 'a filter that is gone is said');
	t.ok(await p.ev(`document.querySelector('${WIN} button.mod-cta').disabled`), 'and Export is off');
	t.ok(!existsSync(join(p.vaultDir, 'Exports')), 'nothing was exported');
});

test('front and back matter per export: a box in Contents; left out of one export only; it follows the note renamed', async (p, h, t) => {
	await writeRaw(p, L + 'Also by (Kindle).md', 'KINDLE-STORE-LINKS.\n');
	await writeRaw(p, L + 'Also by (Kobo).md', 'KOBO-STORE-LINKS.\n');
	await p.sleep(600);
	await note(p, `fm.exports = [{ name: 'Kindle', kind: 'ebook', 'leave out': ['[[${L}Also by (Kobo)]]'] }, { name: 'Kobo', kind: 'ebook', 'leave out': ['[[${L}Also by (Kindle)]]'] }];`);
	await open(p);
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-compare').click(); return 1; })()`);
	const box = (name) => `document.querySelector('${WIN} .binders-export-row[data-path="${L}${name}.md"] .binders-export-take')`;
	await until(p, `!!${box('Also by (Kobo)')}`, 6000);
	t.eq(await p.ev(`[${box('Also by (Kindle)')}.checked, ${box('Also by (Kobo)')}.checked].join()`), 'true,false', 'Kindle takes its own page and not Kobo’s');
	t.ok(await exportNow(p), 'exported');
	let e = epub(file(p, 'The Lighthouse (Kindle).epub'));
	t.ok(e.body.includes('KINDLE-STORE-LINKS') && !e.body.includes('KOBO-STORE-LINKS'), 'the ebook has the one and not the other');
	// a box ticked writes the export's list
	await p.ev(`(() => { ${box('Also by (Kobo)')}.click(); return 1; })()`);
	t.ok(await waitExports(p, `(e) => (e[0]['leave out'] ?? []).length === 0`), 'ticked: Kindle leaves nothing out now');
	await p.ev(`(() => { ${box('Also by (Kobo)')}.click(); return 1; })()`);
	t.ok(await waitExports(p, `(e) => (e[0]['leave out'] ?? []).length === 1`), 'and unticked again');
	await closeAll(p);
	// the note renamed: the export follows it
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${j(L + 'Also by (Kobo).md')}), ${j(L + 'Also by on Kobo.md')}).then(() => 1)`);
	t.ok(await waitExports(p, `(e) => JSON.stringify(e[0]['leave out']).includes('Also by on Kobo')`, 8000), `Kindle’s “leave out” names the note by its new name (${JSON.stringify((await exportsOf(p))[0]['leave out'])})`);
	await open(p);
	t.ok(await exportNow(p), 'exported again');
	e = epub(file(p, 'The Lighthouse (Kindle).epub'));
	t.ok(!e.body.includes('KOBO-STORE-LINKS'), 'and the renamed note is still left out');
}, { tier: 'guard', skip: [`${L}Also by (Kindle).md`, `${L}Also by (Kobo).md`, `${L}Also by on Kobo.md`] });

test('a folder chosen as what goes out follows its folder renamed', async (p, h, t) => {
	await note(p, `fm.exports = [{ name: 'Critique group', kind: 'manuscript', folder: 'Part Two' }];`);
	await p.sleep(400);
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${j(L + 'Part Two')}), ${j(L + 'The second part')}).then(() => 1)`);
	t.ok(await waitExports(p, `(e) => e[0].folder === 'The second part'`, 8000), `the export names the folder by its new name (${JSON.stringify(await exportsOf(p))})`);
	await open(p);
	t.ok(/^The second part · /.test(await detail(p)), `and the window exports it (${await detail(p)})`);
	t.ok(!(await p.ev(`document.querySelector('${WIN} button.mod-cta').disabled`)), 'Export is on');
}, { tier: 'guard', skip: [`${L}Part Two/The wreck.md`, `${L}Part Two/Lights out.md`, `${L}The second part/The wreck.md`, `${L}The second part/Lights out.md`, `${L}Part Two/Part Two.md`, `${L}The second part/The second part.md`] });

test('publishing details: written by Book details, on the ebook’s title and copyright pages, and in its own metadata', async (p, h, t, before) => {
	await note(p, `fm.exports = [{ name: 'Kindle', kind: 'ebook', isbn: '978-1-7390112-0-4' }];`);
	await open(p);
	await p.ev(`(() => { document.querySelector('${WIN} [aria-label="Book details"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-book-details [data-binders-key="series"]')`, 4000);
	const set = (key, value) => p.ev(`(() => { const e = document.querySelector('.modal.binders-book-details [data-binders-key="${key}"]'); e.value = ${j(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); e.dispatchEvent(new Event('blur')); return 1; })()`).then(() => p.sleep(300));
	await set('series', 'The Corran Light');
	await set('seriesNumber', '2');
	await set('publisher', 'Lantern Press');
	await set('edition', 'First edition');
	await set('published', '2026-11-03');
	await set('description', 'A keeper and a light.');
	await set('rights', 'All rights reserved.');
	await set('keywords', 'sea, Cornwall');
	await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-book-details button')].find(b => b.textContent === 'Add...').click(); return 1; })()`);
	await p.sleep(300);
	await clickMenu(p, 'Editor');
	await p.ev(`(() => { const i = [...document.querySelectorAll('.modal.binders-book-details .binders-book-details-person input')].pop(); i.value = 'June Hale'; i.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(400);
	await answer(p, 'Done');
	await until(p, `app.metadataCache.getCache(${j(BINDER)})?.frontmatter?.contributors?.[0] === 'Editor: June Hale'`, 6000);
	const fm = await p.ev(`JSON.stringify(app.metadataCache.getCache(${j(BINDER)}).frontmatter)`).then((s) => JSON.parse(s));
	t.eq([fm.series, fm['series-number'], fm.publisher, fm.edition, fm.published, fm.description, fm.rights, fm.keywords.join(), fm.contributors.join()].join('|'), 'The Corran Light|2|Lantern Press|First edition|2026-11-03|A keeper and a light.|All rights reserved.|sea,Cornwall|Editor: June Hale', 'each kept as a plain property of the binder note');
	await until(p, `!!document.querySelector('${WIN} .binders-export-series')`, 6000);
	t.eq(await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-series, ${WIN} .binders-export-imprint')].map(e => e.textContent).join('|')`), 'The Corran Light, Book Two|Lantern Press', 'the title page in the window: the series under the title, the publisher at its foot');
	const copy = await p.ev(`[...document.querySelectorAll('${WIN} .mod-copyright p')].map(e => e.textContent.trim()).filter(x => x).join('|')`);
	t.eq(copy, '© 2026 Mara Lindqvist|All rights reserved.|First edition, 2026|ISBN 978-1-7390112-0-4|Edited by June Hale|Published by Lantern Press'.replace('2026 Mara', `${new Date().getFullYear()} Mara`), 'the copyright page in the window, with this export’s ISBN');
	t.ok(await exportNow(p), 'exported');
	const e = epub(file(p, 'The Lighthouse (Kindle).epub'));
	const v = epubcheck(file(p, 'The Lighthouse (Kindle).epub'));
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it, with all of it');
	for (const [want, what] of [['<dc:publisher>Lantern Press</dc:publisher>', 'the publisher'], ['<dc:date>2026-11-03</dc:date>', 'the date'], ['<dc:description>A keeper and a light.</dc:description>', 'the description'], ['<dc:subject>Cornwall</dc:subject>', 'a keyword'], ['>June Hale</dc:contributor>', 'the editor'], ['<meta property="belongs-to-collection" id="series">The Corran Light</meta>', 'the series']]) t.ok(e.opf.includes(want), `the ebook’s package says ${what}`);
	const title = e.names.filter((n) => n.endsWith('.xhtml')).map((n) => e.x(n)).find((x) => x.includes('class="titlepage"')) ?? '';
	t.ok(title.includes('The Corran Light, Book Two') && title.includes('Lantern Press'), 'and its title page');
	const kept = ['exports', 'series', 'series-number', 'publisher', 'edition', 'published', 'description', 'rights', 'keywords', 'contributors'].reduce((text, key) => text.replace(new RegExp(`\\n${key}:[^\\n]*\\n(?:  [^\\n]*\\n)*`), '\n'), await p.ev(`app.vault.adapter.read(${j(BINDER)})`));
	t.eq(kept, before[BINDER], 'nothing else in the binder note changed');
}, { tier: 'guard' });

test('“Export with...” lists this binder’s exports and opens the window on the one chosen', async (p, h, t) => {
	await note(p, `fm.exports = [{ name: 'Submission', kind: 'manuscript' }, { name: 'Kobo', kind: 'ebook' }];`);
	await openView(p, 'The Lighthouse');
	await run(p, 'export-with');
	await until(p, `!!document.querySelector('.prompt .suggestion-item')`, 4000);
	t.eq(await p.ev(`[...document.querySelectorAll('.prompt .suggestion-item')].map(e => e.textContent).join('|')`), 'Submission|Kobo', 'the binder’s exports, by name');
	await p.ev(`(() => { [...document.querySelectorAll('.prompt .suggestion-item')].find(e => e.textContent === 'Kobo').click(); return 1; })()`);
	t.ok(await until(p, `document.querySelector('${WIN} .binders-snapshots-name')?.textContent === 'Kobo'`, 6000), 'the window opens on Kobo');
});

test('“Export again” makes the export last made once more, by its name: its part of the book, its file', async (p, h, t) => {
	const b = await bodies(p);
	await note(p, `fm.exports = [{ name: 'Submission', kind: 'manuscript' }, { name: 'Critique group', kind: 'manuscript', folder: 'Part Two' }];`);
	await open(p);
	await pick(p, 'Critique group');
	t.ok(await exportNow(p), 'exported from the window');
	const at = file(p, 'The Lighthouse (Critique group).docx'), first = statSync(at).mtimeMs;
	await closeAll(p);
	await openView(p, 'The Lighthouse');
	await run(p, 'export-again');
	for (let i = 0; i < 60 && statSync(at).mtimeMs <= first; i++) await p.sleep(250);
	t.ok(statSync(at).mtimeMs > first, 'the Critique group’s file was written again');
	t.ok(!existsSync(file(p, 'The Lighthouse.docx')), 'and not the Submission’s');
	const d = docx(at);
	t.ok(d.all.includes(b['The wreck']) && !d.all.includes(b['Arrival']), 'with Part Two only, as the export says');
}, { tier: 'guard' });
