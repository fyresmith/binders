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
		corkboard: ['binders-filter-button', 'binders-new-button', 'binders-mode-button', 'binders-view-synopsis', 'binders-card', 'binders-card-new'],
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
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card-new').getAttribute('aria-label')`), 'New note in The Lighthouse', 'the “New note” tile says where the note goes');
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
	// a new card
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card-new').focus()`);
	await p.key('Enter');
	t.eq(await active(), 'field', 'Enter starts a new card');
	await p.key('Escape');
	t.eq(await active(), 'binders-card binders-card-new', 'Escape: back on the New note button');
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
