/* The core file explorer: binder order, hidden binder and folder notes, the “binder” tag on a binder's folder, label
   dots, the mark on the folder a binder view shows, click to open, and dragging to reorder.

   Obsidian has no API for the explorer's order, so this patches one undocumented method, the explorer view's
   `getSortedFolderItems(folder)`, which both the view's `sort()` and every folder item's `sort()` call to get the items
   to show in a folder. Everything undocumented is in the "Internals" block below and listed in docs/internals.md. If the
   method is missing, Binders says so once and the explorer keeps Obsidian's own order. */
import { around } from 'monkey-around';
import { Keymap, Notice, Platform, TAbstractFile, TFolder, type App, type EventRef, type Menu, type PaneType, type Plugin, type View } from 'obsidian';

/** What the explorer needs to know about binders. The binder store implements it. */
export interface ExplorerSource {
	/** Children of this folder in binder order, or null if the folder isn't in a binder (Obsidian's sort is kept). */
	orderedChildren(folder: TFolder): TAbstractFile[] | null;
	/** Is this folder a binder (it holds a binder note)? */
	isBinderFolder(folder: TFolder): boolean;
	/** Is this item inside a binder (below a binder folder)? */
	inBinder(item: TAbstractFile): boolean;
	/** Binder notes and folder notes (`Part One/Part One.md`). Only asked about items of folders in a binder. */
	isHiddenNote(file: TAbstractFile): boolean;
	/** A binder's folder of snapshots: never shown. */
	isSnapshotsFolder(file: TAbstractFile): boolean;
	/** The color of a note's or folder's label, as CSS, or null if it has none (or isn't in a binder). */
	labelColor(item: TAbstractFile): string | null;
	/** Why an item can't be put in this folder's order, in words ("" if that's not for a binder to say: the drop is then
	    Obsidian's own), or null if it can. */
	whyNot(item: TAbstractFile, folder: TFolder): string | null;
	/** Items in the order they show, binder by binder; ones outside any binder last, as given. */
	inOrder(items: TAbstractFile[]): TAbstractFile[];
	/** A Longform scene's indent (undefined for anything else). */
	depthOf(item: TAbstractFile): number | undefined;
	/** Puts items, in order, just before `anchor` in a folder (or at its end), moving them there from other folders if
	    need be. In a Longform project, `depth` is the indent they take. */
	put(items: TAbstractFile[], folder: TFolder, anchor: TAbstractFile | null, depth?: number): Promise<void>;
	on(name: 'changed', callback: () => void): EventRef;
	offref(ref: EventRef): void;
}

/** The settings the explorer patch follows. */
export interface ExplorerSettings {
	orderExplorer: boolean;
	openOnClick: boolean;
	hideBinderNotes: boolean;
	explorerLabels: boolean;
}

/** The installed patch: refresh it after settings change, mark the folder a view shows, ask whether it took. */
export interface Explorer {
	/** Re-reads the settings, patches or unpatches the explorer to match, and re-sorts it. Call after settings change. */
	refresh(): void;
	/** Marks the folder the binder view in front is showing as the explorer marks the open note. Call when a binder
	    view goes to another folder. */
	active(): void;
	/** `patched`: binder order is on. `off`: turned off in settings. `missing`: this Obsidian has no method to patch.
	    `waiting`: no file explorer is open yet. */
	readonly status: 'patched' | 'off' | 'missing' | 'waiting';
}

// ---- Internals (undocumented, see docs/internals.md) ----

/** A row of the explorer, as its view keeps it. */
interface ExplorerItem { file: TAbstractFile; selfEl: HTMLElement; innerEl?: HTMLElement }
/** The file explorer's view, as far as Binders reaches into it. */
interface ExplorerView extends View {
	getSortedFolderItems(folder: TFolder): ExplorerItem[];
	fileItems: Record<string, ExplorerItem | undefined>;
	requestSort?: () => void;
	sort?: () => void;
	startRenameFile?: (file: TAbstractFile) => unknown;
}

/** Does this view have what the patch needs (the method to patch, and its rows by path)? */
const isExplorerView = (v: View): v is ExplorerView => {
	const x = v as Partial<ExplorerView>;
	return typeof x.getSortedFolderItems === 'function' && !!x.fileItems && typeof x.fileItems === 'object';
};

/** Starts renaming an item where it is in the file explorer, as "New folder" there does (the explorer's undocumented
    `startRenameFile`). False if no explorer is showing or this Obsidian has no such thing: the name stays as made. */
export function renameInExplorer(app: App, file: TAbstractFile): boolean {
	for (const v of explorerViews(app).views) {
		if (typeof v.startRenameFile !== 'function' || !v.containerEl.isShown()) continue;
		try { void v.startRenameFile(file); return true; } catch { /* the name stays */ }
	}
	return false;
}

/** Loaded file explorer views; `missing` if one is loaded but lacks what we patch. Deferred (not yet loaded) leaves
    are skipped. */
function explorerViews(app: App): { views: ExplorerView[]; missing: boolean } {
	const views: ExplorerView[] = [];
	let missing = false;
	for (const leaf of app.workspace.getLeavesOfType('file-explorer')) {
		if ((leaf as { isDeferred?: boolean }).isDeferred) continue; // not loaded yet (Obsidian 1.7.2+)
		if (isExplorerView(leaf.view)) views.push(leaf.view); else missing = true;
	}
	return { views, missing };
}

/* The menu of several items selected in the file explorer. Obsidian puts its own "New folder with selection" in it
   before it sends `files-menu`: one of the menu's `items`, in the section "action-primary", with the folder-plus icon
   (the title is in the app's language, so it isn't what the item is known by). The menu is drawn from `items` when
   it's shown, so an item taken out of the list before then never appears. */
interface MenuItemLike { section?: unknown; dom?: { querySelector?: unknown } | null }

/** Takes Obsidian's own "New folder with selection" out of the menu of a selection in the file explorer, where
    Binders offers "New folder from selection" in its place: in a binder the folder belongs where the notes were, in
    their order, as a change "Undo last move" takes back, which Obsidian's own can't know. False, with the menu as it
    was, if the item isn't found: this Obsidian builds the menu some other way, and both items show. */
export function dropNewFolderItem(menu: Menu): boolean {
	try {
		const items = (menu as unknown as { items?: unknown }).items;
		if (!Array.isArray(items)) return false;
		const theirs = (it: MenuItemLike | null): boolean => !!it && it.section === 'action-primary' && typeof it.dom?.querySelector === 'function' && !!(it.dom as HTMLElement).querySelector('.lucide-folder-plus');
		const at = (items as (MenuItemLike | null)[]).findIndex(theirs);
		if (at < 0) return false;
		items.splice(at, 1);
		return true;
	} catch { return false; }
}

/** The method Binders patches, as the explorer's class has it now: only to tell whether it's still the same one. */
const methodOf = (v: ExplorerView): unknown => (Object.getPrototypeOf(v) as Record<string, unknown>).getSortedFolderItems;

/** Has an explorer sort itself again (debounced, where Obsidian offers that). */
const resort = (v: ExplorerView) => { if (typeof v.requestSort === 'function') v.requestSort(); else v.sort?.(); };

/* Dragging in the explorer. Obsidian's drag manager knows what's being dragged (`draggable`: a file, a folder or several
   files), words the hint under the pointer (`setAction`) and tints what a drop would go into (`updateHover`). Its drop
   handlers on the explorer's rows leave an event alone once `preventDefault()` has been called on it, so a listener
   ahead of them (in the capture phase) can take a drop for itself. Without `draggable` nothing is taken, and dragging
   works as it does without Binders: it moves things into folders. */
interface Draggable { source?: unknown; type?: unknown; file?: unknown; files?: unknown }
interface DragManager { draggable?: Draggable | null; setAction?: (text: string) => void; updateHover?: (el: HTMLElement | null, cls: string) => void }

const dragManager = (app: App): DragManager | null => {
	const m = (app as unknown as { dragManager?: unknown }).dragManager;
	return m && typeof m === 'object' ? m : null;
};

/** The notes and folders being dragged (from the explorer, a tab, a link to a note), or none. */
function dragged(app: App): TAbstractFile[] {
	const d = dragManager(app)?.draggable;
	if (!d) return [];
	if ((d.type === 'file' || d.type === 'folder') && d.file instanceof TAbstractFile) return [d.file];
	if (d.type === 'files' && Array.isArray(d.files)) return d.files.filter((f): f is TAbstractFile => f instanceof TAbstractFile);
	return [];
}

/** Is what's dragged a card or a row out of a binder view (src/view/file-drag.ts says so as it hands the drag over)? */
const fromBinderView = (app: App): boolean => dragManager(app)?.draggable?.source === 'binders';

const EXPLORER = '.workspace-leaf-content[data-type="file-explorer"]';
/** How long a drag stays over a folded folder before it springs open (Obsidian's own wait is much the same). */
const SPRING = 750;
/** A drop between two rows: the folder it goes into, the item it goes before (null: last), and where the line shows. */
interface Place { items: TAbstractFile[]; folder: TFolder; anchor: TAbstractFile | null; depth?: number; hint: string; line: { left: number; right: number; y: number }; refused?: boolean; onto?: HTMLElement }

// ---- The integration ----

/** Patches the file explorer and listens for its clicks and drags, for as long as the plugin is loaded. `source` is
    the binder store; `openBinder` opens a folder's binder view; `shown` is the folder the binder view in front shows
    (its row is marked). Everything it adds is taken away again when the plugin unloads. */
export function installExplorer(plugin: Plugin, source: ExplorerSource, settings: () => ExplorerSettings, openBinder: (folder: TFolder, newLeaf: boolean | PaneType) => void, shown: () => TFolder | null = () => null): Explorer {
	const { app } = plugin;
	let unpatch: (() => void) | null = null, noticed = false, loaded = true;
	let status: Explorer['status'] = 'waiting';
	/** The explorer's method as it was when Binders' patch was last known to be part of it, and whether a call made
	    to find out has reached the patch (see `intact`). */
	let top: unknown = null, reached = false;

	/** Binder order for one folder's items, with binder and folder notes left out. Never drops anything else. */
	const arrange = (folder: TFolder, items: ExplorerItem[]): ExplorerItem[] => {
		for (const it of items) mark(it);
		// a binder's snapshots are never listed, whatever the settings say (and whatever kinds of file Obsidian is set to show)
		if (source.isBinderFolder(folder)) items = items.filter((it) => !source.isSnapshotsFolder(it.file));
		const order = settings().orderExplorer ? source.orderedChildren(folder) : null;
		if (!order) return items;
		const hide = settings().hideBinderNotes;
		const byPath = new Map(items.map((it) => [it.file.path, it]));
		const out: ExplorerItem[] = [];
		for (const f of [...order, ...items.map((it) => it.file)]) {
			const it = byPath.get(f.path);
			if (!it) continue;
			byPath.delete(f.path);
			if (!(hide && source.isHiddenNote(it.file))) out.push(it);
		}
		return out;
	};

	/** A labeled item's color, as a dot after its name (and none on anything else). */
	const dot = (it: ExplorerItem) => {
		if (!it.selfEl) return;
		const color = loaded && settings().explorerLabels ? source.labelColor(it.file) : null;
		let el = it.selfEl.querySelector<HTMLElement>(':scope > .binders-explorer-label');
		if (!color) { el?.remove(); return; }
		el ??= createDiv({ cls: 'binders-explorer-label', attr: { 'aria-hidden': 'true' } });
		// (before a binder's tag, at the row's end)
		if (!el.parentElement) it.selfEl.insertBefore(el, it.selfEl.querySelector(':scope > .binders-folder-tag'));
		el.setCssProps({ '--binders-label': color });
	};

	/** A binder folder says what it is at the end of its row, as Obsidian says "canvas" or "base" after a file that
	    isn't a note (its own `nav-file-tag`); anything else has none. And every item's label dot. */
	const mark = (it: ExplorerItem) => {
		dot(it);
		if (!(it.file instanceof TFolder) || !it.selfEl) return;
		const want = loaded && source.isBinderFolder(it.file), el = it.selfEl.querySelector(':scope > .binders-folder-tag');
		if (want && !el) it.selfEl.createDiv({ cls: 'nav-file-tag binders-folder-tag', text: 'binder' });
		else if (!want && el) el.remove();
		if (lit.includes(it.selfEl) !== (it.file === (loaded ? shown() : null))) active();
	};

	/** The folder a binder view in front is showing has the row of the thing that's open, as the open note has (a
	    folder has none of its own: it never is). */
	let lit: HTMLElement[] = [];
	const active = () => {
		for (const el of lit) el.removeClass('is-active');
		lit = [];
		const f = loaded ? shown() : null;
		if (!f) return;
		for (const v of explorerViews(app).views) { const el = v.fileItems[f.path]?.selfEl; if (el) { el.addClass('is-active'); lit.push(el); } }
	};

	const patch = (): void => {
		const { views, missing } = explorerViews(app);
		if (!views.length) {
			status = missing ? 'missing' : 'waiting';
			if (missing && !noticed) { noticed = true; new Notice('Binders couldn’t change the order of the file explorer in this version of Obsidian, so binders show in name order.'); }
			return;
		}
		// patch the class, not one view, so an explorer that's closed and reopened keeps binder order
		const proto = Object.getPrototypeOf(views[0]) as ExplorerView;
		unpatch = around(proto, {
			getSortedFolderItems: (next: (folder: TFolder) => ExplorerItem[]) => function (this: ExplorerView, folder: TFolder) {
				reached = true;
				const items = next.call(this, folder) as ExplorerItem[];
				try { return arrange(folder, items); } catch (e) { console.error('Binders: could not order the file explorer', e); return items; }
			},
		});
		top = methodOf(views[0]);
		status = 'patched';
	};

	/** Is Binders' patch still part of the explorer's method? Another plugin that patched the same method before Binders
	    did, and puts back what it found when it's turned off, takes Binders' patch away with its own. While the method
	    is the one last seen, nothing has changed. Once it's another (a plugin has patched over Binders', which is fine,
	    or taken it away), the only way to tell is to call it and see whether the call comes through here. */
	const intact = (): boolean => {
		if (!unpatch) return true;
		const v = explorerViews(app).views[0];
		if (!v) return true; // no explorer to ask: looked at again when one shows
		const now = methodOf(v);
		if (now === top) return true;
		reached = false;
		try { v.getSortedFolderItems(app.vault.getRoot()); } catch { /* another plugin's patch threw: not ours to say */ }
		if (reached) top = now;
		return reached;
	};

	const refresh = () => {
		if (!loaded) return;
		// (the patch stays on with binder order off: it's also what keeps snapshots out of the list)
		const on = settings().orderExplorer;
		// taken away by another plugin: what's left of it is let go (it only passes calls on now), and it's made again
		if (!intact()) { try { unpatch?.(); } catch { /* nothing of it is left to take off */ } unpatch = null; }
		if (!unpatch) patch();
		if (unpatch) status = on ? 'patched' : 'off';
		const { views } = explorerViews(app);
		for (const v of views) { for (const k in v.fileItems) { const it = v.fileItems[k]; if (it) mark(it); } resort(v); }
		active();
	};

	/** The folder in a binder that a click in the file explorer is on, if the click is one that opens its view: a plain
	    click, or a Mod-click or middle click (a new tab, as for a note). Shift and Alt clicks select, so they're left
	    alone. */
	const clicked = (e: MouseEvent): { f: TFolder; title: HTMLElement; newLeaf: boolean | PaneType; middle: boolean } | null => {
		if (!settings().openOnClick || e.defaultPrevented) return null;
		const middle = e.type === 'auxclick' && e.button === 1;
		if (!middle && e.button !== 0) return null;
		const newLeaf = middle ? 'tab' : Keymap.isModEvent(e);
		if (!newLeaf && (e.shiftKey || e.altKey)) return null;
		// (instanceOf: an explorer in a window of its own has that window's Element)
		const t = e.target as Node | null;
		if (!t?.instanceOf(Element) || t.closest('.collapse-icon, [contenteditable="true"], input')) return null;
		const title = t.closest<HTMLElement>('.nav-folder-title');
		if (!title || !title.closest('.workspace-leaf-content[data-type="file-explorer"]')) return null;
		const f = app.vault.getAbstractFileByPath(title.dataset.path ?? '');
		if (!(f instanceof TFolder)) return null;
		// (on a phone the explorer is a drawer that closes when something opens: a tap on a folder inside a binder
		// only unfolds it, so the notes in it can be reached; the binder itself opens, and its folders from there)
		if (Platform.isPhone && !source.isBinderFolder(f)) return null;
		return source.isBinderFolder(f) || source.inBinder(f) ? { f, title, newLeaf, middle } : null;
	};
	/** Opens the view of the folder clicked. Heard after Obsidian's own handler, which has folded or unfolded it. */
	const onClick = (e: MouseEvent) => { const c = clicked(e); if (c) openBinder(c.f, c.newLeaf); };
	/** A click on a folder's row folds or unfolds it, which is Obsidian's doing. A click that opens the folder's view
	    shouldn't also hide what's in it: on a folder that's open and whose view isn't the one in front, the click is
	    taken here, ahead of Obsidian, and only opens the view. (A folded folder unfolds as ever; once its view is in
	    front a click folds it as any folder's does; its arrow always folds and unfolds.) Without the explorer's
	    internals, nothing is taken and the folder folds as before. */
	const onClickFirst = (e: MouseEvent) => {
		const c = clicked(e);
		if (!c || c.middle || c.newLeaf) return;
		for (const v of explorerViews(app).views) {
			const it = v.fileItems[c.f.path] as (ExplorerItem & { collapsed?: boolean; toggleCollapsed?: (animate: boolean) => unknown }) | undefined;
			if (it?.selfEl !== c.title) continue;
			// (the folder in front has the open row's mark, and Obsidian does nothing with a click on that row but put
			// the keyboard in the explorer: here the click folds or unfolds it, as on any folder)
			if (shown() === c.f) {
				if (typeof it.toggleCollapsed !== 'function') return;
				e.stopPropagation();
				try { void it.toggleCollapsed(true); } catch { /* it stays as it is */ }
				return;
			}
			if (it.collapsed !== false) continue;
			e.stopPropagation();
			// what else Obsidian does with a click on a row: the selection and the keyboard's place in the list
			try { (v as ExplorerView & { tree?: { handleItemSelection?: (e: MouseEvent, item: unknown) => boolean } }).tree?.handleItemSelection?.(e, it); } catch { /* the selection stays */ }
			openBinder(c.f, c.newLeaf);
			return;
		}
	};

	// ---- dragging to reorder ----

	/** Where a drag over the explorer would put the dragged items in a binder's order. Null leaves the drag to Obsidian:
	    outside a binder, over the middle of a folder (into it), or back where the items already are. A note's row takes
	    a drop above or below it; a folder's, along its top and bottom edges (below an open folder: as its first item).
	    Below the last item of a folder, the pointer left of where its name starts means after the folder itself, a
	    level up (and so on outward). A place the items can't take (a name already there) is refused, with why. */
	const placeAt = (e: DragEvent): Place | null => {
		const target = e.target as Node | null;
		if (status !== 'patched' || !target?.instanceOf(Element)) return null;
		const ROW = '.nav-file-title, .nav-folder-title';
		let title = target.closest<HTMLElement>(ROW);
		// in the hair's breadth between two rows, it's the nearer row's edge (left to Obsidian, a drop there would go
		// into the folder around them, at its end)
		if (!title && target.closest(EXPLORER)) {
			for (const dy of [-3, 3]) { title = target.ownerDocument.elementFromPoint(e.clientX, e.clientY + dy)?.closest<HTMLElement>(ROW) ?? null; if (title) break; }
		}
		const pane = title?.closest<HTMLElement>(EXPLORER);
		if (!title || !pane) return null;
		let over = app.vault.getAbstractFileByPath(title.dataset.path ?? '');
		let folder = over?.parent;
		if (!over || !folder || !source.inBinder(over)) return null;
		// what's dragged, in the order it shows (not the order it was clicked in); a folder brings what's in it
		const all = dragged(app);
		const items = source.inOrder(all.filter((f) => !all.some((g) => g !== f && f.path.startsWith(g.path + '/'))));
		// (over a row that's being dragged itself, the only place there is, is out of its folder: see below)
		const own = items.includes(over);
		if (!items.length) return null;
		if (!(source.orderedChildren(folder) ?? []).includes(over)) return null; // a binder or folder note, or something a Longform project ignores
		const r = title.getBoundingClientRect(), y = (e.clientY - r.top) / r.height, edge = over instanceof TFolder ? 0.25 : 0.5;
		const after = own || y >= 1 - edge, rtl = title.win.getComputedStyle(title).direction === 'rtl';
		const name = (f: TAbstractFile) => (f instanceof TFolder ? f.name : f.name.replace(/\.[^.]+$/, ''));
		// A folder dragged out of a binder view can't go into itself, or into a folder inside it: said, not left to
		// Obsidian (which says nothing). A folder dragged in the explorer itself stays Obsidian's own there, as ever: that
		// drag starts on the folder's own row, and letting go there at once is no attempt to move anything.
		const self = fromBinderView(app) ? items.find((f) => f instanceof TFolder && !!over && (over === f || over.path.startsWith(f.path + '/'))) : null;
		if (self) return { items, folder, anchor: null, hint: `“${name(self)}” can’t be moved into ${over === self || folder === self ? 'itself' : 'a folder inside it'}`, line: { left: 0, right: 0, y: 0 }, refused: true };
		if (!after && y >= edge) {
			// the middle of a folder's row: into it, at its end, as Obsidian would; taken here so it's a move that
			// "Undo last move" takes back
			if (!(over instanceof TFolder) || !source.orderedChildren(over) || items.every((f) => f.parent === over)) return null;
			const dest = over;
			if (items.some((f) => source.whyNot(f, dest) != null)) return null; // Obsidian's own drop says why not
			return { items, folder: dest, anchor: null, hint: `Move into “${name(dest)}”`, line: { left: 0, right: 0, y: 0 }, onto: title };
		}
		const rowOf = (f: TAbstractFile) => pane.querySelector<HTMLElement>(`.tree-item-self[data-path="${CSS.escape(f.path)}"]`);
		const nameEdge = (el: HTMLElement | null) => { const b = (el?.querySelector('.tree-item-inner') ?? el)?.getBoundingClientRect(); return b ? (rtl ? b.right : b.left) : null; };
		// below an open folder's name is the top of what's in it
		const into = !own && after && over instanceof TFolder && !title.parentElement?.hasClass('is-collapsed') && !!source.orderedChildren(over);
		if (into && over instanceof TFolder) folder = over;
		let indentFrom: HTMLElement | null = title;
		if (after && !into) {
			// after the last item of a folder: further left is further out
			for (;;) {
				// (what's being dragged doesn't count as following it: the last note of a folder can be dragged out past it)
				const sibs: TAbstractFile[] = source.orderedChildren(folder) ?? [], up: TFolder | null = folder.parent;
				const edgeX = nameEdge(rowOf(over)), last = sibs.slice(sibs.indexOf(over) + 1).every((f) => items.includes(f));
				if (!last || !up || !source.orderedChildren(up) || edgeX == null || (rtl ? e.clientX <= edgeX : e.clientX >= edgeX)) break;
				over = folder; folder = up; indentFrom = rowOf(over);
			}
		}
		const dest = folder;
		if (items.includes(over)) return null;
		const now = source.orderedChildren(dest) ?? [], rest = now.filter((f) => !items.includes(f));
		const k = into ? 0 : rest.indexOf(over) + (after ? 1 : 0);
		// nothing to do if that's where they already are
		if (items.every((f) => now.includes(f)) && [...rest.slice(0, k), ...items, ...rest.slice(k)].every((f, i) => f === now[i])) return null;
		// the line runs from where the names start at that level (a folder's items are indented under it)
		const child = into ? title.parentElement?.querySelector<HTMLElement>(':scope > .tree-item-children .tree-item-self') : null;
		const x = nameEdge(child ?? indentFrom) ?? (rtl ? r.right : r.left), indent = into && !child ? 17 : 0;
		const line = { left: rtl ? r.left : x + indent, right: rtl ? x - indent : r.right, y: after ? r.bottom : r.top };
		// two things of one name can't share a folder, and a note named like the folder would become its own note
		const twin = items.find((f, i) => items.findIndex((g) => g.name === f.name) !== i);
		const why = twin ? `Two of these are called “${name(twin)}”` : items.map((f) => source.whyNot(f, dest)).find((w) => w != null);
		if (why === '') return null; // not a binder's to say: Obsidian's own drop
		if (why) return { items, folder: dest, anchor: null, hint: why, line, refused: true };
		return {
			items, folder: dest, anchor: rest[k] ?? null, line,
			// a Longform scene takes the indent of the scene it's dropped beside
			depth: source.depthOf(over),
			hint: into ? `Move to the top of “${name(over)}”` : after ? `Move after “${name(over)}”` : `Move before “${name(over)}”`,
		};
	};

	/** The line between two rows, as Obsidian draws one where a dragged bookmark would go. */
	let line: HTMLElement | null = null;
	/** The folder row a drop would go into, marked as Obsidian marks it. */
	let onto: HTMLElement | null = null;
	const hideLine = () => { line?.remove(); line = null; onto?.removeClass('is-being-dragged-over'); onto = null; };
	/** Why the place under the pointer can't take what's dragged: said if it's let go there (a refused drop gets no
	    drop event to say it in). */
	let refusal: string | null = null;

	/** A folded folder a drag stays over for a moment springs open, as Obsidian has it (its own timer is in the drop
	    handler this one is ahead of, so it never starts for a row taken here). */
	let spring: { el: HTMLElement; timer: number } | null = null;
	const springOpen = (title: HTMLElement | null) => {
		if (spring?.el === title) return;
		if (spring) window.clearTimeout(spring.timer);
		spring = null;
		if (!title || !title.parentElement?.hasClass('is-collapsed')) return;
		const timer = window.setTimeout(() => {
			spring = null;
			for (const v of explorerViews(app).views) {
				const it = v.fileItems[title.dataset.path ?? ''] as (ExplorerItem & { collapsed?: boolean; setCollapsed?: (c: boolean, animate: boolean) => unknown; toggleCollapsed?: (animate: boolean) => unknown }) | undefined;
				if (it?.selfEl !== title || it.collapsed !== true) continue;
				try { if (typeof it.setCollapsed === 'function') void it.setCollapsed(false, true); else void it.toggleCollapsed?.(true); } catch { /* it stays folded */ }
			}
		}, SPRING);
		spring = { el: title, timer };
	};

	const onDragOver = (e: DragEvent) => {
		const place = loaded ? placeAt(e) : null, was = refusal;
		refusal = place?.refused ? place.hint : null;
		springOpen(place?.onto ?? null);
		// (off a place that was refused: the ghost stops saying why, unless what's here has something to say)
		if (!place) { hideLine(); if (was) try { dragManager(app)?.setAction?.(''); } catch { /* the hint is only a hint */ } return; }
		// ours: Obsidian's own handlers on the row skip an event that's been taken
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = place.refused ? 'none' : 'move';
		const dm = dragManager(app);
		try { dm?.updateHover?.(null, ''); dm?.setAction?.(place.hint); } catch { /* the hint is only a hint */ }
		// not over the explorer's own header, or past its end (a row half scrolled out of sight)
		const doc = (e.target as Element).ownerDocument, list = (e.target as Element).closest('.nav-files-container')?.getBoundingClientRect();
		if (place.onto) { if (onto !== place.onto) { hideLine(); onto = place.onto; onto.addClass('is-being-dragged-over'); } line?.remove(); line = null; return; }
		if (place.refused || (list && (place.line.y < list.top - 1 || place.line.y > list.bottom + 1))) { hideLine(); return; }
		onto?.removeClass('is-being-dragged-over'); onto = null;
		line ??= createDiv({ cls: 'drop-indicator is-active binders-explorer-drop' });
		if (line.parentElement !== doc.body) doc.body.appendChild(line);
		line.setCssStyles({ left: `${place.line.left}px`, width: `${Math.max(0, place.line.right - place.line.left)}px`, top: `${place.line.y - 2}px` });
	};

	const onDrop = (e: DragEvent) => {
		const place = loaded ? placeAt(e) : null;
		hideLine();
		springOpen(null);
		refusal = null;
		if (!place) return;
		e.preventDefault();
		if (place.refused) { new Notice(place.hint + '.'); return; }
		void (async () => {
			try {
				await source.put(place.items, place.folder, place.anchor, place.depth);
			} catch (err) { new Notice(err instanceof Error ? err.message : String(err)); }
		})();
	};

	/** The explorer's own listeners, in a window: the main one, and any an explorer is popped out into. */
	const listen = (doc: Document) => {
		plugin.registerDomEvent(doc, 'click', onClickFirst, true);
		plugin.registerDomEvent(doc, 'click', onClick);
		plugin.registerDomEvent(doc, 'auxclick', onClick);
		// ahead of Obsidian's handlers on the explorer's rows
		plugin.registerDomEvent(doc, 'dragover', onDragOver, true);
		plugin.registerDomEvent(doc, 'dragenter', onDragOver, true);
		plugin.registerDomEvent(doc, 'drop', onDrop, true);
		plugin.registerDomEvent(doc, 'dragend', () => { hideLine(); springOpen(null); if (refusal) new Notice(refusal + '.'); refusal = null; }, true);
		// (A drag that leaves the window, or goes back to the binder view it came from, wasn't let go where it was
		// refused: it says so with no place on the screen at all, which is what Obsidian's drag manager goes by too.
		// A refused drop also ends with a `dragleave` to nowhere, but that one has the pointer's place: the reason stays
		// for the `dragend` that follows to say.)
		plugin.registerDomEvent(doc, 'dragleave', (e) => { if (!e.relatedTarget) { hideLine(); springOpen(null); if (e.screenX === 0 && e.screenY === 0) refusal = null; } }, true);
	};

	app.workspace.onLayoutReady(() => {
		if (!loaded) return;
		refresh();
		// (and a patch another plugin took away with its own is put back the next time anything happens: a binder
		// changes, a tab is switched to, the layout changes)
		plugin.registerEvent(app.workspace.on('layout-change', () => { if (status === 'waiting' || !intact()) refresh(); else active(); }));
		plugin.registerEvent(app.workspace.on('active-leaf-change', () => { if (!intact()) refresh(); else active(); }));
		const ref = source.on('changed', refresh);
		plugin.register(() => source.offref(ref));
		// a note's label changed: its dot (and its folder's, if it's the folder's note)
		plugin.registerEvent(app.metadataCache.on('changed', (file) => {
			for (const v of explorerViews(app).views) for (const p of [file.path, file.parent?.path]) { const it = p ? v.fileItems[p] : null; if (it) dot(it); }
		}));
		listen(document);
		// an explorer moved to a window of its own works there too
		const seen = new Set<Document>([document]);
		const others = () => app.workspace.iterateAllLeaves((leaf) => { const doc = leaf.view.containerEl.ownerDocument; if (!seen.has(doc)) { seen.add(doc); listen(doc); } });
		others();
		plugin.registerEvent(app.workspace.on('window-open', (win) => { if (!seen.has(win.doc)) { seen.add(win.doc); listen(win.doc); } }));
		plugin.registerEvent(app.workspace.on('layout-change', others));
	});

	plugin.register(() => {
		loaded = false;
		hideLine();
		springOpen(null);
		active();
		unpatch?.(); unpatch = null;
		for (const v of explorerViews(app).views) { for (const k in v.fileItems) v.fileItems[k]?.selfEl?.querySelectorAll(':scope > .binders-folder-tag, :scope > .binders-explorer-label').forEach((el) => el.remove()); resort(v); }
	});

	return { refresh, active, get status() { return status; } };
}
