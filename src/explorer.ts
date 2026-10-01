/* The core file explorer: binder order, hidden binder and folder notes, a binder icon, click to open, and dragging to
   reorder.

   Obsidian has no API for the explorer's order, so this patches one undocumented method, the explorer view's
   `getSortedFolderItems(folder)`, which both the view's `sort()` and every folder item's `sort()` call to get the items
   to show in a folder. Everything undocumented is in the "Internals" block below and listed in docs/internals.md. If the
   method is missing, Binders says so once and the explorer keeps Obsidian's own order. */
import { around } from 'monkey-around';
import { Keymap, Notice, Platform, TAbstractFile, TFolder, type App, type EventRef, type PaneType, type Plugin, type View } from 'obsidian';

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
	/** The color of a note's or folder's label, as CSS, or null if it has none (or isn't in a binder). */
	labelColor(item: TAbstractFile): string | null;
	/** Could this item be put at a place in this folder's order (the binder can be changed, the item can go there)? */
	canPlace(item: TAbstractFile, folder: TFolder): boolean;
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

export interface ExplorerSettings {
	orderExplorer: boolean;
	openOnClick: boolean;
	hideBinderNotes: boolean;
	explorerLabels: boolean;
}

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

interface ExplorerItem { file: TAbstractFile; selfEl: HTMLElement; innerEl?: HTMLElement }
interface ExplorerView extends View {
	getSortedFolderItems(folder: TFolder): ExplorerItem[];
	fileItems: Record<string, ExplorerItem | undefined>;
	requestSort?: () => void;
	sort?: () => void;
	startRenameFile?: (file: TAbstractFile) => unknown;
}

const isExplorerView = (v: View): v is ExplorerView => {
	const x = v as Partial<ExplorerView>;
	return typeof x.getSortedFolderItems === 'function' && !!x.fileItems && typeof x.fileItems === 'object';
};

/** Loaded file explorer views; `missing` if one is loaded but lacks what we patch. Deferred (not yet loaded) leaves are skipped. */
/** Starts renaming an item where it is in the file explorer, as "New folder" there does (the explorer's undocumented
    `startRenameFile`). False if no explorer is showing or this Obsidian has no such thing: the name stays as made. */
export function renameInExplorer(app: App, file: TAbstractFile): boolean {
	for (const v of explorerViews(app).views) {
		if (typeof v.startRenameFile !== 'function' || !v.containerEl.isShown()) continue;
		try { void v.startRenameFile(file); return true; } catch { /* the name stays */ }
	}
	return false;
}

function explorerViews(app: App): { views: ExplorerView[]; missing: boolean } {
	const views: ExplorerView[] = [];
	let missing = false;
	for (const leaf of app.workspace.getLeavesOfType('file-explorer')) {
		if ((leaf as { isDeferred?: boolean }).isDeferred) continue; // not loaded yet (Obsidian 1.7.2+)
		if (isExplorerView(leaf.view)) views.push(leaf.view); else missing = true;
	}
	return { views, missing };
}

const resort = (v: ExplorerView) => { if (typeof v.requestSort === 'function') v.requestSort(); else v.sort?.(); };

/* Dragging in the explorer. Obsidian's drag manager knows what's being dragged (`draggable`: a file, a folder or several
   files), words the hint under the pointer (`setAction`) and tints what a drop would go into (`updateHover`). Its drop
   handlers on the explorer's rows leave an event alone once `preventDefault()` has been called on it, so a listener
   ahead of them (in the capture phase) can take a drop for itself. Without `draggable` nothing is taken, and dragging
   works as it does without Binders: it moves things into folders. */
interface Draggable { type?: unknown; file?: unknown; files?: unknown }
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

const EXPLORER = '.workspace-leaf-content[data-type="file-explorer"]';
/** A drop between two rows: the folder it goes into, the item it goes before (null: last), and where the line shows. */
interface Place { items: TAbstractFile[]; folder: TFolder; anchor: TAbstractFile | null; depth?: number; hint: string; line: { left: number; right: number; y: number }; refused?: boolean; onto?: HTMLElement }

// ---- The integration ----


export function installExplorer(plugin: Plugin, source: ExplorerSource, settings: () => ExplorerSettings, openBinder: (folder: TFolder, newLeaf: boolean | PaneType) => void, shown: () => TFolder | null = () => null): Explorer {
	const { app } = plugin;
	let unpatch: (() => void) | null = null, noticed = false, loaded = true;
	let status: Explorer['status'] = 'waiting';

	/** Binder order for one folder's items, with binder and folder notes left out. Never drops anything else. */
	const arrange = (folder: TFolder, items: ExplorerItem[]): ExplorerItem[] => {
		for (const it of items) mark(it);
		const order = source.orderedChildren(folder);
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
				const items = next.call(this, folder) as ExplorerItem[];
				try { return arrange(folder, items); } catch (e) { console.error('Binders: could not order the file explorer', e); return items; }
			},
		});
		status = 'patched';
	};

	const refresh = () => {
		if (!loaded) return;
		const on = settings().orderExplorer;
		if (on && !unpatch) patch();
		if (!on) { unpatch?.(); unpatch = null; status = 'off'; }
		const { views } = explorerViews(app);
		for (const v of views) { for (const k in v.fileItems) { const it = v.fileItems[k]; if (it) mark(it); } resort(v); }
		active();
	};

	/** Clicking a binder, or a folder in one, opens it; Mod-click or a middle click opens it in a new tab, as for a note.
	    Obsidian's own handler still expands or collapses the folder. Shift and Alt clicks select, so they're left alone. */
	/** The folder in a binder that a click in the file explorer is on, if the click is one that opens its view. */
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
		const after = own || y >= 1 - edge, rtl = getComputedStyle(title).direction === 'rtl';
		const name = (f: TAbstractFile) => (f instanceof TFolder ? f.name : f.name.replace(/\.[^.]+$/, ''));
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

	const onDragOver = (e: DragEvent) => {
		const place = loaded ? placeAt(e) : null;
		refusal = place?.refused ? place.hint : null;
		if (!place) { hideLine(); return; }
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
		plugin.registerDomEvent(doc, 'dragend', () => { hideLine(); if (refusal) new Notice(refusal + '.'); refusal = null; }, true);
		plugin.registerDomEvent(doc, 'dragleave', (e) => { if (!e.relatedTarget) hideLine(); }, true);
	};

	app.workspace.onLayoutReady(() => {
		if (!loaded) return;
		refresh();
		plugin.registerEvent(app.workspace.on('layout-change', () => { if (status === 'waiting') refresh(); else active(); }));
		plugin.registerEvent(app.workspace.on('active-leaf-change', () => active()));
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
		active();
		unpatch?.(); unpatch = null;
		for (const v of explorerViews(app).views) { for (const k in v.fileItems) v.fileItems[k]?.selfEl?.querySelectorAll(':scope > .binders-folder-tag, :scope > .binders-explorer-label').forEach((el) => el.remove()); resort(v); }
	});

	return { refresh, active, get status() { return status; } };
}
