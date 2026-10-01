// Themes: the binder view follows the theme's variables and Obsidian's appearance settings (accent color, radii, the
// editor's readable line length), in light and dark (run with --theme both).
import { VIEW, j, openView, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'themes: ' + name, fn });

const style = (sel, prop) => `getComputedStyle(document.querySelector('.workspace-leaf.mod-active ${sel}')).${prop}`;

test('the accent color and the theme’s radii and fonts are the view’s own', async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('accentColor', '#d9480f'); app.updateAccentColor?.(); return 1; })()`);
	const css = await p.ev(`(() => { const s = document.head.createEl('style', { attr: { id: 'binders-theme-probe' } }); s.textContent = 'body { --radius-m: 13px; --font-interface-theme: Georgia; }'; return 1; })()`);
	try {
		await openView(p);
		const c = await p.at(`.workspace-leaf.mod-active .binders-card[data-path]`);
		await p.click(c.x, c.y);
		await p.sleep(200);
		const accent = await p.ev(`(() => { const e = document.body.createDiv(); e.style.color = 'var(--interactive-accent)'; const v = getComputedStyle(e).color; e.remove(); return v; })()`);
		t.eq(await p.ev(style('.binders-card.is-selected', 'borderTopColor')), accent, 'a selected card’s border is the accent color');
		t.eq(await p.ev(style('.binders-card[data-path]', 'borderTopLeftRadius')), '13px', 'cards follow --radius-m');
		t.ok(/Georgia/.test(await p.ev(style('.binders-card-title', 'fontFamily'))), 'and the interface font');
		t.ok(css, 'ok');
	} finally {
		await p.ev(`(() => { document.getElementById('binders-theme-probe')?.remove(); app.vault.setConfig('accentColor', ''); app.updateAccentColor?.(); return 1; })()`);
	}
});

test('the manuscript follows the editor’s “Readable line length”', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-manuscript-page')`);
	const width = () => p.ev(`Math.round(document.querySelector('.workspace-leaf.mod-active .binders-manuscript-page').getBoundingClientRect().width)`);
	const line = await p.ev(`(() => { const e = document.body.createDiv(); e.style.width = 'var(--file-line-width)'; const w = e.getBoundingClientRect().width; e.remove(); return Math.round(w); })()`);
	t.ok((await width()) <= line, `readable: the page is at most the line width (${await width()} ≤ ${line})`);
	await p.ev(`(() => { app.vault.setConfig('readableLineLength', false); return 1; })()`);
	try {
		await p.sleep(300);
		t.ok((await width()) > line + 50, `off: the page fills the pane (${await width()})`);
	} finally { await p.ev(`(() => { app.vault.setConfig('readableLineLength', true); return 1; })()`); }
	await p.sleep(300);
	t.ok((await width()) <= line, 'on again: readable');
});

test('pointing at the plot grid shows no tooltip but its headers’', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('plotgrid'); return 1; })()`);
	await p.sleep(500);
	const tip = () => p.ev(`(() => { const docs = new Set([document, ...[...document.querySelectorAll('iframe')].map(f => f.contentDocument).filter(Boolean)]); return [...docs].flatMap(d => [...d.querySelectorAll('.tooltip')]).map(e => e.textContent).join('|'); })()`);
	const cell = await p.at(`.workspace-leaf.mod-active .binders-plotgrid-cell`);
	await p.move(cell.x, cell.y, 4);
	await p.sleep(1200);
	t.eq(await tip(), '', 'no “Plot grid” tooltip over a cell');
	const col = await p.at(`.workspace-leaf.mod-active .binders-plotgrid-col`);
	await p.move(col.x, col.y, 4);
	await p.sleep(1200);
	t.eq(await tip(), 'Mara', 'a column header shows its name');
	await p.move(10, 10, 2);
});
