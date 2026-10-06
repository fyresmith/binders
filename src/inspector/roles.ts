import { TFile, TFolder, type TAbstractFile } from 'obsidian';
import type { Binder } from '../binders';
import { EXPORT_AS } from '../export/export';
import type { Role } from '../export/model';
import { assignRoles, guessStructure, readRole, readStructure, type SourceItem } from '../export/roles';
import type BindersPlugin from '../main';
import { COMPILE_PROP, EXPORT_PROP, isNote } from '../scenes';

/* The part each note and folder of a binder plays when it is exported, as the inspector says it: what export itself
   would make of it (export/roles.ts, the one rule), read from the properties as they are now. No note's text is read:
   a role doesn't depend on it. */

/** A role as the inspector names it. */
export const ROLE_NAMES: Record<Role, string> = { part: 'Part', chapter: 'Chapter', scene: 'Scene', front: 'Front matter', back: 'Back matter', group: 'Group', out: 'Left out' };

/** What an item is in the book: the role it has, the one the rule alone would give it, and the one written on it by
    hand (`export-as`), if any. */
export interface Played { role: Role; auto: Role; said: Role | null }

/** Every item of a binder by its path, with its role. */
export function rolesOf(plugin: BindersPlugin, binder: Binder): Map<string, Played> {
	const { app, binders: store } = plugin;
	const fm = (f: TFile | null): Record<string, unknown> => (f ? app.metadataCache.getFileCache(f)?.frontmatter ?? {} : {});
	// (whether each is exported is worked out on the way down, a folder's switch standing for all it holds, as
	// `isExported` works it out on the way up: asked of every note of a long book, that way is the slow one)
	const own = (f: TFile | null): boolean => { const p = fm(f); return p[EXPORT_PROP] !== false && p[COMPILE_PROP] !== false; };
	const item = (f: TAbstractFile, within: boolean): SourceItem | null => {
		if (f instanceof TFolder) {
			const included = within && own(store.folderNote(f)), children: SourceItem[] = [];
			for (const c of store.orderedChildren(f) ?? []) { const it = item(c, included); if (it) children.push(it); }
			return { kind: 'folder', name: f.name, path: f.path, included, exportAs: fm(store.folderNote(f))[EXPORT_AS], children };
		}
		return isNote(f) ? { kind: 'note', name: f.basename, path: f.path, included: within && own(f), exportAs: fm(f)[EXPORT_AS], text: '' } : null;
	};
	const items: SourceItem[] = [];
	// (a Longform project is its scenes in order, as export reads it)
	for (const c of binder.kind === 'longform' ? store.scenes(binder.folder) : store.orderedChildren(binder.folder) ?? []) { const it = item(c, true); if (it) items.push(it); }
	const out = new Map<string, Played>();
	const { placed } = assignRoles(items, readStructure(fm(binder.note).structure) ?? guessStructure(items));
	for (const p of placed) out.set(p.item.path, { role: p.role, auto: p.auto, said: readRole(p.item.exportAs) });
	return out;
}

let kept: { at: string; of: Map<string, Played> } | null = null;
/** The same, kept until something a role could depend on changes (the inspector's own count of that): asked for by
    every row of an outliner, it is worked out once. */
export function playedIn(plugin: BindersPlugin, binder: Binder): Map<string, Played> {
	const at = `${binder.note.path}|${plugin.inspect.rev}`;
	if (kept?.at !== at) kept = { at, of: rolesOf(plugin, binder) };
	return kept.of;
}
