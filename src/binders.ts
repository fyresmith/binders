import { Events, FileSystemAdapter, Notice, TFile, TFolder, normalizePath, parseYaml, stringifyYaml, type App, type EventRef, type TAbstractFile } from 'obsidian';
import type { ExplorerSource } from './explorer';
import type BindersPlugin from './main';
import { applyOps, checkFormat, diskList, FORMAT_VERSION, isBinderNote, isFolderNote, nameOf, orderChildren, parentOf, readIndex, relPath, removeFrom, settleNames, stepIndex, UnsupportedBinder, type ListOp } from './model';
import { editProperties, readProperties } from './properties';
import { nextName, parts } from './scene-text';
import { COMPILE_PROP, EXPORT_PROP, saveOpen } from './scenes';
import { History } from './history/history';
import { OrderHandler } from './history/order';
import { PropsHandler } from './history/props';
import { sameValue } from './history/values';
import type { Entry, PropChange } from './history/types';
import { SNAPSHOTS } from './snapshot-text';
import { followSnapshots, isOwn } from './snapshots';
import { labelCss, readLabel } from './view/labels';
import { afterGroup, applySceneOps, conversionPlan, isIgnored, isLongformIndex, longformRunning, readProject, sameScenes, sceneGroups, shownScenes, writeScenes, type Project, type Scene, type SceneOp } from './longform';

/* The binders in the vault: finds them, keeps each one's order in step with the vault, and writes changes back.
   Views and the explorer use only this; `model.ts` does the list logic, this file does the vault.

   Public API (plugin.binders). Each method's own comment says the rest.

   Finding and reading
     ready: Promise<void>                              resolves once binders have been looked for at startup
     settled: Promise<void>                            resolves once they've been looked for with the metadata cache
                                                       complete (on a cold start it fills after `ready`), so a folder not
                                                       found by then isn't in a binder
     on('changed', (binderPath: string) => …)          a binder's items, order or state changed ("" when it's unknown
                                                       which, e.g. a setting changed); unsubscribe with offref()
     refresh(): void                                   tells subscribers every binder may show differently (a setting)
     all(): Binder[]                                   every binder
     binderOf(item | path): Binder | null              the binder a file or folder is in (a binder folder is in its own)
     isBinderFolder(folder): boolean
     inBinder(item): boolean                           inside a binder (below a binder folder)
     isHiddenNote(file): boolean                       a binder note or folder note: never a scene
     problem(item | path): string | null               why a binder is read only (a newer format), or null
     orderedChildren(folder, {hidden}?): TAbstractFile[] | null
                                                       a folder's items in binder order; null outside binders. Binder and
                                                       folder notes are left out unless `hidden` (then they come first)
     scenes(folder): TFile[]                           the notes in a folder and its subfolders, in reading order
     groups(folder): Group[]                           the notes in a folder in reading order, in runs that belong together:
                                                       a subfolder's notes (binders), or scenes indented under a scene
                                                       (Longform projects, which have no subfolders)
     inOrder(items): TAbstractFile[]                   items in the order they show, whatever order they were picked in
     depthOf(item): number | undefined                 a Longform scene's indent
     labelColor(item): string | null                   the color of a note's or folder's label, as CSS
     folderNote(folder): TFile | null                  a folder's note (the binder note for a binder folder)
     ensureFolderNote(folder): Promise<TFile>          the folder note, created (empty) if it isn't there

   Changing the order
     move(item, folder, index, depth?): Promise<void>  puts an item at `index` among `folder`'s items, moving the file if
                                                       the folder changes. Longform projects: `depth` is the scene's new
                                                       indent (default: its own). Not remembered for "Undo" by itself
     canPlace(item, folder): boolean                   could `move` put this item in this folder?
     whyNot(item, folder): string | null               why it couldn't, in words, or null if it could
     put(items, folder, anchor, depth?): Promise<void> what a drop does: the items, in order, just before `anchor` (or
                                                       last), as one change that "Undo" takes back
     reorder(folder, items): Promise<void>             gives a folder's items a new order in one step and one write
     moveUp(item) / moveDown(item): Promise<boolean>   one step within its folder; false if it can't go further
     group(items, title?): Promise<TFolder>            puts items into a new folder, made where the first of them is
     ungroup(folder): Promise<void>                    moves everything in a folder out, to just after it; the folder,
                                                       left with nothing but its folder note, goes to the trash
                                                       ("Undo" makes it again, with that note)
     label(items, key, value, label, to?): Promise<void>
                                                       gives every item the same value of a property (a folder's goes
                                                       in its folder note, made if need be) and, with `to`, puts them
                                                       there, as one change that "Undo" takes back
     change(label, items, fn, made?, props?, emptied?): Promise<T>
                                                       runs a change made by hand, remembering where each item was, so
                                                       "Undo" can take it back (what `put`, `group` and the rest use)
     undoable(item | path, redo?): string | null       what "Undo" (or "Redo") would take back in that binder
     lastChanged(redo?): TFolder | null                the binder whose order was last changed by hand
     undo(item | path, redo?): Promise<string | null>  takes the last change back (or makes it again); all or nothing

   Making things
     afterItem(item): { index, depth? }                where a new note goes right after an item (a Longform scene: after
                                                       the scenes indented under it, at its indent)
     newScene(folder, index?, title?, depth?, content?): Promise<TFile>
                                                       creates a note in the binder at that place (default: last, empty);
                                                       Longform: `depth` is its indent (default: the scene before it's)
     newFolder(folder, index?, title?): Promise<TFolder>
                                                       makes a subfolder at that place (default: last)
     duplicate(item): Promise<TAbstractFile>           a copy of a note or folder right after it, a folder's in its order
     makeBinder(folder): Promise<TFile>                makes a folder a binder; returns the binder note
     conversion(binder, folders): Conversion           Longform projects: what "Convert to binder" would do
     convertToBinder(binder, opts): Promise<TFile>     Longform projects: makes it a binder; returns the binder note

   Properties
     setProps(file, patch): Promise<void>              sets properties (undefined removes one) through editProperties
     editProps(file, edit): Promise<void>              changes properties in place, in one write, from what the note says
                                                       at the time of writing (e.g. renaming a key inside an object)

   Snapshots (where they are kept; taking and bringing back is snapshots.ts)
     snapshotsFolder(binder): TFolder | null           the binder's "Snapshots" folder, unless it holds notes
     isSnapshotsFolder(file): boolean                  is this that folder (the explorer never lists it)?
     inSnapshots(path, old?): boolean                  is this path that folder, or in it?
     snapshotsSettle(): Promise<void>                  moves the snapshots of everything renamed or moved, now

   Writing
     flush(): Promise<void>                            writes pending list changes now (they are otherwise debounced)

   Only the binder note's `contents` is written, through processFrontMatter, debounced and batched per binder. Changes
   are kept as operations and applied to what the binder note says at the time of writing, so external edits aren't lost.
   Binders in a format newer than this version are listed but never written.

   Longform projects (kind 'longform', see longform.ts) are binders too: the binder folder is the project's scene folder,
   the binder note its index note, and the order its `longform.scenes`. Only notes directly in the scene folder are in
   such a binder (its subfolders aren't). Writing changes only `longform.scenes`, the same way (batched, applied to what
   the note says then). Renames and deletes are left to Longform when it's running, since it writes them itself. */

export interface Binder {
	/** A binder (binder note with `binder`), or a Longform project (index note with `longform`). */
	readonly kind: 'binder' | 'longform';
	/** The binder folder (a Longform project's scene folder). */
	readonly folder: TFolder;
	/** The binder note (the binder folder's folder note), or a Longform project's index note, which may be outside it. */
	readonly note: TFile;
	/** Why Binders can't change this binder (it's in a newer format), or null. */
	readonly problem: string | null;
}

/** A run of notes that belong together, in reading order. In a binder, a folder's own notes (`title` is its name; null
    for the folder asked about), `depth` levels below it; a folder's notes after one of its subfolders are a new run with
    `continued` set. In a Longform project, scenes indented `depth` levels under `head` (the scene above them). */
export interface Group {
	title: string | null;
	depth: number;
	/** The folder the notes are in (a Longform project's are all in its folder). */
	folder: TFolder;
	/** Longform: the scene these are indented under. */
	head: TFile | null;
	/** Another run of a group shown earlier (after a deeper one): views show no heading for it. */
	continued: boolean;
	files: TFile[];
}

/** What "Convert to binder" will do for a Longform project. */
export interface Conversion {
	/** The binder note to write: the index note if it's in the scene folder, or a new note named like that folder. */
	note: string;
	creates: boolean;
	contents: string[];
	/** Scenes moved into subfolders, and the folders made for them. */
	moves: { file: TFile; to: string }[];
	folders: string[];
	/** Notes Longform ignores, and subfolders, which a binder shows as its own. */
	joins: string[];
	/** Why it can't be done, or null. */
	problem: string | null;
}

/** How long changes to a list wait for more before they're written, in ms. */
const DEBOUNCE = 300;
/** How long changes waiting to be written are kept for a binder whose note stopped being a binder note, in ms: its
    properties can be unreadable for a moment (a sync client writing in two steps, the writer typing in them). */
const MEND = 30000;
/** How long the place of a deleted file is remembered in case the file comes straight back, in ms: some tools rewrite
    a file by deleting it and creating it again (git pull and checkout, some editors' saves). */
const RECALL = 2000;
/** How long after the last file arrived in it a folder still counts as being copied, in ms. */
const COPYING = 2000;
/** How long after the last file arrived in it a copied folder's own note is still looked for, in ms: a sync or a file
    manager can bring a folder's files minutes apart (see `adoptNote`). */
const COPY_NOTE = 600000;
/** How often, and how long apart in ms, a note that may still be arriving in a copied folder is looked at again. */
const ADOPT_TRIES = 5, ADOPT_WAIT = 400;
/** The longest a view waits for the metadata cache at startup before saying a folder isn't in a binder, in ms. */
const SETTLE_MAX = 10000;

/** One binder as the store keeps it: its note, the list the note has, and the changes waiting to be written. */
class State implements Binder {
	kind: 'binder' | 'longform';
	/** Longform: the project as the index note has it, changes not yet written, what shows (cached), and whether a
	    conversion to a binder is under way (its events are then ignored). */
	lf: Project = { sceneFolder: '/', scenes: [], ignored: [] };
	lfOps: SceneOp[] = [];
	shown: Scene[] | null = null;
	frozen = false;
	/** The folder's path as last seen; vault events report old paths, so lookups by old path use this. */
	path: string;
	/** Paths the folder had before a rename, until the next write, for events about its items that arrive late. */
	aliases = new Set<string>();
	/** The list as the binder note has it. */
	base: string[] = [];
	/** The entries of `base` that were typed as a bare null or true (see `readIndex`). */
	doubt = new Set<string>();
	problem: string | null = null;
	/** Changes not yet written. */
	ops: ListOp[] = [];
	timer = 0;
	/** Cached: the list with `ops` applied, and the items per folder. Cleared on any change. */
	contents: string[] | null = null;
	items: Map<string, Item[]> | null = null;
	/** Cached: each folder's items in order, as last asked for (by its path; "+" before it with binder and folder notes
	    included), as of a count of the vault's changes. Cleared on any change, like the two above. A drag over the file
	    explorer asks for the same folder's order many times per pointer move. */
	ordered: { at: number; lists: Map<string, TAbstractFile[]> } | null = null;
	/** Folders being copied beside the folder they're a copy of, by something other than Binders (Obsidian's "Make a
	    copy"), by their path in the binder: the folder each is a copy of, whether its order is waiting to be written,
	    and when a file last arrived in it. See `placeCopy`. */
	copies = new Map<string, { from: string; queued: boolean; at: number }>();
	/** Folders recognised as copies made by something other than Binders (see `copies`), with the folder each is a copy
	    of and when a file last arrived in it: the copied folder note may be among the last to come (see `adoptNote`). */
	copied = new Map<TFolder, { from: TFolder; at: number }>();
	/** Files deleted a moment ago, by their entry in the list (a Longform scene's name): the entries that stood before
	    and after each in its folder (and a scene's indent), so a file created again within `RECALL` goes back there. */
	gone = new Map<string, { prev: string | null; next: string | null; indent?: number; at: number }>();
	/** Cached: the binder's folder of snapshots (null: it has none), as of a count of the vault's changes. */
	snaps: { at: number; folder: TFolder | null } | null = null;
	/** The folder the binder note was in when found. If the note moves to another folder, that's another binder. */
	home: TFolder | null;
	/** `dir`: a Longform project's scene folder. */
	constructor(public note: TFile, public dir: TFolder | null = null) { this.kind = dir ? 'longform' : 'binder'; this.path = this.folder?.path ?? ''; this.home = note.parent; }
	get folder(): TFolder { return this.dir ?? this.note.parent; }
}

/** An item of a binder: its path as the list writes it, and the file or folder. */
interface Item { rel: string; file: TAbstractFile }
/** What "Undo" calls a move of these items. */
const moveLabel = (items: TAbstractFile[]): string => (items.length === 1 ? `Move “${items[0] instanceof TFile ? items[0].basename : items[0].name}”` : `Move ${items.length} items`);

/** Every binder in the vault, kept in step with it: the one place a binder is read, changed or undone
    (`plugin.binders`). The header above lists what it offers. */
export class BinderStore extends Events implements ExplorerSource {
	ready: Promise<void>;
	settled: Promise<void>;
	private states = new Map<TFile, State>();
	private warned = new Set<string>();
	/** Subfolders renamed, with their old names, so their folder notes can follow once the renames settle. */
	private renamedFolders: { folder: TFolder; oldName: string; tries?: number }[] = [];
	private followTimer = 0;
	private emits = new Set<string>();
	private emitTimer = 0;
	private app: App;

	constructor(private plugin: BindersPlugin) {
		super();
		this.app = plugin.app;
		this.history = new History({ binderOf: (item) => this.binderOf(item), all: () => this.all() });
		const host = {
			binderOf: (item: TAbstractFile | string) => this.binderOf(item), all: () => this.all(),
			orderedChildren: (folder: TFolder) => this.orderedChildren(folder), depthOf: (item: TAbstractFile) => this.depthOf(item),
			move: (item: TAbstractFile, folder: TFolder, index: number, depth?: number) => this.move(item, folder, index, depth),
			newFolder: (folder: TFolder, index?: number, title?: string) => this.newFolder(folder, index, title),
			setProp: (item: TAbstractFile, key: string, value: unknown, at?: number) => this.setProp(item, key, value, at),
			takeAway: (folder: TFolder) => this.takeAway(folder), bringBack: (parent: TFolder, index: number, name: string, note: ArrayBuffer | null) => this.bringBack(parent, index, name, note),
			readProp: (item: TAbstractFile, key: string) => this.readProp(item, key),
			settle: (files: TFile[]) => saveOpen(this.app, files),
		};
		this.history.onChange = () => { this.trigger('history'); };
		this.order = new OrderHandler(this.app, host, this.history);
		this.history.handlers = { order: this.order, props: new PropsHandler(this.app, host) };
		let done: () => void = () => {}, settle: () => void = () => {};
		this.ready = new Promise((r) => { done = r; });
		this.settled = new Promise((r) => { settle = r; });
		const { vault, metadataCache } = this.app;
		this.app.workspace.onLayoutReady(() => {
			this.rescan();
			// The cache may still be filling on a cold start: look again once every note that wasn't in it has been read.
			// ('resolved' alone isn't enough: Obsidian sends it whenever its link queue empties, even between batches.) If
			// every note is already in it (a warm start, or Binders turned on later), this first look was complete. Never
			// wait longer than SETTLE_MAX.
			let waiting: Set<string> | null = new Set(vault.getMarkdownFiles().filter((f) => !metadataCache.getFileCache(f)).map((f) => f.path));
			const complete = () => {
				if (!waiting) return;
				waiting = null;
				window.clearTimeout(timer);
				this.rescan();
				settle();
			};
			const check = () => {
				if (waiting) for (const p of waiting) { const f = vault.getFileByPath(p); if (!f || metadataCache.getFileCache(f)) waiting.delete(p); }
				if (waiting?.size === 0) complete();
			};
			const timer = window.setTimeout(complete, SETTLE_MAX);
			plugin.register(() => window.clearTimeout(timer));
			if (!waiting.size) { waiting = null; settle(); }
			else plugin.registerEvent(metadataCache.on('resolved', check));
			plugin.registerEvent(metadataCache.on('changed', (f, _d, cache) => {
				if (waiting?.delete(f.path) && !waiting.size) { complete(); return; }
				this.onMeta(f, isBinderNote(cache.frontmatter), isLongformIndex(cache.frontmatter));
			}));
			plugin.registerEvent(vault.on('rename', (f, old) => { this.vaultChanges++; if (f instanceof TFile) this.left.delete(f); this.onRename(f, old); if (f instanceof TFile) this.twinLeaves(old); }));
			plugin.registerEvent(vault.on('delete', (f) => { this.vaultChanges++; if (f instanceof TFile) this.left.delete(f); this.onDelete(f); if (f instanceof TFile) this.twinLeaves(f.path); }));
			plugin.registerEvent(vault.on('create', (f) => {
				this.vaultChanges++;
				if (this.orphans && f instanceof TFolder) this.rescan();
				const s = this.at(f.path);
				if (!s) return;
				// (a snapshot, or the folder of them: nothing a view shows; only what's remembered about the folder goes)
				if (f.path === `${s.folder.path}/${SNAPSHOTS}` || this.inSnapshots(f.path)) { this.touch(s, false); return; }
				this.touch(s);
				if (f instanceof TFile) this.twinArrives(s, f.path);
				if (this.comeBack(s, f)) return;
				this.placeCopy(s, f);
			}));
			done();
		});
		// Changes to a list wait a moment to be written together, and nothing may still be waiting at the end. Obsidian
		// doesn't unload plugins when it quits: it asks for the work to finish first. A phone that puts the app away, or
		// a window closed, gives no such chance, so a page that's hidden writes at once. Not on a computer, though: a
		// write there empties the file and then fills it, and one started as the page goes (the app reloaded) is cut
		// off between the two, which would leave the binder note empty. There the wait is short and quitting is asked
		// for, so nothing is started as the page leaves (see `cutOff` in view/editable-embed.ts).
		plugin.registerEvent(this.app.workspace.on('quit', (tasks) => { if (this.waiting()) tasks.addPromise(this.flush()); }));
		const now = () => { if (this.waiting()) void this.flush(); };
		// (the page itself going, on a computer: a real `pagehide`, and the page hidden that follows it)
		let leaving = false;
		plugin.registerDomEvent(document, 'visibilitychange', () => { if (document.hidden && !leaving) now(); });
		plugin.registerDomEvent(window, 'pagehide', (e) => {
			if (e.isTrusted && this.app.vault.adapter instanceof FileSystemAdapter) { leaving = true; window.setTimeout(() => { leaving = false; }, 0); return; }
			now();
		});
		plugin.register(() => { void this.flush(); window.clearTimeout(this.emitTimer); window.clearTimeout(this.followTimer); window.clearTimeout(this.snapshotsTimer); });
	}

	// ---- the public API (see the top of the file) ----

	on(name: 'changed', callback: (binderPath: string) => unknown, ctx?: unknown): EventRef;
	on(name: 'history', callback: () => unknown, ctx?: unknown): EventRef;
	on(name: string, callback: (...data: never[]) => unknown, ctx?: unknown): EventRef {
		return super.on(name, callback, ctx);
	}

	all(): Binder[] { return [...this.states.values()]; }

	binderOf(item: TAbstractFile | string): Binder | null { return this.at(typeof item === 'string' ? item : item.path); }

	isBinderFolder(folder: TAbstractFile): boolean { return folder instanceof TFolder && this.at(folder.path)?.folder === folder; }

	inBinder(item: TAbstractFile): boolean { const s = this.at(item.path); return !!s && item !== s.folder; }

	// ---- a binder's folder of snapshots (the snapshots themselves: snapshots.ts) ----

	/** The binder's folder of snapshots: the folder named "Snapshots" at its top (in a Longform project, in its scene
	    folder), unless that folder has notes in it (then it's a folder of the writer's own, and an item like any other).
	    What's in it are earlier texts of the binder's notes, never items of the binder: not in its order, its counts, a
	    export or any view, and never shown in the file explorer. */
	snapshotsFolder(binder: Binder): TFolder | null {
		const s = this.states.get(binder.note);
		if (!s) return null;
		if (s.snaps?.at === this.vaultChanges) return s.snaps.folder;
		const f = this.app.vault.getAbstractFileByPath(`${s.folder.path}/${SNAPSHOTS}`);
		const holdsNote = (d: TFolder): boolean => d.children.some((c) => (c instanceof TFolder ? holdsNote(c) : c instanceof TFile && c.extension === 'md'));
		return (s.snaps = { at: this.vaultChanges, folder: f instanceof TFolder && !holdsNote(f) ? f : null }).folder;
	}

	isSnapshotsFolder(file: TAbstractFile): boolean {
		if (!(file instanceof TFolder) || file.name !== SNAPSHOTS || !file.parent) return false;
		for (const s of this.states.values()) if (s.folder === file.parent) return this.snapshotsFolder(s) === file;
		return false;
	}

	/** Is this path a binder's folder of snapshots, or in it? `old`: a path from before a rename or a delete, looked up
	    by the binder folder's last known path. */
	inSnapshots(path: string, old = false): boolean {
		for (const s of this.states.values()) {
			for (const b of old ? [s.path, ...s.aliases] : [s.folder?.path ?? s.path]) {
				if ((path === `${b}/${SNAPSHOTS}` || path.startsWith(`${b}/${SNAPSHOTS}/`)) && this.snapshotsFolder(s)) return true;
			}
		}
		return false;
	}

	/** Where the snapshots of the note or folder at `path` are kept, or null if it isn't an item of a binder. */
	private snapshotsDirAt(path: string, isFolder: boolean, old: boolean): string | null {
		if (!isFolder && !/\.md$/i.test(path)) return null;
		// (a Longform project being made a binder: its scenes go into folders before it is one)
		const s = this.at(path, old) ?? [...this.states.values()].find((x) => x.frozen && path.startsWith(x.folder.path + '/')) ?? null;
		if (!s) return null;
		for (const b of old ? [s.path, ...s.aliases] : [s.folder.path]) {
			if (!path.startsWith(b + '/')) continue;
			const rel = path.slice(b.length + 1).replace(/\.md$/i, '');
			return rel === SNAPSHOTS || rel.startsWith(SNAPSHOTS + '/') ? null : `${s.folder.path}/${SNAPSHOTS}/${rel}`;
		}
		return null;
	}

	/** Counts files made, renamed and deleted: what's remembered about each binder's "Snapshots" folder is as of one. */
	private vaultChanges = 0;

	/** Notes and folders renamed or moved, whose snapshots are to follow (`to` null: out of every binder). */
	private movedItems: { from: string; to: string | null; name: string; binder: string; what: 'note' | 'folder' }[] = [];
	private snapshotsTimer = 0;

	/** A note or folder of a binder was renamed or moved: its snapshots go to the same place under "Snapshots" (in the
	    binder it's in now), once the renames have settled (a folder's items are reported one by one). */
	private snapshotsFollow(file: TAbstractFile, oldPath: string): void {
		const isFolder = file instanceof TFolder;
		const from = this.snapshotsDirAt(oldPath, isFolder, true), to = this.snapshotsDirAt(file.path, isFolder, false);
		if (!from || from === to) return;
		this.movedItems.push({ from, to, name: nameOf(file.path.replace(/\.md$/i, '')), binder: nameOf(from.slice(0, from.indexOf(`/${SNAPSHOTS}/`))), what: isFolder ? 'folder' : 'note' });
		window.clearTimeout(this.snapshotsTimer);
		this.snapshotsTimer = window.setTimeout(() => { void this.snapshotsSettle(); }, 80);
	}

	/** The moves of snapshots under way: one run at a time, each after the one before it. */
	private snapshotsMoving: Promise<void> = Promise.resolve();

	/** Moves the snapshots of everything renamed or moved since the last time. Resolves when they're where they belong.
	    The moves are made one at a time, in the order the renames came in: a burst of renames can pass a name from one
	    note to another (Arrival to Q, The keeper to Arrival, Q to The keeper), and only in that order is each folder
	    of snapshots where the next move looks for it. Renames that come in while moves are being made wait their turn
	    in the same line. */
	snapshotsSettle(): Promise<void> {
		window.clearTimeout(this.snapshotsTimer);
		type Move = BinderStore['movedItems'][number];
		// one exception to the order: a folder's own move goes ahead of the moves of what it carried along (the same
		// rename, reported item by item), so its snapshots go as one and those of the notes in it are then where they belong
		const carries = (f: Move, m: Move) => f !== m && f.what === 'folder' && f.to != null && m.from.startsWith(f.from + '/') && m.to === f.to + m.from.slice(f.from.length);
		const run = async (): Promise<void> => {
			// (the line itself, not a copy: what's added while a move is awaited is taken in its turn)
			const line = this.movedItems;
			while (line.length) {
				const first = line[0], ahead = line.findIndex((f) => carries(f, first));
				const m = line.splice(Math.max(0, ahead), 1)[0];
				const there = this.app.vault.getAbstractFileByPath(m.from);
				// (what's the item's own there: a note's snapshots are files, a folder's notes' are in folders)
				if (!(there instanceof TFolder) || !there.children.some((c) => isOwn(c, m.what))) continue;
				// out of every binder: its snapshots stay with the binder it left, as a deleted note's do
				if (!m.to) { new Notice(`“${m.name}” has left “${m.binder}”. Its snapshots stay there.`, 8000); continue; }
				try { await followSnapshots(this.app, m.from, m.to, m.what); }
				catch (e) { new Notice(`The snapshots of “${m.name}” couldn’t follow it. ${e instanceof Error ? e.message : String(e)}`, 8000); }
			}
		};
		return (this.snapshotsMoving = this.snapshotsMoving.then(run, run));
	}

	// ---- the public API, continued: reading a binder, and changing it ----

	isHiddenNote(file: TAbstractFile): boolean {
		const s = this.at(file.path);
		if (s?.kind === 'longform') return file === s.note;
		return !!s && file instanceof TFile && (file === s.note || (file.extension === 'md' && !!file.parent && file.parent !== s.folder && file.basename === file.parent.name));
	}

	labelColor(item: TAbstractFile): string | null {
		if (!this.at(item.path) || this.isHiddenNote(item)) return null;
		const note = item instanceof TFolder ? this.folderNote(item) : item instanceof TFile && item.extension === 'md' ? item : null;
		const s = this.plugin.settings, label = note ? this.app.metadataCache.getFileCache(note)?.frontmatter?.[s.labelProp] as unknown : null;
		// (read as the cards read it: a list's first entry, a color in any spelling)
		const name = readLabel(label, s.labels.map((l) => l.name));
		return name ? labelCss(name, s.labels) : null;
	}

	problem(item: TAbstractFile | string): string | null { return this.binderOf(item)?.problem ?? null; }

	orderedChildren(folder: TFolder, opts: { hidden?: boolean } = {}): TAbstractFile[] | null {
		// (a copy: the list itself is kept for the next time it's asked for)
		const list = this.ordered(folder, !!opts.hidden);
		return list && [...list];
	}

	/** A folder's items in binder order, worked out once per change to the binder: the list that's kept, not to be
	    changed by whoever asks. */
	private ordered(folder: TFolder, hidden: boolean): TAbstractFile[] | null {
		const s = this.at(folder.path);
		if (!s) return null;
		if (s.kind === 'longform' && folder !== s.folder) return null;
		if (s.ordered?.at !== this.vaultChanges) s.ordered = { at: this.vaultChanges, lists: new Map() };
		const key = (hidden ? '+' : '') + folder.path, kept = s.ordered.lists.get(key);
		if (kept) return kept;
		let list: TAbstractFile[];
		if (s.kind === 'longform') {
			const files = this.lfFiles(s), ordered = this.shownScenes(s).map((x) => files.get(x.title)).filter((f): f is TFile => !!f);
			list = hidden && s.note.parent === folder ? [s.note, ...ordered] : ordered;
		} else {
			const rel = this.folderRel(s, folder);
			const kids = this.items(s).get(rel) ?? [];
			const byRel = new Map(kids.map((k) => [k.rel, k.file]));
			const ordered = orderChildren(s.problem ? [] : this.contents(s), rel, kids.map((k) => k.rel)).map((r) => byRel.get(r));
			list = hidden ? [...folder.children.filter((c) => this.isHiddenNote(c)), ...ordered] : ordered;
		}
		// (asked for again while the binder is being found or changed, `touch` has cleared this: what's kept is as of now)
		s.ordered.lists.set(key, list);
		return list;
	}

	scenes(folder: TFolder): TFile[] {
		const out: TFile[] = [];
		const walk = (f: TFolder) => { for (const c of this.orderedChildren(f) ?? []) { if (c instanceof TFolder) walk(c); else if (c instanceof TFile && c.extension === 'md') out.push(c); } };
		walk(folder);
		return out;
	}

	groups(folder: TFolder): Group[] {
		const s = this.at(folder.path);
		if (!s) return [];
		const out: Group[] = [];
		if (s.kind === 'longform') {
			if (folder !== s.folder) return [];
			const files = this.lfFiles(s), seen = new Set<string>();
			for (const g of sceneGroups(this.shownScenes(s))) {
				const key = `${g.depth}/${g.head ?? ''}`;
				out.push({ title: g.head, depth: g.depth, folder, head: g.head == null ? null : files.get(g.head) ?? null, continued: seen.has(key), files: g.scenes.map((t) => files.get(t)).filter((f): f is TFile => !!f) });
				seen.add(key);
			}
			return out;
		}
		const walk = (f: TFolder, depth: number) => {
			let run: Group = { title: depth ? f.name : null, depth, folder: f, head: null, continued: false, files: [] };
			// a subfolder's first run shows even when empty, so its heading is there to drop onto
			const push = () => { if (run.files.length || (depth && !run.continued)) out.push(run); run = { ...run, continued: true, files: [] }; };
			for (const c of this.orderedChildren(f) ?? []) {
				if (c instanceof TFolder) { push(); walk(c, depth + 1); }
				else if (c instanceof TFile && c.extension === 'md') run.files.push(c);
			}
			push();
		};
		walk(folder, 0);
		return out;
	}

	folderNote(folder: TFolder): TFile | null {
		const s = this.at(folder.path);
		if (s && s.folder === folder) return s.note;
		const f = this.app.vault.getAbstractFileByPath(this.folderNotePath(folder));
		return f instanceof TFile ? f : null;
	}

	async ensureFolderNote(folder: TFolder): Promise<TFile> {
		return this.folderNote(folder) ?? await this.app.vault.create(this.folderNotePath(folder), '');
	}

	async move(item: TAbstractFile, folder: TFolder, index: number, depth?: number): Promise<void> {
		const t = this.writable(folder);
		if (this.isHiddenNote(item)) throw new Error('Binder and folder notes stay with their folder.');
		if (t.kind === 'longform') return this.lfMove(t, item, folder, index, depth);
		if (item instanceof TFolder && (folder === item || folder.path.startsWith(item.path + '/'))) throw new Error('A folder can’t go inside itself.');
		// a note named like the folder it goes into would become that folder's note, and leave the binder
		if (item instanceof TFile && item.extension === 'md' && item.basename === folder.name && item.parent !== folder) throw new Error(`“${item.basename}” can’t go into a folder with the same name: it would become the folder’s note.`);
		if (item.parent !== folder) {
			const to = normalizePath(`${folder.path}/${item.name}`);
			if (this.app.vault.getAbstractFileByPath(to)) throw new Error(`“${folder.name}” already has an item called “${item.name}”.`);
			await this.app.fileManager.renameFile(item, to);
		}
		const rel = this.relOf(t.folder.path, item.path, item instanceof TFolder);
		if (rel) this.queue(t, { op: 'move', item: rel, folder: this.folderRel(t, folder), index });
	}

	/** Whether `move` could put this item somewhere in this folder's order (the file explorer asks while dragging). */
	canPlace(item: TAbstractFile, folder: TFolder): boolean {
		const t = this.at(folder.path);
		if (!t || t.problem || t.frozen || this.isHiddenNote(item)) return false;
		const clash = item.parent !== folder && !!this.app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${item.name}`));
		if (t.kind === 'longform') {
			// its scenes are the notes in one folder; one it ignores stays as it is
			if (folder !== t.folder || !(item instanceof TFile) || item.extension !== 'md') return false;
			return item.parent === folder ? (this.orderedChildren(folder) ?? []).includes(item) : !clash;
		}
		if (item instanceof TFolder && (folder === item || folder.path.startsWith(item.path + '/'))) return false;
		if (item instanceof TFile && item.extension === 'md' && item.basename === folder.name && item.parent !== folder) return false;
		return !clash;
	}

	whyNot(item: TAbstractFile, folder: TFolder): string | null {
		const t = this.at(folder.path);
		if (!t || t.problem || t.frozen || this.isHiddenNote(item)) return '';
		const base = item instanceof TFile ? item.basename : item.name;
		if (t.kind === 'longform') {
			if (folder !== t.folder || !(item instanceof TFile) || item.extension !== 'md') return '';
			if (item.parent === folder) return (this.orderedChildren(folder) ?? []).includes(item) ? null : '';
		} else if (item instanceof TFolder && (folder === item || folder.path.startsWith(item.path + '/'))) return '';
		if (item.parent === folder) return null;
		if (item instanceof TFile && item.extension === 'md' && item.basename === folder.name) return `“${base}” would become the note of the folder “${folder.name}”, not a scene in it`;
		if (this.app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${item.name}`))) return `“${folder.name}” already has “${base}”`;
		return null;
	}

	inOrder(items: TAbstractFile[]): TAbstractFile[] {
		// each item's place as the indexes down from its binder's folder: [2, 0] is the first item of the third
		const place = (f: TAbstractFile): number[] | null => {
			const s = this.at(f.path);
			if (!s || f === s.folder) return null;
			const out: number[] = [];
			for (let c: TAbstractFile = f; c !== s.folder; c = c.parent) {
				if (!c.parent) return null;
				out.unshift((this.ordered(c.parent, true) ?? []).indexOf(c));
			}
			return out;
		};
		const keyed = items.map((f, i) => ({ f, i, b: this.at(f.path)?.path ?? null, p: place(f) }));
		return keyed.sort((x, y) => {
			if (!x.p || !y.p) return x.p ? -1 : y.p ? 1 : x.i - y.i;
			if (x.b !== y.b) return (x.b ?? '').localeCompare(y.b ?? '');
			for (let k = 0; k < Math.max(x.p.length, y.p.length); k++) { const d = (x.p[k] ?? -1) - (y.p[k] ?? -1); if (d) return d; }
			return x.i - y.i;
		}).map((x) => x.f);
	}

	/** Where a new note goes right after `item` in its folder's order, and the indent it takes. In a Longform project
	    that is after the scenes indented under `item` (its group stays with it), at its indent (see `afterGroup`). */
	afterItem(item: TAbstractFile): { index: number; depth?: number } {
		const s = this.at(item.path);
		if (s?.kind === 'longform' && item instanceof TFile) {
			const at = afterGroup(this.shownScenes(s), item.basename);
			if (at) return { index: at.index, depth: at.indent };
		}
		return { index: (item.parent ? this.orderedChildren(item.parent) ?? [] : []).indexOf(item) + 1 };
	}

	depthOf(item: TAbstractFile): number | undefined {
		const s = this.at(item.path);
		return s?.kind === 'longform' && item instanceof TFile ? this.shownScenes(s).find((x) => x.title === item.basename)?.indent : undefined;
	}

	/** Gives a folder's items a new order in one step: `items` are its items in the order wanted (any left out keep
	    their order, after them). One change to the list and one write however many there are, where a `move` apiece
	    would walk the whole list once for each: what a sort kept as the binder's order uses. Like `move`, it isn't
	    remembered for "Undo" by itself: run it inside `change`. */
	async reorder(folder: TFolder, items: TAbstractFile[]): Promise<void> {
		const t = this.writable(folder);
		const mine = items.filter((f) => f.parent === folder && !this.isHiddenNote(f));
		// (a Longform project's order is by scene, with indents: its scenes go one by one)
		if (t.kind === 'longform') { for (let i = 0; i < mine.length; i++) await this.move(mine[i], folder, i); return; }
		const rels = mine.map((f) => this.relOf(t.folder.path, f.path, f instanceof TFolder)).filter((r): r is string => !!r);
		this.queue(t, { op: 'order', folder: this.folderRel(t, folder), items: rels });
	}

	moveUp(item: TAbstractFile): Promise<boolean> { return this.step(item, -1); }
	moveDown(item: TAbstractFile): Promise<boolean> { return this.step(item, 1); }

	/** Puts items, in the order given, just before `anchor` in `folder` (or at its end), moving them there from other
	    folders if need be: what a drop does, as one change that "Undo" takes back. In a Longform project, `depth` is the
	    indent they take. */
	put(items: TAbstractFile[], folder: TFolder, anchor: TAbstractFile | null, depth?: number): Promise<void> {
		return this.change(moveLabel(items), items, async () => {
			for (const f of items) {
				if (f === anchor) continue;
				const sibs = (this.orderedChildren(folder) ?? []).filter((x) => x !== f);
				const i = anchor ? sibs.indexOf(anchor) : -1;
				await this.move(f, folder, i < 0 ? sibs.length : i, depth);
			}
		});
	}

	/** Gives every item the same value of a property (`undefined` takes it away): a note's own, a folder's in its folder
	    note (made if need be). With `to`, the items are put there too, as `put` does. One change that "Undo" takes back
	    whole, the property and the places; `label` says what it was. Only that property is written, through
	    editProperties: a note's text is never touched. */
	async label(items: TAbstractFile[], key: string, value: unknown, label: string, to?: { folder: TFolder; anchor: TAbstractFile | null; depth?: number }): Promise<void> {
		const first = items[0]?.parent;
		if (first) this.writable(first);
		// (as the disk has them: the cache is a moment behind a write, and a value taken back must be the one that was there)
		const props: PropChange[] = await Promise.all(items.map(async (file) => ({ file, key, before: await this.readProp(file, key), after: value, at: await this.propAt(file, key) })));
		return this.change(label, items, async () => {
			if (to) for (const f of items) {
				if (f === to.anchor) continue;
				const sibs = (this.orderedChildren(to.folder) ?? []).filter((x) => x !== f);
				const i = to.anchor ? sibs.indexOf(to.anchor) : -1;
				await this.move(f, to.folder, i < 0 ? sibs.length : i, to.depth);
			}
			for (const c of props) await this.setProp(c.file, key, value);
		}, undefined, props);
	}

	/** The note an item's properties are in: the note itself, or a folder's folder note (null if it has none). */
	private propNote(item: TAbstractFile): TFile | null { return item instanceof TFolder ? this.folderNote(item) : item instanceof TFile ? item : null; }
	/** An item's property as the disk has it now (undefined for none, or for a folder with no note). */
	private async readProp(item: TAbstractFile, key: string): Promise<unknown> {
		const note = this.propNote(item);
		return note ? (await readProperties(this.app, note))[key] : undefined;
	}
	/** Where a property stands among an item's, on the disk (undefined if it isn't there). */
	private async propAt(item: TAbstractFile, key: string): Promise<number | undefined> {
		const note = this.propNote(item), at = note ? Object.keys(await readProperties(this.app, note)).indexOf(key) : -1;
		return at < 0 ? undefined : at;
	}
	/** `at`: where a property that isn't there goes among the others (undefined: last). */
	private async setProp(item: TAbstractFile, key: string, value: unknown, at?: number): Promise<void> {
		// (a folder with no note of its own gets one only to hold a value, never to say it has none)
		const note = item instanceof TFolder && value !== undefined ? await this.ensureFolderNote(item) : this.propNote(item);
		if (!note) return;
		if (value === undefined || at === undefined) { await this.setProps(note, { [key]: value }); return; }
		await this.editProps(note, (fm) => {
			if (key in fm) { fm[key] = value; return; }
			const all = Object.entries(fm);
			all.splice(Math.min(at, all.length), 0, [key, value]);
			for (const k of Object.keys(fm)) delete fm[k];
			for (const [k, v] of all) fm[k] = v;
		});
	}

	// ---- undo (see history/) ----

	/** What was done by hand to binders, and taking it back (history/). */
	readonly history: History;
	private order: OrderHandler;
	/** (the history's two stacks, as the store has always had them: the tests empty and read them here) */
	get undos(): Entry[] { return this.history.undos; }
	set undos(list: Entry[]) { this.history.undos = list; }
	get redos(): Entry[] { return this.history.redos; }
	set redos(list: Entry[]) { this.history.redos = list; }

	/** Runs a change to a binder's order made by hand, remembering where each of `items` (in the order they show) was,
	    so "Undo" can put them back. `label` says what it was ("Move “Arrival”"). `made`: a folder the change made to
	    hold them, which undoing it takes away again. `emptied`: a folder the change moves everything out of, which
	    goes to the trash once nothing but its folder note is left in it, and which undoing the change makes again. */
	change<T>(label: string, items: TAbstractFile[], fn: () => Promise<T>, made?: (out: T) => TFolder | null, props?: PropChange[], emptied?: TFolder): Promise<T> { return this.history.track(this.order.change(label, items, fn, made, props, emptied)); }

	/** Sets properties of notes (a folder's are in its folder note) as the writer did by hand, as one change that "Undo"
	    takes back whole: `label` says what it was ("Set status of “Arrival”"), `what` names each property for a refusal
	    ("the status"). Only these properties are written, through editProperties: a note's text is never touched. What
	    each had before and has after is read from the disk, and undoing it writes the old value back only if the note
	    still has the one it was given. A change that changed nothing isn't recorded. */
	setByHand(label: string, writes: { note: TFile; patch: Record<string, unknown> }[], what?: Record<string, string>): Promise<void> {
		return this.history.track((async () => {
			// (a note that is gone is the write's to refuse, with the message it always had)
			for (const w of writes) if (w.note.parent && this.binderOf(w.note)) this.writable(w.note.parent);
			const before = await Promise.all(writes.map((w) => readProperties(this.app, w.note)));
			// (a change that failed half-way is still one to take back, as far as it got)
			let failed: unknown = null;
			try { for (const w of writes) await this.setProps(w.note, w.patch); } catch (e) { failed = e; }
			const after = await Promise.all(writes.map((w) => readProperties(this.app, w.note)));
			const changes: PropChange[] = [];
			writes.forEach((w, i) => { for (const key of Object.keys(w.patch)) if (!sameValue(before[i][key], after[i][key])) changes.push({ file: w.note, key, before: before[i][key], after: after[i][key], at: key in before[i] ? Object.keys(before[i]).indexOf(key) : undefined }); });
			const binder = writes.map((w) => this.binderOf(w.note)).find((b) => !!b);
			if (changes.length && binder && !binder.problem) this.history.record({ note: binder.note, label, steps: [{ kind: 'props', changes, what }] });
			if (failed) throw failed;
		})());
	}

	/** What "Undo" (or "Redo") would take back in this binder, or null. */
	undoable(item: TAbstractFile | string, redo = false): string | null { return this.history.undoable(item, redo); }

	/** The binder whose order was last changed by hand (or, with `redo`, last had a change undone): its folder. */
	lastChanged(redo = false): TFolder | null { return this.history.lastChanged(redo); }

	/** Takes back the last change made by hand to this binder's order (or, with `redo`, makes it again): each item it
	    moved goes back to the folder and the neighbours it had. Nothing is moved unless everything can be; then the
	    change stays to be undone later. Returns what was undone, or null. */
	undo(item: TAbstractFile | string, redo = false): Promise<string | null> { return this.history.undo(item, redo); }

	setProps(file: TFile, patch: Record<string, unknown>): Promise<void> {
		return this.editProps(file, (fm) => {
			for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete fm[k]; else fm[k] = v; }
		});
	}

	async editProps(file: TFile, edit: (fm: Record<string, unknown>) => void): Promise<void> {
		const s = this.at(file.path);
		if (s && s.note === file && s.problem) throw new UnsupportedBinder(s.problem);
		await editProperties(this.app, file, edit);
	}

	async newScene(folder: TFolder, index = Infinity, title = 'Untitled', depth?: number, content = ''): Promise<TFile> {
		const t = this.writable(folder);
		if (t.kind === 'longform' && folder !== t.folder) throw new Error(`“${folder.name}” isn’t in a binder.`);
		// a leading dot would make a hidden file, which Obsidian doesn't show
		const base = title.replace(/[\\/:]/g, ' ').trim().replace(/^\.+\s*/, '') || 'Untitled';
		let name = base;
		// a note named like its folder would be the folder note, not a scene
		for (let n = 1; name === folder.name || this.app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${name}.md`)); n++) name = `${base} ${n}`;
		const file = await this.app.vault.create(normalizePath(`${folder.path}/${name}.md`), content);
		if (t.kind === 'longform') { this.queueScenes(t, { op: 'move', item: file.basename, index, indent: depth }); return file; }
		this.queue(t, { op: 'move', item: this.relOf(t.folder.path, file.path, false), folder: this.folderRel(t, folder), index });
		return file;
	}

	/** Makes a subfolder in a binder's folder, at `index` among its items (default: last). */
	async newFolder(folder: TFolder, index = Infinity, title = 'Untitled'): Promise<TFolder> {
		const t = this.writable(folder);
		if (t.kind === 'longform') throw new Error('A Longform project has no folders. Convert it to a binder to use them.');
		const base = title.replace(/[\\/:]/g, ' ').trim().replace(/^\.+\s*/, '') || 'Untitled';
		let name = base;
		// (at the top of a binder "Snapshots" is taken: an empty folder of that name would be the binder's snapshots)
		for (let n = 1; this.app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${name}`)) || (folder === t.folder && name === SNAPSHOTS); n++) name = `${base} ${n}`;
		const made = await this.app.vault.createFolder(normalizePath(`${folder.path}/${name}`));
		this.queue(t, { op: 'move', item: this.relOf(t.folder.path, made.path, true), folder: this.folderRel(t, folder), index });
		return made;
	}

	/** A copy of a note or a folder (with everything in it, in its order), right after it, named by counting on:
	    "Scene" gives "Scene 2". */
	async duplicate(item: TAbstractFile): Promise<TAbstractFile> {
		const folder = item.parent;
		if (!folder) throw new Error('That can’t be copied.');
		const t = this.writable(folder), { vault } = this.app;
		if (item === t.folder || this.isHiddenNote(item)) throw new Error('Binder and folder notes stay with their folder.');
		const ext = item instanceof TFile ? '.' + item.extension : '', base = item instanceof TFile ? item.basename : item.name;
		// (a note named like its folder would be the folder's note)
		// (and a folder's copy can't take the name of a note in it: that note would be the copy's own)
		const inside = item instanceof TFolder ? new Set(item.children.filter((c): c is TFile => c instanceof TFile && c.extension === 'md').map((c) => c.basename)) : null;
		const name = nextName(base, (n) => !!vault.getAbstractFileByPath(normalizePath(`${folder.path}/${n}${ext}`)) || (ext === '.md' && n === folder.name) || !!inside?.has(n));
		const to = normalizePath(`${folder.path}/${name}${ext}`), { index, depth } = this.afterItem(item);
		if (item instanceof TFile) {
			const made = await this.copyFile(item, to);
			if (t.kind === 'longform') { this.queueScenes(t, { op: 'move', item: made.basename, index, indent: depth }); return made; }
			const rel = this.relOf(t.folder.path, made.path, false);
			if (rel) this.queue(t, { op: 'move', item: rel, folder: this.folderRel(t, folder), index });
			return made;
		}
		if (!(item instanceof TFolder) || t.kind === 'longform') throw new Error('That can’t be copied.');
		const was = this.relOf(t.folder.path, item.path, true), inner = was ? this.contents(t).filter((p) => p !== was && p.startsWith(was)) : [];
		const copy = async (from: TFolder, dest: string): Promise<void> => {
			await vault.createFolder(dest);
			for (const c of [...from.children]) {
				if (c instanceof TFolder) await copy(c, normalizePath(`${dest}/${c.name}`));
				// a folder's own note is named like it, so it's the copy's own note too
				else if (c instanceof TFile) await this.copyFile(c, normalizePath(`${dest}/${c.extension === 'md' && c.basename === from.name ? dest.split('/').pop() : c.basename}.${c.extension}`));
			}
		};
		try { await copy(item, to); } catch (e) {
			// half a copy is no use: it goes (it holds only copies), and the reason is passed on
			const half = vault.getAbstractFileByPath(to);
			if (half instanceof TFolder) await this.app.fileManager.trashFile(half).catch(() => { /* left as it is */ });
			throw e;
		}
		const made = vault.getAbstractFileByPath(to);
		if (!(made instanceof TFolder)) throw new Error('The copy couldn’t be made.');
		const rel = this.relOf(t.folder.path, made.path, true);
		if (rel && was) {
			// the copy keeps the order of what's in it
			this.queue(t, { op: 'append', item: rel, inner: inner.map((p) => rel + p.slice(was.length)) });
			this.queue(t, { op: 'move', item: rel, folder: this.folderRel(t, folder), index });
		}
		return made;
	}

	/** A note made next to one it's named after ("Arrival 1" beside "Arrival": Obsidian's "Make a copy", or a split by
	    hand) goes right after that one, not to the end of the folder. Only when the original has a place in the list.
	    A folder made that way ("Part One 1" beside "Part One") goes right after its original too, and what arrives in
	    it takes the original's order: Obsidian copies a folder file by file, so the list isn't written until they
	    have stopped arriving. */
	private placeCopy(s: State, f: TAbstractFile): void {
		if (s.kind !== 'binder' || s.problem || !f.parent) return;
		const mine = this.relOf(s.folder.path, f.path, f instanceof TFolder);
		if (!mine) return;
		const now = Date.now();
		// a file arriving in a folder that was copied: the copy's own folder note may be among them
		for (const [copy, c] of s.copied) {
			if (now - c.at > COPY_NOTE || this.app.vault.getAbstractFileByPath(copy.path) !== copy) { s.copied.delete(copy); continue; }
			if (!f.path.startsWith(copy.path + '/')) continue;
			c.at = now;
			if (f instanceof TFile && f.parent === copy) void this.adoptNote(s, copy, c.from);
		}
		// a file arriving in a folder that's being copied: its place is in the order the copy was given
		for (const [to, c] of s.copies) {
			if (now - c.at > COPYING) { s.copies.delete(to); continue; }
			if (mine === to || !mine.startsWith(to)) continue;
			c.at = now;
			if (!c.queued) { c.queued = true; this.queue(s, { op: 'copy', from: c.from, to }); }
			else if (s.ops.length) { window.clearTimeout(s.timer); s.timer = window.setTimeout(() => { void this.write(s); }, DEBOUNCE); }
			return;
		}
		if (f instanceof TFolder) {
			const m = /^(.+) (\d+)$/.exec(f.name), original = m ? this.app.vault.getAbstractFileByPath(normalizePath(`${f.parent.path}/${m[1]}`)) : null;
			const from = original instanceof TFolder ? this.relOf(s.folder.path, original.path, true) : null;
			// (its own folder note may come with it, whether or not the list knows the original: see `adoptNote`)
			if (original instanceof TFolder) { s.copied.set(f, { from: original, at: now }); void this.adoptNote(s, f, original); }
			if (!from || !this.contents(s).includes(from)) return;
			// after this task: whoever made it may be about to place it itself (New folder, Duplicate)
			window.setTimeout(() => {
				if (s.ops.some((o) => (o.op === 'move' || o.op === 'append') && o.item === mine) || s.base.includes(mine) || this.app.vault.getAbstractFileByPath(f.path) !== f) return;
				s.copies.set(mine, { from, queued: true, at: Date.now() });
				this.queue(s, { op: 'copy', from, to: mine });
			}, 0);
			return;
		}
		if (!(f instanceof TFile) || f.extension !== 'md' || this.isHiddenNote(f)) return;
		const m = /^(.+) (\d+)$/.exec(f.basename), original = m ? this.app.vault.getAbstractFileByPath(normalizePath(`${f.parent.path}/${m[1]}.md`)) : null;
		const rel = original ? this.relOf(s.folder.path, original.path, false) : null;
		if (!original || !rel || !this.contents(s).includes(rel) || s.ops.some((o) => o.op === 'move' && o.item === mine)) return;
		// after this task: whoever made it may be about to place it itself (New scene, Duplicate)
		window.setTimeout(() => {
			if (s.ops.some((o) => o.op === 'move' && o.item === mine) || s.base.includes(mine) || this.app.vault.getAbstractFileByPath(f.path) !== f || !f.parent) return;
			const sibs = this.orderedChildren(f.parent) ?? [], at = sibs.filter((x) => x !== f).indexOf(original);
			if (at >= 0) this.queue(s, { op: 'move', item: mine, folder: this.folderRel(s, f.parent), index: at + 1 });
		}, 0);
	}

	/** Folders whose copied folder note is being looked at (see `adoptNote`): one look at a time for each. */
	private adopting = new Set<TFolder>();

	/** A folder copied by something other than Binders ("Part One 1", made beside "Part One" by Obsidian's "Make a
	    copy", a file manager or a sync) brings the original's folder note along under its old name, "Part One.md",
	    which is then a scene of the copy and no longer the folder's note. That note is renamed to the copy's name, as
	    Binders' own Duplicate names it, so the copy keeps its synopsis and the rest. Only a note that is plainly the
	    copied folder note, since a rename here hides a note from the binder's views:
	    - it is directly in a folder that was recognised as a copy as it arrived (see `placeCopy`), and named like the
	      folder that one is a copy of, which still stands beside it;
	    - that folder has a folder note of its own, and this note is byte for byte the same;
	    - it has at least one of the properties Binders keeps in a folder note (synopsis, status, label, target, export);
	    - the copy has no note under its own name, in the vault or on the disk.
	    A file that is still being written is looked at again a few times. Only the name changes: no note is written
	    to, and links are left as they are (they never meant a note that has just arrived). */
	private async adoptNote(s: State, copy: TFolder, from: TFolder): Promise<void> {
		if (this.adopting.has(copy)) return;
		this.adopting.add(copy);
		try {
			const { vault } = this.app, st = this.plugin.settings;
			const props = [st.synopsisProp, st.statusProp, st.labelProp, st.targetProp, st.storyDateProp, st.storyOrderProp, st.notesProp, EXPORT_PROP, COMPILE_PROP];
			for (let i = 0; i < ADOPT_TRIES; i++) {
				if (i) await sleep(ADOPT_WAIT);
				const here = (f: TAbstractFile) => vault.getAbstractFileByPath(f.path) === f;
				if (this.states.get(s.note) !== s || s.kind !== 'binder' || s.problem || s.frozen || !here(copy) || !here(from) || copy.parent !== from.parent || copy.name === from.name) return;
				const note = vault.getAbstractFileByPath(normalizePath(`${copy.path}/${from.name}.md`)), theirs = vault.getAbstractFileByPath(this.folderNotePath(from)), to = this.folderNotePath(copy);
				if (!(note instanceof TFile) || !(theirs instanceof TFile)) return;
				// never over, or beside, a note that has the copy's name
				if (vault.getAbstractFileByPath(to) || await vault.adapter.exists(to)) return;
				const [a, b] = await Promise.all([vault.readBinary(note), vault.readBinary(theirs)]);
				// (not the same: it may still be arriving, so it's looked at again; a note that stays different is left)
				if (!sameBytes(a, b)) continue;
				let fm: unknown = null;
				try { const { yaml } = parts(new TextDecoder().decode(a)); fm = yaml ? parseYaml(yaml) : null; } catch { /* properties that can't be read aren't a folder note's */ }
				if (!fm || typeof fm !== 'object' || Array.isArray(fm) || !props.some((k) => k in fm)) return;
				// (asked again: all of this was read over several turns)
				if (!here(copy) || !here(note) || note.parent !== copy || note.basename !== from.name || vault.getAbstractFileByPath(to)) return;
				this.own.add(to);
				try { await vault.rename(note, to); } catch (e) { this.own.delete(to); console.error('Binders: a copied folder’s note couldn’t take its name', e); }
				return;
			}
		} catch (e) { console.error('Binders: a copied folder’s note couldn’t be looked at', e); }
		finally { this.adopting.delete(copy); }
	}

	/** A byte-for-byte copy of a file. */
	private async copyFile(file: TFile, to: string): Promise<TFile> {
		return this.app.vault.createBinary(to, await this.app.vault.readBinary(file));
	}

	/** Puts items into a new folder, made where the first of them is (Scrivener's "group"). */
	async group(items: TAbstractFile[], title = 'Untitled'): Promise<TFolder> {
		const parent = items[0]?.parent;
		if (!parent) throw new Error('Nothing to put in a folder.');
		const t = this.writable(parent);
		if (t.kind === 'longform') throw new Error('A Longform project has no folders. Convert it to a binder to use them.');
		if (items.some((f) => f === t.folder || this.isHiddenNote(f))) throw new Error('Binder and folder notes stay with their folder.');
		// a name nothing here has, and none of the notes going in (a note named like its folder would be the folder's own)
		const base = title.replace(/[\\/:]/g, ' ').trim().replace(/^\.+\s*/, '') || 'Untitled', names = new Set(items.map((f) => (f instanceof TFile ? f.basename : f.name)));
		let name = base;
		for (let n = 1; names.has(name) || this.app.vault.getAbstractFileByPath(normalizePath(`${parent.path}/${name}`)) || (parent === t.folder && name === SNAPSHOTS); n++) name = `${base} ${n}`; // ("Snapshots" at the top of a binder is taken)
		const label = items.length === 1 ? `Put “${items[0] instanceof TFile ? items[0].basename : items[0].name}” in a folder` : `Put ${items.length} items in a folder`;
		return this.change(label, items, async () => {
			const made = await this.newFolder(parent, Math.max(0, (this.orderedChildren(parent) ?? []).indexOf(items[0])), name);
			let i = 0;
			for (const f of items) await this.move(f, made, i++);
			return made;
		}, (made) => made);
	}

	/** Moves everything in a folder out of it, to just after it, in order. The folder, left with nothing but its folder
	    note, then goes to the trash (see `takeAway`), and "Undo" makes it again with that note; a folder that still
	    holds something stays. */
	async ungroup(folder: TFolder): Promise<void> {
		const parent = folder.parent;
		if (!parent) return;
		const t = this.writable(parent);
		if (folder === t.folder || t.kind === 'longform') throw new Error('A binder’s own folder can’t be emptied this way.');
		const items = this.orderedChildren(folder) ?? [], name = (f: TAbstractFile) => (f instanceof TFile ? f.basename : f.name);
		// (nothing to move out: not a change, so nothing "Undo" could take back, and the folder isn't touched)
		if (!items.length) return;
		// all of them can come out, or none does
		for (const f of items) {
			if (this.app.vault.getAbstractFileByPath(normalizePath(`${parent.path}/${f.name}`))) throw new Error(`“${parent.name}” already has “${name(f)}”. Rename one of them first.`);
			if (f instanceof TFile && f.extension === 'md' && f.basename === parent.name) throw new Error(`“${name(f)}” would become the note of the folder “${parent.name}”. Rename it first.`);
		}
		await this.change(`Ungroup “${folder.name}”`, items, async () => {
			let index = (this.orderedChildren(parent) ?? []).indexOf(folder) + 1;
			for (const f of items) await this.move(f, parent, index++);
		}, undefined, undefined, folder);
	}

	/** Trashes a folder an ungroup has emptied (as Obsidian's "Deleted files" setting says to), its folder note with
	    it, and returns that note's bytes to make it again with (null: it had no note). Only a folder with nothing left
	    in it but that note, in the vault and on the disk: anything else in it is someone's (a file Obsidian doesn't
	    list, say), and then the folder stays and null is returned. A folder note with text of its own under its
	    properties is writing, which never goes to the trash unasked: that folder stays too, and says why. */
	private async takeAway(folder: TFolder): Promise<{ note: ArrayBuffer | null } | null> {
		const { vault, fileManager } = this.app, s = this.at(folder.path);
		if (!s || s.kind !== 'binder' || s.problem || folder === s.folder || vault.getAbstractFileByPath(folder.path) !== folder) return null;
		const note = this.folderNote(folder);
		if (folder.children.some((c) => c !== note)) return null;
		try {
			// (what a file manager leaves in every folder it shows isn't anyone's)
			const disk = await vault.adapter.list(folder.path);
			if (disk.folders.length || disk.files.some((p) => p !== note?.path && !/(^|\/)\.DS_Store$/.test(p))) return null;
		} catch { return null; }
		let bytes: ArrayBuffer | null = null;
		if (note) {
			// (what's typed in it and not saved yet goes with it)
			await saveOpen(this.app, [note]);
			if (parts(await vault.read(note)).body.trim()) { new Notice(`“${folder.name}” stays: its folder note has text in it.`, 6000); return null; }
			bytes = await vault.readBinary(note);
		}
		// (asked again: a file may have arrived in it while its note was read)
		if (vault.getAbstractFileByPath(folder.path) !== folder || folder.children.some((c) => c !== note)) return null;
		await fileManager.trashFile(folder);
		return { note: bytes };
	}

	/** Makes a folder that `takeAway` trashed again, at `index` among `parent`'s items, with its folder note as it was
	    (byte for byte). A folder that has its name there now is used instead, and keeps a folder note it has. */
	private async bringBack(parent: TFolder, index: number, name: string, note: ArrayBuffer | null): Promise<TFolder> {
		const { vault } = this.app, there = vault.getAbstractFileByPath(normalizePath(`${parent.path}/${name}`));
		const folder = there instanceof TFolder ? there : await this.newFolder(parent, index, name);
		if (note && !vault.getAbstractFileByPath(this.folderNotePath(folder))) await vault.createBinary(this.folderNotePath(folder), note);
		return folder;
	}

	async makeBinder(folder: TFolder): Promise<TFile> {
		if (folder.isRoot()) throw new Error('The vault itself can’t be a binder.');
		const s = this.at(folder.path);
		if (s?.kind === 'longform') throw new Error(`“${folder.name}” is a Longform project. Use “Convert to binder” to make it a binder.`);
		if (s) throw new Error(s.folder === folder ? `“${folder.name}” is already a binder.` : `“${folder.name}” is inside the binder “${s.folder.name}”.`);
		// the order it shows in now: folders first, then notes, by name, as the file explorer has it
		const contents: string[] = [];
		const byName = (a: TAbstractFile, b: TAbstractFile) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
		const walk = (f: TFolder) => {
			const kids = f.children.filter((c) => (c instanceof TFolder && !(f === folder && c.name === SNAPSHOTS)) || (c instanceof TFile && c.extension === 'md' && c.basename !== f.name));
			for (const c of [...kids.filter((c) => c instanceof TFolder).sort(byName), ...kids.filter((c) => c instanceof TFile).sort(byName)]) {
				contents.push(this.relOf(folder.path, c.path, c instanceof TFolder));
				if (c instanceof TFolder) walk(c);
			}
		};
		walk(folder);
		const existing = this.folderNote(folder);
		if (existing) {
			// `contents` of its own that isn't a list is the user's, not ours to overwrite: refuse, changing nothing
			const theirs = (fm: Record<string, unknown>) => fm.contents != null && !Array.isArray(fm.contents);
			const refuse = () => new Error(`“${existing.basename}” already has a “contents” property that isn’t a list. Rename or remove it to make “${folder.name}” a binder.`);
			if (theirs(this.app.metadataCache.getFileCache(existing)?.frontmatter ?? {})) throw refuse();
			await editProperties(this.app, existing, (fm) => {
				if (theirs(fm)) throw refuse(); // checked again on what the note says now
				fm.binder = FORMAT_VERSION;
				if (fm.contents == null) fm.contents = diskList(contents);
			});
			return existing;
		}
		return this.app.vault.create(this.folderNotePath(folder), `---\n${stringifyYaml({ binder: FORMAT_VERSION, contents: diskList(contents) })}---\n`);
	}

	/** Is any binder's list waiting to be written? */
	private waiting(): boolean { return [...this.states.values()].some((s) => s.ops.length > 0 || s.lfOps.length > 0); }

	async flush(): Promise<void> { await Promise.all([...this.states.values()].map((s) => this.write(s))); }

	conversion(binder: Binder, folders: boolean): Conversion {
		const s = this.states.get(binder.note);
		if (!s || s.kind !== 'longform') throw new Error('That isn’t a Longform project.');
		const dir = s.folder, { vault } = this.app;
		const at = (name: string) => vault.getAbstractFileByPath(normalizePath(`${dir.path}/${name}`));
		const shown = this.shownScenes(s), files = this.lfFiles(s);
		const plan = conversionPlan(shown, folders, (name) => !!at(name));
		// the index note becomes the binder note if it's in the scene folder; otherwise a new note named like the folder
		const inside = s.note.parent === dir, note = inside ? s.note.path : normalizePath(`${dir.path}/${dir.name}.md`);
		const joins = [
			...[...files.keys()].filter((n) => isIgnored(n, s.lf.ignored)).sort(),
			...dir.children.filter((c) => c instanceof TFolder).map((c) => c.name + '/').sort(),
		];
		const moves = plan.moves.map((m) => ({ file: files.get(m.scene), to: normalizePath(`${dir.path}/${m.folder}/${m.scene}.md`) })).filter((m): m is { file: TFile; to: string } => !!m.file);
		let problem: string | null = null;
		if (!inside && at(`${dir.name}.md`)) problem = `“${dir.name}” already has a note called “${dir.name}”, which would become the binder note. Rename it first.`;
		return { note, creates: !inside, contents: plan.contents, moves, folders: [...new Set(plan.moves.map((m) => m.folder))], joins, problem };
	}

	async convertToBinder(binder: Binder, opts: { folders: boolean; removeLongform: boolean }): Promise<TFile> {
		const s = this.states.get(binder.note);
		if (!s || s.kind !== 'longform') throw new Error('That isn’t a Longform project.');
		await this.write(s); // pending reorders first, so the binder gets the order that shows
		const plan = this.conversion(binder, opts.folders), { vault, fileManager } = this.app;
		if (plan.problem) throw new Error(plan.problem);
		s.frozen = true; // its moves and the new binder note aren't changes to the Longform order
		try {
			for (const f of plan.folders) { const p = normalizePath(`${s.folder.path}/${f}`); if (!vault.getAbstractFileByPath(p)) await vault.createFolder(p); }
			for (const m of plan.moves) await fileManager.renameFile(m.file, m.to);
			const binderProps = (fm: Record<string, unknown>) => { fm.binder = FORMAT_VERSION; fm.contents = diskList(plan.contents); };
			const dropLongform = (fm: Record<string, unknown>) => { if (opts.removeLongform) delete fm.longform; };
			if (!plan.creates) {
				await editProperties(this.app, s.note, (fm) => { binderProps(fm); dropLongform(fm); });
				return s.note;
			}
			const props: Record<string, unknown> = {};
			binderProps(props);
			const note = await vault.create(plan.note, `---\n${stringifyYaml(props)}---\n`);
			if (opts.removeLongform) await editProperties(this.app, s.note, dropLongform);
			return note;
		} catch (e) {
			s.frozen = false;
			throw e;
		}
	}

	/** Tells subscribers every binder may have changed (e.g. a setting that affects how they show). */
	refresh(): void { this.emit(''); }

	// ---- finding binders ----

	/** The binder a path is in. Old paths (from rename and delete events) are looked up by the folder's last known path. */
	private at(path: string, old = false): State | null {
		for (const s of this.states.values()) {
			const bases = old ? [s.path, ...s.aliases] : [s.folder?.path ?? s.path];
			if (s.kind === 'longform') {
				// the scene folder, what's directly in it except folders, and the index note (which may be outside it)
				const i = path.lastIndexOf('/'), parent = i < 0 ? '' : path.slice(0, i);
				if (path === s.note.path || bases.some((b) => path === b || (parent === b && !(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)))) return s;
			} else if (bases.some((b) => path === b || path.startsWith(b + '/'))) return s;
		}
		return null;
	}

	/** Renames the store makes itself (a folder's note taking its folder's new name), by the path they end at. */
	private own = new Set<string>();

	/** Some Longform project's scene folder wasn't found by the last look: a folder made or renamed may be it. */
	private orphans = false;

	/** Finds every binder: a folder with a note whose properties have `binder`, and every Longform project not inside
	    one. A binder inside another is an ordinary note. If a folder has several binder notes, the one named like the
	    folder wins. */
	/** Changes that were waiting to be written when a binder's note stopped being a binder note where it stood (its
	    properties became unreadable, or lost `binder`), by the note: handed to the binder again if the note is one
	    again soon, for the same folder. Only then: a note that was deleted, moved or renamed is another matter, and
	    what was waiting for it is let go (a note made again under its name starts with nothing waiting). */
	private left = new Map<TFile, { ops: ListOp[]; lfOps: SceneOp[]; kind: State['kind']; folder: string; at: number }>();
	/** The note whose own change is being looked at (see `onMeta`), while binders are looked for again. */
	private mending: TFile | null = null;

	private rescan(): void {
		const { vault, metadataCache } = this.app;
		const found = new Map<string, TFile>();
		for (const f of vault.getMarkdownFiles()) {
			const parent = f.parent;
			if (!parent || parent.isRoot() || !isBinderNote(metadataCache.getFileCache(f)?.frontmatter)) continue;
			const cur = found.get(parent.path), named = (x: TFile) => x.basename === parent.name;
			if (!cur || (named(f) && !named(cur)) || (named(f) === named(cur) && f.path < cur.path)) found.set(parent.path, f);
		}
		const keep: TFile[] = [];
		for (const p of [...found.keys()].sort((a, b) => a.length - b.length)) {
			if (!keep.some((k) => p.startsWith(k.parent.path + '/'))) keep.push(found.get(p));
		}
		// note → its Longform scene folder, or null for a binder
		const want = new Map<TFile, TFolder | null>(keep.map((k): [TFile, null] => [k, null]));
		const inBinder = (p: string) => keep.some((k) => p === k.parent.path || p.startsWith(k.parent.path + '/'));
		const dirs = new Set<TFolder>();
		this.orphans = false;
		for (const f of vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path))) {
			const fm = metadataCache.getFileCache(f)?.frontmatter;
			if (isBinderNote(fm)) continue;
			const project = readProject(fm), dir = this.sceneFolder(f, project);
			// a project whose scene folder isn't there (yet): looked for again when a folder appears
			if (project && !dir) this.orphans = true;
			// a Longform project inside a binder is ordinary notes; two projects in one folder: the first by path
			if (!dir || inBinder(dir.path) || inBinder(f.path) || dirs.has(dir)) continue;
			dirs.add(dir); want.set(f, dir);
		}
		for (const [note, s] of this.states) {
			// a binder note moved to another folder makes that folder the binder: its list is re-read, never re-pointed
			if (want.has(note) && want.get(note) === s.dir && (s.kind === 'longform' || note.parent === s.home)) continue;
			window.clearTimeout(s.timer);
			// (its properties may only be unreadable for a moment: what was waiting to be written isn't forgotten)
			if (note === this.mending && (s.ops.length || s.lfOps.length)) this.left.set(note, { ops: s.ops, lfOps: s.lfOps, kind: s.kind, folder: s.path, at: Date.now() });
			this.states.delete(note);
			this.emit(s.path);
		}
		for (const [note, dir] of want) {
			let s = this.states.get(note);
			if (!s) {
				const made = s = new State(note, dir);
				this.states.set(note, made); this.read(made);
				const was = this.left.get(note);
				this.left.delete(note);
				if (was && !made.problem && was.kind === made.kind && was.folder === made.path && Date.now() - was.at < MEND) {
					made.ops = was.ops; made.lfOps = was.lfOps;
					made.timer = window.setTimeout(() => { void this.write(made); }, DEBOUNCE);
				}
				this.touch(made);
			}
			else if (s.path !== s.folder.path) { s.aliases.add(s.path); this.emit(s.path); s.path = s.folder.path; this.touch(s); }
			else this.touch(s, false);
		}
	}

	/** A Longform project's scene folder, if it's one Binders can use (not the vault itself). */
	private sceneFolder(note: TFile, p: Project | null): TFolder | null {
		if (!p || !note.parent) return null;
		const dir = this.app.vault.getAbstractFileByPath(normalizePath(`${note.parent.path}/${p.sceneFolder}`));
		return dir instanceof TFolder && !dir.isRoot() ? dir : null;
	}

	/** Reads the binder note's list. A newer format makes the binder read only, with a notice the first time. */
	private read(s: State): void {
		if (s.kind === 'longform') { s.lf = readProject(this.app.metadataCache.getFileCache(s.note)?.frontmatter) ?? s.lf; return; }
		try {
			const idx = readIndex(this.app.metadataCache.getFileCache(s.note)?.frontmatter ?? {}, s.note.basename);
			s.base = idx.contents; s.doubt = idx.doubtful;
			s.problem = null;
		} catch (e) {
			if (!(e instanceof UnsupportedBinder)) throw e;
			s.base = []; s.ops = []; s.problem = e.message;
			// said once; not at all while a binder view shows this binder, which says it above its toolbar
			const shown = this.app.workspace.getLeavesOfType('binders-view').some((l) => { const f = (l.view as { folder?: TFolder | null }).folder; return !!f && this.at(f.path) === s; });
			if (!this.warned.has(s.note.path) && !shown) { this.warned.add(s.note.path); new Notice(`Binders can’t change “${s.folder.name}”. ${e.message}`); }
		}
	}

	// ---- keeping the list in step with the vault ----

	private onMeta(file: TFile, binderNote: boolean, longform: boolean): void {
		const s = this.states.get(file);
		// still the same kind of binder, with (for Longform) the same scene folder: just re-read the order
		const same = s && (s.kind === 'binder' ? binderNote : longform && !binderNote && this.sceneFolder(file, readProject(this.app.metadataCache.getFileCache(file)?.frontmatter)) === s.dir);
		if (s && same) this.ifChanged(s, () => this.read(s));
		else if (s || binderNote || longform) {
			this.mending = file;
			try { this.rescan(); } finally { this.mending = null; }
		}
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		const isFolder = file instanceof TFolder;
		// Rescanning drops a binder moved inside another; remember its order first.
		const carried = isFolder ? [...this.states.values()].find((s) => s.kind === 'binder' && s.folder === file) : null;
		const carriedOrder = carried ? [...this.contents(carried)] : null;
		// the binder note moved, a folder holding a binder, or a note that could make a folder a binder (a binder note or
		// Longform index moved into a plain folder, or out of a binder): which folders are binders may have changed
		if ((file instanceof TFile && this.states.has(file)) || (isFolder && ([...this.states.values()].some((s) => s.path === oldPath || s.path.startsWith(oldPath + '/')) || this.orphans)) || this.holdsBinderNote(file)) this.rescan();
		// a binder's own folder renamed: its note, named like the folder, follows the new name (as a folder's note does)
		if (isFolder) {
			const own = [...this.states.values()].find((s) => s.kind === 'binder' && s.folder === file), oldName = nameOf(oldPath);
			if (own && own.note.parent === file && own.note.basename === oldName && oldName !== file.name) {
				this.renamedFolders.push({ folder: file, oldName });
				window.clearTimeout(this.followTimer);
				this.followTimer = window.setTimeout(() => { void this.followFolderNotes(); }, 50);
			}
		}
		let o = this.at(oldPath, true), n = this.at(file.path);
		// an item's snapshots follow it; and a snapshot moved is nothing to a binder's list
		const so = this.inSnapshots(oldPath, true), sn = this.inSnapshots(file.path);
		if (!so && !sn) this.snapshotsFollow(file, oldPath);
		if (o && so) { this.touch(o, false); o = null; }
		if (n && sn) { this.touch(n, false); n = null; }
		if ((so || sn) && !o && !n) return;
		// a scene renamed to its folder's name, or moved into a folder of its own name, becomes that folder's note and
		// stops showing as a scene: said, since nothing else would tell
		if (file instanceof TFile && file.extension === 'md' && file.parent && o && n && n.kind === 'binder' && file !== n.note && file.basename === file.parent.name && file.parent !== n.folder) {
			// (not when it was the folder's note already, nor when it's a folder's note following its folder's new name)
			const was = oldPath.replace(/\.md$/i, '').split('/'), wasNote = was.length > 1 && was[was.length - 1] === was[was.length - 2];
			if (!wasNote && !this.own.delete(file.path)) new Notice(`“${file.basename}” is now the note of the folder “${file.parent.name}”, so it no longer shows as a scene. Rename it to make it a scene again.`, 8000);
		}
		// Longform projects know scenes by name; a note moving between a project and a binder is handled half by each
		if (o?.kind === 'longform' || n?.kind === 'longform') {
			this.lfRename(file, oldPath, o?.kind === 'longform' ? o : null, n?.kind === 'longform' ? n : null);
			if (o?.kind === 'longform') o = null;
			if (n?.kind === 'longform') n = null;
		}
		if (n && file instanceof TFile) this.twinArrives(n, file.path);
		const or = o && this.relAt(o, oldPath, isFolder), nr = n && this.relOf(n.folder.path, file.path, isFolder);
		if (o && o === n) {
			if (or && nr && or !== nr) {
				this.queue(o, { op: 'rename', from: or, to: nr });
				if (isFolder && nameOf(or) !== file.name) this.renamedFolders.push({ folder: file, oldName: nameOf(or) });
			} else this.touch(o, false); // an item of a renamed folder: its place in the binder is the same
			// Obsidian reports a folder's items one by one after the folder: folder notes follow once they're all in
			if (this.renamedFolders.length) { window.clearTimeout(this.followTimer); this.followTimer = window.setTimeout(() => { void this.followFolderNotes(); }, 50); }
			return;
		}
		// a folder from another binder brings its order along
		const inner = carriedOrder && carried && !this.states.has(carried.note) && nr ? carriedOrder.map((p) => nr + p)
			: isFolder && o && or && nr ? this.contents(o).filter((p) => p !== or && p.startsWith(or)).map((p) => nr + p.slice(or.length)) : [];
		if (o && or) this.queue(o, { op: 'remove', item: or });
		if (n && nr) { if (this.isHiddenNote(file)) this.touch(n); else this.queue(n, inner.length ? { op: 'append', item: nr, inner } : { op: 'append', item: nr }); }
	}

	/** Is this a binder note or Longform index, or a folder with one somewhere inside? */
	private holdsBinderNote(f: TAbstractFile): boolean {
		if (f instanceof TFolder) return f.children.some((c) => this.holdsBinderNote(c));
		const fm = f instanceof TFile && f.extension === 'md' ? this.app.metadataCache.getFileCache(f)?.frontmatter : null;
		return !!fm && (isBinderNote(fm) || isLongformIndex(fm));
	}

	private onDelete(file: TAbstractFile): void {
		if (file instanceof TFile && this.states.has(file)) { this.rescan(); return; }
		const o = this.at(file.path, true);
		if (o && (file.path === `${o.path}/${SNAPSHOTS}` || this.inSnapshots(file.path, true))) { this.touch(o, false); return; } // a snapshot: not an item
		if (o?.kind === 'longform') {
			if (file instanceof TFile && file.extension === 'md') {
				// (where it stood, among the scenes as they showed with it)
				const shown = shownScenes(o.lfOps.length ? applySceneOps(o.lf.scenes, o.lfOps, [...this.lfFiles(o).keys(), file.basename], o.lf.ignored) : o.lf.scenes, [...this.lfFiles(o).keys(), file.basename], o.lf.ignored);
				const i = shown.findIndex((x) => x.title === file.basename);
				if (i >= 0 && o.lf.scenes.some((x) => x.title === file.basename)) o.gone.set(file.basename, { prev: shown[i - 1]?.title ?? null, next: shown[i + 1]?.title ?? null, indent: shown[i].indent, at: Date.now() });
				this.lfChange(o, { op: 'remove', item: file.basename });
			} else this.touch(o);
			return;
		}
		const rel = o && this.relAt(o, file.path, file instanceof TFolder);
		if (!o || !rel) return;
		if (file instanceof TFile && !o.problem) {
			// where it stood among its folder's entries, in case it's on its way back (see `comeBack`)
			const list = this.contents(o), i = list.indexOf(rel), parent = parentOf(rel), sib = (p: string) => parentOf(p) === parent;
			if (i >= 0) o.gone.set(rel, { prev: list.slice(0, i).reverse().find(sib) ?? null, next: list.slice(i + 1).find(sib) ?? null, at: Date.now() });
		}
		// (a folder deleted takes with it what was remembered of the files in it: one made again under its name is new)
		if (file instanceof TFolder) for (const k of [...o.gone.keys()]) if (k.startsWith(rel)) o.gone.delete(k);
		// What shows is the list as it showed, less this item. Kept, since working it out again from every pending change
		// for each file of a deleted folder (they are reported one by one) took seconds for a binder of 2,000 notes.
		const shown = o.problem ? null : removeFrom(this.contents(o), rel);
		this.queue(o, { op: 'remove', item: rel });
		if (shown) o.contents = shown;
	}

	/** A file made where one was deleted a moment ago is that file written again (git pull and checkout, and some
	    editors, rewrite a file by deleting it and creating it): it goes back to the place it had in the list, not to the
	    end of its folder, unless the list as it is when written mentions it already (see `restoreIn`). True if that
	    was asked for. */
	private comeBack(s: State, f: TAbstractFile): boolean {
		const now = Date.now();
		for (const [k, g] of s.gone) if (now - g.at > RECALL) s.gone.delete(k);
		if (!(f instanceof TFile) || !f.parent || s.problem || s.frozen) return false;
		if (s.kind === 'longform') {
			const g = f.extension === 'md' && f.parent === s.folder ? s.gone.get(f.basename) : undefined;
			if (!g || longformRunning(this.app)) return false;
			s.gone.delete(f.basename);
			this.queueScenes(s, { op: 'restore', item: f.basename, prev: g.prev, next: g.next, indent: g.indent ?? 0 });
			return true;
		}
		const rel = this.relOf(s.folder.path, f.path, false), g = rel ? s.gone.get(rel) : undefined;
		if (!rel || !g) return false;
		s.gone.delete(rel);
		this.queue(s, { op: 'restore', item: rel, prev: g.prev, next: g.next });
		return true;
	}

	// ---- Longform projects ----

	/** A note renamed or moved in, out of, or inside a Longform project's scene folder. */
	private lfRename(file: TAbstractFile, oldPath: string, o: State | null, n: State | null): void {
		if (!(file instanceof TFile) || file.extension !== 'md' || file === o?.note || file === n?.note) { if (o) this.touch(o); if (n && n !== o) this.touch(n); return; }
		const oldName = oldPath.endsWith('.md') ? oldPath.slice(oldPath.lastIndexOf('/') + 1, -3) : null;
		const into = n && file.parent === n.folder;
		if (o && o === n && oldName != null && into) {
			if (oldName !== file.basename) this.lfChange(o, { op: 'rename', from: oldName, to: file.basename });
			else this.touch(o); // its folder was renamed
			return;
		}
		if (o && oldName != null) this.lfChange(o, { op: 'remove', item: oldName });
		else if (o) this.touch(o);
		// a note moved in shows after the listed scenes, as Longform shows new notes, until it's moved
		if (n) this.touch(n);
	}

	/** Follows a rename or delete. Longform, when it's running, writes these itself, so Binders only shows them. */
	private lfChange(s: State, op: SceneOp): void {
		if (s.frozen) { this.touch(s); return; }
		if (!longformRunning(this.app)) { this.queueScenes(s, op); return; }
		const files = [...this.lfFiles(s).keys()];
		s.lf = { ...s.lf, scenes: applySceneOps(s.lf.scenes, [op], files, s.lf.ignored) };
		this.touch(s);
	}

	private async lfMove(s: State, item: TAbstractFile, folder: TFolder, index: number, depth?: number): Promise<void> {
		if (folder !== s.folder) throw new Error('A Longform project keeps its scenes in one folder.');
		if (!(item instanceof TFile) || item.extension !== 'md') throw new Error('Only notes can be scenes in a Longform project.');
		if (item.parent !== folder) {
			const to = normalizePath(`${folder.path}/${item.name}`);
			if (this.app.vault.getAbstractFileByPath(to)) throw new Error(`“${folder.name}” already has a note called “${item.basename}”.`);
			await this.app.fileManager.renameFile(item, to);
		}
		this.queueScenes(s, { op: 'move', item: item.basename, index, indent: depth });
	}

	/** The notes in a project's scene folder by name, without the index note. */
	private lfFiles(s: State): Map<string, TFile> {
		const out = new Map<string, TFile>();
		for (const c of s.folder.children) if (c instanceof TFile && c.extension === 'md' && c !== s.note) out.set(c.basename, c);
		return out;
	}

	/** The scenes as they show, with pending changes applied. */
	private shownScenes(s: State): Scene[] {
		if (s.shown) return s.shown;
		const files = [...this.lfFiles(s).keys()];
		const list = s.lfOps.length ? applySceneOps(s.lf.scenes, s.lfOps, files, s.lf.ignored) : s.lf.scenes;
		return (s.shown = shownScenes(list, files, s.lf.ignored));
	}

	private queueScenes(s: State, op: SceneOp): void {
		s.lfOps.push(op);
		window.clearTimeout(s.timer);
		s.timer = window.setTimeout(() => { void this.write(s); }, DEBOUNCE);
		this.touch(s);
	}

	/** Writes a project's pending changes into `longform.scenes` only, applied to what the index note says now. */
	private async writeScenes(s: State): Promise<void> {
		window.clearTimeout(s.timer);
		const ops = s.lfOps;
		s.lfOps = [];
		s.aliases.clear();
		if (!ops.length || this.states.get(s.note) !== s || this.app.vault.getAbstractFileByPath(s.note.path) !== s.note) return;
		const files = [...this.lfFiles(s).keys()];
		const next = (list: Scene[]) => applySceneOps(list, ops, files, s.lf.ignored);
		if (sameScenes(next(s.lf.scenes), s.lf.scenes)) { this.touch(s, false); return; }
		const shown = this.contents(s);
		try {
			await this.app.fileManager.processFrontMatter(s.note, (fm: Record<string, unknown>) => {
				const p = isBinderNote(fm) ? null : readProject(fm);
				if (!p) throw new NotABinder();
				const list = next(p.scenes);
				if (sameScenes(list, p.scenes)) throw new NotABinder(); // nothing to write
				writeScenes(fm, list);
				s.lf = { ...p, scenes: list }; // don't wait for the cache, so the order doesn't flicker back
			});
		} catch (e) {
			if (!(e instanceof NotABinder) && !(await this.noteGone(s))) throw e;
		}
		this.touch(s, false);
		if (JSON.stringify(this.contents(s)) !== JSON.stringify(shown)) this.emit(s.path);
	}

	/** After a write failed: is the note gone from the disk? Obsidian deletes a folder from the disk first and reports
	    its files after, the binder note among the last, so a change that was waiting can be written in between, to a note
	    the vault still lists. There's nothing to write to then, and nothing to say: the binder goes with its note. */
	private async noteGone(s: State): Promise<boolean> {
		try { return !(await this.app.vault.adapter.exists(s.note.path)); } catch { return false; }
	}

	/** A renamed subfolder keeps its folder note: "Part One/Part One" follows the folder to "Part 1/Part 1". Run after the
	    rename's events settle, never during it (the vault is then half updated). If the folder already has a note with
	    the new name, both are left alone: that note is the folder note now, and no file is overwritten. */
	private followFolderNotes(): Promise<void> {
		const run = async (): Promise<void> => {
			const pending = this.renamedFolders;
			this.renamedFolders = [];
			const { vault, fileManager } = this.app;
			// a folder renamed again before its note had followed: the note still has one of the names the folder had
			const names = new Map<TFolder, { olds: string[]; tries: number }>();
			for (const { folder, oldName, tries } of pending) {
				const n = names.get(folder) ?? { olds: [], tries: 0 };
				n.olds.unshift(oldName); n.tries = Math.max(n.tries, tries ?? 0);
				names.set(folder, n);
			}
			for (const [folder, { olds, tries }] of names) {
				if (vault.getAbstractFileByPath(folder.path) !== folder) continue;
				const to = normalizePath(`${folder.path}/${folder.name}.md`);
				const note = olds.map((o) => vault.getAbstractFileByPath(normalizePath(`${folder.path}/${o}.md`))).find((f): f is TFile => f instanceof TFile && f.path !== to);
				if (!note) continue;
				// a case-only rename is the same file on some disks, so only the vault's own map can tell
				const clash = vault.getAbstractFileByPath(to) || (note.path.toLowerCase() !== to.toLowerCase() && await vault.adapter.exists(to));
				if (clash) continue;
				this.own.add(to);
				let said = '';
				// (never waited for longer than a few seconds: the runs are in a line, and one that hung would hold up the rest)
				try { await Promise.race([fileManager.renameFile(note, to), new Promise((r) => window.setTimeout(r, 3000))]); }
				catch (e) { said = e instanceof Error ? e.message : String(e); }
				// Renamed again under the note while this was on its way, a folder can leave it where it was: Obsidian
				// refuses one of the two renames, not always this one. Tried again from where things stand, a few times at most.
				if (vault.getAbstractFileByPath(note.path) !== note || vault.getAbstractFileByPath(folder.path) !== folder || note.parent !== folder || note.basename === folder.name) continue;
				this.own.delete(to);
				if (tries < 3) {
					this.renamedFolders.push({ folder, oldName: note.basename, tries: tries + 1 });
					window.clearTimeout(this.followTimer);
					this.followTimer = window.setTimeout(() => { void this.followFolderNotes(); }, 50);
				} else if (said) new Notice(`The folder note “${note.basename}” couldn’t be renamed to match its folder. ${said}`);
			}
		};
		// one run at a time: a second, started while a note of the first is still being renamed, would look for that
		// note under a name it doesn't have yet, find nothing, and leave it named after a folder name that's gone
		return (this.followingNotes = this.followingNotes.then(run, run));
	}

	/** The renaming of folder notes under way (see `followFolderNotes`). */
	private followingNotes: Promise<void> = Promise.resolve();

	/** An item's path in a binder as the list writes it (see `relPath`), with one case of its own: a note that shares
	    its folder with a file of the note's own name less ".md" ("paper.pdf.md" beside "paper.pdf": notes on a PDF)
	    keeps its ".md" here. The bare name is the other file's, and the two would otherwise be one entry: the note shown
	    twice and the file out of its place. */
	private relOf(base: string, path: string, isFolder: boolean): string | null {
		const r = relPath(base, path, isFolder);
		if (!r || isFolder || !/\.md$/i.test(path)) return r;
		return this.app.vault.getAbstractFileByPath(path.slice(0, -3)) instanceof TFile ? r + '.md' : r;
	}

	/** A file that isn't a note is now at `path` (made, or renamed to it), beside a note named after it ("paper.pdf"
	    arriving next to "paper.pdf.md"): the bare entry was the note's until now, and stays the note's under its full
	    name. Queued ahead of whatever is queued for the file itself. */
	private twinArrives(s: State, path: string): void {
		if (s.kind !== 'binder' || s.problem || /\.md$/i.test(path) || !(this.app.vault.getAbstractFileByPath(path + '.md') instanceof TFile)) return;
		const bare = relPath(s.folder.path, path, false), list = this.contents(s);
		if (!bare || !list.includes(bare) || list.includes(bare + '.md')) return;
		this.queue(s, { op: 'rename', from: bare, to: bare + '.md' });
		// (and the file is listed, right after its note: an entry for the note alone would be read as the file's)
		this.queue(s, { op: 'restore', item: bare, prev: bare + '.md', next: null });
	}

	/** The file a note was named after is no longer at `oldPath` (deleted, or renamed away): the note's entry goes back
	    to its bare name. Queued after whatever is queued for the file itself. */
	private twinLeaves(oldPath: string): void {
		if (/\.md$/i.test(oldPath) || this.app.vault.getAbstractFileByPath(oldPath) || !(this.app.vault.getAbstractFileByPath(oldPath + '.md') instanceof TFile)) return;
		const s = this.at(oldPath + '.md');
		const bare = s?.kind === 'binder' && !s.problem ? relPath(s.folder.path, oldPath, false) : null;
		if (s && bare && this.contents(s).includes(bare + '.md')) this.queue(s, { op: 'rename', from: bare + '.md', to: bare });
	}

	private relAt(s: State, path: string, isFolder: boolean): string | null {
		for (const b of [s.path, ...s.aliases]) { const r = this.relOf(b, path, isFolder); if (r) return r; }
		return null;
	}

	// ---- writing ----

	private queue(s: State, op: ListOp): void {
		if (s.problem) { this.touch(s); return; }
		// a move remembers what the binder held when it was made (see ListOp)
		if ((op.op === 'move' || op.op === 'order') && !op.known) { s.items = null; s.ordered = null; op.known = this.known(s); }
		s.ops.push(op);
		window.clearTimeout(s.timer);
		s.timer = window.setTimeout(() => { void this.write(s); }, DEBOUNCE);
		this.touch(s);
	}

	/** Writes a binder's pending changes: applied to what the note says now, missing items dropped (see `next`). One write per batch,
	    and none if nothing changed. */
	private async write(s: State): Promise<void> {
		if (s.kind === 'longform') return this.writeScenes(s);
		window.clearTimeout(s.timer);
		const ops = s.ops;
		s.ops = [];
		s.aliases.clear();
		// (a folder still being copied when this is written gets its order again with the next file that arrives)
		for (const c of s.copies.values()) c.queued = false;
		if (!ops.length || s.problem || this.states.get(s.note) !== s || this.app.vault.getAbstractFileByPath(s.note.path) !== s.note) return;
		const items = [...this.items(s).values()].flat();
		const exists = new Set(items.map((i) => i.rel));
		const known = this.known(s);
		// A write drops entries not found in the folder. Safety net: if that's every entry, or more than half, and no rename
		// or delete accounts for them, the list doesn't describe this folder (say, its binder note was moved here by
		// mistake): they're kept, after the rest, so moving the note back finds its order intact.
		const under = (p: string, x: string) => p === x || (x.endsWith('/') && p.startsWith(x));
		const accounted = (p: string) => ops.some((o) => (o.op === 'remove' && under(p, o.item)) || (o.op === 'rename' && under(p, o.from)));
		// (a bare null or true that names nothing here is junk, dropped before the count: it is not "lost" like a note's name)
		const next = (list: string[], doubt: Set<string>) => {
			list = settleNames(list, (p) => exists.has(p)).filter((p) => exists.has(p) || !doubt.has(p));
			const out = applyOps(list, ops, known).filter((p) => exists.has(p));
			const lost = list.filter((p) => !exists.has(p) && !accounted(p));
			return lost.length && lost.length * 2 > list.length ? [...out, ...lost.filter((p) => !out.includes(p))] : out;
		};
		const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
		if (same(next(s.base, s.doubt), s.base)) { this.touch(s, false); return; }
		const shown = this.contents(s);
		try {
			await this.app.fileManager.processFrontMatter(s.note, (fm: Record<string, unknown>) => {
				if (!isBinderNote(fm)) throw new NotABinder();
				checkFormat(fm); // refuses a newer format before anything is written
				const idx = readIndex(fm, s.note.basename), list = next(idx.contents, idx.doubtful);
				fm.contents = diskList(list);
				s.base = list; s.doubt = new Set(); // written as text now, so no longer doubtful
			});
		} catch (e) {
			if (e instanceof UnsupportedBinder) this.read(s);
			else if (!(e instanceof NotABinder) && !(await this.noteGone(s))) throw e;
		}
		// what shows was already the list with its pending changes; only an edit made meanwhile would change it
		this.touch(s, false);
		if (s.problem || !same(this.contents(s), shown)) this.emit(s.path);
	}

	// ---- helpers ----

	private step(item: TAbstractFile, delta: number): Promise<boolean> {
		const folder = item.parent, s = this.at(item.path);
		if (!s || !folder || item === s.folder || this.isHiddenNote(item)) return Promise.resolve(false);
		const sibs = this.orderedChildren(folder) ?? [];
		const j = stepIndex(sibs.map((f) => f.path), item.path, delta);
		return j == null ? Promise.resolve(false) : this.change(moveLabel([item]), [item], () => this.move(item, folder, j)).then(() => true);
	}

	private writable(folder: TFolder): State {
		const s = this.at(folder.path);
		if (!s) throw new Error(`“${folder.name}” isn’t in a binder.`);
		if (s.problem) throw new UnsupportedBinder(s.problem);
		if (s.frozen) throw new Error(`“${s.folder.name}” is being made a binder.`);
		return s;
	}

	private folderRel(s: State, folder: TFolder): string { return folder === s.folder ? '' : this.relOf(s.folder.path, folder.path, true) ?? ''; }
	private folderNotePath(folder: TFolder): string { return normalizePath(`${folder.path}/${folder.name}.md`); }

	/** The list with pending changes applied: what views show before it's written. */
	private contents(s: State): string[] {
		if (s.kind === 'longform') return s.contents ??= this.shownScenes(s).map((x) => `${x.indent} ${x.title}`);
		return s.contents ??= s.ops.length ? applyOps(this.listed(s), s.ops, this.known(s)) : this.listed(s);
	}

	/** The list as the binder note has it, with entries typed with stray spaces round a name read as the items they
	    mean (see `settleNames`). */
	private listed(s: State): string[] {
		if (!s.base.some((p) => p.split('/').some((n) => n !== n.trim()))) return s.base;
		const have = new Set([...this.items(s).values()].flat().map((i) => i.rel));
		return settleNames(s.base, (p) => have.has(p));
	}

	/** Every item in the binder a list entry can name, per folder ("" for the top), without binder and folder notes. */
	private items(s: State): Map<string, Item[]> {
		if (s.items) return s.items;
		const map = new Map<string, Item[]>();
		const walk = (f: TFolder, rel: string) => {
			const list: Item[] = [];
			for (const c of f.children) {
				if (this.isHiddenNote(c)) continue;
				if (f === s.folder && c === this.snapshotsFolder(s)) continue; // snapshots aren't items of the binder
				const r = this.relOf(s.folder.path, c.path, c instanceof TFolder);
				if (!r || (c instanceof TFile && isFolderNote(r))) continue;
				list.push({ rel: r, file: c });
				if (c instanceof TFolder) walk(c, r);
			}
			map.set(rel, list);
		};
		walk(s.folder, '');
		return (s.items = map);
	}

	/** The binder's items in the order they show, for moves. The same items `orderedChildren` shows (other files too), so
	    an index among a folder's shown items means the same place here. */
	private known(s: State): string[] {
		const items = this.items(s), out: string[] = [], base = this.listed(s);
		const walk = (folder: string) => {
			const kids = items.get(folder) ?? [];
			for (const r of orderChildren(base, folder, kids.map((k) => k.rel))) {
				out.push(r);
				if (r.endsWith('/')) walk(r);
			}
		};
		walk('');
		return out;
	}

	/** Something about this binder changed: drop cached order and (unless told not to) tell subscribers. */
	private touch(s: State, emit = true): void {
		s.contents = null; s.items = null; s.shown = null; s.ordered = null;
		if (emit) this.emit(s.path);
	}

	/** Runs `fn`, then tells subscribers only if the binder's order or problem changed (e.g. not for its body text). */
	private ifChanged(s: State, fn: () => void): void {
		const before = JSON.stringify([s.problem, this.contents(s)]);
		fn();
		this.touch(s, false);
		if (JSON.stringify([s.problem, this.contents(s)]) !== before) this.emit(s.path);
	}

	/** Coalesced, so a folder of 40 notes moving tells views once. */
	private emit(path: string): void {
		this.emits.add(path);
		if (this.emitTimer) return;
		this.emitTimer = window.setTimeout(() => {
			this.emitTimer = 0;
			const paths = [...this.emits];
			this.emits.clear();
			for (const p of paths) this.trigger('changed', p);
		}, 0);
	}
}

/** Are two files' bytes the same? */
function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
	if (a.byteLength !== b.byteLength) return false;
	const x = new Uint8Array(a), y = new Uint8Array(b);
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
}

/** Thrown inside a write to leave the note as it is: it's no longer a binder note, or there's nothing to write. */
class NotABinder extends Error {}
