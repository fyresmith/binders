// The writer's own properties in the inspector (src/inspector/pinned-props.ts, property-widgets.ts). Step 1: Obsidian's
// own editors for a property's value, through the one internal (app.metadataTypeManager), and Binders' own field
// where that is missing. Every type is drawn, edited with the mouse and keyboard, and read back for what the note
// would hold.
import { NOTE, VIEW, answer, clickMenu, closeMenus, hoverMenu, j, menuItems, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'inspector properties: ' + name, fn: withTidy(fn) });

const PL = `app.plugins.plugins.binders`;
const HOST = '#ip-host .metadata-property-value';

/** Draws one value in a row of a throwaway host in the page, with Obsidian's editors, or (stub) with the manager gone.
    What onChange hears is kept in window.__ip.got. */
async function draw(p, { key, value, kind, stub = false }) {
	return p.ev(`(() => {
		document.getElementById('ip-host')?.remove();
		const host = document.body.createDiv({ attr: { id: 'ip-host' }, cls: 'metadata-container' });
		host.style.cssText = 'position:fixed;top:60px;left:60px;width:420px;z-index:9999;background:var(--background-primary);padding:8px';
		const row = host.createDiv({ cls: 'metadata-properties' }).createDiv({ cls: 'metadata-property' });
		row.createDiv({ cls: 'metadata-property-key' }).createSpan({ text: ${j(key)} });
		const el = row.createDiv({ cls: 'metadata-property-value' });
		window.__ipReal ??= app.metadataTypeManager;
		window.__ip = { got: [] };
		// (the manager without its getTypeInfo: the rest of it stays, for Obsidian's own use of it meanwhile)
		app.metadataTypeManager = ${stub} ? Object.create(window.__ipReal, { getTypeInfo: { value: undefined } }) : window.__ipReal;
		const made = ${PL}.propertyEditors.draw(app, el, ${j(value ?? null)}, { key: ${j(key)}, sourcePath: 'The Lighthouse/Part One/Arrival.md', kind: ${j(kind ?? null) }|| undefined, onChange: (v) => window.__ip.got.push(v) });
		window.__ip.made = made;
		return made.native;
	})()`);
}
const undraw = (p) => p.ev(`(() => { if (window.__ipReal) app.metadataTypeManager = window.__ipReal; document.getElementById('ip-host')?.remove(); return 1; })()`);
const got = (p) => p.ev(`JSON.stringify(window.__ip.got)`).then(JSON.parse);
/** The real stand-in for `app.metadataTypeManager` is restored whatever the test did. */
const guarded = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await undraw(p); } };

const TYPES = [
	// [name, key, a value, what typing does, what the note should then hold]
	{ name: 'text', key: 'ip-pov', value: 'Mara', type: 'text', edit: async (p) => { await clickIn(p, `${HOST} input, ${HOST} [contenteditable]`); await p.key('End'); await p.type(' Ellis'); await p.key('Enter'); }, want: ['Mara Ellis'] },
	{ name: 'list', key: 'ip-cast', value: ['Mara', 'Harrow'], type: 'multitext', edit: async (p) => { await clickIn(p, `${HOST} .multi-select-input`); await p.type('Jonas'); await p.key('Enter'); }, want: [['Mara', 'Harrow', 'Jonas']] },
	{ name: 'number', key: 'ip-count', value: 3, type: 'number', edit: async (p) => { await clickIn(p, `${HOST} input`); await p.key('End'); await p.type('4'); await p.key('Enter'); }, want: [34] },
	{ name: 'checkbox', key: 'ip-done', value: false, type: 'checkbox', edit: async (p) => { await clickIn(p, `${HOST} input[type="checkbox"]`); }, want: [true] },
	{ name: 'date', key: 'ip-day', value: '2026-03-04', type: 'date', edit: async (p) => { await setField(p, `${HOST} input`, '2026-05-06'); }, want: ['2026-05-06'] },
	{ name: 'date and time', key: 'ip-moment', value: '2026-03-04T10:30', type: 'datetime', edit: async (p) => { await setField(p, `${HOST} input`, '2026-05-06T07:45'); }, want: ['2026-05-06T07:45'], norm: (v) => v.replace(/:00$/, '') },
	{ name: 'tags', key: 'tags', value: ['draft'], type: 'tags', edit: async (p) => { await clickIn(p, `${HOST} .multi-select-input`); await p.type('night'); await p.key('Enter'); }, want: [['draft', 'night']] },
];
async function clickIn(p, sel) {
	const at = await p.ev(`(() => { const e = [...document.querySelectorAll(${j(sel)})].find(e => e.getBoundingClientRect().width); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }; })()`);
	if (!at) throw new Error('nothing to click: ' + sel + ' in ' + (await p.ev(`document.getElementById('ip-host')?.innerHTML ?? 'no host'`)));
	await p.click(at.x, at.y);
	await p.sleep(150);
}
/** A date field is set as a browser's picker leaves it: its value, and the events a change fires. */
async function setField(p, sel, value) {
	await p.ev(`(() => { const e = document.querySelector(${j(sel)}); e.focus(); e.value = ${j(value)}; for (const t of ['input', 'change']) e.dispatchEvent(new Event(t, { bubbles: true })); e.blur(); return 1; })()`);
	await p.sleep(150);
}

for (const ty of TYPES) {
	test(`${ty.name}: Obsidian's own editor draws and edits through the internal`, guarded(async (p, h, t) => {
		const native = await draw(p, { key: ty.key, value: ty.value, kind: ty.type });
		t.ok(native, 'drawn by Obsidian’s own editor');
		const info = await p.ev(`JSON.stringify(${PL}.propertyEditors.kindOf(app, ${j(ty.key)}, ${j(ty.value)}))`).then(JSON.parse);
		t.eq(info.is, ty.type, 'the type of the value');
		t.ok(await p.ev(`!!document.querySelector(${j(HOST)})?.hasChildNodes()`), 'something is drawn');
		await ty.edit(p);
		t.eq(JSON.stringify((await got(p)).map(ty.norm ?? ((v) => v))), JSON.stringify(ty.want), 'what the editor says the note should hold, once');
	}));
	test(`${ty.name}: without the manager, Binders' own field draws and edits`, guarded(async (p, h, t) => {
		const native = await draw(p, { key: ty.key, value: ty.value, kind: ty.type, stub: true });
		t.ok(!native, 'drawn by Binders’ own field');
		t.ok(await p.ev(`!!document.querySelector(${j(HOST)})?.hasChildNodes()`), 'something is drawn');
		await ty.edit(p);
		t.eq(JSON.stringify(await got(p)), JSON.stringify(ty.want), 'what the field says the note should hold');
	}));
}

test('an empty value is drawn as the property’s own type, natively and not', guarded(async (p, h, t) => {
	// (a blank list is still a list, a blank number a number: the type is what the field asks for, not the value)
	await draw(p, { key: 'ip-blank', value: null, kind: 'multitext', stub: true });
	t.ok(await p.ev(`!!document.querySelector(${j(HOST + ' .multi-select-container')})`), 'a list field');
	await draw(p, { key: 'ip-blank', value: null, kind: 'number', stub: true });
	t.ok(await p.ev(`!!document.querySelector(${j(HOST + ' input[type="number"]')})`), 'a number field');
	await draw(p, { key: 'ip-blank', value: null, kind: 'checkbox', stub: true });
	t.ok(await p.ev(`!!document.querySelector(${j(HOST + ' input[type="checkbox"]')})`), 'a box');
}));

test('the fallback refuses what is not of its kind and says nothing', guarded(async (p, h, t) => {
	await draw(p, { key: 'ip-n', value: 3, kind: 'number', stub: true });
	await setField(p, `${HOST} input`, '');
	t.eq(JSON.stringify(await got(p)), '[null]', 'a number field cleared holds nothing');
	await draw(p, { key: 'ip-d', value: '2026-03-04', kind: 'date', stub: true });
	await p.ev(`(() => { const e = document.querySelector(${j(HOST + ' input')}); e.value = 'next week'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	t.eq(JSON.stringify(await got(p)), '[]', 'a date that is not in the shape of one is not written');
	t.eq(await p.ev(`document.querySelector(${j(HOST + ' input')}).getAttribute('aria-invalid')`), 'true', 'and the field says so');
}));

test('a widget that throws as it draws is caught, and the fallback draws', guarded(async (p, h, t) => {
	await p.ev(`(() => {
		window.__ipReal ??= app.metadataTypeManager;
		const bad = { type: 'text', icon: 'x', name: () => 'Text', render() { throw new Error('boom'); } };
		app.metadataTypeManager = Object.create(window.__ipReal, { getTypeInfo: { value: () => ({ expected: bad, inferred: bad }) } });
		document.getElementById('ip-host')?.remove();
		const host = document.body.createDiv({ attr: { id: 'ip-host' }, cls: 'metadata-container' });
		const el = host.createDiv({ cls: 'metadata-property-value' });
		window.__ip = { got: [], native: ${PL}.propertyEditors.draw(app, el, 'a', { key: 'ip-x', sourcePath: '', onChange: (v) => window.__ip.got.push(v) }).native };
		return 1;
	})()`);
	t.eq(await p.ev(`window.__ip.native`), false, 'the fallback drew');
	t.ok(await p.ev(`!!document.querySelector('#ip-host input')`), 'a field is there');
}));

test('a manager missing getTypeInfo, or half answering, is not used, and kindOf still answers by the value', guarded(async (p, h, t) => {
	t.ok(await p.ev(`${PL}.propertyEditors.available(app)`), 'Obsidian’s editors are there');
	const set = (getTypeInfo) => p.ev(`(() => { window.__ipReal ??= app.metadataTypeManager; app.metadataTypeManager = Object.create(window.__ipReal, { getTypeInfo: { value: ${getTypeInfo} } }); return 1; })()`);
	await set('undefined');
	t.ok(!(await p.ev(`${PL}.propertyEditors.available(app)`)), 'a manager without getTypeInfo is not used');
	const k = await p.ev(`JSON.stringify(${PL}.propertyEditors.kindOf(app, 'x', 5))`).then(JSON.parse);
	t.eq(k.kind, 'number', 'the kind of a number');
	t.eq(k.name, 'Number', 'its name');
	await set(`() => ({ expected: {}, inferred: null })`);
	t.ok(!(await p.ev(`${PL}.propertyEditors.available(app)`)), 'half an answer is not used');
	const k2 = await p.ev(`JSON.stringify(${PL}.propertyEditors.kindOf(app, 'x', [1]))`).then(JSON.parse);
	t.eq(k2.kind, 'multitext', 'half a manager answers by the value');
	await set(`() => { throw new Error('gone'); }`);
	t.ok(!(await p.ev(`${PL}.propertyEditors.available(app)`)), 'a manager that throws is not used');
}));


// ---- the pane: pins ----

const L = 'The Lighthouse/';
const ARRIVAL = L + 'Part One/Arrival.md', KEEPER = L + 'Part One/The keeper.md', STORM = L + 'Part One/Storm warning.md';
const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
const fieldSel = (f) => `${I} [data-field="${f}"]`;
const card = (path) => `.binders-view .binders-card[data-path=${j(path)}]`;
const paneText = (p) => p.ev(`document.querySelector(${j(I)})?.innerText ?? ''`);
const lf = (text) => text.replace(/\r/g, '');

/** The inspector in the right sidebar, beside the binder view in a mode. */
async function open(p, mode = 'corkboard', folder = 'The Lighthouse/Part One') {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
	await p.sleep(mode === 'manuscript' ? 900 : 400);
	await p.ev(`(async () => {
		const ws = app.workspace;
		ws.detachLeavesOfType('binders-inspector');
		ws.rightSplit.expand();
		const b = ws.getRightLeaf(false); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b);
		const main = ws.getMostRecentLeaf(ws.rootSplit); if (main) ws.setActiveLeaf(main, { focus: true });
	})().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(I)})`);
	await p.sleep(250);
}
async function clickCard(p, path, extra) {
	const at = await p.at(`${card(path)} .binders-card-footer`);
	if (!at) throw new Error('no card ' + path + ': ' + await p.ev(`JSON.stringify([...document.querySelectorAll('.binders-view .binders-card')].map(c => c.dataset.path)) + ' ' + (document.querySelector('.binders-view')?.innerText ?? 'no view').slice(0, 200)`));
	await p.click(at.x, at.y, extra);
	await p.sleep(400);
}
async function field(p, f) {
	await p.ev(`(() => { document.querySelector(${j(fieldSel(f))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	const at = await p.at(fieldSel(f));
	if (!at) throw new Error(`the inspector has no “${f}”: ` + (await paneText(p)).replace(/\n+/g, ' | '));
	await p.click(at.x, at.y);
	await p.sleep(250);
}
/** The scenes the tests pin from: a point of view, who is in them, and a count. */
async function scenes(p) {
	const w = (path, yaml, body) => writeRaw(p, path, `---\n${yaml}---\n${body}`);
	await w(ARRIVAL, 'status: revised\nsynopsis: Mara arrives on the island with the supply boat.\npov: "[[Mara]]"\ncharacters:\n  - "[[Mara]]"\n  - The master\nwords-done: 3\n', 'The supply boat left Mara on the jetty with two cases and a letter she had not opened.\n');
	await w(KEEPER, 'pov: "[[Harrow]]"\ncharacters:\n  - "[[Harrow]]"\n  - "[[Mara]]"\nwords-done: 5\n', 'The keeper did not look up.\n');
	await w(STORM, 'pov: "[[Mara]]"\n', 'A storm warning came over the radio.\n');
	await p.sleep(400);
}
const rowKeys = (p) => p.ev(`[...document.querySelectorAll(${j(I + ' .binders-pinned')})].map(r => r.querySelector('.binders-inspector-key').textContent)`);
const rowCount = (p) => p.ev(`document.querySelectorAll(${j(I + ' .binders-pinned')}).length`);
const pinsOnDisk = async (p) => {
	const m = /\ninspector:\n((?:  - .*\n)+)/.exec(lf(await read(p, NOTE)));
	return m ? m[1].trim().split('\n').map((l) => l.trim().replace(/^- /, '').replace(/^(["'])(.*)\1$/, '$2')) : [];
};
const menuState = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item')].map(e => [e.querySelector('.menu-item-title').textContent, e.classList.contains('is-disabled')])`);
async function otherProperty(p, typed) {
	await field(p, 'pin');
	// (the first click after a dialog has closed is lost to it: again)
	if (!(await until(p, `!!document.querySelector('.menu .menu-item')`, 800))) await field(p, 'pin');
	await until(p, `!!document.querySelector('.menu .menu-item')`);
	await clickMenu(p, 'Other property...').catch(async (e) => { throw new Error(`${typed}: ${e.message} / pane: ${(await paneText(p)).replace(/\n+/g, ' | ').slice(-200)} / modals: ${await p.ev(`document.querySelectorAll('.modal').length`)}`); });
	await until(p, `!!document.querySelector('.modal input')`);
	await p.type(typed);
	await answer(p, 'Pin');
}
const closeDialog = async (p) => { await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`); await until(p, `!document.querySelector('.modal')`); await p.sleep(500); };

test('pins: a binder pins a property from the ones its notes have, and the row follows the scene', async (p, h, t) => {
	await scenes(p);
	const before = await read(p, NOTE);
	await open(p);
	await clickCard(p, ARRIVAL);
	t.eq(await rowCount(p), 0, 'nothing pinned: no rows');
	await field(p, 'pin');
	const items = await menuItems(p);
	t.ok(items.includes('pov') && items.includes('characters') && items.includes('words-done'), 'the properties the binder’s notes have: ' + items.join());
	t.ok(!items.includes('status') && !items.includes('synopsis'), 'not Binders’ own');
	t.ok(items.includes('Other property...'), 'and any other by its name');
	await clickMenu(p, 'pov');
	await until(p, `document.querySelectorAll(${j(I + ' .binders-pinned')}).length === 1`);
	t.eq((await rowKeys(p)).join(), 'pov', 'a row for it');
	t.eq((await pinsOnDisk(p)).join(), 'pov', 'the binder note says so');
	t.eq(lf(await read(p, NOTE)).replace('inspector:\n  - pov\n', ''), lf(before), 'the rest of the binder note is as it was');
	await field(p, 'pin');
	t.ok(!(await menuItems(p)).includes('pov'), 'a pinned property is not offered again');
	await clickMenu(p, 'characters');
	await until(p, `document.querySelectorAll(${j(I + ' .binders-pinned')}).length === 2`);
	t.eq((await rowKeys(p)).join(), 'pov,characters', 'in the order they were pinned');
	await clickCard(p, KEEPER);
	const v = await p.ev(`document.querySelector(${j(fieldSel('prop:pov'))})?.textContent`);
	t.ok(/Harrow/.test(v ?? ''), 'the keeper’s point of view: ' + v);
});

test('pins: “Other property...” asks a name, and refuses Binders’ own, a name pinned already, and one that is no name', async (p, h, t) => {
	await scenes(p);
	await open(p);
	await clickCard(p, ARRIVAL);
	for (const [typed, why] of [['status', /already shows/], ['Label', /already shows/], ['export-as', /already shows/], ['a: b', /can’t be the name/]]) {
		await otherProperty(p, typed);
		const said = await p.ev(`document.querySelector('.modal')?.innerText ?? null`);
		t.ok(said && why.test(said), `“${typed}” is refused, in the dialog: ${said}`);
		await closeDialog(p);
	}
	t.eq((await pinsOnDisk(p)).length, 0, 'nothing was written');
	await otherProperty(p, 'mood');
	await until(p, `document.querySelectorAll(${j(I + ' .binders-pinned')}).length === 1`);
	t.eq((await pinsOnDisk(p)).join(), 'mood', 'a name of the writer’s is pinned, though no note has it yet');
	await otherProperty(p, 'MOOD');
	t.ok(/pinned already/.test(await p.ev(`document.querySelector('.modal')?.innerText ?? ''`)), 'the same name again, whatever its case');
	await closeDialog(p);
});

test('pins: a row’s menu names the type, moves it up and down, and unpins; the last one takes the property away', async (p, h, t) => {
	await scenes(p);
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('plotlines:', 'inspector:\n  - pov\n  - characters\n  - words-done\nplotlines:'));
	await p.sleep(400);
	await open(p);
	await clickCard(p, ARRIVAL);
	t.eq((await rowKeys(p)).join(), 'pov,characters,words-done', 'the rows are the pins, in order');
	t.eq(await p.ev(`document.querySelector(${j(I + ' [data-property-key="words-done"]')}).dataset.propertyType`), 'number', 'a row knows its type');
	const order = () => p.ev(`[...document.querySelectorAll(${j(I + ' .binders-pinned')})].map(r => r.dataset.propertyKey).join()`);
	await field(p, 'pin:characters');
	t.eq((await menuItems(p)).join('|'), 'List property|Move up|Move down|Unpin', 'the menu');
	await clickMenu(p, 'Move down');
	await until(p, `[...document.querySelectorAll(${j(I + ' .binders-pinned')})].map(r => r.dataset.propertyKey).join() === 'pov,words-done,characters'`);
	t.eq((await pinsOnDisk(p)).join(), 'pov,words-done,characters', 'on disk');
	await field(p, 'pin:pov');
	t.ok((await menuState(p)).find((x) => x[0] === 'Move up')[1], 'the first can’t go up');
	await closeMenus(p);
	await field(p, 'pin:characters');
	t.ok((await menuState(p)).find((x) => x[0] === 'Move down')[1], 'the last can’t go down');
	await clickMenu(p, 'Move up');
	await until(p, `[...document.querySelectorAll(${j(I + ' .binders-pinned')})].map(r => r.dataset.propertyKey).join() === 'pov,characters,words-done'`);
	t.eq(await order(), 'pov,characters,words-done', 'moved back');
	for (const k of ['pov', 'characters', 'words-done']) {
		await field(p, 'pin:' + k);
		await clickMenu(p, 'Unpin');
		await p.sleep(500);
	}
	t.eq(await rowCount(p), 0, 'no rows');
	t.ok(!/inspector/.test(await read(p, NOTE)), 'the property is gone from the binder note');
	t.ok(/plotlines:\n  - Mara/.test(await read(p, NOTE)), 'and what else it has is still there');
});

test('pins: what the list holds that Binders does not understand stays, and a case-different name is one pin', async (p, h, t) => {
	await scenes(p);
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('plotlines:', 'inspector:\n  - pov\n  - 7\n  - note: later\n  - Characters\nplotlines:'));
	await p.sleep(400);
	await open(p);
	await clickCard(p, ARRIVAL);
	t.eq((await rowKeys(p)).join(), 'pov,Characters', 'rows for the names only');
	await field(p, 'pin:Characters');
	await clickMenu(p, 'Move up');
	await p.sleep(600);
	const text = lf(await read(p, NOTE));
	t.ok(/inspector:\n  - Characters\n  - 7\n  - note: later\n  - pov\n/.test(text), 'the names swapped; the entries around them stayed: ' + text.slice(0, 200));
	await field(p, 'pin:pov');
	await clickMenu(p, 'Unpin');
	await p.sleep(600);
	t.ok(/inspector:\n  - Characters\n  - 7\n  - note: later\n/.test(lf(await read(p, NOTE))), 'unpinning takes only the name');
});

test('pins: a binder in a newer format shows its pins and changes nothing; a Longform project pins nothing and says why', async (p, h, t) => {
	await scenes(p);
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2').replace('plotlines:', 'inspector:\n  - pov\nplotlines:'));
	await p.sleep(500);
	await open(p);
	await clickCard(p, ARRIVAL);
	t.eq((await rowKeys(p)).join(), 'pov', 'the pin is shown');
	t.ok(!(await p.at(fieldSel('pin'))), 'but there is no way to pin');
	await field(p, 'pin:pov').catch(() => 0);
	t.ok(!(await menuItems(p)).includes('Unpin'), 'and no menu to unpin');
	const was = await read(p, NOTE);
	await p.sleep(300);
	t.eq(await read(p, NOTE), was, 'the binder note is as it was');
	await writeRaw(p, NOTE, orig);
	// a Longform project
	const index = await read(p, 'Longform demo/Index.md');
	await open(p, 'corkboard', 'Longform demo');
	await clickCard(p, 'Longform demo/Harbor.md');
	t.ok(!(await p.at(fieldSel('pin'))), 'no button');
	t.ok(/A Longform project keeps no pinned properties/.test(await paneText(p)), 'and it says why: ' + (await paneText(p)).replace(/\n+/g, ' | ').slice(-160));
	t.eq(await read(p, 'Longform demo/Index.md'), index, 'the index note is untouched');
});


// ---- the pane: one note's rows ----

const M = `${VIEW}.current`;
const BOM = '﻿';
const KEYS = ['pov', 'characters', 'beats', 'finished', 'day', 'moment', 'tags'];
const split2 = (text) => { const m = /^(﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/.exec(text); return m ? { head: m[1], body: m[2] } : { head: '', body: text }; };
const fmOf = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? null)`).then(JSON.parse);
/** A scene with a property of each type, and the binder pinning them. */
async function typed(p, { path = ARRIVAL, bom = false, eol = '\n' } = {}) {
	const yaml = ['status: revised', 'synopsis: Mara arrives.', 'pov: Mara', 'characters:', '  - "[[Mara]]"', '  - The master', 'beats: 3', 'finished: false', 'day: 2026-03-04', 'moment: 2026-03-04T10:30', 'tags:', '  - draft'].join(eol);
	const body = ['The supply boat left Mara on the jetty.', '', 'She had two cases and a letter she had not opened.', '', 'The keeper did not look up.', ''].join(eol);
	await writeRaw(p, path, `${bom ? BOM : ''}---${eol}${yaml}${eol}---${eol}${body}`);
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace(/inspector:\n(  - .*\n)+/, '').replace('plotlines:', `inspector:\n${KEYS.map((k) => `  - ${k}`).join('\n')}\nplotlines:`));
	await p.sleep(500);
	return { body };
}
/** The caret at the end of a field (a key does not do it in every kind of field). */
const toEnd = (p, key) => p.ev(`(() => { const e = document.activeElement; if (e && 'setSelectionRange' in e && e.type !== 'number') e.setSelectionRange(e.value.length, e.value.length); else if (e) { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } return 1; })()`);
const inPane = (key, sel = 'input, [contenteditable]') => `${I} [data-field="prop:${key}"] ${sel}`.replace(/, /g, `, ${I} [data-field="prop:${key}"] `);
/** Each type edited as a person edits it, in the pane. */
const EDITS = {
	pov: async (p) => { await clickIn(p, inPane('pov')); await toEnd(p); await p.type(' Ellis'); await p.key('Enter'); },
	characters: async (p) => { await clickIn(p, inPane('characters', '.multi-select-input')); await p.type('Jonas'); await p.key('Enter'); await p.key('Escape'); },
	beats: async (p) => { await clickIn(p, inPane('beats')); await toEnd(p); await p.type('4'); await p.key('Enter'); },
	finished: async (p) => { await clickIn(p, inPane('finished', 'input[type="checkbox"]')); },
	day: async (p) => { await setField(p, inPane('day'), '2026-05-06'); },
	moment: async (p) => { await setField(p, inPane('moment'), '2026-05-06T07:45'); },
	tags: async (p) => { await clickIn(p, inPane('tags', '.multi-select-input')); await p.type('night'); await p.key('Enter'); await p.key('Escape'); },
};
const WANT = { pov: 'Mara Ellis', characters: ['[[Mara]]', 'The master', 'Jonas'], beats: 34, finished: true, day: '2026-05-06', tags: ['draft', 'night'] };

test('rows: each type is edited with Obsidian’s own editor and written to the note as that type, and the text is untouched', async (p, h, t) => {
	const { body } = await typed(p);
	await open(p);
	await clickCard(p, ARRIVAL);
	t.eq((await rowKeys(p)).join(), KEYS.join(), 'seven rows');
	const types = await p.ev(`[...document.querySelectorAll(${j(I + ' .binders-pinned')})].map(r => r.dataset.propertyType).join()`);
	t.eq(types, 'text,multitext,number,checkbox,date,datetime,tags', 'each of its type');
	t.ok(await p.ev(`!!document.querySelector(${j(I + ' [data-field="prop:characters"] .multi-select-container')})`), 'a list is Obsidian’s own list');
	for (const k of KEYS) {
		await EDITS[k](p);
		await p.sleep(500);
	}
	const f = await fmOf(p, ARRIVAL);
	for (const [k, v] of Object.entries(WANT)) t.eq(JSON.stringify(f[k]), JSON.stringify(v), `${k} as its type`);
	t.ok(String(f.moment).startsWith('2026-05-06T07:45'), 'a date and time: ' + f.moment);
	const now = await read(p, ARRIVAL);
	t.eq(split2(now).body, body, 'the note’s text is byte for byte what it was');
	t.ok(/^status: revised$/m.test(now) && /^synopsis: Mara arrives\.$/m.test(now), 'and the properties that were not touched');
	// clearing a value takes the property away (Obsidian offers the values in use under an empty field, and Enter would
	// take the first: Escape closes them, and the field is left)
	await clickIn(p, inPane('pov'));
	await p.ev(`document.execCommand('selectAll')`);
	await p.key('Backspace');
	await p.key('Escape');
	await p.ev(`document.activeElement.blur()`);
	await until(p, `!('pov' in (app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter ?? {}))`);
	t.ok(!/^pov:/m.test(await read(p, ARRIVAL)), 'a value cleared is a property taken away');
	t.eq(split2(await read(p, ARRIVAL)).body, body, 'the text again');
});

test('rows: without Obsidian’s editors, Binders’ own fields edit each type and write it as that type', async (p, h, t) => {
	const { body } = await typed(p);
	await p.ev(`(() => { window.__ipReal ??= app.metadataTypeManager; app.metadataTypeManager = Object.create(window.__ipReal, { getTypeInfo: { value: undefined } }); return 1; })()`);
	try {
		await open(p);
		await clickCard(p, ARRIVAL);
		t.eq((await rowKeys(p)).join(), KEYS.join(), 'seven rows');
		t.ok(await p.ev(`!!document.querySelector(${j(I + ' [data-field="prop:pov"] input.metadata-input-text')})`), 'Binders’ own fields are drawn');
		for (const k of ['pov', 'characters', 'beats', 'finished', 'day', 'tags']) {
			await EDITS[k](p);
			await p.sleep(500);
		}
		const f = await fmOf(p, ARRIVAL);
		for (const [k, v] of Object.entries(WANT)) t.eq(JSON.stringify(f[k]), JSON.stringify(v), `${k} as its type`);
		t.eq(split2(await read(p, ARRIVAL)).body, body, 'the text is untouched');
	} finally { await p.ev(`(() => { app.metadataTypeManager = window.__ipReal; return 1; })()`); }
});

test('rows: a note that starts with a byte-order mark, and one with CRLF line breaks, keep both, and their text', async (p, h, t) => {
	for (const [bom, eol] of [[true, '\n'], [false, '\r\n'], [true, '\r\n']]) {
		const { body } = await typed(p, { bom, eol });
		await open(p);
		await clickCard(p, ARRIVAL);
		await EDITS.pov(p);
		await EDITS.characters(p);
		await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then(s => s.includes('Jonas'))`);
		const now = await read(p, ARRIVAL), label = `${bom ? 'BOM ' : ''}${eol === '\r\n' ? 'CRLF' : 'LF'}`;
		t.eq(now.startsWith(BOM), bom, `${label}: the mark is as it was`);
		t.eq(split2(now).body, body, `${label}: the text is byte for byte what it was`);
		if (eol === '\r\n') t.ok(!/[^\r]\n/.test(now.replace(BOM, '')), `${label}: every line break is still CRLF`);
		else t.ok(!now.includes('\r'), `${label}: no CR crept in`);
		t.ok(/pov: Mara Ellis/.test(now) && now.includes('Jonas'), `${label}: and the values are written`);
		t.eq((await fmOf(p, ARRIVAL)).pov, 'Mara Ellis', `${label}: Obsidian reads it`);
		await p.ev(`app.workspace.detachLeavesOfType('binders-view')`);
	}
});

test('rows: with the cursor in a scene of the manuscript and typing not yet saved, an edit of each type in the pane leaves the text, the caret, the selection and the scroll as they were', async (p, h, t) => {
	const { body } = await typed(p);
	await open(p, 'manuscript');
	await p.ev(`(() => { const v = ${VIEW}; app.workspace.setActiveLeaf(v.leaf, { focus: true }); v.revealItem(app.vault.getAbstractFileByPath(${j(ARRIVAL)})); return 1; })()`);
	await until(p, `!!${M}?.scenes?.find(s => s.file.path === ${j(ARRIVAL)} && s.live?.cm)`, 5000);
	// the caret in the middle of a line, a word selected, and some typing the editor has not saved yet
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === ${j(ARRIVAL)}), cm = s.live.cm; cm.focus(); const at = cm.state.doc.toString().indexOf('jetty'); cm.dispatch({ selection: { anchor: at, head: at + 5 } }); return 1; })()`);
	await p.type(' pier');
	const state = () => p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === ${j(ARRIVAL)}), cm = s.live.cm, sel = cm.state.selection.main; const doc = cm.state.doc.toString(), b = doc.indexOf('\\n---\\n', 3) + 5; return { doc: doc.slice(b), anchor: sel.anchor - b, head: sel.head - b, scroll: document.querySelector('.binders-manuscript')?.scrollTop ?? null, inner: cm.scrollDOM.scrollTop }; })()`);
	const was = await state();
	t.ok(was.doc.includes('pier') && !was.doc.includes('jetty.'), 'typed over the selection: ' + was.doc.slice(0, 80));
	// (the editor shows the whole note: the properties above the text change as they are edited, and the caret with them,
	// so what is compared is the text and the caret's place in it)
	for (const k of KEYS) {
		await EDITS[k](p);
		await p.sleep(400);
		const now = await state();
		t.eq(now.doc, was.doc, `${k}: the typed text is in the editor as it was`);
		t.eq(`${now.anchor}-${now.head}`, `${was.anchor}-${was.head}`, `${k}: the caret and selection`);
		t.eq(now.scroll, was.scroll, `${k}: the page has not scrolled`);
		t.eq(now.inner, was.inner, `${k}: nor the editor`);
	}
	// what was typed reaches the disk, with the values
	await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then(s => s.includes('pier'))`, 6000);
	const text = await read(p, ARRIVAL);
	t.eq(split2(text).body, body.replace('jetty', ' pier'), 'the typed text reached the disk, and the rest of the text is as it was');
	const f = await fmOf(p, ARRIVAL);
	t.eq(f.pov, 'Mara Ellis', 'the values were written');
	t.eq(f.beats, 34, 'all of them');
});

test('rows: an edit made in the note’s own Properties, in the outliner, and from outside shows in the pane at once, and the other way round', async (p, h, t) => {
	await typed(p);
	// the outliner’s column
	await open(p);
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'prop:pov' }] } }; v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-outliner-row')`);
	await p.sleep(300);
	const O = '.binders-view .binders-outliner';
	const cell = (path) => `${O} .binders-outliner-row[data-path=${j(path)}] [data-col="prop:pov"]`;
	await p.ev(`(() => { const r = document.querySelector('.binders-outliner-row[data-path=${j(ARRIVAL)}] .binders-outliner-name'); r?.scrollIntoView({ block: 'center' }); return 1; })()`);
	const n = await p.at(`${O} .binders-outliner-row[data-path=${j(ARRIVAL)}] .binders-outliner-name`);
	await p.click(n.x, n.y);
	await p.sleep(400);
	const pov = () => p.ev(`document.querySelector(${j(I + ' [data-field="prop:pov"] input, ' + I + ' [data-field="prop:pov"] [contenteditable]')})?.value ?? document.querySelector(${j(I + ' [data-field="prop:pov"]')})?.textContent ?? null`);
	t.eq(await pov(), 'Mara', 'the pane has the value');
	const c = await p.at(cell(ARRIVAL));
	await p.click(c.x, c.y);
	await until(p, `document.activeElement?.matches('.binders-outliner-row [data-col="prop:pov"] input')`);
	await p.ev(`document.activeElement.select()`);
	await p.type('Harrow');
	await p.key('Enter');
	await until(p, `document.querySelector(${j(I + ' [data-field="prop:pov"]')})?.textContent === 'Harrow' || document.querySelector(${j(I + ' [data-field="prop:pov"] input')})?.value === 'Harrow'`, 4000);
	t.eq(await pov(), 'Harrow', 'an edit in the outliner’s column shows in the pane');
	// from outside the app
	await writeRaw(p, ARRIVAL, (await read(p, ARRIVAL)).replace('pov: Harrow', 'pov: Outside'));
	await until(p, `document.querySelector(${j(I + ' [data-field="prop:pov"] input')})?.value === 'Outside'`, 4000);
	t.eq(await pov(), 'Outside', 'an edit from outside shows in the pane');
	// the other way: a pane edit shows in the outliner
	await EDITS.pov(p);
	await until(p, `document.querySelector(${j(cell(ARRIVAL))})?.textContent === 'Outside Ellis'`, 4000);
	t.eq(await p.ev(`document.querySelector(${j(cell(ARRIVAL))})?.textContent`), 'Outside Ellis', 'an edit in the pane shows in the outliner’s column');
	// the note’s own Properties
	await p.ev(`(async () => { await app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${j(ARRIVAL)})); })().then(() => 1)`);
	const props = '.workspace-leaf.mod-active .metadata-property[data-property-key="pov"] .metadata-property-value';
	await until(p, `!!document.querySelector(${j(props)})`, 5000);
	t.eq(await p.ev(`document.querySelector(${j(props + ' input')})?.value ?? document.querySelector(${j(props)})?.textContent`), 'Outside Ellis', 'an edit in the pane shows in the note’s own Properties');
	const at = await p.at(props + ' input, ' + props + ' [contenteditable]');
	await p.click(at.x, at.y);
	await p.ev(`document.execCommand('selectAll')`);
	await p.type('Typed there');
	await p.key('Enter');
	await p.sleep(600);
	t.eq((await fmOf(p, ARRIVAL)).pov, 'Typed there', 'an edit in Properties is written');
	// the tab is the writer's now, and it is a note outside the binder view: the inspector follows the scene
	await until(p, `document.querySelector(${j(I + ' [data-field="prop:pov"] input')})?.value === 'Typed there'`, 4000);
	t.eq(await pov(), 'Typed there', 'an edit in Properties shows in the pane');
});

test('rows: undo and redo from the toolbar take back and make again an edit of the pane, and only the property', async (p, h, t) => {
	const { body } = await typed(p);
	await open(p);
	await clickCard(p, ARRIVAL);
	const before = await read(p, ARRIVAL);
	await EDITS.pov(p);
	await EDITS.beats(p);
	await EDITS.finished(p);
	await p.sleep(600);
	t.eq((await fmOf(p, ARRIVAL)).beats, 34, 'edited');
	const press = async (cls) => { const at = await p.at(`.binders-view ${cls}`); await p.click(at.x, at.y); await p.sleep(700); };
	await press('.binders-undo-button');
	t.eq((await fmOf(p, ARRIVAL)).finished, false, 'undo takes the last edit back');
	t.eq((await fmOf(p, ARRIVAL)).beats, 34, 'and only that one');
	await press('.binders-undo-button');
	await press('.binders-undo-button');
	t.eq((await fmOf(p, ARRIVAL)).pov, 'Mara', 'three undos: the first edit too');
	t.eq(lf(await read(p, ARRIVAL)), lf(before), 'the note is as it was, byte for byte');
	await press('.binders-redo-button');
	await press('.binders-redo-button');
	await press('.binders-redo-button');
	const f = await fmOf(p, ARRIVAL);
	t.ok(f.pov === 'Mara Ellis' && f.beats === 34 && f.finished === true, 'redo makes them again');
	t.eq(split2(await read(p, ARRIVAL)).body, body, 'the text is the same all through');
});

test('rows: a row being edited is not drawn over; what changed meanwhile is drawn when the keyboard leaves it', async (p, h, t) => {
	await typed(p);
	await open(p);
	await clickCard(p, ARRIVAL);
	await clickIn(p, inPane('pov'));
	await toEnd(p);
	await p.type(' Ell');
	// another property of the same note changes from outside while the writer is typing
	await writeRaw(p, ARRIVAL, (await read(p, ARRIVAL)).replace('beats: 3', 'beats: 9'));
	await p.sleep(800);
	const shown = (key) => p.ev(`(() => { const e = document.querySelector(${j(inPane(key))}); return e ? (e.value ?? e.textContent) : null; })()`);
	t.eq(await shown('pov'), 'Mara Ell', 'what is being typed is still there');
	t.ok(await p.ev(`document.activeElement === document.querySelector(${j(inPane('pov'))})`), 'with the keyboard in it');
	t.eq(await shown('beats'), '3', 'the other rows wait');
	await p.type('is');
	await p.key('Enter');
	await until(p, `document.querySelector(${j(inPane('beats'))})?.value === '9'`, 4000);
	t.eq(await shown('beats'), '9', 'and are drawn when it leaves');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.pov === 'Mara Ellis'`, 4000);
	t.eq((await fmOf(p, ARRIVAL)).pov, 'Mara Ellis', 'what was typed is in the note');
	// the pane turns to another item with a field open: what was typed goes to the note it was typed for
	await clickIn(p, inPane('pov'));
	await toEnd(p);
	await p.type('!');
	await clickCard(p, KEEPER);
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === 'The keeper'`, 4000);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.pov === 'Mara Ellis!'`, 4000);
	t.eq((await fmOf(p, ARRIVAL)).pov, 'Mara Ellis!', 'the first note has what was typed');
	t.ok(!(await fmOf(p, KEEPER)).pov, 'and the second has none of it');
});


// ---- several notes at once ----

const undos = (p) => p.ev(`app.plugins.plugins.binders.binders.undos.length`);
const shownValue = (p, key) => p.ev(`(() => { const e = document.querySelector(${j(inPane(key))}); return e ? (e.value ?? e.textContent) : null; })()`);
const items = (p, key) => p.ev(`[...document.querySelectorAll(${j(I + ` [data-field="prop:${key}"] .multi-select-pill-content, ` + I + ` [data-field="prop:${key}"] .multi-select-item-content`)})].map(e => e.textContent)`);
const onSome = (p, key) => p.ev(`document.querySelector(${j(I + ` [data-field="prop:${key}"] .binders-pinned-some`)})?.textContent ?? null`);
const listOn = async (p, path, key) => (await fmOf(p, path))[key];
/** Three scenes whose lists overlap, and the binder pinning the properties; Arrival and The keeper in hand. */
async function several(p, { two = false } = {}) {
	const w = (path, yaml, body) => writeRaw(p, path, `---\n${yaml}---\n${body}`);
	await w(ARRIVAL, 'pov: Mara\ncharacters:\n  - "[[Mara]]"\n  - The master\nbeats: 3\nfinished: false\nday: 2026-03-04\n', 'The supply boat left Mara on the jetty.\n');
	await w(KEEPER, 'pov: Harrow\ncharacters:\n  - Mara\n  - "[[Harrow]]"\n  - The master\nbeats: 3\nfinished: true\nday: 2026-03-04\n', 'The keeper did not look up.\n');
	await w(STORM, 'characters:\n  - "[[Mara]]"\n', 'A storm warning came over the radio.\n');
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace(/inspector:\n(  - .*\n)+/, '').replace('plotlines:', `inspector:\n${['pov', 'characters', 'beats', 'finished', 'day'].map((k) => `  - ${k}`).join('\n')}\nplotlines:`));
	await p.sleep(500);
	await open(p);
	await clickCard(p, ARRIVAL);
	await clickCard(p, KEEPER, { modifiers: 2 });
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === '2 notes selected'`, 4000);
}

test('several: a list shows what they all share and how many more some have; other types show what they agree on, or Mixed', async (p, h, t) => {
	await several(p);
	t.eq((await items(p, 'characters')).join(), 'Mara,The master', 'what all share (Mara and [[Mara]] are one name)');
	t.eq(await onSome(p, 'characters'), '1 more on some', 'and one more on some');
	t.eq(await shownValue(p, 'beats'), '3', 'a number they agree on');
	t.eq(await shownValue(p, 'pov'), '', 'a text they do not agree on is empty…');
	t.eq(await p.ev(`document.querySelector(${j(inPane('pov'))})?.getAttribute('placeholder')`), 'Mixed', '…and says Mixed');
	const box = await p.ev(`(() => { const b = document.querySelector(${j(I + ' [data-field="prop:finished"] input[type="checkbox"]')}); return b && { indeterminate: b.indeterminate, attr: b.getAttribute('data-indeterminate') }; })()`);
	t.ok(box && box.indeterminate && box.attr === 'true', 'a box they do not agree on is a mixed box: ' + JSON.stringify(box));
	t.ok(await p.ev(`!!document.querySelector(${j(I + ' [data-field="prop:day"] input')})`), 'a date they agree on has its field');
});

test('several: adding adds to all, the × takes from all, what only some have stays in each note’s own order, and it is one undo step', async (p, h, t) => {
	await several(p);
	const before = { a: await read(p, ARRIVAL), k: await read(p, KEEPER) }, n0 = await undos(p);
	await clickIn(p, inPane('characters', '.multi-select-input'));
	await p.type('Ines');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(KEEPER)}))?.frontmatter?.characters?.includes('Ines')`, 4000);
	t.eq(JSON.stringify(await listOn(p, ARRIVAL, 'characters')), JSON.stringify(['[[Mara]]', 'The master', 'Ines']), 'added to the first');
	t.eq(JSON.stringify(await listOn(p, KEEPER, 'characters')), JSON.stringify(['Mara', '[[Harrow]]', 'The master', 'Ines']), 'and to the second, after what is only its own');
	t.eq(await undos(p), n0 + 1, 'one step of the history for both notes');
	t.eq(await onSome(p, 'characters'), '1 more on some', 'the count is as it was');
	// the × on The master: from both
	await p.ev(`(() => { const r = [...document.querySelectorAll(${j(I + ' [data-field="prop:characters"] .multi-select-pill')})].find(e => e.textContent.includes('The master')); r.querySelector('.multi-select-pill-remove-button').click(); return 1; })()`);
	await until(p, `!app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(KEEPER)}))?.frontmatter?.characters?.includes('The master')`, 4000);
	t.eq(JSON.stringify(await listOn(p, ARRIVAL, 'characters')), JSON.stringify(['[[Mara]]', 'Ines']), 'taken from the first');
	t.eq(JSON.stringify(await listOn(p, KEEPER, 'characters')), JSON.stringify(['Mara', '[[Harrow]]', 'Ines']), 'and the second; what only it has stays');
	// undo twice: the notes are as they were
	for (let i = 0; i < 2; i++) { const at = await p.at('.binders-view .binders-undo-button'); await p.click(at.x, at.y); await p.sleep(700); }
	t.eq(lf(await read(p, ARRIVAL)), lf(before.a), 'undone: the first note is as it was');
	t.eq(lf(await read(p, KEEPER)), lf(before.k), 'and the second');
});

test('several: “1 more on some” has a menu for each item, to give it to all or take it from the ones that have it; its count is right while the keyboard stays in the row', async (p, h, t) => {
	await several(p);
	await clickIn(p, I + ' [data-field="prop:characters"] .binders-pinned-some');
	await until(p, `!!document.querySelector('.menu .menu-item')`);
	t.ok(/^Harrow/.test((await menuItems(p)).join()), 'the item that only some have: ' + (await menuItems(p)).join());
	t.ok(/1 of 2/.test(await p.ev(`document.querySelector('.menu')?.innerText ?? ''`)), 'and in how many');
	const at = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title').textContent.startsWith('Harrow')); const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await p.move(at.x, at.y, 3);
	await p.click(at.x, at.y);
	await p.sleep(300);
	t.eq((await menuItems(p)).slice(-2).join('|'), 'Add to all 2|Remove from the 1 that has it', 'its two choices');
	await clickMenu(p, 'Add to all 2');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.characters?.includes('Harrow')`, 4000);
	t.eq(JSON.stringify(await listOn(p, ARRIVAL, 'characters')), JSON.stringify(['[[Mara]]', 'The master', '[[Harrow]]']), 'given to the first note, as the other note spells it');
	t.eq(JSON.stringify(await listOn(p, KEEPER, 'characters')), JSON.stringify(['Mara', '[[Harrow]]', 'The master']), 'the second has it already: untouched');
	t.eq(await onSome(p, 'characters'), null, 'nothing is on some any more, with no redraw needed');
	// the keyboard stays in the row: a name typed that one note has already, then taken from all
	await clickIn(p, inPane('characters', '.multi-select-input'));
	await p.type('Jonas');
	await p.key('Enter');
	await p.sleep(500);
	t.ok(await p.ev(`document.activeElement?.closest(${j(I + ' [data-field="prop:characters"]')}) !== null`), 'the keyboard is still in the row');
	t.eq(await onSome(p, 'characters'), null, 'a name given to both is not on some');
});

test('several: the count of what only some have is right while the keyboard stays in the row', async (p, h, t) => {
	await several(p);
	t.eq(await onSome(p, 'characters'), '1 more on some', 'one on some');
	await writeRaw(p, STORM, (await read(p, STORM)).replace('---\n', '---\npov: x\n'));
	await clickIn(p, inPane('characters', '.multi-select-input'));
	await p.type('Harrow');
	await p.key('Enter');
	await p.sleep(600);
	t.ok(await p.ev(`document.activeElement?.closest(${j(I + ' [data-field="prop:characters"]')}) !== null`), 'the keyboard is still in the row');
	t.eq(await onSome(p, 'characters'), null, 'Harrow is on both now: nothing is on some, said at once');
	await p.type('Zed');
	await p.key('Enter');
	await p.sleep(500);
	t.eq(await onSome(p, 'characters'), null, 'and it stays right after another');
	// (Enter takes the value Obsidian offers under the field: Harrow as the other note spells it, a link)
	const mine = await listOn(p, ARRIVAL, 'characters'), his = await listOn(p, KEEPER, 'characters');
	t.ok(/Harrow/.test(mine.at(-2)) && mine.at(-1) === 'Zed' && his.at(-1) === 'Zed', 'both written: ' + JSON.stringify([mine, his]));
});

test('several: Mixed types are set on all when edited, and a mixed box is set to ticked, one undo step each', async (p, h, t) => {
	await several(p);
	const a0 = lf(await read(p, ARRIVAL)), n0 = await undos(p);
	await clickIn(p, inPane('pov'));
	await p.type('Ellis');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(KEEPER)}))?.frontmatter?.pov === 'Ellis'`, 4000);
	t.eq((await fmOf(p, ARRIVAL)).pov, 'Ellis', 'a text typed in a Mixed field is every note’s');
	t.eq(await undos(p), n0 + 1, 'one step');
	await clickIn(p, inPane('finished', 'input[type="checkbox"]'));
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.finished === true`, 4000);
	t.eq((await fmOf(p, KEEPER)).finished, true, 'a mixed box ticked ticks all');
	t.eq(await undos(p), n0 + 2, 'another step');
	// a Mixed field that is gone into and left says nothing
	await clickIn(p, inPane('beats'));
	await p.ev(`document.activeElement.blur()`);
	t.eq(await undos(p), n0 + 2, 'nothing was written');
	t.eq(split2(await read(p, ARRIVAL)).body, split2(a0).body, 'the text is as it was');
});

test('several: links to two different notes both named Mara are two people, and Mara and [[Mara]] are one', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('People'); await app.vault.createFolder('Places'); })().then(() => 1)`);
	await writeRaw(p, 'People/Mara.md', 'The newcomer.\n');
	await writeRaw(p, 'Places/Mara.md', 'A headland.\n');
	await several(p);
	await writeRaw(p, ARRIVAL, `---\ncharacters:\n  - "[[People/Mara]]"\n  - Harrow\nbeats: 3\n---\nText.\n`);
	await writeRaw(p, KEEPER, `---\ncharacters:\n  - "[[Places/Mara]]"\n  - "[[Harrow]]"\nbeats: 3\n---\nText.\n`);
	await p.sleep(800);
	await clickCard(p, STORM);
	await clickCard(p, ARRIVAL);
	await clickCard(p, KEEPER, { modifiers: 2 });
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === '2 notes selected'`, 4000);
	await p.sleep(400);
	t.eq((await items(p, 'characters')).join(), 'Harrow', 'only Harrow is shared: a plain name and a link to it are one');
	t.eq(await onSome(p, 'characters'), '2 more on some', 'the two Maras are two');
});

test('folder and binder: the pinned rows show a folder’s own note’s values, and a folder note is made only by a first value', async (p, h, t) => {
	await several(p);
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(500);
	const at = await p.at(`.binders-view .binders-card[data-path="The Lighthouse/Part One"] .binders-card-footer`);
	await p.click(at.x, at.y);
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === 'Part One'`, 4000);
	t.eq(await rowCount(p), 5, 'rows for a folder too');
	const note = 'The Lighthouse/Part One/Part One.md';
	// gone into and left: nothing is made
	await clickIn(p, inPane('pov'));
	await p.ev(`document.activeElement.blur()`);
	await p.sleep(400);
	t.ok(!(await p.ev(`!!app.vault.getAbstractFileByPath(${j(note)})`)), 'a field left as it was makes no folder note');
	await clickIn(p, inPane('pov'));
	await p.type('The island');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(note)})`, 4000);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(note)}))?.frontmatter?.pov === 'The island'`, 4000);
	t.eq((await fmOf(p, note)).pov, 'The island', 'a first value makes the folder note, with the value');
	t.eq(JSON.stringify(await rowKeys(p)), JSON.stringify(['pov', 'characters', 'beats', 'finished', 'day']), 'the rows stay');
	// the binder itself: its own note open in a tab stands for it
	await p.ev(`(async () => { await app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${j(NOTE)})); })().then(() => 1)`);
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === 'The Lighthouse'`, 4000);
	t.eq(await rowCount(p), 5, 'rows for the binder');
	const was = lf(await read(p, NOTE));
	await clickIn(p, inPane('pov'));
	await p.type('Whole book');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(NOTE)}))?.frontmatter?.pov === 'Whole book'`, 4000);
	const now = lf(await read(p, NOTE));
	t.ok(/^pov: Whole book$/m.test(now) && now.replace(/^pov: Whole book\n/m, '') === was, 'the binder note has the value and is otherwise as it was');
});

// ---- the pane's own “Include in export” box with several notes ----

test('include in export: a mixed selection shows a box Obsidian’s stylesheet draws as mixed', async (p, h, t) => {
	await writeRaw(p, KEEPER, (await read(p, KEEPER)).replace(/^---\n/, '---\nexport: false\n'));
	await p.sleep(400);
	await open(p);
	await clickCard(p, ARRIVAL);
	await clickCard(p, KEEPER, { modifiers: 2 });
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === '2 notes selected'`, 4000);
	const box = await p.ev(`(() => { const b = document.querySelector(${j(fieldSel('export'))}); return b && { indeterminate: b.indeterminate, attr: b.getAttribute('data-indeterminate'), checked: b.checked }; })()`);
	t.ok(box && box.indeterminate === true, 'the box is indeterminate for the browser: ' + JSON.stringify(box));
	t.eq(box?.attr, 'true', 'and for Obsidian’s stylesheet, which draws data-indeterminate');
	// a note set the same: not mixed
	await clickCard(p, ARRIVAL);
	t.eq(await p.ev(`document.querySelector(${j(fieldSel('export'))}).getAttribute('data-indeterminate')`), null, 'one note: not mixed');
});


// ---- links ----

const C = '.workspace-leaf-content[data-type="binders-contents"] .binders-contents-book';
const nameOf = (p) => p.ev(`document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent ?? document.querySelector(${j(I + ' .pane-empty')})?.textContent ?? null`);
const bookOf = (p) => p.ev(`document.querySelector(${j(C)})?.textContent ?? null`);
const mdLeaves = (p) => p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.file?.path)`);
/** The inspector and the contents, both in the right sidebar. */
async function both(p) {
	await p.ev(`(async () => {
		const ws = app.workspace;
		for (const t of ['binders-inspector', 'binders-contents']) ws.detachLeavesOfType(t);
		const a = ws.getRightLeaf(false); await a.setViewState({ type: 'binders-contents', active: true });
		const b = ws.getRightLeaf(true); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b);
		const main = ws.getMostRecentLeaf(ws.rootSplit); if (main) ws.setActiveLeaf(main, { focus: true });
	})().then(() => 1)`);
	await p.sleep(500);
}
async function linked(p) {
	const w = (path, yaml, body) => writeRaw(p, path, `---\n${yaml}---\n${body}`);
	await writeRaw(p, 'Mara.md', '---\nrole: the newcomer\n---\nMara Ellis, who came on the supply boat.\n');
	await writeRaw(p, 'Harrow.md', 'Harrow keeps the light.\n');
	await w(ARRIVAL, 'pov: "[[Mara]]"\ncharacters:\n  - "[[Mara]]"\n  - "[[Harrow]]"\n  - The master\n', 'The supply boat left Mara on the jetty.\n');
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace(/inspector:\n(  - .*\n)+/, '').replace('plotlines:', 'inspector:\n  - pov\n  - characters\nplotlines:'));
	await p.sleep(600);
	await open(p);
	await both(p);
	await clickCard(p, ARRIVAL);
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === 'Arrival'`, 4000);
}
const link = (key, i = 0) => `${I} [data-field="prop:${key}"] .internal-link:nth-of-type(${i + 1})`;

test('links: a plain click opens the note beside the writing, in the same pane each time; a modifier is Obsidian’s', async (p, h, t) => {
	await linked(p);
	t.eq((await mdLeaves(p)).length, 0, 'no note is open');
	let at = await p.at(`${I} [data-field="prop:pov"] .internal-link`);
	await p.click(at.x, at.y);
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 1`, 4000);
	t.eq(JSON.stringify(await mdLeaves(p)), JSON.stringify(['Mara.md']), 'the note opened');
	t.ok(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].getRoot() === app.workspace.rootSplit`), 'in the main area, beside the binder view');
	t.ok(await p.ev(`app.workspace.getLeavesOfType('binders-view').length === 1`), 'the binder view is still there');
	at = await p.at(`${I} [data-field="prop:characters"] .internal-link`, 1);
	await p.click(at.x, at.y);
	await until(p, `app.workspace.getLeavesOfType('markdown')[0]?.view.file?.path === 'Harrow.md'`, 4000);
	t.eq(JSON.stringify(await mdLeaves(p)), JSON.stringify(['Harrow.md']), 'the next link opened in the same pane');
	// Mod-click: Obsidian’s own, a new tab
	at = await p.at(`${I} [data-field="prop:pov"] .internal-link`);
	await p.click(at.x, at.y, { modifiers: 2 });
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 2`, 4000);
	t.eq((await mdLeaves(p)).sort().join(), 'Harrow.md,Mara.md', 'a mod-click opens another tab and leaves the side pane alone');
});

test('links: the inspector and the contents stay on the scene while a note outside any binder is read; a note of another binder takes them', async (p, h, t) => {
	await linked(p);
	t.eq(await bookOf(p), 'The Lighthouse', 'the contents are on the book');
	const at = await p.at(`${I} [data-field="prop:pov"] .internal-link`);
	await p.click(at.x, at.y);
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 1`, 4000);
	// the writer goes into the note beside
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown')[0]; app.workspace.setActiveLeaf(l, { focus: true }); return 1; })()`);
	await p.sleep(800);
	t.eq(await nameOf(p), 'Arrival', 'the inspector is still on the scene');
	t.eq(await bookOf(p), 'The Lighthouse', 'and the contents on the book');
	t.ok(await p.ev(`app.workspace.getMostRecentLeaf()?.view.file?.path === 'Mara.md'`), 'with the note beside the one in use');
	// a note of another binder takes both
	await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('markdown')[0]; await l.openFile(app.vault.getAbstractFileByPath('Longform demo/Harbor.md')); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `document.querySelector(${j(C)})?.textContent === 'Longform demo'`, 4000);
	t.eq(await bookOf(p), 'Longform demo', 'a note of another binder takes the contents');
	t.eq(await nameOf(p), 'Harbor', 'and the inspector');
});

test('links: the tab the panes follow moving on to a note of no binder lets go of the scene', async (p, h, t) => {
	await linked(p);
	await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('binders-view')[0]; await l.setViewState({ type: 'markdown', state: { file: 'Mara.md' }, active: true }); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `document.querySelector(${j(I + ' .pane-empty')})?.textContent === 'This note isn’t in a binder.'`, 4000);
	t.eq(await nameOf(p), 'This note isn’t in a binder.', 'in the tab itself the writer has left the book: the inspector says so');
});

test('links: a note renamed, the links to it in a list and in a text follow when Obsidian updates links, and the rows show the new name', async (p, h, t) => {
	await linked(p);
	await p.ev(`app.vault.setConfig('alwaysUpdateLinks', true)`);
	await p.ev(`(() => { const f = app.vault.getAbstractFileByPath('Mara.md'); void app.fileManager.renameFile(f, 'Mara Ellis.md'); return 1; })()`);
	await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then(s => s.includes('Mara Ellis'))`, 5000);
	const on = lf(await read(p, ARRIVAL));
	t.ok(/pov: "?\[\[Mara Ellis(\|Mara)?\]\]"?/.test(on), 'the text property: ' + on.split('\n').slice(1, 3).join(' / '));
	t.ok(/- "?\[\[Mara Ellis(\|Mara)?\]\]"?/.test(on), 'the list item');
	t.ok(/The master/.test(on) && /Harrow/.test(on), 'the rest of the list');
	await until(p, `document.querySelector(${j(I + ' [data-field="prop:pov"] .internal-link')})?.getAttribute('data-href')?.includes('Mara Ellis')`, 4000);
	t.ok(await p.ev(`document.querySelector(${j(I + ' [data-field="prop:pov"] .internal-link')})?.getAttribute('data-href')?.includes('Mara Ellis')`), 'the row follows');
	// off: the links are left, and the rows still show them
	await p.ev(`app.vault.setConfig('alwaysUpdateLinks', false)`);
	await p.ev(`(() => { const f = app.vault.getAbstractFileByPath('Harrow.md'); void app.fileManager.renameFile(f, 'Harrow Vane.md'); return 1; })()`);
	await until(p, `[...document.querySelectorAll('.modal')].some(m => /Update links/.test(m.innerText))`, 8000);
	t.ok(await answer(p, 'Do not update'), 'Obsidian asked, and it was told not to');
	await p.sleep(1000);
	const off = lf(await read(p, ARRIVAL));
	t.ok(/\[\[Harrow\]\]/.test(off), 'with Obsidian not updating links, the link is as it was: ' + off.split('\n').slice(3, 6).join(' / '));
	t.ok(await p.ev(`[...document.querySelectorAll(${j(I + ' [data-field="prop:characters"] .internal-link')})].some(e => e.textContent === 'Harrow')`), 'and the row shows it');
});


// ---- the outliner's property cells ----

const OL = '.binders-view .binders-outliner';
const cellSel = (path, col) => `${OL} .binders-outliner-row[data-path=${j(path)}] [data-col="${col}"]`;
async function outliner(p, cols) {
	await open(p);
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: ${j(cols.map((c) => ({ id: 'prop:' + c })))} } }; v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-outliner-row')`);
	await p.sleep(400);
}
async function selectRow(p, path) {
	const n = await p.at(`${OL} .binders-outliner-row[data-path=${j(path)}] .binders-outliner-name`);
	await p.click(n.x, n.y);
	await p.sleep(250);
}
/** Types into a cell of a selected row, and presses Enter. */
async function typeCell(p, path, col, text, right = false) {
	await selectRow(p, path);
	const c = await p.at(cellSel(path, col));
	await p.click(right ? c.x + c.w / 2 - 6 : c.x - c.w / 2 + 12, c.y);
	await until(p, `document.activeElement?.matches('.binders-outliner-row [data-col="${col}"] input')`, 3000);
	await p.ev(`document.activeElement.select?.()`).catch(async () => { throw new Error('not a field: ' + await p.ev(`document.activeElement?.outerHTML?.slice(0, 200)`)); });
	await p.type(text);
	await p.key('Enter');
	await p.sleep(500);
}

test('outliner: property cells draw links as links, read typing by the property’s type, and show a box for a checkbox', async (p, h, t) => {
	await writeRaw(p, 'Mara.md', 'Mara Ellis.\n');
	await writeRaw(p, ARRIVAL, '---\npov: "[[Mara]]"\ncharacters:\n  - "[[Mara]]"\n  - The master\nbeats: 3\n---\nThe supply boat left Mara on the jetty.\n');
	await writeRaw(p, KEEPER, '---\nbeats: 5\nfinished: true\n---\nThe keeper did not look up.\n');
	await p.sleep(600);
	const body = split2(await read(p, ARRIVAL)).body;
	await outliner(p, ['pov', 'characters', 'beats', 'finished']);
	// links as links
	t.eq(await p.ev(`document.querySelector(${j(cellSel(ARRIVAL, 'prop:pov') + ' a.internal-link')})?.textContent`), 'Mara', 'a link is drawn as one, by its name');
	t.eq(await p.ev(`document.querySelector(${j(cellSel(ARRIVAL, 'prop:characters'))})?.textContent`), 'Mara, The master', 'a list: the link by its name, the text as it is');
	t.eq(await p.ev(`document.querySelectorAll(${j(cellSel(ARRIVAL, 'prop:characters') + ' a.internal-link')}).length`), 1, 'one of them a link');
	// typing read by type: a word in a number is refused and nothing is written
	await typeCell(p, ARRIVAL, 'prop:beats', 'twelve');
	t.eq((await fmOf(p, ARRIVAL)).beats, 3, 'a word typed in a number leaves the number');
	const said = await p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')].map(n => n.textContent)).join(' | '); })()`);
	t.ok(said.includes('isn’t a number'), 'and says so: ' + said);
	await p.key('Escape');
	await typeCell(p, ARRIVAL, 'prop:beats', '7');
	t.eq((await fmOf(p, ARRIVAL)).beats, 7, 'a number typed is a number');
	// a list typed is a list, even a list of one
	await typeCell(p, ARRIVAL, 'prop:characters', 'Mara, Ines', true);
	t.eq(JSON.stringify((await fmOf(p, ARRIVAL)).characters), JSON.stringify(['Mara', 'Ines']), 'a list is split at commas');
	// a checkbox property: a box even where the note has none yet
	const box = await p.at(cellSel(ARRIVAL, 'prop:finished') + ' input[type="checkbox"]');
	t.ok(!!box, 'a note with no value for a checkbox property has its box');
	await p.click(box.x, box.y);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.finished === true`, 4000);
	t.eq((await fmOf(p, ARRIVAL)).finished, true, 'ticked: true');
	t.eq(split2(await read(p, ARRIVAL)).body, body, 'the note’s text is untouched');
	// (last: the note opens beside, and the outliner is narrower for it)
	const at = await p.at(cellSel(ARRIVAL, 'prop:pov') + ' a.internal-link');
	await p.click(at.x, at.y);
	await until(p, `app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === 'Mara.md')`, 4000);
	await p.sleep(1200);
	t.ok(!(await p.ev(`!!document.activeElement?.matches('.binders-outliner-row input')`)), 'a click on a link opens the note and does not start editing');
});
