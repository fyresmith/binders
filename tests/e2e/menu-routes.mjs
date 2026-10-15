// Where a menu's row is now. A card's menu and the view's "More options" keep their less used rows in drawers (Move,
// Snapshots, Export as, More; Cards, Snapshots, Export). A test that chooses a row by its title goes through here:
// if the title is not in a menu on screen, the drawer that holds it is opened first, by the caller's own way of
// opening (a click or a tap). One map, so a row that moves again is one edit.
const j = (x) => JSON.stringify(x);

/** Each drawer, and the rows it holds (a card's menu and "More options" both). */
export const DRAWERS = {
	Move: ['Move up', 'Move down', 'Put in a new folder', 'New folder from selection', 'Ungroup'],
	Snapshots: ['Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Snapshots of notes that are gone...'],
	More: ['Set target...', 'Set story date...', 'Remove story date', 'Shift story dates...', 'Set synopsis from text', 'Add revision task...', 'Duplicate', 'Split at headings...'],
	Export: ['Export again', 'Export...'],
	Cards: ['Tint cards with their label color', 'Number the cards'],
};
/** A row that is no longer on the top level: its drawer. */
export const DRAWER_OF = Object.fromEntries(Object.entries(DRAWERS).flatMap(([d, rows]) => rows.map((r) => [r, d])));
/** Rows that were a drawer of their own, now another: "Move to" is "Move" (the folders come first-hand), "Card size" is "Cards". */
const RENAMED = { 'Move to': 'Move', 'Card size': 'Cards' };
/** "Include in export" is the switch under "Export as": a row that is not a title but a choice made when it is open. */
export const TOGGLE = '\u0000include in export';

/** Every row title on screen, in every open menu. */
export const onScreen = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);

/** Whether the menu on screen offers `title`: as a row of its own, or in a drawer it shows. What a writer asks ("is
    Duplicate there?"), not where it is: a test that only needs the action offered asks this, and keeps passing when
    the rows are moved, renamed into a drawer or reordered (ROADMAP.md, "Tests ask what a writer would"). */
export async function offers(p, title) {
	const shown = await onScreen(p);
	return shown.includes(title) || (!!DRAWER_OF[title] && shown.includes(DRAWER_OF[title]));
}

/** The path to a row from the menu on screen: its title with the drawers it is in put before it. A path that is
    already reachable (its first title is on screen) is returned as it is. */
export async function expand(p, path) {
	const [first, ...rest] = path;
	const shown = await onScreen(p);
	if (shown.includes(first)) return path;
	if (RENAMED[first]) return [RENAMED[first], ...rest];
	if (first === 'Include in export') return ['Export as', TOGGLE, ...rest];
	if (DRAWER_OF[first]) return [DRAWER_OF[first], first, ...rest];
	return path;
}

/** The title to look for for a step of an expanded path (the switch under "Export as": leave out, or put back). */
export async function real(p, title) {
	if (title !== TOGGLE) return title;
	const left = await p.ev(`(() => { const ms = [...document.querySelectorAll('.menu')], m = ms[ms.length - 1]; const it = m && [...m.querySelectorAll('.menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'Leave out'); return !!it && (it.classList.contains('mod-checked') || it.classList.contains('is-checked') || !!it.querySelector('.menu-item-icon.mod-checked')); })()`);
	if (!left) return 'Leave out';
	return (await p.ev(`(() => { const ms = [...document.querySelectorAll('.menu')], m = ms[ms.length - 1]; return [...m.querySelectorAll('.menu-item-title')].map(e => e.textContent).find(t => t.startsWith('Automatic')) ?? null; })()`)) ?? 'Automatic';
}

/** Picks a row by its title the way `tapOne` does one tap, through its drawers; true if every step was found. */
export async function throughDrawers(p, title, tapOne) {
	const path = await expand(p, [title]);
	for (let i = 0; i < path.length; i++) {
		const ok = await tapOne(await real(p, path[i]));
		if (!ok) return false;
		if (i < path.length - 1) await p.sleep(450);
	}
	return true;
}

/** Every title a card's or row's menu once had at its top level, and "More options" (for the test that every
    action is still found somewhere). From the menus before the grouping (origin/main at 2c6c2de). */
export const OLD_ITEM_TITLES = ['Select more', 'Open', 'Open in new tab', 'Open to the right', 'Open folder note', 'Rename', 'Edit synopsis', 'Set synopsis from text', 'Add revision task...', 'Snapshots', 'Set status', 'Set label', 'Set target...', 'Set story date...', 'Remove story date', 'Shift story dates...', 'Duplicate', 'Merge 2 notes', 'Split at headings...', 'Put in a new folder', 'New folder from selection', 'Export...', 'Ungroup', 'Include in export', 'Export as', 'Take a snapshot', 'Show snapshots...', 'Move up', 'Move down', 'Move to', 'Delete'];
export const OLD_PANE_TITLES = ['Card size', 'Tint cards with their label color', 'Number the cards', 'Show synopses', 'Columns', 'Expand all', 'Collapse all', 'Find in binder', 'Find and replace in binder', 'Add revision task', 'Export...', 'Export again', 'Take a snapshot', 'Show snapshots...', 'Snapshots of notes that are gone...', 'Show progress', 'Show contents', 'Open binder note'];
export const toolbarOnly = j(['Corkboard', 'Outliner', 'Manuscript', 'Timeline', 'In a grid', 'By label, across', 'By label, down', 'Show notes in subfolders', 'Show unused labels', 'Time down', 'Time across']);

/** Every title a menu on screen offers, drawers included, for a touch screen: each drawer is tapped (with the `tap(p, x, y)`
    of the spec file) and, on a phone, where it takes the sheet's place, its name is tapped to come back. The menu is as it
    was found when this returns. */
export async function menuItemsAllTouch(p, tap) {
	const out = new Set(await onScreen(p));
	const names = Object.keys(DRAWERS).concat('Export as');
	const rows = await p.ev(`[...document.querySelectorAll('.menu .menu-item.has-submenu')].map(e => e.querySelector('.menu-item-title')?.textContent).filter(t => ${j(names)}.includes(t))`);
	const at = (title) => p.ev(`(() => { const ms = [...document.querySelectorAll('.menu')]; const it = ms.flatMap(m => [...m.querySelectorAll('.menu-item')]).filter(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}).pop(); if (!it) return null; it.scrollIntoView({ block: 'center' }); const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	for (const d of rows) {
		const a = await at(d);
		if (!a) continue;
		await p.sleep(300);
		const b = await at(d);
		await tap(p, b.x, b.y);
		await p.sleep(450);
		for (const t of await onScreen(p)) out.add(t);
		const back = await p.ev(`(() => { const ms = [...document.querySelectorAll('.menu')], m = ms[ms.length - 1]; const l = m?.querySelector('.menu-item.is-label'); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
		if (back) { await tap(p, back.x, back.y); await p.sleep(450); }
	}
	return [...out];
}

/** "New binder" asks what the binder starts from (Obsidian's prompt): this answers "Empty binder", the first row, with
    Enter (or, `tap`, by a click on it, as a finger would), and waits for the prompt to go. False if it never came. */
export async function startEmpty(p, { tap = false, name = 'Empty binder' } = {}) {
	const row = `[...document.querySelectorAll('.binders-start-picker .suggestion-item')].find(e => e.querySelector('.suggestion-title')?.textContent === ${JSON.stringify(name)})`;
	for (let i = 0; i < 40 && !(await p.ev(`!!${row}`)); i++) await p.sleep(100);
	if (!(await p.ev(`!!${row}`))) return false;
	if (tap || name !== 'Empty binder') await p.ev(`(() => { ${row}.click(); return 1; })()`);
	else await p.key('Enter');
	for (let i = 0; i < 30 && (await p.ev(`!!document.querySelector('.binders-start-picker')`)); i++) await p.sleep(100);
	await p.sleep(300);
	return true;
}
