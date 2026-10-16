// Tooltips on Binders' own surfaces. Obsidian shows the aria-label of whatever is under the pointer as a tooltip, unless
// the element's `--no-tooltip` is true, and Binders names regions, rows, cards and counts for a screen reader: those
// tooltips popped up over the timeline's board, its months and its tray, the word count, the Revision pane's list and
// the Export window's preview (the maintainer, 2026-10-16: "a tooltip appears where it most definitely should not").
// On the binder view, its panes and its windows only an icon with no name beside it shows one, as in Obsidian.
// Needs a hovering mouse (`BINDERS_HOVER=1`): without one, these say so and pass without looking.
import { VIEW, j, openView, until, withTidy } from './view-helpers.mjs';
import { seed } from './specs-timeline.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'tooltips: ' + name, fn: withTidy(fn) });
const LEAF = '.workspace-leaf.mod-active';
const DATES = { 'Prologue.md': '1986-12', 'Part One/Arrival.md': '1987-06-11', 'Part One/The keeper.md': '1987-06-11', 'Part One/Storm warning.md': '1987-06-17', 'Part Two/The wreck.md': '1987-06-19' };
const needsHover = async (p) => { if ((await p.pointer()) === 'mouse') return false; console.log('    · skipped: needs a hovering mouse (BINDERS_HOVER=1)'); return true; };

/** Every name in sight inside `root` that Obsidian would show on hover, other than an icon button's (a toolbar button
    with its label hidden is one). */
const shown = (p, root) => p.ev(`[...document.querySelectorAll(${j(root + ' [aria-label]')})].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).getPropertyValue('--no-tooltip').trim() !== 'true' && !e.matches('.clickable-icon') && !(e.matches('.binders-toolbar-button') && getComputedStyle(e.querySelector('.text-button-label') ?? e).display === 'none') && !e.closest('.view-header'); }).map(e => e.getAttribute('aria-label'))`);
/** The tooltip that comes up with the pointer resting `dx`, `dy` into the element (none: null). */
async function tipAt(p, sel, dx = 40, dy = 12) {
	const r = await p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + Math.min(${dx}, r.width / 2), y: r.top + Math.min(${dy}, r.height / 2) }; })()`);
	if (!r) throw new Error('not in sight: ' + sel);
	await p.move(5, 5, 2);
	await p.sleep(150);
	await p.move(r.x, r.y, 4);
	await p.sleep(1300);
	const tip = await p.tooltip();
	await p.move(5, 5, 2);
	return tip;
}

test('the binder view: no tooltip over the word count or the timeline’s board, a month or the tray; Focus mode’s icon still says its name', async (p, h, t) => {
	if (await needsHover(p)) return;
	await openView(p);
	await seed(p, DATES);
	t.eq(await tipAt(p, `${LEAF} .binders-word-count`, 10, 6), null, 'the word count');
	t.eq(j(await shown(p, `${LEAF} .binders-view`)), j([]), 'nothing else in the corkboard');
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, timelineShape: 'down' }; v.setMode('timeline'); return 1; })()`);
	await until(p, `!!document.querySelector('${LEAF} .binders-timeline-group')`);
	await p.sleep(500);
	t.eq(await tipAt(p, `${LEAF} .binders-timeline-group`, 200, 8), null, 'a month of the timeline');
	t.eq(await tipAt(p, `${LEAF} .binders-timeline-tray-head`), null, 'the tray’s head');
	t.eq(await tipAt(p, `${LEAF} .binders-timeline-tray-cards`, 20, 220), null, 'the tray, between its cards');
	t.eq(j(await shown(p, `${LEAF} .binders-view`)), j([]), 'nothing else in the timeline');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('${LEAF} .binders-focus-button:not(.is-hidden)')`);
	t.eq(await tipAt(p, `${LEAF} .binders-focus-button`, 8, 8), 'Focus mode', 'an icon with no name beside it says what it is');
});

test('the small dialogs and the settings: no tooltip over a field (Rewrite’s name, a label’s name and colour); the settings’ icons still say their names', async (p, h, t) => {
	if (await needsHover(p)) return;
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('The Lighthouse/Prologue.md')).then(() => 1)`);
	await p.sleep(700);
	await p.ev(`(() => { app.commands.executeCommandById('binders:rewrite'); return 1; })()`);
	await until(p, `!!document.querySelector('.modal input[aria-label="Name for the snapshot"]')`, 6000);
	await p.sleep(300);
	t.eq(await tipAt(p, '.modal input[aria-label="Name for the snapshot"]'), null, 'Rewrite’s name for the snapshot');
	t.eq(j(await shown(p, '.modal')), j([]), 'nothing else in the dialog');
	for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.modal-container').length`)); i++) { await p.key('Escape'); await p.sleep(200); }
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	// (Obsidian 1.13 draws the settings in a window of their own, where the driver's pointer doesn't go: what Obsidian
	// reads there before it shows a tooltip, `--no-tooltip`, is read instead)
	await until(p, `!!app.setting.activeTab?.containerEl?.querySelector('input[aria-label="Label name"]')`, 8000);
	const tips = await p.ev(`(() => { const c = app.setting.activeTab.containerEl, w = c.ownerDocument.defaultView, on = (e) => w.getComputedStyle(e).getPropertyValue('--no-tooltip').trim() !== 'true'; return JSON.stringify({ fields: [...c.querySelectorAll('[aria-label]:not(.clickable-icon)')].filter(on).map(e => e.getAttribute('aria-label')), icons: [...c.querySelectorAll('.clickable-icon[aria-label]')].filter(e => !on(e)).map(e => e.getAttribute('aria-label')), iconCount: c.querySelectorAll('.clickable-icon[aria-label]').length }); })()`).then(JSON.parse);
	t.eq(j(tips.fields), j([]), 'no field or row of the settings shows its name on hover (a label’s name, its colour, a status)');
	t.ok(tips.iconCount > 0, 'the settings have icons with names: ' + tips.iconCount);
	t.eq(j(tips.icons), j([]), 'and each of them still shows its name on hover (Add label, Delete, Drag to rearrange)');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	t.eq(p.errors.filter((e) => e.ours).length, 0, 'with no error of Binders’');
});

test('the Revision pane and the Export window: no tooltip over the list or the preview; their icon buttons still say their names', async (p, h, t) => {
	if (await needsHover(p)) return;
	await openView(p);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-revision'); return 1; })()`);
	const PANE = '.workspace-leaf-content[data-type="binders-revision"]';
	await until(p, `!!document.querySelector(${j(PANE + ' .binders-revision-list')})`);
	await p.sleep(400);
	t.eq(await tipAt(p, `${PANE} .binders-revision-list`, 60, 60), null, 'the Revision pane’s list');
	t.eq(j(await shown(p, PANE)), j([]), 'nothing else in the pane');
	t.eq(await tipAt(p, `${PANE} .nav-action-button[aria-label="Add revision task"]`, 8, 8), 'Add revision task', 'its plus says what it does');
	await openView(p);
	await p.ev(`(() => { app.commands.executeCommandById('binders:export'); return 1; })()`);
	const WIN = '.modal.binders-export';
	await until(p, `!!document.querySelector(${j(WIN + ' .binders-export-scroll')})`, 6000);
	await p.sleep(400);
	t.eq(await tipAt(p, `${WIN} .binders-export-scroll`, 200, 200), null, 'the preview of the text');
	t.eq(await tipAt(p, `${WIN} .binders-snapshots-item`, 60, 10), null, 'an export in the list');
	t.eq(j(await shown(p, WIN)), j([]), 'nothing else in the window');
	t.eq(await tipAt(p, `${WIN} .clickable-icon[aria-label="Book details"]`, 8, 8), 'Book details', 'its Book details icon says what it is');
	for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.modal-container').length`)); i++) { await p.key('Escape'); await p.sleep(200); }
	await p.ev(`(() => { for (const l of app.workspace.getLeavesOfType('binders-revision')) l.detach(); return 1; })()`);
	t.eq(p.errors.filter((e) => e.ours).length, 0, 'with no error of Binders’');
});

