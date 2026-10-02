import { MarkdownView, TFile, TFolder, normalizePath, type App, type Editor } from 'obsidian';
import type { Binder } from './binders';
import type BindersPlugin from './main';
import { frontFor, parts } from './scene-text';
import { saveOpen } from './scenes';
import { SNAPSHOTS, SNAPSHOT_EXT, readSnapshot, readSnapshotName, snapshotFile, snapshotName } from './snapshot-text';
import { liveEditors, saveTab } from './view/editable-embed';

/* Snapshots of a scene. A snapshot is the note's text as it was, kept as a plain-text file of its own in the binder's
   "Snapshots" folder, under the note's own path: the snapshots of "Part One/Arrival" are the files in
   "Snapshots/Part One/Arrival". The scene stays the scene (its place, its properties, the links to it); only its text
   is set aside. The files end in ".snapshot", which Obsidian doesn't take for notes: they're in no search, no quick
   switcher, no backlinks, no graph (see docs/file-format.md for what that costs with Obsidian Sync).

   What this writes, and nothing else:
     - a new snapshot file (never over a file that's there), read back from the disk and checked before anything
       else is done;
     - a scene's text, when the writer asks for a blank page or brings a snapshot back, and only after the text it
       replaces is in a snapshot: through the editor the note is open in (a tab, or the manuscript), as one change
       that Undo takes back; otherwise in one write that refuses if the note no longer says what was kept. The note's
       properties stay byte for byte;
     - a snapshot file's name (naming it), or the trash (deleting it);
     - the folder of a note's snapshots, moved to follow the note when it's renamed or moved (binders.ts asks).
   A snapshot file is never changed after it's written. */

export interface Snapshot {
	file: TFile;
	/** When it was taken: the time in its name, else its `taken` property, else the file's own date. */
	taken: number;
	/** Its name ("First draft"), or "". */
	title: string;
	/** The text it holds. */
	body: string;
}

const lf = (s: string) => s.replace(/\r\n?/g, '\n');
const isSnapshot = (f: unknown): f is TFile => f instanceof TFile && f.extension === SNAPSHOT_EXT;

/** Is this a scene of a binder: a note in its order (not its binder or folder note, nor one a Longform project
    leaves out)? Only scenes have snapshots. */
export function isScene(plugin: BindersPlugin, f: unknown): f is TFile {
	const store = plugin.binders;
	return f instanceof TFile && f.extension === 'md' && !!f.parent && !!store.binderOf(f) && !store.isHiddenNote(f) && (store.orderedChildren(f.parent) ?? []).includes(f);
}

/** Where a path in a binder keeps its snapshots: "Snapshots/", then the path as it is in the binder, without ".md". */
export const snapshotsPath = (binder: Binder, path: string): string => normalizePath(`${binder.folder.path}/${SNAPSHOTS}/${path.slice(binder.folder.path.length + 1).replace(/\.md$/i, '')}`);

/** Where a scene's snapshots are kept (whether or not it has any), or null for a note that isn't a scene. */
export function snapshotsDir(plugin: BindersPlugin, scene: TFile): string | null {
	const b = plugin.binders.binderOf(scene);
	return b && isScene(plugin, scene) && scene.path.startsWith(b.folder.path + '/') ? snapshotsPath(b, scene.path) : null;
}

/** The snapshots in a folder, newest first, each with its text. */
export async function snapshotsIn(app: App, dir: string): Promise<Snapshot[]> {
	const folder = app.vault.getAbstractFileByPath(dir);
	if (!(folder instanceof TFolder)) return [];
	const out: Snapshot[] = [];
	for (const file of folder.children.filter(isSnapshot)) {
		try {
			const named = readSnapshotName(file.basename), read = readSnapshot(await app.vault.cachedRead(file));
			out.push({ file, taken: named?.when.getTime() ?? read.taken ?? file.stat.mtime, title: named ? named.title : file.basename, body: read.body });
		} catch { /* one that can't be read isn't listed; its file stays */ }
	}
	return out.sort((a, b) => b.taken - a.taken || b.file.name.localeCompare(a.file.name));
}

/** A scene's snapshots, newest first. */
export async function snapshotsOf(plugin: BindersPlugin, scene: TFile): Promise<Snapshot[]> {
	const dir = snapshotsDir(plugin, scene);
	return dir ? snapshotsIn(plugin.app, dir) : [];
}

async function ensureFolder(app: App, path: string): Promise<void> {
	let at = '';
	for (const part of path.split('/')) {
		at = at ? `${at}/${part}` : part;
		const f = app.vault.getAbstractFileByPath(at);
		if (f instanceof TFile) throw new Error(`“${at}” is a file, so snapshots can’t be kept there.`);
		if (!f) await app.vault.createFolder(at).catch((e) => { if (!(app.vault.getAbstractFileByPath(at) instanceof TFolder)) throw e; });
	}
}

/** Refuses what a binder can't have done to it: one in a newer format isn't written in at all, and a "Snapshots"
    folder with notes in it is somebody's chapter, not ours to fill. */
function writable(plugin: BindersPlugin, scene: TFile): Binder {
	const store = plugin.binders, b = store.binderOf(scene);
	if (!b || !isScene(plugin, scene)) throw new Error('Only a note in a binder has snapshots.');
	if (b.problem) throw new Error(`“${b.folder.name}” can’t be changed. ${b.problem}`);
	const there = plugin.app.vault.getAbstractFileByPath(`${b.folder.path}/${SNAPSHOTS}`);
	if (there && !store.snapshotsFolder(b)) throw new Error(`“${SNAPSHOTS}” in “${b.folder.name}” has notes in it, so snapshots can’t be kept there. Move the notes out of it, or rename it.`);
	return b;
}

/** Takes a snapshot of the scene's text as it is on screen now. Returns the snapshot, or the newest one if it already
    holds this very text (nothing is kept twice in a row, unless it's given a name or `always`), or null if there's no
    text. Throws if it couldn't be taken: then nothing was changed. */
export async function takeSnapshot(plugin: BindersPlugin, scene: TFile, title = '', always = false): Promise<{ snapshot: Snapshot; made: boolean } | null> {
	const { app } = plugin, b = writable(plugin, scene), dir = snapshotsPath(b, scene.path);
	await saveOpen(app, [scene]);
	const body = parts(await app.vault.read(scene)).body;
	if (!body.trim()) return null;
	const last = (await snapshotsIn(app, dir))[0];
	if (last && !title && !always && lf(last.body) === lf(body)) return { snapshot: last, made: false };
	await ensureFolder(app, dir);
	const when = new Date(), name = snapshotName(when, title, (n) => !!app.vault.getAbstractFileByPath(`${dir}/${n}.${SNAPSHOT_EXT}`));
	const file = await app.vault.create(`${dir}/${name}.${SNAPSHOT_EXT}`, snapshotFile(scene.path.slice(b.folder.path.length + 1).replace(/\.md$/i, ''), when, body));
	// read back from the disk: the text is in the snapshot, whole, before anything is done to the note
	if (readSnapshot(await app.vault.adapter.read(file.path)).body !== body) throw new Error('The snapshot couldn’t be checked, so nothing was changed.');
	return { snapshot: { file, taken: when.getTime(), title, body }, made: true };
}

/** Puts `next` in place of a scene's text (its properties stay as they are), if the text is still `expect`. In the
    editor the note is open in, as one change that Undo takes back; otherwise in one write. */
async function replaceText(plugin: BindersPlugin, scene: TFile, expect: string, next: string): Promise<void> {
	const { app } = plugin, moved = () => new Error('The note was changed meanwhile, so it was left as it is.');
	const inEditor = (ed: Editor): void => {
		const text = ed.getValue(), p = parts(text);
		if (lf(p.body) !== lf(expect)) throw moved();
		ed.replaceRange(next, ed.offsetToPos(p.front.length), ed.offsetToPos(text.length));
	};
	// the note in a tab of its own, being edited (a reading view has no editor to undo in: it's written below)
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const v = leaf.view;
		if (!(v instanceof MarkdownView) || v.file !== scene || v.getMode() !== 'source') continue;
		inEditor(v.editor);
		await saveTab(v);
		return;
	}
	// its section of a manuscript
	for (const live of liveEditors(scene)) {
		if (!live.editor) continue;
		inEditor(live.editor);
		await live.flush();
		return;
	}
	let ok = false;
	await app.vault.process(scene, (cur) => {
		const p = parts(cur);
		if (lf(p.body) !== lf(expect)) return cur;
		ok = true;
		return (next ? frontFor(p.front) : p.front) + next;
	});
	if (!ok) throw moved();
}

/** "Rewrite": a snapshot of the text as it is; with `blank`, the note is then emptied to start again. Null if the
    note has no text (there's nothing to keep, and nothing to clear). */
export async function rewrite(plugin: BindersPlugin, scene: TFile, blank: boolean, title = ''): Promise<Snapshot | null> {
	const kept = await takeSnapshot(plugin, scene, title);
	if (!kept) return null;
	if (blank) await replaceText(plugin, scene, kept.snapshot.body, '');
	return kept.snapshot;
}

/** Brings a snapshot back: the text as it is now is kept as a snapshot first (unless one holds it already, word for
    word), then the snapshot's text takes its place. */
export async function bringBack(plugin: BindersPlugin, scene: TFile, s: Snapshot): Promise<{ kept: Snapshot | null }> {
	const { app } = plugin, b = writable(plugin, scene);
	// (from the disk, not from a list drawn a while ago)
	const text = readSnapshot(await app.vault.adapter.read(s.file.path)).body;
	await saveOpen(app, [scene]);
	const now = parts(await app.vault.read(scene)).body;
	if (lf(now) === lf(text)) throw new Error('The note already has this text.');
	const have = now.trim() ? (await snapshotsIn(app, snapshotsPath(b, scene.path))).find((o) => lf(o.body) === lf(now)) ?? null : null;
	const kept = have || !now.trim() ? null : (await takeSnapshot(plugin, scene, 'Before bringing back'))?.snapshot ?? null;
	// (what was kept is what's replaced: text typed between the two would be refused, not lost)
	await replaceText(plugin, scene, kept ? kept.body : now, text);
	return { kept };
}

/** A snapshot's new name: its file is renamed, the time it was taken staying at the front. */
export async function nameSnapshot(app: App, s: Snapshot, title: string): Promise<void> {
	const dir = s.file.parent?.path ?? '', at = (n: string) => `${dir}/${n}.${s.file.extension}`;
	const name = snapshotName(new Date(s.taken), title, (n) => { const f = app.vault.getAbstractFileByPath(at(n)); return !!f && f !== s.file; });
	if (name !== s.file.basename) await app.vault.rename(s.file, at(name));
}

/** Moves snapshots from one folder to another: a note renamed or moved takes its snapshots along (the files in its
    folder of them), and so does a folder (the folders in its own: those of the notes in it). A note and a folder can
    share a name, and then share a folder here: each takes only what's its own. Nothing is ever written over: if there
    are snapshots at the new place already (another device moved some, or a note of that name had its own), each
    file moves in beside them, under a name that's free. True if anything moved. */
export async function followSnapshots(app: App, from: string, to: string, what: 'note' | 'folder'): Promise<boolean> {
	const old = app.vault.getAbstractFileByPath(normalizePath(from)), dest = normalizePath(to);
	if (!(old instanceof TFolder) || old.path === dest || dest.startsWith(old.path + '/')) return false;
	const mine = old.children.filter((c) => (what === 'note' ? c instanceof TFile : c instanceof TFolder));
	if (!mine.length) return false;
	const there = app.vault.getAbstractFileByPath(dest);
	if (there instanceof TFile) throw new Error(`“${dest}” is a file.`);
	// all of it is this item's, and nothing is in the way: the folder goes as it is
	if (!there && mine.length === old.children.length) { await ensureFolder(app, dest.slice(0, dest.lastIndexOf('/'))); await app.vault.rename(old, dest); return true; }
	await ensureFolder(app, dest);
	for (const c of mine) {
		if (c instanceof TFolder) {
			// (a folder of the same name there already: what's in this one goes in beside what's in that)
			if (app.vault.getAbstractFileByPath(`${dest}/${c.name}`)) { await followSnapshots(app, c.path, `${dest}/${c.name}`, 'note'); await followSnapshots(app, c.path, `${dest}/${c.name}`, 'folder'); if (!c.children.length) await app.fileManager.trashFile(c).catch(() => { /* it stays, empty */ }); }
			else await app.vault.rename(c, `${dest}/${c.name}`);
		} else if (c instanceof TFile) {
			let name = c.basename;
			for (let n = 2; app.vault.getAbstractFileByPath(`${dest}/${name}.${c.extension}`); n++) name = `${c.basename} (${n})`;
			await app.vault.rename(c, `${dest}/${name}.${c.extension}`);
		}
	}
	// (the folder they left, if it's empty now, goes: it held nothing else)
	if (!old.children.length) await app.fileManager.trashFile(old).catch(() => { /* it stays, empty */ });
	return true;
}

/** Snapshots whose note is gone (deleted, merged into another, moved out of the binder, or renamed where Binders
    couldn't see): each folder of them, by the path the note had. They're kept until the writer deletes them. */
export interface Leftover { dir: TFolder; path: string; count: number }
export function leftovers(plugin: BindersPlugin, binder: Binder): Leftover[] {
	const root = plugin.binders.snapshotsFolder(binder), out: Leftover[] = [];
	if (!root) return out;
	const walk = (dir: TFolder) => {
		const count = dir.children.filter(isSnapshot).length, path = dir.path.slice(root.path.length + 1);
		if (count && !isScene(plugin, plugin.app.vault.getAbstractFileByPath(`${binder.folder.path}/${path}.md`))) out.push({ dir, path, count });
		for (const c of dir.children) if (c instanceof TFolder) walk(c);
	};
	walk(root);
	return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Gives leftover snapshots to a scene: they move in among its own. */
export async function attach(plugin: BindersPlugin, left: Leftover, scene: TFile): Promise<void> {
	const b = writable(plugin, scene);
	await followSnapshots(plugin.app, left.dir.path, snapshotsPath(b, scene.path), 'note');
}
