import { TFile, TFolder, normalizePath, type App, type TAbstractFile } from 'obsidian';
import type { Binder } from './binders';
import type BindersPlugin from './main';
import { saveOpen } from './scenes';
import { BINDER_SNAPSHOT_EXT, BINDER_SNAPSHOT_FORMAT, NewerSnapshot, fingerprint, inFolder, parseFolderSnapshot, readHead, writeFolderSnapshot, type Entry, type Head } from './binder-snapshot-text';
import { SNAPSHOTS, readSnapshotName, snapshotName } from './snapshot-text';
import { wordsIn } from './view/words';

/* Snapshots of a folder or of a whole binder, vault side: everything in the folder as it stood, in one file.

   A snapshot of a folder is one file in the binder's "Snapshots" folder, under the folder's own path: those of
   "Part One" are the ".binder-snapshot" files in "Snapshots/Part One", beside the folders that hold its notes' own
   snapshots; the binder's are at the top of "Snapshots". A snapshot of a folder holds every folder inside it, so a
   folder's list has its own and those of every folder it is in.

   What this writes, and nothing else:
     - a new snapshot file (never over a file that's there), read back from the disk and checked before anyone is
       told it was taken;
     - a snapshot file's name (naming it), or the trash (deleting it, in the view);
     - "Make a binder (or folder) from this snapshot": new notes in a new folder beside the one it is of. Nothing
       that is there is touched;
     - a note that is gone, made again from a snapshot, under a name that's free.
   A snapshot file is never changed after it's written, and one in a newer format is never renamed either. */

/** One snapshot in a list: what its file's name says, without the file being read. */
export interface FolderSnapshot {
	file: TFile;
	taken: number;
	title: string;
	/** Binders took it unasked (its name ends in ".auto"); one the writer took, or named, never is. */
	auto: boolean;
	/** The folder it is of, as a path in the binder ("" for the binder). */
	of: string;
}

/** A folder as it stands or stood: its items in order, and its size. */
export interface State { entries: Entry[]; notes: number; words: number }
/** A snapshot read: the folder as it stood, and what is wrong with the file, if anything. */
export interface Read extends State { head: Head; damaged: string[] }

const AUTO = '.auto';
const isFolderSnapshot = (f: unknown): f is TFile => f instanceof TFile && f.extension === BINDER_SNAPSHOT_EXT;
const rel = (b: Binder, folder: TFolder): string => (folder === b.folder ? '' : folder.path.slice(b.folder.path.length + 1));
const dirFor = (b: Binder, of: string): string => normalizePath(`${b.folder.path}/${SNAPSHOTS}${of ? '/' + of : ''}`);

/** A file's text exactly as it is on the disk: a byte-order mark stays (Obsidian's own `read` drops it). */
const exact = new TextDecoder('utf-8', { ignoreBOM: true });
export async function readExact(app: App, path: string): Promise<string> { return exact.decode(await app.vault.adapter.readBinary(path)); }

/** The snapshots a folder has, newest first: its own, and those of the folders it is in (the binder's among them,
    being of the most). Read from the names of the files: none is opened. */
export function folderSnapshots(plugin: BindersPlugin, folder: TFolder): FolderSnapshot[] {
	const b = plugin.binders.binderOf(folder), out: FolderSnapshot[] = [];
	if (!b || !plugin.binders.snapshotsFolder(b)) return out;
	const mine = rel(b, folder), steps = mine ? mine.split('/') : [];
	for (let i = 0; i <= steps.length; i++) {
		const of = steps.slice(0, i).join('/'), dir = plugin.app.vault.getAbstractFileByPath(dirFor(b, of));
		if (!(dir instanceof TFolder)) continue;
		const files = dir.children.filter(isFolderSnapshot), names = new Set(files.map((f) => f.basename));
		for (const file of files) {
			const auto = file.basename.endsWith(AUTO), base = auto ? file.basename.slice(0, -AUTO.length) : file.basename;
			const named = readSnapshotName(base, (n) => names.has(n) || names.has(n + AUTO));
			out.push({ file, taken: named?.when.getTime() ?? file.stat.mtime, title: named ? named.title : base, auto, of });
		}
	}
	return out.sort((x, y) => y.taken - x.taken || y.file.name.localeCompare(x.file.name));
}

/** The folder as it stands: every item in the binder's order, each note's file whole, as it is on the disk. What is
    typed in an editor and not yet saved is saved first, so it is in (a field being typed in is the view's to save:
    see `takeFolder` there). */
export async function stateNow(plugin: BindersPlugin, folder: TFolder): Promise<State> {
	const { app } = plugin, store = plugin.binders, b = store.binderOf(folder), entries: Entry[] = [], notes: { e: Entry; f: TFile }[] = [];
	if (!b) return { entries, notes: 0, words: 0 };
	const base = folder.path.length + 1;
	const note = (f: TFile, role: Entry['role']) => { const e: Entry = { path: f.path.slice(base), kind: 'note', role, text: '', hash: '', size: 0 }; entries.push(e); notes.push({ e, f }); };
	const walk = (dir: TFolder) => {
		const own = store.folderNote(dir);
		// (a Longform project's index note can be outside its folder: then it isn't part of the folder)
		if (own && own.path.startsWith(folder.path + '/')) note(own, dir === b.folder ? 'binder note' : 'folder note');
		for (const c of store.orderedChildren(dir) ?? []) {
			if (c instanceof TFolder) { entries.push({ path: c.path.slice(base) + '/', kind: 'folder', role: '', text: null, hash: '', size: 0 }); walk(c); }
			else if (c instanceof TFile && c.extension === 'md') note(c, '');
			else if (c instanceof TFile) entries.push({ path: c.path.slice(base), kind: 'file', role: '', text: null, hash: '', size: c.stat.size });
		}
	};
	walk(folder);
	await saveOpen(app, notes.map((n) => n.f));
	let words = 0, count = 0;
	// (a few at a time: thousands of reads at once would only wait on each other)
	for (let i = 0; i < notes.length; i += 64) {
		await Promise.all(notes.slice(i, i + 64).map(async ({ e, f }) => {
			const text = await readExact(app, f.path);
			e.text = text; e.size = text.length; e.hash = fingerprint(text);
			if (!e.role) { count++; words += wordsIn(plugin, text.replace(/^\uFEFF/, '')); }
		}));
	}
	return { entries, notes: count, words };
}

async function ensureFolder(app: App, path: string): Promise<void> {
	let at = '';
	for (const part of path.split('/')) {
		at = at ? `${at}/${part}` : part;
		const f = app.vault.getAbstractFileByPath(at);
		if (f instanceof TFile) throw new Error(`“${at}” is a file, so nothing can be kept there.`);
		if (!f) await app.vault.createFolder(at).catch((e) => { if (!(app.vault.getAbstractFileByPath(at) instanceof TFolder)) throw e; });
	}
}

/** Refuses what a binder can't have done to it: one in a newer format isn't written in at all, and a "Snapshots"
    folder with notes in it is somebody's chapter, not ours to fill. */
function writable(plugin: BindersPlugin, folder: TFolder): Binder {
	const store = plugin.binders, b = store.binderOf(folder);
	if (!b || store.inSnapshots(folder.path)) throw new Error('Only a binder and its folders have snapshots.');
	if (b.kind === 'longform' && folder !== b.folder) throw new Error('Only a binder and its folders have snapshots.');
	if (b.problem) throw new Error(`“${b.folder.name}” can’t be changed. ${b.problem}`);
	const there = plugin.app.vault.getAbstractFileByPath(`${b.folder.path}/${SNAPSHOTS}`);
	if (there && !store.snapshotsFolder(b)) throw new Error(`“${SNAPSHOTS}” in “${b.folder.name}” has notes in it, so snapshots can’t be kept there. Move the notes out of it, or rename it.`);
	return b;
}

/** Can this folder have snapshots (it is a binder, or a folder of one that isn't its folder of snapshots)? */
export function hasSnapshots(plugin: BindersPlugin, folder: TFolder): boolean {
	const store = plugin.binders, b = store.binderOf(folder);
	return !!b && !store.inSnapshots(folder.path) && (b.kind !== 'longform' || folder === b.folder);
}

/** Are two states the same: the same items in the same order, each note's file the same? */
export const sameState = (a: Entry[], b: Entry[]): boolean => a.length === b.length && a.every((e, i) => e.path === b[i].path && e.kind === b[i].kind && e.hash === b[i].hash && (e.kind !== 'file' || e.size === b[i].size));

/** Takes a snapshot of a folder and everything in it, as it is now. Returns it, or the newest one if that already
    holds exactly this (nothing is kept twice in a row; given a name, an unnamed newest one that holds exactly this
    takes the name instead). `why`: Binders is taking it unasked, before something it is about to do; it is always
    taken. Throws if it couldn't be taken: then nothing was changed. */
export async function takeFolderSnapshot(plugin: BindersPlugin, folder: TFolder, title = '', why = ''): Promise<{ snapshot: FolderSnapshot; made: boolean; state: State }> {
	const { app } = plugin, b = writable(plugin, folder), of = rel(b, folder), dir = dirFor(b, of);
	// (one Binders takes itself is named for why it was taken)
	if (why && !title) title = why.replace(/[*"\\/<>:|?]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
	const state = await stateNow(plugin, folder);
	const last = folderSnapshots(plugin, folder).find((s) => s.of === of);
	if (last && !why) {
		const was = await readFolderSnapshot(plugin, last, folder).catch((): null => null);
		if (was && !was.damaged.length && sameState(was.entries, state.entries)) {
			if (!title) return { snapshot: last, made: false, state };
			// a name for what the newest one already holds: that one is given it, not written again
			if (!last.title || last.auto) { await nameFolderSnapshot(app, last, title); return { snapshot: folderSnapshots(plugin, folder).find((s) => s.taken === last.taken && s.of === of) ?? last, made: false, state }; }
		}
	}
	await ensureFolder(app, dir);
	const at = (n: string) => `${dir}/${n}.${BINDER_SNAPSHOT_EXT}`;
	const when = new Date(), name = snapshotName(when, title, (n) => !!app.vault.getAbstractFileByPath(at(n)) || !!app.vault.getAbstractFileByPath(at(n + AUTO))) + (why ? AUTO : '');
	const head: Head = { format: BINDER_SNAPSHOT_FORMAT, binder: b.folder.name, of, taken: when.getTime(), why, notes: state.notes, words: state.words };
	const text = writeFolderSnapshot(head, state.entries);
	const file = await app.vault.create(at(name), text);
	// read back from the disk: it is there, whole, before anyone is told it was taken
	if (await readExact(app, file.path) !== text) throw new Error('The snapshot couldn’t be checked, so it doesn’t count. Nothing else was changed.');
	return { snapshot: { file, taken: when.getTime(), title, auto: !!why, of }, made: true, state };
}

/** Snapshots read and kept while a dialog is open, by file and its date (a snapshot is never changed by Binders;
    one changed from outside is read again). */
const read = new Map<string, { head: Head; entries: Entry[]; damaged: string[] }>();
export function forgetRead(): void { read.clear(); }

/** A snapshot read: the folder asked about as it stood (a snapshot of a folder it is in gives its part), its size
    then, and the notes whose text isn't what the file says. Throws `NewerSnapshot` for one a newer Binders made. */
export async function readFolderSnapshot(plugin: BindersPlugin, s: FolderSnapshot, folder: TFolder): Promise<Read> {
	const { app } = plugin, b = plugin.binders.binderOf(folder), key = `${s.file.path}\n${s.file.stat.mtime}\n${s.file.stat.size}`;
	let got = read.get(key);
	if (!got) {
		got = parseFolderSnapshot(await readExact(app, s.file.path));
		if (read.size > 6) read.delete(read.keys().next().value as string);
		read.set(key, got);
	}
	const mine = b ? rel(b, folder) : '', inside = mine === s.of ? '' : mine.slice(s.of ? s.of.length + 1 : 0) + '/';
	// (the folder's own note, in a snapshot of a folder above it, is that folder's folder note)
	const entries = inside ? got.entries.filter((e) => e.path.startsWith(inside) && e.path !== inside).map((e) => ({ ...e, path: e.path.slice(inside.length) })) : got.entries;
	let words = 0, notes = 0;
	for (const e of entries) if (e.kind === 'note' && !e.role) { notes++; words += wordsIn(plugin, (e.text ?? '').replace(/^\uFEFF/, '')); }
	const damaged = inside ? got.damaged.filter((p) => !p || p.startsWith(inside)).map((p) => p.slice(p ? inside.length : 0)) : got.damaged;
	return { head: got.head, entries, notes, words, damaged };
}

/** How big the folder was in a snapshot, from the head of its file. Null for one that can't be read. */
const sizes = new Map<string, { notes: number; words: number }>();
export async function sizeOfSnapshot(plugin: BindersPlugin, s: FolderSnapshot): Promise<{ notes: number; words: number } | null> {
	const key = `${s.file.path}\n${s.file.stat.mtime}`, kept = sizes.get(key);
	if (kept) return kept;
	try {
		const { head } = readHead(await plugin.app.vault.adapter.read(s.file.path)), size = { notes: head.notes, words: head.words };
		if (sizes.size > 2000) sizes.clear();
		sizes.set(key, size);
		return size;
	} catch { return null; }
}

/** Is this a snapshot this version can't open (a newer Binders made it)? */
export const isNewer = (e: unknown): boolean => e instanceof NewerSnapshot;

/** Refuses a snapshot in a newer format: it is read by a newer Binders, and this one leaves its file as it is. */
async function mine(app: App, s: FolderSnapshot): Promise<void> { readHead(await app.vault.adapter.read(s.file.path)); }

/** A snapshot's new name: its file is renamed, the time it was taken staying at the front. One Binders took unasked
    becomes the writer's own by being named. */
export async function nameFolderSnapshot(app: App, s: FolderSnapshot, title: string): Promise<void> {
	await mine(app, s);
	const dir = s.file.parent?.path ?? '', at = (n: string) => `${dir}/${n}.${BINDER_SNAPSHOT_EXT}`;
	const name = snapshotName(new Date(s.taken), title, (n) => { const f = app.vault.getAbstractFileByPath(at(n)) ?? app.vault.getAbstractFileByPath(at(n + AUTO)); return !!f && f !== s.file; }) + (s.auto && !title ? AUTO : '');
	if (name !== s.file.basename) await app.vault.rename(s.file, at(name));
}

/** Deletes a snapshot: to the trash, as Obsidian's "Deleted files" setting says. Not one in a newer format. */
export async function deleteFolderSnapshot(app: App, s: FolderSnapshot): Promise<void> {
	await mine(app, s);
	await app.fileManager.trashFile(s.file);
}

/** A name that nothing in `dir` has: the name, or the name counted on ("Arrival 2"). */
function free(app: App, dir: string, name: string, ext = ''): string {
	let out = name;
	for (let n = 2; app.vault.getAbstractFileByPath(normalizePath(`${dir}/${out}${ext}`)); n++) out = `${name} ${n}`;
	return out;
}

/** "Make a binder (or a folder) from this snapshot": the folder as it stood, written out as a new folder beside the
    one it is of. Nothing that is there is touched: every file is new, and each is read back. A binder's copy is a
    binder; a folder's is a folder of the same binder, right after the one it is of, in the order it had.
    The folder's own note is written last, so a binder's copy becomes a binder once, when it is whole, and not a
    binder that the store looks at again for every note that arrives. `step` is told how far it has got. */
export async function makeFromSnapshot(plugin: BindersPlugin, s: FolderSnapshot, folder: TFolder, label: string, step?: (done: number, of: number) => void): Promise<TFolder> {
	const { app } = plugin, store = plugin.binders, state = await readFolderSnapshot(plugin, s, folder);
	if (state.damaged.length) throw new Error('This snapshot’s file isn’t as it was written, so nothing was made from it.');
	const parent = folder.parent?.path ?? '', safe = label.replace(/[*"\\/<>:|?]/g, ' ').replace(/\s+/g, ' ').trim();
	const name = free(app, parent, `${folder.name} (${safe})`);
	const root = await app.vault.createFolder(normalizePath(`${parent}/${name}`));
	// (the reader leaves such items out; nothing is written anywhere on the word of a path, all the same)
	if (state.entries.some((e) => !inFolder(e.path, e.kind))) throw new Error('This snapshot names a place outside its folder, so nothing was made from it.');
	const notes = state.entries.filter((e) => e.kind === 'note' && e.text != null), own = notes.find((e) => e.role && !e.path.includes('/'));
	let done = 0;
	const write = async (e: Entry, path: string) => {
		const at = `${root.path}/${path}`;
		await app.vault.create(at, e.text ?? '');
		if (await readExact(app, at) !== e.text) throw new Error(`“${path}” couldn’t be checked after it was written. What was made so far is in “${name}”.`);
		step?.(++done, notes.length);
	};
	for (const e of state.entries) {
		if (e.kind === 'folder') await app.vault.createFolder(`${root.path}/${e.path.replace(/\/$/, '')}`);
		else if (e.kind === 'note' && e.text != null && e !== own) await write(e, e.path);
	}
	// (the folder's own note is named like the folder, so it is the copy's too)
	if (own) await write(own, own.path === `${folder.name}.md` ? `${name}.md` : own.path);
	// a folder's copy is in the binder the folder is in: after the folder, and in the order the snapshot has
	const b = store.binderOf(folder);
	if (b && b.folder !== folder && folder.parent && !b.problem) {
		const kids = new Map<string, TAbstractFile[]>();
		for (const e of state.entries) {
			if (e.role || e.kind === 'file') continue;
			const p = e.path.replace(/\/$/, ''), dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '', f = app.vault.getAbstractFileByPath(`${root.path}/${p}`);
			if (f) kids.set(dir, [...(kids.get(dir) ?? []), f]);
		}
		const siblings = store.orderedChildren(folder.parent) ?? [], at = siblings.indexOf(folder);
		await store.move(root, folder.parent, at < 0 ? Infinity : at + 1);
		for (const [dir, items] of kids) { const f = app.vault.getAbstractFileByPath(dir ? `${root.path}/${dir}` : root.path); if (f instanceof TFolder) await store.reorder(f, items); }
	}
	return root;
}

/** A note that is gone, made again from a snapshot: its file as it was, where it was (its folder made again if that
    is gone too), after the item it followed then if that is still there. Under its own name if that is free, else
    counted on: a note that has the name now keeps it, and is not touched. */
export async function remakeNote(plugin: BindersPlugin, folder: TFolder, then: Entry[], e: Entry): Promise<TFile> {
	const { app } = plugin, store = plugin.binders;
	writable(plugin, folder);
	if (e.kind !== 'note' || e.text == null || e.role || !inFolder(e.path, e.kind)) throw new Error('Only a note can be made again.');
	const path = `${folder.path}/${e.path}`, dir = path.slice(0, path.lastIndexOf('/')), base = path.slice(dir.length + 1).replace(/\.md$/i, '');
	await ensureFolder(app, dir);
	const name = free(app, dir, base, '.md'), file = await app.vault.create(`${dir}/${name}.md`, e.text);
	if (await readExact(app, file.path) !== e.text) throw new Error('The note couldn’t be checked after it was written.');
	// after the nearest item before it, as things stood, that is in the folder now
	const parent = app.vault.getAbstractFileByPath(dir), inDir = (x: Entry) => !x.role && x.path.replace(/\/$/, '').lastIndexOf('/') === e.path.lastIndexOf('/') && x.path.startsWith(e.path.slice(0, e.path.lastIndexOf('/') + 1));
	if (parent instanceof TFolder && store.orderedChildren(parent)) {
		const before = then.slice(0, then.indexOf(e)).filter(inDir).reverse(), now = store.orderedChildren(parent) ?? [];
		const prev = before.map((x) => app.vault.getAbstractFileByPath(`${folder.path}/${x.path.replace(/\/$/, '')}`)).find((f) => f && now.includes(f));
		await store.move(file, parent, prev ? now.filter((f) => f !== file).indexOf(prev) + 1 : 0).catch(() => { /* it stays at the end of its folder */ });
	}
	return file;
}
