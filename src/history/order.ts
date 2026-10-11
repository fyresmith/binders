import { TFile, TFolder, normalizePath, type App, type TAbstractFile } from 'obsidian';
import type { Binder } from '../binders';
import type { History } from './history';
import { sameValue } from './values';
import type { Entry, Handler, OrderStep, Pos, PropChange, Removed, Step } from './types';

/* Changes to a binder's order made by hand (a drag, Move up, a sort kept, a folder made around notes, a label given by a
   drop), and taking them back. It remembers where things were and asks the store (binders.ts) to put them there again:
   everything that touches the vault is the store's, reached through `MoveHost`. Order is the one kind that is tolerant:
   an item goes back beside the neighbours it had, in the binder as it is now. */

/** What the history asks of the store. */
export interface MoveHost {
	/** The binder a file or folder (or a path) is in. */
	binderOf(item: TAbstractFile | string): Binder | null;
	all(): Binder[];
	orderedChildren(folder: TFolder): TAbstractFile[] | null;
	depthOf(item: TAbstractFile): number | undefined;
	move(item: TAbstractFile, folder: TFolder, index: number, depth?: number): Promise<void>;
	newFolder(folder: TFolder, index?: number, title?: string): Promise<TFolder>;
	/** Trashes a folder that holds nothing but its folder note, and returns that note's bytes (null: it had none) to
	    make it again with. Null, and nothing done, if the folder holds anything else. */
	takeAway(folder: TFolder): Promise<{ note: ArrayBuffer | null } | null>;
	/** Makes a folder that was taken away again (or uses the one that has its name now), with its folder note. */
	bringBack(parent: TFolder, index: number, name: string, note: ArrayBuffer | null): Promise<TFolder>;
}

/** What a check works out for the apply: the items still there, and the folder to bring back. */
interface OrderPlan { here: OrderStep['items']; gone: Removed | null; home: TFolder | null }

export class OrderHandler implements Handler<OrderStep, OrderPlan> {
	constructor(private app: App, private host: MoveHost, private history: History) {}

	/** Where an item is: its folder and its neighbours there (and a Longform scene's indent). The neighbours are the
	    nearest that aren't `moving` too: what moves with it can't say where it was. */
	posOf(item: TAbstractFile, moving?: Set<TAbstractFile>): Pos | null {
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
		const record = (out?: T): { entry: Entry; step: OrderStep } | null => {
			// (the binder they're in now: a note dragged in from outside any binder had none before)
			const s = items.map((f) => this.host.binderOf(f.path)).find((x) => !!x);
			if (!s || s.problem) return null;
			const same = (a: Pos, b: Pos) => a.parent === b.parent && a.next === b.next && a.prev === b.prev && a.depth === b.depth && a.at === b.at;
			const moved: OrderStep['items'] = [];
			for (const b of before) { const after = this.posOf(b.file, moving); if (b.pos && after && this.app.vault.getAbstractFileByPath(b.file.path) === b.file) moved.push({ file: b.file, before: b.pos, after }); }
			// (a change that came to nothing isn't one to undo)
			const still = !moved.some((x) => !same(x.before, x.after)), given = props?.filter((c) => !sameValue(c.before, c.after));
			if (still && !given?.length) return null;
			const folder = out === undefined ? null : made?.(out) ?? null, at = folder ? this.posOf(folder) : null;
			const step: OrderStep = { kind: 'order', items: moved, made: folder && at ? { folder, name: folder.name, pos: at } : undefined, still };
			const steps: Step[] = [step];
			if (given?.length) steps.push({ kind: 'props', changes: given });
			return { entry: this.history.record({ note: s.note, label, steps }), step };
		};
		let out: T;
		// (a change that failed half-way is still one to take back, as far as it got)
		try { out = await fn(); } catch (e) { record(); throw e; }
		const u = record(out);
		// only a change that can be taken back takes the folder away: its note is kept with the change, to make it again
		if (u && emptied && stood) {
			const name = emptied.name, kept = await this.host.takeAway(emptied);
			if (kept) {
				u.step.removed = { folder: emptied, name, pos: stood, note: kept.note };
				u.entry.bytes += kept.note?.byteLength ?? 0;
				this.history.trim();
			}
		}
		return out;
	}

	alive(step: OrderStep): boolean { return step.items.some((x) => this.app.vault.getAbstractFileByPath(x.file.path) === x.file); }

	/** Looks at the vault: everything can go back, or nothing does. A folder the change made, taken away by undoing
	    it, is made again to redo it; a folder it emptied is looked for, to be brought back. */
	async check(step: OrderStep, redo: boolean): Promise<OrderPlan> {
		const { vault } = this.app, name = (f: TAbstractFile) => (f instanceof TFile ? f.basename : f.name);
		const here = step.items.filter((x) => vault.getAbstractFileByPath(x.file.path) === x.file);
		const place = (x: OrderStep['items'][number]) => (redo ? x.after : x.before);
		// a folder the change emptied and took away is made again by undoing it: where, and whether it can be
		const gone = !redo && step.removed && vault.getAbstractFileByPath(step.removed.folder.path) !== step.removed.folder ? step.removed : null;
		let home: TFolder | null = null;
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
		if (redo && step.made && vault.getAbstractFileByPath(step.made.folder.path) !== step.made.folder) {
			const parent = this.folderOf(step.made.pos), old = step.made.folder;
			if (!parent) throw new Error(`“${step.made.name}” can’t be made again: its folder is gone.`);
			const sibs = this.host.orderedChildren(parent) ?? [], next = step.made.pos.next;
			step.made.folder = await this.host.newFolder(parent, next && sibs.includes(next) ? sibs.indexOf(next) : Infinity, step.made.name);
			for (const x of step.items) if (x.after.parent === old) x.after = { ...x.after, parent: step.made.folder, path: step.made.folder.path };
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
		return { here, gone, home };
	}

	async apply(step: OrderStep, redo: boolean, plan: OrderPlan): Promise<void> {
		const { vault } = this.app, { here, gone, home } = plan;
		const place = (x: OrderStep['items'][number]) => (redo ? x.after : x.before);
		if (gone && home) {
			const sibs = this.host.orderedChildren(home) ?? [], { next, prev } = gone.pos, old = gone.folder;
			gone.folder = await this.host.bringBack(home, next && sibs.includes(next) ? sibs.indexOf(next) : prev && sibs.includes(prev) ? sibs.indexOf(prev) + 1 : Infinity, gone.name, gone.note);
			for (const x of step.items) if (x.before.parent === old) x.before = { ...x.before, parent: gone.folder, path: gone.folder.path };
		}
		// (made again, the change empties that folder once more: where it stands now, under the name it has now)
		const again = redo && step.removed && vault.getAbstractFileByPath(step.removed.folder.path) === step.removed.folder ? step.removed : null;
		if (again) { again.pos = this.posOf(again.folder) ?? again.pos; again.name = again.folder.name; }
		// in the order they stood in there (whatever order they were moved in): when all of a folder moved at once, as
		// a sort kept does, that order is all there is to go by
		const run = new Map<TAbstractFile | string, TAbstractFile>();
		if (!step.still) for (const x of [...here].sort((a, b) => place(a).at - place(b).at)) await this.putBack(x.file, place(x), run);
		if (!redo && step.made && vault.getAbstractFileByPath(step.made.folder.path) === step.made.folder) {
			// (the name it has now, typed since it was made, is the one it's made again with)
			step.made.name = step.made.folder.name;
			if (!step.made.folder.children.length) await this.app.fileManager.trashFile(step.made.folder);
		}
		if (again) {
			// (with its note as it is now: what was changed in it since goes with it, to come back with it)
			const kept = await this.host.takeAway(again.folder);
			if (kept) again.note = kept.note;
		}
	}
}
