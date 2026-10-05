import { TFile, TFolder, normalizePath, type App, type TAbstractFile } from 'obsidian';
import type { Binder } from './binders';
import { UnsupportedBinder } from './model';

/* Undo of moves: the changes made by hand to binders' orders (a drag, Move up, a sort kept, a folder made around
   notes, a label given by a drop), and taking them back. It remembers where things were and asks the store
   (binders.ts) to put them there again: everything that touches the vault is the store's, reached through `MoveHost`. */

/** What the history asks of the store. */
export interface MoveHost {
	/** The binder a file or folder (or a path) is in. */
	binderOf(item: TAbstractFile | string): Binder | null;
	all(): Binder[];
	orderedChildren(folder: TFolder): TAbstractFile[] | null;
	depthOf(item: TAbstractFile): number | undefined;
	move(item: TAbstractFile, folder: TFolder, index: number, depth?: number): Promise<void>;
	newFolder(folder: TFolder, index?: number, title?: string): Promise<TFolder>;
	/** Sets one property of an item (a folder's in its folder note); `undefined` takes it away. */
	setProp(item: TAbstractFile, key: string, value: unknown): Promise<void>;
	/** Trashes a folder that holds nothing but its folder note, and returns that note's bytes (null: it had none) to
	    make it again with. Null, and nothing done, if the folder holds anything else. */
	takeAway(folder: TFolder): Promise<{ note: ArrayBuffer | null } | null>;
	/** Makes a folder that was taken away again (or uses the one that has its name now), with its folder note. */
	bringBack(parent: TFolder, index: number, name: string, note: ArrayBuffer | null): Promise<TFolder>;
}

/** Are two property values the same, as written (a list by what's in it; none and null alike)? */
const sameValue = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Where an item is among its folder's: the folder (and its path then, in case it's deleted and made again), the items
    on either side, and a Longform scene's indent. */
export interface Pos { parent: TFolder; path: string; next: TAbstractFile | null; prev: TAbstractFile | null; depth?: number; at: number }
/** A change to a binder's order made by hand: what it moved, from where to where, and a folder it made to move them into. */
export interface Undo { failed?: boolean; note: TFile; label: string; items: { file: TAbstractFile; before: Pos; after: Pos }[]; made?: { folder: TFolder; name: string; pos: Pos }; removed?: Removed; props?: PropChange[]; still?: boolean }
/** A folder a change emptied and took away (Ungroup): where it stood, its name, and its folder note byte for byte (null:
    it had none), which is where its synopsis and the rest of its data were. Undoing the change makes it again. */
export interface Removed { folder: TFolder; name: string; pos: Pos; note: ArrayBuffer | null }
/** A property a change by hand gave an item (a card dragged to another label's line): what it had (as written; undefined
    for none) and what it has now. A folder's is in its folder note. `still` on the change: nothing moved. */
export interface PropChange { file: TAbstractFile; key: string; before: unknown; after: unknown }

/** The changes made by hand to binders' orders, in memory (the last 50), and putting them back or making them again
    through `MoveHost`. Moves nothing unless everything can move. */
export class MoveHistory {
	/** Changes made by hand to binders' orders (a drag, Move up, a sort kept, a folder made around notes), newest last:
	    for each item moved, where it was and where it went. Undoing one puts its items back beside the neighbours they
	    had, in the binder as it is now: whatever was renamed, added or reordered since stays as it is. */
	undos: Undo[] = [];
	/** Changes taken back, newest last, to make again. Emptied by the next change made by hand. */
	redos: Undo[] = [];

	constructor(private app: App, private host: MoveHost) {}

	/** Where an item is: its folder and its neighbours there (and a Longform scene's indent). The neighbours are the
	    nearest that aren't `moving` too: what moves with it can't say where it was. */
	private posOf(item: TAbstractFile, moving?: Set<TAbstractFile>): Pos | null {
		const parent = item.parent;
		if (!parent) return null;
		const sibs = this.host.orderedChildren(parent) ?? [], i = sibs.indexOf(item), still = (f: TAbstractFile) => !moving?.has(f);
		const next = i < 0 ? null : sibs.slice(i + 1).find(still) ?? null, prev = i < 0 ? null : sibs.slice(0, i).reverse().find(still) ?? null;
		return { parent, path: parent.path, next, prev, depth: this.host.depthOf(item), at: i };
	}

	/** The folder a remembered place is in, if it's still there (by name, if it was deleted and made again). */
	private folderOf(pos: Pos): TFolder | null {
		const { vault } = this.app;
		if (vault.getAbstractFileByPath(pos.parent.path) === pos.parent) return pos.parent;
		const again = vault.getAbstractFileByPath(pos.path);
		return again instanceof TFolder ? again : null;
	}

	/** Puts an item back at a remembered place: before the neighbour that followed it, or after the one before it, or
	    last, whichever is still there. */
	private async putBack(item: TAbstractFile, pos: Pos, run: Map<TAbstractFile | string, TAbstractFile>): Promise<void> {
		const parent = this.folderOf(pos);
		if (!parent) return;
		// (it came from outside any binder: back to its folder, which has no order to put it in)
		if (!this.host.binderOf(parent.path)) { if (item.parent !== parent) await this.app.fileManager.renameFile(item, normalizePath(`${parent.path}/${item.name}`)); return; }
		const sibs = (this.host.orderedChildren(parent) ?? []).filter((f) => f !== item);
		// before what followed it, or after what came before it; with neither there any more, first if it was first
		// (several that stood together go back in the order they're given, first first: each after the one before it)
		const after = (key: TAbstractFile | string, i: number) => { const last = run.get(key); run.set(key, item); return last && sibs.includes(last) ? sibs.indexOf(last) + 1 : i; };
		const i = pos.next && sibs.includes(pos.next) ? sibs.indexOf(pos.next)
			: pos.prev && sibs.includes(pos.prev) ? after(pos.prev, sibs.indexOf(pos.prev) + 1)
			: pos.prev === null && pos.next !== null ? after(parent.path, 0) : sibs.length;
		await this.host.move(item, parent, i, pos.depth);
	}

	/** Runs a change to a binder's order made by hand, remembering where each of `items` (in the order they show) was,
	    so "Undo" can put them back. `label` says what it was ("Move “Arrival”"). `made`: a folder the change made to
	    hold them, which undoing it takes away again. `emptied`: a folder the change moves everything out of, which goes
	    to the trash once it holds nothing but its folder note, and which undoing the change makes again. */
	async change<T>(label: string, items: TAbstractFile[], fn: () => Promise<T>, made?: (out: T) => TFolder | null, props?: PropChange[], emptied?: TFolder): Promise<T> {
		const moving = new Set(items);
		const before = items.map((file) => ({ file, pos: this.posOf(file, moving) }));
		// (where the folder stands now: once it's gone there's no asking)
		const stood = emptied ? this.posOf(emptied) : null;
		const record = (out?: T): Undo | null => {
			// (the binder they're in now: a note dragged in from outside any binder had none before)
			const s = items.map((f) => this.host.binderOf(f.path)).find((x) => !!x);
			if (!s || s.problem) return null;
			const same = (a: Pos, b: Pos) => a.parent === b.parent && a.next === b.next && a.prev === b.prev && a.depth === b.depth && a.at === b.at;
			const moved: Undo['items'] = [];
			for (const b of before) { const after = this.posOf(b.file, moving); if (b.pos && after && this.app.vault.getAbstractFileByPath(b.file.path) === b.file) moved.push({ file: b.file, before: b.pos, after }); }
			// (a change that came to nothing isn't one to undo)
			const still = !moved.some((x) => !same(x.before, x.after)), given = props?.filter((c) => !sameValue(c.before, c.after));
			if (still && !given?.length) return null;
			const folder = out === undefined ? null : made?.(out) ?? null, at = folder ? this.posOf(folder) : null;
			const u: Undo = { note: s.note, label, items: moved, made: folder && at ? { folder, name: folder.name, pos: at } : undefined, props: given?.length ? given : undefined, still };
			this.undos.push(u);
			if (this.undos.length > 50) this.undos.shift();
			this.redos = [];
			return u;
		};
		let out: T;
		// (a change that failed half-way is still one to take back, as far as it got)
		try { out = await fn(); } catch (e) { record(); throw e; }
		const u = record(out);
		// only a change that can be taken back takes the folder away: its note is kept with the change, to make it again
		if (u && emptied && stood) {
			const name = emptied.name, kept = await this.host.takeAway(emptied);
			if (kept) u.removed = { folder: emptied, name, pos: stood, note: kept.note };
		}
		return out;
	}

	/** What "Undo" (or "Redo") would take back in this binder, or null. */
	undoable(item: TAbstractFile | string, redo = false): string | null {
		const s = this.host.binderOf(item), stack = redo ? this.redos : this.undos;
		// (a change whose items have all been deleted since has nothing to take back: it isn't offered)
		const alive = (u: Undo) => u.items.some((x) => this.app.vault.getAbstractFileByPath(x.file.path) === x.file);
		for (let i = stack.length - 1; i >= 0; i--) if (stack[i].note === s?.note && alive(stack[i])) return stack[i].label;
		return null;
	}

	/** The binder whose order was last changed by hand (or, with `redo`, last had a change undone): its folder. */
	lastChanged(redo = false): TFolder | null {
		const stack = redo ? this.redos : this.undos;
		for (let i = stack.length - 1; i >= 0; i--) { const note = stack[i].note, s = this.host.all().find((b) => b.note === note); if (s) return s.folder; }
		return null;
	}

	/** Takes back the last change made by hand to this binder's order (or, with `redo`, makes it again): each item it
	    moved goes back to the folder and the neighbours it had. Nothing is moved unless everything can be; then the
	    change stays to be undone later. Returns what was undone, or null. */
	async undo(item: TAbstractFile | string, redo = false): Promise<string | null> {
		const s = this.host.binderOf(item), from = redo ? this.redos : this.undos, to = redo ? this.undos : this.redos;
		if (!s) return null;
		if (s.problem) throw new UnsupportedBinder(s.problem);
		const { vault } = this.app, name = (f: TAbstractFile) => (f instanceof TFile ? f.basename : f.name);
		for (;;) {
			let i = from.length - 1;
			while (i >= 0 && from[i].note !== s.note) i--;
			if (i < 0) return null;
			const u = from[i];
			const here = u.items.filter((x) => vault.getAbstractFileByPath(x.file.path) === x.file);
			// (everything it moved has been deleted since: nothing to take back, so the change before it is the one)
			if (!here.length) { from.splice(i, 1); continue; }
			const place = (x: Undo['items'][number]) => (redo ? x.after : x.before);
			// a folder the change emptied and took away is made again by undoing it: where, and whether it can be
			const gone = !redo && u.removed && vault.getAbstractFileByPath(u.removed.folder.path) !== u.removed.folder ? u.removed : null;
			let home: TFolder | null = null;
			try {
				if (gone) {
					home = this.folderOf(gone.pos);
					if (!home) throw new Error(`“${gone.name}” can’t be brought back: the folder it was in is gone.`);
					const there = vault.getAbstractFileByPath(normalizePath(`${home.path}/${gone.name}`));
					if (there && !(there instanceof TFolder)) throw new Error(`“${gone.name}” can’t be brought back: “${home.name}” has a file with that name now.`);
					// (a folder with its name there already, made by hand since, is where its items go back to: nothing is
					// remembered of that until everything can go back, so an undo refused here and asked again still has the
					// folder to bring back, with its note)
					for (const x of here) {
						if (x.before.parent !== gone.folder) continue;
						if (x.file instanceof TFile && x.file.extension === 'md' && x.file.basename === gone.name) throw new Error(`“${name(x.file)}” can’t go back into “${gone.name}”: it would become the folder’s note. Rename it first.`);
						const taken = there instanceof TFolder && x.file.parent !== there ? vault.getAbstractFileByPath(normalizePath(`${there.path}/${x.file.name}`)) : null;
						if (taken && taken !== x.file) throw new Error(`“${name(x.file)}” can’t go back: “${gone.name}” has another “${name(x.file)}” now.`);
					}
				}
				// a folder the change made, taken away by undoing it, is made again to redo it
				if (redo && u.made && vault.getAbstractFileByPath(u.made.folder.path) !== u.made.folder) {
					const parent = this.folderOf(u.made.pos), old = u.made.folder;
					if (!parent) throw new Error(`“${u.made.name}” can’t be made again: its folder is gone.`);
					const sibs = this.host.orderedChildren(parent) ?? [], next = u.made.pos.next;
					u.made.folder = await this.host.newFolder(parent, next && sibs.includes(next) ? sibs.indexOf(next) : Infinity, u.made.name);
					for (const x of u.items) if (x.after.parent === old) x.after = { ...x.after, parent: u.made.folder, path: u.made.folder.path };
				}
				// everything can go back, or nothing does
				for (const x of here) {
					// (what goes back into the folder that's about to be brought back was looked at above)
					if (gone && place(x).parent === gone.folder) continue;
					const parent = this.folderOf(place(x));
					if (!parent) throw new Error(`“${name(x.file)}” can’t go back: its folder is gone.`);
					if (x.file.parent === parent) continue;
					const taken = vault.getAbstractFileByPath(normalizePath(`${parent.path}/${x.file.name}`));
					if (taken && taken !== x.file) throw new Error(`“${name(x.file)}” can’t go back: “${parent.name}” has another “${name(x.file)}” now.`);
				}
			} catch (e) {
				// It can't be taken back as things are. Said once, and it stays, to try again when what's in the way has
				// been put right; asked again with nothing changed, it's given up, and the change before it is the one.
				if (u.failed) { from.splice(from.indexOf(u), 1); continue; }
				u.failed = true;
				throw e;
			}
			u.failed = false;
			if (gone && home) {
				const sibs = this.host.orderedChildren(home) ?? [], { next, prev } = gone.pos, old = gone.folder;
				gone.folder = await this.host.bringBack(home, next && sibs.includes(next) ? sibs.indexOf(next) : prev && sibs.includes(prev) ? sibs.indexOf(prev) + 1 : Infinity, gone.name, gone.note);
				for (const x of u.items) if (x.before.parent === old) x.before = { ...x.before, parent: gone.folder, path: gone.folder.path };
			}
			// (made again, the change empties that folder once more: where it stands now, under the name it has now)
			const again = redo && u.removed && vault.getAbstractFileByPath(u.removed.folder.path) === u.removed.folder ? u.removed : null;
			if (again) { again.pos = this.posOf(again.folder) ?? again.pos; again.name = again.folder.name; }
			// in the order they stood in there (whatever order they were moved in): when all of a folder moved at once, as
			// a sort kept does, that order is all there is to go by
			const run = new Map<TAbstractFile | string, TAbstractFile>();
			if (!u.still) for (const x of [...here].sort((a, b) => place(a).at - place(b).at)) await this.putBack(x.file, place(x), run);
			// and the property it gave them is as it was before (or, made again, as it gave it)
			for (const c of u.props ?? []) if (vault.getAbstractFileByPath(c.file.path) === c.file) await this.host.setProp(c.file, c.key, redo ? c.after : c.before);
			if (!redo && u.made && vault.getAbstractFileByPath(u.made.folder.path) === u.made.folder) {
				// (the name it has now, typed since it was made, is the one it's made again with)
				u.made.name = u.made.folder.name;
				if (!u.made.folder.children.length) await this.app.fileManager.trashFile(u.made.folder);
			}
			if (again) {
				// (with its note as it is now: what was changed in it since goes with it, to come back with it)
				const kept = await this.host.takeAway(again.folder);
				if (kept) again.note = kept.note;
			}
			from.splice(from.indexOf(u), 1);
			to.push(u);
			return u.label;
		}
	}
}
