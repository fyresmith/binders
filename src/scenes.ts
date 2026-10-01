import { ButtonComponent, MarkdownView, Modal, Notice, Setting, TFile, TFolder, getFrontMatterInfo, normalizePath, parseYaml, stringifyYaml, type App, type Editor, type TAbstractFile } from 'obsidian';
import type BindersPlugin from './main';
import { COMPILE_DEFAULTS, compile, joinBodies, linkTargets, nextName, pointsAt, repointLinks, synopsisFrom, tidyHead, tidyTail, titleFrom, type CompileItem, type CompileOptions } from './scene-text';
import { COMPILED_KEPT } from './settings-data';
import { trashPhrase, updatesLinks } from './view/internals';
import { confirm } from './view/modals';

/* Working on scenes as a writer does in Scrivener: splitting one in two where the cursor is, merging several into one,
   giving one a synopsis from its opening lines, and compiling a binder into a single note. The text rules are in
   scene-text.ts (pure, unit-tested); here they meet the vault. Each is ordered so that text exists twice before it
   exists once: the second half of a split is saved in its own note before the first lets go of it, and merged notes go
   to the trash only after the merged text has been read back. */

/** The property that leaves a note (or, in a folder note, a whole folder) out of a compile when it's `false`. */
export const COMPILE_PROP = 'compile';

const isNote = (f: TAbstractFile | null): f is TFile => f instanceof TFile && f.extension === 'md';
/** What went wrong, in words a writer can use: a file system's own message keeps its reason and loses its code and
    the path on disk. */
const say = (e: unknown) => {
	const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
	const fs = /^(E[A-Z]+): ([^,]+)(?:, \w+ '.*[\\/]([^\\/']+)')?/.exec(m);
	new Notice(fs ? `${fs[2].charAt(0).toUpperCase()}${fs[2].slice(1)}${fs[3] ? ` (“${fs[3]}”)` : ''}.` : m || 'That didn’t work.');
};

/** A note's text as its properties (the block as written, or "") and what follows. Where the properties end is
    Obsidian's to say, so this agrees with what its cache and its editor take for properties. */
function cut(text: string): { front: string; body: string } {
	const info = getFrontMatterInfo(text), at = info.exists ? info.contentStart : 0;
	return { front: text.slice(0, at), body: text.slice(at) };
}

/** Saves notes that are open with unsaved typing, so reading them from the vault gets what's on screen: in a binder
    view's manuscript (whose editors save a moment after typing stops) and in their own tabs. */
export async function saveOpen(app: App, files: TFile[]): Promise<void> {
	for (const leaf of app.workspace.getLeavesOfType('binders-view')) {
		const v = leaf.view as { saveNotes?: (files: TFile[]) => Promise<void> };
		if (typeof v.saveNotes === 'function') await v.saveNotes(files);
	}
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const v = leaf.view;
		if (v instanceof MarkdownView && v.file && files.includes(v.file)) await v.save();
	}
}

/** How many links in other notes lead to these notes. */
function linksTo(app: App, files: TFile[]): number {
	return Object.values(app.metadataCache.resolvedLinks).reduce((n, to) => n + files.reduce((m, f) => m + (to[f.path] ?? 0), 0), 0);
}

/** Points the vault's links to `from` at `to` instead (all of them, or those whose part `only` says yes to), as
    Obsidian does when a note is renamed, and only if it's set to ("Automatically update internal links"). Each note
    with such a link is rewritten once, its links and nothing else. Returns how many notes were changed. */
async function repoint(app: App, from: TFile, to: TFile, only?: (subpath: string) => boolean, skip: TFile[] = []): Promise<number> {
	if (!updatesLinks(app)) return 0;
	let n = 0;
	for (const [source, dests] of Object.entries(app.metadataCache.resolvedLinks)) {
		const file = dests[from.path] ? app.vault.getAbstractFileByPath(source) : null;
		if (!isNote(file) || file === from || skip.includes(file)) continue;
		let changed = false;
		await app.vault.process(file, (text) => {
			const next = repointLinks(text, (path, sub) => {
				if (!path || app.metadataCache.getFirstLinkpathDest(path, file.path) !== from || (only && !only(sub))) return null;
				return app.metadataCache.fileToLinktext(to, file.path, true);
			});
			changed = next !== text;
			return next;
		});
		if (changed) n++;
	}
	return n;
}

/** A short fingerprint of a text: enough to tell whether a note is still what Compile wrote. */
function fingerprint(text: string): string {
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	return `${text.length}:${h >>> 0}`;
}

/** Splits the note in an editor at the cursor: the text from there on becomes a new note, right after this one in the
    binder. With `titled`, the selected text names it (and stays, as its first words). The new note takes this one's
    properties, except its synopsis, which describes the whole and stays with the first half. */
export async function splitScene(plugin: BindersPlugin, editor: Editor, file: TFile, titled: boolean): Promise<TFile | null> {
	const { app, binders: store, settings } = plugin, folder = file.parent;
	if (!folder || !store.binderOf(file) || store.isHiddenNote(file)) return null;
	// typing elsewhere that isn't saved yet (the manuscript, another tab) is written down first, and this editor must
	// have it before it's split: else the split would write the note back without it
	try {
		await saveOpen(app, [file]);
		let same = false;
		const lf = (x: string) => x.replace(/\r\n?/g, '\n'); // (an editor has one kind of line break, whatever the file has)
		for (let i = 0; i < 15 && !(same = lf(await app.vault.read(file)) === lf(editor.getValue())); i++) await sleep(100);
		if (!same) { new Notice('This note is being changed somewhere else. Try again in a moment.'); return null; }
	} catch (e) { say(e); return null; }
	const text = editor.getValue(), offset = editor.posToOffset(editor.getCursor('from')), front = cut(text).front;
	if (offset < front.length) { new Notice('Click in the note’s text, where the new note should begin.'); return null; }
	const s = { head: text.slice(0, offset), tail: text.slice(offset) };
	const tail = tidyTail(s.tail, offset > 0 && !/[\r\n]/.test(text[offset - 1]));
	if (!tail.trim()) { new Notice('There’s nothing after that point to split off.'); return null; }
	if (!s.head.slice(front.length).trim()) { new Notice('There’s nothing before that point: the whole note would move.'); return null; }
	const taken = (n: string) => n === folder.name || !!app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${n}.md`));
	let title = titled ? titleFrom(editor.getSelection()) : nextName(file.basename, taken);
	if (!title) { new Notice('Select the words to name the new note with.'); return null; }
	if (taken(title)) title = nextName(title, taken);
	// its properties, as they're written in the editor now (the synopsis stays behind)
	let props: Record<string, unknown> = {};
	try { const y: unknown = front ? parseYaml(getFrontMatterInfo(text).frontmatter) : null; if (y && typeof y === 'object' && !Array.isArray(y)) props = { ...y }; } catch { /* properties that can't be read aren't copied */ }
	// the synopsis describes the whole and stays with the first half; other names for this note aren't the new one's
	delete props[settings.synopsisProp];
	delete props.aliases;
	delete props.alias;
	const content = (Object.keys(props).length ? `---\n${stringifyYaml(props)}---\n` : '') + tail;
	try {
		const index = (store.orderedChildren(folder) ?? []).indexOf(file) + 1;
		const made = await store.newScene(folder, index > 0 ? index : Infinity, title, undefined, content);
		// only now, with the second half in a note of its own, does the first let go of it
		const head = tidyHead(s.head);
		let k = 0;
		while (k < head.length && k < text.length && head[k] === text[k]) k++;
		editor.replaceRange(head.slice(k), editor.offsetToPos(k), editor.offsetToPos(text.length));
		editor.setCursor(editor.offsetToPos(head.length));
		// links to the headings and blocks that went with the second half follow them there
		const moved = linkTargets(tail);
		if (moved.headings.size || moved.blocks.size) await repoint(app, file, made, (sub) => pointsAt(sub, moved), [made]).catch(say);
		return made;
	} catch (e) { say(e); return null; }
}

/** Merges notes into the first of them, in the order given: their text joined with a blank line between, their
    synopses too; everything else is the first note's. The others go to the trash, once the merged text is safely
    written. Asks first. */
export async function mergeScenes(plugin: BindersPlugin, files: TFile[]): Promise<TFile | null> {
	const { app, binders: store, settings } = plugin, [first, ...rest] = files;
	if (!first || !rest.length || !files.every((f) => isNote(f) && !store.isHiddenNote(f))) return null;
	// links to the notes that go: where they'll lead, or that they'll lead nowhere, is said before the writer says yes
	const links = linksTo(app, rest), follow = updatesLinks(app);
	const ok = await confirm(app, {
		title: `Merge ${files.length} notes`,
		text: `Their text is joined into “${first.basename}” in this order, with a blank line between, and so are their synopses. ${rest.length === 1 ? `“${rest[0].basename}”` : `The other ${rest.length}`} ${trashPhrase(app, rest.length > 1)}, with ${rest.length === 1 ? 'its' : 'their'} other properties.${links ? ` ${links === 1 ? 'One link' : `${links} links`} to ${rest.length === 1 ? 'it' : 'them'} will ${follow ? `lead to “${first.basename}”` : 'no longer lead anywhere'}.` : ''}`,
		cta: 'Merge',
	});
	if (!ok) return null;
	try {
		await saveOpen(app, files);
		const texts = await Promise.all(rest.map((f) => app.vault.read(f)));
		const bodies = texts.map((t) => cut(t).body);
		await app.vault.process(first, (cur) => {
			// (properties with no line break after them get one, or the text would run into their closing line)
			const p = cut(cur), front = p.front && !/\n$/.test(p.front) ? p.front + '\n' : p.front;
			return front + joinBodies([p.body, ...bodies]);
		});
		const synopsis = (f: TFile) => { const v: unknown = app.metadataCache.getFileCache(f)?.frontmatter?.[settings.synopsisProp]; return typeof v === 'string' ? v.trim() : ''; };
		const joined = files.map(synopsis).filter((x) => x).join('\n\n');
		if (joined && joined !== synopsis(first)) await store.setProps(first, { [settings.synopsisProp]: joined });
		// read it back: every note's text must be in the merged one before any note is let go
		const now = cut(await app.vault.read(first)).body, flat = (x: string) => x.replace(/\s+/g, ' ').trim();
		if (!bodies.every((b) => flat(now).includes(flat(b)))) throw new Error('The merged note doesn’t have all the text, so nothing was deleted.');
		// links to the notes that go now lead to the one that has their text (while they're still there to be found)
		for (const f of rest) await repoint(app, f, first).catch(say);
		for (const f of rest) await app.fileManager.trashFile(f);
		return first;
	} catch (e) { say(e); return null; }
}

/** Gives notes a synopsis from their opening lines (Scrivener's "set synopsis from main text"). One note with a
    synopsis already is asked about; several at once only fill the ones without. Returns how many were set. */
export async function synopsisFromText(plugin: BindersPlugin, files: TFile[]): Promise<number> {
	const { app, binders: store, settings } = plugin;
	let n = 0;
	try {
		await saveOpen(app, files);
		for (const f of files) {
			const next = synopsisFrom(await app.vault.cachedRead(f));
			const now: unknown = app.metadataCache.getFileCache(f)?.frontmatter?.[settings.synopsisProp], has = typeof now === 'string' && !!now.trim();
			if (!next || next === now) continue;
			if (has && (files.length > 1 || !(await confirm(app, { title: 'Replace the synopsis', text: `“${f.basename}” already has a synopsis. Replace it with the note’s opening lines?`, cta: 'Replace' })))) continue;
			await store.setProps(f, { [settings.synopsisProp]: next });
			n++;
		}
	} catch (e) { say(e); }
	return n;
}

/** Is a note left out of compiles, by its own `compile: false` or a folder's above it (in the folder's note)? */
export function compiles(plugin: BindersPlugin, item: TAbstractFile): boolean {
	const { app, binders: store } = plugin, binder = store.binderOf(item);
	const off = (f: TFile | null) => !!f && app.metadataCache.getFileCache(f)?.frontmatter?.[COMPILE_PROP] === false;
	if (item instanceof TFile && off(item)) return false;
	for (let f = item instanceof TFolder ? item : item.parent; f && binder && f !== binder.folder; f = f.parent) if (off(store.folderNote(f))) return false;
	return true;
}

/** A folder of a binder as one text, in binder order (see compile() in scene-text.ts). */
export async function compileText(plugin: BindersPlugin, folder: TFolder, options: CompileOptions): Promise<{ text: string; scenes: number }> {
	const { app, binders: store } = plugin, items: CompileItem[] = [];
	let scenes = 0;
	const walk = async (f: TFolder, depth: number): Promise<void> => {
		for (const c of store.orderedChildren(f) ?? []) {
			if (!compiles(plugin, c)) continue;
			if (c instanceof TFolder) { items.push({ kind: 'folder', name: c.name, depth }); await walk(c, depth + 1); }
			else if (isNote(c)) { items.push({ kind: 'scene', name: c.basename, depth, text: cut(await app.vault.cachedRead(c)).body }); scenes++; }
		}
	};
	await saveOpen(app, store.scenes(folder));
	if (store.binderOf(folder)?.kind === 'longform') for (const f of store.scenes(folder)) { if (compiles(plugin, f)) { items.push({ kind: 'scene', name: f.basename, depth: 0, text: cut(await app.vault.cachedRead(f)).body }); scenes++; } }
	else await walk(folder, 0);
	return { text: compile(folder.name, items, options), scenes };
}

const SEPARATORS: [string, string][] = [['* * *', 'Three stars (* * *)'], ['#', 'A hash (#), as in a manuscript'], ['---', 'A rule (---)'], ['', 'A blank line']];

/** "Compile": the binder (or a folder of it) written out as one note beside it, or copied. */
export class CompileModal extends Modal {
	private o: CompileOptions;
	private path: string;

	constructor(private plugin: BindersPlugin, private folder: TFolder) {
		super(plugin.app);
		this.o = { ...COMPILE_DEFAULTS, ...plugin.settings.compile };
		// beside the binder, not in it (there it would be one of its scenes)
		const binder = plugin.binders.binderOf(folder)?.folder ?? folder, dir = binder.parent && !binder.parent.isRoot() ? binder.parent.path + '/' : '';
		this.path = `${dir}${folder.name} (compiled).md`;
	}

	onOpen(): void {
		const { contentEl, o } = this, scenes = this.plugin.binders.scenes(this.folder);
		const left = scenes.filter((f) => !compiles(this.plugin, f)).length, n = scenes.length - left;
		this.setTitle(`Compile “${this.folder.name}”`);
		contentEl.createEl('p', { cls: 'setting-item-description', text: `${n.toLocaleString()} ${n === 1 ? 'note' : 'notes'}, in binder order, become one note: their text only, without properties.${left ? ` ${left} ${left === 1 ? 'is' : 'are'} left out (“Include in compile” is off).` : ''} Your notes aren’t changed.` });
		new Setting(contentEl).setName('Title').setDesc('The name of what’s compiled, as the first heading.').addToggle((t) => t.setValue(o.title).onChange((v) => { o.title = v; }));
		new Setting(contentEl).setName('Folders as headings').setDesc('Each folder’s name as a heading, a level deeper for a folder inside another.').addToggle((t) => t.setValue(o.folderHeadings).onChange((v) => { o.folderHeadings = v; }));
		new Setting(contentEl).setName('Note titles as headings').setDesc('Each note’s name above its text, instead of a separator.').addToggle((t) => t.setValue(o.sceneHeadings).onChange((v) => { o.sceneHeadings = v; }));
		new Setting(contentEl).setName('Between notes').setDesc('What separates one note’s text from the next.').addDropdown((d) => {
			for (const [value, name] of SEPARATORS) d.addOption(value, name);
			if (!SEPARATORS.some(([v]) => v === o.separator)) d.addOption(o.separator, o.separator);
			d.setValue(o.separator).onChange((v) => { o.separator = v; });
		});
		new Setting(contentEl).setName('Leave out comments').setDesc('Text between %% and %%, which Obsidian doesn’t show when reading.').addToggle((t) => t.setValue(o.stripComments).onChange((v) => { o.stripComments = v; }));
		new Setting(contentEl).setName('Save as').setDesc('A note beside the binder. Compiling again replaces it; a note that’s been written in since is asked about first.').addText((t) => {
			t.setValue(this.path).onChange((v) => { this.path = v.trim(); });
			t.inputEl.addClass('binders-compile-path');
		});
		// (Obsidian's own row of buttons: what the dialog does first, Cancel last)
		const row = contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(row).setButtonText('Compile').setCta().onClick(() => void this.run(true));
		new ButtonComponent(row).setButtonText('Copy').setTooltip('Copy the compiled text instead of saving it').onClick(() => void this.run(false));
		new ButtonComponent(row).setButtonText('Cancel').onClick(() => this.close());
	}

	onClose(): void { this.contentEl.empty(); }

	private async run(save: boolean): Promise<void> {
		const { app } = this.plugin;
		try {
			this.plugin.settings.compile = { ...this.o };
			await this.plugin.saveData(this.plugin.settings);
			const { text, scenes } = await compileText(this.plugin, this.folder, this.o);
			if (!save) {
				await navigator.clipboard.writeText(text);
				new Notice(`Copied ${scenes.toLocaleString()} ${scenes === 1 ? 'note' : 'notes'} as one text.`);
				this.close();
				return;
			}
			const typed = this.path.replace(/\.md$/i, '').trim(), names = typed.split('/');
			if (!typed) throw new Error('Give the compiled note a name.');
			if (names.some((n) => !n.trim() || n === '.' || n === '..' || n.startsWith('.') || /[*"\\<>:|?]/.test(n))) throw new Error('That name can’t be used: a name can’t start with a dot or have any of * " \\ < > : | ? in it.');
			const path = normalizePath(typed + '.md');
			if (this.plugin.binders.binderOf(path)) throw new Error('Save it outside the binder: in it, the compiled note would be one of its scenes.');
			const at = app.vault.getAbstractFileByPath(path);
			if (at && !(at instanceof TFile)) throw new Error(`“${path}” is a folder.`);
			// a note that isn't what Compile last left there has someone's writing in it: asked about, never just replaced
			const memory = this.plugin.settings.compiled;
			if (at instanceof TFile) {
				const there = await app.vault.read(at);
				if (there !== text && there.trim() && memory[path] !== fingerprint(there)) {
					const replace = await confirm(app, { title: 'Replace this note', text: `“${at.basename}” ${memory[path] ? 'has been changed since it was compiled' : 'is already there, and wasn’t made by Compile'}. Replace its text with the compiled binder?`, cta: 'Replace' });
					if (!replace) return;
				}
			}
			const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
			if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
			const file = at instanceof TFile ? (await app.vault.modify(at, text), at) : await app.vault.create(path, text);
			delete memory[path];
			memory[path] = fingerprint(text);
			for (const k of Object.keys(memory).slice(0, -COMPILED_KEPT)) delete memory[k];
			await this.plugin.saveData(this.plugin.settings);
			this.close();
			// in the tab it's open in already, if there is one
			const open = app.workspace.getLeavesOfType('markdown').find((l) => l.view instanceof MarkdownView && l.view.file === file);
			if (open) app.workspace.setActiveLeaf(open, { focus: true });
			else await app.workspace.getLeaf('tab').openFile(file);
			new Notice(`Compiled ${scenes.toLocaleString()} ${scenes === 1 ? 'note' : 'notes'} into “${file.basename}”.`);
		} catch (e) { say(e); }
	}
}
