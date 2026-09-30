# Obsidian internals Binders relies on

Undocumented APIs can change in any Obsidian update. Each one is wrapped in a single function with a feature check and
a fallback, and has an e2e test. Keep this list current.

| Internal | Where | Used for | Fallback | Test |
|---|---|---|---|---|
| File explorer view's `getSortedFolderItems(folder)`, patched on its prototype with `monkey-around` | `src/explorer.ts` | Binder order, and hiding binder and folder notes | Obsidian's own order and all notes shown, with a one-time notice | `specs-explorer.mjs` |
| File explorer view's `fileItems` (path → item with `file`, `selfEl`, `innerEl`) | `src/explorer.ts` | Putting the binder icon on binder folders | No icon (only used when the patch is possible) | `specs-explorer.mjs` |
| File explorer view's `requestSort()` (or `sort()`) | `src/explorer.ts` | Re-sorting after a binder changes, a setting changes, and on unload | Obsidian re-sorts on its next file change | `specs-explorer.mjs` |
| Explorer DOM: `.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title[data-path]`, `.collapse-icon` | `src/explorer.ts` | Click (or tap) to open a binder | Clicking only expands the folder, as usual | `specs-explorer.mjs` |
| Editable Markdown embeds (as used by Canvas) | `src/view/manuscript.ts` (0.6) | The editable manuscript | Read-only rendered manuscript | `specs-manuscript.mjs` |

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
  runs `onCollapseClick`, which calls `preventDefault()`. Binders listens for `click` on the document after these, never
  prevents anything, and skips clicks that were prevented or on the chevron, so expanding and selecting work as before. A
  touch tap on mobile arrives as the same `click`.
- Leaves that aren't loaded yet (`leaf.isDeferred`, 1.7.2+) are skipped; Binders patches once a loaded explorer
  appears (`layout-change`).
- Obsidian 1.13 shows notices in a window of their own, so tests find them through a notice's `noticeEl.ownerDocument`.
