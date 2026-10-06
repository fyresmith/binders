import type { App } from 'obsidian';
import { nodeRequire } from '../export/desktop';
import { MAX_BYTES, MAX_FILES, TOO_BIG, projectSource, safePath, type ProjectSource } from './source';

/* Reading a Scrivener project where it lies on a computer: the system's dialog to choose it, and the disk outside
   the vault to read it from. Neither is Obsidian's API (the dialog is Electron's, through the `remote` Obsidian
   keeps for its own dialogs; the disk is Node's `fs`), so they are here and nowhere else (golden rule 5), asked for
   only when used, and looked at before they are trusted: `importDesktop()` is null when anything is missing, and
   the dialog then offers a zipped backup alone, through the browser's own file chooser, as it does on a phone
   (docs/dev/internals.md). Nothing here can write: only `readFile`, `readdir` and `lstat` are asked of `fs`. */

const CHANGED = 'The project changed while it was being read. Close it in Scrivener and choose it again, or choose a zipped backup.';

interface Stat { size: number; mtimeMs: number; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }
interface Fs { promises: { readFile(path: string): Promise<Uint8Array>; readdir(path: string): Promise<string[]>; lstat(path: string): Promise<Stat> } }
interface PathLib { join(...parts: string[]): string; dirname(path: string): string; basename(path: string): string }
interface Dialog { showOpenDialog(o: { title: string; properties: string[]; filters: { name: string; extensions: string[] }[] }): Promise<{ canceled: boolean; filePaths: string[] }> }

/** The computer's side of choosing a project. */
export interface ImportDesktop {
	/** The system's dialog: the folder (or the `.scrivx`) chosen, or null if the writer backed out. */
	pick(): Promise<string | null>;
	/** A project read from its folder (or from the `.scrivx` in it). */
	read(path: string): Promise<ProjectSource>;
}

/** The computer's side of choosing a project, or null: on a phone or tablet, in a vault that isn't on a disk, or
    where Electron's dialog or Node's `fs` isn't what this expects. */
export function importDesktop(app: App): ImportDesktop | null {
	try {
		const req = nodeRequire(app);
		if (!req) return null;
		const fs = (req('fs') as Fs | undefined)?.promises, path = req('path') as PathLib | undefined;
		const dialog = (req('electron') as { remote?: { dialog?: Dialog } } | undefined)?.remote?.dialog;
		if (typeof dialog?.showOpenDialog !== 'function' || typeof fs?.readFile !== 'function' || typeof fs.readdir !== 'function' || typeof fs.lstat !== 'function') return null;
		if (typeof path?.join !== 'function' || typeof path.dirname !== 'function' || typeof path.basename !== 'function') return null;

		/** Every file of a folder, by its path in it. `read` false: what each file is (its size and when it was last
		    written), without its bytes. A link is refused: what it points at is not the project's. */
		const walk = async (dir: string, read: boolean): Promise<{ files: Map<string, Uint8Array>; stamps: Map<string, string> }> => {
			const files = new Map<string, Uint8Array>(), stamps = new Map<string, string>();
			let total = 0, entries = 0;
			const into = async (at: string, rel: string): Promise<void> => {
				if (rel.split('/').length > 80) throw new Error('This project’s folders are nested too deeply to read.');
				for (const name of await fs.readdir(at)) {
					if (++entries > MAX_FILES) throw new Error(TOO_BIG);
					const key = safePath(rel ? `${rel}/${name}` : name), full = path.join(at, name), stat = await fs.lstat(full);
					if (stat.isSymbolicLink()) throw new Error('This project holds a link to a file elsewhere, which import won’t follow. Choose a zipped backup of it.');
					if (stat.isDirectory()) { await into(full, key); continue; }
					if (!stat.isFile()) throw new Error('This project holds something that isn’t a file or a folder, and can’t be read.');
					total += stat.size;
					if (total > MAX_BYTES) throw new Error(TOO_BIG);
					stamps.set(key, `${stat.size} ${stat.mtimeMs}`);
					if (!read) continue;
					const bytes = new Uint8Array(await fs.readFile(full));
					if (bytes.length !== stat.size) throw new Error(CHANGED);
					files.set(key, bytes);
				}
			};
			const stat = await fs.lstat(dir);
			if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('That isn’t a Scrivener project’s folder. Choose the folder whose name ends in .scriv.');
			await into(dir, '');
			return { files, stamps };
		};
		const read = async (selected: string): Promise<ProjectSource> => {
			const dir = /\.scrivx$/i.test(selected) ? path.dirname(selected) : selected, { files, stamps } = await walk(dir, true);
			// The project as it is now is the one that was read: no file is new, gone, or written since. Asked once the
			// reading is done (Scrivener saves as it goes, and a project read across a save is half of each), and
			// again before anything is imported.
			const unchanged = async (): Promise<boolean> => {
				try { const now = (await walk(dir, false)).stamps; return now.size === stamps.size && [...stamps].every(([p, s]) => now.get(p) === s); } catch { return false; }
			};
			const source = projectSource(files, path.basename(dir), unchanged);
			if (!(await unchanged())) throw new Error(CHANGED);
			return source;
		};
		return {
			read,
			pick: async () => {
				const picked = await dialog.showOpenDialog({ title: 'Choose a Scrivener project', properties: ['openFile', 'openDirectory', 'treatPackageAsDirectory'], filters: [{ name: 'Scrivener project', extensions: ['scriv', 'scrivx'] }] });
				return picked.canceled || picked.filePaths.length !== 1 ? null : picked.filePaths[0];
			},
		};
	} catch { return null; }
}
