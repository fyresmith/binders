/* The core file explorer: binder order, hidden binder and folder notes, a binder icon, and click to open.

   Obsidian has no API for the explorer's order, so this patches one undocumented method, the explorer view's
   `getSortedFolderItems(folder)`, which both the view's `sort()` and every folder item's `sort()` call to get the items
   to show in a folder. Everything undocumented is in the "Internals" block below and listed in docs/internals.md. If the
   method is missing, Binders says so once and the explorer keeps Obsidian's own order. */
import { around } from 'monkey-around';
import { Notice, TFolder, setIcon, type App, type EventRef, type Plugin, type TAbstractFile, type View } from 'obsidian';

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
	on(name: 'changed', callback: () => void): EventRef;
	offref(ref: EventRef): void;
}

export interface ExplorerSettings {
	orderExplorer: boolean;
	openOnClick: boolean;
	hideBinderNotes: boolean;
}

export interface Explorer {
	/** Re-reads the settings, patches or unpatches the explorer to match, and re-sorts it. Call after settings change. */
	refresh(): void;
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
}

const isExplorerView = (v: View): v is ExplorerView => {
	const x = v as Partial<ExplorerView>;
	return typeof x.getSortedFolderItems === 'function' && !!x.fileItems && typeof x.fileItems === 'object';
};

/** Loaded file explorer views; `missing` if one is loaded but lacks what we patch. Deferred (not yet loaded) leaves are skipped. */
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

// ---- The integration ----

const ICON = 'book';

export function installExplorer(plugin: Plugin, source: ExplorerSource, settings: () => ExplorerSettings, openBinder: (folder: TFolder) => void): Explorer {
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

	/** The binder icon on a binder folder's title, and off anything else. */
	const mark = (it: ExplorerItem) => {
		if (!(it.file instanceof TFolder) || !it.selfEl) return;
		const want = loaded && source.isBinderFolder(it.file), el = it.selfEl.querySelector(':scope > .binders-folder-icon');
		if (want && !el) {
			const icon = createDiv({ cls: 'binders-folder-icon', attr: { 'aria-label': 'Binder' } });
			setIcon(icon, ICON);
			it.selfEl.insertBefore(icon, it.innerEl && it.innerEl.parentElement === it.selfEl ? it.innerEl : null);
		} else if (!want && el) el.remove();
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
	};

	/** Clicking a binder, or a folder in one, opens it. Obsidian's own handler still expands or collapses the folder. */
	const onClick = (e: MouseEvent) => {
		if (!settings().openOnClick || e.defaultPrevented || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
		const t = e.target;
		if (!(t instanceof Element) || t.closest('.collapse-icon, [contenteditable="true"], input')) return;
		const title = t.closest<HTMLElement>('.nav-folder-title');
		if (!title || !title.closest('.workspace-leaf-content[data-type="file-explorer"]')) return;
		const f = app.vault.getAbstractFileByPath(title.dataset.path ?? '');
		if (f instanceof TFolder && (source.isBinderFolder(f) || source.inBinder(f))) openBinder(f);
	};

	app.workspace.onLayoutReady(() => {
		if (!loaded) return;
		refresh();
		plugin.registerEvent(app.workspace.on('layout-change', () => { if (status === 'waiting') refresh(); }));
		const ref = source.on('changed', refresh);
		plugin.register(() => source.offref(ref));
		plugin.registerDomEvent(document, 'click', onClick);
	});

	plugin.register(() => {
		loaded = false;
		unpatch?.(); unpatch = null;
		for (const v of explorerViews(app).views) { for (const k in v.fileItems) v.fileItems[k]?.selfEl?.querySelector(':scope > .binders-folder-icon')?.remove(); resort(v); }
	});

	return { refresh, get status() { return status; } };
}
