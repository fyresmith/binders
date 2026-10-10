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

test('a folder’s card is drawn from the theme: a card’s face and edge, at the theme’s radius', async (p, h, t) => {
	await p.ev(`(() => { const s = document.head.createEl('style', { attr: { id: 'binders-theme-probe' } }); s.textContent = 'body { --radius-m: 13px; --background-modifier-border-hover: rgb(200, 30, 40); --background-primary: rgb(250, 240, 230); --text-muted: rgb(10, 120, 60); }'; return 1; })()`);
	try {
		await openView(p);
		const stack = '.binders-card.is-stack[data-path="The Lighthouse/Part One"]';
		// nothing selected or pointed at
		const box = await p.at('.workspace-leaf.mod-active .binders-corkboard');
		await p.click(box.l + box.w - 40, box.t + box.h - 40);
		await p.sleep(300);
		// a folder's card is a card: a note's edge, and no cards drawn under it
		t.eq(await p.ev(style(stack, 'boxShadow')), await p.ev(style('.binders-card[data-path="The Lighthouse/Epilogue.md"]', 'boxShadow')), 'a folder’s card has the edge of a note’s card, from the theme');
		t.eq(await p.ev(style(stack, 'backgroundColor')), 'rgb(250, 240, 230)', 'its face is the theme’s background');
		t.eq(await p.ev(style(stack, 'borderTopLeftRadius')), '13px', 'a stack follows --radius-m');
		// selected: a ring in the theme's quiet text color, as any card without a label
		const c = await p.at(`.workspace-leaf.mod-active ${stack}`);
		await p.click(c.x, c.t + 14);
		await p.sleep(400);
		const ring = await p.ev(style(stack, 'boxShadow'));
		t.ok(ring.startsWith('rgb(10, 120, 60) 0px 0px 0px 2px'), 'selected, its ring is the theme’s quiet text color: ' + ring);
		const accent = await p.ev(`(() => { const e = document.body.createDiv(); e.style.color = 'var(--interactive-accent)'; const v = getComputedStyle(e).color; e.remove(); return v; })()`);
		t.ok(!ring.includes(accent), 'not the accent color');
	} finally {
		await p.ev(`(() => { document.getElementById('binders-theme-probe')?.remove(); return 1; })()`);
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

test('what Binders counts (a card’s words, a folder card’s notes, the outliner’s last row) is in the theme’s muted text, which can be read on the page; the faintest text is left to hints', async (p, h, t) => {
	await openView(p);
	const of = (v) => p.ev(`(() => { const e = document.body.createDiv(); e.style.color = 'var(${v})'; const c = getComputedStyle(e).color; e.remove(); return c; })()`);
	const muted = await of('--text-muted'), faint = await of('--text-faint');
	t.ok(muted !== faint, 'the theme has both');
	t.eq(await p.ev(style('.binders-card:not(.is-stack) .binders-card-words', 'color')), muted, 'a note’s card: its words');
	t.eq(await p.ev(style('.binders-card.is-stack .binders-card-words', 'color')), muted, 'a folder’s card: what it holds');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-outliner-foot .binders-outliner-cell')`);
	t.eq(await p.ev(style('.binders-outliner-foot .binders-outliner-cell.mod-title', 'color')), muted, 'the outliner’s last row');
	// (how well it reads: the ink over the page, as WCAG counts it; 4.5 is what it asks of text)
	const ratio = await p.ev(`(() => { const lum = (c) => { const [r, g, b] = c.match(/[\\d.]+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const a = lum(${j(muted)}), e = document.body.createDiv(); e.style.color = 'var(--background-primary)'; const b = lum(getComputedStyle(e).color); e.remove(); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })()`);
	t.ok(ratio >= 4.5, `muted text on the page is ${ratio.toFixed(1)}:1`);
});

test('a selected card’s ring is in its label’s color and can be seen on the page: in a light theme the paler labels’ rings are mixed toward the text color, to 3:1 or better', async (p, h, t) => {
	const LABELS = ['Yellow', 'Cyan', 'Green', 'Orange', 'Red'], files = ['Prologue.md', 'Epilogue.md', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md'];
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	/** A CSS color as [r, g, b], whatever notation it's computed in. */
	const RGB = `(c) => { const x = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }`;
	const RATIO = `(a, b) => { const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }`;
	const out = {};
	for (let i = 0; i < LABELS.length; i++) {
		const path = 'The Lighthouse/' + files[i];
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(path)}), fm => { fm.label = ${j(LABELS[i])}; }).then(() => 1)`);
		await openView(p, path.includes('Part One') ? 'The Lighthouse/Part One' : 'The Lighthouse');
		const sel = `.workspace-leaf.mod-active .binders-card[data-path="${path}"]`;
		await until(p, `document.querySelector(${j(sel)})?.classList.contains('has-label')`);
		const c = await p.at(sel);
		await p.click(c.x, c.t + c.h - 12);
		await p.sleep(350); // the ring fades in
		out[LABELS[i]] = await p.ev(`(() => { const rgb = ${RGB}, ratio = ${RATIO}; const e = document.querySelector(${j(sel)}), cs = getComputedStyle(e); const ring = cs.boxShadow.split(/ 0px 0px 0px 2px/)[0]; const probe = document.body.createDiv(); probe.style.color = 'var(--color-${LABELS[i].toLowerCase()})'; const label = getComputedStyle(probe).color; probe.style.color = 'var(--background-primary)'; const page = getComputedStyle(probe).color; probe.remove(); return { ring: Math.round(ratio(rgb(ring), rgb(page)) * 100) / 100, label: Math.round(ratio(rgb(label), rgb(page)) * 100) / 100, same: String(rgb(ring)) === String(rgb(label)) }; })()`);
	}
	const low = Object.entries(out).filter(([, v]) => v.ring < 3).map(([k, v]) => `${k} ${v.ring}`);
	t.eq(j(low), '[]', 'every ring reaches 3:1 on the page: ' + j(out));
	if (dark) t.ok(Object.values(out).every((v) => v.same), 'in a dark theme the ring is the label’s own color: ' + j(out));
	else t.ok(Object.values(out).every((v) => !v.same && v.ring > v.label), 'in a light theme it’s the label’s color taken toward the text’s: ' + j(out));
});
