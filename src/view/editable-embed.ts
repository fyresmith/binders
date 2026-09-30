import type { App, Component, Editor, TFile } from 'obsidian';
import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/* Undocumented: the editable Markdown embed that Canvas, hover popovers and `![[note]]` use. This module is the only
   place Binders touches it; every internal it relies on is checked in `embedSupported()` and listed in
   docs/internals.md. See docs/spike-manuscript.md for why this route, and for the sharp edges handled below. */

interface EditMode {
	sourceMode: boolean;
	cm?: EditorView;
	get(): string;
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

/** Every live editor, by note, across all manuscripts (a split, another tab of the binder): a new one waits for
    the others' pending typing to be written, or it would load the old text and typing in it would lose theirs. */
const openEditors = new Map<TFile, Set<() => Promise<void>>>();

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
	embed.onFileChanged = function (this: MdEmbed, f: TFile, data: string, cache: unknown) {
		if (f !== this.file || data === this.data) return;
		// Another view took our typing live and saved it with its own on top: the file already has ours, and a merge
		// would see two overlapping insertions and keep both (doubled text). Load it as it is.
		if (this.dirty && this.lastSavedData !== null && contains(this.lastSavedData, this.data, data)) this.dirty = false;
		const merging = this.dirty;
		this.loadFileInternal(data, cache);
		// Other views of the note (a tab) took our typing live, then reloaded the outside version and dropped it: give
		// them the merged text, or typing there would carry on from a copy without ours (Obsidian's own split views
		// lose text this way).
		if (merging && this.dirty) (app.workspace as unknown as WorkspaceInternals).onQuickPreview?.(this.file, this.text);
	};
	// Every edit goes through save(text) (the editor calls it on each update); save(text, true) is the real write.
	embed.save = function (this: MdEmbed, text: string, now?: boolean): Promise<void> {
		const p = proto.save.call(this, text, now) as Promise<void>;
		if (!now) opts.onChange?.(text);
		return p;
	};
	// the write in flight: a flush while it runs (dirty is already false) must still wait for it
	let writing: Promise<void> = Promise.resolve();
	const flush = (): Promise<void> => {
		embed.requestSave.cancel();
		if (embed.editMode) embed.text = embed.editMode.get();
		if (embed.dirty) writing = embed.save(embed.text, true);
		return writing;
	};
	// 6. Whoever tears the embed down (us, the view closing, the plugin unloading), typing is written first; the
	//    debounced save isn't relied on. Undo history goes to Obsidian's per-file cache so a remount gets it back.
	let gone = false, saved: Promise<void> = Promise.resolve();
	embed.unload = function (this: MdEmbed) {
		if (!gone) {
			gone = true;
			openEditors.get(file)?.delete(flush);
			if (!openEditors.get(file)?.size) openEditors.delete(file);
			try {
				saved = flush().catch((e) => console.error('Binders: saving failed', e));
				this.editMode?.saveHistory();
			} catch (e) { console.error('Binders: saving failed', e); }
		}
		proto.unload.call(this);
	};

	parent.addChild(embed);
	try {
		await Promise.all([...(openEditors.get(file) ?? [])].map((f) => f()));
		if (gone) throw new Error('Closed while opening.');
		// 3. save() does nothing until loadFile() resolves, so the editor is only shown after it.
		await embed.loadFile();
		if (!openEditors.has(file)) openEditors.set(file, new Set());
		openEditors.get(file).add(flush);
		// 2. A reload calls set(text, true), which rebuilds the editor state: cursor, scroll and undo lost. A plain
		//    set() applies the change as a minimal diff, as a normal note does.
		embed.set = function (this: MdEmbed, text: string) { proto.set.call(this, text, false); };
		const doc = container.ownerDocument;
		const prev = doc.activeElement as HTMLElement | null;
		// showEditor() focuses without preventScroll, so the browser scrolls the new editor into view
		const scrolled: [HTMLElement, number, number][] = [];
		for (let el = container.parentElement; el; el = el.parentElement) if (el.scrollTop || el.scrollLeft) scrolled.push([el, el.scrollTop, el.scrollLeft]);
		embed.showEditor();
		if (!embed.editMode) throw new Error('The embed has no editor.');
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
		// whole manuscript. An editor without focus (in it, or in its find bar) never scrolls the page; one with focus
		// does, as usual. Public CodeMirror API: a handler that returns true has handled the scroll.
		const cm = embed.editMode.cm;
		if (cm && EditorView.scrollHandler) {
			cm.dispatch({ effects: StateEffect.appendConfig.of(EditorView.scrollHandler.of(() => !container.contains(container.ownerDocument.activeElement))) });
		}
		return {
			file,
			get editor() { return embed.editor; },
			get cm() { return embed.editMode?.cm ?? (embed.editor as unknown as { cm?: EditorView })?.cm ?? null; },
			get text() { return embed.editMode ? embed.editMode.get() : embed.text; },
			get dirty() { return embed.dirty; },
			flush,
			destroy() { if (!gone) parent.removeChild(embed); container.empty(); return saved; },
			keepLivePreview,
		};
	} catch (e) {
		parent.removeChild(embed);
		container.empty();
		throw e;
	}
}
