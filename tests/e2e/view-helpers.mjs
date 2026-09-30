// Helpers for the binder view specs (specs-view.mjs, specs-corkboard.mjs).
export const j = (x) => JSON.stringify(x);
export const PL = `app.plugins.plugins.binders`;
export const B = `${PL}.binders`;
export const NOTE = 'The Lighthouse/The Lighthouse.md';
export const file = (path) => `app.vault.getAbstractFileByPath(${j(path)})`;
/** The binder view in the active tab (or the first one open). */
export const VIEW = `(app.workspace.getLeavesOfType('binders-view').find(l => l === app.workspace.getMostRecentLeaf()) || app.workspace.getLeavesOfType('binders-view')[0])?.view`;

/** Polls an expression until it's truthy; returns its last value. */
export async function until(p, expr, ms = 3000) {
	let v;
	for (let i = 0; i < ms / 50; i++) { v = await p.ev(expr).catch(() => undefined); if (v) return v; await p.sleep(50); }
	return v;
}
export const read = (p, path) => p.ev(`app.vault.adapter.read(${j(path)})`);
export const exists = (p, path) => p.ev(`app.vault.adapter.exists(${j(path)})`);
/** Every note's text, by path. */
export const texts = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
/** A note's frontmatter and body, split by hand so we test the bytes on disk. */
export function split(text) {
	const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
	return m ? { yaml: m[1], body: m[2] } : { yaml: '', body: text };
}
/** The `contents` list as written on disk. */
export async function contents(p, path = NOTE) {
	const lines = split(await read(p, path)).yaml.split('\n');
	const i = lines.findIndex((l) => /^contents:/.test(l)), out = [];
	if (i < 0) return out;
	for (const l of lines.slice(i + 1)) { const m = /^\s+- (.*)$/.exec(l); if (!m) break; out.push(m[1].replace(/^(["'])(.*)\1$/, '$2')); }
	return out;
}
export const flush = (p) => p.ev(`${B}.flush().then(() => 1)`);
/** Removes folders and notes a test made (the runner restores the rest), then writes anything pending. */
export async function tidy(p) {
	await p.ev(`(async () => {
		const keep = new Set(['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'Longform demo']);
		const extra = app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !keep.has(f.path));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		await ${B}.flush();
	})().then(() => 1)`);
	await p.sleep(100);
}
export const withTidy = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await tidy(p); } };

/** Opens the binder view on a folder, as the plugin does, and waits for it to draw. */
export async function openView(p, folder = 'The Lighthouse', newLeaf = false) {
	// the main window is where menus go (the harness can leave Obsidian thinking another of its windows is active)
	await p.ev(`(async () => { window.dispatchEvent(new FocusEvent('focus')); await ${B}.ready; await ${PL}.openBinder(${file(folder)}, ${j(newLeaf)}); })().then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-view .binders-toolbar')`);
	await p.sleep(250);
}
/** State of the active binder view. */
export const viewState = (p) => p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view').find(l => l === app.workspace.getMostRecentLeaf()) || app.workspace.getLeavesOfType('binders-view')[0]; return l ? l.getViewState().state : null; })()`);
/** Cards shown, in order: their paths. */
export const cards = (p) => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].map(c => c.dataset.path)`);
export const selected = (p) => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-selected')].map(c => c.dataset.path)`);
export const card = (path) => `.workspace-leaf.mod-active .binders-card[data-path="${path}"]`;
/** Titles of the visible menu's items. */
export const menuItems = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
/** Clicks the visible menu item with this title (in the last menu shown, e.g. a submenu). */
export async function clickMenu(p, title) {
	const ok = await p.ev(`(() => { const all = [...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}); const it = all[all.length - 1]; if (!it) return false; it.click(); return true; })()`);
	if (!ok) throw new Error(`no menu item “${title}”: ` + (await menuItems(p)).join(', '));
	await p.sleep(200);
}
/** Hovers a menu item (opens its submenu). */
export async function hoverMenu(p, title) {
	const at = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no menu item “${title}”`);
	await p.move(at.x, at.y, 3);
	await p.click(at.x, at.y);
	await p.sleep(300);
}
/** Closes open menus as a person would (Escape), so Obsidian forgets them too. */
export async function closeMenus(p) {
	for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.menu').length`)); i++) { await p.key('Escape'); await p.sleep(150); }
}
/** Checks every note but the ones named is byte-for-byte what it was; `moved` maps old paths to new ones. */
export function same(t, before, after, { skip = [], moved = {} } = {}) {
	for (const [path, text] of Object.entries(before)) {
		if (skip.includes(path)) continue;
		t.eq(after[moved[path] ?? path], text, `“${path}” is unchanged`);
	}
}
/** Sets the frontmatter of a note as an external app would, bypassing Obsidian. */
export const writeRaw = (p, path, text) => p.ev(`app.vault.adapter.write(${j(path)}, ${j(text)}).then(() => 1)`);
/** Reloads Obsidian (mobile or desktop), waiting for Binders to be back. */
export async function reload(p, mobile = null) {
	await p.ev(`(() => { setTimeout(() => ${mobile == null ? 'location.reload()' : `app.emulateMobile(${mobile})`}, 50); return 1; })()`);
	await p.sleep(1500);
	for (let i = 0; i < 80; i++) { if (await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer${mobile == null ? '' : ` && app.isMobile === ${mobile}`})`).catch(() => false)) break; await p.sleep(250); }
	await p.ev(`app.plugins.plugins.binders.binders.ready.then(() => 1)`);
	await p.sleep(800);
	p.errors.length = 0; // a reload logs Electron's own warnings again
}
/** A real double-click (the driver's `dbl` sends two single clicks, which browsers don't count as one). */
export async function dblclick(p, x, y, modifiers = 0) {
	await p.move(x, y, 2);
	for (const clickCount of [1, 2]) {
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, modifiers });
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, modifiers });
		await p.sleep(40);
	}
	await p.sleep(150);
}
