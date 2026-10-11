import { TFile, TFolder, normalizePath, type App, type TAbstractFile } from 'obsidian';
import { parts } from '../scene-text';
import type { OrderHandler } from './order';
import type { CreateStep, Handler } from './types';

/* A note or folder made by hand (New note, New folder, Duplicate), and taking it away again. Exact, and it never takes
   writing with it: a note is taken away only if it is still exactly as it was made (the bytes the disk had then), a folder
   only if nothing is in it but a folder note with no text. It goes to the trash, never deleted, and what it held is kept
   in memory so that redo makes it again, byte for byte, where it stood. */

/** What the handler asks of the store. */
export interface CreateHost {
	settle(files: TFile[]): Promise<void>;
	folderNote(folder: TFolder): TFile | null;
	orderedChildren(folder: TFolder): TAbstractFile[] | null;
	takeAway(folder: TFolder): Promise<{ note: ArrayBuffer | null } | null>;
	bringBack(parent: TFolder, index: number, name: string, note: ArrayBuffer | null): Promise<TFolder>;
	/** Entries that name the old item now name the new one (made again, it is another object). */
	repoint(from: TAbstractFile, to: TAbstractFile): void;
}

const same = (a: ArrayBuffer, b: ArrayBuffer): boolean => {
	if (a.byteLength !== b.byteLength) return false;
	const x = new Uint8Array(a), y = new Uint8Array(b);
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
};

export class CreateHandler implements Handler<CreateStep> {
	constructor(private app: App, private host: CreateHost, private order: OrderHandler) {}

	alive(step: CreateStep, redo?: boolean): boolean {
		// (taken away, it is the one to be made again; otherwise it is what is there to take away)
		return redo ? !!step.undone : !step.undone && this.app.vault.getAbstractFileByPath(step.file.path) === step.file;
	}

	private written(step: CreateStep): Error { return new Error(`“${step.file.name.replace(/\.md$/, '')}” has been written in since it was made, so it stays.`); }

	async check(step: CreateStep, redo: boolean): Promise<void> {
		const f = step.file;
		if (redo) {
			const parent = step.pos ? this.order.folderOf(step.pos) : null, label = step.name.replace(/\.md$/, '');
			if (!parent) throw new Error(`“${label}” can’t be made again: its folder is gone.`);
			if (this.app.vault.getAbstractFileByPath(normalizePath(`${parent.path}/${step.name}`))) throw new Error(`“${label}” can’t be made again: there is another “${label}” here now.`);
			return;
		}
		if (f instanceof TFile) {
			// (what is typed into it and not saved yet is written first: it is on the disk, so it counts)
			await this.host.settle([f]);
			if (!step.bytes || !same(await this.app.vault.adapter.readBinary(f.path), step.bytes)) throw this.written(step);
			return;
		}
		if (!(f instanceof TFolder)) return;
		const note = this.host.folderNote(f);
		if (f.children.some((c) => c !== note)) throw this.written(step);
		const disk = await this.app.vault.adapter.list(f.path);
		// (what a file manager leaves in every folder it shows isn't anyone's)
		if (disk.folders.length || disk.files.some((p) => p !== note?.path && !/(^|\/)\.DS_Store$/.test(p))) throw this.written(step);
		if (note) {
			await this.host.settle([note]);
			if (parts(await this.app.vault.adapter.read(note.path)).body.trim()) throw this.written(step);
		}
	}

	async apply(step: CreateStep, redo: boolean): Promise<void> {
		const f = step.file;
		if (!redo) {
			// (where it stands now, and what it is called now: a rename since doesn't matter)
			step.pos = this.order.posOf(f) ?? step.pos;
			step.name = f.name;
			if (f instanceof TFolder) {
				const kept = await this.host.takeAway(f);
				if (!kept) throw this.written(step);
				step.kept = kept;
			} else await this.app.fileManager.trashFile(f);
			step.undone = true;
			return;
		}
		const pos = step.pos;
		if (!pos) return;
		const parent = this.order.folderOf(pos);
		if (!parent) return;
		let made: TAbstractFile;
		if (f instanceof TFolder) {
			const sibs = this.host.orderedChildren(parent) ?? [], { next, prev } = pos;
			made = await this.host.bringBack(parent, next && sibs.includes(next) ? sibs.indexOf(next) : prev && sibs.includes(prev) ? sibs.indexOf(prev) + 1 : Infinity, step.name, step.kept?.note ?? null);
		} else {
			made = await this.app.vault.createBinary(normalizePath(`${parent.path}/${step.name}`), step.bytes ?? new ArrayBuffer(0));
			await this.order.restore(made, pos);
		}
		this.host.repoint(f, made);
		step.undone = false;
	}

	repoint(step: CreateStep, from: TAbstractFile, to: TAbstractFile): void {
		if (step.file === from) step.file = to;
		if (step.pos) this.order.repointPos(step.pos, from, to);
	}
}
