// The plot grid (src/view/plotgrid.ts): rows and columns, toggling, keyboard, editing plotlines, dragging, read-only,
// mobile. The binder view shell isn't needed: each test mounts the mode from plugin.modeFactories into an empty tab with
// a ModeContext built here, as the shell does. Every test that writes checks no other text changed.
import { mkdirSync } from 'fs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'plot grid: ' + name, fn });

const pl = `app.plugins.plugins.binders`;
const B = `${pl}.binders`;
const j = (x) => JSON.stringify(x);
const NOTE = 'The Lighthouse/The Lighthouse.md';
const G = `window.__pg`;
const T = '.binders-plotgrid-table';
const SECRET = "The keeper's secret";

/** Mounts the plot grid on a folder, as the binder view would, and wires refresh() to the store and the cache. */
async function mount(p, { folder = 'The Lighthouse', readOnly = false } = {}) {
	await p.ev(`(async () => {
		const plugin = ${pl}, store = plugin.binders, s = plugin.settings;
		await store.ready;
		const leaf = app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: 'empty', active: true });
		const view = leaf.view, host = view.contentEl;
		host.empty();
		host.style.padding = '0';
		const folder = app.vault.getAbstractFileByPath(${j(folder)}), binder = store.binderOf(folder);
		const list = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];
		const str = (v) => (typeof v === 'string' ? v : '');
		const opened = [], navigated = [];
		const ctx = {
			app, plugin, store, binder, folder, owner: view, readOnly: ${readOnly},
			props(f) { const fm = app.metadataCache.getFileCache(f)?.frontmatter ?? {}; return { synopsis: str(fm[s.synopsisProp]), status: str(fm[s.statusProp]), label: str(fm[s.labelProp]), plotlines: list(fm[s.plotlinesProp]) }; },
			async setProps(f, patch) {
				const o = {};
				for (const [k, v] of Object.entries(patch)) o[s[k + 'Prop']] = (Array.isArray(v) ? v.length : v) ? v : undefined;
				await store.setProps(f, o);
			},
			async openFile(f, newLeaf) { opened.push([f.path, !!newLeaf]); },
			navigate(f) { navigated.push(f.path); },
		};
		const mode = plugin.modeFactories.plotgrid(host, ctx);
		mode.render();
		const refs = [[store, store.on('changed', () => mode.refresh())], [app.metadataCache, app.metadataCache.on('changed', (f) => { if (store.binderOf(f) === binder) mode.refresh(); })]];
		window.__pg = { mode, ctx, leaf, refs, opened, navigated };
	})().then(() => 1)`);
	await p.sleep(150);
}
async function unmount(p) {
	await p.ev(`(async () => {
		const g = window.__pg; if (!g) return;
		g.mode.unload(); for (const [src, r] of g.refs) src.offref(r);
		window.__pg = null;
		await ${B}.flush();
		document.querySelectorAll('.menu').forEach((m) => m.remove());
	})().then(() => 1)`);
	await p.sleep(100);
}
const withGrid = (opts, fn) => async (p, h, t) => { await mount(p, opts); try { await fn(p, h, t); } finally { await unmount(p); } };

/** Polls an expression until it's truthy; returns its last value. */
async function until(p, expr, ms = 3000) {
	let v;
	for (let i = 0; i < ms / 50; i++) { v = await p.ev(expr).catch(() => undefined); if (v) return v; await p.sleep(50); }
	return v;
}
const read = (p, path) => p.ev(`app.vault.adapter.read(${j(path)})`);
const texts = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
function split(text) {
	const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
	return m ? { yaml: m[1], body: m[2] } : { yaml: '', body: text };
}
/** A YAML list property as written on disk (null if it's not there). */
function yamlList(text, key) {
	const lines = split(text).yaml.split('\n'), i = lines.findIndex((l) => l.startsWith(key + ':'));
	if (i < 0) return null;
	const out = [];
	for (const l of lines.slice(i + 1)) { const m = /^\s+- (.*)$/.exec(l); if (!m) break; out.push(m[1].replace(/^(["'])(.*)\1$/, '$2')); }
	return out;
}
const fm = (p, path) => p.ev(`(() => { const f = app.vault.getAbstractFileByPath(${j(path)}); return app.metadataCache.getFileCache(f)?.frontmatter ?? null; })()`);
/** Checks every note is byte-for-byte what it was, except the ones named; for those, the body is. */
function kept(t, before, after, { changed = [], moved = {} } = {}) {
	for (const [path, text] of Object.entries(before)) {
		const now = after[moved[path] ?? path];
		if (changed.includes(path)) t.eq(split(now ?? '').body, split(text).body, `“${path}” keeps its text`);
		else t.eq(now, text, `“${path}” is unchanged`);
	}
}
/** Counts writes per note from now on. */
const countWrites = (p) => p.ev(`(() => { window.__writes = {}; window.__wref && app.vault.offref(window.__wref); window.__wref = app.vault.on('modify', (f) => { window.__writes[f.path] = (window.__writes[f.path] || 0) + 1; }); return 1; })()`);
const writes = (p) => p.ev(`(() => { const w = window.__writes; app.vault.offref(window.__wref); window.__wref = null; return w; })()`);
const settle = (p) => p.ev(`${B}.flush().then(() => new Promise((r) => setTimeout(r, 400))).then(() => 1)`);

/** The grid as shown: each body row's path, kind and ticked plotlines; and the column names. */
const shown = (p) => p.ev(`(() => ({
	cols: [...document.querySelectorAll('${T} .binders-plotgrid-col[data-plotline]')].map((e) => e.dataset.plotline),
	rows: [...document.querySelectorAll('${T} tbody tr')].map((tr) => ({
		path: tr.dataset.path, group: tr.classList.contains('binders-plotgrid-group'), level: +tr.getAttribute('aria-level'),
		on: [...tr.querySelectorAll('.binders-plotgrid-cell.is-on')].map((td) => td.dataset.plotline),
		other: tr.querySelector('.binders-plotgrid-other')?.textContent ?? null,
	})),
}))()`);
const cellSel = (path, name) => `${T} tr[data-path="${path}"] td[data-plotline="${name}"]`;
const headSel = (name) => `${T} th[data-plotline="${name}"]`;
const titleSel = (path) => `${T} tr[data-path="${path}"] .binders-plotgrid-label`;
const rowHeadSel = (path) => `${T} tr[data-path="${path}"] th`;
const gripSel = (path) => `${T} tr[data-path="${path}"] .binders-plotgrid-grip`;
async function clickOn(p, sel) { const a = await p.at(sel); if (!a) throw new Error('not on screen: ' + sel); await p.click(a.x, a.y); await p.sleep(120); }
const focused = (p) => p.ev(`document.activeElement?.dataset?.spot ?? document.activeElement?.tagName`);
const spot = (row, col) => row + '\t' + col;
const HEAD = '\u0001head', TITLE = '\u0001title', ADD = '\u0001add';
/** Clicks the menu item with this text (by position, as a user would). */
async function pick(p, text) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll('.menu .menu-item')].find((e) => e.textContent.trim() === ${j(text)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error('no menu item ' + text);
	await p.click(at.x, at.y);
	await p.sleep(200);
}
const P1 = 'The Lighthouse/Part One', P2 = 'The Lighthouse/Part Two';
const ARRIVAL = `${P1}/Arrival.md`, KEEPER = `${P1}/The keeper.md`, STORM = `${P1}/Storm warning.md`, WRECK = `${P2}/The wreck.md`, LIGHTS = `${P2}/Lights out.md`;
const PROLOGUE = 'The Lighthouse/Prologue.md', EPILOGUE = 'The Lighthouse/Epilogue.md';

test('rows in binder order under their folders, columns from the binder', withGrid({}, async (p, h, t) => {
	const g = await shown(p);
	t.eq(j(g.cols), j(['Mara', SECRET]), 'the binder’s plotlines, in order');
	t.eq(j(g.rows.map((r) => [r.path, r.group, r.level])), j([
		[PROLOGUE, false, 1], [P1, true, 1], [ARRIVAL, false, 2], [KEEPER, false, 2], [STORM, false, 2],
		[P2, true, 1], [WRECK, false, 2], [LIGHTS, false, 2], [EPILOGUE, false, 1],
	]), 'scenes in binder order, grouped under Part One and Part Two, binder note left out');
	t.eq(j(g.rows.filter((r) => !r.group).map((r) => r.on)), j([[SECRET], ['Mara'], ['Mara', SECRET], ['Mara'], ['Mara', SECRET], [SECRET], ['Mara']]), 'ticks match each scene’s plotlines');
	t.eq(await p.ev(`document.querySelector('${T}').getAttribute('role')`), 'grid', 'an ARIA grid');
	t.eq(await p.ev(`document.querySelectorAll('${T} [role=columnheader]').length`), 4, 'column headers: scene, two plotlines, add');
	t.eq(await p.ev(`document.querySelectorAll('${T} [role=rowheader]').length`), 9, 'a row header per row');
	t.eq(await p.ev(`document.querySelectorAll('${T} [aria-selected=true]').length`), 9, 'ticked cells are aria-selected');
	t.eq(await p.ev(`document.querySelectorAll('${T} [tabindex="0"]').length`), 1, 'one tab stop');
	t.eq(await p.ev(`document.querySelector('${T} tr[data-path="${P1}"] th').getAttribute('aria-expanded')`), 'true', 'groups say they are expanded');
}));

test('a subfolder shows only its own scenes', withGrid({ folder: P1 }, async (p, h, t) => {
	const g = await shown(p);
	t.eq(j(g.rows.map((r) => r.path)), j([ARRIVAL, KEEPER, STORM]), 'Part One’s scenes, no groups');
	t.eq(j(g.cols), j(['Mara', SECRET]), 'the binder’s plotlines still');
}));

test('clicking a cell toggles the plotline; only that property changes', withGrid({}, async (p, h, t) => {
	const before = await texts(p);
	await countWrites(p);
	await clickOn(p, cellSel(ARRIVAL, SECRET));
	t.ok(await p.ev(`document.querySelector(${j(cellSel(ARRIVAL, SECRET))}).classList.contains('is-on')`), 'the tick shows at once');
	await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then((x) => x.includes("secret"))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, ARRIVAL), 'plotlines')), j(['Mara', SECRET]), 'added to the scene’s plotlines');
	kept(t, before, await texts(p), { changed: [ARRIVAL] });
	t.eq(split(await read(p, ARRIVAL)).yaml.replace(/plotlines:[\s\S]*$/, ''), split(before[ARRIVAL]).yaml.replace(/plotlines:[\s\S]*$/, ''), 'the other properties are untouched');
	await clickOn(p, cellSel(ARRIVAL, SECRET));
	await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then((x) => !x.includes("secret"))`);
	await settle(p);
	t.eq(await read(p, ARRIVAL), before[ARRIVAL], 'toggled back: the note is byte-for-byte as it was');
	await clickOn(p, cellSel(ARRIVAL, 'Mara'));
	await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then((x) => !x.includes("plotlines"))`);
	await settle(p);
	t.eq(yamlList(await read(p, ARRIVAL), 'plotlines'), null, 'no plotlines left: the property goes');
	t.eq(split(await read(p, ARRIVAL)).body, split(before[ARRIVAL]).body, 'the body is untouched');
	const w = await writes(p);
	t.eq(j(Object.keys(w)), j([ARRIVAL]), 'only that scene was written');
	t.eq(w[ARRIVAL], 3, 'once per click');
	t.eq(j((await shown(p)).rows.find((r) => r.path === ARRIVAL).on), '[]', 'the row shows no ticks');
}));

test('fast toggles in one row all land', withGrid({}, async (p, h, t) => {
	// three clicks without waiting: each must build on the last, not on a cache that hasn't caught up
	await p.ev(`(async () => { await ${B}.setProps(app.vault.getAbstractFileByPath(${j(NOTE)}), { plotlines: ['Mara', ${j(SECRET)}, 'Storm'] }); })().then(() => 1)`);
	await until(p, `document.querySelectorAll('${T} .binders-plotgrid-col[data-plotline]').length === 3`);
	for (const n of ['Mara', SECRET, 'Storm']) { const a = await p.at(cellSel(PROLOGUE, n)); await p.click(a.x, a.y); }
	await until(p, `app.vault.adapter.read(${j(PROLOGUE)}).then((x) => x.includes('Storm'))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, PROLOGUE), 'plotlines')), j(['Mara', 'Storm']), 'Mara added, the secret removed, Storm added');
	t.eq(j((await shown(p)).rows.find((r) => r.path === PROLOGUE).on), j(['Mara', 'Storm']), 'and shown');
}));

test('keyboard: arrows move, Space toggles, Enter opens, Home and End', withGrid({}, async (p, h, t) => {
	await p.ev(`${G}.mode.focus()`);
	t.eq(await focused(p), spot(PROLOGUE, 'Mara'), 'focus starts on the first cell');
	await p.key('ArrowDown');
	t.eq(await focused(p), spot(ARRIVAL, 'Mara'), 'down skips the group row');
	await p.key('ArrowRight');
	t.eq(await focused(p), spot(ARRIVAL, SECRET), 'right');
	await p.key(' ');
	await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then((x) => x.includes("secret"))`);
	t.eq(j(yamlList(await read(p, ARRIVAL), 'plotlines')), j(['Mara', SECRET]), 'Space toggled it on');
	t.eq(await focused(p), spot(ARRIVAL, SECRET), 'focus stays after the redraw');
	await p.key('Enter');
	await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then((x) => !x.includes("secret"))`);
	t.eq(j(yamlList(await read(p, ARRIVAL), 'plotlines')), j(['Mara']), 'Enter toggles too');
	await p.key('ArrowRight');
	t.eq(await focused(p), spot(ARRIVAL, SECRET), 'right stops at the last plotline');
	await p.key('Home');
	t.eq(await focused(p), spot(ARRIVAL, TITLE), 'Home: the scene’s title');
	await p.key('Enter');
	t.eq(j(await p.ev(`${G}.opened`)), j([[ARRIVAL, false]]), 'Enter on a title opens the scene');
	await p.key('ArrowUp');
	t.eq(await focused(p), spot(P1, TITLE), 'up to the group header');
	await p.key('ArrowLeft');
	t.eq(await p.ev(`document.querySelector('${T} tr[data-path="${P1}"] th').getAttribute('aria-expanded')`), 'false', 'left collapses a group');
	t.ok(!(await p.at(`${T} tr[data-path="${ARRIVAL}"]`)), 'its scenes are hidden');
	await p.key('ArrowRight');
	t.ok(await p.at(`${T} tr[data-path="${ARRIVAL}"]`), 'right expands it again');
	await p.key('ArrowUp'); await p.key('ArrowRight'); await p.key('ArrowUp');
	t.eq(await focused(p), spot(HEAD, 'Mara'), 'up into the header row');
	await p.key('End', 'ctrl');
	t.eq(await focused(p), spot(EPILOGUE, SECRET), 'Ctrl+End: the last cell');
	await p.key('Home', 'ctrl');
	t.eq(await focused(p), spot(HEAD, 'Mara'), 'Ctrl+Home: the first cell, in the header');
}));

test('keyboard: Alt+arrows move a scene and a column', withGrid({}, async (p, h, t) => {
	await p.ev(`${G}.mode.focus()`);
	await p.key('ArrowDown'); await p.key('Home');
	t.eq(await focused(p), spot(ARRIVAL, TITLE), 'on Arrival');
	await p.key('ArrowDown', 'alt');
	await until(p, `${B}.orderedChildren(app.vault.getAbstractFileByPath(${j(P1)}))[0].name === 'The keeper.md'`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'contents')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'Arrival went down one');
	t.eq(await focused(p), spot(ARRIVAL, TITLE), 'focus follows it');
	const top = await p.at(headSel('Mara'));
	await p.click(top.x, top.y); // opens the menu; close it and use the keyboard
	await p.key('Escape');
	await p.ev(`document.querySelector(${j(headSel('Mara'))}).focus()`);
	await p.key('ArrowRight', 'alt');
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => /plotlines:\\n  - The keeper/.test(x))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'plotlines')), j([SECRET, 'Mara']), 'Mara moved right');
	t.eq(await focused(p), spot(HEAD, 'Mara'), 'focus stays on Mara');
}));

test('add a plotline: the + header, typed in place', withGrid({}, async (p, h, t) => {
	const before = await texts(p);
	await clickOn(p, `${T} .binders-plotgrid-add`);
	t.ok(await p.ev(`document.activeElement?.classList.contains('binders-plotgrid-input')`), 'a name field, focused');
	await p.key('Escape');
	t.ok(!(await p.ev(`!!document.querySelector('.binders-plotgrid-input')`)), 'Escape cancels');
	await clickOn(p, `${T} .binders-plotgrid-add`);
	await p.type('Mara');
	await p.key('Enter');
	t.ok(await p.ev(`!!document.querySelector('.binders-plotgrid-input')`), 'a name already used is refused and editing goes on');
	await p.key('Backspace'); await p.key('Backspace'); await p.key('Backspace'); await p.key('Backspace');
	await p.type('The storm');
	await p.key('Enter');
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => x.includes('The storm'))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'plotlines')), j(['Mara', SECRET, 'The storm']), 'added last in the binder note');
	t.eq(j((await shown(p)).cols), j(['Mara', SECRET, 'The storm']), 'a new column');
	t.eq(await focused(p), spot(HEAD, 'The storm'), 'its header has focus');
	kept(t, before, await texts(p), { changed: [NOTE] });
	t.eq(j(yamlList(await read(p, NOTE), 'contents')), j(yamlList(before[NOTE], 'contents')), 'the binder’s contents are untouched');
}));

test('rename a plotline: the column, its color and every scene, one write each', withGrid({}, async (p, h, t) => {
	// a scene outside this folder's view, and a color, follow the rename too
	await unmount(p);
	await p.ev(`${B}.setProps(app.vault.getAbstractFileByPath(${j(NOTE)}), { plotlineColors: { Mara: 'red' } }).then(() => 1)`);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(NOTE)}))?.frontmatter?.plotlineColors?.Mara === 'red'`);
	await mount(p, { folder: P1 });
	const before = await texts(p);
	await countWrites(p);
	await clickOn(p, headSel('Mara'));
	await pick(p, 'Rename');
	t.eq(await p.ev(`document.activeElement?.value`), 'Mara', 'the name, selected, in place');
	await p.type('Mara Voss');
	await p.key('Enter');
	t.eq(j((await shown(p)).cols), j(['Mara Voss', SECRET]), 'the column shows the new name at once');
	await until(p, `app.vault.adapter.read(${j(EPILOGUE)}).then((x) => x.includes('Mara Voss'))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'plotlines')), j(['Mara Voss', SECRET]), 'renamed in place in the binder note');
	t.eq(j((await fm(p, NOTE)).plotlineColors), j({ 'Mara Voss': 'red' }), 'the color follows');
	const want = { [PROLOGUE]: [SECRET], [ARRIVAL]: ['Mara Voss'], [STORM]: ['Mara Voss'], [KEEPER]: ['Mara Voss', SECRET], [WRECK]: ['Mara Voss', SECRET], [LIGHTS]: [SECRET], [EPILOGUE]: ['Mara Voss'] };
	for (const [path, list] of Object.entries(want)) t.eq(j(yamlList(await read(p, path), 'plotlines')), j(list), `“${path}” has the new name in the same place`);
	kept(t, before, await texts(p), { changed: [NOTE, ARRIVAL, STORM, KEEPER, WRECK, EPILOGUE] });
	const w = await writes(p);
	t.eq(j(Object.keys(w).sort()), j([NOTE, ARRIVAL, STORM, KEEPER, WRECK, EPILOGUE].sort()), 'only the binder note and scenes with Mara were written');
	t.ok(Object.values(w).every((n) => n === 1), 'each once: ' + j(w));
	t.eq(j((await shown(p)).rows.map((r) => r.on)), j([['Mara Voss'], ['Mara Voss', SECRET], ['Mara Voss']]), 'the ticks stay');
	t.eq(await p.ev(`document.querySelector(${j(headSel('Mara Voss'))}).classList.contains('binders-plotgrid-color-red')`), true, 'still red');
}));

test('delete a plotline: asks first, then removes it from the binder and its scenes', withGrid({}, async (p, h, t) => {
	const before = await texts(p);
	await clickOn(p, headSel(SECRET));
	await pick(p, 'Delete');
	t.ok(await until(p, `!!document.querySelector('.modal')`), 'a confirmation');
	t.ok(/4 scenes list it/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'it says how many scenes use it');
	await clickOn(p, '.modal .mod-cancel, .modal button:not(.mod-warning):not(.mod-destructive)');
	t.ok(!(await p.ev(`!!document.querySelector('.modal')`)), 'Cancel closes it');
	t.eq(await read(p, NOTE), before[NOTE], 'and nothing changes');
	await clickOn(p, headSel(SECRET));
	await pick(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await clickOn(p, '.modal .mod-warning, .modal .mod-destructive');
	await until(p, `app.vault.adapter.read(${j(WRECK)}).then((x) => !x.includes('secret'))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'plotlines')), j(['Mara']), 'gone from the binder note');
	for (const path of [PROLOGUE, KEEPER, WRECK, LIGHTS]) t.ok(!(await read(p, path)).includes('secret'), `gone from “${path}”`);
	t.eq(yamlList(await read(p, PROLOGUE), 'plotlines'), null, 'a scene left with none loses the property');
	kept(t, before, await texts(p), { changed: [NOTE, PROLOGUE, KEEPER, WRECK, LIGHTS] });
	t.eq(j((await shown(p)).cols), j(['Mara']), 'one column left');
}));

test('delete a plotline but keep it in scenes: they show it under “Other”', withGrid({}, async (p, h, t) => {
	const before = await texts(p);
	await clickOn(p, headSel(SECRET));
	await pick(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await clickOn(p, '.modal .checkbox-container');
	await clickOn(p, '.modal .mod-warning, .modal .mod-destructive');
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => !x.includes('secret'))`);
	await settle(p);
	kept(t, before, await texts(p), { changed: [NOTE] });
	const rows = (await shown(p)).rows;
	t.eq(rows.find((r) => r.path === KEEPER).other, `Other: ${SECRET}`, 'a scene that still lists it says so');
	t.eq(rows.find((r) => r.path === ARRIVAL).other, null, 'others don’t');
}));

/** Gives scenes `plot` text (before mounting, so the grid starts from it). */
const setPlot = (p, plots) => p.ev(`(async () => {
	for (const [path, plot] of Object.entries(${j(plots)})) await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), (fm) => { fm.plot = plot; });
	await new Promise((r) => setTimeout(r, 300));
})().then(() => 1)`);
/** A note's `plot` as the cache reads it, as [key, value] pairs so the order counts. */
const plotOf = (p, path) => p.ev(`(() => { const v = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter?.plot; return v ? Object.entries(v) : null; })()`);

test('rename a plotline: its key in each scene’s plot text follows, in the same write, and nothing else in it changes', async (p, h, t) => {
	await setPlot(p, {
		[ARRIVAL]: { Mara: 'She hides the letter.', [SECRET]: 'He watches.', Harbour: 'Fog.' },
		[LIGHTS]: { Mara: 'She sees the dark tower.' }, // notes, though it doesn't list Mara
		[STORM]: { Mara: 'Hers.', 'Mara Voss': 'Already here.' }, // the new name has notes already: both stay
	});
	await mount(p);
	try {
		const before = await texts(p);
		await countWrites(p);
		await clickOn(p, headSel('Mara'));
		await pick(p, 'Rename');
		await p.type('Mara Voss');
		await p.key('Enter');
		await until(p, `app.vault.adapter.read(${j(LIGHTS)}).then((x) => x.includes('Mara Voss'))`);
		await settle(p);
		t.eq(j(await plotOf(p, ARRIVAL)), j([['Mara Voss', 'She hides the letter.'], [SECRET, 'He watches.'], ['Harbour', 'Fog.']]), 'Arrival: the key renamed in its place, the rest as it was');
		t.eq(j(yamlList(await read(p, ARRIVAL), 'plotlines')), j(['Mara Voss']), 'and its plotlines renamed');
		t.eq(j(await plotOf(p, LIGHTS)), j([['Mara Voss', 'She sees the dark tower.']]), 'Lights out: its notes follow');
		t.eq(j(yamlList(await read(p, LIGHTS), 'plotlines')), j([SECRET]), 'its plotlines are untouched');
		t.eq(j(await plotOf(p, STORM)), j([['Mara', 'Hers.'], ['Mara Voss', 'Already here.']]), 'Storm warning: no text replaces another');
		t.eq(j(yamlList(await read(p, STORM), 'plotlines')), j(['Mara Voss']), 'but its plotlines are renamed');
		const w = await writes(p);
		t.ok([ARRIVAL, LIGHTS, STORM, KEEPER, WRECK, EPILOGUE, NOTE].every((f) => w[f] === 1), 'one write per note: ' + j(w));
		const after = await texts(p);
		for (const f of Object.keys(before)) t.eq(split(after[f]).body, split(before[f]).body, `“${f}” keeps its text`);
		for (const f of [ARRIVAL, LIGHTS, STORM]) {
			const strip = (x) => split(x).yaml.split('\n').filter((l) => !/^(plotlines:|plot:|  )/.test(l)).join('\n');
			t.eq(strip(after[f]), strip(before[f]), `“${f}”: other properties untouched`);
		}
	} finally { await unmount(p); }
});

test('delete a plotline from scenes: its plot text goes too; kept in scenes, it stays', async (p, h, t) => {
	await setPlot(p, { [ARRIVAL]: { Mara: 'She hides the letter.', Harbour: 'Fog.' }, [EPILOGUE]: { Mara: 'Postcards.' }, [PROLOGUE]: { [SECRET]: 'The light.' } });
	await mount(p);
	try {
		const before = await texts(p);
		// kept in scenes first: nothing but the binder note changes
		await clickOn(p, headSel(SECRET));
		await pick(p, 'Delete');
		await until(p, `!!document.querySelector('.modal')`);
		t.ok(/1 scene has notes for it, which would be deleted too/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'the modal says notes would go');
		await clickOn(p, '.modal .checkbox-container');
		await clickOn(p, '.modal .mod-warning, .modal .mod-destructive');
		await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => !x.includes('secret'))`);
		await settle(p);
		kept(t, before, await texts(p), { changed: [NOTE] });
		// removed from scenes: the key goes, the rest of plot stays; an empty plot goes
		await clickOn(p, headSel('Mara'));
		await pick(p, 'Delete');
		await until(p, `!!document.querySelector('.modal')`);
		await clickOn(p, '.modal .mod-warning, .modal .mod-destructive');
		await until(p, `app.vault.adapter.read(${j(EPILOGUE)}).then((x) => !x.includes('Mara'))`);
		await settle(p);
		t.eq(j(await plotOf(p, ARRIVAL)), j([['Harbour', 'Fog.']]), 'Arrival keeps its other notes');
		t.eq(yamlList(await read(p, ARRIVAL), 'plotlines'), null, 'and has no plotlines left');
		t.eq(await plotOf(p, EPILOGUE), null, 'Epilogue’s plot, now empty, is gone');
		t.eq(j(await plotOf(p, PROLOGUE)), j([[SECRET, 'The light.']]), 'notes for other plotlines stay');
		const after = await texts(p);
		for (const f of Object.keys(before)) t.eq(split(after[f]).body, split(before[f]).body, `“${f}” keeps its text`);
	} finally { await unmount(p); }
});

test('unknown plotlines show under “Other”; cell text shows as a dot', withGrid({}, async (p, h, t) => {
	await p.ev(`(async () => {
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(EPILOGUE)}), (fm) => { fm.plotlines = ['Mara', 'Ghost', 'Harbour']; });
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(ARRIVAL)}), (fm) => { fm.plot = { Mara: 'She hides the letter.', [${j(SECRET)}]: '' }; });
	})().then(() => 1)`);
	await until(p, `document.querySelector('${T} tr[data-path="${EPILOGUE}"] .binders-plotgrid-other')`);
	const rows = (await shown(p)).rows;
	t.eq(rows.find((r) => r.path === EPILOGUE).other, 'Other: Ghost, Harbour', 'the plotlines without a column');
	t.eq(j(rows.find((r) => r.path === EPILOGUE).on), j(['Mara']), 'the known one is ticked');
	await until(p, `document.querySelector(${j(cellSel(ARRIVAL, 'Mara') + ' .binders-plotgrid-text-dot')})`);
	t.ok(await p.ev(`!!document.querySelector(${j(cellSel(ARRIVAL, 'Mara') + ' .binders-plotgrid-text-dot')})`), 'a dot where the scene has text for a plotline');
	t.ok(!(await p.ev(`!!document.querySelector(${j(cellSel(ARRIVAL, SECRET) + ' .binders-plotgrid-text-dot')})`)), 'none for empty text');
}));

test('reorder columns by dragging a header', withGrid({}, async (p, h, t) => {
	const before = await texts(p);
	const a = await p.at(headSel('Mara')), b = await p.at(headSel(SECRET));
	await p.drag(a.x, a.y, b.x + b.w / 2 - 4, b.y);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => /plotlines:\\n  - The keeper/.test(x))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'plotlines')), j([SECRET, 'Mara']), 'Mara is now after the secret');
	t.eq(j((await shown(p)).cols), j([SECRET, 'Mara']), 'and shown so');
	t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), 'the drag didn’t open the header’s menu');
	kept(t, before, await texts(p), { changed: [NOTE] });
	t.eq(j(yamlList(await read(p, NOTE), 'contents')), j(yamlList(before[NOTE], 'contents')), 'contents untouched');
}));

test('color a plotline from the header menu', withGrid({}, async (p, h, t) => {
	const before = await texts(p);
	await clickOn(p, headSel('Mara'));
	await pick(p, 'Color');
	const items = await until(p, `(() => { const i = [...document.querySelectorAll('.menu .menu-item')].map((e) => e.textContent.trim()); return i.length > 5 ? i : null; })()`);
	t.eq(j(items), j(['No color', 'Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']), 'Obsidian’s palette');
	await pick(p, 'Green');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(NOTE)}))?.frontmatter?.plotlineColors?.Mara === 'green'`);
	await settle(p);
	t.eq(j((await fm(p, NOTE)).plotlineColors), j({ Mara: 'green' }), 'stored in the binder note');
	const colors = await p.ev(`(() => { const probe = document.body.createDiv(); probe.style.color = 'var(--color-green)'; const want = getComputedStyle(probe).color; probe.remove(); return [want, getComputedStyle(document.querySelector(${j(cellSel(ARRIVAL, 'Mara') + ' .binders-plotgrid-mark')})).backgroundColor]; })()`);
	t.eq(colors[1], colors[0], 'ticks are in the theme’s green');
	kept(t, before, await texts(p), { changed: [NOTE] });
	await clickOn(p, headSel('Mara'));
	await pick(p, 'Color');
	await pick(p, 'No color');
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => !x.includes('plotlineColors'))`);
	await settle(p);
	t.eq(await read(p, NOTE), before[NOTE], 'no color left: the property goes, and the note is as it was');
}));

test('drag a row to reorder, and into another folder', withGrid({}, async (p, h, t) => {
	const before = await texts(p);
	let a = await p.at(rowHeadSel(EPILOGUE)), b = await p.at(rowHeadSel(PROLOGUE));
	await p.drag(a.x, a.y, b.x, b.t + 3);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => /contents:\\n  - Epilogue/.test(x))`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'contents')), j(['Epilogue', 'Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'Epilogue moved to the top');
	t.eq(j(await p.ev(`${G}.opened`)), '[]', 'the drag didn’t open it');
	// the lower half of The wreck: into Part Two, after it
	a = await p.at(rowHeadSel(PROLOGUE)); b = await p.at(rowHeadSel(WRECK));
	await p.drag(a.x, a.y, b.x, b.t + b.h - 4);
	await until(p, `app.vault.adapter.exists(${j(P2 + '/Prologue.md')})`);
	await settle(p);
	t.eq(j(yamlList(await read(p, NOTE), 'contents')), j(['Epilogue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Prologue', 'Part Two/Lights out']), 'Prologue is in Part Two, after The wreck');
	kept(t, before, await texts(p), { changed: [NOTE], moved: { [PROLOGUE]: P2 + '/Prologue.md' } });
	t.eq(j((await shown(p)).rows.map((r) => r.path)), j([EPILOGUE, P1, ARRIVAL, KEEPER, STORM, P2, WRECK, P2 + '/Prologue.md', LIGHTS]), 'the grid shows the new order');
}));

test('drop below the last row: last in the folder shown, even when the last row is in a subfolder', async (p, h, t) => {
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(EPILOGUE)})).then(() => 1)`);
	await p.ev(`${B}.flush().then(() => 1)`);
	await mount(p);
	try {
		const before = await texts(p);
		t.eq((await shown(p)).rows.at(-1).path, LIGHTS, 'the last row is in Part Two');
		// the lower half of the last row still means after it, inside Part Two
		let a = await p.at(rowHeadSel(ARRIVAL)), b = await p.at(rowHeadSel(LIGHTS));
		await p.drag(a.x, a.y, b.x, b.t + b.h - 4);
		await until(p, `app.vault.adapter.exists(${j(P2 + '/Arrival.md')})`);
		await settle(p);
		t.eq(j(yamlList(await read(p, NOTE), 'contents').slice(-3)), j(['Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Arrival']), 'Arrival went last in Part Two');
		// below the last row: last at the top level
		a = await p.at(rowHeadSel(PROLOGUE));
		const last = await p.at(`${T} tbody tr:last-child th`);
		await p.drag(a.x, a.y, last.x, last.t + last.h + 12);
		await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => /  - Prologue\n(?!  - )/.test(x))`);
		await settle(p);
		t.eq(j(yamlList(await read(p, NOTE), 'contents')), j(['Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Arrival', 'Prologue']), 'Prologue is last in the binder, after Part Two');
		t.ok(await p.ev(`app.vault.adapter.exists(${j(PROLOGUE)})`), 'still at the top level, not moved into a folder');
		t.eq((await shown(p)).rows.at(-1).path, PROLOGUE, 'and shown last');
		kept(t, before, await texts(p), { changed: [NOTE], moved: { [ARRIVAL]: P2 + '/Arrival.md' } });
	} finally { await unmount(p); }
});

test('a group collapses to counts; titles open their scene', withGrid({}, async (p, h, t) => {
	await clickOn(p, `${T} tr[data-path="${P1}"] .binders-plotgrid-group-name`);
	t.eq(j((await shown(p)).rows.map((r) => r.path)), j([PROLOGUE, P1, P2, WRECK, LIGHTS, EPILOGUE]), 'Part One’s scenes are hidden');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${T} tr[data-path="${P1}"] td.binders-plotgrid-count')].map((e) => e.textContent)`)), j(['3', '1']), 'how many of its scenes each plotline runs through');
	await clickOn(p, `${T} tr[data-path="${P1}"] .binders-plotgrid-group-name`);
	t.eq((await shown(p)).rows.length, 9, 'open again');
	await clickOn(p, titleSel(STORM));
	t.eq(j(await p.ev(`${G}.opened`)), j([[STORM, false]]), 'clicking a title opens the scene');
	const a = await p.at(titleSel(STORM));
	await p.click(a.x, a.y, { modifiers: 2 });
	t.eq(j(await p.ev(`${G}.opened`)), j([[STORM, false], [STORM, true]]), 'Ctrl+click opens it in a new tab');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${T} .is-on')].length`)), '9', 'clicking titles toggles nothing');
}));

test('refresh keeps focus and scroll, and follows edits made elsewhere', withGrid({}, async (p, h, t) => {
	await unmount(p);
	await p.ev(`(async () => { for (let i = 1; i <= 40; i++) await app.vault.create(${j(P2)} + '/Extra ' + String(i).padStart(2, '0') + '.md', 'Scene ' + i + '.'); })().then(() => 1)`);
	await mount(p);
	await p.ev(`(() => { const r = document.querySelector('.binders-plotgrid'); r.scrollTop = 400; return 1; })()`);
	await p.ev(`document.querySelector(${j(cellSel(P2 + '/Extra 20.md', 'Mara'))}).focus({ preventScroll: true })`);
	const top = await p.ev(`document.querySelector('.binders-plotgrid').scrollTop`);
	t.ok(top > 0, 'scrolled');
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(P2 + '/Extra 20.md')}), (fm) => { fm.plotlines = ['Mara']; }).then(() => 1)`);
	t.ok(await until(p, `document.querySelector(${j(cellSel(P2 + '/Extra 20.md', 'Mara'))})?.classList.contains('is-on')`), 'an edit made elsewhere shows');
	t.eq(await focused(p), spot(P2 + '/Extra 20.md', 'Mara'), 'focus kept');
	t.eq(await p.ev(`document.querySelector('.binders-plotgrid').scrollTop`), top, 'scroll kept');
	const stuck = await p.ev(`(() => { const r = document.querySelector('.binders-plotgrid').getBoundingClientRect(), h = document.querySelector('${T} thead th[data-plotline]').getBoundingClientRect(), c = document.querySelector('${T} tr[data-path="${P2}/Extra 20.md"] th').getBoundingClientRect(); return [Math.round(h.top - r.top), Math.round(c.left - r.left)]; })()`);
	t.eq(j(stuck), j([0, 0]), 'the header row sticks to the top and the titles to the left');
}));

test('read-only: nothing to click writes, no editing controls', withGrid({ readOnly: true }, async (p, h, t) => {
	const before = await texts(p);
	await countWrites(p);
	t.ok(!(await p.at(`${T} .binders-plotgrid-add`)), 'no + column');
	t.ok(!(await p.at(`${T} .binders-plotgrid-grip`)), 'no grips');
	t.eq(await p.ev(`document.querySelector('${T}').getAttribute('aria-readonly')`), 'true', 'aria-readonly');
	await clickOn(p, cellSel(ARRIVAL, SECRET));
	await clickOn(p, headSel('Mara'));
	t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), 'no column menu');
	await p.ev(`document.querySelector(${j(cellSel(ARRIVAL, 'Mara'))}).focus()`);
	await p.key(' '); await p.key('ArrowDown', 'alt');
	const a = await p.at(rowHeadSel(EPILOGUE)), b = await p.at(rowHeadSel(PROLOGUE));
	await p.drag(a.x, a.y, b.x, b.t + 3);
	const hd = await p.at(headSel('Mara')), hd2 = await p.at(headSel(SECRET));
	await p.drag(hd.x, hd.y, hd2.x + 30, hd2.y);
	await settle(p);
	t.eq(j(await writes(p)), '{}', 'nothing written');
	kept(t, before, await texts(p));
	await clickOn(p, titleSel(ARRIVAL));
	t.eq(j(await p.ev(`${G}.opened`)), j([[ARRIVAL, false]]), 'titles still open');
}));

test('a binder in a newer format is read-only, and its note is never written', async (p, h, t) => {
	const note = await read(p, NOTE);
	await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(note.replace('binder: 1', 'binder: 2'))}).then(() => 1)`);
	await until(p, `!!${B}.problem(${j(NOTE)})`);
	await mount(p);
	try {
		const before = await texts(p);
		t.eq(await p.ev(`document.querySelector('${T}').getAttribute('aria-readonly')`), 'true', 'read-only even though the view didn’t say so');
		await clickOn(p, cellSel(ARRIVAL, SECRET));
		await settle(p);
		kept(t, before, await texts(p));
	} finally { await unmount(p); }
});

test('screenshots: light and dark, desktop', withGrid({}, async (p, h, t) => {
	await p.ev(`(async () => {
		await ${B}.setProps(app.vault.getAbstractFileByPath(${j(NOTE)}), { plotlines: ['Mara', ${j(SECRET)}, 'The storm', 'Harbour town'], plotlineColors: { Mara: 'blue', 'The storm': 'orange' } });
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(ARRIVAL)}), (fm) => { fm.plot = { Mara: 'She hides the letter.' }; });
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(EPILOGUE)}), (fm) => { fm.plotlines = ['Mara', 'Ghost']; });
	})().then(() => 1)`);
	await until(p, `document.querySelectorAll('${T} .binders-plotgrid-col[data-plotline]').length === 4`);
	await p.sleep(300);
	const theme = await p.ev(`document.body.classList.contains('theme-dark') ? 'dark' : 'light'`);
	mkdirSync('test-dist/screens', { recursive: true });
	const a = await p.at(rowHeadSel(STORM));
	await p.move(a.x + 40, a.y);
	await p.ev(`document.querySelector(${j(cellSel(KEEPER, 'The storm'))}).focus()`);
	await p.key('ArrowRight'); await p.key('ArrowLeft'); // keyboard focus, so the ring shows
	await p.shot(`test-dist/screens/plotgrid-${theme}.png`);
	await clickOn(p, headSel('Mara'));
	await p.shot(`test-dist/screens/plotgrid-menu-${theme}.png`);
	await pick(p, 'Color');
	await p.shot(`test-dist/screens/plotgrid-colors-${theme}.png`);
	await p.key('Escape');
	t.ok(true, 'shots taken');
}));

// Reloads Obsidian twice (into mobile and back), so it is last in this file.
test('mobile: taps toggle, the grip moves rows, headers drag sideways; big enough to tap', async (p, h, t) => {
	const reload = async (mobile) => {
		await p.ev(`(() => { setTimeout(() => app.emulateMobile(${mobile}), 50); return 1; })()`);
		await p.sleep(1500);
		for (let i = 0; i < 80; i++) { if (await p.ev(`!!(window.app && app.workspace?.layoutReady && ${pl}?.binders && app.isMobile === ${mobile})`).catch(() => false)) break; await p.sleep(250); }
		await p.sleep(800);
		p.errors.length = 0;
	};
	const touch = async (points) => {
		await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
		for (const pt of points.slice(1)) { await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] }); await p.sleep(16); }
		await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await p.sleep(300);
	};
	const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
	await reload(true);
	try {
		await p.ev(`(() => { app.workspace.leftSplit?.collapse?.(); app.workspace.rightSplit?.collapse?.(); return 1; })()`);
		await mount(p);
		const before = await texts(p);
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
		try {
			const size = await p.at(cellSel(ARRIVAL, SECRET));
			t.ok(size.h >= 44, 'cells are at least 44px tall: ' + size.h);
			await touch([{ x: size.x, y: size.y }]);
			await until(p, `app.vault.adapter.read(${j(ARRIVAL)}).then((x) => x.includes("secret"))`);
			t.eq(j(yamlList(await read(p, ARRIVAL), 'plotlines')), j(['Mara', SECRET]), 'a tap toggles');
			// a vertical swipe on a title scrolls; it doesn't move the row
			const ep = await p.at(titleSel(EPILOGUE)), pr = await p.at(titleSel(PROLOGUE));
			await touch(line(ep, { x: ep.x, y: pr.y }));
			await settle(p);
			t.eq(j(yamlList(await read(p, NOTE), 'contents')), j(yamlList(before[NOTE], 'contents')), 'no move from a swipe on the title');
			const g = await p.at(gripSel(EPILOGUE)), top = await p.at(rowHeadSel(PROLOGUE));
			await touch(line(g, { x: g.x, y: top.t + 4 }));
			await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => /contents:\\n  - Epilogue/.test(x))`);
			t.eq(yamlList(await read(p, NOTE), 'contents')[0], 'Epilogue', 'dragging the grip moved Epilogue to the top');
			const m = await p.at(headSel('Mara')), s = await p.at(headSel(SECRET));
			await touch(line(m, { x: s.x + s.w / 2 - 4, y: s.y }));
			await until(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => /plotlines:\\n  - The keeper/.test(x))`);
			t.eq(j(yamlList(await read(p, NOTE), 'plotlines')), j([SECRET, 'Mara']), 'a sideways drag on a header moved the column');
			await settle(p);
			kept(t, before, await texts(p), { changed: [NOTE, ARRIVAL] });
			const theme = await p.ev(`document.body.classList.contains('theme-dark') ? 'dark' : 'light'`);
			await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
			await p.ev(`(() => { app.workspace.leftSplit?.collapse?.(); app.workspace.rightSplit?.collapse?.(); return 1; })()`);
			await p.sleep(800);
			await p.shot(`test-dist/screens/plotgrid-mobile-${theme}.png`);
		} finally {
			await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
			await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
			await unmount(p);
		}
	} finally { await reload(false); }
	t.ok(!(await p.ev(`app.isMobile`)), 'back on desktop');
});
