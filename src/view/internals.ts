import { Menu, type ItemView, type MenuItem, type WorkspaceLeaf } from 'obsidian';

/* Obsidian internals the binder view uses, each feature-detected with a fallback (see docs/internals.md).

   Submenus in Obsidian's menus. Obsidian has them (its editor menu's "Format" and "Insert") but not in its API: a menu
   item's undocumented `setSubmenu()` returns the submenu. Everything undocumented is here and in docs/internals.md.
   Without it, the item opens the submenu as a menu of its own where the first one was. */

interface WithSubmenu { setSubmenu(): Menu }
const hasSubmenu = (i: MenuItem): i is MenuItem & WithSubmenu => typeof (i as Partial<WithSubmenu>).setSubmenu === 'function';

/** Makes `item` open a submenu built by `build`. */
export function submenu(item: MenuItem, build: (menu: Menu) => void): void {
	if (hasSubmenu(item)) {
		try { const sub = item.setSubmenu(); if (sub && typeof sub.addItem === 'function') { build(sub); return; } } catch { /* fall back */ }
	}
	item.onClick((e) => {
		const m = new Menu();
		build(m);
		if (e instanceof MouseEvent && e.clientX) { m.showAtMouseEvent(e); return; }
		const r = activeDocument.activeElement?.getBoundingClientRect();
		m.showAtPosition({ x: r ? r.left : 0, y: r ? r.bottom : 0 });
	});
}

/* A view's titles (its tab and its header) when the folder it shows changes. Obsidian sets them once when a view opens;
   file views update them through the undocumented `leaf.updateHeader()` and the view's `titleEl`, and so does this.
   Without them, the titles catch up the next time the view is opened. */
export function refreshHeader(view: ItemView): void {
	const leaf = view.leaf as WorkspaceLeaf & { updateHeader?: () => void };
	const title = (view as ItemView & { titleEl?: unknown }).titleEl;
	try {
		if (title instanceof HTMLElement) title.setText(view.getDisplayText());
		if (typeof leaf.updateHeader === 'function') leaf.updateHeader();
	} catch { /* keep the old titles */ }
}
