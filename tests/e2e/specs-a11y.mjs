// Keyboard and accessibility across the binder view: every control reachable with Tab, named, with a visible focus
// ring; menus and modes from the keyboard; Escape leaves every inline editor, back to what holds it.
import { VIEW, j, openView, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'keyboard: ' + name, fn });

/** What has the focus: its name for a screen reader, and whether a focus ring shows. */
const focused = `(() => {
	const e = document.activeElement; if (!e) return null;
	const cs = getComputedStyle(e);
	const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
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
		corkboard: ['binders-filter-button', 'binders-mode-button', 'binders-view-synopsis', 'binders-card', 'binders-card-new', 'binders-group-title', 'binders-group-synopsis'],
		plotgrid: ['binders-mode-button', 'binders-view-synopsis', 'binders-plotgrid-cell'],
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
	t.eq((await viewState(p)).mode, 'plotgrid', 'arrows and Enter pick a mode in it');
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
	// a new card
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card-new').focus()`);
	await p.key('Enter');
	t.eq(await active(), 'field', 'Enter starts a new card');
	await p.key('Escape');
	t.eq(await active(), 'binders-card binders-card-new', 'Escape: back on the New note button');
	// a plotline's name
	await p.ev(`(() => { ${VIEW}.setMode('plotgrid'); return 1; })()`);
	await p.sleep(500);
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-plotgrid-col').focus()`);
	await p.key('F2');
	t.eq(await active(), 'field', 'F2 renames a plotline');
	await p.key('Escape');
	t.ok((await active())?.includes('binders-plotgrid-col'), 'Escape: back on its column');
	t.ok(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-plotgrid-col[data-plotline="Mara"]')`), 'nothing renamed');
});
