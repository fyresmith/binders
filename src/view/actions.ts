import { Menu, Notice, Platform, TFile, TFolder, normalizePath, type TAbstractFile } from 'obsidian';
import { COMPILE_PROP, CompileModal, compiles, mergeScenes, saveOpen, synopsisFromText } from '../scenes';
import { openPluginSettings, submenu, trashPhrase } from './internals';
import { hexColor, labelCss, labelDot, labelName, presetOf } from './labels';
import { ask, confirm, pickColor } from './modals';
import type { ModeContext } from './mode';
import { parseTarget } from './outliner-data';

/* What can be done to a note or a folder of a binder, the same on a card and in an outliner row: its menu, renaming,
   deleting, and setting its status, label and target. The views say how their own parts work (which field renames,
   what "up" means when a filter hides notes) through `Hooks`. */

/** The `source` of the 'file-menu' events an item's menu sends, so other plugins can tell (and Binders' own explorer
    items stay out of it). */
export const ITEM_MENU = 'binders-card';

/** Why a typed name can't be a file's name, or null: characters Obsidian refuses or that break links, and a leading dot,
    which makes a hidden file Obsidian doesn't show. */
export const badName = (name: string): string | null =>
	/[*"\\/<>:|?]/.test(name) ? 'A name can’t contain any of * " \\ / < > : | ?' : name.startsWith('.') ? 'A name can’t start with a dot.' : name.length > 200 ? 'That name is too long.' : null;

export const isNote = (f: TAbstractFile): f is TFile => f instanceof TFile && f.extension === 'md';
export const nameOf = (f: TAbstractFile): string => (f instanceof TFile ? f.basename : f.name);

/** Where an item's card data lives: the note itself, or a folder's folder note (null until it has one). */
export function noteOf(ctx: ModeContext, f: TAbstractFile): TFile | null {
	return f instanceof TFolder ? ctx.store.folderNote(f) : f instanceof TFile ? f : null;
}

/** Renames a note or folder where it is. Throws, with why, when the name can't be used. */
export async function renameItem(ctx: ModeContext, f: TAbstractFile, name: string): Promise<void> {
	const bad = badName(name);
	if (bad) throw new Error(bad);
	// a note named like its folder, or a folder named like a note in it, would make that note the folder note
	if (isNote(f) && name === f.parent?.name) throw new Error('A note can’t have its folder’s name: it would become the folder’s note.');
	if (f instanceof TFolder && f.children.some((c) => isNote(c) && c.basename === name)) throw new Error(`“${f.name}” already has a note called “${name}”, which would become its folder note.`);
	const to = normalizePath(`${f.parent?.path ?? ''}/${name}${f instanceof TFile ? '.' + f.extension : ''}`);
	if (to === f.path) return;
	if (ctx.app.vault.getAbstractFileByPath(to) && to.toLowerCase() !== f.path.toLowerCase()) throw new Error(`“${name}” already exists here.`);
	try { await ctx.app.fileManager.renameFile(f, to); } catch (e) { throw new Error(plain(e)); }
}

/** A file system's error as a person would say it: without its code and the paths on this computer. */
export function plain(e: unknown): string {
	const m = e instanceof Error ? e.message : typeof e === 'string' ? e : 'That didn’t work.';
	if (/ENAMETOOLONG/.test(m)) return 'That name is too long.';
	if (/ENOENT/.test(m)) return 'That note isn’t there any more.';
	if (/EEXIST/.test(m)) return 'Something with that name is already there.';
	if (/EACCES|EPERM/.test(m)) return 'Obsidian isn’t allowed to change that file.';
	return m.replace(/^E[A-Z]+: /, '').replace(/, (rename|open|unlink|mkdir|stat) '.*$/, '');
}

/** Asks, then moves the items to the trash (as Obsidian's settings say to). False if the answer was no. */
export async function removeItems(ctx: ModeContext, items: TAbstractFile[]): Promise<boolean> {
	if (!items.length) return false;
	const one = items.length === 1 ? items[0] : null;
	const notes = one instanceof TFolder ? ctx.store.scenes(one).length : 0;
	const ok = await confirm(ctx.app, {
		title: one ? (one instanceof TFolder ? 'Delete folder' : 'Delete note') : `Delete ${items.length} items`,
		// (and where it goes, as Obsidian's own question says: that's set in Files and links)
		text: `${one ? (one instanceof TFolder ? `Delete “${nameOf(one)}” and the ${notes} ${notes === 1 ? 'note' : 'notes'} in it?` : `Delete “${nameOf(one)}”?`) : `Delete these ${items.length} items?`} ${one ? 'It' : 'They'} ${trashPhrase(ctx.app, !one)}.`,
		cta: 'Delete', warning: true,
	});
	if (!ok) return false;
	// (what's typed and not saved yet goes with the note: a deleted note is whole in the trash)
	try { await saveOpen(ctx.app, items.flatMap((f) => (f instanceof TFolder ? ctx.store.scenes(f) : isNote(f) ? [f] : []))); } catch { /* deleted as it is on disk */ }
	for (const f of items) {
		try { await ctx.app.fileManager.trashFile(f); } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); break; }
	}
	return true;
}

/** Gives every item the same status, label or target (a folder's go in its folder note, made if need be). */
export async function setAll(ctx: ModeContext, items: TAbstractFile[], patch: { status?: string; label?: string; target?: number }): Promise<void> {
	try {
		for (const f of items) {
			const note = f instanceof TFolder ? await ctx.store.ensureFolderNote(f) : noteOf(ctx, f);
			if (note) await ctx.setProps(note, patch);
		}
	} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
}

/** Statuses or labels in use in the binder, in the order they first appear. */
export function inUse(ctx: ModeContext, key: 'status' | 'label'): string[] {
	const out = new Set<string>();
	for (const f of ctx.store.scenes(ctx.binder.folder)) { const v = ctx.props(f)[key]; if (v) out.add(v); }
	return [...out];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What the items have in common for a property: the value they all share, or null if they differ. */
function shared(ctx: ModeContext, items: TAbstractFile[], key: 'status' | 'label'): string | null {
	const vals = new Set(items.map((f) => { const n = noteOf(ctx, f); return n ? ctx.props(n)[key] : ''; }));
	return vals.size === 1 ? [...vals][0] : null;
}

/** The statuses to choose from: the ones in settings, in their order, then any others the binder's notes use. */
export function statusChoices(ctx: ModeContext): string[] {
	const presets = ctx.plugin.settings.statuses;
	return [...presets, ...inUse(ctx, 'status').filter((s) => !presets.some((p) => same(p, s)))];
}

/** The labels to choose from: the ones in settings, then any others the binder's notes use (custom colors aside). */
export function labelChoices(ctx: ModeContext): string[] {
	const presets = ctx.plugin.settings.labels;
	return [...presets.map((p) => p.name), ...inUse(ctx, 'label').filter((l) => !presetOf(l, presets) && !hexColor(l))];
}

/** The statuses to set, as a menu's items. */
export function statusItems(ctx: ModeContext, m: Menu, items: TAbstractFile[]): void {
	const now = shared(ctx, items, 'status');
	for (const s of statusChoices(ctx)) m.addItem((x) => x.setSection('statuses').setTitle(s).setChecked(now != null && same(now, s)).onClick(() => void setAll(ctx, items, { status: s })));
	m.addItem((x) => x.setSection('new').setTitle('New status...').setIcon('plus').onClick(async () => {
		const s = await ask(ctx.app, { title: 'New status', placeholder: 'Draft, revised, done…', cta: 'Set status' });
		if (s) await setAll(ctx, items, { status: s });
	}));
	if (now !== '') m.addItem((x) => x.setSection('new').setTitle('No status').setIcon('x').onClick(() => void setAll(ctx, items, { status: '' })));
}

/** The labels to set, as a menu's items: the ones in settings, a color of the note's own, and none. */
/** A CSS color (a theme variable, say) as the "#rrggbb" it is on screen now, or null. */
function shownColor(css: string | null): string | null {
	if (!css) return null;
	const probe = activeDocument.body.createDiv();
	probe.setCssProps({ '--binders-label': css });
	probe.addClass('binders-label-dot', 'binders-settings-probe');
	const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).backgroundColor);
	probe.remove();
	return m ? '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : null;
}

export function labelItems(ctx: ModeContext, m: Menu, items: TAbstractFile[]): void {
	const presets = ctx.plugin.settings.labels, now = shared(ctx, items, 'label');
	for (const l of labelChoices(ctx)) {
		const t = createFragment();
		labelDot(t, l, presets);
		t.appendText(labelName(l, presets));
		m.addItem((x) => x.setSection('labels').setTitle(t).setChecked(!!now && same(now, l)).onClick(() => void setAll(ctx, items, { label: l })));
	}
	const custom = now ? hexColor(now) : null;
	m.addItem((x) => {
		const t = createFragment();
		if (custom && now) labelDot(t, now, presets);
		t.appendText('Custom color...');
		x.setSection('custom').setTitle(t).setChecked(!!custom).onClick(async () => {
			// (starting from the color the label shows in now, whatever names it)
			const c = await pickColor(ctx.app, { title: 'Custom color', value: custom ?? shownColor(now ? labelCss(now, presets) : null) ?? '#d97706', cta: 'Set color' });
			if (c) await setAll(ctx, items, { label: c });
		});
		if (!custom) x.setIcon('pipette');
	});
	if (now !== '') m.addItem((x) => x.setSection('custom').setTitle('No label').setIcon('x').onClick(() => void setAll(ctx, items, { label: '' })));
	m.addItem((x) => x.setSection('settings').setTitle('Edit labels...').setIcon('settings').onClick(() => openPluginSettings(ctx.app, ctx.plugin.manifest.id)));
}

/** Asks for a word count target for the items; nothing typed takes it away. */
export async function askTarget(ctx: ModeContext, items: TAbstractFile[]): Promise<void> {
	const one = items.length === 1 ? noteOf(ctx, items[0]) : null, now = one ? ctx.props(one).target : 0;
	// (something that isn't a number keeps the dialog open, with what was typed, to put right)
	const typed = await ask(ctx.app, { title: 'Word count target', placeholder: 'Words, such as 1,500', cta: 'Set target', value: now ? String(now) : '', allowEmpty: true, check: (v) => (parseTarget(v) == null ? 'A target is a whole number of words.' : null) });
	if (typed == null) return;
	const n = parseTarget(typed);
	if (n != null) await setAll(ctx, items, { target: n });
}

/** What every mode shows for a folder with nothing to show: the same words, in the same place. */
export function emptyState(ctx: ModeContext, parent: HTMLElement): HTMLElement {
	const box = parent.createDiv({ cls: 'binders-empty' }), filtering = ctx.filtering();
	box.createDiv({ cls: 'binders-empty-title', text: filtering ? 'No notes match the filter' : 'No notes in this folder yet' });
	if (filtering) box.createDiv({ cls: 'binders-empty-text', text: 'Choose “Filter” above to change it, or clear it.' });
	else if (!ctx.readOnly) box.createDiv({ cls: 'binders-empty-text', text: 'Use “New” above to add one.' });
	return box;
}

/** "Set status", "Set label" and "Set target" for a menu. */
export function propItems(ctx: ModeContext, menu: Menu, items: TAbstractFile[]): void {
	menu.addItem((i) => { i.setSection('props').setTitle('Set status').setIcon('circle-dot'); submenu(i, (m) => statusItems(ctx, m, items), menu); });
	menu.addItem((i) => { i.setSection('props').setTitle('Set label').setIcon('palette'); submenu(i, (m) => labelItems(ctx, m, items), menu); });
	menu.addItem((i) => i.setSection('props').setTitle('Set target...').setIcon('target').onClick(() => void askTarget(ctx, items)));
}

const tell = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); return null; } };

/** Copying, grouping, merging, and whether it's compiled: what changes the binder's shape. */
function structureItems(ctx: ModeContext, menu: Menu, items: TAbstractFile[], h: Hooks): void {
	const one = items.length === 1 ? items[0] : null, longform = ctx.binder.kind === 'longform', store = ctx.store;
	if (one) menu.addItem((i) => i.setSection('structure').setTitle('Duplicate').setIcon('copy').onClick(async () => {
		// (what's typed and not saved yet is copied too)
		await tell(saveOpen(ctx.app, one instanceof TFolder ? store.scenes(one) : isNote(one) ? [one] : []));
		const made = await tell(store.duplicate(one));
		if (made) h.made?.(made, false);
	}));
	const notes = items.filter(isNote);
	if (notes.length > 1 && notes.length === items.length) menu.addItem((i) => i.setSection('structure').setTitle(`Merge ${notes.length} notes`).setIcon('merge').onClick(async () => {
		// in reading order, however they're selected or sorted on screen
		const kept = await mergeScenes(ctx.plugin, store.inOrder(notes).filter(isNote));
		if (kept) h.made?.(kept, false);
	}));
	// siblings only: a folder goes where the first of them is
	if (!longform && items.every((f) => f.parent === items[0].parent)) menu.addItem((i) => i.setSection('structure').setTitle(items.length > 1 ? 'New folder from selection' : 'Put in a new folder').setIcon('folder-plus').onClick(async () => { const made = await tell(store.group(items)); if (made) h.made?.(made, true); }));
	if (one instanceof TFolder) menu.addItem((i) => i.setSection('structure').setTitle('Compile...').setIcon('book-check').onClick(() => new CompileModal(ctx.plugin, one).open()));
	if (one instanceof TFolder && (store.orderedChildren(one) ?? []).length) menu.addItem((i) => i.setSection('structure').setTitle('Ungroup').setIcon('folder-output').onClick(() => void tell(store.ungroup(one))));
	const on = items.every((f) => { const n = noteOf(ctx, f); return !n || ctx.app.metadataCache.getFileCache(n)?.frontmatter?.[COMPILE_PROP] !== false; });
	menu.addItem((i) => i.setSection('structure').setTitle('Include in compile').setIcon('book-check').setChecked(on).onClick(() => void setCompile(ctx, items, !on)));
}

/** Leaves items out of compiles (`compile: false`), or puts them back in (the property goes). */
export async function setCompile(ctx: ModeContext, items: TAbstractFile[], include: boolean): Promise<void> {
	await tell((async () => {
		if (ctx.readOnly) throw new Error('This binder is read only.');
		for (const f of items) {
			const note = f instanceof TFolder ? (include ? ctx.store.folderNote(f) : await ctx.store.ensureFolderNote(f)) : noteOf(ctx, f);
			if (note) await ctx.store.setProps(note, { [COMPILE_PROP]: include ? undefined : false });
		}
	})());
}

export { compiles };

/** What Obsidian's core plugins and other plugins offer for a note or a folder (bookmark it, merge it…), as its menu
    in the file explorer has: a card is that note. Binders' own items for the explorer are left out (main.ts). */
export function otherItems(ctx: ModeContext, menu: Menu, items: TAbstractFile[]): void {
	const ws = ctx.app.workspace;
	try {
		if (items.length === 1) ws.trigger('file-menu', menu, items[0], ITEM_MENU);
		else if (items.length > 1) ws.trigger('files-menu', menu, items, ITEM_MENU);
	} catch (e) { console.error('Binders: a plugin’s menu items failed', e); }
}

export interface Hooks {
	/** Starts renaming the item in place, if this view can (null: no "Rename"). */
	rename: ((f: TAbstractFile) => void) | null;
	/** Starts editing its synopsis in place (null: no "Edit synopsis"). */
	synopsis: ((f: TAbstractFile) => void) | null;
	/** Moves it one place among what shows (null: it's at that end, or can't move). */
	up: (() => void) | null;
	down: (() => void) | null;
	/** Deletes the items (after asking), and looks after the selection (null: no "Delete"). */
	remove: ((items: TAbstractFile[]) => void) | null;
	/** More items for this view, added between the item's own and other plugins'. */
	more?: (menu: Menu) => void;
	/** Something was made from the menu (a copy, a folder around the selection): select it, and with `rename`, start
	    naming it in place once it shows. */
	made?: (f: TAbstractFile, rename: boolean) => void;
}

/** The menu of one item, or of several selected together. */
export function itemMenu(ctx: ModeContext, items: TAbstractFile[], h: Hooks): Menu {
	const menu = new Menu(), ro = ctx.readOnly, one = items.length === 1 ? items[0] : null;
	if (one instanceof TFolder) {
		menu.addItem((i) => i.setSection('open').setTitle('Open').setIcon('layout-grid').onClick(() => ctx.navigate(one)));
		menu.addItem((i) => i.setSection('open').setTitle('Open in new tab').setIcon('file-plus').onClick(() => ctx.navigate(one, 'tab')));
		const note = ctx.store.folderNote(one);
		if (note) menu.addItem((i) => i.setSection('open').setTitle('Open folder note').setIcon('file-text').onClick(() => void ctx.openFile(note, false)));
	} else if (one instanceof TFile) {
		menu.addItem((i) => i.setSection('open').setTitle('Open').setIcon('file').onClick(() => void ctx.openFile(one, false)));
		menu.addItem((i) => i.setSection('open').setTitle('Open in new tab').setIcon('file-plus').onClick(() => void ctx.openFile(one, 'tab')));
		if (!Platform.isPhone) menu.addItem((i) => i.setSection('open').setTitle('Open to the right').setIcon('separator-vertical').onClick(() => void ctx.openFile(one, 'split')));
	}
	if (!ro) {
		if (one && h.rename) menu.addItem((i) => i.setSection('edit').setTitle('Rename').setIcon('pencil-line').onClick(() => h.rename?.(one)));
		if (one && h.synopsis) menu.addItem((i) => i.setSection('edit').setTitle('Edit synopsis').setIcon('text').onClick(() => h.synopsis?.(one)));
		const notes = items.filter(isNote);
		if (notes.length) menu.addItem((i) => i.setSection('edit').setTitle('Set synopsis from text').setIcon('wand-sparkles').onClick(async () => {
			const n = await synopsisFromText(ctx.plugin, notes);
			if (!n) new Notice(notes.length === 1 ? 'Nothing to make a synopsis from.' : 'No note without a synopsis has text to make one from.');
		}));
		propItems(ctx, menu, items);
		structureItems(ctx, menu, items, h);
		if (one && h.up) menu.addItem((x) => x.setSection('order').setTitle('Move up').setIcon('arrow-up').onClick(() => h.up?.()));
		if (one && h.down) menu.addItem((x) => x.setSection('order').setTitle('Move down').setIcon('arrow-down').onClick(() => h.down?.()));
	}
	h.more?.(menu);
	otherItems(ctx, menu, items);
	// last, after what Obsidian and other plugins add, as in the file explorer's own menu (a menu's sections come in
	// the order they're first used)
	if (!ro && h.remove) menu.addItem((i) => i.setSection('danger').setTitle(one ? 'Delete' : `Delete ${items.length} items`).setIcon('trash-2').setWarning(true).onClick(() => h.remove?.(items)));
	return menu;
}
