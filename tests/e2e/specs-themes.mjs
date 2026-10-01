// Themes: the binder view follows the theme's variables and Obsidian's appearance settings (accent color, radii, the
// editor's readable line length), in light and dark (run with --theme both).
import { VIEW, j, openView, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'themes: ' + name, fn });

const style = (sel, prop) => `getComputedStyle(document.querySelector('.workspace-leaf.mod-active ${sel}')).${prop}`;

test('the accent color and the theme’s radii and fonts are the view’s own', async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('accentColor', '#d9480f'); app.updateAccentColor?.(); return 1; })()`);
	const css = await p.ev(`(() => { const s = document.head.createEl('style', { attr: { id: 'binders-theme-probe' } }); s.textContent = 'body { --radius-m: 13px; --font-interface-theme: Georgia; --font-text-theme: Courier; }'; return 1; })()`);
	try {
		await openView(p);
		const c = await p.at(`.workspace-leaf.mod-active .binders-card[data-path]`);
		await p.click(c.x, c.y);
		await p.sleep(200);
		const accent = await p.ev(`(() => { const e = document.body.createDiv(); e.style.color = 'var(--interactive-accent)'; const v = getComputedStyle(e).color; e.remove(); return v; })()`);
		await p.sleep(200); // the ring fades in
		// (as on a canvas: a ring two pixels wide in the card's own color; without a label, the color of quiet text)
		const quiet = await p.ev(`(() => { const e = document.body.createDiv(); e.style.color = 'var(--text-muted)'; const v = getComputedStyle(e).color; e.remove(); return v; })()`);
		const ring = await p.ev(style('.binders-card.is-selected', 'boxShadow'));
		t.ok(ring.startsWith(quiet) && /0px 0px 0px 2px/.test(ring), 'a selected card has a ring in the theme’s quiet text color: ' + ring);
		t.ok(/^rgb/.test(accent), 'the accent color is read');
		t.eq(await p.ev(style('.binders-card[data-path]', 'borderTopLeftRadius')), '13px', 'cards follow --radius-m');
		// (what the writer wrote is in the vault's text font, as on a canvas card; what Binders says about it, the interface's)
		t.ok(/Courier/.test(await p.ev(style('.binders-card-title', 'fontFamily'))), 'a card’s title is in the text font');
		t.ok(/Georgia/.test(await p.ev(style('.binders-card-words', 'fontFamily'))), 'and its word count in the interface font');
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

test('pointing at the outliner shows no tooltip', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(500);
	const tip = () => p.ev(`(() => { const docs = new Set([document, ...[...document.querySelectorAll('iframe')].map(f => f.contentDocument).filter(Boolean)]); return [...docs].flatMap(d => [...d.querySelectorAll('.tooltip')]).map(e => e.textContent).join('|'); })()`);
	// rows and headers are named for screen readers; Obsidian would show those names as tooltips
	for (const sel of ['.binders-outliner-row .binders-outliner-name', '.binders-outliner-row [data-col="words"]', '.binders-outliner-th[data-col="status"]']) {
		const at = await p.at(`.workspace-leaf.mod-active ${sel}`);
		await p.move(at.x, at.y, 4);
		await p.sleep(1200);
		t.eq(await tip(), '', `no tooltip over ${sel}`);
	}
	await p.move(10, 10, 2);
});
