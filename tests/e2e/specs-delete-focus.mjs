// Where the keyboard and the selection go after a delete, in the three boards that delete (the corkboard, the corkboard
// arranged by label, the outliner). Their code for it is alike but not the same, and these tests record what each does
// today so that the maintainer can say whether the differences are wanted. They pass on what is; none is a bug report.
//   - delete two notes that are not next to each other: the one after the last of them is selected and has the keyboard
//   - delete every note: the corkboard gives the keyboard to the toolbar's New button, the outliner keeps it on itself,
//     and the corkboard arranged by label leaves it on the page's body (the same code, minus its `focusNew`)
import { VIEW, answer, exists, flush, j, openView, until, withTidy } from './view-helpers.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'delete focus: ' + name, fn: withTidy(fn) });

const LEAF = '.workspace-leaf.mod-active';
const NAMES = ['A', 'B', 'C', 'D', 'E'];
const ITEMS = j(NAMES.map((n) => ({ path: `${n}.md`, text: `${n} text.\n` })));

/** The board's own item for a path, by view. */
const VIEWS = {
	corkboard: { item: (path) => `${LEAF} .binders-card[data-path="${path}"]`, selected: `${LEAF} .binders-card.is-selected`, all: `${LEAF} .binders-card[data-path]` },
	'by label': { item: (path) => `${LEAF} .binders-lanes .binders-card[data-path="${path}"]`, selected: `${LEAF} .binders-lanes .binders-card.is-selected`, all: `${LEAF} .binders-lanes .binders-card[data-path]` },
	outliner: { item: (path) => `${LEAF} .binders-outliner-row[data-path="${path}"] .binders-outliner-name`, selected: `${LEAF} .binders-outliner-row.is-selected`, all: `${LEAF} .binders-outliner-row[data-path]` },
};

/** Where it ends up today (the lanes give it to nothing: the page's body has it, so a key goes nowhere until the writer clicks). */
const THEN = {
	corkboard: { re: /binders-new-button/, what: 'on the toolbar’s New button' },
	'by label': { re: /obsidian-app/, what: 'on the page’s body, which is nowhere' },
	outliner: { re: /binders-outliner/, what: 'on the outliner itself' },
};

async function show(p, kind, folder) {
	await openView(p, folder);
	const options = kind === 'by label' ? "options: { arrange: 'label' }" : '';
	const mode = kind === 'outliner' ? 'outliner' : 'corkboard';
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), mode: '${mode}', ${options} } }); })()`);
	await until(p, `document.querySelectorAll('${VIEWS[kind].all}').length === ${NAMES.length}`, 6000);
	await p.sleep(500);
}
const paths = (p, sel) => p.ev(`[...document.querySelectorAll(${j(sel)})].map(e => e.dataset.path)`);
/** What has the keyboard: the board's item, or else what element. */
const keyboard = (p) => p.ev(`(() => { const a = document.activeElement, c = a?.closest?.('.binders-card, .binders-outliner-row'); return c ? { item: c.dataset.path } : { other: (a?.className || a?.tagName || '').toString().replace(/\\s+/g, ' ').slice(0, 70) }; })()`);
async function clickOn(p, sel, ctrl = false) {
	const at = await p.at(sel);
	if (!at) throw new Error('nothing to click: ' + sel);
	await p.click(at.x, at.y, ctrl ? { modifiers: 2 } : {});
	await p.sleep(150);
}

for (const kind of Object.keys(VIEWS)) {
	test(`${kind}: two notes that are not side by side are deleted; the one after the last is selected and has the keyboard`, async (p, h, t) => {
		await make(p, 'Del', ITEMS);
		await show(p, kind, 'Del');
		await clickOn(p, VIEWS[kind].item('Del/B.md'));
		await clickOn(p, VIEWS[kind].item('Del/D.md'), true);
		t.eq(j(await paths(p, VIEWS[kind].selected)), j(['Del/B.md', 'Del/D.md']), 'B and D are selected');
		await p.key('Delete'); await p.sleep(400);
		t.ok(await answer(p, 'Delete'), 'confirmed');
		await flush(p);
		await until(p, `!app.vault.getAbstractFileByPath('Del/D.md')`, 4000);
		await p.sleep(500);
		t.ok(!(await exists(p, 'Del/B.md')) && !(await exists(p, 'Del/D.md')) && (await exists(p, 'Del/C.md')), 'B and D are gone, and C is not');
		t.eq(j(await paths(p, VIEWS[kind].all)), j(['Del/A.md', 'Del/C.md', 'Del/E.md']), 'A, C and E are left, in order');
		t.eq(j(await paths(p, VIEWS[kind].selected)), j(['Del/E.md']), 'E, the one after the last deleted, is selected');
		t.eq(j(await keyboard(p)), j({ item: 'Del/E.md' }), 'and has the keyboard');
	});

	test(`${kind}: every note is deleted; where the keyboard is left`, async (p, h, t) => {
		await make(p, 'Del', ITEMS);
		await show(p, kind, 'Del');
		await clickOn(p, VIEWS[kind].item('Del/A.md'));
		// (the corkboard's Ctrl+A is not the same on the first click of a board: its cards are ticked one by one)
		if (kind === 'corkboard') for (const n of NAMES.slice(1)) await clickOn(p, VIEWS[kind].item(`Del/${n}.md`), true);
		else { await p.key('a', 'ctrl'); await p.sleep(300); }
		t.eq((await paths(p, VIEWS[kind].selected)).length, NAMES.length, 'all five are selected');
		await p.key('Delete'); await p.sleep(400);
		t.ok(await answer(p, 'Delete'), 'confirmed');
		await flush(p);
		await until(p, `!app.vault.getAbstractFileByPath('Del/E.md')`, 4000);
		await p.sleep(500);
		t.eq((await paths(p, VIEWS[kind].all)).length, 0, 'no item is left on the board');
		const where = await keyboard(p);
		t.ok(THEN[kind].re.test(where.other ?? ''), `the keyboard is ${THEN[kind].what} (${j(where)})`);
	});
}
