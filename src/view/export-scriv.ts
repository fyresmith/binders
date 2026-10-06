import { Platform, Setting, type TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import type { Desktop } from '../export/desktop';
import { share, type Saved } from '../export/export';
import type { ScrivProject } from '../export/scriv/project';
import { SCRIV_MIME, projectName, readScriv, saveScriv } from '../export/scriv/vault';
import { display } from './labels';
import { confirm } from './modals';

/* The Export window's Scrivener project: its two switches, what its bar and its foot say, its preview (the binder
   as Scrivener will list it, and what is carried across: a list, not pages) and its export. The window itself is
   view/export.ts, which asks here for each; the design is docs/export.md, "The Scrivener project". */

const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** The kind's two choices. */
export function scrivChoices(el: HTMLElement, plugin: BindersPlugin, changed: () => void): void {
	const s = plugin.settings;
	const toggle = (key: string, name: string, on: boolean, set: (v: boolean) => void) => new Setting(el).setName(name).addToggle((t) => { t.setValue(on).onChange((v) => { set(v); changed(); }); t.toggleEl.dataset.bindersKey = key; });
	toggle('outside', 'Notes outside the manuscript', s.exportOutside, (v) => { s.exportOutside = v; });
	toggle('snapshots', 'Snapshots', s.exportSnapshots, (v) => { s.exportSnapshots = v; });
}

/** What the bar says beside the kind's name. */
export const scrivDetail = (p: ScrivProject | null): string => (p ? `${n(p.documents, 'document')} · ${n(p.folders, 'folder')}` : '');

/** The file's name where the window says where it goes: a folder on a computer, a zip anywhere else. */
export const scrivFile = (folder: TFolder, host: Desktop | null): string => `${projectName(folder)}.scriv${host?.writeFolder ? '' : '.zip'}`;

/** The preview: the project's binder, and under it what is carried across. */
export function drawScriv(el: HTMLElement, p: ScrivProject | null, o: { outside: boolean; open(path: string): void }): void {
	const stage = el.createDiv({ cls: 'binders-export-stage' });
	if (!p) { stage.createDiv({ cls: 'binders-export-none', text: 'Reading the notes…' }); return; }
	const scroll = stage.createDiv({ cls: 'binders-export-scroll', attr: { tabindex: '0', role: 'region', 'aria-label': 'The project’s binder' } });
	const list = scroll.createDiv({ cls: 'binders-export-outline binders-export-binder nav-files-container', attr: { role: 'list', 'aria-label': 'The binder as Scrivener will list it' } });
	for (const r of p.rows) {
		const row = list.createDiv({ cls: 'tree-item nav-file', attr: { role: 'listitem' } }), status = r.status ? display(r.status) : '';
		const what = r.kind === 'root' ? '' : r.kind === 'folder' ? ', a folder' : r.kind === 'image' ? ', a picture' : '';
		const self = row.createDiv({ cls: 'tree-item-self nav-file-title binders-export-row', attr: { 'aria-label': `${r.title}${what}${status ? `, ${status}` : ''}${r.included ? '' : ', not included in compile'}` } });
		self.setCssProps({ '--binders-export-depth': String(r.depth) });
		self.toggleClass('binders-export-out', !r.included);
		self.toggleClass('binders-export-root', r.kind === 'root');
		self.createDiv({ cls: 'tree-item-inner nav-file-title-content', text: r.title });
		if (status) self.createDiv({ cls: 'nav-file-tag', text: status });
		if (r.kind === 'text' && r.path) {
			self.addClass('is-clickable');
			self.setAttrs({ tabindex: '0', role: 'button' });
			self.addEventListener('click', () => o.open(r.path));
			self.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.open(r.path); } });
		}
	}
	const kept = p.warnings.length, snaps = p.snapshots ? `, and ${n(p.snapshots, 'snapshot')}` : '';
	stage.createDiv({ cls: 'binders-export-caption', text: `Carried across: the order, synopses, labels and their colors, statuses, targets, “Include in export”${snaps}. Text becomes rich text: italics, bold, headings, lists, links, footnotes and comments are kept, and what rich text has no match for stays as it is typed${kept ? ` (${n(kept, 'place')}, listed beside)` : ''}.${o.outside ? '' : ' The binder note’s text is left behind.'}` });
}

/** Export: the binder read afresh, the project made, and put where it goes. Null if the writer backed out. */
export async function exportScriv(plugin: BindersPlugin, host: Desktop | null, folder: TFolder, o: { ask: boolean; say(doing: string): void; cancelled(): boolean; made(p: ScrivProject): void }): Promise<Saved | null> {
	const s = plugin.settings;
	const { project } = await readScriv(plugin, folder, { outside: s.exportOutside, snapshots: s.exportSnapshots });
	if (o.cancelled()) return null;
	o.made(project);
	o.say('Saving…');
	// (a breath, so the word above is on screen before a long project is written)
	await new Promise((r) => window.setTimeout(r, 0));
	const saved = await saveScriv(plugin, host, project, {
		folder, ask: o.ask,
		replace: (shown) => confirm(plugin.app, { title: 'Replace this file', text: `“${shown}” is already there, and isn’t a file this export made (or it has been changed since). Replace it?`, cta: 'Replace' }),
		beside: (there, free) => confirm(plugin.app, { title: 'Save beside it', text: `“${there}” has been opened or changed since it was exported, or wasn’t made by this export. Export never writes into such a project: what was done to it in Scrivener would be lost. Save this one beside it, as “${free}”?`, cta: `Save as “${free}”` }),
	});
	if (saved?.zip && saved.where === 'vault' && Platform.isMobile) await share(saved.zip, saved.name, SCRIV_MIME);
	return saved;
}
