// Keyboard and accessibility across the binder view: every control reachable with Tab, named, with a visible focus
// ring; menus and modes from the keyboard; Escape leaves every inline editor, back to what holds it.
import { VIEW, j, openView, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'keyboard: ' + name, fn });

/** What has the focus: its name for a screen reader, and whether a focus ring shows. */
const focused = `(() => {
	const e = document.activeElement; if (!e) return null;
	const cs = getComputedStyle(e);
	// (an outliner row draws its ring over its cells, on its ::after)
	const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || getComputedStyle(e, '::after').boxShadow !== 'none';
	const name = (e.getAttribute('aria-label') || (e.getAttribute('role') === 'link' ? e.textContent : '') || '').trim();
	return { cls: String(e.className), role: e.getAttribute('role') || e.tagName.toLowerCase(), name, ring, inView: !!e.closest('.binders-view') };
})()`;

/** Tabs from the top of the view until the focus leaves it; returns what had the focus on the way. */
async function tabThrough(p, max = 30) {
	await p.ev(`(() => { const v = document.querySelector('.workspace-leaf.mod-active .binders-view'); v.setAttribute('tabindex', '-1'); v.focus(); v.removeAttribute('tabindex'); return 1; })()`);
	const out = [];
	for (let i = 0; i < max; i++) {
		await p.key('Tab');
		const f = await p.ev(focused);
		if (!f?.inView) break;
		out.push(f);
		if (f.role === 'textbox') break; // the manuscript's editors take Tab, as Obsidian's editor does
	}
	return out;
}

test('Tab reaches every control of each mode; each is named and shows a focus ring', async (p, h, t) => {
	const want = {
		// (the cards are one stop, as a list is: the arrows go from card to card, a folder's stack among them)
		corkboard: ['binders-filter-button', 'binders-new-button', 'binders-mode-button', 'binders-view-synopsis', 'binders-card'],
		outliner: ['binders-mode-button', 'binders-view-synopsis', 'binders-outliner-th', 'binders-outliner-row'],
		manuscript: ['binders-mode-button', 'binders-view-synopsis', 'binders-manuscript-title'],
	};
	for (const mode of Object.keys(want)) {
		await openView(p, 'The Lighthouse');
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await p.sleep(800);
		const seen = await tabThrough(p);
		const classes = seen.map((f) => f.cls);
		for (const c of want[mode]) t.ok(classes.some((x) => x.split(' ').includes(c)), `${mode}: Tab reaches ${c} (${j(classes)})`);
		for (const f of seen) {
			if (f.role === 'textbox') continue; // an editor shows its caret instead
			t.ok(f.ring, `${mode}: ${f.cls} shows a focus ring`);
			if (f.role !== 'gridcell') t.ok(f.name, `${mode}: ${f.cls} (${f.role}) has a name`);
		}
	}
});

test('menus and modes from the keyboard: the mode menu, the commands, a card’s menu', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-mode-button').focus()`);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-mode-button').getAttribute('aria-haspopup')`), 'menu', 'the mode button says it opens a menu');
	await p.key('Enter');
	await p.sleep(200);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'Enter opens the mode menu');
	await p.key('ArrowDown'); await p.key('ArrowDown'); await p.key('Enter');
	await p.sleep(400);
	t.eq((await viewState(p)).mode, 'outliner', 'arrows and Enter pick a mode in it');
	await h.run('show-manuscript');
	await p.sleep(400);
	t.eq((await viewState(p)).mode, 'manuscript', 'the “Show manuscript” command');
	await h.run('show-corkboard');
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]')`);
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]').focus()`);
	await p.key('F10', 'shift');
	await p.sleep(200);
	t.ok(await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].some(e => e.textContent === 'Rename')`), 'Shift+F10 opens the card’s menu');
	await p.key('Escape');
	await p.sleep(200);
	t.ok(await p.ev(`!document.querySelector('.menu')`), 'Escape closes it');
	t.ok(await p.ev(`document.activeElement?.matches('.binders-card[data-path]')`), 'and the focus is back on the card');
	// a folder's stack: reached with the arrows, its menu is the folder's, and Enter goes into it
	await p.key('ArrowRight');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'The Lighthouse/Part One', 'Right goes on to the folder’s stack');
	t.ok((await p.ev(focused)).ring, 'which shows where the focus is');
	await p.key('F10', 'shift');
	await p.sleep(200);
	const items = await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
	t.ok(['Open', 'Rename', 'Edit synopsis', 'Ungroup', 'Delete'].every((x) => items.includes(x)), 'Shift+F10 opens the folder’s menu: ' + items.join(', '));
	await p.key('Escape');
	await p.sleep(200);
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'The Lighthouse/Part One', 'Escape: back on the stack');
	await p.key('Enter');
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card[data-path]')`);
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'The Lighthouse/Part One/Arrival.md', 'Enter goes into the folder, with the keyboard on its first card');
	// and out again from the keyboard: the breadcrumb is a link
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-crumb[role="link"]').focus()`);
	const crumb = await p.ev(focused);
	t.ok(crumb.name === 'The Lighthouse' && crumb.role === 'link', 'the folder above is a link in the breadcrumb, named: ' + j(crumb));
	await p.key('Enter');
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	await until(p, `document.activeElement?.dataset?.path === 'The Lighthouse/Part One'`);
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'The Lighthouse/Part One', 'Enter on it comes back out, to the stack');
});

test('a card tells a screen reader what it is: a note’s card its name, status and words; a stack its folder’s name', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	const said = (path) => p.ev(`(() => { const c = document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="${path}"]'); return { role: c.getAttribute('role'), name: c.getAttribute('aria-label'), about: c.getAttribute('aria-description') ?? '', selected: c.getAttribute('aria-selected'), list: c.parentElement.getAttribute('role') + ' ' + c.parentElement.getAttribute('aria-label') }; })()`);
	t.eq(j(await said('The Lighthouse/Prologue.md')), j({ role: 'option', name: 'Prologue', about: 'Status: Draft, 21 words', selected: 'false', list: 'listbox The Lighthouse' }), 'a note’s card: its name, then its status and words');
	const stack = await said('The Lighthouse/Part One');
	t.eq(j([stack.role, stack.name, stack.list]), j(['option', 'Part One', 'listbox The Lighthouse']), 'a folder’s stack is an option of the same list, named for the folder');
});

/** The accessibility tree as Chromium gives it to a screen reader, the nodes it leaves out skipped: each node its role,
    its name and the nodes it holds. */
async function axTree(p) {
	await p.send('Accessibility.enable');
	const { nodes } = (await p.send('Accessibility.getFullAXTree')).result;
	await p.send('Accessibility.disable');
	const by = new Map(nodes.map((n) => [n.nodeId, n]));
	// (a node left out, or one that is only a box, stands for nothing: what it holds is held by what holds it)
	const kids = (n) => (n.childIds ?? []).map((id) => by.get(id)).filter(Boolean).flatMap((c) => (c.ignored || ['generic', 'none', 'presentation'].includes(c.role?.value) ? kids(c) : [c]));
	const all = nodes.filter((n) => !n.ignored).map((n) => ({ role: n.role?.value, name: n.name?.value ?? '', kids: kids(n).map((c) => ({ role: c.role?.value, name: c.name?.value ?? '', id: c.nodeId })), id: n.nodeId }));
	const parent = new Map();
	for (const n of all) for (const k of n.kids) parent.set(k.id, n);
	const up = (n) => { const out = []; for (let a = parent.get(n.id); a; a = parent.get(a.id)) out.push(a.role); return out; };
	return { all, up };
}

test('the corkboard’s list of cards holds only cards, and is the grid that lays them out; an empty folder has no list of nothing', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	const L = 'The Lighthouse';
	let ax = await axTree(p);
	const lists = ax.all.filter((n) => n.role === 'listbox' && n.name === L);
	t.eq(lists.length, 1, 'a screen reader finds one list, named for the folder');
	t.eq(j(lists[0].kids.map((k) => [k.role, k.name])), j([['option', 'Prologue'], ['option', 'Part One'], ['option', 'Part Two'], ['option', 'Epilogue']]), 'and it holds the four cards, each an option, and nothing else');
	t.eq(ax.all.filter((n) => n.role === 'button' && /^New note in/.test(n.name)).length, 0, 'no “New note” tile after it');
	// the list is the grid itself: no wrapper without a box of its own between the grid and its cards
	const grid = await p.ev(`(() => { const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }; const cards = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')], g = cards[0].parentElement, cs = getComputedStyle(g); return { cards: cards.map(R), cls: g.className, role: g.getAttribute('role'), kids: g.children.length, cols: cs.gridTemplateColumns.trim().split(/\\s+/).length, gap: parseFloat(cs.columnGap), display: cs.display, contents: [...document.querySelectorAll('.workspace-leaf.mod-active .binders-board *')].filter(e => getComputedStyle(e).display === 'contents').length }; })()`);
	t.eq(j([grid.cls, grid.role, grid.display, grid.kids, grid.contents]), j(['binders-cards', 'listbox', 'grid', 4, 0]), 'the grid is the list, holds the four cards, and nothing on the board is “display: contents”');
	const cells = grid.cards, [x0, y0, w0] = cells[0], rows = [...new Set(cells.map((c) => c[1]))];
	t.ok(grid.cols >= 2 && cells.every((c, i) => c[0] === x0 + (i % grid.cols) * (w0 + grid.gap) && c[1] === rows[Math.floor(i / grid.cols)] && c[2] === w0) && rows.length === Math.ceil(cells.length / grid.cols) && rows[0] === y0, `the cards fill the grid’s cells in order (${grid.cols} columns): ${j(cells)}`);
	// a folder with nothing in it: no list of nothing, and the words that say how to make a note
	await p.ev(`app.vault.createFolder('The Lighthouse/Empty').then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="The Lighthouse/Empty"]')`);
	await openView(p, 'The Lighthouse/Empty');
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-empty') && !document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]')`);
	ax = await axTree(p);
	t.eq(ax.all.filter((n) => n.role === 'listbox').length, 0, 'an empty folder: there is no list with nothing in it');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-empty-text')?.textContent`), 'Use “New” above to add one.', 'and it says where a note is made');
	t.ok(await p.ev(`(() => { const b = document.querySelector('.workspace-leaf.mod-active .binders-new-button'); return !!b && !b.classList.contains('is-hidden') && b.getBoundingClientRect().width > 0; })()`), '“New” is there in the toolbar');
});

test('BUG: a stack tells a screen reader what it holds (“3 notes, 51 words”), as a note’s card says its words (a stack’s description leaves the count out)', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	const about = await p.ev(`(() => { const c = document.querySelector('.workspace-leaf.mod-active .binders-card.is-stack[data-path="The Lighthouse/Part One"]'); return [c.getAttribute('aria-label'), c.getAttribute('aria-description'), c.getAttribute('aria-roledescription')].filter(Boolean).join(' | '); })()`);
	// (the card is an option with a name of its own, so a screen reader says that name and the description: not the
	// "3 notes · 51 words" printed on it)
	t.ok(/3 notes/.test(about) && /51 words/.test(about), 'what the stack says includes its count: ' + j(about));
});

test('Escape leaves every inline editor, and the focus goes back to what holds it', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	const active = () => p.ev(`(() => { const e = document.activeElement; return e ? (e.matches('input, textarea') ? 'field' : [...e.classList].filter(c => c.startsWith('binders-')).join(' ')) : null; })()`);
	// the view's synopsis
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view-synopsis').focus()`);
	await p.key('Enter');
	t.eq(await active(), 'field', 'Enter edits the synopsis');
	await p.key('Escape');
	t.eq(await active(), 'binders-editable binders-view-synopsis', 'Escape: back on the synopsis');
	// a card's title (F2)
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]').focus()`);
	await p.key('F2');
	t.eq(await active(), 'field', 'F2 renames a card');
	await p.key('Escape');
	t.eq(await active(), 'binders-card', 'Escape: back on the card');
	// a stack's name (F2), and its synopsis (from its menu)
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card.is-stack').focus()`);
	await p.key('F2');
	t.eq(await active(), 'field', 'F2 renames a folder’s stack');
	await p.key('Escape');
	t.eq(await active(), 'binders-card', 'Escape: back on its card');
	t.ok(await p.ev(`document.activeElement.classList.contains('is-stack')`), '(the stack itself)');
	// an outliner row's title
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(500);
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-outliner-row').focus()`);
	await p.key('F2');
	t.eq(await active(), 'field', 'F2 renames a row');
	await p.key('Escape');
	t.ok((await active())?.includes('binders-outliner-row'), 'Escape: back on its row');
	t.ok(await p.ev(`app.vault.adapter.exists('The Lighthouse/Prologue.md')`), 'nothing renamed');
	t.ok(await p.ev(`app.vault.adapter.exists('The Lighthouse/Part One/Arrival.md')`), 'no folder either');
});

test('the folder’s synopsis under the toolbar keeps the keyboard after Escape, Tab or Mod+Enter leave its field (the view draws it again a moment later)', async (p, h, t) => {
	const S = '.workspace-leaf.mod-active .binders-view-synopsis';
	await openView(p);
	const before = await p.ev(`app.vault.adapter.read('The Lighthouse/The Lighthouse.md')`);
	for (const [what, typed, key, mod] of [['Escape', 'x', 'Escape'], ['Tab, nothing typed', '', 'Tab'], ['Tab', 'One.', 'Tab'], ['Mod+Enter', ' Two.', 'Enter', 'ctrl']]) {
		await p.ev(`(() => { document.querySelector(${j(S)}).focus(); return 1; })()`);
		await p.key('Enter');
		t.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', `${what}: Enter opens the field`);
		if (typed) await p.type(typed);
		await (mod ? p.key(key, mod) : p.key(key));
		// (long enough for the redraw that follows a field closing, and a note changing)
		await p.sleep(800);
		t.ok(await p.ev(`document.activeElement === document.querySelector(${j(S)})`), `${what}: the keyboard is on the synopsis, as drawn again (it’s on ${await p.ev(`document.activeElement.className || document.activeElement.tagName`)})`);
	}
	const after = await p.ev(`app.vault.adapter.read('The Lighthouse/The Lighthouse.md')`);
	t.ok(/^synopsis: One\. Two\.$/m.test(after), 'what Tab and Mod+Enter saved is in the binder note, and what Escape left isn’t');
	t.eq(after.split('---\n').pop(), before.split('---\n').pop(), 'whose text is as it was');
});

test('outliner: Escape in a status or label cell’s menu closes the menu and leaves the keyboard on the cell; Escape again goes back to the row', async (p, h, t) => {
	const ROW = '.workspace-leaf.mod-active .binders-outliner-row[data-path$="Arrival.md"]';
	const on = () => p.ev(`(() => { const a = document.activeElement; return a.classList.contains('binders-outliner-cell') ? 'cell ' + a.dataset.col : a.classList.contains('binders-outliner-row') ? 'row' : a.className || a.tagName; })()`);
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector(${j(ROW)})`);
	await p.sleep(300);
	for (const [col, presses] of [['label', 1], ['status', 2]]) {
		await p.ev(`(() => { document.querySelector(${j(ROW)}).focus(); return 1; })()`);
		for (let i = 0; i < presses; i++) await p.key('ArrowRight');
		t.eq(await on(), 'cell ' + col, `ArrowRight goes to the ${col} cell`);
		await p.key('Enter');
		await p.sleep(300);
		t.ok(await p.ev(`document.querySelectorAll('.menu').length`), 'Enter opens its menu');
		await p.key('Escape');
		await p.sleep(400);
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'Escape closes it');
		t.eq(await on(), 'cell ' + col, 'and the keyboard is still on the cell');
		await p.key('ArrowRight');
		await p.key('ArrowLeft');
		t.eq(await on(), 'cell ' + col, 'whose arrow keys work again');
		await p.key('Escape');
		t.eq(await on(), 'row', 'Escape again goes back to the row');
	}
});

test('the manuscript’s “Focus mode” button, an icon alone at any width, says what it is when pointed at', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-focus-button:not(.is-hidden)')`);
	await p.sleep(400);
	const b = await p.at('.workspace-leaf.mod-active .binders-focus-button');
	t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view').getBoundingClientRect().width >= 540`), 'in a pane wide enough that the other buttons show their names');
	await p.move(b.x - 60, b.y + 80, 2);
	await p.move(b.x, b.y, 6);
	await until(p, `!!document.querySelector('.tooltip')`, 2500);
	t.eq(await p.ev(`document.querySelector('.tooltip')?.textContent ?? null`), 'Focus mode', 'a tooltip names it');
});

test('forced colors (Windows high contrast): what is selected and what has the keyboard are outlined, since the mode takes every box-shadow ring away', async (p, h, t) => {
	const A = '.workspace-leaf.mod-active';
	await openView(p);
	const outline = (sel) => p.ev(`(() => { const e = ${sel ? `document.querySelector(${j(sel)})` : 'document.activeElement'}, cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; })()`);
	await p.ev(`(() => { document.querySelector('${A} .binders-card[data-path]').focus(); return 1; })()`);
	await p.key('ArrowRight');
	await p.sleep(300);
	t.ok(!(await outline()), 'as things are, a selected card’s ring is a shadow, with no outline');
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
	try {
		await p.sleep(300);
		t.ok(await p.ev(`matchMedia('(forced-colors: active)').matches`), 'forced colors are on');
		t.ok(await outline(), 'the selected card with the keyboard is outlined');
		await p.key('ArrowRight');
		await p.key('ArrowLeft', 'ctrl');
		t.ok(await outline(`${A} .binders-card.is-selected`), 'a selected card is outlined, with the keyboard or without');
		for (const [what, sel] of [['a toolbar button', '.binders-filter-button'], ['the word count', '.binders-word-count'], ['the folder’s synopsis', '.binders-view-synopsis']]) {
			await p.ev(`(() => { document.querySelector(${j(`${A} ${sel}`)}).focus(); return 1; })()`);
			t.ok(await outline(), `${what} with the keyboard is outlined`);
		}
		await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
		await until(p, `!!document.querySelector('${A} .binders-outliner-row')`);
		await p.ev(`(() => { document.querySelector('${A} .binders-outliner-row').focus(); return 1; })()`);
		await p.key('ArrowDown');
		await p.sleep(200);
		t.ok(await outline(), 'a row with the keyboard is outlined');
		await p.key('ArrowRight');
		t.ok(await outline(), 'and a cell');
		await p.ev(`(() => { document.querySelector('${A} .binders-outliner-th[data-col="title"]').focus(); return 1; })()`);
		t.ok(await outline(), 'and a column’s header');
	} finally {
		await p.send('Emulation.setEmulatedMedia', { features: [] });
	}
});

test('a screen reader is told where a card or a row moved by Alt+arrow is now, and that a filter is on', async (p, h, t) => {
	const A = '.workspace-leaf.mod-active';
	const said = () => p.ev(`[...document.querySelectorAll('${A} [aria-live="polite"][role="status"]')].map(e => e.textContent).filter(Boolean).join(' | ')`);
	await openView(p);
	await p.ev(`(() => { document.querySelector('${A} .binders-card[data-path$="Prologue.md"]').focus(); return 1; })()`);
	await p.key('ArrowRight', 'alt');
	await p.sleep(500);
	t.eq(await said(), 'Prologue moved to 2 of 4', 'a card moved on the corkboard');
	await p.key('ArrowLeft', 'alt');
	await p.sleep(500);
	t.eq(await said(), 'Prologue moved to 1 of 4', 'and moved back');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${A} .binders-outliner-row[data-path$="Arrival.md"]')`);
	await p.ev(`(() => { document.querySelector('${A} .binders-outliner-row[data-path$="Arrival.md"]').focus(); return 1; })()`);
	await p.key('ArrowDown', 'alt');
	await p.sleep(500);
	t.eq(await said(), 'Arrival moved to 2 of 3 in Part One', 'a row moved in the outliner, in a folder that isn’t the one shown');
	await p.key('ArrowUp', 'alt');
	await p.sleep(500);
	// the Filter button's name
	const name = () => p.ev(`document.querySelector('${A} .binders-filter-button').getAttribute('aria-label')`);
	t.eq(await name(), 'Filter', 'with no filter, the button is “Filter”');
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), filter: { status: ['Draft'], label: [] } } }); })().then(() => 1)`);
	await p.sleep(400);
	t.eq(await name(), 'Filter: 1 on', 'with one on, it says so');
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), filter: { status: [], label: [] } } }); })().then(() => 1)`);
});
