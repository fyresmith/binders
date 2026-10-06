// "Export as" (src/view/export-as.ts, the one write path in src/view/props.ts): the part a note or folder plays in
// the book, overruled from the Export window's Contents, from a card's and a row's menu, and from the outliner's
// column. Each place writes the same properties, and Contents and the exported file follow. No note's text changes.
import { join } from 'path';
import { PL, VIEW, clickMenu, closeMenus, hoverMenu, j, menuItems, openView, settled, texts, until, withTidy } from './view-helpers.mjs';
import { WIN, closeAll, epub, openEbook, press, saved, standIn, withAuthor } from './specs-export.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const fm = (p, path) => p.ev(`(async () => { await new Promise(r => setTimeout(r, 250)); return JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter ?? {}); })()`).then(JSON.parse);
const has = (p, path, key, value) => until(p, `(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter ?? {})[${j(key)}] === ${j(value)}`, 6000);
const lacks = (p, path, key) => until(p, `!(${j(key)} in (app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter ?? {}))`, 6000);
/** Every note's text without its properties: what "Export as" must never change. */
const bodies = async (p) => Object.fromEntries(Object.entries(await texts(p)).map(([k, v]) => [k, v.replace(/^---\n[\s\S]*?\n---\n?/, '')]));
const sameBodies = (t, before, after) => { for (const [path, text] of Object.entries(before)) t.eq(after[path], text, `the text of “${path}” is unchanged`); };

const test = (name, fn) => specs.push({ name: 'export as: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p);
	const before = await bodies(p);
	try { await fn(p, h, t); sameBodies(t, before, await bodies(p)); } finally {
		await closeAll(p);
		await closeMenus(p);
		await p.ev(`(async () => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });

const ROW = `${WIN} .binders-export-outline .binders-export-row`;
const contents = (p) => p.ev(`[...document.querySelectorAll('${ROW}')].map(r => r.querySelector('.nav-file-title-content').textContent + '=' + (r.querySelector('.binders-export-role')?.textContent ?? '') + (r.querySelector('.binders-export-role.is-auto') ? '~' : '') + (r.classList.contains('binders-export-out') ? '!' : ''))`);
const row = (name) => `[...document.querySelectorAll('${ROW}')].find(r => r.querySelector('.nav-file-title-content').textContent === ${j(name)})`;
const roleMenu = async (p, name) => { await p.ev(`(() => { ${row(name)}.querySelector('.binders-export-role').click(); return 1; })()`); await until(p, `!!document.querySelector('.menu')`); };
const checked = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(i => i.querySelector('.menu-item-icon.mod-checked, .mod-selected') || i.classList.contains('mod-selected') || i.querySelector('.menu-item-icon svg.lucide-check')).map(i => i.querySelector('.menu-item-title').textContent)`);
const waitRows = (p, want) => until(p, `([...document.querySelectorAll('${ROW}')].some(r => r.querySelector('.nav-file-title-content').textContent + '=' + (r.querySelector('.binders-export-role')?.textContent ?? '') + (r.querySelector('.binders-export-role.is-auto') ? '~' : '') + (r.classList.contains('binders-export-out') ? '!' : '') === ${j(want)}))`, 8000);

test('Contents in the Export window: the made pages, each item with its role, a guessed role said as such; a row’s role is its menu, and the book follows', async (p, h, t) => {
	await withAuthor(p);
	await openEbook(p);
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-compare').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${ROW}')`);
	t.eq((await contents(p)).join('|'), 'Title page=|Copyright=|Contents=|Prologue=Chapter~|Part One=Part 1~|Arrival=Chapter 1~|The keeper=Chapter 2~|Storm warning=Chapter 3~|Part Two=Part 2~|The wreck=Chapter 4~|Lights out=Chapter 5~|Epilogue=Chapter~', 'the pages made for the book, then every item with the role Binders read for it, said as a reading');
	await roleMenu(p, 'Storm warning');
	t.eq((await menuItems(p)).join('|'), 'Automatic: chapter|Part|Chapter|Scene|Front matter|Back matter|Leave out', 'a row’s role opens “Export as”: Automatic with what it comes to, the roles, and Leave out');
	t.eq((await checked(p)).join(), 'Automatic: chapter', 'Automatic is ticked while nothing is said');
	await clickMenu(p, 'Scene');
	t.ok(await has(p, 'Part One/Storm warning.md', 'export-as', 'scene'), 'Scene: written on the note as export-as');
	t.ok(await waitRows(p, 'Storm warning=Scene'), 'Contents follows: a scene, said by hand now');
	t.ok((await contents(p)).includes('The wreck=Chapter 3~'), 'and the chapters after it are numbered again');
	// a folder: no Scene; its role is kept in its folder note, made for it
	await roleMenu(p, 'Part Two');
	t.eq((await menuItems(p)).join('|'), 'Automatic: part|Part|Chapter|Front matter|Back matter|Leave out', 'a folder can’t be a scene');
	await clickMenu(p, 'Chapter');
	t.ok(await has(p, 'Part Two/Part Two.md', 'export-as', 'chapter'), 'a folder’s role is in its folder note');
	t.ok(await waitRows(p, 'The wreck=Scene~'), 'and its notes are its scenes');
	// left out, and back
	await roleMenu(p, 'Epilogue');
	await clickMenu(p, 'Leave out');
	t.ok(await has(p, 'Epilogue.md', 'export', false), 'Leave out: export: false');
	t.ok(await waitRows(p, 'Epilogue=Left out!'), 'the row is faint and says so');
	await roleMenu(p, 'Epilogue');
	t.eq((await checked(p)).join(), 'Leave out', 'Leave out is the one ticked');
	await clickMenu(p, 'Back matter');
	t.ok(await has(p, 'Epilogue.md', 'export-as', 'back matter') && await lacks(p, 'Epilogue.md', 'export'), 'a role chosen for an item that was left out puts it back in, as that');
	t.ok(await waitRows(p, 'Epilogue=Back matter'), 'and Contents says so');
	// the keyboard: the role is a button, its menu comes on Enter, and the focus comes back to it
	await p.ev(`(() => { ${row('Arrival')}.querySelector('.binders-export-role').focus(); return 1; })()`);
	await p.key('Enter');
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Front matter'), 'Enter on a role opens its menu');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(await p.ev(`document.activeElement === ${row('Arrival')}.querySelector('.binders-export-role')`), 'and Escape gives the keyboard back to it');
	t.ok((await p.ev(`${row('Arrival')}.querySelector('.binders-export-role').getAttribute('aria-label')`)).startsWith('Arrival: export as chapter 1, automatic'), 'it says what it is to a screen reader');

	await press(p, 'Export');
	t.ok(await saved(p), 'exported');
	const e = epub(join(p.vaultDir, 'Exports', 'The Lighthouse.epub'));
	t.eq(e.headings.join('|'), 'Prologue|Part One|Chapter One Arrival|Chapter Two The keeper|Chapter Three|Epilogue', 'the file has the structure Contents shows: Storm warning goes on with its chapter, Part Two is a chapter of two scenes, the epilogue is back matter');
	// Automatic again: the property goes
	await roleMenu(p, 'Storm warning');
	await clickMenu(p, 'Automatic: chapter');
	t.ok(await lacks(p, 'Part One/Storm warning.md', 'export-as'), 'Automatic: the property is taken away');
	// a row opens its note
	await until(p, `!!${row('Arrival')}`);
	await p.ev(`(() => { ${row('Arrival')}.querySelector('.nav-file-title-content').click(); return 1; })()`);
	await until(p, `!document.querySelector('${WIN}')`, 5000);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Part One/Arrival.md', 'a click on a row opens its note');
});

test('a card’s menu and a row’s menu have “Export as”, and write what Contents does', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="${L}Prologue.md"]')`);
	await settled(p, `.workspace-leaf.mod-active .binders-card[data-path="${L}Prologue.md"]`, { still: 500 });
	const at = await p.at(`.workspace-leaf.mod-active .binders-card[data-path="${L}Prologue.md"]`);
	await p.right(at.x, at.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Export as'), 'a card’s menu has “Export as”, with “Include in export”');
	await hoverMenu(p, 'Export as');
	await until(p, `[...document.querySelectorAll('.menu .menu-item-title')].some(e => e.textContent === 'Front matter')`);
	t.ok((await menuItems(p)).join('|').includes('Automatic: chapter|Part|Chapter|Scene|Front matter|Back matter|Leave out'), 'the same choices as in Contents');
	await clickMenu(p, 'Front matter');
	t.ok(await has(p, 'Prologue.md', 'export-as', 'front matter'), 'written as export-as on the note');
	await closeMenus(p);
	// the outliner's row
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-outliner-row[data-path="${L}Epilogue.md"]')`);
	// (the rows are still finding their places as the outliner opens: the pointer waits for this one to stop)
	const name = `.workspace-leaf.mod-active .binders-outliner-row[data-path="${L}Epilogue.md"] .binders-outliner-name`;
	await settled(p, name, { still: 500 });
	const r = await p.at(name);
	await p.right(r.x, r.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.eq(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-row.is-selected')].map(e => e.dataset.path).join()`), L + 'Epilogue.md', 'the row’s own menu');
	await hoverMenu(p, 'Export as');
	await until(p, `[...document.querySelectorAll('.menu .menu-item-title')].some(e => e.textContent === 'Leave out')`);
	await p.sleep(300);
	await clickMenu(p, 'Leave out');
	t.ok(await has(p, 'Epilogue.md', 'export', false), 'Leave out from a row’s menu: export: false, as “Include in export” unticked');
	await closeMenus(p);
	// what was said in the views is what the window shows
	await withAuthor(p);
	await openEbook(p);
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-compare').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${ROW}')`);
	const rows = await contents(p);
	t.ok(rows.includes('Prologue=Front matter') && rows.includes('Epilogue=Left out!'), 'Contents shows both, said by hand: ' + rows.join('|'));
});

test('the outliner’s “Export as” column: the role of each row, a guessed one fainter, changed from its cell for the rows selected', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'export' }, { id: 'role' }] } }; v.setMode('outliner'); return 1; })()`);
	const O = '.workspace-leaf.mod-active .binders-outliner';
	await until(p, `!!document.querySelector('${O} .binders-outliner-row [data-col="role"]')`);
	t.eq(await p.ev(`[...document.querySelectorAll('${O} .binders-outliner-th[data-col]')].map(e => e.textContent.trim()).join('|')`), 'Title|Export|Export as', 'the column, beside “Export”');
	const cells = () => p.ev(`[...document.querySelectorAll('${O} .binders-outliner-row')].map(r => r.dataset.path.slice(${L.length}).replace(/\\.md$/, '') + '=' + (r.querySelector('[data-col="role"]')?.textContent ?? '') + (r.querySelector('[data-col="role"] .is-auto') ? '~' : ''))`);
	t.eq((await cells()).join('|'), 'Prologue=Chapter~|Part One=Part~|Part One/Arrival=Chapter~|Part One/The keeper=Chapter~|Part One/Storm warning=Chapter~|Part Two=Part~|Part Two/The wreck=Chapter~|Part Two/Lights out=Chapter~|Epilogue=Chapter~', 'each row’s role, as Binders reads the binder');
	await settled(p, `${O} .binders-outliner-row[data-path="${L}Part One/Storm warning.md"] [data-col="role"]`, { still: 500 });
	const cell = await p.at(`${O} .binders-outliner-row[data-path="${L}Part One/Storm warning.md"] [data-col="role"]`);
	await p.click(cell.x, cell.y);
	await p.sleep(200);
	if (!(await p.ev(`!!document.querySelector('.menu')`))) await p.click(cell.x, cell.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.eq((await menuItems(p)).join('|'), 'Automatic: chapter|Part|Chapter|Scene|Front matter|Back matter|Leave out', 'its cell opens “Export as”');
	await clickMenu(p, 'Scene');
	t.ok(await has(p, 'Part One/Storm warning.md', 'export-as', 'scene'), 'written as export-as');
	await until(p, `document.querySelector('${O} .binders-outliner-row[data-path="${L}Part One/Storm warning.md"] [data-col="role"]')?.textContent === 'Scene'`, 6000);
	t.ok((await cells()).includes('Part One/Storm warning=Scene'), 'the cell says it, and not as a guess');
	t.eq((await fm(p, 'Part One/Arrival.md'))['export-as'], undefined, 'and no other row was written');
});
