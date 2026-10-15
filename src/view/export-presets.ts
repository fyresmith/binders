import { FuzzySuggestModal, TFile, TFolder, type TAbstractFile } from 'obsidian';
import type BindersPlugin from '../main';
import { KINDS, bookDetails, memory, remember, type Kind, type Part } from '../export/export';
import { EXPORTS_PROP, editPresets, followInExports, readPresets, seeds, takes, type Preset, type PresetEdit } from '../export/presets';
import { trimSize, paperSize } from '../export/pages/geometry';
import { checkFormat, isBinderNote } from '../model';
import { Subset } from './subset';

/* A binder's exports where they meet the vault: the list read from the binder note and written back to it (only its
   `exports`), the one this device last used, and a preset worked out into what export reads: the style, the page, the
   part of the book that goes out and which front and back matter. The window (view/export.ts), "Export again" and
   "Export with..." all work an export out here, so the three never disagree. Pure rules: export/presets.ts. */

const NAMES = Object.fromEntries(KINDS.map((k) => [k.id, k.name])) as Record<Kind, string>;
export const kindSeeds = (): Preset[] => seeds(NAMES);

/** A binder's exports, and why they can't be changed (a Longform project's note is Longform's; a newer format). */
export function presetsOf(plugin: BindersPlugin, folder: TFolder): { list: Preset[]; locked: string | null } {
	const binder = plugin.binders.binderOf(folder);
	if (!binder) return { list: kindSeeds(), locked: 'This isn’t in a binder.' };
	const fm = plugin.app.metadataCache.getFileCache(binder.note)?.frontmatter ?? {};
	const locked = binder.kind === 'longform' ? 'A Longform project keeps no exports of its own: these are the five kinds.' : binder.problem ? 'This binder was made by a newer version of Binders: it is read only.' : null;
	return { list: readPresets(binder.kind === 'binder' ? fm[EXPORTS_PROP] : undefined, kindSeeds()), locked };
}

/** Changes the binder's exports: only the binder note's `exports` is written, from what the note says now. */
export async function editExports(plugin: BindersPlugin, folder: TFolder, op: PresetEdit): Promise<void> {
	const binder = plugin.binders.binderOf(folder);
	const why = presetsOf(plugin, folder).locked;
	if (!binder || why) throw new Error(why ?? 'This isn’t in a binder.');
	await plugin.app.fileManager.processFrontMatter(binder.note, (fm: Record<string, unknown>) => {
		if (!isBinderNote(fm)) throw new Error('Exports are kept in a binder’s own note, and this isn’t one.');
		checkFormat(fm);
		fm[EXPORTS_PROP] = editPresets(fm[EXPORTS_PROP], kindSeeds(), op);
	});
}

/** Something in a binder was renamed or moved: its exports follow (a folder kept as what goes out, a note left out).
    A moment later, so that Obsidian's own link updating, when it is on, has written first; then there is nothing to do. */
export function followExports(plugin: BindersPlugin, f: TAbstractFile, old: string): void {
	window.setTimeout(() => {
		const parent = old.includes('/') ? old.slice(0, old.lastIndexOf('/')) : '';
		const was = parent ? plugin.app.vault.getAbstractFileByPath(parent) : null;
		const binders = new Set([plugin.binders.binderOf(f), was ? plugin.binders.binderOf(was) : null]);
		for (const binder of binders) {
			if (!binder || binder.kind !== 'binder' || binder.problem) continue;
			const root = `${binder.folder.path}/`, note = binder.note;
			const o = {
				folder: f instanceof TFolder && old.startsWith(root) && f.path.startsWith(root) ? [old.slice(root.length), f.path.slice(root.length)] as [string, string] : undefined,
				note: [old.replace(/\.md$/i, ''), f.path.replace(/\.md$/i, '')] as [string, string],
				leads: (link: string) => !!plugin.app.metadataCache.getFirstLinkpathDest(link, note.path),
			};
			if (!followInExports(plugin.app.metadataCache.getFileCache(note)?.frontmatter?.[EXPORTS_PROP], o)) continue;
			void plugin.app.fileManager.processFrontMatter(note, (fm: Record<string, unknown>) => {
				if (!isBinderNote(fm)) return;
				checkFormat(fm);
				const out = followInExports(fm[EXPORTS_PROP], o);
				if (out) fm[EXPORTS_PROP] = out;
			}).catch(() => { /* a binder that can't be written: the export says what it can't find */ });
		}
	}, 400);
}

// ---- which one this device used last ----

/** The export of a folder this device last chose, by its name (kept with the device's places, not in the vault). */
export function lastPreset(plugin: BindersPlugin, folder: TFolder): string | null {
	const name = memory(plugin).presets[folder.path];
	return typeof name === 'string' ? name : null;
}
export function notePreset(plugin: BindersPlugin, folder: TFolder, name: string): void {
	if (lastPreset(plugin, folder) !== name) remember(plugin, (m) => { m.presets[folder.path] = name; });
}

// ---- a preset, worked out ----

/** What a place to save is remembered for: the kind, for the export named for it; the kind and the name for another,
    so "Submission" and "Critique group" don't share a file. */
export const placeOf = (p: Preset): string => (p.name === NAMES[p.kind] ? p.kind : `${p.kind}/${p.name}`);
/** The file's name: the book's title, and the export's name when it isn't the kind's ("The Lighthouse (Kindle)"). */
export const fileOf = (title: string, p: Preset): string => (p.name === NAMES[p.kind] ? title : `${title} (${p.name})`);

/** A link in "leave out" as the note it leads to (its path without `.md`), followed as Obsidian follows it from the
    binder note: a short link and a full one are the same note. */
function resolve(plugin: BindersPlugin, folder: TFolder, link: string): string {
	const from = plugin.binders.binderOf(folder)?.note.path ?? '', f = plugin.app.metadataCache.getFirstLinkpathDest(link, from);
	return f ? noteKey(f.path) : link;
}

/** A note's key in a preset's "leave out": its path without `.md`, as its link is written. */
export const noteKey = (path: string): string => path.replace(/\.md$/i, '');

export interface Worked {
	preset: Preset;
	style: string;
	/** A paperback's trim size, a manuscript's file and paper. */
	page: string;
	file: 'docx' | 'pdf';
	paper: string;
	/** The front and back matter a book takes by itself: a manuscript none unless the vault says, a book all. */
	matterByDefault: boolean;
	matter: (path: string) => boolean;
	part: Part;
	/** What goes out, in a few words, when it isn't the whole book ("Part Two", "Mara’s chapters"); "" for the whole. */
	scope: string;
	/** Why nothing can go out (a folder or a filter that is gone), or null. */
	problem: string | null;
}

/** A preset as export reads it. `selection`: the cards chosen as the window opened, when the writer has picked them
    for this export (never kept in the preset). */
export function work(plugin: BindersPlugin, folder: TFolder, p: Preset, selection: TAbstractFile[] | null = null): Worked {
	const s = plugin.settings;
	let d;
	try { d = bookDetails(plugin, folder).details; } catch { d = null; }
	const book = p.kind === 'ebook' || p.kind === 'paperback';
	const style = book ? plugin.styles.get(p.style || d?.bookStyle || '', 'book').name : plugin.styles.get(p.style || d?.manuscriptStyle || s.exportStyle, 'manuscript').name;
	const matterByDefault = p.kind !== 'manuscript' || s.exportMatter;
	const w: Worked = {
		preset: p, style,
		page: trimSize(p.page || d?.pageSize || '').id,
		file: p.file || s.exportFile, paper: paperSize(p.paper || s.exportPaper).id,
		matterByDefault,
		matter: (path) => takes(p, noteKey(path), matterByDefault, (link) => resolve(plugin, folder, link)),
		part: { made: (page) => takes(p, page, true), isbn: book ? p.isbn : '' },
		scope: '', problem: null,
	};
	const binder = plugin.binders.binderOf(folder);
	if (selection?.length) {
		const paths = selection.map((f) => f.path);
		w.part.keep = (path) => paths.some((q) => path === q || path.startsWith(`${q}/`));
		w.part.fromOne = p.fromOne;
		w.scope = `${selection.length.toLocaleString()} selected`;
	} else if (p.scope.kind === 'folder') {
		// (a folder is kept by its path in the binder, so the binder can be renamed or moved)
		const path = `${binder?.folder.path ?? ''}/${p.scope.path}`.replace(/^\/+/, ''), at = plugin.app.vault.getAbstractFileByPath(path);
		w.part.keep = (q) => q.startsWith(`${path}/`);
		w.part.fromOne = p.fromOne;
		w.scope = at instanceof TFolder ? at.name : path.split('/').pop() ?? path;
		if (!(at instanceof TFolder)) w.problem = `The folder “${w.scope}” isn’t in the binder any more. Choose what goes out.`;
	} else if (p.scope.kind === 'filter' && binder) {
		const name = p.scope.name, def = plugin.binders.savedFilters(binder).find((f) => f.name?.toLowerCase() === name.toLowerCase());
		w.scope = name;
		w.part.fromOne = p.fromOne;
		if (!def) { w.part.keep = () => false; w.problem = `“${name}” isn’t one of this binder’s saved filters any more. Choose what goes out.`; }
		else {
			const sub = new Subset(plugin, () => plugin.binders.scenes(binder.folder), () => null);
			sub.set(def);
			w.part.keep = (path) => { const f = plugin.app.vault.getAbstractFileByPath(path); return f instanceof TFile && sub.matches(f); };
		}
	}
	return w;
}

/** "Export with...": the binder's exports, to choose one; it opens in the window. */
export class PresetSuggest extends FuzzySuggestModal<Preset> {
	constructor(plugin: BindersPlugin, private folder: TFolder, private pick: (p: Preset) => void) {
		super(plugin.app);
		this.list = presetsOf(plugin, folder).list;
		this.setPlaceholder(`Export “${folder.name}” as...`);
	}
	private list: Preset[];
	getItems(): Preset[] { return this.list; }
	getItemText(p: Preset): string { return p.name; }
	onChooseItem(p: Preset): void { this.pick(p); }
}
