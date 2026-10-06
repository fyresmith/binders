# Spike: the editable manuscript (for 0.6)

**A record of the spike, written before the manuscript was built (2026-09-30).** What it decided is built: the wrapper
is `src/view/editable-embed.ts` and the manuscript is `src/view/manuscript.ts`. `tests/e2e/specs-spike-embed.mjs` was
removed once its scenarios moved into `tests/e2e/specs-manuscript.mjs` (and the QA specs). Where this file and
[internals.md](internals.md) differ, internals.md is current; the "0.6" and "0.3" below are plan milestones
(see [plan.md](plan.md)).

Question: can the manuscript stack many notes on one page, each a real, live Markdown editor that edits its own file,
on desktop and mobile, without ever losing text? And what is the smallest, safest route through Obsidian's internals?

**Answer: yes, go**, on desktop and (emulated) mobile, through the same editable Markdown embed that Canvas and hover
popovers use, with a wrapper of about 40 lines and two instance-level patches. It needs virtualization past a few dozen
scenes. Real iOS and Android devices remain untested.

- Tested on: **Obsidian 1.13.7** (`/usr/lib/obsidian/obsidian.asar`, run by `/usr/lib/electron43/electron`), headless,
  2026-09-30.
- Proof: `tests/e2e/specs-spike-embed.mjs`, 18 scenarios, all passing (over several full runs, once with `--repeat 2`, and alongside the smoke specs).
  It built the embeds in the page with plain JS. At 0.6 its scenarios moved into `tests/e2e/specs-manuscript.mjs`,
  against the real manuscript, and the spike spec was deleted.

## The route

`app.embedRegistry.embedByExtension.md(context, file, subpath)` is the factory Obsidian itself uses for `![[note]]`,
Canvas file cards and hover popovers. With `{ app, containerEl, state: {} }` and `subpath: ''` it returns the whole-file
Markdown embed (internally `j1`, a subclass of the editable embed base `i1`, a `Component`). Canvas makes it editable with
`embed.editable = true` and `embed.showEditor()`, which builds a full `MarkdownEditView` (CodeMirror 6, live preview,
Obsidian's own editor extensions, including those from plugins) inside the container. From there the embed:

- keeps `embed.text` current on every keystroke and saves with its own 2 s debounce (`requestSave`), by `vault.modify`
  of the whole file (frontmatter included, exactly as typed);
- pushes unsaved typing live to any other view of the same note (`workspace.onQuickPreview`), and takes live typing from
  them, so a note open in a tab and in the manuscript stay in sync both ways (tested);
- sets `workspace.activeEditor` to itself when its CodeMirror gets focus (and updates the mobile toolbar), so hotkeys,
  palette commands and the mobile toolbar act on the focused section with no work from us;
- has its own undo history, find (`showSearch`), folds (saved per file, shared with the note), and inline title.

The alternatives are worse: `WidgetEditorView`/`ScrollableMarkdownEditor` from the prototype chain would mean wiring
saving, reloading and focus ourselves, the part that loses writing. A `MarkdownView` per scene in hidden leaves is heavy
and fights the workspace. The embed is the unit Obsidian already ships for this and is used by a core plugin (Canvas),
so it is the least likely to break without notice.

### The wrapper (sketch for `src/view/manuscript.ts`)

```ts
import { App, Component, TFile, Editor } from 'obsidian';

// Undocumented: the editable Markdown embed Canvas uses. Everything we touch is listed in `supported()`.
interface MdEmbed extends Component {
	editable: boolean; file: TFile; text: string; data: string; dirty: boolean; lastSavedData: string | null;
	editMode: { sourceMode: boolean; get(): string; toggleSource(): void; saveHistory(): void } | null;
	editor: Editor | undefined;
	requestSave: { cancel(): void };
	loadFile(): Promise<void>; showEditor(): void; save(text: string, now?: boolean): Promise<void>;
	set(text: string, force?: boolean): void; loadFileInternal(data: string, cache?: unknown): void;
	onFileChanged(file: TFile, data: string, cache: unknown): void;
}
type Factory = (ctx: { app: App; containerEl: HTMLElement; state: object }, file: TFile, subpath: string) => MdEmbed;

const factory = (app: App): Factory | null => (app as any).embedRegistry?.embedByExtension?.md ?? null;

/** Feature check, once at load. False means: use the read-only manuscript. */
export function supported(app: App, probeFile: TFile): boolean {
	const create = factory(app);
	if (typeof create !== 'function' || typeof (app.workspace as any).unsetActiveEditor !== 'function') return false;
	const e = create({ app, containerEl: createDiv(), state: {} }, probeFile, '');
	const proto = Object.getPrototypeOf(e);
	return ['loadFile', 'showEditor', 'save', 'set', 'loadFileInternal', 'onFileChanged'].every((k) => typeof proto[k] === 'function')
		&& 'editable' in e && typeof e.requestSave?.cancel === 'function';
}

export interface Section { editor: Editor | undefined; embed: MdEmbed; save(): Promise<void>; unload(): Promise<void>; }

export async function mountEditor(app: App, container: HTMLElement, file: TFile, parent: Component): Promise<Section> {
	const embed = factory(app)!({ app, containerEl: container, state: {} }, file, '');
	const proto = Object.getPrototypeOf(embed);
	embed.editable = true;
	// 1. Native embeds ignore external changes while they have unsaved typing, then overwrite them when the debounced
	//    save runs (proved by the spike). loadFileInternal already does Obsidian's 3-way merge when dirty: always call it.
	embed.onFileChanged = function (f, data, cache) { if (f === this.file && data !== this.data) this.loadFileInternal(data, cache); };
	parent.addChild(embed); // load(): subscribes metadataCache 'changed' (bound now, so patch 1 must come first)
	await embed.loadFile(); // must finish before any typing: save() is a no-op until lastSavedData is set
	// 2. A reload calls set(text, true), which rebuilds the CodeMirror state: cursor, scroll and undo history lost.
	//    Non-forced set() applies the change as a minimal diff instead, like a normal note does.
	embed.set = function (text: string) { proto.set.call(this, text, false); };
	const prev = activeDocument.activeElement as HTMLElement | null;
	embed.showEditor();
	// The manuscript hides properties; with "Live preview" off in the vault the editor would show raw frontmatter.
	if (embed.editMode?.sourceMode) embed.editMode.toggleSource(); // this editor only; the vault setting is untouched
	// showEditor() focuses the new editor (on mobile that raises the keyboard). Mounting must not move focus.
	if (container.contains(activeDocument.activeElement)) {
		(app.workspace as any).unsetActiveEditor(embed);
		if (prev && prev !== activeDocument.body && prev.isConnected) prev.focus({ preventScroll: true });
		else (activeDocument.activeElement as HTMLElement).blur();
	}
	const save = async () => {
		embed.requestSave.cancel();
		if (embed.editMode) embed.text = embed.editMode.get();
		if (embed.dirty) await embed.save(embed.text, true);
	};
	return {
		get editor() { return embed.editor; }, embed, save,
		async unload() {
			await save(); // don't rely on the debounce firing after unload (it does today, but that's luck)
			embed.editMode?.saveHistory(); // Obsidian's per-file undo cache (last 20 files): a remount gets undo back
			parent.removeChild(embed); // unload(): removes listeners, keymap scope and activeEditor
			container.empty();
		},
	};
}
```

And in `styles.css`, with the manuscript's root class (the variables are Obsidian's own, so no specificity fight):

```css
.binders-manuscript { --metadata-display-editing: none; --metadata-display-reading: none; }
.binders-manuscript .markdown-embed-link { display: none; }  /* the "open note" corner icon */
.binders-manuscript .inline-title { display: none; }          /* or keep it: it's the scene title, and renames the file */
```

(Obsidian's `.inline-embed` class hides the same two things, but carries other inline-embed styles; the variables are
cleaner.) The embed also adds `.markdown-embed` borders and padding; the manuscript should restyle those like Canvas does
(`.canvas-node-content.markdown-embed …` in `app.css` is a good model).

## What the spike proved

| # | Scenario | Result |
|---|---|---|
| 1 | Typing (CDP `Input.insertText` + Enter) into section 2, no manual save | After the 2 s debounce, exactly that file changes; the other five notes are byte-identical |
| 2 | Hotkeys | Ctrl+B (an Obsidian hotkey, via `activeEditor`) bolds in the focused section only; `editor:toggle-italics` from the palette too |
| 2 | Undo/redo (Ctrl+Z / Ctrl+Shift+Z, CodeMirror's keymap) | Separate history per section; undo in one never touches another |
| 3 | External edit to a clean section | Appears within ~1 s; cursor and undo history kept (with patch 2) |
| 3 | External edit during unsaved typing | **Native: the external edit is silently overwritten** by the pending save (test documents this). With patch 1: both kept, via Obsidian's merge, with its "merged" notice |
| 3 | `processFrontMatter` (what the corkboard does) during unsaved typing | Both kept |
| 3 | Same note open in a tab | Typing in either shows in the other before any save; disk ends with both |
| 4 | Properties hidden | Yes, with the CSS variables above. Body typing keeps frontmatter byte-for-byte. Ctrl+A then typing replaces only the body (live preview protects the properties block even when hidden) |
| 4 | Vault with live preview off | Raw frontmatter would show; `editMode.toggleSource()` puts that editor in live preview without touching the setting |
| 5 | Teardown | Pending typing saved immediately; every `metadataCache` listener removed; no editors left; no keymap scope left; `activeEditor` not left on a dead embed; no console errors; no late save afterwards |
| 5 | Closing the leaf without our flush | Still saved, only because the stale debounce fires after unload. The wrapper flushes anyway |
| 5 | Unmount then remount (virtualization) | Text kept, and undo reaches typing from before the unmount, if the wrapper calls `saveHistory()` |
| 6 | Cost | See below |
| 7 | Mobile (`app.emulateMobile(true)`) | All of the above that matters: live editors, no iframes, the mobile toolbar shows for the focused section, `editor:toggle-bold`, `editor:undo`/`editor:redo` (mobile-only commands) act on it, external merge, save on teardown |
| 8 | Read-only fallback | `MarkdownRenderer.render(app, body, el, path, component)` per note, frontmatter stripped with `metadataCache` `frontmatterPosition` |

## Cost

Scenes of about 9 KB (8 paragraphs), mounted one after another into one scroller, desktop, headless:

| Sections | Mount | Per section | DOM nodes | JS heap (after GC) | Unload |
|---|---|---|---|---|---|
| 50 | 0.71–0.78 s | 14–15 ms | 2.7k | +4–6 MB | 14 ms |
| 200 | 6.6–6.8 s | 33–34 ms | 10.8k | +13 MB | 50 ms |
| 50, emulated mobile | 0.65–0.76 s | ~14 ms | | | |

- Mounting gets slower per section as the page grows (each new editor measures itself against a longer document), so
  the cost is worse than linear. Not focusing on mount doesn't change that much (13 → 10 ms per section at 30).
- Memory is modest (~70 KB of JS heap per section, plus native DOM) and returns to baseline on unload.
- A real phone will be several times slower than this desktop run.

## Recommendation: virtualization

Mount a live editor only for the sections in or near the viewport; show the rest as placeholders.

- Placeholder: the rendered note (`MarkdownRenderer`, cheap and read-only) or a fixed-height box sized from a cached
  height, so the scrollbar and scroll position stay stable.
- An `IntersectionObserver` on the placeholders with a margin of about one screen mounts and unmounts. Budget: about
  10 live editors at once (about 150 ms to fill a screen on desktop). Mount in `requestIdleCallback`/one per frame while
  scrolling fast.
- Unmount with `unload()` above: save, `saveHistory()`, then remove. Keep the section that has focus, or unsaved
  typing, always mounted.
- Obsidian's history cache holds 20 files; undo history of a scene scrolled far away and unmounted beyond that is lost,
  like closing a tab. Acceptable; document it.
- Measure again on a real iPhone and a mid-range Android at 0.6. If mounting is too slow there, keep fewer live editors
  on phones and mount on tap (Canvas's model).

## Sharp edges (the wrapper handles all of these; keep the tests)

1. **Clobbering external edits** (patch 1). Native embeds skip `metadataCache 'changed'` while dirty, then save over the
   change. Our override must be set *before* `load()`, because `load()` binds the handler.
2. **Forced reload loses undo and cursor** (patch 2). Override `set()` *after* `loadFile()`.
3. **`save()` is a no-op until `loadFile()` resolves** (`lastSavedData === null`). Never let the user type into a section
   before `loadFile()` resolves; mount the editor only after it.
4. **`showEditor()` steals focus** (and would raise the keyboard on mobile each time a section scrolls in). Restore focus
   and unset the active editor.
5. **Live preview off in the vault** shows raw frontmatter. `toggleSource()` per editor. Obsidian may reapply the setting
   on a config change (`onConfigChanged`); re-check `sourceMode` on the `css-change`/config events at 0.6.
6. **Pending save after unload** happens to work today (the 2 s debounce still fires). Always flush in `unload()`.
7. **Deleted file**: `save()` quietly does nothing if `file.deleted`. The manuscript should drop the section on
   `vault.on('delete')`. Renames need nothing: the embed keeps the same `TFile` and updates its title.
8. **Inline title is editable and renames the file** on blur. Hide it, or keep it on purpose as the scene heading.
9. **Commands**: `editor:undo`/`editor:redo` are mobile-only commands; on desktop undo is CodeMirror's Ctrl+Z. Find
   (Ctrl+F) searches the focused section only; a manuscript-wide find is our own feature if wanted.
10. **Test harness quirk** (not an embed issue): headless, `activeWindow` points at an `about:blank` iframe, so
    Obsidian's keymap looks at the wrong window and *no* hotkey fires, even in a normal note. The spike sets
    `window.activeWindow = window` first. `tests/e2e/driver.mjs` should do that after launch (the coordinator's file).

## Feature detection and fallback

- At plugin load: `supported()` above. If it fails, or if mounting throws, the manuscript is read-only: each note
  rendered with the public `MarkdownRenderer.render(app, body, el, file.path, component)`, frontmatter removed with
  `metadataCache.getFileCache(file).frontmatterPosition`, with a one-time notice and "Open note" on each section.
  Double-click or Enter on a section opens the note in a tab for editing.
- Wrap each `mountEditor()` in `try`/`catch`: a failure degrades that section to the rendered placeholder, never the page.
- Add to `docs/dev/internals.md` (0.6): `app.embedRegistry.embedByExtension.md`, the embed's `editable`, `loadFile`,
  `showEditor`, `save`, `set`, `loadFileInternal`, `onFileChanged`, `requestSave`, `text`/`data`/`dirty`,
  `editMode.get`/`sourceMode`/`toggleSource`/`saveHistory`, `workspace.unsetActiveEditor`.

## Go / no-go

- **Desktop: go.** Every "never lose writing" case the spike could think of passes with the wrapper, including the one
  native embeds get wrong.
- **Mobile: go, provisionally.** The same code works with `app.isMobile` (emulated): editing, the mobile toolbar,
  undo/redo commands, merging, saving. Unproven until tested on real iOS (WebKit) and Android: keyboard and scroll
  behavior with many editors in one scroller, selection handles, and speed. Put a device test of this spike's scenarios
  on the 0.3 device checklist, well before 0.6.
- Porting to 0.6: move `mountEditor()` into `src/view/manuscript.ts`, and move these scenarios into
  `specs-manuscript.mjs` against the real view. Then delete this spike spec.
