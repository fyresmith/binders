import { FileSystemAdapter, Platform, type App } from 'obsidian';

/* Saving an exported file where the writer says, on a computer: the system's save dialog and the disk outside the
   vault. Neither is Obsidian's API: the dialog is Electron's, reached through the `remote` Obsidian keeps for its own
   "Export to PDF", and the disk is Node's `fs`. So they are here and nowhere else (golden rule 5), asked for only when
   used, only on a computer, and looked at before they are trusted: `desktop()` is null when anything is missing, and
   export then saves into the vault's Exports folder instead, as it does on a phone (docs/dev/internals.md). */

interface Fs {
	promises: {
		writeFile(path: string, data: Uint8Array): Promise<void>;
		rename(from: string, to: string): Promise<void>;
		mkdir(path: string, o: { recursive: boolean }): Promise<unknown>;
		rmdir(path: string): Promise<void>;
		unlink(path: string): Promise<void>;
		stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory?(): boolean }>;
		readdir?(path: string): Promise<string[]>;
		rm?(path: string, o: { recursive: boolean; force: boolean }): Promise<void>;
	};
}
interface Dialog { showSaveDialog(o: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<{ canceled: boolean; filePath?: string }> }
interface Shell { showItemInFolder(path: string): void; openPath(path: string): Promise<string> }
interface PathLib { join(...parts: string[]): string; dirname(path: string): string; basename(path: string): string; sep: string }

/** What a saved file was when export left it: enough to tell later whether it is still export's own. */
export interface Stamp { size: number; mtime: number; /** A folder: how many files it has. */ files?: number; /** The binder, or the folder of one, it was exported from (a path in the vault). */ from?: string }
export const sameStamp = (a: Stamp | null | undefined, b: Stamp | null | undefined): boolean => !!a && !!b && a.size === b.size && a.mtime === b.mtime && (a.files ?? 0) === (b.files ?? 0);

/** The computer's side of saving. */
export interface Desktop {
	/** The vault's folder on the disk. */
	base: string;
	join(...parts: string[]): string;
	dirname(path: string): string;
	basename(path: string): string;
	/** The system's save dialog, starting at `start` (a folder and a file name). The path chosen, or null. */
	pick(start: string, kind: string, extension: string): Promise<string | null>;
	/** Writes the file whole or not at all: beside its place first, then renamed into it. */
	write(path: string, data: Uint8Array): Promise<Stamp>;
	stamp(path: string): Promise<Stamp | null>;
	/** A folder of files (a Scrivener project) written whole or not at all: beside its place first, then renamed into
	    it. A folder already there is set aside until the new one is in its place, and only then removed. Not there
	    at all where the disk can't be read as folders: then such an export is zipped into the vault instead. */
	writeFolder?: (path: string, files: ReadonlyMap<string, Uint8Array>) => Promise<Stamp>;
	/** What a folder is now, everything in it counted; a file's own stamp for a file; null when nothing is there. */
	folderStamp?: (path: string) => Promise<Stamp | null>;
	/** A folder made if it isn't there; true if this made it. */
	mkdir(path: string): Promise<boolean>;
	/** A folder removed again, if nothing was put in it. */
	rmdir(path: string): Promise<void>;
	reveal(path: string): void;
	open(path: string): void;
}

type Requires = (name: string) => unknown;

/** Node's and Electron's modules, as Obsidian on a computer hands them over, or null: on a phone or tablet, in a
    vault that isn't on a disk, or where there is no `require`. Export saves through this and import reads a
    Scrivener project's folder through it (src/import/desktop.ts); each looks at what it is given before trusting it.
    (`isMobile` too: Obsidian's own emulation of a phone on a computer is a phone here.) */
export function nodeRequire(app: App): Requires | null {
	if (!Platform.isDesktopApp || Platform.isMobile) return null;
	const req = (window as unknown as { require?: Requires }).require;
	return app.vault.adapter instanceof FileSystemAdapter && typeof req === 'function' ? req : null;
}

/** The computer's side of saving, or null: on a phone or tablet, in a vault that isn't on a disk, or where Electron's
    dialog or Node's `fs` isn't what this expects. */
export function desktop(app: App): Desktop | null {
	try {
		const adapter = app.vault.adapter, req = nodeRequire(app);
		if (!req || !(adapter instanceof FileSystemAdapter)) return null;
		const fs = req('fs') as Fs | undefined, path = req('path') as PathLib | undefined;
		const electron = req('electron') as { remote?: { dialog?: Dialog; shell?: Shell }; shell?: Shell } | undefined;
		const dialog = electron?.remote?.dialog, shell = electron?.shell ?? electron?.remote?.shell;
		if (typeof dialog?.showSaveDialog !== 'function' || typeof fs?.promises?.writeFile !== 'function' || typeof fs.promises.rename !== 'function' || typeof path?.join !== 'function') return null;
		const stamp = async (p: string): Promise<Stamp | null> => { try { const s = await fs.promises.stat(p); return { size: s.size, mtime: Math.round(s.mtimeMs) }; } catch { return null; } };
		const p = fs.promises, folders = typeof p.readdir === 'function' && typeof p.mkdir === 'function' && typeof p.rmdir === 'function' && typeof p.unlink === 'function';
		const isDir = async (at: string): Promise<boolean> => { try { return !!(await p.stat(at)).isDirectory?.(); } catch { return false; } };
		const folderStamp = async (at: string): Promise<Stamp | null> => {
			if (!(await isDir(at))) return stamp(at);
			const total = { size: 0, mtime: 0, files: 0 };
			const walk = async (dir: string): Promise<void> => {
				for (const name of await p.readdir?.(dir) ?? []) {
					const full = path.join(dir, name);
					if (await isDir(full)) { await walk(full); continue; }
					const s = await stamp(full);
					if (s) { total.size += s.size; total.mtime = Math.max(total.mtime, s.mtime); total.files++; }
				}
			};
			await walk(at);
			return total;
		};
		/** A folder and all that is in it, gone; nothing said if it was never there. */
		const remove = async (at: string): Promise<void> => {
			if (typeof p.rm === 'function') { await p.rm(at, { recursive: true, force: true }); return; }
			if (!(await isDir(at))) { await p.unlink(at).catch(() => { /* it isn't there */ }); return; }
			for (const name of await p.readdir?.(at) ?? []) await remove(path.join(at, name));
			await p.rmdir(at);
		};
		const writeFolder = async (at: string, files: ReadonlyMap<string, Uint8Array>): Promise<Stamp> => {
			const part = `${at}.binders-part`, old = `${at}.binders-old`;
			try {
				await remove(part); // (what an export that was cut short left)
				for (const [rel, data] of files) {
					const full = path.join(part, ...rel.split('/'));
					await p.mkdir(path.dirname(full), { recursive: true });
					await p.writeFile(full, data);
				}
				if (await stamp(at)) {
					await remove(old);
					await p.rename(at, old);
					try { await p.rename(part, at); } catch (e) { await p.rename(old, at).catch(() => { /* it stays beside, under its other name */ }); throw e; }
					await remove(old).catch(() => { /* the new project is in its place all the same */ });
				} else await p.rename(part, at);
			} catch (e) {
				await remove(part).catch(() => { /* it was never made */ });
				throw e;
			}
			return (await folderStamp(at)) ?? { size: 0, mtime: 0, files: files.size };
		};
		return {
			...(folders ? { writeFolder, folderStamp } : {}),
			base: adapter.getBasePath(),
			join: (...parts) => path.join(...parts),
			dirname: (p) => path.dirname(p),
			basename: (p) => path.basename(p),
			pick: async (start, kind, extension) => {
				const r = await dialog.showSaveDialog({ title: 'Export', defaultPath: start, filters: [{ name: kind, extensions: [extension] }] });
				if (r.canceled || !r.filePath) return null;
				return r.filePath.toLowerCase().endsWith(`.${extension}`) ? r.filePath : `${r.filePath}.${extension}`;
			},
			write: async (p, data) => {
				const tmp = `${p}.binders-part`;
				try {
					await fs.promises.writeFile(tmp, data);
					await fs.promises.rename(tmp, p);
				} catch (e) {
					await fs.promises.unlink(tmp).catch(() => { /* it was never made */ });
					throw e;
				}
				return (await stamp(p)) ?? { size: data.length, mtime: 0 };
			},
			stamp,
			mkdir: async (p) => { if (await stamp(p)) return false; await fs.promises.mkdir(p, { recursive: true }); return true; },
			rmdir: async (p) => { await fs.promises.rmdir(p).catch(() => { /* something is in it: it stays */ }); },
			reveal: (p) => { shell?.showItemInFolder(p); },
			open: (p) => { void shell?.openPath(p); },
		};
	} catch { return null; }
}
