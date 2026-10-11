import { TFile, TFolder, type TAbstractFile } from 'obsidian';
import { EXPORT_AS } from '../export/export';
import type { Role } from '../export/model';
import { writeRole } from '../export/roles';
import { COMPILE_PROP, EXPORT_PROP } from '../scenes';
import type BindersPlugin from '../main';
import { canonical, readLabel } from './labels';
import { readTarget } from './outliner-data';
import type { SceneProps } from './mode';

/* A note's card data, read and written under the property names in settings: the one way, for the binder view and
   for the inspector beside it. */

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : '');

/** Reads a note's card data from its properties. */
export function readProps(plugin: BindersPlugin, file: TFile): SceneProps {
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const s = plugin.settings;
	return {
		synopsis: text(fm[s.synopsisProp]),
		// as settings spell them, whatever case the note has them in
		status: canonical(text(fm[s.statusProp]), s.statuses),
		label: readLabel(fm[s.labelProp], s.labels.map((l) => l.name)),
		target: readTarget(fm[s.targetProp]),
	};
}

/** What a property is called to the writer, in a sentence about changing it ("the synopsis of “Arrival”"). */
function noun(plugin: BindersPlugin, key: string): string {
	const s = plugin.settings;
	return key === s.synopsisProp ? 'synopsis' : key === s.statusProp ? 'status' : key === s.labelProp ? 'label' : key === s.targetProp ? 'word count target' : key === s.notesProp ? 'notes'
		: key === EXPORT_AS ? '“Export as”' : key === EXPORT_PROP || key === COMPILE_PROP ? 'export setting' : `“${key}” property`;
}

/** How a change to properties is told: "Set status of “Arrival”", "Leave 3 items out of export". */
function describe(plugin: BindersPlugin, writes: { file: TFile; patch: Record<string, unknown> }[]): { label: string; what: Record<string, string> } {
	const files = [...new Set(writes.map((w) => w.file))], keys = [...new Set(writes.flatMap((w) => Object.keys(w.patch)))];
	const name = (f: TFile) => (f.parent && f.basename === f.parent.name ? f.parent.name : f.basename);
	const subject = files.length === 1 ? `“${name(files[0])}”` : `${files.length} items`;
	const what = Object.fromEntries(keys.map((k) => [k, noun(plugin, k)]));
	const values = writes.flatMap((w) => Object.entries(w.patch));
	if (keys.every((k) => k === EXPORT_PROP || k === COMPILE_PROP)) return { label: values.some(([, v]) => v === false) ? `Leave ${subject} out of export` : `Include ${subject} in export`, what };
	const nouns = [...new Set(Object.values(what))];
	const verb = values.every(([, v]) => v === undefined) ? 'Clear' : keys.every((k) => k === plugin.settings.synopsisProp || k === plugin.settings.notesProp) ? 'Edit' : 'Set';
	return { label: nouns.length === 1 ? `${verb} ${nouns[0]} of ${subject}` : `Change ${nouns.join(' and ')} of ${subject}`, what };
}

/** Writes properties of notes by the names they have in the notes, as one change that "Undo" takes back (see
    `BinderStore.setByHand`). An undefined value takes the property away. */
export async function writeKeys(plugin: BindersPlugin, writes: { file: TFile; patch: Record<string, unknown> }[], label?: string): Promise<void> {
	const real = writes.filter((w) => Object.keys(w.patch).length);
	if (!real.length) return;
	const d = describe(plugin, real);
	await plugin.binders.setByHand(label ?? d.label, real.map((w) => ({ note: w.file, patch: w.patch })), d.what);
}

/** Writes card data of several notes as one change; only the given keys change. An empty string, a zero or an empty
    list removes the property. */
export async function writeBatch(plugin: BindersPlugin, writes: { file: TFile; patch: Partial<SceneProps> }[]): Promise<void> {
	const s = plugin.settings;
	const names: Record<keyof SceneProps, string> = { synopsis: s.synopsisProp, status: s.statusProp, label: s.labelProp, target: s.targetProp };
	await writeKeys(plugin, writes.map((w) => {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(w.patch) as [keyof SceneProps, unknown][]) out[names[k]] = v === '' || v === 0 || (Array.isArray(v) && !v.length) ? undefined : v;
		return { file: w.file, patch: out };
	}));
}

/** Writes card data; only the given keys change. An empty string, a zero or an empty list removes the property. */
export function writeProps(plugin: BindersPlugin, file: TFile, patch: Partial<SceneProps>): Promise<void> { return writeBatch(plugin, [{ file, patch }]); }

/** The notes kept on a note (a folder's are on its folder note): the writer's own, about it, never part of the
    manuscript and never exported. Text as it was typed, line breaks and all; "" for none. */
export function readNotes(plugin: BindersPlugin, file: TFile): string {
	const v: unknown = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[plugin.settings.notesProp];
	return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('\n') : '';
}

/** Writes them; nothing typed takes the property away. */
export async function writeNotes(plugin: BindersPlugin, file: TFile, notes: string): Promise<void> {
	await writeKeys(plugin, [{ file, patch: { [plugin.settings.notesProp]: notes.trim() ? notes : undefined } }]);
}

/** What "Export as" can say: a role, `auto` (what the binder's shape makes it), or `out` (left out of export). */
export type ExportAs = Exclude<Role, 'group' | 'out'> | 'auto' | 'out';

/** "Export as", written: the one way, for the inspector's row, a card's and a row's menu, the outliner's column and
    the Export window's Contents. A role is `export-as` on the note (or in the folder's note, made if it has none);
    `auto` takes it away; `out` is `export: false`. With `include`, choosing a role or `auto` also puts an item that
    was left out back in (the menus, where "Leave out" is one of the choices; the inspector has a box of its own for
    that). Only these properties change, never a note's text. */
export async function writeExportAs(plugin: BindersPlugin, items: readonly TAbstractFile[], as: ExportAs, include = true): Promise<void> {
	const store = plugin.binders, writes: { file: TFile; patch: Record<string, unknown> }[] = [];
	for (const f of items) {
		// (a folder with no folder note has nothing to take away: one isn't made to hold nothing)
		const makes = as !== 'auto', note = f instanceof TFolder ? (makes ? await store.ensureFolderNote(f) : store.folderNote(f)) : f instanceof TFile ? f : null;
		if (!note) continue;
		const fm = plugin.app.metadataCache.getFileCache(note)?.frontmatter ?? {}, patch: Record<string, unknown> = {};
		if (as === 'out') patch[EXPORT_PROP] = false;
		else {
			patch[EXPORT_AS] = as === 'auto' ? undefined : writeRole(as);
			if (include && (fm[EXPORT_PROP] === false || fm[COMPILE_PROP] === false)) { patch[EXPORT_PROP] = undefined; patch[COMPILE_PROP] = undefined; }
		}
		if (Object.keys(patch).some((k) => (patch[k] === undefined ? k in fm : fm[k] !== patch[k]))) writes.push({ file: note, patch });
	}
	await writeKeys(plugin, writes);
}
