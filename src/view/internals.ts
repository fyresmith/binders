import { Menu, type App, type ItemView, type MenuItem, type TFile, type WorkspaceLeaf } from 'obsidian';

/* Obsidian internals the binder view uses, each feature-detected with a fallback (see docs/internals.md).

   Submenus in Obsidian's menus. Obsidian has them (its editor menu's "Format" and "Insert") but not in its API: a menu
   item's undocumented `setSubmenu()` returns the submenu. Everything undocumented is here and in docs/internals.md.
   Without it, the item opens the submenu as a menu of its own where the first one was. */

interface WithSubmenu { setSubmenu(): Menu }
const hasSubmenu = (i: MenuItem): i is MenuItem & WithSubmenu => typeof (i as Partial<WithSubmenu>).setSubmenu === 'function';

/** Makes `item` open a submenu built by `build`. */
/** Lets an item of a menu be picked without the menu closing (a list to tick several things in): `pick` does it and
    says whether the item is ticked now. Not in the API: the item's `dom`, whose click Obsidian closes the menu on.
    False if this Obsidian has no such thing; the caller then opens the menu again after each pick. */
export function keepOpen(item: MenuItem, pick: () => boolean): boolean {
	const dom = (item as unknown as { dom?: HTMLElement }).dom;
	if (!dom || typeof dom.addEventListener !== 'function') return false;
	dom.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); item.setChecked(pick()); }, true);
	return true;
}

/** Long tablet popovers need room to scroll. Without the menu's undocumented DOM, keep its native sizing. */
export function fitItemMenu(menu: Menu): void {
	const dom = (menu as unknown as { dom?: HTMLElement }).dom;
	if (!dom || typeof dom.addClass !== 'function') return;
	dom.addClass('binders-item-menu');
}

export function submenu(item: MenuItem, build: (menu: Menu) => void, root?: Menu): void {
	if (hasSubmenu(item)) {
		try {
			const sub = item.setSubmenu();
			if (sub && typeof sub.addItem === 'function') {
				// choosing something in the submenu closes the menu it came from as well: Obsidian does that for a
				// click, but not for Enter, nor on a phone, where the first menu would stay over whatever opens next
				if (root) {
					type Add = (cb: (item: MenuItem) => unknown) => Menu;
					type OnClick = (fn: (evt: MouseEvent | KeyboardEvent) => unknown) => MenuItem;
					const add = (sub.addItem as Add).bind(sub) as Add;
					(sub as { addItem: Add }).addItem = (cb) => add((it) => {
						const on = (it.onClick as OnClick).bind(it) as OnClick;
						(it as { onClick: OnClick }).onClick = (fn) => on((e) => { root.close(); return fn(e); });
						cb(it);
					});
				}
				build(sub);
				return;
			}
		} catch { /* fall back */ }
	}
	item.onClick((e) => {
		const m = new Menu();
		build(m);
		if (e instanceof MouseEvent && e.clientX) { m.showAtMouseEvent(e); return; }
		const r = activeDocument.activeElement?.getBoundingClientRect();
		m.showAtPosition({ x: r ? r.left : 0, y: r ? r.bottom : 0 });
	});
}

/* Marks an item of an open menu as the one the keyboard is on (a menu opened again after a pick carries on from what
   was picked). A menu's `items` (each with its `dom`) and `select(index)` aren't in the API. Without them, the menu
   opens with nothing marked, as any menu does. */
export function selectMenuItem(menu: Menu, title: string): void {
	const m = menu as Menu & { items?: { dom?: unknown }[]; select?: (index: number) => void };
	if (!Array.isArray(m.items) || typeof m.select !== 'function') return;
	const i = m.items.findIndex((it) => it.dom instanceof HTMLElement && it.dom.querySelector('.menu-item-title')?.textContent === title);
	try { if (i >= 0) m.select(i); } catch { /* nothing marked */ }
}

/* Binders' tab in Obsidian's settings ("Edit labels…"). The settings dialog isn't in the API: `app.setting.open()` and
   `openTabById(id)` open it, as Obsidian's own "Options" links on plugins do. Without them, nothing opens. */
export function openPluginSettings(app: App, id: string): boolean {
	const setting = (app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
	if (!setting || typeof setting.open !== 'function' || typeof setting.openTabById !== 'function') return false;
	try { setting.open(); setting.openTabById(id); return true; } catch { return false; }
}

/* A new note opened with its title ready to type over, as one made in the file explorer is. Obsidian does it with the
   undocumented ephemeral state `{ rename: 'all' }` on opening a file. Obsidian versions that don't know it ignore it:
   the note opens, and is renamed the usual ways. */
export async function openForRename(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
	try { await leaf.openFile(file, { eState: { rename: 'all' } }); } catch { await leaf.openFile(file); }
}

/* Where deleted files go ("Deleted files" in Files and links): the system trash, the vault's own `.trash`, or nowhere.
   Not in the API: the vault's undocumented `getConfig('trashOption')`. Without it, the system trash (the default). */
export function trashKind(app: App): 'system' | 'local' | 'none' {
	const get = (app.vault as { getConfig?: (key: string) => unknown }).getConfig;
	try { const v: unknown = typeof get === 'function' ? get.call(app.vault, 'trashOption') : null; return v === 'local' ? 'local' : v === 'none' ? 'none' : 'system'; } catch { return 'system'; }
}

/** "goes to the system trash", "go to the vault’s trash", "is deleted for good": what happens to deleted notes. */
export function trashPhrase(app: App, several: boolean): string {
	const kind = trashKind(app);
	if (kind === 'none') return several ? 'are deleted for good' : 'is deleted for good';
	return `${several ? 'go' : 'goes'} to ${kind === 'local' ? 'the vault’s trash' : 'the system trash'}`;
}

/* "Automatically update internal links" (Files and links): whether Obsidian rewrites links when a note is renamed or
   moved. Binders follows it when a merge or a split moves text to another note. Not in the API: the vault's
   undocumented `getConfig('alwaysUpdateLinks')`. Without it, links are left as they are (and the writer is told). */
export function updatesLinks(app: App): boolean {
	const get = (app.vault as { getConfig?: (key: string) => unknown }).getConfig;
	try { return typeof get === 'function' && get.call(app.vault, 'alwaysUpdateLinks') === true; } catch { return false; }
}

/* Vim key bindings (Editor settings): with them on, a letter is a command as often as it's text. Not in the API: the
   vault's undocumented `getConfig('vimMode')`. Without it, off. */
export function vimMode(app: App): boolean {
	const get = (app.vault as { getConfig?: (key: string) => unknown }).getConfig;
	try { return typeof get === 'function' && get.call(app.vault, 'vimMode') === true; } catch { return false; }
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

/* The "Readable line length" setting (Editor settings), which Obsidian's views follow and the manuscript should too. It
   isn't in the API: the vault's undocumented `getConfig()` reads it, as Obsidian's own views do. Without it, the line
   width is readable (the default). Changes arrive with the vault's undocumented 'config-changed' event. */
export function readableLineLength(app: App): boolean {
	const get = (app.vault as { getConfig?: (key: string) => unknown }).getConfig;
	try { return typeof get !== 'function' || get.call(app.vault, 'readableLineLength') !== false; } catch { return true; }
}

/* The Snapshots dialog looks like Obsidian's own File recovery and Sync history dialogs because it wears their classes:
   `mod-sidebar-layout` and `mod-sync-history` on the dialog, `modal-sidebar`, `modal-sidebar-list-item`,
   `sync-history-content-container`, `modal-setting-titlebar`, `sync-history-preview`, and for what changed,
   `diff-view`, `diff-line mod-left / mod-right` and `diff-changed`. None of them is in the API. They're known by what
   they do: with them the dialog's content is a row, and a line that was taken out is tinted. If either isn't so (a
   later Obsidian renamed them), this says no, and the dialog takes Binders' own rules for the same layout and colors
   (`.binders-snapshots.is-plain` in styles.css). */
export function historyLook(contentEl: HTMLElement): boolean {
	try {
		const probe = contentEl.createDiv({ cls: 'diff-line mod-left' });
		const tinted = !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(getComputedStyle(probe).backgroundColor);
		probe.remove();
		return tinted && getComputedStyle(contentEl).display === 'flex';
	} catch { return false; }
}
