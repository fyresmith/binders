import { TFile, TFolder, type App } from 'obsidian';
import type { Handler, MadeStep } from './types';

/* A whole binder made by New binder (from a template, or empty), and taking it away again. Exact, and it never takes
   writing with it: the folder goes, to the trash, only while every file in it is byte for byte what was made, and
   nothing has been added. What is under the binder's `Snapshots` folder is Binders' own (the record of writing, which
   notes the binder's first moments) and is not the writer's work: it is not counted. There is no redo: the binder is
   made again with New binder. */

export interface MadeHost { settle(files: TFile[]): Promise<void> }

const same = (a: ArrayBuffer, b: ArrayBuffer): boolean => {
	if (a.byteLength !== b.byteLength) return false;
	const x = new Uint8Array(a), y = new Uint8Array(b);
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
};

/** Every file under `path` on the disk (not hidden ones), by path. */
export async function filesUnder(app: App, path: string): Promise<string[]> {
	const out: string[] = [];
	const walk = async (p: string): Promise<void> => {
		const l = await app.vault.adapter.list(p);
		out.push(...l.files.filter((f) => !/(^|\/)\.[^/]*$/.test(f)));
		for (const d of l.folders) await walk(d);
	};
	await walk(path);
	return out;
}

/** Binders' own files in a binder just made, which taking it away doesn't weigh. */
export const ownRecord = (folder: string, path: string): boolean => path.startsWith(`${folder}/Snapshots/`);

export class MadeHandler implements Handler<MadeStep> {
	constructor(private app: App, private host: MadeHost) {}

	alive(step: MadeStep, redo?: boolean): boolean {
		return !redo && !step.undone && this.app.vault.getAbstractFileByPath(step.folder.path) === step.folder;
	}

	private written(step: MadeStep): Error { return new Error(`“${step.folder.name}” has been written in since it was made, so it stays.`); }

	async check(step: MadeStep, redo: boolean): Promise<void> {
		if (redo) throw new Error('A binder taken away is made again with New binder.');
		const f = step.folder, path = f.path;
		// (what is typed and not saved yet is written first: it is on the disk, so it counts)
		const open: TFile[] = [];
		const walk = (d: TFolder) => { for (const c of d.children) { if (c instanceof TFolder) walk(c); else if (c instanceof TFile) open.push(c); } };
		walk(f);
		await this.host.settle(open);
		const kept = new Map(step.files.map((x) => [x.rel, x.bytes]));
		const disk = (await filesUnder(this.app, path)).filter((p) => !ownRecord(path, p));
		if (disk.length !== kept.size) throw this.written(step);
		for (const p of disk) {
			// (the binder note, renamed with the folder, is the note it was made as)
			const rel = p.slice(path.length + 1), was = kept.get(step.ownNote && rel === `${f.name}.md` && !kept.has(rel) ? step.ownNote : rel);
			if (!was || !same(await this.app.vault.adapter.readBinary(p), was)) throw this.written(step);
		}
	}

	async apply(step: MadeStep): Promise<void> {
		await this.app.fileManager.trashFile(step.folder);
		step.undone = true;
	}
}
