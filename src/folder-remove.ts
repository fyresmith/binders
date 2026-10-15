import { FileSystemAdapter, normalizePath, type App, type TFolder } from 'obsidian';
import { nodeRequire } from './export/desktop';

/* Taking away a folder that is believed empty. Binders never removes a folder with everything in it on that belief:
   a file may arrive between the looking and the removing (a drop, a move, a sync client), and a recursive removal
   takes it too. On a computer the removal is Node's `rmdir`, which the disk refuses atomically when anything is in the
   folder. Obsidian's own `adapter.rmdir(path, false)` can't be used: on a computer it calls `fs.rm` without
   `recursive`, which fails on every folder, empty or not, and on a phone it always removes recursively. So off a
   computer the best there is is to look again, on the disk, as the removal starts. Quarantined here (golden rule 5;
   docs/dev/internals.md). */

interface NodeFs { promises?: { rmdir?(path: string): Promise<void> } }

/** Removes an emptied folder; false (and nothing lost) when anything at all is in it, or it can't be done. The folder
    goes straight, not to the trash: there is nothing in it to keep. */
export async function removeEmptyFolder(app: App, folder: TFolder): Promise<boolean> {
	const { vault } = app, adapter = vault.adapter, path = folder.path;
	try {
		const req = nodeRequire(app), fs = req?.('fs') as NodeFs | undefined;
		if (fs?.promises?.rmdir && adapter instanceof FileSystemAdapter) {
			await fs.promises.rmdir(adapter.getFullPath(normalizePath(path)));
			// (the vault's tree is told at once, as Obsidian's own removals do, and otherwise catches up when its watcher sees it)
			await (adapter as unknown as { reconcileInternalFile?(p: string): Promise<void> }).reconcileInternalFile?.(path).catch((): void => undefined);
			for (let i = 0; i < 100 && vault.getAbstractFileByPath(path) === folder; i++) await new Promise((r) => window.setTimeout(r, 20));
			return true;
		}
		const disk = await adapter.list(path);
		if (disk.folders.length || disk.files.length) return false;
		await adapter.rmdir(path, true);
		return true;
	} catch { return false; }
}
