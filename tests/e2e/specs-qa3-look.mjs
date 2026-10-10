// QA round 3, design review: a screenshot tour of every state of the binder view and of Obsidian's own UI beside it
// (file explorer, Bases cards and table, a note), plus measurements (computed styles, frame-by-frame motion).
// Nothing here asserts a look; it records. Screenshots and measurements go to QA3_SHOTS (default: the scratchpad).
//   BINDERS_TEST_VAULT=… node tests/e2e/run.mjs --specs tests/e2e/specs-qa3-look.mjs [--grep text] [--theme both]
import { mkdirSync, writeFileSync } from 'fs';
import { withTidy, VIEW, PL, B, j, openView, until, reload, closeMenus, clickMenu, hoverMenu } from './view-helpers.mjs';

export const specs = [];
// (each test tidies up the folders it made: the runner only puts the notes back)
const test = (name, fn) => specs.push({ name: 'qa3 look: ' + name, fn: withTidy(fn) });

const SHOTS = process.env.QA3_SHOTS || '/tmp/claude-1000/-home-calebsmith-Projects-binder/d6da74aa-d3bb-48da-8958-f2c0cb49f425/scratchpad/qa3/look/shots';
mkdirSync(SHOTS, { recursive: true });
const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const theme = (p) => p.ev(`document.body.classList.contains('theme-dark') ? 'dark' : 'light'`);
/** A full-window screenshot named for the theme. */
async function shot(p, name) { await p.shot(`${SHOTS}/${await theme(p)}-${name}.png`); }
/** Part of the window, at twice the size, to look closely. */
async function zoom(p, name, x, y, width, height, scale = 2) {
	const r = await p.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, x), y: Math.max(0, y), width, height, scale } });
	writeFileSync(`${SHOTS}/${await theme(p)}-${name}.png`, Buffer.from(r.result.data, 'base64'));
}
async function zoomOn(p, name, sel, pad = 8, scale = 2) {
	const r = await p.at(sel);
	if (!r) throw new Error('nothing matches ' + sel);
	await zoom(p, name, r.l - pad, r.t - pad, r.w + pad * 2, r.h + pad * 2, scale);
}
/** Measurements, kept beside the screenshots. */
async function note(p, name, data) { writeFileSync(`${SHOTS}/${await theme(p)}-${name}.json`, JSON.stringify(data, null, 1)); }
const size = (p, width, height = 900, mobile = false) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const mode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(700); };
const press = (p, x, y) => p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
const letGo = (p, x, y) => p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
async function hold(p, from, to, steps = 12) {
	await p.move(from.x, from.y, 2);
	await press(p, from.x, from.y);
	await p.move(to.x, to.y, steps, { buttons: 1 });
	await p.sleep(200);
}
/** Computed styles of the first match: the properties asked for. */
const css = (p, sel, props) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const s = getComputedStyle(e), r = e.getBoundingClientRect(), o = { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10 }; for (const k of ${j(props)}) o[k] = s[k]; return o; })()`);
const TYPE = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color'];
const BOX = ['padding', 'margin', 'borderRadius', 'backgroundColor', 'boxShadow', 'border', 'gap'];

const PARA = 'The lamp turned once more above the rocks and the sea took the light and gave nothing back. Mara counted the seconds between the beam and the dark, as the keeper had taught her, and wrote the number in the log. ';
/** A novel: synopses long, short and missing; statuses, labels, targets; a nested folder; a long part of 42 scenes. */
async function seed(p, { big = true } = {}) {
	await clean(p);
	await p.ev(`(async () => {
		const pm = (path, fn) => app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), fn);
		const para = ${j(PARA)};
		const mk = async (path, fm, paras) => { const y = Object.entries(fm).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\\n'); await app.vault.create(path, (y ? '---\\n' + y + '\\n---\\n' : '') + Array.from({ length: paras }, () => para).join('\\n\\n')); };
		await pm('The Lighthouse/The Lighthouse.md', (fm) => { fm.synopsis = 'A keeper, a newcomer, and the night the light went out.'; fm.target = 80000; });
		await app.vault.create('The Lighthouse/Part One/Part One.md', '---\\nsynopsis: Mara comes to the island and learns the rules of the light.\\nstatus: Revised\\ntarget: 3000\\n---\\n');
		await app.vault.create('The Lighthouse/Part Two/Part Two.md', '---\\nsynopsis: The storm, the wreck, and what the keeper kept. Everything Mara thought she knew about the island turns out to have been a kindness, and the kindness a lie; she has one night to decide which of the two she will write down in the log.\\nstatus: Draft\\n---\\n');
		await pm('The Lighthouse/Prologue.md', (fm) => { fm.synopsis = 'A ship passes in the dark. Nobody on board sees the light.'; fm.status = 'Done'; fm.label = 'purple'; fm.target = 300; });
		await pm('The Lighthouse/Part One/Arrival.md', (fm) => { fm.synopsis = 'Mara steps off the supply boat with one bag and a letter she has not opened. The keeper does not come down to meet her; a dog does. She climbs the two hundred and four steps alone, counting, and finds the lamp room unlocked and the log open at a page dated tomorrow. She reads it. She should not have read it. Downstairs a kettle starts to whistle, and when she turns round the page has been torn out.'; fm.status = 'Revised'; fm.label = 'Blue'; fm.target = 1500; });
		await pm('The Lighthouse/Part One/The keeper.md', (fm) => { fm.synopsis = 'He talks about the weather.'; fm.status = 'Draft'; fm.label = 'red'; });
		await pm('The Lighthouse/Part One/Storm warning.md', (fm) => { fm.label = '#7c3aed'; fm.target = 20; });
		await mk('The Lighthouse/Part One/The long night in which nothing happens and everything changes, told twice.md', { synopsis: 'A very long title, to see how it is cut.', status: 'To do', label: 'orange' }, 6);
		await mk('The Lighthouse/Part One/Untitled.md', {}, 0);
		await pm('The Lighthouse/Part Two/The wreck.md', (fm) => { fm.synopsis = 'The Calliope goes down on the Teeth.'; fm.status = 'Draft'; fm.label = 'red'; fm.target = 2500; });
		await pm('The Lighthouse/Part Two/Lights out.md', (fm) => { fm.status = 'Draft'; fm.label = 'green'; });
		await app.vault.createFolder('The Lighthouse/Part Two/Interlude');
		await mk('The Lighthouse/Part Two/Interlude/Letters home.md', { synopsis: 'Three letters, never sent.', status: 'Done', label: 'yellow' }, 3);
		await mk('The Lighthouse/Part Two/Interlude/The inspector.md', { synopsis: 'A man from the mainland counts the oil.', label: 'cyan' }, 2);
		await app.vault.createFolder('The Lighthouse/Part Two/Interlude/Dreams');
		await mk('The Lighthouse/Part Two/Interlude/Dreams/First dream.md', { synopsis: 'Water.', status: 'Draft' }, 1);
		await app.vault.createFolder('The Lighthouse/Empty part');
		await pm('The Lighthouse/Epilogue.md', (fm) => { fm.synopsis = 'Years later.'; fm.label = 'purple'; fm.status = 'To do'; });
		if (${j(big)}) {
			await app.vault.createFolder('The Lighthouse/Part Three');
			const st = ['Draft', 'Revised', 'Done', 'To do', ''], lb = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', '', ''];
			const syn = ['', 'Short.', 'Mara rows out to the Teeth at low tide and finds the bell.', 'The keeper tells the truth, or part of it, and Mara pretends to believe him because the alternative is the boat, the boat is a week away, and the oil is running low. They trim the wick together in silence.'];
			for (let i = 1; i <= 42; i++) { const fm = {}; if (syn[i % 4]) fm.synopsis = syn[i % 4]; if (st[i % 5]) fm.status = st[i % 5]; if (lb[i % 10]) fm.label = lb[i % 10]; if (i % 6 === 0) fm.target = 400; await mk('The Lighthouse/Part Three/Scene ' + String(i).padStart(2, '0') + (i % 9 === 0 ? ', in which the tide comes in early' : '') + '.md', fm, 1 + (i % 7)); }
		}
		await ${B}.settled; await ${B}.flush?.();
	})().then(() => 1)`);
	await p.sleep(1200);
}
/** The runner puts the notes back but leaves folders and other files a test made: take those away, close menus and dialogs. */
async function clean(p) {
	await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
	await p.send('Emulation.setEmulatedMedia', { features: [] });
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); }
	await p.ev(`(async () => {
		document.querySelectorAll('.menu').forEach(m => m.remove());
		const keep = new Set(['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'Longform demo']);
		const extra = app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !keep.has(f.path));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		for (const f of app.vault.getFiles()) if (f.extension !== 'md') await app.vault.delete(f);
		app.vault.setConfig('readableLineLength', true);
		app.workspace.leftSplit.expand();
		await ${B}.flush();
	})().then(() => 1)`);
	await p.sleep(300);
	await hoverOn(p);
}
/** Headless Obsidian says it has no pointer that hovers (`(hover: hover)` is false), so nothing inside those media rules
    applies: neither Obsidian's own hover styles nor Binders'. Make those rules unconditional, in place (so the cascade is
    as on a desktop), to see what a mouse user sees. */
const hoverOn = (p) => p.ev(`(() => { let n = 0; const walk = (rules) => { for (const r of rules) { if (r instanceof CSSMediaRule && /\\(\\s*(any-)?hover\\s*:\\s*hover\\s*\\)/.test(r.conditionText) && !/and|,/.test(r.conditionText.replace(/\\(.*?\\)/, ''))) { r.media.mediaText = 'all'; n++; } if (r.cssRules) walk(r.cssRules); } }; for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (e) { /* not ours to read */ } } return n; })()`);
const sidebar = (p, open) => p.ev(`(() => { app.workspace.leftSplit[${j(open ? 'expand' : 'collapse')}](); return 1; })()`).then(() => p.sleep(350));
const park = (p) => p.move(1436, 896, 2);

// ---------------------------------------------------------------------------------------------------------------
// 1. A first look: each mode at 1440×900, and Obsidian's own Bases cards and table, a note and the explorer beside them
// ---------------------------------------------------------------------------------------------------------------

test('01 overview: the three modes, desktop', async (p) => {
	await seed(p);
	await p.ev(`(async () => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); })().then(() => 1)`);
	await openView(p);
	await p.ev(`(() => { const e = app.workspace.getLeavesOfType('file-explorer')[0].view; for (const f of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two']) e.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(900);
	await park(p);
	await shot(p, '01-corkboard');
	await mode(p, 'outliner');
	await shot(p, '01-outliner');
	await mode(p, 'manuscript');
	await p.sleep(1200);
	await shot(p, '01-manuscript');
});

test('02 native: Bases cards and table, a note, for comparison', async (p, h) => {
	await seed(p, { big: false });
	await p.ev(`(async () => {
		await app.vault.create('Scenes.base', 'filters:\\n  and:\\n    - file.inFolder("The Lighthouse")\\nviews:\\n  - type: cards\\n    name: Cards\\n    order:\\n      - file.name\\n      - synopsis\\n      - status\\n  - type: table\\n    name: Table\\n    order:\\n      - file.name\\n      - status\\n      - label\\n      - target\\n      - synopsis\\n');
		await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Scenes.base'));
	})().then(() => 1)`);
	await p.sleep(1800);
	await park(p);
	await shot(p, '02-native-bases-cards');
	// hover a native card, and select one
	const c = await p.at(`${LEAF} .bases-cards-item`, 1);
	if (c) { await p.move(c.x, c.y, 3); await p.sleep(300); await shot(p, '02-native-bases-cards-hover'); }
	const names = await p.ev(`[...document.querySelectorAll('${LEAF} .bases-view *')].slice(0, 400).map(e => e.className).filter(c => typeof c === 'string' && c).filter((c, i, a) => a.indexOf(c) === i).slice(0, 80)`);
	const m = {
		classes: names,
		header: await css(p, `${LEAF} .bases-header`, [...BOX, 'height', 'borderBottom']),
		toolbar: await css(p, `${LEAF} .bases-toolbar`, [...BOX, 'height']),
		toolbarItem: await css(p, `${LEAF} .bases-toolbar .text-icon-button`, [...TYPE, ...BOX, 'height']),
		toolbarIcon: await css(p, `${LEAF} .bases-toolbar .text-icon-button svg`, ['width', 'height', 'strokeWidth', 'color']),
		card: await css(p, `${LEAF} .bases-cards-item`, [...BOX]),
		cardTitle: await css(p, `${LEAF} .bases-cards-item .bases-cards-property`, [...TYPE, ...BOX]),
		cardLine: await css(p, `${LEAF} .bases-cards-item .bases-cards-line`, [...TYPE, ...BOX]),
		cardsGrid: await css(p, `${LEAF} .bases-cards-group`, ['gap', 'gridTemplateColumns', 'padding']),
		cardsContainer: await css(p, `${LEAF} .bases-cards-container`, ['padding', 'gap']),
	};
	// the table
	await p.ev(`(() => { const v = app.workspace.getMostRecentLeaf().view; const c = v.controller ?? v; try { (c.selectView ?? c.setView)?.call(c, 'Table'); } catch (e) { return String(e); } return 1; })()`);
	await p.sleep(900);
	if (!(await p.at(`${LEAF} .bases-table`))) {
		// by hand: the view switcher in the toolbar
		const b = await p.at(`${LEAF} .bases-toolbar .text-icon-button`);
		if (b) { await p.click(b.x, b.y); await p.sleep(400); await shot(p, '02-native-bases-viewmenu'); const it = await p.ev(`(() => { const e = [...document.querySelectorAll('.menu .menu-item, .bases-toolbar-menu-item, .suggestion-item')].find(e => /Table/.test(e.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); if (it) { await p.click(it.x, it.y); await p.sleep(900); } }
	}
	await park(p);
	await shot(p, '02-native-bases-table');
	m.th = await css(p, `${LEAF} .bases-table-header-name, ${LEAF} .bases-th`, [...TYPE, ...BOX]);
	m.thCell = await css(p, `${LEAF} .bases-th`, [...TYPE, ...BOX, 'height', 'borderRight', 'borderBottom']);
	m.td = await css(p, `${LEAF} .bases-td`, [...TYPE, ...BOX, 'height', 'borderRight', 'borderBottom']);
	m.tr = await css(p, `${LEAF} .bases-tr`, ['height', 'borderBottom']);
	const row = await p.at(`${LEAF} .bases-tbody .bases-tr`, 2);
	if (row) { await p.move(row.x, row.y, 3); await p.sleep(300); await shot(p, '02-native-bases-table-hover'); }
	await note(p, '02-native-bases', m);
	// a note, with "Readable line length" on
	await h.open(L + 'Part One/Arrival.md');
	await p.sleep(600);
	await park(p);
	await shot(p, '02-native-note');
	await note(p, '02-native-note', {
		sizer: await css(p, `${LEAF} .cm-sizer`, ['maxWidth', 'margin', 'padding']),
		content: await css(p, `${LEAF} .cm-content`, [...TYPE, 'padding']),
		line: await css(p, `${LEAF} .cm-line`, [...TYPE]),
		title: await css(p, `${LEAF} .inline-title`, [...TYPE, 'margin']),
		scroller: await css(p, `${LEAF} .cm-scroller`, ['padding']),
		header: await css(p, `${LEAF} .view-header`, ['height', 'padding', 'backgroundColor', 'borderBottom']),
	});
});

const options = (p, o) => p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(); const s = l.view.getState(); await l.setViewState({ type: 'binders-view', state: { ...s, options: { ...(s.options || {}), ...${j(o)} } }, active: true }); })().then(() => 1)`).then(() => p.sleep(700));
const setFilter = (p, f) => p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(); const s = l.view.getState(); await l.setViewState({ type: 'binders-view', state: { ...s, filter: ${j(f)} }, active: true }); })().then(() => 1)`).then(() => p.sleep(700));
const card = (path) => `${LEAF} .binders-card[data-path="${L}${path}"]`;
/** As if the keyboard was used last, so `:focus-visible` shows on what is focused next. */
const keyboardFocus = async (p, sel) => { await p.key('Shift'); await p.ev(`(() => { document.querySelector(${j(sel)})?.focus(); return 1; })()`); await p.sleep(250); };
const leafBox = (p) => p.at(`${LEAF} .workspace-leaf-content`);

// ---------------------------------------------------------------------------------------------------------------
// 3. The toolbar
// ---------------------------------------------------------------------------------------------------------------

test('03 toolbar: states and measurements', async (p) => {
	await seed(p, { big: false });
	await openView(p);
	await park(p);
	const lb = await leafBox(p);
	const strip = (name) => zoom(p, name, lb.l, lb.t, lb.w, 120, 2);
	await strip('03-toolbar-root');
	for (const [name, sel] of [['mode', '.binders-mode-button'], ['filter', '.binders-filter-button'], ['new', '.binders-new-button']]) {
		const b = await p.at(`${LEAF} ${sel}`);
		await p.move(b.x, b.y, 3); await p.sleep(350);
		await zoom(p, `03-toolbar-hover-${name}`, b.l - 60, lb.t + 36, 260, 60, 3);
	}
	// Obsidian's own view-header button hovered, for the same look
	const more = await p.at(`${LEAF} .view-header .view-actions .clickable-icon`);
	if (more) { await p.move(more.x, more.y, 3); await p.sleep(350); await zoom(p, '03-native-header-hover', more.l - 200, lb.t, 260, 60, 3); }
	await park(p);
	await keyboardFocus(p, `${LEAF} .binders-mode-button`);
	await zoom(p, '03-toolbar-focus-mode', lb.l, lb.t + 36, 260, 60, 3);
	await keyboardFocus(p, `${LEAF} .binders-new-button`);
	await zoom(p, '03-toolbar-focus-new', lb.l + lb.w - 320, lb.t + 36, 320, 60, 3);
	const m = {};
	const grab = async () => ({
		viewHeader: await css(p, `${LEAF} .view-header`, ['height', 'padding', 'backgroundColor', 'borderBottom']),
		navBack: await css(p, `${LEAF} .view-header-nav-buttons .clickable-icon`, ['padding', 'width', 'height']),
		navBackSvg: await css(p, `${LEAF} .view-header-nav-buttons .clickable-icon svg`, ['width', 'height', 'strokeWidth', 'color']),
		moreBtn: await css(p, `${LEAF} .view-header .view-actions .clickable-icon`, ['padding']),
		moreSvg: await css(p, `${LEAF} .view-header .view-actions .clickable-icon svg`, ['width', 'height']),
		title: await css(p, `${LEAF} .view-header-title`, TYPE),
		toolbar: await css(p, `${LEAF} .binders-toolbar`, [...BOX, 'height', 'borderBottom']),
		modeBtn: await css(p, `${LEAF} .binders-mode-button`, [...TYPE, ...BOX, 'height']),
		modeIcon: await css(p, `${LEAF} .binders-mode-button svg`, ['width', 'height', 'strokeWidth', 'color']),
		modeLabel: await css(p, `${LEAF} .binders-mode-button .text-button-label`, TYPE),
		modeAux: await css(p, `${LEAF} .binders-mode-button .mod-aux svg`, ['width', 'height', 'color']),
		progress: await css(p, `${LEAF} .binders-progress`, [...BOX, 'height']),
		count: await css(p, `${LEAF} .binders-word-count`, [...TYPE, 'padding']),
		filterBtn: await css(p, `${LEAF} .binders-filter-button`, [...TYPE, ...BOX]),
		filterIcon: await css(p, `${LEAF} .binders-filter-button svg`, ['width', 'height', 'color']),
		newBtn: await css(p, `${LEAF} .binders-new-button`, [...TYPE, ...BOX]),
		synopsis: await css(p, `${LEAF} .binders-view-synopsis`, [...TYPE, 'padding', 'margin']),
		firstCard: await css(p, `${LEAF} .binders-card`, ['padding']),
		firstRowTitle: await css(p, `${LEAF} .binders-outliner-row .mod-title`, ['padding']),
	});
	m.corkboard = await grab();
	// in a folder three deep: breadcrumbs
	await openView(p, L + 'Part Two/Interlude/Dreams');
	await park(p);
	await strip('03-toolbar-breadcrumbs');
	const crumb = await p.at(`${LEAF} .binders-crumb[role="link"]`, 1);
	await p.move(crumb.x, crumb.y, 3); await p.sleep(300);
	await strip('03-toolbar-breadcrumbs-hover');
	m.crumb = await css(p, `${LEAF} .binders-crumb[role="link"]`, [...TYPE, ...BOX]);
	m.crumbCurrent = await css(p, `${LEAF} .binders-crumb.is-current`, [...TYPE, ...BOX]);
	// a filter on
	await openView(p);
	await setFilter(p, { status: ['Draft'], label: ['red'] });
	await park(p);
	await shot(p, '03-corkboard-filtered');
	await strip('03-toolbar-filter-on');
	await setFilter(p, { status: ['Done'], label: ['red'] });
	await shot(p, '03-corkboard-filter-nothing');
	await setFilter(p, { status: [], label: [] });
	await mode(p, 'outliner');
	await park(p);
	await strip('03-toolbar-outliner');
	m.outliner = await grab();
	await mode(p, 'manuscript');
	await p.sleep(800);
	await strip('03-toolbar-manuscript');
	m.manuscript = await grab();
	await note(p, '03-toolbar', m);
});

// ---------------------------------------------------------------------------------------------------------------
// 4. The corkboard's states
// ---------------------------------------------------------------------------------------------------------------

test('04 corkboard: card states', async (p) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	await openView(p);
	await park(p);
	await shot(p, '04-corkboard-wide');
	// (the binder's board: its notes, and its folders as stacks; a folder's notes are on that folder's own board)
	await openView(p, L + 'Part One');
	await park(p);
	await shot(p, '04-corkboard-folder');
	const a = await p.at(card('Part One/The keeper.md'));
	const row = async (name) => { const g = await p.at(card('Part One/Arrival.md')); await zoom(p, name, g.l - 30, g.t - 60, 860, g.h + 80, 2); };
	await row('04-cards-rest');
	await p.move(a.x, a.t + 22, 3); await p.sleep(350);
	await row('04-cards-hover');
	await shot(p, '04-cards-hover-full');
	const hov = { hovered: await p.ev(`[...document.querySelectorAll(':hover')].map(e => e.className).slice(-3)`), shadow: await p.ev(`getComputedStyle(document.querySelector(${j(card('Part One/The keeper.md'))})).boxShadow`), rest: await p.ev(`getComputedStyle(document.querySelector(${j(card('Part One/Arrival.md'))})).boxShadow`) };
	// one plain click on the card's body (its synopsis): what happens?
	await p.click(a.x, a.y + 20); await park(p); await p.sleep(300);
	await row('04-cards-click-body');
	hov.afterBodyClick = await p.ev(`document.activeElement.tagName + '.' + document.activeElement.className`);
	await p.key('Escape'); await p.sleep(200);
	await p.ev(`document.activeElement.blur()`);
	const b0 = await p.at(`${LEAF} .binders-board`);
	await p.click(b0.l + b0.w - 6, b0.t + 4); await p.sleep(200);
	// selected by its title
	await p.click(a.x, a.t + 22); await park(p); await p.sleep(300);
	await row('04-cards-selected');
	hov.selected = await p.ev(`getComputedStyle(document.querySelector(${j(card('Part One/The keeper.md'))})).boxShadow`);
	const s = await p.at(card('Part One/Storm warning.md'));
	await p.click(s.x, s.t + 22, { modifiers: 8 }); await park(p); await p.sleep(300);
	await row('04-cards-multi');
	await p.click(a.x, a.t + 22); await p.sleep(100);
	await p.key('ArrowRight'); await p.sleep(300);
	await row('04-cards-keyboard-focus');
	hov.keyboard = await p.ev(`document.activeElement.className + ' ' + getComputedStyle(document.activeElement).boxShadow`);
	await p.key('F2'); await p.sleep(300);
	await row('04-cards-rename');
	await p.type(' at dusk');
	await row('04-cards-rename-typed');
	await p.key('Escape'); await p.sleep(200);
	// the synopsis: pointed at, then clicked
	const syn = await p.at(card('Part One/The keeper.md') + ' .binders-card-synopsis');
	await p.move(syn.x, syn.y, 2); await p.sleep(300);
	await row('04-cards-synopsis-hover');
	await p.click(syn.x, syn.y); await p.sleep(350);
	await row('04-cards-synopsis-editing');
	await p.key('Escape'); await p.sleep(200);
	await note(p, '04-hover', hov);
	// the breadcrumb that leads back out, pointed at
	const up = await p.at(`${LEAF} .binders-crumb[role="link"]`);
	await p.move(up.x, up.y, 3); await p.sleep(300);
	await zoom(p, '04-breadcrumb-hover', up.l - 120, up.t - 14, 700, 70, 2);
	// a folder's stack on the binder's board: at rest, pointed at, selected, its synopsis being edited, its name
	await openView(p);
	await park(p);
	const st = await p.at(card('Part One')), stack = async (name) => zoom(p, name, st.l - 30, st.t - 30, st.w * 2 + 80, st.h + 60, 2);
	await stack('04-stack-rest');
	await p.move(st.x, st.t + 22, 3); await p.sleep(350);
	await stack('04-stack-hover');
	await shot(p, '04-stack-hover-full');
	await p.click(st.x, st.t + 22); await park(p); await p.sleep(300);
	await stack('04-stack-selected');
	hov.stack = { selected: await p.ev(`getComputedStyle(document.querySelector(${j(card('Part One'))})).boxShadow`), rest: await p.ev(`getComputedStyle(document.querySelector(${j(card('Part Two'))})).boxShadow`) };
	// (a stack's synopsis is edited with a click once the card has been selected a moment; a double-click goes in)
	await p.sleep(700);
	const ss = await p.at(card('Part One') + ' .binders-card-synopsis');
	await p.click(ss.x, ss.y); await p.sleep(350);
	await stack('04-stack-synopsis-editing');
	hov.stack.editing = await p.ev(`document.activeElement.tagName + '.' + document.activeElement.className`);
	await p.key('Escape'); await p.sleep(200);
	await p.key('F2'); await p.sleep(300);
	await stack('04-stack-rename');
	await p.key('Escape'); await p.sleep(200);
	await note(p, '04-hover', hov);
	await note(p, '04-card', {
		card: await css(p, card('Prologue.md'), [...BOX, 'minHeight', 'transition']),
		title: await css(p, card('Prologue.md') + ' .binders-card-title', TYPE),
		synopsis: await css(p, card('Prologue.md') + ' .binders-card-synopsis', [...TYPE, 'padding', 'margin']),
		chip: await css(p, card('Prologue.md') + ' .binders-chip', [...TYPE, ...BOX]),
		words: await css(p, card('Prologue.md') + ' .binders-card-words', TYPE),
		footer: await css(p, card('Prologue.md') + ' .binders-card-footer', ['gap', 'minHeight']),
		stack: await css(p, card('Part One'), [...BOX, 'minHeight', 'transition']),
		stackTitle: await css(p, card('Part One') + ' .binders-card-title', TYPE),
		stackCount: await css(p, card('Part One') + ' .binders-card-words', TYPE),
		stackSynopsis: await css(p, card('Part One') + ' .binders-card-synopsis', [...TYPE, 'padding', 'margin']),
		viewSynopsis: await css(p, `${LEAF} .binders-view-synopsis`, [...TYPE, 'padding', 'margin']),
		grid: await css(p, `${LEAF} .binders-cards`, ['gap', 'gridTemplateColumns']),
		board: await css(p, `${LEAF} .binders-board`, ['padding', 'gap']),
	});
});

test('04b corkboard: options, sizes, a long folder, empty and read-only', async (p) => {
	await seed(p);
	await sidebar(p, false);
	await openView(p);
	// (cards are tinted with their label's color as the board comes; 'stripe' is the border alone)
	await park(p);
	await shot(p, '04b-tint');
	await options(p, { labelStyle: 'stripe' });
	await shot(p, '04b-stacks');
	const st = await p.at(`${LEAF} .binders-card.is-stack`);
	if (st) { await zoom(p, '04b-stack-rest', st.l - 20, st.t - 20, st.w * 2 + 60, st.h + 50, 2); await p.move(st.x, st.y, 3); await p.sleep(300); await zoom(p, '04b-stack-hover', st.l - 20, st.t - 20, st.w * 2 + 60, st.h + 50, 2); await p.click(st.x, st.y + 30); await park(p); await p.sleep(300); await zoom(p, '04b-stack-selected', st.l - 20, st.t - 20, st.w * 2 + 60, st.h + 50, 2); }
	await options(p, { labelStyle: 'tint', numbers: true });
	await shot(p, '04b-numbers');
	await options(p, { numbers: false, cardSize: 'small' });
	await shot(p, '04b-small');
	await options(p, { cardSize: 'large' });
	await shot(p, '04b-large');
	await options(p, { cardSize: 'medium' });
	await openView(p, L + 'Part Three');
	await park(p);
	await shot(p, '04b-part-three');
	await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-corkboard'); s.scrollTop = s.scrollHeight; return 1; })()`);
	await p.sleep(500);
	await shot(p, '04b-part-three-end');
	await openView(p, L + 'Empty part');
	await shot(p, '04b-empty-folder');
	await mode(p, 'outliner'); await shot(p, '04b-empty-folder-outliner');
	await mode(p, 'manuscript'); await p.sleep(500); await shot(p, '04b-empty-folder-manuscript');
	await mode(p, 'corkboard');
	// a binder with nothing in it
	await p.ev(`(async () => { const f = await app.vault.createFolder('Blank'); await ${PL}.makeBinder(f); await ${B}.settled; })().then(() => 1)`);
	await p.sleep(800);
	await openView(p, 'Blank');
	await park(p);
	await shot(p, '04b-empty-binder');
	// read only: a binder note of a newer format
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('The Lighthouse/The Lighthouse.md'); const t = await app.vault.read(f); await app.vault.modify(f, t.replace('binder: 1', 'binder: 99')); })().then(() => 1)`);
	await p.sleep(1200);
	await openView(p);
	await park(p);
	await shot(p, '04b-readonly-corkboard');
	await mode(p, 'outliner'); await shot(p, '04b-readonly-outliner');
	await mode(p, 'manuscript'); await p.sleep(900); await shot(p, '04b-readonly-manuscript');
	await mode(p, 'corkboard');
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Dragging cards
// ---------------------------------------------------------------------------------------------------------------

test('05 corkboard: mid-drag', async (p) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	await openView(p, L + 'Part One');
	const a = await p.at(card('Part One/The keeper.md')), b = await p.at(card('Part One/The long night in which nothing happens and everything changes, told twice.md'));
	await hold(p, { x: a.x, y: a.t + 14 }, { x: b.l + 4, y: b.y });
	await shot(p, '05-drag-one');
	await note(p, '05-drag', {
		ghost: await css(p, '.binders-drag-ghost', ['opacity', 'transform', 'boxShadow', 'zIndex', 'position']),
		ghostCard: await css(p, '.binders-drag-ghost > .binders-card', ['boxShadow', 'opacity', 'transform', 'backgroundColor']),
		slot: await css(p, '.binders-card.is-dragging', ['backgroundColor', 'boxShadow', 'opacity']),
		line: await css(p, '.binders-drop-indicator.is-active', ['width', 'height', 'backgroundColor', 'borderRadius']),
		nativeGhost: await p.ev(`(() => { const r = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).filter(r => /\\.drag-ghost|\\.drop-indicator|is-being-dragged/.test(r.selectorText || '')).map(r => r.cssText); return r.slice(0, 30); })()`),
		cursor: await p.ev(`getComputedStyle(document.body).cursor + ' / ' + document.body.className`),
	});
	// past the last card: the board's end
	const w = await p.ev(`(() => { const all = document.querySelectorAll('${LEAF} .binders-card[data-path]'), r = all[all.length - 1].getBoundingClientRect(); return { x: r.right - 10, y: r.top + r.height / 2 }; })()`);
	await p.move(w.x, w.y, 10, { buttons: 1 }); await p.sleep(250);
	await shot(p, '05-drag-to-end');
	// over the binder in the breadcrumb: the way out of this folder
	const head = await p.at(`${LEAF} .binders-crumb[data-path="The Lighthouse"]`);
	await p.move(head.x, head.y, 10, { buttons: 1 }); await p.sleep(250);
	await shot(p, '05-drag-over-breadcrumb');
	await zoom(p, '05-drag-over-breadcrumb-zoom', Math.max(0, head.l - 200), Math.max(0, head.t - 20), 700, 120, 2);
	await note(p, '05-drag-crumb', { crumb: await css(p, `${LEAF} .binders-crumb.is-being-dragged-over`, ['backgroundColor', 'color', 'boxShadow', 'borderRadius']) });
	await p.key('Escape'); await letGo(p, head.x, head.y); await p.sleep(500);
	// several at once
	await p.click(a.x, a.y + 30);
	const s = await p.at(card('Part One/Storm warning.md'));
	await p.click(s.x, s.y + 30, { modifiers: 8 });
	await hold(p, { x: a.x, y: a.t + 14 }, { x: b.l + 60, y: b.y + 30 });
	await shot(p, '05-drag-two');
	await p.key('Escape'); await letGo(p, b.l + 60, b.y + 30); await p.sleep(500);
	// on the binder's board: beside a stack (a line), then onto its middle (into that folder)
	await openView(p);
	const stack = await p.at(card('Part Two')), pr = await p.at(card('Prologue.md'));
	await hold(p, { x: pr.x, y: pr.t + 14 }, { x: stack.l + 6, y: stack.y });
	await shot(p, '05-drag-beside-stack');
	await p.move(stack.x, stack.y, 8, { buttons: 1 }); await p.sleep(250);
	await shot(p, '05-drag-onto-stack');
	await note(p, '05-drag-stack', { stack: await css(p, `${LEAF} .binders-card.is-stack.is-being-dragged-over`, ['backgroundColor', 'boxShadow', 'borderColor']) });
	await p.key('Escape'); await letGo(p, stack.x, stack.y); await p.sleep(400);
	// a stack itself, carried
	const one = await p.at(card('Part One')), ep = await p.at(card('Epilogue.md'));
	await hold(p, { x: one.x, y: one.t + 14 }, { x: ep.x + 40, y: ep.y });
	await shot(p, '05-drag-a-stack');
	await p.key('Escape'); await letGo(p, ep.x + 40, ep.y); await p.sleep(400);
});


// ---------------------------------------------------------------------------------------------------------------
// 6. The outliner
// ---------------------------------------------------------------------------------------------------------------

const row = (path) => `${LEAF} .binders-outliner-row[data-path="${L}${path}"]`;
const ALL_COLS = ['label', 'status', 'words', 'target', 'progress', 'export', 'created', 'modified'].map((id) => ({ id }));

test('06 outliner: rows, columns, menus, states', async (p) => {
	await seed(p);
	await sidebar(p, false);
	await openView(p);
	await mode(p, 'outliner');
	await park(p);
	await shot(p, '06-outliner-default');
	const lb = await leafBox(p);
	await zoom(p, '06-outliner-head', lb.l, lb.t + 78, 700, 200, 2);
	await zoom(p, '06-outliner-head-right', lb.l + lb.w - 520, lb.t + 78, 520, 200, 2);
	// pointed at, selected, several, focused by keyboard
	const k = await p.at(row('Part One/The keeper.md'));
	await p.move(k.l + 500, k.t + 8, 3); await p.sleep(300);
	await shot(p, '06-outliner-hover');
	const nm = await p.at(row('Part One/The keeper.md') + ' .binders-outliner-name');
	await p.click(nm.l + 320, nm.y); await park(p); await p.sleep(300);
	await shot(p, '06-outliner-selected');
	const st = await p.at(row('Part One/Storm warning.md') + ' .binders-outliner-name');
	const ln = await p.at(row('Part One/The long night in which nothing happens and everything changes, told twice.md') + ' .binders-outliner-name');
	await p.click(ln.l + 520, ln.y, { modifiers: 8 }); await park(p); await p.sleep(300);
	await shot(p, '06-outliner-multi');
	await p.click(nm.l + 320, nm.y); await p.key('ArrowDown'); await p.sleep(300);
	await shot(p, '06-outliner-keyboard');
	const m = { focus: await p.ev(`(() => { const a = document.activeElement, s = getComputedStyle(a); return a.className + ' | outline ' + s.outline + ' | offset ' + s.outlineOffset; })()`) };
	await p.key('F2'); await p.sleep(300);
	await zoom(p, '06-outliner-rename', lb.l, st.t - 60, 900, 160, 2);
	await p.key('Escape'); await p.sleep(200);
	// a cell with a menu pointed at; a synopsis pointed at and edited
	const cell = await p.at(row('Part One/The keeper.md') + ' [data-col="status"]');
	await p.move(cell.x, cell.y, 3); await p.sleep(300);
	await zoom(p, '06-outliner-cell-hover', cell.l - 300, cell.t - 40, 600, 130, 2);
	await p.click(cell.x, cell.y); await p.sleep(400);
	await shot(p, '06-outliner-status-menu');
	await closeMenus(p);
	const lc = await p.at(row('Part One/The keeper.md') + ' [data-col="label"]');
	await p.click(lc.x, lc.y); await p.sleep(400);
	await shot(p, '06-outliner-label-menu');
	await closeMenus(p);
	const sy = await p.at(row('Part One/The keeper.md') + ' .binders-outliner-synopsis');
	await p.move(sy.l + 30, sy.y, 3); await p.sleep(300);
	await zoom(p, '06-outliner-synopsis-hover', lb.l, sy.t - 50, 900, 130, 2);
	await p.click(sy.l + 30, sy.y); await p.sleep(350);
	await zoom(p, '06-outliner-synopsis-editing', lb.l, sy.t - 50, 900, 130, 2);
	await p.key('Escape'); await p.sleep(200);
	// header: pointed at, its menu, the "+" menu, the resize handle
	const th = await p.at(`${LEAF} .binders-outliner-th[data-col="status"]`);
	await p.move(th.x, th.y, 3); await p.sleep(300);
	await zoom(p, '06-outliner-th-hover', th.l - 200, th.t - 10, 460, 60, 3);
	await p.move(th.l + th.w, th.y, 3); await p.sleep(300);
	await zoom(p, '06-outliner-th-resizer', th.l - 200, th.t - 10, 460, 60, 3);
	await p.click(th.x, th.y); await p.sleep(400);
	await shot(p, '06-outliner-column-menu');
	await closeMenus(p);
	const add = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
	await p.click(add.x, add.y); await p.sleep(400);
	await shot(p, '06-outliner-add-menu');
	await closeMenus(p);
	const tt = await p.at(`${LEAF} .binders-outliner-th[data-col="title"]`);
	await p.click(tt.x, tt.y); await p.sleep(400);
	await shot(p, '06-outliner-title-menu');
	await closeMenus(p);
	// every column, sorted by words
	await options(p, { outliner: { columns: ALL_COLS, sort: { id: 'words', dir: -1 } } });
	await park(p);
	await shot(p, '06-outliner-all-columns-sorted');
	await options(p, { outliner: { columns: ALL_COLS, sort: null, collapsed: [L + 'Part One', L + 'Part Three'] } });
	await shot(p, '06-outliner-all-columns');
	const lb2 = await leafBox(p);
	await zoom(p, '06-outliner-columns-zoom', lb2.l + lb2.w - 760, lb2.t + 110, 760, 300, 2);
	// the foot
	await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-outliner'); s.scrollTop = s.scrollHeight; return 1; })()`);
	await p.sleep(400);
	await shot(p, '06-outliner-foot');
	// no synopses: one-line rows, as a table
	await options(p, { outliner: { columns: ALL_COLS, synopsis: false, collapsed: [] } });
	await shot(p, '06-outliner-no-synopses');
	m.vars = await p.ev(`(() => { const s = getComputedStyle(document.querySelector('${LEAF} .binders-outliner')); const o = {}; for (const v of ['--bases-table-row-background-hover', '--bases-table-row-height', '--bases-table-header-color', '--bases-table-border-color', '--bases-table-header-background-hover', '--nav-item-background-selected', '--nav-item-background-hover', '--background-modifier-hover', '--bases-header-height', '--bases-cards-radius', '--bases-cards-background', '--bases-cards-shadow', '--shadow-drag', '--anim-duration-fast', '--anim-duration-moderate', '--file-line-width', '--file-margins']) o[v] = s.getPropertyValue(v); return o; })()`);
	m.rowOneLine = await css(p, `${LEAF} .binders-outliner-row`, ['height']);
	m.th = await css(p, `${LEAF} .binders-outliner-th[data-col="status"]`, [...TYPE, ...BOX, 'height', 'borderBottom']);
	m.thTitle = await css(p, `${LEAF} .binders-outliner-th[data-col="title"]`, [...TYPE, 'padding']);
	m.cell = await css(p, row('Part One/The keeper.md') + ' [data-col="status"]', [...TYPE, ...BOX, 'height']);
	m.title = await css(p, row('Part One/The keeper.md') + ' .binders-outliner-name', TYPE);
	m.folderTitle = await css(p, row('Part One') + ' .binders-outliner-name', TYPE);
	m.chip = await css(p, row('Part One/The keeper.md') + ' .binders-chip', [...TYPE, ...BOX]);
	m.dot = await css(p, row('Part One/The keeper.md') + ' .binders-label-dot', ['width', 'height', 'backgroundColor']);
	m.words = await css(p, row('Part One/The keeper.md') + ' [data-col="words"]', TYPE);
	m.chevron = await css(p, `${LEAF} .binders-outliner-chevron.collapse-icon svg`, ['width', 'height', 'color', 'transition']);
	m.foot = await css(p, `${LEAF} .binders-outliner-foot .binders-outliner-cell`, TYPE);
	m.checkbox = await css(p, `${LEAF} .binders-outliner-cell input[type="checkbox"]`, ['width', 'height', 'margin']);
	m.nativeTreeChevron = await css(p, `.nav-folder-title .collapse-icon svg`, ['width', 'height', 'color']);
	await note(p, '06-outliner', m);
});

test('06b outliner: mid-drag', async (p) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	await openView(p);
	await mode(p, 'outliner');
	const a = await p.at(row('Part One/The keeper.md') + ' .binders-outliner-name'), b = await p.at(row('Part Two/Lights out.md'));
	await hold(p, { x: a.l + 300, y: a.y }, { x: a.l + 200, y: b.t + 3 });
	await shot(p, '06b-drag-row');
	await note(p, '06b-drag', { ghost: await css(p, '.drag-ghost', [...TYPE, ...BOX]), ghostText: await p.ev(`document.querySelector('.drag-ghost')?.innerText`), line: await css(p, '.drop-indicator.is-active, .binders-drop-line', ['width', 'height', 'border', 'position']) });
	const f = await p.at(row('Part Two'));
	await p.move(a.l + 200, f.y, 8, { buttons: 1 }); await p.sleep(300);
	await shot(p, '06b-drag-onto-folder');
	await p.key('Escape'); await letGo(p, a.l + 200, f.y); await p.sleep(400);
});

// ---------------------------------------------------------------------------------------------------------------
// 7. The manuscript
// ---------------------------------------------------------------------------------------------------------------

const scene = (name) => `${LEAF} .binders-manuscript-scene:has(.binders-manuscript-title[data-qa="${name}"])`;

test('07 manuscript: page, sections, editing', async (p, h) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	// a note with headings, a list, a quote, in the middle, to compare rendered and live
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('The Lighthouse/Part One/The keeper.md'); await app.vault.process(f, (t) => t + '\\n\\n## The lamp room\\n\\nHe showed her the lens, *slowly*, and the **brass**.\\n\\n- oil\\n- wick\\n- a rag\\n\\n> Never look straight at it.\\n\\nThen he went down.\\n'); })().then(() => 1)`);
	await openView(p);
	await mode(p, 'manuscript');
	await p.sleep(1500);
	await park(p);
	await shot(p, '07-manuscript-top');
	const m = {};
	m.page = await css(p, `${LEAF} .binders-manuscript-page`, ['maxWidth', 'margin', 'padding']);
	m.scroller = await css(p, `${LEAF} .binders-manuscript`, ['padding']);
	m.title = await css(p, `${LEAF} .binders-manuscript-title`, [...TYPE, 'padding']);
	m.break = await css(p, `${LEAF} .binders-manuscript-break`, ['margin', 'gap']);
	m.heading = await css(p, `${LEAF} .binders-manuscript-heading > *`, [...TYPE, 'margin']);
	m.rendered = await css(p, `${LEAF} .binders-manuscript-rendered p`, [...TYPE, 'margin']);
	m.synopsis = await css(p, `${LEAF} .binders-view-synopsis`, [...TYPE]);
	m.kinds = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].slice(0, 12).map(s => (s.querySelector('.binders-manuscript-title')?.textContent ?? '?') + ': ' + (s.querySelector('.cm-editor') ? 'editor' : 'rendered'))`);
	// rendered vs live: where each line of The keeper sits before and after clicking into it
	const tops = () => p.ev(`(() => { const s = [...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'The keeper'); const sc = document.querySelector('${LEAF} .binders-manuscript'); const els = s.querySelector('.cm-editor') && !s.querySelector('.binders-manuscript-editor.is-mounting') ? [...s.querySelectorAll('.cm-line')].filter(l => l.textContent.trim()) : [...s.querySelectorAll('.binders-manuscript-rendered :is(p, h1, h2, h3, li, blockquote p)')]; return { kind: s.querySelector('.cm-editor') ? 'editor' : 'rendered', scroll: sc.scrollTop, h: Math.round(s.getBoundingClientRect().height * 10) / 10, lines: els.map(e => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getClientRects()[0] ?? e.getBoundingClientRect(); return [e.textContent.slice(0, 14), Math.round((b.top + sc.scrollTop) * 10) / 10, Math.round(b.left * 10) / 10, getComputedStyle(e).fontSize, getComputedStyle(e).color]; }) }; })()`);
	const kp = await p.ev(`(() => { const s = [...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'The keeper'); s.scrollIntoView({ block: 'start' }); document.querySelector('${LEAF} .binders-manuscript').scrollTop -= 80; const r = s.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
	await p.sleep(900);
	m.before = await tops();
	await zoom(p, '07-keeper-rendered', kp.l - 30, kp.t - 20, kp.w + 60, Math.min(520, kp.h + 60), 2);
	await shot(p, '07-manuscript-keeper-before');
	const para = await p.ev(`(() => { const s = [...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'The keeper'); const e = s.querySelector('.binders-manuscript-rendered p, .cm-line'); const r = e.getBoundingClientRect(); return { x: r.left + 120, y: r.top + 10 }; })()`);
	await p.click(para.x, para.y);
	// frames of the swap
	const frames = [];
	for (let i = 0; i < 8; i++) { frames.push(await tops()); await p.sleep(40); }
	await p.sleep(900);
	m.after = await tops();
	m.swapFrames = frames.map((f) => [f.kind, f.h, f.lines[0]?.[1]]);
	await park(p);
	await zoom(p, '07-keeper-live', kp.l - 30, kp.t - 20, kp.w + 60, Math.min(520, kp.h + 60), 2);
	await shot(p, '07-manuscript-keeper-live');
	await p.type(' She waited.');
	await p.sleep(300);
	await shot(p, '07-manuscript-typing');
	// a scene's title: pointed at, renamed
	const tl = await p.ev(`(() => { const e = [...document.querySelectorAll('${LEAF} .binders-manuscript-title')].find(e => e.textContent === 'Storm warning'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top }; })()`);
	await p.move(tl.x, tl.y, 3); await p.sleep(300);
	await zoom(p, '07-title-hover', tl.l - 30, tl.t - 30, 760, 90, 2);
	await p.click(tl.x, tl.y); await p.sleep(400);
	await zoom(p, '07-title-click', tl.l - 30, tl.t - 30, 760, 90, 2);
	m.afterTitleClick = await p.ev(`document.activeElement.tagName + '.' + document.activeElement.className`);
	await p.key('Escape'); await p.sleep(200);
	// a folder heading pointed at
	const hd = await p.at(`${LEAF} .binders-manuscript-heading > *`);
	if (hd) { await p.move(hd.l + 30, hd.y, 3); await p.sleep(300); await zoom(p, '07-heading-hover', hd.l - 30, hd.t - 40, 760, 160, 2); }
	// the empty scene
	const un = await p.ev(`(() => { const s = [...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'Untitled'); s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
	await p.sleep(700); await park(p);
	await shot(p, '07-manuscript-empty-scene');
	// the end of the manuscript
	await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-manuscript'); s.scrollTop = s.scrollHeight; return 1; })()`);
	await p.sleep(900);
	await shot(p, '07-manuscript-end');
	// "Readable line length" off
	await p.ev(`(() => { app.vault.setConfig('readableLineLength', false); const s = document.querySelector('${LEAF} .binders-manuscript'); s.scrollTop = 0; return 1; })()`);
	await p.sleep(800);
	await shot(p, '07-manuscript-wide');
	m.pageWide = await css(p, `${LEAF} .binders-manuscript-page`, ['maxWidth', 'margin']);
	await h.open(L + 'Part One/The keeper.md');
	await p.sleep(700); await park(p);
	await shot(p, '07-native-note-wide');
	m.noteWide = await css(p, `${LEAF} .cm-sizer`, ['maxWidth', 'margin']);
	m.noteWideContent = await css(p, `${LEAF} .cm-content`, ['padding']);
	await p.ev(`(() => { app.vault.setConfig('readableLineLength', true); return 1; })()`);
	await p.sleep(600);
	await shot(p, '07-native-note-readable');
	m.noteLines = await p.ev(`[...document.querySelectorAll('${LEAF} .cm-line')].filter(l => l.textContent.trim()).map(e => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getClientRects()[0]; return [e.textContent.slice(0, 14), Math.round(b.top * 10) / 10, Math.round(b.left * 10) / 10, getComputedStyle(e).fontSize]; })`);
	await note(p, '07-manuscript', m);
});

// ---------------------------------------------------------------------------------------------------------------
// 8. The file explorer
// ---------------------------------------------------------------------------------------------------------------

test('08 explorer: binder folders beside stock folders', async (p, h) => {
	await seed(p, { big: false });
	await p.ev(`(async () => { await app.vault.createFolder('Research'); await app.vault.create('Research/Lighthouses of the north.md', 'Notes.'); await app.vault.create('Research/Tides.md', 'Notes.'); await app.vault.createFolder('Research/Maps'); await app.vault.create('Inbox.md', 'x'); })().then(() => 1)`);
	await sidebar(p, true);
	await openView(p);
	const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
	await p.ev(`(() => { app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); for (const f of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'Research']) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(900); await park(p);
	await zoom(p, '08-explorer', 44, 40, 300, 560, 2);
	const it = (path) => `.nav-files-container .tree-item-self[data-path="${path}"]`;
	const a = await p.at(it(L + 'Part One/Arrival.md'));
	await p.move(a.x, a.y, 3); await p.sleep(300);
	await zoom(p, '08-explorer-hover', 44, 40, 300, 560, 2);
	await p.click(a.x, a.y); await p.sleep(700); await park(p);
	await zoom(p, '08-explorer-active', 44, 40, 300, 560, 2);
	const m = {
		binderIcon: await css(p, `.binders-folder-tag`, ['marginRight', 'color', 'opacity']),
		binderTitle: await css(p, it('The Lighthouse'), [...TYPE, 'padding']),
		binderTitleText: await css(p, it('The Lighthouse') + ' .tree-item-inner', TYPE),
		stockFolderText: await css(p, it('Research') + ' .tree-item-inner', TYPE),
		stockFolder: await css(p, it('Research'), ['padding']),
		chevron: await css(p, it('The Lighthouse') + ' .collapse-icon', ['width', 'left', 'marginLeft']),
		dot: await css(p, `.binders-explorer-label`, ['width', 'height', 'marginLeft', 'marginRight']),
		binderX: await p.ev(`(() => { const x = (s) => document.querySelector(s)?.getBoundingClientRect().left; return { binderText: x(${j(it('The Lighthouse') + ' .tree-item-inner')}), stockText: x(${j(it('Research') + ' .tree-item-inner')}), icon: x('.binders-folder-tag'), fileText: x(${j(it('Inbox.md') + ' .tree-item-inner')}) }; })()`),
		order: await p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self')].map(e => e.dataset.path)`),
	};
	// a stock rename field, for the look of naming in place
	await p.ev(`(() => { const e = ${EXP}; e.startRenameFile?.(app.vault.getAbstractFileByPath('Research/Tides.md')); return 1; })()`);
	await p.sleep(500);
	await zoom(p, '08-native-rename', 44, 40, 300, 560, 2);
	m.nativeRename = await css(p, `.nav-files-container .is-being-renamed`, ['boxShadow', 'outline', 'backgroundColor', 'borderRadius']);
	await p.key('Escape'); await p.sleep(300);
	// dragging a note within the binder, then a stock one for comparison
	const from = await p.at(it(L + 'Part One/The keeper.md')), to = await p.at(it(L + 'Part Two/Lights out.md'));
	const dragTo = async (name, x, y) => {
		await p.ev(`(() => { const s = document.querySelector(${j(it(L + 'Part One/The keeper.md'))}); const dt = new DataTransfer(); window.__dt = dt; s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ${from.x}, clientY: ${from.y} })); const t = document.elementFromPoint(${x}, ${y}); for (const type of ['dragenter', 'dragover', 'dragover']) t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ${x}, clientY: ${y} })); return 1; })()`);
		await p.sleep(350);
		await zoom(p, name, 44, 40, 300, 560, 2);
		m[name] = { line: await css(p, '.binders-explorer-drop.is-active, .drop-indicator.binders-explorer-drop', ['border', 'width', 'height', 'position']), ghost: await p.ev(`document.querySelector('.drag-ghost')?.innerText ?? null`), over: await p.ev(`[...document.querySelectorAll('.is-being-dragged-over')].map(e => e.className)`) };
		await p.ev(`(() => { const t = document.elementFromPoint(${x}, ${y}); t.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: window.__dt })); document.querySelector(${j(it(L + 'Part One/The keeper.md'))}).dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: window.__dt })); return 1; })()`);
		await p.sleep(300);
	};
	await dragTo('08-explorer-drag-between', to.x, to.t + 2);
	const pt = await p.at(it(L + 'Part Two'));
	await dragTo('08-explorer-drag-onto-folder', pt.x, pt.y);
	const rs = await p.at(it('Research/Tides.md'));
	await dragTo('08-explorer-drag-stock', rs.x, rs.y);
	// its menu on a binder, on a note in a binder, and on a stock folder
	for (const [name, path] of [['binder', 'The Lighthouse'], ['binder-folder', L + 'Part One'], ['binder-note', L + 'Part One/Arrival.md'], ['stock-folder', 'Research'], ['stock-note', 'Research/Tides.md']]) {
		const r = await p.at(it(path));
		await p.right(r.x, r.y); await p.sleep(400);
		await shot(p, `08-explorer-menu-${name}`);
		m['menu-' + name] = await p.ev(`[...document.querySelectorAll('.menu > .menu-scroll > *, .menu > *')].filter(e => e.matches('.menu-item, .menu-separator')).map(e => e.matches('.menu-separator') ? '---' : e.querySelector('.menu-item-title')?.textContent + (e.matches('.is-warning') ? ' [warning]' : ''))`);
		await closeMenus(p);
	}
	await note(p, '08-explorer', m);
});

// ---------------------------------------------------------------------------------------------------------------
// 9. Menus
// ---------------------------------------------------------------------------------------------------------------

/** The open menus, outermost first: each item's title, icon, and whether it's a warning, checked or a label. */
const menus = (p) => p.ev(`[...document.querySelectorAll('.menu')].map(m => [...m.querySelectorAll('.menu-item, .menu-separator')].map(e => e.matches('.menu-separator') ? '---' : (e.querySelector('.menu-item-title')?.textContent ?? '') + ' {' + (e.querySelector('.menu-item-icon svg')?.getAttribute('class')?.replace('svg-icon ', '') ?? 'no icon') + '}' + (e.matches('.is-warning') ? ' [warning]' : '') + (e.matches('.is-label') ? ' [label]' : '') + (e.querySelector('.menu-item-icon.mod-submenu, .mod-submenu') ? ' >' : '') + (e.querySelector('.mod-checked, .menu-item-icon.mod-selected') || e.matches('.mod-checked, .is-checked') ? ' [checked]' : '')))`);

test('09 menus: every menu, and Obsidian’s own beside them', async (p) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	// (a folder's notes are on its own board)
	await openView(p, L + 'Part One');
	const out = {};
	const grab = async (name) => { await p.sleep(350); await shot(p, `09-menu-${name}`); out[name] = await menus(p); };
	const a = await p.at(card('Part One/The keeper.md'));
	await p.right(a.x, a.t + 22); await grab('card');
	await hoverMenu(p, 'Set status'); await grab('card-status');
	await closeMenus(p);
	await p.right(a.x, a.t + 22); await p.sleep(200);
	await hoverMenu(p, 'Set label'); await grab('card-label');
	await closeMenus(p);
	// two cards
	await p.click(a.x, a.t + 22);
	const s = await p.at(card('Part One/Storm warning.md'));
	await p.click(s.x, s.t + 22, { modifiers: 8 });
	await p.right(s.x, s.t + 22); await grab('cards-two');
	await closeMenus(p);
	// a folder's stack (on the binder's board), a stack and a note together, and the board itself
	await openView(p);
	const head = await p.at(card('Part One'));
	await p.right(head.x, head.t + 22); await grab('stack');
	await closeMenus(p);
	const pro = await p.at(card('Prologue.md'));
	await p.click(pro.x, pro.t + 22);
	await p.click(head.x, head.t + 22, { modifiers: 2 });
	await p.right(head.x, head.t + 22); await grab('stack-and-note');
	await closeMenus(p);
	const board = await p.at(`${LEAF} .binders-board`);
	await p.right(board.l + board.w - 200, board.t + 60); await grab('board');
	await closeMenus(p);
	// the toolbar's menus
	for (const [name, sel] of [['mode', '.binders-mode-button'], ['filter', '.binders-filter-button'], ['new', '.binders-new-button']]) {
		const b = await p.at(`${LEAF} ${sel}`);
		await p.click(b.x, b.y); await grab(name);
		await closeMenus(p);
	}
	// the pane's "More options"
	const more = await p.at(`${LEAF} .view-header .view-actions .clickable-icon:last-child`);
	await p.click(more.x, more.y); await grab('pane-corkboard');
	await hoverMenu(p, 'Card size').catch(() => {}); await grab('pane-card-size');
	await closeMenus(p);
	await mode(p, 'outliner');
	const r = await p.at(row('Part One/The keeper.md') + ' .binders-outliner-name');
	await p.right(r.l + 300, r.y); await grab('row');
	await closeMenus(p);
	await p.click(more.x, more.y); await grab('pane-outliner');
	await hoverMenu(p, 'Columns').catch(() => {}); await grab('pane-outliner-columns');
	await closeMenus(p);
	await mode(p, 'manuscript'); await p.sleep(900);
	const tl = await p.at(`${LEAF} .binders-manuscript-title`, 1);
	await p.right(tl.x, tl.y); await grab('manuscript-title');
	await closeMenus(p);
	const hd = await p.at(`${LEAF} .binders-manuscript-heading > *`);
	await p.right(hd.l + 20, hd.y); await grab('manuscript-heading');
	await closeMenus(p);
	const body = await p.at(`${LEAF} .binders-manuscript-scene .cm-content, ${LEAF} .binders-manuscript-rendered`);
	await p.right(body.l + 100, body.t + 10); await grab('manuscript-text');
	await closeMenus(p);
	await p.click(more.x, more.y); await grab('pane-manuscript');
	await closeMenus(p);
	const nw = await p.at(`${LEAF} .binders-new-button`);
	await p.click(nw.x, nw.y); await grab('new-manuscript');
	await closeMenus(p);
	writeFileSync(`${SHOTS}/${await theme(p)}-09-menus.json`, JSON.stringify(out, null, 1));
});

// ---------------------------------------------------------------------------------------------------------------
// 10. Dialogs, notices, settings
// ---------------------------------------------------------------------------------------------------------------

test('10 dialogs: export, merge, target, color, delete, settings', async (p, h) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	await openView(p);
	const out = {};
	const dialog = async (name) => {
		await p.sleep(450); await park(p); await shot(p, `10-dialog-${name}`);
		out[name] = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); if (!m) return null; return { title: m.querySelector('.modal-title')?.textContent, text: [...m.querySelectorAll('.modal-content p, .modal-content .setting-item-name, .modal-content .setting-item-description')].map(e => e.textContent), buttons: [...m.querySelectorAll('button')].map(b => b.textContent + (b.matches('.mod-cta') ? ' [cta]' : '') + (b.matches('.mod-warning') ? ' [warning]' : '')), inputs: [...m.querySelectorAll('input')].map(i => i.type + ':' + i.placeholder), width: Math.round(m.getBoundingClientRect().width) }; })()`);
		for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.modal').length`)); i++) { await p.key('Escape'); await p.sleep(250); }
	};
	// a folder, from its stack on the binder's board
	const head = await p.at(card('Part One'));
	await p.right(head.x, head.t + 22); await p.sleep(250); await clickMenu(p, 'Delete').catch(() => {}); await dialog('delete-folder');
	// the rest from notes' cards, on their folder's board
	await openView(p, L + 'Part One');
	const a = await p.at(card('Part One/The keeper.md')), s = await p.at(card('Part One/Storm warning.md'));
	const menu = async (items) => { await p.right(a.x, a.t + 22); await p.sleep(250); for (const [i, t] of items.entries()) { if (i < items.length - 1) await hoverMenu(p, t); else await clickMenu(p, t); } };
	await p.click(a.x, a.t + 22);
	await menu(['Set target...']); await dialog('target');
	await menu(['Set status', 'New status...']); await dialog('new-status');
	await menu(['Set label', 'Custom color...']); await dialog('custom-color');
	await menu(['Delete']); await dialog('delete-note');
	// Obsidian's own delete confirmation
	await p.ev(`(() => { app.vault.setConfig('promptDelete', true); app.fileManager.promptForDeletion(app.vault.getAbstractFileByPath('The Lighthouse/Part One/The keeper.md')); return 1; })()`);
	await dialog('native-delete');
	await p.click(a.x, a.t + 22); await p.click(s.x, s.t + 22, { modifiers: 8 });
	await p.right(s.x, s.t + 22); await p.sleep(250); await clickMenu(p, 'Merge 2 notes'); await dialog('merge');
	await p.right(s.x, s.t + 22); await p.sleep(250); await clickMenu(p, 'Delete 2 items'); await dialog('delete-two');
	await (await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`), h.run('export')); await dialog('export');
	// a bad target, for the notice
	await p.click(a.x, a.t + 22);
	await menu(['Set target...']); await p.sleep(300); await p.type('lots'); await p.key('Enter'); await p.sleep(500);
	await shot(p, '10-notice-bad-target');
	out.notices = await p.ev(`(() => { const probe = new Notice(''), d = probe.noticeEl.ownerDocument; probe.hide(); return [...d.querySelectorAll('.notice')].map(n => n.textContent).filter(Boolean); })()`);
	for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.modal').length`)); i++) { await p.key('Escape'); await p.sleep(250); }
	// a name that can't be used
	await p.key('F2'); await p.sleep(250); await p.type('Arrival'); await p.key('Enter'); await p.sleep(500);
	await shot(p, '10-notice-name-taken');
	out.notices2 = await p.ev(`(() => { const probe = new Notice(''), d = probe.noticeEl.ownerDocument; probe.hide(); return [...d.querySelectorAll('.notice')].map(n => n.textContent).filter(Boolean); })()`);
	await p.key('Escape'); await p.sleep(200);
	// "Add a column"
	await mode(p, 'outliner');
	const add = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
	await p.click(add.x, add.y); await p.sleep(300); await clickMenu(p, 'Other property...'); await dialog('add-column');
	// the settings tab
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await p.sleep(700);
	await shot(p, '10-settings-1');
	out.settings = await p.ev(`[...document.querySelectorAll('.modal .setting-item')].map(e => (e.matches('.setting-item-heading') ? '# ' : '') + (e.querySelector('.setting-item-name')?.textContent || e.querySelector('.setting-item-name input')?.value || '') + ' — ' + (e.querySelector('.setting-item-description')?.textContent ?? ''))`);
	await p.ev(`(() => { const c = [...document.querySelectorAll('.modal *')].reverse().find(e => e.scrollHeight > e.clientHeight + 40 && e.querySelector('.setting-item')); window.__set = c; if (c) c.scrollTop = 520; return 1; })()`); await p.sleep(300);
	await shot(p, '10-settings-2');
	await p.ev(`(() => { const c = window.__set; if (c) c.scrollTop = c.scrollHeight; return 1; })()`); await p.sleep(300);
	await shot(p, '10-settings-3');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	writeFileSync(`${SHOTS}/${await theme(p)}-10-dialogs.json`, JSON.stringify(out, null, 1));
});

// ---------------------------------------------------------------------------------------------------------------
// 11. A narrow pane
// ---------------------------------------------------------------------------------------------------------------

test('11 narrow: a 480 px pane, and 340 px', async (p) => {
	await seed(p);
	await sidebar(p, false);
	await openView(p);
	const out = {};
	for (const w of [480, 340]) {
		await size(p, w + 44, 900); await p.sleep(500);
		for (const m of ['corkboard', 'outliner', 'manuscript']) {
			await mode(p, m); await p.sleep(m === 'manuscript' ? 900 : 200);
			await park(p);
			await p.move(w, 880, 2);
			await shot(p, `11-narrow-${w}-${m}`);
			out[`${w}-${m}`] = await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'), b = v.querySelector('.binders-toolbar'); const r = (e) => e ? [Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().right)] : null; return { view: r(v), toolbarScroll: b.scrollWidth - b.clientWidth, mode: r(b.querySelector('.binders-mode-button')), count: r(b.querySelector('.binders-word-count')), progress: r(b.querySelector('.binders-progress')), filter: r(b.querySelector('.binders-filter-button')), add: r(b.querySelector('.binders-new-button')), pageScroll: v.scrollWidth - v.clientWidth }; })()`);
		}
		// a folder two deep, for the breadcrumbs
		await mode(p, 'corkboard');
		await openView(p, L + 'Part Two/Interlude/Dreams');
		await shot(p, `11-narrow-${w}-breadcrumbs`);
		out[`${w}-crumbs`] = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-crumb')].map(c => c.textContent + ' ' + Math.round(c.getBoundingClientRect().width) + '/' + c.scrollWidth)`);
		await openView(p);
		if (w === 480) { await mode(p, 'outliner'); await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-outliner'); s.scrollLeft = 200; return 1; })()`); await p.sleep(300); await shot(p, '11-narrow-480-outliner-scrolled'); await mode(p, 'corkboard'); }
	}
	await size(p, 1440, 900); await p.sleep(400);
	// and the wide pane's breadcrumbs, measured
	await openView(p, L + 'Part Two/Interlude/Dreams');
	out.wideCrumbs = await p.ev(`(() => { const n = document.querySelector('${LEAF} .binders-breadcrumbs'), b = n.parentElement; return { nav: [n.clientWidth, n.scrollWidth], bar: [b.clientWidth, b.scrollWidth], spacer: Math.round(b.querySelector('.binders-toolbar-spacer').getBoundingClientRect().width), crumbs: [...n.querySelectorAll('.binders-crumb')].map(c => c.textContent + ' ' + Math.round(c.getBoundingClientRect().width) + '/' + c.scrollWidth + ' shrink ' + getComputedStyle(c).flexShrink + ' min ' + getComputedStyle(c).minWidth + ' max ' + getComputedStyle(c).maxWidth) }; })()`);
	// what would let the crumbs have the room that's there: tried in place, nothing saved
	const tryCss = async (cssText) => { await p.ev(`(() => { document.getElementById('qa3-try')?.remove(); const s = document.head.createEl('style', { attr: { id: 'qa3-try' } }); s.textContent = ${j('')} + ${JSON.stringify('')} ; s.textContent = ${'`'}${'${'}'' + ${JSON.stringify('')}${'}'}${'`'}; return 1; })()`); await p.ev(`(() => { document.getElementById('qa3-try').textContent = ${JSON.stringify('X')}.replace('X', ${JSON.stringify(cssText)}); return 1; })()`); await p.sleep(200); return p.ev(`[...document.querySelectorAll('${LEAF} .binders-crumb')].map(c => c.textContent + ' ' + Math.round(c.getBoundingClientRect().width) + '/' + c.scrollWidth)`); };
	out.tryNoGap = await tryCss('.binders-breadcrumbs { gap: 0 }');
	out.tryNoCurrentMin = await tryCss('.binders-crumb.is-current { min-width: 0 }');
	out.tryNoShrinkNav = await tryCss('.binders-breadcrumbs { flex: 0 1 auto; width: max-content; }');
	out.tryCrumbBasis = await tryCss('.binders-crumb { flex: 0 1 auto; min-width: 0 } .binders-crumb.is-current { min-width: 0 }');
	out.tryNoMinAtAll = await tryCss('.binders-crumb, .binders-crumb.is-current { min-width: auto; overflow: visible }');
	await p.ev(`document.getElementById('qa3-try')?.remove()`);
	await note(p, '11-narrow', out);
});

// ---------------------------------------------------------------------------------------------------------------
// 12. A phone
// ---------------------------------------------------------------------------------------------------------------

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const longPress = async (p, x, y, ms = 700) => { await touch(p, 'touchStart', x, y); await p.sleep(ms); };

test('12 phone: 390×844, every mode, menus and sheets', async (p) => {
	await seed(p);
	const dark = (await theme(p)) === 'dark';
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	const out = {};
	try {
		await p.ev(`(async () => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); app.workspace.leftSplit?.collapse?.(); })().then(() => 1)`);
		await openView(p);
		await p.sleep(800);
		await shot(p, '12-phone-corkboard');
		await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-corkboard'); s.scrollTop = 420; return 1; })()`); await p.sleep(400);
		await shot(p, '12-phone-corkboard-scrolled');
		// a tap on a card, then a long press (its menu)
		const c = await p.at(card('Part One/The keeper.md'));
		if (c) {
			await tap(p, c.x, c.t + c.h - 16); await shot(p, '12-phone-card-tapped');
			await longPress(p, c.x, c.t + c.h - 16); await shot(p, '12-phone-card-held');
			await touch(p, 'touchEnd'); await p.sleep(600);
			await shot(p, '12-phone-card-menu');
			out.cardMenu = await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
			await p.ev(`(() => { document.querySelector('.menu-backdrop, .modal-bg, .suggestion-bg')?.click(); return 1; })()`); await p.sleep(300);
			await p.key('Escape'); await p.sleep(300);
		}
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y); await shot(p, '12-phone-mode-menu');
		await p.key('Escape'); await p.sleep(300);
		await p.ev(`document.querySelectorAll('.menu').forEach(m => m.remove())`);
		out.toolbar = await p.ev(`(() => { const r = (s) => { const e = document.querySelector('${LEAF} ' + s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { bar: r('.binders-toolbar'), mode: r('.binders-mode-button'), filter: r('.binders-filter-button'), add: r('.binders-new-button'), count: r('.binders-word-count'), header: r('.view-header'), chevron: null }; })()`);
		await mode(p, 'outliner'); await p.sleep(500);
		await shot(p, '12-phone-outliner');
		out.outliner = await p.ev(`(() => { const r = (s) => { const e = document.querySelector('${LEAF} ' + s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { row: r('.binders-outliner-row'), chevron: r('.binders-outliner-chevron.collapse-icon'), th: r('.binders-outliner-th[data-col="status"]'), add: r('.binders-outliner-th.mod-add'), resizer: r('.binders-outliner-resizer'), font: getComputedStyle(document.querySelector('${LEAF} .binders-outliner-name')).fontSize, synFont: getComputedStyle(document.querySelector('${LEAF} .binders-outliner-synopsis')).fontSize }; })()`);
		await mode(p, 'manuscript'); await p.sleep(1500);
		await shot(p, '12-phone-manuscript');
		out.manuscript = await p.ev(`(() => { const t = document.querySelector('${LEAF} .binders-manuscript-title'), s = document.querySelector('${LEAF} .binders-manuscript'); return { titleFont: getComputedStyle(t).fontSize, titleH: Math.round(t.getBoundingClientRect().height), pad: getComputedStyle(s).padding, text: getComputedStyle(document.querySelector('${LEAF} .binders-manuscript .cm-line, ${LEAF} .binders-manuscript-rendered p')).fontSize }; })()`);
		const line = await p.at(`${LEAF} .binders-manuscript .cm-line, ${LEAF} .binders-manuscript-rendered p`);
		if (line) { await tap(p, line.l + 60, line.y); await p.sleep(600); await shot(p, '12-phone-manuscript-editing'); }
		await mode(p, 'corkboard');
		// in a subfolder: the breadcrumbs
		await openView(p, L + 'Part Two/Interlude');
		await p.sleep(500);
		await shot(p, '12-phone-breadcrumbs');
		// a dialog
		await openView(p);
		await p.ev(`(app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export'))`); await p.sleep(700);
		await shot(p, '12-phone-export');
		await p.key('Escape'); await p.sleep(300);
		await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`);
		// Obsidian's own Bases cards on the phone, for comparison
		await p.ev(`(async () => { if (!app.vault.getAbstractFileByPath('Scenes.base')) await app.vault.create('Scenes.base', 'filters:\\n  and:\\n    - file.inFolder("The Lighthouse/Part One")\\nviews:\\n  - type: cards\\n    name: Cards\\n    order:\\n      - file.name\\n      - synopsis\\n      - status\\n'); await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Scenes.base')); })().then(() => 1)`);
		await p.sleep(1500);
		await shot(p, '12-phone-native-bases');
		out.nativeBases = await p.ev(`(() => { const r = (s) => { const e = document.querySelector('${LEAF} ' + s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { header: r('.bases-header'), item: r('.bases-toolbar .text-icon-button'), card: r('.bases-cards-item'), font: getComputedStyle(document.querySelector('${LEAF} .bases-cards-item') ?? document.body).fontSize }; })()`);
	} finally {
		writeFileSync(`${SHOTS}/${dark ? 'dark' : 'light'}-12-phone.json`, JSON.stringify(out, null, 1));
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
		await p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	}
});

// ---------------------------------------------------------------------------------------------------------------
// 13. Motion
// ---------------------------------------------------------------------------------------------------------------

/** Records, each animation frame for `ms`, what `probe` (an expression) returns. Start it, act, then read it. */
const record = (p, probe, ms = 900) => p.ev(`(() => { const rec = window.__rec = []; const t0 = performance.now(); const f = () => { const t = performance.now() - t0; try { rec.push([Math.round(t), ${probe}]); } catch (e) { rec.push([Math.round(t), 'error ' + e.message]); } if (t < ${ms}) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
const recorded = (p) => p.ev(`window.__rec`);
/** When the recorded value last changed, and how many different values there were. */
const settle = (rec) => { let last = 0, n = 0; for (let i = 1; i < rec.length; i++) if (JSON.stringify(rec[i][1]) !== JSON.stringify(rec[i - 1][1])) { last = rec[i][0]; n++; } return { frames: rec.length, changes: n, settledAt: last, first: rec[0]?.[1], end: rec[rec.length - 1]?.[1] }; };

test('13 motion: mode switch, reorder, fold, hover; and reduced motion', async (p) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	await openView(p);
	const out = {};
	const run = async (tag) => {
		const o = out[tag] = {};
		await openView(p);
		// mode switch: is there a frame with nothing drawn, or a toolbar that moves?
		for (const m of ['outliner', 'manuscript', 'corkboard']) {
			await record(p, `(() => { const v = document.querySelector('${LEAF} .binders-view'); const b = v.querySelector('.binders-toolbar')?.getBoundingClientRect(); const body = v.querySelector('.binders-mode'); const mb = v.querySelector('.binders-mode-button')?.getBoundingClientRect(); const cnt = v.querySelector('.binders-word-count')?.getBoundingClientRect(); const syn = v.querySelector('.binders-view-synopsis')?.getBoundingClientRect(); return [b ? Math.round(b.height * 10) / 10 : null, mb ? Math.round(mb.width) : null, cnt ? Math.round(cnt.left) : null, syn ? Math.round(syn.top * 10) / 10 + '@' + Math.round(syn.left) : null, body ? body.querySelectorAll('.binders-card[data-path], .binders-outliner-row, .binders-manuscript-scene').length : -1, body ? Math.round(body.scrollHeight) : -1]; })()`, 700);
			await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`);
			if (m === 'outliner') { await p.sleep(30); await shot(p, `13-${tag}-switch-30ms`); await p.sleep(40); await shot(p, `13-${tag}-switch-70ms`); }
			await p.sleep(800);
			const rec = await recorded(p);
			o['switch-' + m] = { ...settle(rec), values: rec.filter((r, i) => i === 0 || JSON.stringify(r[1]) !== JSON.stringify(rec[i - 1][1])).slice(0, 12) };
		}
		// a card dragged two places along: how long do the others glide, and the dropped card land?
		// (in Part One, on its own board)
		await openView(p, L + 'Part One');
		const a = await p.at(card('Part One/Arrival.md')), c = await p.at(card('Part One/Storm warning.md'));
		await hold(p, { x: a.x, y: a.t + 14 }, { x: c.l + c.w - 6, y: c.y });
		await record(p, `[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].slice(0, 4).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), getComputedStyle(e).boxShadow.slice(0, 18), e.className.replace('binders-card', '').trim().split(' ').filter(c => /is-/.test(c)).join('.')]; }).concat([[document.querySelectorAll('.binders-drag-ghost').length, document.getAnimations().length]])`, 900);
		await letGo(p, c.l + c.w - 6, c.y);
		await p.sleep(60); await shot(p, `13-${tag}-drop-60ms`); await p.sleep(100); await shot(p, `13-${tag}-drop-160ms`);
		await p.sleep(900);
		let rec = await recorded(p);
		o.drop = { ...settle(rec), sample: rec.filter((_, i) => i % 4 === 0).slice(0, 16) };
		// "Move up" by the keyboard (Alt+ArrowUp or the menu): the same glide without a drop
		await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-corkboard'); s.scrollTop = 0; return 1; })()`);
		// going into a folder from its stack, and back out by the breadcrumb: is there a frame with no cards?
		await openView(p);
		const probe = `(() => { const v = document.querySelector('${LEAF} .binders-view'); return [v.querySelectorAll('.binders-card[data-path]').length, v.querySelectorAll('.binders-crumb').length, Math.round(v.querySelector('.binders-toolbar')?.getBoundingClientRect().height * 10) / 10, document.getAnimations().length]; })()`;
		const st = await p.at(card('Part Two'));
		await record(p, probe, 700);
		await p.dbl(st.x, st.t + 22);
		await p.sleep(30); await shot(p, `13-${tag}-into-stack-30ms`);
		await p.sleep(800);
		let nav = await recorded(p);
		o.intoStack = { ...settle(nav), values: nav.filter((r, i) => i === 0 || JSON.stringify(r[1]) !== JSON.stringify(nav[i - 1][1])).slice(0, 12) };
		const up = await p.at(`${LEAF} .binders-crumb[data-path="The Lighthouse"]`);
		if (up) {
			await record(p, probe, 700);
			await p.click(up.x, up.y);
			await p.sleep(800);
			nav = await recorded(p);
			o.outOfStack = { ...settle(nav), values: nav.filter((r, i) => i === 0 || JSON.stringify(r[1]) !== JSON.stringify(nav[i - 1][1])).slice(0, 12) };
		}
		await openView(p);
		// a folder folded and unfolded in the outliner
		await mode(p, 'outliner');
		const ch = await p.at(row('Part One') + ' .binders-outliner-chevron');
		await record(p, `[[...document.querySelectorAll('${LEAF} .binders-outliner-row')].length, Math.round(document.querySelector(${j(row('Part Two'))}).getBoundingClientRect().top * 10) / 10, getComputedStyle(document.querySelector(${j(row('Part One') + ' .binders-outliner-chevron svg')})).transform, document.getAnimations().length]`, 700);
		await p.click(ch.x, ch.y);
		await p.sleep(30); await shot(p, `13-${tag}-fold-30ms`);
		await p.sleep(800);
		rec = await recorded(p);
		o.fold = { ...settle(rec), values: rec.filter((r, i) => i === 0 || JSON.stringify(r[1]) !== JSON.stringify(rec[i - 1][1])).slice(0, 14) };
		await record(p, `[[...document.querySelectorAll('${LEAF} .binders-outliner-row')].length, Math.round(document.querySelector(${j(row('Part Two'))}).getBoundingClientRect().top * 10) / 10, getComputedStyle(document.querySelector(${j(row('Part One') + ' .binders-outliner-chevron svg')})).transform, document.getAnimations().length]`, 700);
		await p.click(ch.x, ch.y);
		await p.sleep(800);
		rec = await recorded(p);
		o.unfold = { ...settle(rec), values: rec.filter((r, i) => i === 0 || JSON.stringify(r[1]) !== JSON.stringify(rec[i - 1][1])).slice(0, 14) };
		// Obsidian's own explorer folding, for the same measure
		await sidebar(p, true);
		const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
		await p.ev(`(() => { app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); ${EXP}.fileItems['The Lighthouse']?.setCollapsed(false); return 1; })()`); await p.sleep(600);
		const nt = await p.at(`.nav-files-container .tree-item-self[data-path="The Lighthouse/Part One"]`);
		if (nt) {
			await record(p, `[document.querySelectorAll('.nav-files-container .tree-item-self').length, Math.round((document.querySelector('.nav-files-container .tree-item-self[data-path="The Lighthouse/Part Two"]')?.getBoundingClientRect().top ?? 0) * 10) / 10, document.getAnimations().length]`, 700);
			await p.click(nt.x, nt.y); await p.sleep(800);
			rec = await recorded(p);
			o.nativeFold = { ...settle(rec), values: rec.filter((r, i) => i === 0 || JSON.stringify(r[1]) !== JSON.stringify(rec[i - 1][1])).slice(0, 14) };
		}
		await sidebar(p, false);
		await openView(p, L + 'Part One');
		await mode(p, 'corkboard');
		// hover: how long the card's border and a toolbar button take
		const k = await p.at(card('Part One/The keeper.md'));
		await park(p);
		await record(p, `getComputedStyle(document.querySelector(${j(card('Part One/The keeper.md'))})).boxShadow.slice(0, 20)`, 600);
		await p.move(k.x, k.t + 22, 2); await p.sleep(700);
		rec = await recorded(p);
		o.hoverCard = settle(rec);
		o.transitions = await p.ev(`(() => { const t = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).transitionProperty + ' / ' + getComputedStyle(e).transitionDuration : null; }; return { card: t('${LEAF} .binders-card[data-path]'), stack: t('${LEAF} .binders-card.is-stack'), crumb: t('${LEAF} .binders-crumb'), progressBar: t('${LEAF} .binders-progress-bar'), toolbarButton: t('${LEAF} .binders-toolbar-button'), editable: t('${LEAF} .binders-editable'), nativeNavItem: t('.nav-file-title'), nativeClickable: t('.clickable-icon'), reduce: matchMedia('(prefers-reduced-motion: reduce)').matches }; })()`);
	};
	await run('normal');
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	await p.sleep(300);
	await run('reduced');
	await p.send('Emulation.setEmulatedMedia', { features: [] });
	await note(p, '13-motion', out);
});

// ---------------------------------------------------------------------------------------------------------------
// 14. The settings tab, and the same thing measured in every mode
// ---------------------------------------------------------------------------------------------------------------

test('14 settings and consistency', async (p) => {
	await seed(p, { big: false });
	await sidebar(p, true);
	await openView(p);
	const out = {};
	const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
	await p.ev(`(() => { app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); for (const f of ['The Lighthouse', 'The Lighthouse/Part One']) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`); await p.sleep(600);
	const P = ['fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'borderRadius', 'padding', 'boxShadow', 'width', 'height', 'outline'];
	const keeper = 'Part One/The keeper.md';
	// what a folder's stack shows, on the binder's board; then a note's card, on its folder's
	const stack = { title: await css(p, card('Part One') + ' .binders-card-title', P), chip: await css(p, card('Part One') + ' .binders-chip', P), count: await css(p, card('Part One') + ' .binders-card-words', P), synopsis: await css(p, card('Part One') + ' .binders-card-synopsis', P), folderIcon: await css(p, card('Part One') + ' .binders-card-icon svg', ['width', 'height', 'color']) };
	await openView(p, L + 'Part One');
	const a = await p.at(card(keeper));
	await p.click(a.x, a.t + 22); await park(p); await p.sleep(300);
	out.corkboard = {
		title: await css(p, card(keeper) + ' .binders-card-title', P), synopsis: await css(p, card(keeper) + ' .binders-card-synopsis', P), chip: await css(p, card(keeper) + ' .binders-chip', P), words: await css(p, card(keeper) + ' .binders-card-words', P),
		labelStripe: await p.ev(`(() => { const c = document.querySelector(${j(card(keeper))}); return { backgroundColor: (() => { const v = getComputedStyle(c).getPropertyValue('--binders-label').trim(); if (!v) return 'rgba(0, 0, 0, 0)'; const d = document.body.createDiv(); d.style.color = v; const out = getComputedStyle(d).color; d.remove(); return out; })() }; })()`),
		selected: await css(p, card(keeper), P), stack, crumb: await css(p, `${LEAF} .binders-crumb[role="link"]`, P), crumbCurrent: await css(p, `${LEAF} .binders-crumb.is-current`, P), viewSynopsis: await css(p, `${LEAF} .binders-view-synopsis`, P), toolbarCount: await css(p, `${LEAF} .binders-word-count`, P),
	};
	await openView(p);
	out.explorer = { dot: await css(p, `.tree-item-self[data-path="${L}${keeper}"] .binders-explorer-label`, P), title: await css(p, `.tree-item-self[data-path="${L}${keeper}"]`, P), selectedNative: await p.ev(`(() => { const e = document.querySelector('.tree-item-self.is-active, .tree-item-self.has-focus'); return e ? getComputedStyle(e).backgroundColor : null; })()`) };
	await mode(p, 'outliner');
	const nm = await p.at(row(keeper) + ' .binders-outliner-name');
	await p.click(nm.l + 300, nm.y); await park(p); await p.sleep(300);
	out.outliner = { title: await css(p, row(keeper) + ' .binders-outliner-name', P), synopsis: await css(p, row(keeper) + ' .binders-outliner-synopsis', P), chip: await css(p, row(keeper) + ' .binders-chip', P), words: await css(p, row(keeper) + ' [data-col="words"]', P), dot: await css(p, row(keeper) + ' .binders-label-dot', P), labelText: await css(p, row(keeper) + ' [data-col="label"]', P), selectedCell: await p.ev(`(() => { const s = getComputedStyle(document.querySelector(${j(row(keeper) + ' .mod-title')})); return { backgroundImage: s.backgroundImage, backgroundColor: s.backgroundColor }; })()`), folderTitle: await css(p, row('Part One') + ' .binders-outliner-name', P), viewSynopsis: await css(p, `${LEAF} .binders-view-synopsis`, P) };
	await mode(p, 'manuscript'); await p.sleep(900);
	out.manuscript = { title: await css(p, `${LEAF} .binders-manuscript-title`, P), folderHeading: await css(p, `${LEAF} .binders-manuscript-heading > *`, P), viewSynopsis: await css(p, `${LEAF} .binders-view-synopsis`, P), text: await css(p, `${LEAF} .binders-manuscript .cm-line`, P) };
	// the menu's label dot
	await mode(p, 'corkboard');
	await openView(p, L + 'Part One');
	await p.right(a.x, a.t + 22); await p.sleep(250); await hoverMenu(p, 'Set label');
	out.menu = { dot: await css(p, `.menu .binders-label-dot`, P), item: await css(p, `.menu .menu-item-title`, P) };
	await closeMenus(p);
	// the same drag line in each place
	await note(p, '14-consistency', out);
	// the settings tab
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await p.sleep(900);
	await shot(p, '14-settings-1');
	const texts = await p.ev(`[...document.querySelectorAll('.modal.mod-settings .vertical-tab-content .setting-item')].map(e => (e.matches('.setting-item-heading') ? '# ' : '') + (e.querySelector('.setting-item-name input')?.value || e.querySelector('.setting-item-name')?.textContent || '') + ' — ' + (e.querySelector('.setting-item-description')?.textContent ?? ''))`);
	writeFileSync(`${SHOTS}/${await theme(p)}-14-settings.json`, JSON.stringify(texts, null, 1));
	for (const [i, top] of [[2, 560], [3, 1200], [4, 99999]]) { await p.ev(`(() => { const c = document.querySelector('.modal.mod-settings .vertical-tab-content'); if (c) c.scrollTop = ${top}; return 1; })()`); await p.sleep(300); await shot(p, `14-settings-${i}`); }
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
});

test('15 settings tab, and the outliner’s folder drop target', async (p) => {
	await seed(p, { big: false });
	await sidebar(p, false);
	await openView(p);
	await mode(p, 'outliner');
	const out = {};
	// a row held over a folder row: is the folder tinted?
	const a = await p.at(row('Prologue.md') + ' .binders-outliner-name'), f = await p.at(row('Part Two'));
	await hold(p, { x: a.l + 300, y: a.y }, { x: a.l + 300, y: f.y });
	out.folderRow = await p.ev(`(() => { const r = document.querySelector(${j(row('Part Two'))}); const s = getComputedStyle(r.querySelector('.mod-title')); return { cls: r.className, hovered: r.matches(':hover'), tint: getComputedStyle(r).getPropertyValue('--binders-ol-tint'), backgroundImage: s.backgroundImage, color: getComputedStyle(r).color }; })()`);
	await zoomOn(p, '15-outliner-folder-drop-target', row('Part Two'), 30);
	await p.key('Escape'); await letGo(p, a.l + 300, f.y); await p.sleep(400);
	// the settings tab
	await p.focusMain();
	out.open = await p.ev(`(async () => { try { app.setting.open(); await new Promise(r => setTimeout(r, 400)); app.setting.openTabById('binders'); await new Promise(r => setTimeout(r, 600)); const c = app.setting.containerEl; const info = { connected: c?.isConnected, sameDoc: c?.ownerDocument === document, cls: c?.className, active: app.setting.activeTab?.id ?? null, tabs: (app.setting.pluginTabs ?? []).map(t => t.id) }; if (c && (!c.isConnected || c.ownerDocument !== document)) document.body.appendChild(c); if (!app.setting.activeTab || app.setting.activeTab.id !== 'binders') { const t = (app.setting.pluginTabs ?? []).find(t => t.id === 'binders'); if (t) app.setting.openTab(t); } await new Promise(r => setTimeout(r, 500)); return { ...info, modals: document.querySelectorAll('.modal').length, after: app.setting.activeTab?.id ?? null }; } catch (e) { return String(e); } })()`);
	await shot(p, '15-settings-1');
	out.texts = await p.ev(`[...document.querySelectorAll('.modal .vertical-tab-content .setting-item')].map(e => (e.matches('.setting-item-heading') ? '# ' : '') + (e.querySelector('.setting-item-name input')?.value || e.querySelector('.setting-item-name')?.textContent || '') + ' — ' + (e.querySelector('.setting-item-description')?.textContent ?? ''))`);
	for (const [i, top] of [[2, 520], [3, 1100], [4, 99999]]) { await p.ev(`(() => { const c = document.querySelector('.modal .vertical-tab-content'); if (c) c.scrollTop = ${top}; return 1; })()`); await p.sleep(300); await shot(p, `15-settings-${i}`); }
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	await note(p, '15-settings', out);
});
