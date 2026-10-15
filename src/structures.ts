import { TFile, TFolder, normalizePath, stringifyYaml, type App, type TAbstractFile } from 'obsidian';
import type BindersPlugin from './main';
import type { Binder } from './binders';
import { diskList, FORMAT_VERSION } from './model';
import { parts as noteParts } from './scene-text';
import { saveOpen } from './scenes';
import { templatesFolder } from './templates';

/* Binder templates ("structures" in the roadmap; "templates" wherever a writer reads it, since the binder note's
   `structure` is export's): what a new binder can start from. Two are Binders' own, written here as data; the rest are
   the writer's, each a plain binder (or a Longform project) in the templates folder (Obsidian's Templates setting),
   opened, edited, shared and deleted as any binder is. Making a binder from one copies it, its files byte for byte (so
   every property keeps its type), its snapshots and its record of writing left behind. A template made by a newer
   Binders is listed and not copied (AGENTS.md rule 6). Making a binder is one change in its own undo history
   (history/made.ts). */

/** One folder or note of one of Binders' own templates. */
export interface Part { name: string; folder?: boolean; props?: Record<string, unknown>; children?: Part[] }

export interface Structure {
	/** Its name, as listed. */
	name: string;
	/** A line saying what it holds ("3 folders, 7 notes"). */
	note: string;
	/** Binders' own: what is in it, in order (null for the writer's). */
	parts: Part[] | null;
	/** The writer's: the binder, and the folder to copy (a Longform project's is the folder its index note is in). */
	binder: Binder | null;
	folder: TFolder | null;
	/** Why it can't be made from (a newer format), or null. */
	problem: string | null;
}

const prompt = (synopsis: string): Record<string, unknown> => ({ synopsis });

/** Binders' own: kept small (no story structure is prescribed: these are two common starts). A prompt is a synopsis,
    which the writer types over; no text is written in a note. */
export const OWN: Structure[] = [
	{
		name: 'Chapters and scenes', note: '3 chapters of 2 scenes', binder: null, folder: null, problem: null,
		parts: [1, 2, 3].map((c) => ({ name: `Chapter ${c}`, folder: true, children: [1, 2].map((s) => ({ name: `Scene ${(c - 1) * 2 + s}` })) })),
	},
	{
		name: 'Three acts', note: '3 acts, 8 scenes, with a prompt on each', binder: null, folder: null, problem: null,
		parts: [
			{ name: 'Act One', folder: true, props: prompt('The world as it is, who wants what, and what sets the story going.'), children: [
				{ name: 'Opening', props: prompt('Where we are, and whose eyes we see it through.') },
				{ name: 'Inciting incident', props: prompt('What happens that can’t be ignored.') },
				{ name: 'No going back', props: prompt('The choice that commits them to the story.') },
			] },
			{ name: 'Act Two', folder: true, props: prompt('Trying, failing, and learning what the story is really about.'), children: [
				{ name: 'Rising stakes', props: prompt('Each try costs more than the last.') },
				{ name: 'Midpoint', props: prompt('Something turns: a truth learned, a goal changed.') },
				{ name: 'All is lost', props: prompt('The lowest point.') },
			] },
			{ name: 'Act Three', folder: true, props: prompt('What they do with what they learned.'), children: [
				{ name: 'Climax', props: prompt('The last test.') },
				{ name: 'Resolution', props: prompt('The world after.') },
			] },
		],
	},
];

const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;

/** The folder a writer's template is copied from: a binder's own, or the folder a Longform project's index note is in
    (null when its scenes are outside that folder, so a copy couldn't take them). */
function sourceOf(b: Binder): TFolder | null {
	if (b.kind === 'binder') return b.folder;
	const home = b.note.parent;
	if (!home || home.isRoot()) return null;
	return b.folder === home || b.folder.path.startsWith(home.path + '/') ? home : null;
}

/** Every template a new binder can start from: Binders' own, then the writer's (in the templates folder), by name. */
export function structures(plugin: BindersPlugin): Structure[] {
	const root = templatesFolder(plugin.app), saved: Structure[] = [];
	if (root) for (const b of plugin.binders.all()) {
		const folder = sourceOf(b);
		if (!folder || !(folder.path + '/').startsWith(root + '/')) continue;
		const all = plugin.binders.scenes(b.folder).length, folders = b.kind === 'binder' ? countFolders(plugin, b.folder) : 0;
		const note = b.kind === 'longform' ? `A Longform project, ${plural(all, 'scene')}` : [folders ? plural(folders, 'folder') : '', plural(all, 'note')].filter(Boolean).join(', ');
		saved.push({ name: folder.name, note, parts: null, binder: b, folder, problem: b.problem });
	}
	saved.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	return [...OWN, ...saved];
}

function countFolders(plugin: BindersPlugin, folder: TFolder): number {
	let n = 0;
	for (const c of plugin.binders.orderedChildren(folder) ?? []) if (c instanceof TFolder) n += 1 + countFolders(plugin, c);
	return n;
}

const yaml = (props: Record<string, unknown>): string => (Object.keys(props).length ? `---\n${stringifyYaml(props)}---\n` : '');

/** A free name for a new folder in `parent`: "Untitled binder", then "Untitled binder 1"... */
export function freeName(app: App, parent: TFolder, base: string): string {
	const at = (n: string) => normalizePath(`${parent.path}/${n}`);
	let name = base;
	for (let n = 1; app.vault.getAbstractFileByPath(at(name)); n++) name = `${base} ${n}`;
	return name;
}

/** Copies a folder byte for byte to `to`: not its `Snapshots` folder at the top, and with `last` (a binder note) written
    after everything else, so it finds its notes there. `rename`: the note named like the top folder takes the new
    folder's name. `text` false: a note that isn't `keep` keeps its properties and loses its text. */
async function copyTree(app: App, from: TFolder, to: string, o: { last?: TFile | null; text?: boolean; keep?: (f: TFile) => boolean }): Promise<void> {
	const { vault } = app, after: [TFile, string][] = [];
	const copy = async (f: TFolder, dest: string, top: boolean): Promise<void> => {
		await vault.createFolder(dest);
		for (const c of [...f.children] as TAbstractFile[]) {
			if (top && c instanceof TFolder && c.name === 'Snapshots') continue;
			if (c instanceof TFolder) { await copy(c, normalizePath(`${dest}/${c.name}`), false); continue; }
			if (!(c instanceof TFile)) continue;
			// a folder's own note is named like it, so it's the copy's own note too
			const own = c.extension === 'md' && c.basename === f.name, base = own ? dest.split('/').pop() ?? c.basename : c.basename;
			const path = normalizePath(`${dest}/${base}.${c.extension}`);
			if (c === o.last) { after.push([c, path]); continue; }
			await write(c, path);
		}
	};
	const write = async (c: TFile, path: string): Promise<void> => {
		if (o.text !== false || c.extension !== 'md' || o.keep?.(c)) { await vault.createBinary(path, await vault.readBinary(c)); return; }
		// the properties as written (types and all), and no text
		await vault.create(path, noteParts(await vault.read(c)).front);
	};
	await copy(from, to, true);
	for (const [c, path] of after) await write(c, path);
}

/** Makes a new binder named `name` in `parent` from a template (null: an empty one), as one change that Undo takes
    away while nothing in it has changed. Returns its folder. */
export async function makeFrom(plugin: BindersPlugin, parent: TFolder, name: string, s: Structure | null): Promise<TFolder> {
	const { vault } = plugin.app, dest = normalizePath(`${parent.path}/${name}`);
	if (vault.getAbstractFileByPath(dest)) throw new Error(`“${name}” is already taken here.`);
	if (s?.problem) throw new Error(`“${s.name}” can’t be made into a binder. ${s.problem}`);
	if (!s) {
		const folder = await vault.createFolder(dest);
		await plugin.binders.makeBinder(folder);
	} else if (s.binder && s.folder) {
		// (looked at again: it may have changed since the list was made)
		const now = plugin.binders.binderOf(s.binder.folder);
		if (now?.problem) throw new Error(`“${s.name}” can’t be made into a binder. ${now.problem}`);
		await copyTree(plugin.app, s.folder, dest, { last: s.binder.note });
	} else if (s.parts) {
		// one of Binders' own: written from its parts, the binder note last, with the order
		await vault.createFolder(dest);
		const contents: string[] = [];
		const write = async (ps: Part[], at: string, rel: string): Promise<void> => {
			for (const p of ps) {
				const path = normalizePath(`${at}/${p.name}`);
				if (p.folder) {
					await vault.createFolder(path);
					contents.push(`${rel}${p.name}/`);
					if (p.props && Object.keys(p.props).length) await vault.create(normalizePath(`${path}/${p.name}.md`), yaml(p.props));
					await write(p.children ?? [], path, `${rel}${p.name}/`);
				} else {
					contents.push(rel + p.name);
					await vault.create(`${path}.md`, yaml(p.props ?? {}));
				}
			}
		};
		await write(s.parts, dest, '');
		await vault.create(normalizePath(`${dest}/${name}.md`), yaml({ binder: FORMAT_VERSION, contents: diskList(contents) }));
	}
	const folder = vault.getAbstractFileByPath(dest);
	if (!(folder instanceof TFolder)) throw new Error('The binder couldn’t be made.');
	await plugin.binders.recordMade(folder, s ? `New binder “${name}” from “${s.name}”` : `New binder “${name}”`);
	return folder;
}

/** Saves a binder as a template: a copy in the templates folder, named `name`. With `text` false, each note keeps its
    properties and loses its text; the binder note and folder notes are kept whole (they are the binder's own notes). */
export async function saveAs(plugin: BindersPlugin, binder: Binder, name: string, text: boolean): Promise<TFolder> {
	const { vault } = plugin.app, root = templatesFolder(plugin.app);
	if (!root) throw new Error('Choose a templates folder first, in the settings of Obsidian’s Templates core plugin.');
	if (binder.problem) throw new Error(`This binder can’t be saved as a template. ${binder.problem}`);
	const clean = name.replace(/[\\/:]/g, ' ').trim().replace(/^\.+\s*/, '');
	if (!clean) throw new Error('Give the template a name.');
	const source = sourceOf(binder);
	if (!source) throw new Error('This Longform project’s scenes are outside its folder, so it can’t be copied.');
	if (source.path === root || (root + '/').startsWith(source.path + '/')) throw new Error('The templates folder is inside this binder.');
	if (!vault.getAbstractFileByPath(root)) await vault.createFolder(root);
	const dest = normalizePath(`${root}/${clean}`);
	if (vault.getAbstractFileByPath(dest)) throw new Error(`There is already a template named “${clean}”.`);
	// (what is typed and not saved yet is part of the binder as it is)
	await saveOpen(plugin.app, plugin.binders.scenes(binder.folder));
	await plugin.binders.flush();
	const store = plugin.binders;
	await copyTree(plugin.app, source, dest, { last: binder.note, text, keep: (f) => f === binder.note || store.isHiddenNote(f) || store.isRevisionNote(f) });
	const folder = vault.getAbstractFileByPath(dest);
	if (!(folder instanceof TFolder)) throw new Error('The template couldn’t be saved.');
	return folder;
}
