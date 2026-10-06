import { Notice, TFolder, type Menu, type TAbstractFile } from 'obsidian';
import type { Binder } from '../binders';
import { ROLES } from '../export/model';
import { ROLE_NAMES, playedIn, type Played } from '../inspector/roles';
import type BindersPlugin from '../main';
import { writeExportAs, type ExportAs } from './props';

/* "Export as": the part a note or folder plays in the book, overruled by hand. One menu, wherever it is offered (a
   card's and a row's menu, the outliner's column, the Export window's Contents): Automatic, with what that comes to,
   then the roles, then Leave out. Everything it does is one call to the one write path (props.ts). */

/** What an item is in the book, as a few words: "Chapter", and whether that is Binders' reading of the binder's
    shape (`auto`) or was said by hand. */
export function saidRole(p: Played | null | undefined): { text: string; auto: boolean } {
	if (!p) return { text: '', auto: false };
	return { text: ROLE_NAMES[p.role], auto: p.role !== 'out' && !p.said };
}

/** Fills a menu with "Export as" for these items of a binder. `done`: after a choice was written. */
export function exportAsItems(plugin: BindersPlugin, menu: Menu, binder: Binder, items: readonly TAbstractFile[], o: { readOnly?: boolean; section?: string; done?: () => void } = {}): void {
	const all = playedIn(plugin, binder), played = items.map((f) => all.get(f.path) ?? null), first = played[0];
	const same = !!first && played.every((p) => p && p.said === first.said && p.role === first.role && p.auto === first.auto);
	const folders = items.some((f) => f instanceof TFolder), out = played.every((p) => p?.role === 'out'), ro = !!o.readOnly || !!binder.problem;
	const set = (as: ExportAs): void => { void writeExportAs(plugin, items, as).then(() => { o.done?.(); }, (e) => { new Notice(e instanceof Error ? e.message : String(e)); }); };
	const section = o.section ?? 'export-as';
	const auto = same && first && first.auto !== 'out' ? `Automatic: ${ROLE_NAMES[first.auto].toLowerCase()}` : 'Automatic';
	menu.addItem((i) => i.setSection(section).setTitle(auto).setChecked(!out && played.every((p) => !p?.said)).setDisabled(ro).onClick(() => set('auto')));
	// (a folder can't be a scene: it holds them)
	for (const r of ROLES) if (!(folders && r === 'scene')) menu.addItem((i) => i.setSection(`${section}-roles`).setTitle(ROLE_NAMES[r]).setChecked(!out && same && first?.said === r).setDisabled(ro).onClick(() => set(r)));
	menu.addItem((i) => i.setSection(`${section}-out`).setTitle('Leave out').setIcon('book-x').setChecked(out).setDisabled(ro).onClick(() => set('out')));
}
