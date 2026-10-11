import { TFile, TFolder, type Vault } from 'obsidian';
import { equalBytes, utf8 } from './source';
import { inBinder, type ImportPlan } from './plan';

/* A plan written into the vault (scriv/plan.ts and manuscript.ts make it; this is the only part of import that writes).
     - It only ever creates: a folder that wasn't there, and files in it. Nothing that exists is opened for writing,
       and `createFolder` refuses a folder that is there already, even one that arrived after the dialog looked.
     - The binder note is the last file written. Until it is, the folder is plain files and no binder: an import
       that stops halfway (cancelled, a full disk) leaves notes that can be read, and nothing that claims to be whole.
     - Nothing is deleted when it stops. What was made is said, by its folder, and left: between reading a file back
       and deleting it, the writer may have typed in it.
     - Every file is read back and compared before the binder note is written. */
export async function writeImport(vault: Vault, plan: ImportPlan, parent: string, stopped: () => boolean, progress: (path: string) => void): Promise<TFolder> {
	const at = parent ? `${parent}/${plan.name}` : plan.name, marker = `${at}/${plan.name}.md`;
	const parentFolder = vault.getAbstractFileByPath(parent || '/');
	if (!(parentFolder instanceof TFolder)) throw new Error('The folder to make the binder in isn’t there any more.');
	let root: TFolder | null = null;
	const own = new Map<string, TFile>();
	/** Before each step: not cancelled, and where the import goes is still where it was (not renamed, moved or deleted). */
	const check = () => {
		if (stopped()) throw new Error('The import was cancelled.');
		if (parentFolder.path !== (parent || '/') || vault.getAbstractFileByPath(parent || '/') !== parentFolder) throw new Error('The folder the binder was being made in was moved or renamed, so the import stopped.');
		if (root && (root.path !== at || vault.getAbstractFileByPath(at) !== root)) throw new Error('The new binder’s folder was moved or renamed, so the import stopped.');
	};
	const verify = async () => {
		for (const [path, file] of own) {
			check();
			if (file.path !== path || vault.getAbstractFileByPath(path) !== file || !equalBytes(new Uint8Array(await vault.readBinary(file)), plan.files.get(path))) throw new Error(`“${path}” was changed while the import was running, so it stopped.`);
		}
	};
	try {
		check();
		// (asked again here, where it is written: nothing is made anywhere but in the new binder's own folder)
		for (const path of [...plan.folders, ...plan.files.keys()]) if (!inBinder(at, path)) throw new Error('The import would write outside its own folder, so nothing was imported.');
		root = await vault.createFolder(at);
		for (const path of plan.folders) {
			check();
			if (path !== at) await vault.createFolder(path);
		}
		for (const [path, bytes] of plan.files) {
			if (path === marker) continue;
			check();
			progress(path);
			own.set(path, await vault.createBinary(path, bytes.slice().buffer));
		}
		await verify();
		check();
		progress(marker);
		own.set(marker, await vault.create(marker, utf8(plan.files.get(marker))));
		await verify();
		check();
		return root;
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		throw new Error(message + (root ? ` What was made so far is in “${root.path}”, as plain notes: it is not a binder.` : ''));
	}
}
