import { TFile, TFolder, parseFrontMatterTags, type TAbstractFile } from 'obsidian';
import { zipSync } from 'fflate';
import type BindersPlugin from '../../main';
import { isExported, isNote, saveOpen } from '../../scenes';
import { parts } from '../../scene-text';
import { snapshotsOf } from '../../snapshots';
import { readLabel } from '../../view/labels';
import { readTarget } from '../../view/outliner-data';
import { sameStamp, type Desktop } from '../desktop';
import { EXPORT_AS, exportsFolder, fileName, memory, placeFor, remember, save, setPlace, shownPath, type Saved } from '../export';
import { needs } from '../markdown';
import type { Picture } from '../model';
import { isPictureName, pictureOf } from '../picture';
import { readStructure } from '../roles';
import { scrivFiles, writeScriv, type ScrivItem, type ScrivOptions, type ScrivProject, type ScrivSource } from './project';
import { readText } from './text';

/* The Scrivener project where it meets the vault: a binder (or a folder of one) read as the writer wants it, and the
   project put where it goes: a `.scriv` folder on a computer, written whole or not at all; a zip of one in the
   vault's Exports folder on a phone or tablet, and wherever a folder can't be written. It reads notes and snapshots
   and changes none. */

/** Properties that are no custom metadata: Binders' own, and Obsidian's. */
const NOT_FIELDS = ['tags', 'tag', 'export', 'compile', EXPORT_AS, 'binder', 'contents', 'longform', 'position', 'cssclasses', 'cssclass'];
const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

export interface ScrivChoices { outside: boolean; snapshots: boolean }

/** A folder of a binder, read and written as a Scrivener project (in memory: nothing is saved yet). */
export async function readScriv(plugin: BindersPlugin, folder: TFolder, o: ScrivChoices): Promise<{ project: ScrivProject; source: ScrivSource }> {
	const { app, binders: store, settings: s } = plugin, binder = store.binderOf(folder);
	if (!binder) throw new Error(`“${folder.name}” isn’t in a binder.`);
	const fm = (f: TFile | null): Record<string, unknown> => (f ? app.metadataCache.getFileCache(f)?.frontmatter ?? {} : {});
	const body = async (f: TFile | null): Promise<string> => (f ? parts(await app.vault.cachedRead(f)).body : '');
	const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
	const own = new Set([s.synopsisProp, s.statusProp, s.labelProp, s.targetProp, s.notesProp, ...NOT_FIELDS]), names = s.labels.map((l) => l.name);
	const card = (f: TFile | null, fields = true): Partial<ScrivItem> => {
		const p = fm(f), props: Record<string, string> = {};
		if (fields) for (const [k, v] of Object.entries(p)) {
			if (own.has(k) || v == null) continue;
			props[k] = Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : typeof v === 'string' ? v : JSON.stringify(v);
		}
		return {
			synopsis: said(p[s.synopsisProp]), status: said(p[s.statusProp]), label: readLabel(p[s.labelProp], names), target: readTarget(p[s.targetProp]),
			tags: (parseFrontMatterTags(p) ?? []).map((t) => t.replace(/^#/, '')), notes: said(p[s.notesProp]), props,
			created: f?.stat.ctime, modified: f?.stat.mtime,
		};
	};
	await saveOpen(app, store.scenes(folder));
	const item = async (f: TAbstractFile): Promise<ScrivItem | null> => {
		if (f instanceof TFolder) {
			const children: ScrivItem[] = [], note = store.folderNote(f);
			for (const c of store.orderedChildren(f) ?? []) { const it = await item(c); if (it) children.push(it); }
			return { kind: 'folder', name: f.name, path: f.path, included: isExported(plugin, f), exportAs: fm(note)[EXPORT_AS], text: await body(note), ...card(note), children };
		}
		if (!isNote(f)) return null;
		const snapshots = o.snapshots ? (await snapshotsOf(plugin, f)).map((x) => ({ title: x.title, when: x.taken, text: x.body })) : [];
		return { kind: 'note', name: f.basename, path: f.path, included: isExported(plugin, f), exportAs: fm(f)[EXPORT_AS], text: await body(f), ...card(f), snapshots };
	};
	const items: ScrivItem[] = [], longform = binder.kind === 'longform', scenes = longform ? store.scenes(folder) : [];
	for (const c of longform ? scenes : store.orderedChildren(folder) ?? []) { const it = await item(c); if (it) items.push(it); }
	// (a Longform project's folder holds notes that are no scenes of it: they are outside the manuscript)
	const loose: ScrivItem[] = [];
	if (longform) for (const c of [...folder.children].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))) {
		if (!isNote(c) || c === binder.note || scenes.includes(c)) continue;
		loose.push({ kind: 'note', name: c.basename, path: c.path, included: false, text: await body(c), ...card(c) });
	}
	const top = store.folderNote(folder), bookNote = fm(binder.note), language = said(bookNote.language);
	const source: ScrivSource = {
		name: folder.name, path: folder.path, items, loose, flat: longform, language: language || 'en',
		structure: readStructure(bookNote.structure), labels: s.labels, statuses: s.statuses,
		note: top && !longform ? { kind: 'note', name: folder.name, path: top.path, included: true, text: await body(top), ...card(top, false) } : undefined,
	};

	// the pictures the notes show are found as Obsidian finds them, and read before the project is put together
	const found = new Map<string, { picture: Picture; name: string } | null>(), key = (name: string, from: string) => `${from}\n${name}`;
	const look = async (list: readonly ScrivItem[]): Promise<void> => {
		for (const it of list) {
			await look(it.children ?? []);
			const n = needs(readText(it.text ?? ''));
			for (const target of [...n.embeds, ...n.images]) {
				const name = target.split('|')[0].trim(), k = key(name, it.path);
				if (found.has(k)) continue;
				const file = /^[a-z][\w+.-]*:/i.test(name) ? null : app.metadataCache.getFirstLinkpathDest(safeDecode(name.split('#')[0]), it.path);
				let got: { picture: Picture; name: string } | null = null;
				try { if (file && isPictureName(file.name)) { const picture = pictureOf(new Uint8Array(await app.vault.readBinary(file))); got = picture ? { picture, name: file.path } : null; } } catch { got = null; }
				found.set(k, got);
			}
		}
	};
	await look([...items, ...loose, ...(source.note ? [source.note] : [])]);
	const options: ScrivOptions = {
		...o, version: plugin.manifest.version,
		picture: (src, from) => found.get(key(src, from)) ?? null,
		link: (to, from) => app.metadataCache.getFirstLinkpathDest(safeDecode(to.split('#')[0]), from)?.path ?? null,
	};
	return { project: writeScriv(source, options), source };
}

/** A project's name on the disk: the binder's, without what a file name can't have. */
export const projectName = (folder: TFolder): string => fileName(folder.name);

export const SCRIV_MIME = 'application/zip';
/** A project as one file: its folder, zipped. What a phone gets, and a computer where a folder can't be written. */
export function zipped(project: ScrivProject, name: string): Uint8Array {
	const zip: Record<string, Uint8Array> = {};
	for (const [path, data] of scrivFiles(project, name)) zip[`${name}.scriv/${path}`] = data;
	return zipSync(zip);
}

export interface ScrivSave {
	folder: TFolder;
	ask?: boolean;
	/** Asked before a file in the vault that export didn't write is replaced (the zip). */
	replace(shown: string): Promise<boolean>;
	/** A project is at the place chosen that isn't as export left it (it has been opened in Scrivener, or it was
	    never export's): it is never written over. Asked whether to save beside it under this other name instead. */
	beside(there: string, free: string): Promise<boolean>;
}

/** Saves a project. On a computer: a `.scriv` folder where the save dialog says (or where it went last time, when
    that is remembered), written whole or not at all, and never over a project that isn't still what export left.
    Anywhere else: zipped into the vault's Exports folder. Null if the writer backed out. `zip`: the file, when it was
    zipped (a phone hands it to the share sheet). */
export async function saveScriv(plugin: BindersPlugin, host: Desktop | null, project: ScrivProject, o: ScrivSave): Promise<(Saved & { zip?: Uint8Array; name: string }) | null> {
	const name = projectName(o.folder), writeFolder = host?.writeFolder, folderStamp = host?.folderStamp;
	if (!host || !writeFolder || !folderStamp) {
		const zip = zipped(project, name), saved = await save(plugin, null, zip, { folder: o.folder, kind: 'scrivener', name: `${name}.scriv`, extension: 'zip', type: 'Zipped Scrivener project', replace: (shown) => o.replace(shown) });
		return saved && { ...saved, zip, name: `${name}.scriv.zip` };
	}
	const kept = o.ask ? null : placeFor(plugin, o.folder, 'scrivener');
	let path = kept;
	if (!path) {
		// the dialog starts in the Exports folder: made for it, and taken away again if the project goes elsewhere
		const start = host.join(host.base, ...exportsFolder(plugin, o.folder).split('/')), made = await host.mkdir(start).catch(() => false);
		try { path = await host.pick(host.join(start, `${name}.scriv`), 'Scrivener project', 'scriv'); }
		finally { if (made) await host.rmdir(start); }
		if (!path) return null;
	}
	// never into a project that isn't what export left there: the first free name beside it instead, if the writer agrees
	const ours = async (p: string) => { const there = await folderStamp(p); return !there || sameStamp(memory(plugin).written[p], there); };
	if (!(await ours(path))) {
		const stem = path.replace(/\.scriv$/i, '');
		let free = '';
		for (let n = 2; !free; n++) if (await ours(`${stem} ${n}.scriv`)) free = `${stem} ${n}.scriv`;
		if (!(await o.beside(host.basename(path), host.basename(free)))) return null;
		path = free;
	}
	await host.mkdir(host.dirname(path));
	const at = path, stamp = await writeFolder(at, scrivFiles(project, host.basename(at).replace(/\.scriv$/i, '')));
	remember(plugin, (m) => { delete m.written[at]; m.written[at] = stamp; });
	if (kept !== null || placeFor(plugin, o.folder, 'scrivener')) setPlace(plugin, o.folder, 'scrivener', kept ?? at);
	return { where: 'disk', path: at, shown: shownPath(host, at), name: host.basename(at) };
}
