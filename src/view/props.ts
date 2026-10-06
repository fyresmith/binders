import type { TFile } from 'obsidian';
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

/** Writes card data; only the given keys change. An empty string, a zero or an empty list removes the property. */
export async function writeProps(plugin: BindersPlugin, file: TFile, patch: Partial<SceneProps>): Promise<void> {
	const s = plugin.settings;
	const names: Record<keyof SceneProps, string> = { synopsis: s.synopsisProp, status: s.statusProp, label: s.labelProp, target: s.targetProp };
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(patch) as [keyof SceneProps, unknown][]) {
		out[names[k]] = v === '' || v === 0 || (Array.isArray(v) && !v.length) ? undefined : v;
	}
	await plugin.binders.setProps(file, out);
}

/** The notes kept on a note (a folder's are on its folder note): the writer's own, about it, never part of the
    manuscript and never exported. Text as it was typed, line breaks and all; "" for none. */
export function readNotes(plugin: BindersPlugin, file: TFile): string {
	const v: unknown = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[plugin.settings.notesProp];
	return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('\n') : '';
}

/** Writes them; nothing typed takes the property away. */
export async function writeNotes(plugin: BindersPlugin, file: TFile, notes: string): Promise<void> {
	await plugin.binders.setProps(file, { [plugin.settings.notesProp]: notes.trim() ? notes : undefined });
}
