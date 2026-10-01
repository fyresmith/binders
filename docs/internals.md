# Obsidian internals Binders relies on

Undocumented APIs can change in any Obsidian update. Each one is wrapped in a single function with a feature check and
a fallback, and has an e2e test. Keep this list current.

| Internal | Where | Used for | Fallback | Test |
|---|---|---|---|---|
| File explorer view's `getSortedFolderItems(folder)`, patched on its prototype with `monkey-around` | `src/explorer.ts` | Binder order, and hiding binder and folder notes | Obsidian's own order and all notes shown, with a one-time notice | `specs-explorer.mjs` |
| File explorer view's `fileItems` (path → item with `file`, `selfEl`, `innerEl`) | `src/explorer.ts` | Putting the binder icon on binder folders | No icon (only used when the patch is possible) | `specs-explorer.mjs` |
| File explorer view's `requestSort()` (or `sort()`) | `src/explorer.ts` | Re-sorting after a binder changes, a setting changes, and on unload | Obsidian re-sorts on its next file change | `specs-explorer.mjs` |
| Explorer DOM: `.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title[data-path]`, `.collapse-icon` | `src/explorer.ts` | Click (or tap) to open a binder; Mod-click or middle-click for a new tab | Clicking only expands the folder, as usual | `specs-explorer.mjs` |
| A menu item's `setSubmenu()` (returns the submenu, a `Menu`) | `src/view/internals.ts` | "Set status" and "Set label" on the corkboard | The item opens the submenu as a menu of its own | `specs-corkboard.mjs` |
| An `ItemView`'s `titleEl`, and `leaf.updateHeader()` | `src/view/internals.ts` | The header and tab titles when a binder view changes folder, or its folder is renamed | The titles catch up when the view is next opened | `specs-view.mjs` |
| `app.embedRegistry.embedByExtension.md(ctx, file, '')`: the editable Markdown embed Canvas and hover popovers use | `src/view/editable-embed.ts` | One live editor per manuscript section | The whole manuscript read only (rendered with the public `MarkdownRenderer`), with a notice; clicking a section opens its note | `specs-manuscript.mjs` (the fallback test removes it) |
| The embed's `editable`, `loadFile()`, `showEditor()`, `save(text, now)`, `set(text, clear)`, `loadFileInternal(data, cache)`, `onFileChanged`, `requestSave.cancel()`, `text`/`data`/`dirty`, `unload()` | `src/view/editable-embed.ts` | Mounting, saving, merging outside edits, flushing on teardown (see below) | Checked in `embedSupported()`; a section whose mount throws stays rendered | `specs-manuscript.mjs` |
| The embed's `editMode`: `get()`, `sourceMode`, `toggleSource()`, `saveHistory()`, `cm` (the CodeMirror `EditorView`) | `src/view/editable-embed.ts` | Reading typing, keeping live preview, undo across remounts, moving the caret between sections | Without `cm`, arrow keys stop at a section's edge (no crossing) | `specs-manuscript.mjs` |
| `workspace.unsetActiveEditor(editor)` | `src/view/editable-embed.ts` | Mounting a section doesn't make it the active editor | Required by `embedSupported()` | `specs-manuscript.mjs` |
| `workspace.onQuickPreview(file, text)` | `src/view/editable-embed.ts` | After merging an outside edit into unsaved typing, other views of the note get the merged text | Skipped if missing (other views then show the outside version until the save lands, as in Obsidian) | `specs-manuscript.mjs` (same note in a tab) |
| `vault.getConfig('readableLineLength')`, and `vault.on('config-changed')` for changes | `src/view/internals.ts` (`readableLineLength`), `src/view/BinderView.ts` | The manuscript's page follows the editor's "Readable line length" | Readable width, as by default | `specs-themes.mjs` |
| `vault.on('config-changed')` | `src/view/manuscript.ts` | Keeping sections in live preview when the vault's editing mode changes | Also checked on `css-change` | `specs-manuscript.mjs` |
| `app.plugins.plugins.longform` (loaded plugins by id) | `src/longform.ts` (`longformRunning`) | Leaving rename and delete tracking in Longform projects to Longform while it runs, so the index note isn't written twice | Treated as not running: Binders writes renames and deletes itself (the same change Longform would make) | `specs-longform.mjs` (a stand-in plugin) |

## The file explorer (checked on Obsidian 1.13.7, desktop and `app.emulateMobile(true)`)

- `getSortedFolderItems(folder: TFolder): FileItem[]` is a method on the explorer view's class. It sorts
  `folder.children` (folders first, by name; notes by the view's `sortOrder`) and maps them to their items in
  `fileItems`. Both the view's `sort()` (for the vault root) and every folder item's `sort()` (for its own children) call
  it, and only its result is shown, so filtering an item out of it hides that item. Binders patches the class, not one
  view, so an explorer that's closed and reopened keeps binder order. The patch only rearranges and filters the items the
  original returns, so anything Binders doesn't know about still shows.
- Folders outside binders are left to the original method, so every sort order in the explorer's menu
  (`setSortOrder('alphabetical' | 'alphabeticalReverse' | 'byModifiedTime' | …)`) still works there. Inside a binder,
  binder order wins over the chosen sort order.
- `requestSort` is a debounced own property of the view; `sort()` only runs while the explorer is shown and otherwise
  waits until it is.
- Clicking a folder title runs the view's `onFileClick` → item `onSelfClick` → `toggleCollapsed`. Clicking the chevron
  runs `onCollapseClick`, which calls `preventDefault()`. Binders listens for `click` (and `auxclick`, for the middle
  button) on the document after these, never prevents anything, and skips clicks that were prevented or on the chevron,
  so expanding and selecting work as before. Alt-click and Shift-click select in the explorer, so Binders ignores them;
  Mod-click doesn't select there, so it opens the binder in a new tab, as it opens a note. A touch tap on mobile arrives
  as the same `click`.
- Leaves that aren't loaded yet (`leaf.isDeferred`, 1.7.2+) are skipped; Binders patches once a loaded explorer
  appears (`layout-change`).
- Obsidian 1.13 shows notices in a window of their own, so tests find them through a notice's `noticeEl.ownerDocument`.

## The editable embed (checked on Obsidian 1.13.7, desktop and `app.emulateMobile(true)`)

See [spike-manuscript.md](spike-manuscript.md) for why this route. `src/view/editable-embed.ts` is the only module that
touches it; `mountEditor()` builds one embed and patches that instance only:

- **`onFileChanged`**, before `load()` binds it: native embeds skip outside changes while they have unsaved typing, then
  save over them. Ours always goes through `loadFileInternal`, which does Obsidian's 3-way merge when dirty. After a
  merge it passes the merged text to other views of the note (`onQuickPreview`), which Obsidian's own split views don't
  do (they lose text in that case).
- **`set`**, after `loadFile()`: a reload calls `set(text, true)`, which rebuilds the editor (cursor, scroll and undo
  lost); ours applies it as a diff.
- **`save`**: wrapped to report typing (`onChange`) for the word count; the write itself is untouched.
- **`unload`**: whoever tears the embed down (the manuscript, the view closing, the plugin unloading), pending typing is
  written first and `editMode.saveHistory()` keeps undo history for a remount. `destroy()` returns that write, and a
  remount of the same note waits for it, so it never loads the old text.
- `save()` does nothing until `loadFile()` resolves, so the editor is only shown after it.
- `showEditor()` focuses the new editor and queues "scroll to the top of the note" for CodeMirror's next measure. The
  wrapper puts focus back, unsets the active editor, and adds a CodeMirror `EditorView.scrollHandler` (public API) that
  swallows scrolling while the section has no focus, so mounting never moves the page.
- With live preview off in the vault the editor opens in source mode and shows raw frontmatter: `toggleSource()` on that
  editor only; re-checked on `config-changed` and `css-change`.
- Commands and hotkeys need nothing: the embed sets `workspace.activeEditor` to itself when it gets focus (and updates
  the mobile toolbar). On desktop, undo is CodeMirror's own Ctrl+Z; `editor:undo`/`editor:redo` are mobile commands.
- Obsidian keeps undo history for the 20 most recent files; a section scrolled far away and unmounted beyond that loses
  its undo history, as closing a tab does.

## The binder view (checked on Obsidian 1.13.7)

- A view's `setState(state, result)` gets `result.history = false` when only its state changes. Setting it to `true`
  records the change in the tab's history (as file views do when their file changes), so Back returns to the folder
  before. This is public API.
- Obsidian's own hotkey Mod-Enter ("Open link in new tab") runs, and swallows the key, whenever an editor was active
  last, even while a binder view has the focus. The view claims Mod-Enter in its own `scope` while a synopsis is being
  typed. Likewise F2 is Obsidian's "Rename file": the view's `scope` claims it and passes it on to the focused card or
  plotline, which it renames.
- In the e2e harness, `activeDocument` can be another of Obsidian's windows, so menus opened without a position open
  there; the harness focuses the main window before each test, click and right-click.
