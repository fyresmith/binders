// "Export again" (src/view/export-again.ts): the last export of a binder made once more with no window, to the same
// place, with the choices as they are now; asking only when the file there is no longer the one export left. The
// save dialog is stood in for as in specs-export.mjs. Every test checks that no note's text changed.
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, clickMenu, j, menuItems, openView, same, texts, until, withTidy } from './view-helpers.mjs';
import { WIN, asked, closeAll, docx, epub, notices, onMobile, open, open2, openEbook, press, run, saved, standIn, tapEl, withAuthor } from './specs-export.mjs';

export const specs = [];
const BINDER = 'The Lighthouse/The Lighthouse.md';
const test = (name, fn) => specs.push({ name: 'export again: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p);
	const before = await texts(p);
	try { await fn(p, h, t, before); same(t, before, await texts(p), { skip: [BINDER] }); } finally {
		await closeAll(p);
		await p.ev(`(async () => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; await pl.saveData(pl.settings); const f = app.vault.getAbstractFileByPath(pl.styles.folder); if (f) await app.vault.delete(f, true); await pl.styles.reload(); })().then(() => 1)`);
	}
}) });
const again = async (p) => { await openView(p, 'The Lighthouse'); await run(p, 'export-again'); };
const told = (p, text, ms = 10000) => until(p, `(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).some(n => n.textContent.includes(${j(text)})); })()`, ms);
const modalButton = (label) => `[...document.querySelectorAll('.modal-container:last-of-type button')].find(b => b.textContent === ${j(label)})`;
const viewMenu = (p) => p.ev(`(() => {
	const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const s = {}, it = new Proxy({}, { get: (x, m) => m === 's' ? s : (v) => { if (m === 'setTitle') s.t = v; return it; } }); cb(it); items.push(s); return menu; } : () => menu });
	${VIEW}.onPaneMenu(menu, 'more-options');
	return items.map(i => i.t);
})()`);

test('with nothing exported yet it opens the window; after an export it repeats it: the same kind, to the same place, with no window and no dialog', async (p, h, t) => {
	await withAuthor(p);
	await openView(p, 'The Lighthouse');
	t.ok(!(await viewMenu(p)).includes('Export again'), 'a binder never exported: its menu has no “Export again”');
	await run(p, 'export-again');
	t.ok(await until(p, `!!document.querySelector('${WIN}')`, 6000), 'and the command opens the window');
	await closeAll(p);
	await openEbook(p);
	// (Modern for this binder: the choice is kept with the binder, and Export again must use it)
	await p.ev(`(() => { const s = document.querySelector('${WIN} [data-binders-key="style"]'); s.value = 'Modern'; s.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(500);
	await press(p, 'Export');
	t.ok(await saved(p), 'exported from the window, through the dialog');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.epub'), first = statSync(at).mtimeMs;
	await closeAll(p);
	t.ok((await viewMenu(p)).includes('Export again'), 'now the binder view’s menu has “Export again”');
	// the style is changed meanwhile: the next export is in the style as it is now
	await p.ev(`(() => { const s = ${PL}.styles; s.set(s.get('Modern', 'book'), 'scene-break', '⁂'); return s.settled().then(() => 1); })()`);
	await p.sleep(1100);
	await again(p);
	// (the window's own notice said the same words a moment ago: the file itself says when this export is done)
	for (let i = 0; i < 60 && statSync(at).mtimeMs <= first; i++) await p.sleep(250);
	t.ok(await told(p, 'Exported “The Lighthouse” to Exports/The Lighthouse.epub.'), 'Export again: a notice says where it went');
	t.ok(!(await p.ev(`!!document.querySelector('${WIN}')`)), 'no window');
	t.eq((await asked(p)).length, 1, 'and no save dialog: the place is the last one');
	t.ok(statSync(at).mtimeMs > first, 'the file was written again');
	const e = epub(at);
	t.ok(e.x('OEBPS/css/book.css').includes('“Modern”') && e.x('OEBPS/css/book.css').includes('text-align: start'), 'in the binder’s style');
	t.eq(await p.ev(`${PL}.settings.exportKind`), 'ebook', 'the kind was the last one');
	t.eq(await p.ev(`JSON.stringify(app.loadLocalStorage('binders-export').places)`), '{}', 'the place was not made one to “save without asking”: the window still asks');
});

test('a file there that is no longer the one export left is asked about, and only then', async (p, h, t) => {
	await withAuthor(p);
	await open(p);
	await press(p, 'Export');
	t.ok(await saved(p), 'a manuscript exported from the window');
	const at = join(p.vaultDir, 'Exports', 'The Lighthouse.docx');
	await closeAll(p);
	const first = statSync(at).mtimeMs;
	await p.sleep(1100);
	await again(p);
	for (let i = 0; i < 60 && statSync(at).mtimeMs <= first; i++) await p.sleep(250);
	t.ok(statSync(at).mtimeMs > first && await told(p, 'Exported “The Lighthouse” to Exports/The Lighthouse.docx.'), 'again, over its own file: it is written, and nothing is asked');
	await p.sleep(300);
	t.ok(!(await p.ev(`!!document.querySelector('.modal-container')`)), 'no question');
	// the writer (or an editor) has changed the file since
	writeFileSync(at, 'Edited in Word since.');
	await again(p);
	t.ok(await until(p, `!!${modalButton('Replace')}`, 8000), 'changed since: Export again asks before replacing it');
	t.ok((await p.ev(`document.querySelector('.modal-container:last-of-type .modal-content').textContent`)).includes('The Lighthouse.docx'), 'naming the file');
	await p.ev(`(() => { ${modalButton('Cancel')}.click(); return 1; })()`);
	await p.sleep(600);
	t.eq(readFileSync(at, 'utf8'), 'Edited in Word since.', 'Cancel: the file is left as it is');
	await again(p);
	await until(p, `!!${modalButton('Replace')}`, 8000);
	await p.ev(`(() => { ${modalButton('Replace')}.click(); return 1; })()`);
	await p.sleep(1500);
	t.ok(docx(at).headings.length > 0, 'Replace: the manuscript is written over it');
	// a file that is gone is simply written again
	const { rmSync } = await import('fs');
	rmSync(at);
	await again(p);
	t.ok(await (async () => { for (let i = 0; i < 40 && !existsSync(at); i++) await p.sleep(250); return existsSync(at); })(), 'gone: written again, nothing asked');
});

specs.push({ name: 'export again: on a phone the file goes to Exports in the vault and to the share sheet, with no window', fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	await onMobile(p, 390, 844, async () => {
		await p.ev(`(() => { app.saveLocalStorage('binders-export', null); window.__shared = []; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared.push(d.files[0].name); }; return 1; })()`);
		await withAuthor(p);
		await open2(p);
		await tapEl(p, `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.textContent.startsWith('Ebook'))`);
		await p.sleep(800);
		await tapEl(p, `[...document.querySelectorAll('${WIN} .binders-export-phone-row button')].find(b => b.textContent === 'Export')`);
		await until(p, `app.vault.adapter.exists('Exports/The Lighthouse.epub')`, 10000);
		await until(p, `window.__shared.length === 1`, 6000);
		await closeAll(p);
		const first = await p.ev(`app.vault.adapter.stat('Exports/The Lighthouse.epub').then(s => s.mtime)`);
		await p.sleep(1100);
		await again(p);
		t.ok(await until(p, `window.__shared.length === 2`, 12000), 'Export again on a phone hands the file to the share sheet');
		t.eq(await p.ev(`window.__shared[1]`), 'The Lighthouse.epub', 'the ebook, as last time');
		t.ok((await p.ev(`app.vault.adapter.stat('Exports/The Lighthouse.epub').then(s => s.mtime)`)) > first, 'written again into Exports in the vault');
		t.ok(!(await p.ev(`!!document.querySelector('${WIN}')`)), 'no window');
		await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	});
	same(t, before, await texts(p), { skip: [BINDER] });
}) });

test('the window’s menu shows where exports go; settings name the styles folder', async (p, h, t) => {
	await withAuthor(p);
	await p.ev(`(() => { const pl = ${PL}, was = pl.exportHost.desktop; pl.exportHost.desktop = (app) => { const d = was(app); return d && { ...d, reveal: (path) => { window.__shown = path; } }; }; window.__shown = null; return 1; })()`);
	await open(p);
	const more = async () => { await p.ev(`(() => { document.querySelector('${WIN} [aria-label="More"]').click(); return 1; })()`); await until(p, `!!document.querySelector('.menu')`); };
	await more();
	t.eq((await menuItems(p)).join('|'), 'Choose where to save...|Show where exports go|Edit this style|Book details...', 'the menu beside Export');
	await clickMenu(p, 'Show where exports go');
	t.ok(await told(p, 'Nothing has been saved there yet'), 'before anything is exported there is no folder to show, and it says so');
	t.eq(await p.ev(`window.__shown`), null, 'nothing is opened');
	await press(p, 'Export');
	await saved(p);
	await more();
	await clickMenu(p, 'Show where exports go');
	await until(p, `window.__shown !== null`, 5000);
	t.eq(await p.ev(`window.__shown`), join(p.vaultDir, 'Exports'), 'after an export: the Exports folder, in the system’s file manager');
	await closeAll(p);
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	const tab = `app.setting.activeTab.containerEl`;
	await until(p, `!!${tab}.querySelector('.binders-settings-styles')`);
	t.eq(await p.ev(`${tab}.querySelector('.binders-settings-styles input').value + '|' + ${tab}.querySelector('.binders-settings-styles .setting-item-name').textContent`), 'Export styles|Styles folder', 'settings: the styles folder, by name');
	t.eq(await p.ev(`(() => { const rows = [...${tab}.querySelectorAll('.setting-item')].map(r => r.querySelector('.setting-item-name')?.textContent), i = rows.indexOf('Exports folder'); return rows.slice(i, i + 5).join('|'); })()`), 'Exports folder|Remembered places|Your name|Contact details|Styles folder', 'export’s rows, in the design’s order');
	// a name with a slash isn't one folder at the top of the vault
	await p.ev(`(() => { const i = ${tab}.querySelector('.binders-settings-styles input'); i.focus(); i.value = 'a/b'; i.dispatchEvent(new Event('input')); i.blur(); return 1; })()`);
	await p.sleep(400);
	t.eq(await p.ev(`${PL}.settings.stylesFolder`), 'Export styles', 'a path is refused: the folder is one name');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
});
