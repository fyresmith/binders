import { TFile, TFolder, normalizePath, type App, type TAbstractFile } from 'obsidian';
import { SNAPSHOTS } from '../snapshot-text';
import { isNote } from '../scenes';
import type { Handler, RenameStep } from './types';

/* A rename made by hand, and taking it back: the item gets its old name again, by the same road as the rename
   (`fileManager.renameFile`), so links, snapshots and folder notes follow as they did. Exact: only if the item still has
   the name the rename gave it, and the old name is free. */

/** Why a typed name can't be a file's name, or null: characters Obsidian refuses or that break links, and a leading dot,
    which makes a hidden file Obsidian doesn't show. */
export const badName = (name: string): string | null =>
	/[*"\\/<>:|?]/.test(name) ? 'A name can’t contain any of * " \\ / < > : | ?' : name.startsWith('.') ? 'A name can’t start with a dot.' : name.length > 200 ? 'That name is too long.' : null;

/** An item's name as a person says it: a note's without ".md". */
export const itemName = (f: TAbstractFile): string => (f instanceof TFile ? f.basename : f.name);

/** Where an item goes when it is given this name. */
export const pathWith = (f: TAbstractFile, name: string): string => normalizePath(`${f.parent?.path ?? ''}/${name}${f instanceof TFile ? '.' + f.extension : ''}`);

/** Why an item can't be given this name (other than a clash with something there), or null. `binderFolder`: the binder it
    is in, whose snapshots folder is no name for a folder at its top. */
export function nameProblem(f: TAbstractFile, name: string, binderFolder: TFolder | null): string | null {
	const bad = badName(name);
	if (bad) return bad;
	// a note named like its folder, or a folder named like a note in it, would make that note the folder note
	if (isNote(f) && name === f.parent?.name) return 'A note can’t have its folder’s name: it would become the folder’s note.';
	if (f instanceof TFolder && name === SNAPSHOTS && f.parent === binderFolder) return `“${SNAPSHOTS}” is where the binder keeps its snapshots. Choose another name.`;
	if (f instanceof TFolder && f.children.some((c) => isNote(c) && c.basename === name)) return `“${f.name}” already has a note called “${name}”, which would become its folder note.`;
	return null;
}

/** What the handler asks of the store. */
export interface RenameHost {
	binderFolderOf(item: TAbstractFile): TFolder | null;
	/** Writes down anything typed into these notes and not saved yet. */
	settle(files: TFile[]): Promise<void>;
}

export class RenameHandler implements Handler<RenameStep> {
	constructor(private app: App, private host: RenameHost) {}

	alive(step: RenameStep): boolean { return this.app.vault.getAbstractFileByPath(step.file.path) === step.file; }

	async check(step: RenameStep, redo: boolean): Promise<void> {
		const f = step.file, from = redo ? step.before : step.after, to = redo ? step.after : step.before;
		if (itemName(f) !== from) throw new Error(`“${itemName(f)}” has been renamed since, so its name stays.`);
		const clash = this.app.vault.getAbstractFileByPath(pathWith(f, to));
		if (clash && clash !== f) throw new Error(`“${to}” can’t have its name ${redo ? 'again' : 'back'}: there is another “${to}” here now.`);
		const why = nameProblem(f, to, this.host.binderFolderOf(f));
		if (why) throw new Error(why);
		// (what is typed into a note that is open is written first, so the rename takes it along)
		if (f instanceof TFile) await this.host.settle([f]);
	}

	async apply(step: RenameStep, redo: boolean): Promise<void> {
		await this.app.fileManager.renameFile(step.file, pathWith(step.file, redo ? step.after : step.before));
	}
}
