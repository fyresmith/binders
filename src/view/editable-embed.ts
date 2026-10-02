import type { App, Component, Editor, MarkdownView, TFile } from 'obsidian';
import { historyField } from '@codemirror/commands';
import { EditorState, StateEffect, Transaction, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/* Undocumented: the editable Markdown embed that Canvas, hover popovers and `![[note]]` use. This module is the only
   place Binders touches it; every internal it relies on is checked in `embedSupported()` and listed in
   docs/internals.md. See docs/spike-manuscript.md for why this route, and for the sharp edges handled below. */

interface EditMode {
	sourceMode: boolean;
	cm?: EditorView;
	get(): string;
	set(text: string, clear?: boolean): void;
	toggleSource(): void;
	saveHistory(): void;
}

interface MdEmbed extends Component {
	editable: boolean;
	file: TFile;
	/** The body as the editor has it (whole file here, as the subpath is ''). */
	text: string;
	/** What would be written: text plus anything around the subpath (nothing here). */
	data: string;
	dirty: boolean;
	lastSavedData: string | null;
	editMode: EditMode | null;
	editor: Editor | undefined;
	requestSave: { cancel(): void };
	loadFile(): Promise<void>;
	showEditor(): void;
	save(text: string, now?: boolean): Promise<void>;
	set(text: string, clear?: boolean): void;
	loadFileInternal(data: string, cache?: unknown): void;
	onFileChanged(file: TFile, data: string, cache: unknown): void;
	showPreview?: (...args: unknown[]) => void;
	toggleMode?: () => void;
}

type Factory = (ctx: { app: App; containerEl: HTMLElement; state: object }, file: TFile, subpath: string) => MdEmbed;

interface Internals {
	embedRegistry?: { embedByExtension?: Record<string, unknown> };
}
interface WorkspaceInternals { unsetActiveEditor?(editor: unknown): void; onQuickPreview?(file: TFile, data: string): void }

const factory = (app: App): Factory | null => {
	const f = (app as unknown as Internals).embedRegistry?.embedByExtension?.md;
	return typeof f === 'function' ? f as Factory : null;
};

const METHODS = ['loadFile', 'showEditor', 'save', 'set', 'loadFileInternal', 'onFileChanged', 'unload'] as const;

/** Can this Obsidian build give us live, editable embeds? False means: show the manuscript read-only. */
export function embedSupported(app: App, probe: TFile): boolean {
	try {
		const create = factory(app);
		if (!create || typeof (app.workspace as unknown as WorkspaceInternals).unsetActiveEditor !== 'function') return false;
		// constructing an embed has no side effects until it's loaded
		const e = create({ app, containerEl: createDiv(), state: {} }, probe, '');
		const rec = e as unknown as Record<string, unknown>;
		return !!e && METHODS.every((k) => typeof rec[k] === 'function') && 'editable' in e
			&& typeof (e.requestSave as unknown as { cancel?: unknown })?.cancel === 'function';
	} catch {
		return false;
	}
}

/** Does `theirs` already hold the change from `base` to `ours`: our edited start, then anything, then base's untouched
    end? */
export function contains(base: string, ours: string, theirs: string): boolean {
	let p = 0;
	while (p < base.length && p < ours.length && base[p] === ours[p]) p++;
	let e = 0;
	while (e < base.length - p && e < ours.length - p && base[base.length - 1 - e] === ours[ours.length - 1 - e]) e++;
	const head = ours.slice(0, ours.length - e), tail = base.slice(base.length - e);
	return theirs.length >= head.length + tail.length && theirs.startsWith(head) && theirs.endsWith(tail);
}

/** Tabs of `file` that show exactly `text` are told it's what the file holds (their undocumented `lastSavedData`, the
    text a view merges outside changes against): a write of that text is then no change to them. */
function markSaved(app: App, file: TFile, text: string): void {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as unknown as { file?: TFile | null; getViewData?: () => string; lastSavedData?: string | null };
		try {
			if (view.file === file && typeof view.lastSavedData === 'string' && typeof view.getViewData === 'function' && view.getViewData() === text) view.lastSavedData = text;
		} catch { /* a view that isn't as expected merges as it always did */ }
	}
}

/* Undo across a remount. `saveHistory()` puts an editor's undo history in Obsidian's own cache, by the note's path, and
   Obsidian hands it to the next editor of that path whose text is the same *length*. That isn't the same text: after a
   change of equal length made elsewhere while the note had no editor (a word swapped by sync, a history a tab of the
   note left there), undo would apply its steps to a text they were never recorded on. So what went into the cache is
   remembered here, with the text it belongs to, and a new editor keeps a history only if it is that one, on that text. */
interface Step { changes?: unknown[]; mapped?: unknown }
interface History { done?: Step[]; undone?: Step[] }
/** The steps of an editor's undo history that change text, to undo and to redo, as CodeMirror serializes them (public
    API); null if they can't be read. (Its steps that only move the cursor are left out: a new editor adds its own.) */
function stepsOf(cm: EditorView | null): [Step[], Step[]] | null {
	try {
		const h = (cm?.state.toJSON({ history: historyField }) as { history?: History } | undefined)?.history;
		const steps = (b: Step[] | undefined) => (Array.isArray(b) ? b : []).filter((e) => !!e?.changes?.length).map((e) => ({ changes: e.changes, mapped: e.mapped }));
		return h ? [steps(h.done), steps(h.undone)] : null;
	} catch {
		return null;
	}
}
/** Is there anything to undo or redo? Obsidian caches a history only then, and keeps what it had otherwise. */
const hasSteps = (h: [Step[], Step[]]): boolean => h[0].length + h[1].length > 0;
const kept = new Map<TFile, { text: string; history: string }>();

/** Every live editor, by note, across all manuscripts (a split, another tab of the binder): a new one waits for
    the others' pending typing to be written, or it would load the old text and typing in it would lose theirs. */
const openEditors = new Map<TFile, Set<() => Promise<void>>>();

/** The last writes of editors that have just gone (a section scrolled away, a view closed), by note: until one is
    done, the note on disk is behind what was typed. */
const closing = new Map<TFile, Set<Promise<void>>>();

/** Writes down what's typed into these notes in any manuscript and isn't saved yet, and resolves once it's on disk:
    every live editor is flushed, and the last write of an editor that has just gone is waited for. Rejects if a write
    failed. Whatever reads, copies, moves or removes a note goes through this first (`saveOpen` in scenes.ts). */
export async function saveEditors(files: TFile[]): Promise<void> {
	await Promise.all(files.flatMap((f) => [...[...(openEditors.get(f) ?? [])].map((flush) => flush()), ...(closing.get(f) ?? [])]));
}

/** Saves a note's own tab and resolves once its text is on disk. A tab asked to save while an earlier write is on its
    way only notes it (its undocumented `saving`), returns, and writes again when that one lands, with nothing to
    wait on: so this waits until the tab is no longer writing. Without `saving` it is `view.save()` and no more.
    A tab with nothing typed in it is not saved at all: `save()` writes the editor's text, which has the editor's line
    breaks, so a note with Windows line breaks that was merely open would be rewritten. */
export async function saveTab(view: MarkdownView): Promise<void> {
	const v = view as unknown as { saving?: unknown };
	const landed = async () => { for (let i = 0; v.saving === true && i < 1000; i++) await sleep(10); };
	await landed(); // a write already on its way lands first
	const lf = (s: string) => s.replace(/\r\n?/g, '\n');
	if (view.file && lf(view.getViewData()) === lf(await view.app.vault.read(view.file))) return;
	await view.save();
	await landed();
}

/** The live editors a note is open in, in every manuscript (snapshots: a note's text is replaced through the editor it's
    being typed in, so Undo there takes it back). */
const live = new Map<TFile, Set<LiveEditor>>();
export const liveEditors = (file: TFile): LiveEditor[] => [...(live.get(file) ?? [])];

export interface LiveEditor {
	readonly file: TFile;
	readonly editor: Editor | undefined;
	/** The CodeMirror view, for cursor placement across sections; null if it can't be found. */
	readonly cm: EditorView | null;
	/** The text as typed, saved or not. */
	readonly text: string;
	/** Typing not yet written to disk. */
	readonly dirty: boolean;
	/** Writes pending typing now. */
	flush(): Promise<void>;
	/** Saves pending typing, keeps undo history, removes the editor. Resolves when the write is done; mount the note
	    again only after that, or the new editor would load the old text. */
	destroy(): Promise<void>;
	/** Puts the editor back in live preview if Obsidian switched it to source mode (the vault setting changed). */
	keepLivePreview(): void;
}

export interface MountOptions {
	/** Called on every change the editor makes to the text (typing, undo, paste), before it's saved. */
	onChange?(text: string): void;
	/** Called when the editor, with the focus, wants its cursor in sight (a key moved it, text was typed): the
	    manuscript scrolls its page, since the editor has no scrolling of its own here. */
	/** The editor would scroll this position (its cursor) into view: called while it measures itself, so only the page
	    may be read and scrolled here, not the editor asked (`coordsAtPos` would make it measure again). */
	onCaret?(cm: EditorView, pos: number): void;
}

/** Mounts a live editor for `file` into `container`, as a child of `parent`. Throws if the embed can't be built;
    callers show the note read-only then. Doesn't move focus. */
export async function mountEditor(app: App, container: HTMLElement, file: TFile, parent: Component, opts: MountOptions = {}): Promise<LiveEditor> {
	const create = factory(app);
	if (!create) throw new Error('Editable embeds are not available.');
	const embed = create({ app, containerEl: container, state: {} }, file, '');
	const proto = Object.getPrototypeOf(embed) as MdEmbed;
	embed.editable = true;

	// 1. Native embeds ignore outside changes while they have unsaved typing, then save over them. loadFileInternal
	//    already does Obsidian's 3-way merge when dirty, so always go through it. Must be set before load() binds it.
	let changes = 0;
	const changed = function (this: MdEmbed, data: string, cache: unknown) {
		if (data === this.data) return;
		// Another view took our typing live and saved it with its own on top: the file already has ours, and a merge
		// would see two overlapping insertions and keep both (doubled text). Load it as it is.
		if (this.dirty && this.lastSavedData !== null && contains(this.lastSavedData, this.data, data)) this.dirty = false;
		// Another editor of this note (the note in a tab, a second manuscript) wrote a text this editor has shown and
		// typed on from: each shows the other's typing as it happens, so there's nothing in it this one lacks. Merged
		// against the file as this editor last saved it, what both have would go in twice. It's the saved text now, and
		// this editor's own goes over it at its next save.
		else if (this.dirty && shown.includes(data)) { this.lastSavedData = data; return; }
		const merging = this.dirty;
		this.loadFileInternal(data, cache);
		// Other views of the note (a tab) took our typing live, then reloaded the outside version and dropped it: give
		// them the merged text, or typing there would carry on from a copy without ours (Obsidian's own split views
		// lose text this way).
		if (merging && this.dirty) (app.workspace as unknown as WorkspaceInternals).onQuickPreview?.(this.file, this.text);
	};
	embed.onFileChanged = function (this: MdEmbed, f: TFile, data: string, cache: unknown) {
		if (f !== this.file) return;
		const mine = ++changes;
		if (data === this.data) return;
		// Parsing an earlier save can finish during a newer write. Wait for it before checking the file;
		// an actual outside revert to that text must still load normally.
		if (!this.dirty && shown.includes(data)) {
			const saved = this.lastSavedData;
			// (a note deleted meanwhile, or an editor that's gone, has nothing to check)
			const here = () => !gone && app.vault.getAbstractFileByPath(f.path) === f;
			void writing.catch(() => { /* said where it failed */ }).then(() => (here() ? app.vault.read(f) : null)).then((latest) => {
				if (latest !== null && here() && mine === changes && saved === this.lastSavedData && latest === data) changed.call(this, data, cache);
			}).catch((e) => { if (here()) console.error('Binders: checking an outside edit failed', e); });
			return;
		}
		changed.call(this, data, cache);
	};
	// Every edit goes through save(text) (the editor calls it on each update); save(text, true) is the real write.
	embed.save = function (this: MdEmbed, text: string, now?: boolean): Promise<void> {
		// (the other way round: a tab of the note showing this very text takes it as saved, so that typing there while
		// the write is on its way isn't merged with it as if it were an outside change, and doubled)
		if (now && this.dirty && this.lastSavedData !== null && this.lastSavedData !== text) markSaved(app, file, text);
		const p = proto.save.call(this, text, now) as Promise<void>;
		// (one after the other; a write that failed doesn't make every later one look failed)
		if (now) {
			const earlier = writing;
			writing = (async (): Promise<void> => { await earlier.catch(() => { /* whoever waited on it was told */ }); await p; })();
			writing.catch(() => { /* Obsidian says so, and whoever waits on a flush is told */ });
		}
		else { opts.onChange?.(text); show(text); }
		return p;
	};
	// The last few texts this editor has shown (typed here, or taken live from another editor of the note).
	const shown: string[] = [];
	const show = (text: string) => { if (shown[shown.length - 1] !== text) { shown.push(text); if (shown.length > 32) shown.shift(); } };
	// the write in flight: a flush while it runs (dirty is already false) must still wait for it
	let writing: Promise<void> = Promise.resolve();
	// true while text from elsewhere is put into an editor that doesn't have the cursor (see `set`, below)
	let apart = false;
	const flush = async (): Promise<void> => {
		// (no more turns than a writer could keep it busy for by typing through every write)
		for (let turn = 0; turn < 12; turn++) {
			embed.requestSave.cancel();
			const text = embed.editMode?.get() ?? embed.text;
			// An editor update may not have reached the embed yet when a command asks to save.
			// (An editor's text has no Windows line endings, whatever the note has: that alone is nothing to save, or a note
			// only shown would be written again without them.)
			if (text !== embed.text && text !== embed.text.replace(/\r\n?/g, '\n')) void embed.save(text);
			// (that asked for a save later, which would write this text again after the editor is gone, over anything typed
			// in a tab of the note since)
			embed.requestSave.cancel();
			if (embed.dirty) void embed.save(embed.text, true);
			const asked = writing;
			await asked;
			// A write asked for while an earlier one is on its way isn't made: Obsidian only notes it, says the text is
			// saved, and when the earlier write lands asks for a save two seconds on. Whoever waited here (a delete, a
			// split, a new editor of the note) would go on with the older text on disk, and a note deleted then would be
			// in the trash without its last words. So: again, until what the editor has is what was written.
			if (asked === writing && !embed.dirty) break;
		}
		// (Obsidian's "save again", once noted, asks for one more save after every write: there's nothing left to
		// write, and an editor that's gone mustn't write later)
		if (gone) embed.requestSave.cancel();
	};
	const cmOf = (): EditorView | null => embed.editMode?.cm ?? (embed.editor as unknown as { cm?: EditorView })?.cm ?? null;
	// 6. Whoever tears the embed down (us, the view closing, the plugin unloading), typing is written first; the
	//    debounced save isn't relied on. Undo history goes to Obsidian's per-file cache so a remount gets it back.
	//    (Only a history known to belong to this text: `known`, below.)
	let gone = false, saved: Promise<void> = Promise.resolve(), made: LiveEditor | null = null, known = false;
	const keepHistory = (edit: EditMode | null) => {
		const cm = cmOf(), h = known && edit ? stepsOf(cm) : null;
		if (!h) return;
		edit.saveHistory();
		if (!hasSteps(h)) return;
		kept.delete(file);
		kept.set(file, { text: cm.state.doc.toString(), history: JSON.stringify(h) });
		if (kept.size > 20) for (const oldest of kept.keys()) { kept.delete(oldest); break; } // as many as Obsidian keeps
	};
	embed.unload = function (this: MdEmbed) {
		if (!gone) {
			gone = true;
			openEditors.get(file)?.delete(flush);
			if (!openEditors.get(file)?.size) openEditors.delete(file);
			if (made) { live.get(file)?.delete(made); if (!live.get(file)?.size) live.delete(file); }
			try {
				const last = flush();
				saved = last.catch((e) => console.error('Binders: saving failed', e));
				// until it's written, whoever reads or removes the note waits for it (`saveEditors`)
				if (!closing.has(file)) closing.set(file, new Set());
				closing.get(file)?.add(last);
				void saved.then(() => { closing.get(file)?.delete(last); if (!closing.get(file)?.size) closing.delete(file); });
				keepHistory(this.editMode);
			} catch (e) { console.error('Binders: saving failed', e); }
		}
		proto.unload.call(this);
	};

	parent.addChild(embed);
	try {
		await saveEditors([file]);
		if (gone) throw new Error('Closed while opening.');
		// 3. save() does nothing until loadFile() resolves, so the editor is only shown after it.
		await embed.loadFile();
		if (!openEditors.has(file)) openEditors.set(file, new Set());
		openEditors.get(file).add(flush);
		// The text as loaded is one this editor has shown. Obsidian's indexer reads a note, works on it, and only
		// then tells what it read: on a busy machine (a phone just started, a big vault) that can be after the first
		// words typed here were saved, and taken at its word it would put the note back as it was when opened.
		show(embed.text);
		// 2. A reload calls set(text, true), which rebuilds the editor state: cursor, scroll and undo lost. A plain
		//    set() applies the change as a minimal diff, as a normal note does.
		//    Text that arrives this way while the cursor isn't in this editor (another app, sync, another editor of the
		//    note) is no step of its undo history: undo here takes back what was typed here, never words the writer
		//    didn't put in and may not have seen arrive. With the cursor here it's a step like any other, as in a tab.
		embed.set = function (this: MdEmbed, text: string) {
			show(text);
			const was = apart;
			apart = !cmOf()?.hasFocus;
			try { proto.set.call(this, text, false); } finally { apart = was; }
			// What the editor holds now is this text. Obsidian leaves `data` (what it takes for "ours") at the text
			// from before when a change is loaded, merged in, or taken live from a tab of the note. The next outside
			// change was then merged against that: the one just taken in read as one the writer had taken out, and
			// was dropped (a status set, then a label: the status gone; a sync's two writes: the first gone). And a
			// change back to the older text (an undo in the note's tab) looked like no change, and never showed.
			this.data = this.text;
		};
		const doc = container.ownerDocument;
		const prev = doc.activeElement as HTMLElement | null;
		// showEditor() focuses without preventScroll, so the browser scrolls the new editor into view
		const scrolled: [HTMLElement, number, number][] = [];
		for (let el = container.parentElement; el; el = el.parentElement) if (el.scrollTop || el.scrollLeft) scrolled.push([el, el.scrollTop, el.scrollLeft]);
		embed.showEditor();
		if (!embed.editMode) throw new Error('The embed has no editor.');
		// 8. The undo history Obsidian gave this editor (see `kept`) stays only if it was recorded on this very text.
		//    Otherwise the editor is built again with none: `set(text, true)` looks the history up by the editor's
		//    path, so for that one call it has no path.
		const edit = embed.editMode, given = stepsOf(cmOf()), mine = kept.get(file);
		if (!given || (hasSteps(given) && !(mine && mine.text === edit.get() && mine.history === JSON.stringify(given)))) {
			try {
				Object.defineProperty(edit, 'path', { value: '', configurable: true });
				try { edit.set(edit.get(), true); } finally { delete (edit as { path?: string }).path; }
			} catch (e) { if (given) throw e; }
			const now = stepsOf(cmOf());
			// better a section that can't be typed in than an undo that takes out text it never put in
			if (now && hasSteps(now)) throw new Error('The undo history of another text could not be dropped.');
		}
		known = !!given;
		// 7. An embed leaves its editor for its reading view on Escape and on "Toggle reading view", and destroys the
		//    editor as it goes: in the manuscript that would leave a section that can't be typed in. Here a section
		//    is always its editor.
		embed.showPreview = () => { /* stays an editor */ };
		embed.toggleMode = () => { /* stays an editor */ };
		// 5. Properties are hidden; with live preview off in the vault the editor would show raw frontmatter.
		const keepLivePreview = () => { if (embed.editMode?.sourceMode) embed.editMode.toggleSource(); };
		keepLivePreview();
		// 4. showEditor() focuses the new editor (on mobile that raises the keyboard). Mounting must not move focus or
		//    scroll.
		if (container.contains(doc.activeElement)) {
			(app.workspace as unknown as WorkspaceInternals).unsetActiveEditor?.(embed);
			if (prev && prev !== doc.body && prev.isConnected) prev.focus({ preventScroll: true });
			else (doc.activeElement as HTMLElement).blur();
		}
		for (const [el, top, left] of scrolled) { el.scrollTop = top; el.scrollLeft = left; }
		// Obsidian also queues "scroll to the top of the note" for CodeMirror's next measure, which would scroll the
		// whole manuscript; and an editor asked to scroll to a cursor that's off screen measures itself over and over
		// ("Measure loop restarted"). So the editor never scrolls the page: a handler that returns true has handled the
		// scroll (public CodeMirror API). Instead, whenever it would have scrolled its cursor into view, it says so, and
		// the manuscript moves its page.
		const cm = embed.editMode.cm, added: Extension[] = [];
		if (cm && EditorView.scrollHandler) added.push(EditorView.scrollHandler.of((view, range) => {
			if (view.hasFocus) { try { opts.onCaret?.(view, range.head); } catch (e) { console.error(e); } }
			return true;
		}));
		// (2, above) text from elsewhere, taken while the cursor is elsewhere, stays out of the undo history: CodeMirror
		// then moves the steps it has along with the change, as it does for a collaborator's edits (public API)
		if (cm) added.push(EditorState.transactionExtender.of(() => apart ? { annotations: Transaction.addToHistory.of(false) } : null));
		if (cm) cm.dispatch({ effects: StateEffect.appendConfig.of(added) });
		made = {
			file,
			get editor() { return embed.editor; },
			get cm() { return cmOf(); },
			get text() { return embed.editMode ? embed.editMode.get() : embed.text; },
			get dirty() { return embed.dirty; },
			flush,
			destroy() { if (!gone) parent.removeChild(embed); container.empty(); return saved; },
			keepLivePreview,
		};
		if (!live.has(file)) live.set(file, new Set());
		live.get(file)?.add(made);
		return made;
	} catch (e) {
		parent.removeChild(embed);
		container.empty();
		throw e;
	}
}
