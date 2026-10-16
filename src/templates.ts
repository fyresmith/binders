import { TFile, TFolder, normalizePath, type App } from 'obsidian';
import type BindersPlugin from './main';
import { DEFAULT_FORMATS, noteText, type Formats } from './template-text';

/* Templates for new notes, as Obsidian's Templates core plugin has them: notes in its templates folder, whose
   {{title}}, {{date}} and {{time}} are filled in as it fills them (template-text.ts). A folder of a binder names one in
   its folder note (`template`, a link); a folder without one takes the nearest folder's above it, up to the binder
   note. Templater's own commands (<% %>) are left as written: Templater, set to run on new files, fills them itself.

   Undocumented parts of Obsidian, quarantined here (AGENTS.md rule 5; docs/dev/internals.md): the core plugin's
   settings (`app.internalPlugins`, its `options`: the folder and the date and time formats) and Templater's
   (`app.plugins.plugins['templater-obsidian'].settings`: its folder, "Trigger on new file creation" and its folder
   templates). Each is looked for and may be missing: without them there is no templates folder, the formats are the
   core plugin's defaults, and nothing waits for Templater. */

export const TEMPLATE_PROP = 'template';

interface CoreTemplates { options?: { folder?: unknown; dateFormat?: unknown; timeFormat?: unknown } }
interface Templater { settings?: { templates_folder?: unknown; trigger_on_file_creation?: unknown; enable_folder_templates?: unknown; folder_templates?: unknown } }

const core = (app: App): CoreTemplates | null => {
	try {
		const ip = (app as unknown as { internalPlugins?: { getEnabledPluginById?(id: string): unknown } }).internalPlugins;
		const p = ip?.getEnabledPluginById?.('templates');
		return p && typeof p === 'object' ? p : null;
	} catch { return null; }
};
const templater = (app: App): Templater | null => {
	try {
		const p = (app as unknown as { plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, unknown> } }).plugins;
		if (p?.enabledPlugins && !p.enabledPlugins.has('templater-obsidian')) return null;
		const t = p?.plugins?.['templater-obsidian'];
		return t && typeof t === 'object' ? t : null;
	} catch { return null; }
};

/** The templates folder's path (no slash at the end), or null when none is set. */
export function templatesFolder(app: App): string | null {
	for (const f of [core(app)?.options?.folder, templater(app)?.settings?.templates_folder]) {
		if (typeof f === 'string' && f.trim() && f.trim() !== '/') return normalizePath(f.trim());
	}
	return null;
}

/** The core plugin's date and time formats (its defaults when unset). */
export function formats(app: App): Formats {
	const o = core(app)?.options;
	const pick = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d);
	return { date: pick(o?.dateFormat, DEFAULT_FORMATS.date), time: pick(o?.timeFormat, DEFAULT_FORMATS.time) };
}

/** The notes in the templates folder that can be a new note's template: not those of a binder kept there (a binder
    template's notes are its own). */
export function noteTemplates(plugin: BindersPlugin): TFile[] {
	const root = templatesFolder(plugin.app), folder = root ? plugin.app.vault.getAbstractFileByPath(root) : null;
	if (!(folder instanceof TFolder)) return [];
	const out: TFile[] = [];
	const walk = (f: TFolder) => {
		for (const c of f.children) {
			if (c instanceof TFolder) { if (!plugin.binders.binderOf(c) && !plugin.binders.all().some((b) => b.note.parent === c)) walk(c); }
			else if (c instanceof TFile && c.extension === 'md' && !plugin.binders.binderOf(c)) out.push(c);
		}
	};
	walk(folder);
	return out.sort((a, b) => a.basename.localeCompare(b.basename, undefined, { numeric: true }));
}

/** A new note's text from a template's raw text: `at` is when its date and time are (ms). */
export function fill(app: App, raw: string, title: string, at: number): string {
	const m = window.moment(at);
	return noteText(raw, title, (f) => m.format(f), formats(app));
}

/** What a folder's own note says of its template: undefined when it says nothing (the folder takes the nearest
    folder's above it), null when it says none (the property there and empty, or a link that leads to no note), or the
    template. */
export function ownTemplate(plugin: BindersPlugin, folder: TFolder): TFile | null | undefined {
	const note = plugin.binders.folderNote(folder);
	const fm = note ? plugin.app.metadataCache.getFileCache(note)?.frontmatter : undefined;
	if (!fm || !(TEMPLATE_PROP in fm)) return undefined;
	const v: unknown = fm[TEMPLATE_PROP];
	if (typeof v !== 'string' || !v.trim()) return null;
	const link = v.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
	const f = plugin.app.metadataCache.getFirstLinkpathDest(link, note?.path ?? '');
	return f instanceof TFile && f.extension === 'md' ? f : null;
}

/** The template new notes in `folder` start from: its own, or the nearest folder's above it in the binder that says
    one (or says none). */
export function templateFor(plugin: BindersPlugin, folder: TFolder): { file: TFile; from: TFolder } | null {
	const top = plugin.binders.binderOf(folder)?.folder;
	if (!top) return null;
	for (let f: TFolder | null = folder; f; f = f === top ? null : f.parent) {
		const t = ownTemplate(plugin, f);
		if (t === null) return null;
		if (t) return { file: t, from: f };
	}
	return null;
}

/** Will Templater write into this note just after it is made? Only with "Trigger on new file creation" on: then it
    fills `<% %>` in what it finds, or, in a note made empty, applies a folder template of its own if one is set for a
    folder the note is in. */
export function templaterWillWrite(app: App, file: TFile, text: string): boolean {
	const s = templater(app)?.settings;
	if (!s || s.trigger_on_file_creation !== true) return false;
	if (text.includes('<%')) return true;
	if (text !== '' || s.enable_folder_templates !== true || !Array.isArray(s.folder_templates)) return false;
	return (s.folder_templates as unknown[]).some((t) => {
		const f = t && typeof t === 'object' ? (t as { folder?: unknown; template?: unknown }) : null;
		if (!f || typeof f.folder !== 'string' || typeof f.template !== 'string' || !f.template) return false;
		const dir = normalizePath(f.folder);
		return dir === '/' || file.path.startsWith(dir + '/');
	});
}
