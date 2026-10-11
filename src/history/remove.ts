import { TFile, normalizePath, type App, type TAbstractFile } from 'obsidian';
import type { OrderHandler } from './order';
import type { Handler, Kept, RemoveStep } from './types';

/* A delete made by hand, and bringing back what was deleted. The notes and files are kept byte for byte in memory for the
   session (so this works even when Obsidian is set to delete for good), and nothing is written to the vault but the
   things being brought back. It is exact: it brings an item back only where nothing is, and it never writes over
   anything. Redo deletes again, from what is there now. */

/** What the handler asks of the store. */
export interface RemoveHost {
	/** An item as it is now, kept (null: it couldn't be kept). */
	keep(item: TAbstractFile, room: number): Promise<Kept | null>;
	/** A thing brought back is put in the binder's list where it stood, with the order of what was in it. */
	reinstate(made: TAbstractFile, tree: Kept): Promise<void>;
	settle(files: TFile[]): Promise<void>;
	repoint(from: TAbstractFile, to: TAbstractFile): void;
	room(): number;
}

export class RemoveHandler implements Handler<RemoveStep> {
	constructor(private app: App, private host: RemoveHost, private order: OrderHandler) {}

	private exists(k: Kept): boolean { return this.app.vault.getAbstractFileByPath(k.file.path) === k.file; }

	alive(step: RemoveStep, redo?: boolean): boolean {
		// (deleted, the trees are what there is to bring back; brought back, they are what is there to delete again)
		return redo ? !!step.restored && step.trees.some((k) => this.exists(k)) : !step.restored;
	}

	async check(step: RemoveStep, redo: boolean): Promise<void> {
		if (redo) return;
		const { vault } = this.app;
		for (const k of step.trees) {
			const label = k.name.replace(/\.md$/, ''), parent = k.pos ? this.order.folderOf(k.pos) : null;
			if (!parent) throw new Error(`“${label}” can’t be brought back: the folder it was in is gone.`);
			const dest = normalizePath(`${parent.path}/${k.name}`);
			if (vault.getAbstractFileByPath(dest) || await vault.adapter.exists(dest)) throw new Error(`“${label}” can’t be brought back: there is another “${label}” here now. Rename it first.`);
			// a note named like its folder would become the folder's note, and leave the binder
			if (!k.isFolder && /\.md$/i.test(k.name) && label === parent.name) throw new Error(`“${label}” can’t go back into “${parent.name}”: it would become the folder’s note. Rename it first.`);
		}
	}

	async apply(step: RemoveStep, redo: boolean): Promise<void> {
		const { vault } = this.app;
		if (redo) {
			for (const k of step.trees) {
				if (!this.exists(k)) continue;
				// (what is typed in it and not saved is written first, and what is kept is what is there now)
				await this.host.settle(k.objects.map((o) => o.item).filter((f): f is TFile => f instanceof TFile));
				const fresh = await this.host.keep(k.file, this.host.room());
				if (fresh) Object.assign(k, fresh);
				await this.app.fileManager.trashFile(k.file);
			}
			step.restored = false;
			return;
		}
		for (const k of step.trees) {
			const parent = k.pos ? this.order.folderOf(k.pos) : null;
			if (!parent) continue;
			const dest = normalizePath(`${parent.path}/${k.name}`);
			let made: TAbstractFile | null;
			if (k.isFolder) {
				await vault.createFolder(dest);
				for (const f of [...k.folders].sort((a, b) => a.length - b.length)) { try { await vault.createFolder(`${dest}/${f}`); } catch { /* there already */ } }
				for (const f of k.files) await vault.createBinary(`${dest}/${f.rel}`, f.bytes);
				made = vault.getAbstractFileByPath(dest);
			} else made = await vault.createBinary(dest, k.files[0].bytes);
			if (!made) continue;
			// (what else is remembered of these items is about them, not about their copies in the trash)
			for (const o of [...k.objects]) { const now = vault.getAbstractFileByPath(o.rel ? `${dest}/${o.rel}` : dest); if (now) this.host.repoint(o.item, now); }
			await this.host.reinstate(made, k);
		}
		step.restored = true;
	}

	repoint(step: RemoveStep, from: TAbstractFile, to: TAbstractFile): void {
		for (const k of step.trees) {
			if (k.file === from) k.file = to;
			for (const o of k.objects) if (o.item === from) o.item = to;
			if (k.pos) this.order.repointPos(k.pos, from, to);
		}
	}
}
