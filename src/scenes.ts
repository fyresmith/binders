import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { MarkdownView, Notice, Platform, TFile, TFolder, editorInfoField, normalizePath, parseYaml, stringifyYaml, type App, type Editor, type TAbstractFile } from 'obsidian';
import type BindersPlugin from './main';
import { compile, frontFor, joinBodies, lf, linkTargets, nextName, parts, pointsAt, repointLinks, synopsisFrom, tidyHead, tidyTail, titleFrom, useYaml, type CompileItem, type CompileOptions } from './scene-text';
import { COMPILED_KEPT } from './settings-data';
import { untab } from './paragraphs/text';
import { saveEditors, saveTab } from './view/editable-embed';
import { trashPhrase, updatesLinks } from './view/internals';
import { confirm } from './view/modals';

/* Working on scenes as a writer does in Scrivener: splitting one in two where the cursor is, merging several into one,
   giving one a synopsis from its opening lines, and a binder's text made into a single note (export's "One note"). The text rules are in
   scene-text.ts (pure, unit-tested); here they meet the vault. Each is ordered so that text exists twice before it
   exists once: the second half of a split is saved in its own note before the first lets go of it, and merged notes go
   to the trash only after the merged text has been read back. */

/** The property that leaves a note (or, in a folder note, a whole folder) out of an export when it's `false`: what
    Binders writes. */
export const EXPORT_PROP = 'export';
/** The same property under the name it had before export ("Compile"). It is read as the same thing, for good, and
    never written: a note that has it keeps it until its writer includes the note again. */
export const COMPILE_PROP = 'compile';

/** A Markdown note (not a folder, and not another kind of file). */
export const isNote = (f: TAbstractFile | null): f is TFile => f instanceof TFile && f.extension === 'md';
/** What went wrong, in words a writer can use: a file system's own message keeps its reason and loses its code and
    the path on disk. */
const say = (e: unknown) => {
	const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
	const fs = /^(E[A-Z]+): ([^,]+)(?:, \w+ '.*[\\/]([^\\/']+)')?/.exec(m);
	new Notice(fs ? `${fs[2].charAt(0).toUpperCase()}${fs[2].slice(1)}${fs[3] ? ` (“${fs[3]}”)` : ''}.` : m || 'That didn’t work.');
};

// Where a note's properties end is one rule, in scene-text.ts, and it reads a block as Obsidian does: with Obsidian's
// own parser, handed over here (that file imports nothing of Obsidian's).
useYaml(parseYaml);

/** Saves notes that are open with unsaved typing, so reading them from the vault gets what's on screen: in a binder
    view's manuscript (whose editors save a moment after typing stops) and in their own tabs. When it resolves, what
    was typed is on disk: everything that reads, copies, moves or removes a note waits on this first, or a note would
    go to the trash (or into a merge, a copy, a snapshot) without its last words. */
export async function saveOpen(app: App, files: TFile[]): Promise<void> {
	for (const leaf of app.workspace.getLeavesOfType('binders-view')) {
		const v = leaf.view as { saveNotes?: (files: TFile[]) => Promise<void> };
		if (typeof v.saveNotes === 'function') await v.saveNotes(files);
	}
	// every manuscript's editors of these notes, wherever they are, and the last write of one that has just gone (a
	// section scrolled away, a view closed a moment ago)
	await saveEditors(files);
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const v = leaf.view;
		if (v instanceof MarkdownView && v.file && files.includes(v.file)) await saveTab(v);
	}
}

/** How many links in other notes lead to these notes. */
function linksTo(app: App, files: TFile[]): number {
	return Object.values(app.metadataCache.resolvedLinks).reduce((n, to) => n + files.reduce((m, f) => m + (to[f.path] ?? 0), 0), 0);
}

/** Points the vault's links to `from` at `to` instead (all of them, or those whose part `only` says yes to), as
    Obsidian does when a note is renamed, and only if it's set to ("Automatically update internal links"). Each note
    with such a link is rewritten once, its links and nothing else. Returns the notes that were changed. `also`: notes
    to look through whatever the link index says.

    Which notes link to `from` is Obsidian's link index's to say, and that index is filled a moment after a note is
    written (Obsidian reads the note again, off the main thread; longer on a busy machine). So the notes it may not
    have caught up with are read as well: those written in the last minute, and those it has nothing of yet. Where a
    link leads is asked of Obsidian's lookup by name, which knows a note as soon as it's made. */
async function repoint(app: App, from: TFile, to: TFile, only?: (subpath: string) => boolean, skip: TFile[] = [], also: TFile[] = []): Promise<TFile[]> {
	if (!updatesLinks(app)) return [];
	const out: TFile[] = [], now = Date.now();
	const indexed = Object.entries(app.metadataCache.resolvedLinks).filter(([, dests]) => dests[from.path]).map(([source]) => app.vault.getAbstractFileByPath(source));
	const unread = app.vault.getMarkdownFiles().filter((f) => now - f.stat.mtime < INDEX_LAG || !app.metadataCache.getFileCache(f));
	for (const file of new Set([...indexed, ...also, ...unread])) {
		if (!isNote(file) || file === from || skip.includes(file) || app.vault.getAbstractFileByPath(file.path) !== file) continue;
		const pointed = (text: string) => repointLinks(text, (path, sub) => {
			if (!path || app.metadataCache.getFirstLinkpathDest(path, file.path) !== from || (only && !only(sub))) return null;
			return app.metadataCache.fileToLinktext(to, file.path, true);
		});
		// (a note with no such link isn't written to at all)
		const seen = await app.vault.read(file);
		if (pointed(seen) === seen) continue;
		let changed = false;
		await app.vault.process(file, (text) => {
			const next = pointed(text);
			changed = next !== text;
			return next;
		});
		if (changed) out.push(file);
	}
	return out;
}
/** How long after a note was written its links may still be missing from Obsidian's link index, in ms (generous: it
    is a few milliseconds on an idle machine, and reading the few notes written in that time costs little). */
const INDEX_LAG = 60000;

/** A short fingerprint of a text: enough to tell whether a note is still what export wrote. */
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
		for (let i = 0; i < 15 && !(same = lf(await app.vault.read(file)) === lf(editor.getValue())); i++) await sleep(100);
		if (!same) { new Notice('This note is being changed somewhere else. Try again in a moment.'); return null; }
	} catch (e) { say(e); return null; }
	const text = editor.getValue(), offset = editor.posToOffset(editor.getCursor('from')), { front, yaml } = parts(text);
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
	try { const y: unknown = front ? parseYaml(yaml) : null; if (y && typeof y === 'object' && !Array.isArray(y)) props = { ...y }; } catch { /* properties that can't be read aren't copied */ }
	// the synopsis describes the whole and stays with the first half; other names for this note aren't the new one's
	delete props[settings.synopsisProp];
	delete props.aliases;
	delete props.alias;
	const content = (Object.keys(props).length ? `---\n${stringifyYaml(props)}---\n` : '') + tail;
	try {
		const index = (store.orderedChildren(folder) ?? []).indexOf(file) + 1;
		const made = await store.newScene(folder, index > 0 ? index : Infinity, title, undefined, content);
		if (editor.getValue() !== text) throw new Error('This note changed while it was being split. Both notes were kept; nothing was removed.');
		// only now, with the second half in a note of its own, does the first let go of it
		const head = tidyHead(s.head);
		let k = 0;
		while (k < head.length && k < text.length && head[k] === text[k]) k++;
		editor.replaceRange(head.slice(k), editor.offsetToPos(k), editor.offsetToPos(text.length));
		editor.setCursor(editor.offsetToPos(head.length));
		// (written at once: until it is, the second half is in both notes on disk)
		await saveOpen(app, [file]);
		// links to the headings and blocks that went with the second half follow them there
		const moved = linkTargets(tail);
		const linked = moved.headings.size || moved.blocks.size ? await repoint(app, file, made, (sub) => pointsAt(sub, moved), [made]).catch((e): TFile[] => { say(e); return []; }) : [];
		// (an undo in the editor right after this takes the whole split back: see `splitUndo`)
		splits.push({ first: file, made, path: made.path, title, before: text, head, back: s.tail, content, moved, linked, want: 'two' });
		if (splits.length > SPLITS_KEPT) splits.shift();
		return made;
	} catch (e) { say(e); return null; }
}

/* Undo right after a split. The split takes the second half out of the first note in one step of its editor's undo
   history, so the editor's own undo (Ctrl+Z, the command, a phone's button) puts it back there; left at that, the new
   note would keep it too and the text would be in both. So the splits made are remembered here (in memory, as the
   editor's history is), and an editor extension watches for an undo or a redo that leaves the first note's text as it
   was before a split, or as the split left it:

   - undone, the new note goes to the trash, but only if it is still exactly what the split wrote, where the split put
     it, and only once the first note is on disk with the second half in it again. A new note that was edited, renamed or moved
     stays, and a notice says the text is in both;
   - redone, the new note is made again first thing, with what the split wrote, where it was: the editor has let go of
     the second half already. If it can't be made, the redo is taken back.

   What's wanted (one note or two) is set as the undo or redo happens, and brought about one step at a time, in order:
   an undo and a redo in quick succession end as the editor has it. Typing changes nothing here: it is no undo. */

/** A split that was made: its two notes, the first note's text before and after, what was written to the new one. */
interface Split {
	first: TFile;
	/** The new note (null while the split is undone), where the split put it, and the name it was given. */
	made: TFile | null; path: string; title: string;
	/** The first note's whole text as its editor had it before the split, and after; and the second half as it stood
	    in the first note. */
	before: string; head: string; back: string;
	/** What the split wrote to the new note. */
	content: string;
	/** The headings and blocks that went to the new note, and the notes whose links to them were pointed there. */
	moved: ReturnType<typeof linkTargets>; linked: TFile[];
	/** What the first note's editor says now: the text in one note (the split undone), or in two. */
	want: 'one' | 'two';
	/** The new note was found changed when the split was undone: it's the writer's now, and stays whatever is undone
	    or redone from here on (said once). The split is still remembered, so that no older one of the same text is
	    taken for it. */
	kept?: boolean;
}
const SPLITS_KEPT = 20;
const splits: Split[] = [];
/** The undoing and redoing of splits under way: one at a time, in the order they were asked for. */
let settling: Promise<void> = Promise.resolve();

/** The editor extension that makes an undo right after a split undo all of it (see above). For every Markdown editor:
    a note's tab and a manuscript's sections alike. */
export function splitUndo(plugin: BindersPlugin): Extension {
	// (a plugin turned off and on again starts with nothing remembered: its editors' histories aren't its own any more)
	plugin.register(() => { splits.length = 0; });
	return EditorView.updateListener.of((u) => {
		if (!u.docChanged || !splits.length) return;
		const undo = u.transactions.some((tr) => tr.isUserEvent('undo')), redo = u.transactions.some((tr) => tr.isUserEvent('redo'));
		if (!undo && !redo) return;
		const info = u.state.field(editorInfoField, false), file = info?.file;
		if (!file || !splits.some((s) => s.first === file)) return;
		const text = u.state.doc.toString();
		// (the last split of this note first: splits of one note are undone in the order they were made, backwards)
		for (let i = splits.length - 1; i >= 0; i--) {
			const s = splits[i];
			if (s.first !== file || (text !== s.before && text !== s.head)) continue;
			s.want = text === s.before ? 'one' : 'two';
			const editor = info?.editor ?? null, run = () => settleSplit(plugin, s, editor);
			settling = settling.then(run, run);
			break;
		}
	});
}

/** Brings a split's notes in line with what its first note's editor says: one note (the new one trashed, if it's
    untouched) or two (the new one made again). */
async function settleSplit(plugin: BindersPlugin, s: Split, editor: Editor | null): Promise<void> {
	const { app, binders: store } = plugin, forget = () => { const i = splits.indexOf(s); if (i >= 0) splits.splice(i, 1); };
	const folder = s.first.parent;
	if (!folder || app.vault.getAbstractFileByPath(s.first.path) !== s.first) { forget(); return; }
	if (s.want === 'two') {
		if (s.made || !splits.includes(s)) return;
		// the editor has let go of the second half: it's written down again before anything else
		try {
			const taken = (n: string) => n === folder.name || !!app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${n}.md`));
			const index = (store.orderedChildren(folder) ?? []).indexOf(s.first) + 1;
			s.made = await store.newScene(folder, index > 0 ? index : Infinity, taken(s.title) ? nextName(s.title, taken) : s.title, undefined, s.content);
			s.path = s.made.path;
		} catch (e) {
			// it can't be: the second half goes back where it was, so it's still in a note
			say(e);
			s.want = 'one';
			try { editor?.undo(); } catch { /* an editor that has gone: its note on disk still has the text */ }
			return;
		}
		const made = s.made;
		await saveOpen(app, [s.first]).catch(say);
		if (s.moved.headings.size || s.moved.blocks.size) s.linked = await repoint(app, s.first, made, (sub) => pointsAt(sub, s.moved), [made], s.linked).catch((e) => { say(e); return s.linked; });
		return;
	}
	const made = s.made;
	if (!made || s.kept) return;
	// (deleted by hand since: there's nothing to take back, and nothing is in two places)
	if (app.vault.getAbstractFileByPath(made.path) !== made) { forget(); return; }
	const stays = (why: string) => { new Notice(`“${made.basename}” ${why}, so it stays. Its text is in “${s.first.basename}” as well now.`, 10000); s.kept = true; };
	try {
		// what's typed anywhere in either and not saved yet is on disk before they're compared with what the split wrote
		await saveOpen(app, [s.first, made]);
		if (s.want !== 'one' || s.made !== made) return; // (redone meanwhile)
		if (made.path !== s.path) { stays('was renamed or moved after the split'); return; }
		if ((await app.vault.read(made)) !== s.content) { stays('was changed after the split'); return; }
		// the first note must have the second half on disk, as it stood there, before the new one is let go (words typed
		// elsewhere in it since the undo are no matter)
		if (!lf(await app.vault.read(s.first)).includes(lf(s.back))) { stays(`couldn’t be taken away, because “${s.first.basename}” changed as the split was undone`); return; }
		// links that followed a heading or a block to the new note lead back to where it is again
		await repoint(app, made, s.first, undefined, [], s.linked).catch(say);
		if (made.path !== s.path || (await app.vault.read(made)) !== s.content) { stays('was changed after the split'); return; }
		await app.fileManager.trashFile(made);
		s.made = null;
	} catch (e) { say(e); }
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
		const bodies = texts.map((t) => parts(t).body);
		await app.vault.process(first, (cur) => {
			// (properties with no line break after them get one, or the text would run into their closing line)
			const p = parts(cur);
			return frontFor(p.front) + joinBodies([p.body, ...bodies]);
		});
		const synopsis = (f: TFile) => { const v: unknown = app.metadataCache.getFileCache(f)?.frontmatter?.[settings.synopsisProp]; return typeof v === 'string' ? v.trim() : ''; };
		const joined = files.map(synopsis).filter((x) => x).join('\n\n');
		if (joined && joined !== synopsis(first)) await store.setProps(first, { [settings.synopsisProp]: joined });
		// read it back: every note's text must be in the merged one before any note is let go
		const now = parts(await app.vault.read(first)).body, flat = (x: string) => x.replace(/\s+/g, ' ').trim();
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

/** Is a note or folder in an export? Not if it says `export: false` (or `compile: false`) itself, or a folder above
    it does (in the folder's note). */
export function isExported(plugin: BindersPlugin, item: TAbstractFile): boolean {
	const { app, binders: store } = plugin, binder = store.binderOf(item);
	const off = (f: TFile | null) => { const fm = f ? app.metadataCache.getFileCache(f)?.frontmatter : null; return !!fm && (fm[EXPORT_PROP] === false || fm[COMPILE_PROP] === false); };
	if (item instanceof TFile && off(item)) return false;
	for (let f = item instanceof TFolder ? item : item.parent; f && binder && f !== binder.folder; f = f.parent) if (off(store.folderNote(f))) return false;
	return true;
}

/** A folder of a binder as one text, in binder order: export's "One note" (see compile() in scene-text.ts). */
export async function oneNoteText(plugin: BindersPlugin, folder: TFolder, options: CompileOptions): Promise<{ text: string; scenes: number }> {
	const { app, binders: store } = plugin, items: CompileItem[] = [];
	let scenes = 0;
	const body = async (f: TFile) => { const b = parts(await app.vault.cachedRead(f)).body; return options.stripTabs ? untab(b) : b; };
	const walk = async (f: TFolder, depth: number): Promise<void> => {
		for (const c of store.orderedChildren(f) ?? []) {
			if (!isExported(plugin, c)) continue;
			if (c instanceof TFolder) { items.push({ kind: 'folder', name: c.name, depth }); await walk(c, depth + 1); }
			else if (isNote(c)) { items.push({ kind: 'scene', name: c.basename, depth, text: await body(c) }); scenes++; }
		}
	};
	await saveOpen(app, store.scenes(folder));
	if (store.binderOf(folder)?.kind === 'longform') for (const f of store.scenes(folder)) { if (isExported(plugin, f)) { items.push({ kind: 'scene', name: f.basename, depth: 0, text: await body(f) }); scenes++; } }
	else await walk(folder, 0);
	return { text: compile(folder.name, items, options), scenes };
}

/** Where "One note" would put a folder's text: where it went last time, or beside the binder (not in it: there it
    would be one of its scenes). */
export function oneNotePath(plugin: BindersPlugin, folder: TFolder): string {
	const binder = plugin.binders.binderOf(folder)?.folder ?? folder, dir = binder.parent && !binder.parent.isRoot() ? binder.parent.path + '/' : '';
	return plugin.settings.compiledTo[folder.path] ?? `${dir}${folder.name} (exported).md`;
}

/** Writes a folder's text, made into one, as a note at the path typed, and opens it. A note there that isn't what
    this last left has someone's writing in it: asked about, never just replaced. Null if the writer said no; throws,
    in words for the writer, if the name can't be used. */
export async function writeOneNote(plugin: BindersPlugin, folder: TFolder, typedPath: string, text: string, scenes: number): Promise<TFile | null> {
	const { app } = plugin;
	const typed = typedPath.replace(/\.md$/i, '').trim(), names = typed.split('/');
	if (!typed) throw new Error('Give the note a name.');
	if (names.some((n) => !n.trim() || n === '.' || n === '..' || n.startsWith('.') || /[*"\\<>:|?]/.test(n))) throw new Error('That name can’t be used: a name can’t start with a dot or have any of * " \\ < > : | ? in it.');
	const path = normalizePath(typed + '.md');
	if (plugin.binders.binderOf(path)) throw new Error('Save it outside the binder: in it, the note would be one of its scenes.');
	const at = app.vault.getAbstractFileByPath(path);
	if (at && !(at instanceof TFile)) throw new Error(`“${path}” is a folder.`);
	// a note that isn't what export last left there has someone's writing in it: asked about, never just replaced
	const memory = plugin.settings.compiled;
	if (at instanceof TFile) {
		const there = await app.vault.read(at);
		if (there !== text && there.trim() && memory[path] !== fingerprint(there)) {
			const replace = await confirm(app, { title: 'Replace this note', text: `“${at.basename}” ${memory[path] ? 'has been changed since it was exported' : 'is already there, and wasn’t made by an export'}. Replace its text with the exported binder?`, cta: 'Replace' });
			if (!replace) return null;
		}
	}
	const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
	if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
	const file = at instanceof TFile ? (await app.vault.modify(at, text), at) : await app.vault.create(path, text);
	delete memory[path];
	memory[path] = fingerprint(text);
	const to = plugin.settings.compiledTo;
	delete to[folder.path];
	to[folder.path] = path;
	for (const k of Object.keys(to).slice(0, -COMPILED_KEPT)) delete to[k];
	for (const k of Object.keys(memory).slice(0, -COMPILED_KEPT)) delete memory[k];
	await plugin.saveData(plugin.settings);
	// in the tab it's open in already, if there is one
	const open = app.workspace.getLeavesOfType('markdown').find((l) => l.view instanceof MarkdownView && l.view.file === file);
	if (open) app.workspace.setActiveLeaf(open, { focus: true });
	// (on a phone in the tab the binder is in, so Back returns to it: a tab of its own there is out of sight)
	else await app.workspace.getLeaf(Platform.isPhone ? false : 'tab').openFile(file);
	new Notice(`Exported ${scenes.toLocaleString()} ${scenes === 1 ? 'note' : 'notes'} into “${file.basename}”.`);
	return file;
}
