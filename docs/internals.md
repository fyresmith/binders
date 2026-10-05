# Obsidian internals Binders relies on

Undocumented APIs can change in any Obsidian update. Each one is wrapped in a single function with a feature check and
a fallback, and has an e2e test. Where one of those is still missing, the table says so. Keep this list current.

The whole table was read against the code on 2026-10-02 (Obsidian 1.13.7): each row's place, its feature check, its fallback and its test. A cell that says "none" or "unchecked" is a gap in the code or the tests, not a promise.

| Internal | Where | Used for | Fallback | Test |
|---|---|---|---|---|
| File explorer view's `getSortedFolderItems(folder)`, patched on its prototype with `monkey-around` | `src/explorer.ts` | Binder order, and hiding binder and folder notes. The method is also called once, on the vault's root, to tell whether Binders' patch is still part of it after the method on the class has changed (`intact`): another plugin that patched it and let go would take Binders' patch with it, and Binders then patches again | Obsidian's own order and all notes shown, with a one-time notice (checked in `isExplorerView`) | `specs-explorer.mjs` |
| File explorer view's `fileItems` (path → item with `file`, `selfEl`, `innerEl`) | `src/explorer.ts` | The “binder” tag on binder folders (Obsidian's own `nav-file-tag` class), the label dot after a labeled item's name, and `is-active` on the folder a binder view in front shows | No tag, no dots, no mark (only used when the patch is possible; an item without `selfEl` is skipped) | `specs-explorer.mjs` (the icon), `specs-labels.mjs` (the dots) |
| A folder item's `collapsed` and `toggleCollapsed(animate)`, and the explorer's `tree.handleItemSelection(event, item)` | `src/explorer.ts` (`onClickFirst`) | A click that opens a folder's view doesn't also fold the folder: the click is taken ahead of Obsidian when the folder is open and its view isn't in front. A click on the folder whose view is in front (marked `is-active`, which Obsidian would only focus) folds or unfolds it | The click isn't taken: the view opens and the folder folds, as Obsidian does it | `specs-explorer.mjs` (a click that opens a folder's view doesn't fold it) |
| File explorer view's `requestSort()` (or `sort()`) | `src/explorer.ts` | Re-sorting after a binder changes, a setting changes, and on unload | Obsidian re-sorts on its next file change | `specs-explorer.mjs` |
| File explorer view's `startRenameFile(file)` | `src/explorer.ts` (`renameInExplorer`) | "New folder from selection" in the explorer's menu leaves the new folder's name ready to type, as Obsidian's "New folder" does | The folder keeps the name "Untitled" | `specs-explorer.mjs` |
| Explorer DOM: `.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title[data-path]`, `.collapse-icon` | `src/explorer.ts` | Click (or tap) to open a binder; Mod-click or middle-click for a new tab | Clicking only expands the folder, as usual | `specs-explorer.mjs` |
| Explorer DOM while dragging: `.nav-file-title` and `.nav-folder-title` with `data-path`, `.tree-item-self[data-path]`, `.tree-item-inner`, `.tree-item-children`, `is-collapsed` on a folder's item, `.nav-files-container` | `src/explorer.ts` (`placeAt`, `onDragOver`) | Which row the pointer is over, whether a folder is open, where names start (the line's indent, and "further left is after the folder"), and the list's edges | No title under the pointer: the drag is Obsidian's own. Without `.tree-item-inner` the row's own edge is used; without `.nav-files-container` the line isn't clipped | `specs-explorer.mjs`, `specs-qa2-explorer.mjs` |
| `app.dragManager`: `draggable` (`{ type: 'file' \| 'folder', file }` or `{ type: 'files', files }`), `setAction(text)`, `updateHover(el, cls)` | `src/explorer.ts` | Dragging in the explorer to reorder a binder: what's being dragged, the hint under the pointer (or why a drop is refused), clearing Obsidian's folder tint | Without `dragManager` or `draggable` nothing is taken: dragging in the explorer is Obsidian's own (it moves things into folders). `setAction` and `updateHover` are optional: without them there's no hint | `specs-explorer.mjs`, `specs-qa2-explorer.mjs` |
| `app.dragManager`: `dragFile(event, file, source)`, `dragFolder(…)`, `dragFiles(…)`, `onDragStart(event, draggable)`, `onDragEnd()`, `ghostEl`, `dragStart.moved`, and a `draggable` set by hand (`{ source, type: 'files', icon, title, files }`) | `src/view/file-drag.ts` | A card or an outliner row dragged out of the binder view is handed to Obsidian as a file drag, as a row of the file explorer hands it one; over a canvas a folder is offered as the notes in it | `FileDrag.begin()` returns null without any of the five methods (or on a phone, or in a window of its own): a drag never leaves the view, and a drop outside it moves nothing, as before | `specs-card-file-drag.mjs` (each target; the fallback test hides `dragFile`) |
| Drag events made by hand (`new DragEvent('dragstart' \| 'dragenter' \| 'dragover' \| 'dragleave' \| 'drop' \| 'dragend', { dataTransfer: new DataTransfer() })`, with `dropEffect` and `effectAllowed` defined on the `DataTransfer`, which ignores them otherwise), sent to `document.elementFromPoint()` | `src/view/file-drag.ts` | What is under the pointer hears of the drag as it would of a real one: Obsidian's drop handlers (`dragManager.handleDrop`), the editor's, the canvas's and the explorer's own | Without `DataTransfer` or `DragEvent` constructors, `FileDrag.begin()` returns null. A drop no one takes (`defaultPrevented` false) leaves the card where it was | `specs-card-file-drag.mjs` |
| DOM: `.workspace-leaf` (the view's pane, else `.view-content`), `.workspace-tabs > .workspace-tab-header-container .workspace-tab-header.is-active` (its own tab), `.canvas-wrapper`, `.workspace-leaf-content[data-type="bookmarks"] .tree-item`; the class `drag-ghost` of Obsidian's ghost (ours are added: `binders-file-ghost`, `mod-morph`, `is-leaving`) | `src/view/file-drag.ts`, `styles.css` | Where the drag is the view's own (its pane, header and tab); a canvas; an empty list of bookmarks, which is sent nothing (its handler throws: it reads the last item of the list); the ghost a card shrinks into | Without `.workspace-leaf` the view's content is the pane; without the others, nothing is special-cased and the ghost only appears and disappears | `specs-card-file-drag.mjs` |
| A folder item's `collapsed` and `setCollapsed(collapsed, animate)` (else `toggleCollapsed`) | `src/explorer.ts` (`springOpen`) | A folded folder in a binder springs open under a drag held over its middle (Obsidian's own timer never starts for a row whose event Binders took) | It stays folded | `specs-card-file-drag.mjs` |
| Explorer rows' own drop handlers skip a `dragover`/`drop` event that already has `preventDefault()` called | `src/explorer.ts` | Taking a drop between two rows before the explorer does | The explorer would also move the item into the folder: caught by the tests | `specs-explorer.mjs` |
| CSS classes `drag-reorder-ghost`, `mod-dragged-item` (a dragged card); `drag-ghost`, `drag-ghost-self`, `drag-ghost-action` (dragged outliner rows, with the hint); `drop-indicator` (the explorer's and the outliner's insertion line); `is-being-dragged-over` (the row, card or breadcrumb a drop would go into: also added to the explorer's own row in `src/explorer.ts`); `is-grabbing` on the body; `collapse-icon`, `is-collapsed` and the `right-triangle` icon (the outliner's fold arrows) | `src/view/corkboard.ts`, `src/view/lanes.ts`, `src/view/outliner.ts`, `src/explorer.ts`, `styles.css` | A drag, an insertion line, the grabbing cursor and a fold arrow look as Obsidian's own do, in every theme | Binders' own classes are on the same elements (`binders-drag-ghost`, `binders-outliner-ghost`, `binders-drop-line`, `binders-explorer-drop`, `binders-outliner-chevron`), so they're still placed and shown, less finished | `specs-corkboard.mjs`, `specs-outliner.mjs` |
| A menu item's `setSubmenu()` (returns the submenu, a `Menu`) | `src/view/internals.ts` (`submenu`) | "Set status" and "Set label" in an item's menu, "Card size" on the corkboard, "Columns" in the outliner's options | The item opens the submenu as a menu of its own | `specs-corkboard.mjs` |
| `app.setting.open()` and `app.setting.openTabById(id)` | `src/view/internals.ts` (`openPluginSettings`) | "Edit labels..." in the label menu opens Binders' settings | Nothing opens (returns false) | `specs-labels.mjs` |
| An `ItemView`'s `titleEl`, and `leaf.updateHeader()` | `src/view/internals.ts` (`refreshHeader`) | The header and tab titles when a binder view changes folder, or its folder is renamed | The titles catch up when the view is next opened | `specs-view.mjs` |
| `openFile(file, { eState: { rename: 'all' } })`: a Markdown view's ephemeral state that selects the note's title for renaming, as Obsidian's "New note" does | `src/view/internals.ts` (`openForRename`) | "New scene here" outside a binder view leaves the new note's name ready to type over | Obsidian ignores state it doesn't know: the note just opens | `specs-qa2-explorer.mjs` |
| `app.embedRegistry.embedByExtension.md(ctx, file, '')`: the editable Markdown embed Canvas and hover popovers use | `src/view/editable-embed.ts` | One live editor per manuscript section | The whole manuscript read only (rendered with the public `MarkdownRenderer`), with a notice; clicking a section opens its note | `specs-manuscript.mjs` (the fallback test removes it) |
| The embed's `editable`, `loadFile()`, `showEditor()`, `save(text, now)`, `set(text, clear)`, `loadFileInternal(data, cache)`, `onFileChanged`, `requestSave.cancel()`, `text`/`data`/`dirty`/`lastSavedData`, `unload()` | `src/view/editable-embed.ts` | Mounting, saving, merging outside edits, flushing on teardown (see below) | `embedSupported()` checks `loadFile`, `showEditor`, `save`, `set`, `loadFileInternal`, `onFileChanged`, `unload`, `editable` and `requestSave.cancel` (`src/view/editable-embed.ts` lines 54 to 67). `editMode`, `text`, `data`, `dirty`, and `lastSavedData` are not checked: without `editMode` the mount throws (line 359), and a section whose mount throws stays rendered | `specs-manuscript.mjs`, `specs-qa-manuscript.mjs` |
| The embed's `showPreview()` and `toggleMode()`, replaced on each embed with functions that do nothing | `src/view/editable-embed.ts` | Escape and "Toggle reading view" would swap a section's editor for a reading view and destroy the editor: a section stays an editor | Not checked (assigning them is harmless if Obsidian stops calling them). If Obsidian leaves the editor some other way, the manuscript mounts a new one when the section is next focused | `specs-qa2-manuscript.mjs` (Escape, "Toggle reading view") |
| The embed's `editMode`: `get()`, `sourceMode`, `toggleSource()`, `saveHistory()`, `cm` (the CodeMirror `EditorView`; else the `Editor`'s own `cm`) | `src/view/editable-embed.ts` | Reading typing, keeping live preview, undo across remounts, moving the caret between sections, the page following the caret | Without `cm`, arrow keys stop at a section's edge (no crossing) and the section is focused through `editor.focus()` (line 287). `get()` is read through `?.`; `toggleSource()` and `saveHistory()` are called without a check, so without them the mount throws and the section stays rendered | `specs-manuscript.mjs`, `specs-qa2-manuscript.mjs` |
| Obsidian's cache of undo histories, by path: filled by `editMode.saveHistory()`, read by `editMode.set(text, true)`, which gives a new editor the cached history when the text is the same length. And `editMode.path` (a getter on its prototype), shadowed on one editor for one `set(text, true)` call | `src/view/editable-embed.ts` (`kept`, `stepsOf`) | A section mounted again keeps its undo history only if it was recorded on exactly the text now loaded; otherwise it starts with none | The history is read with CodeMirror's public `state.toJSON({ history: historyField })`. If it can't be read, nothing is saved to the cache and every mount drops what it was given (no undo across remounts). If a history that doesn't belong can't be dropped, the mount throws and the section stays read only | `specs-manuscript.mjs`, `specs-qa-manuscript.mjs` (a note changed outside while its section had no editor) |
| A note's tab (`MarkdownView`): `saving`, true while it writes | `src/view/editable-embed.ts` (`saveTab`) | Waiting until a tab's text is on disk before its note is read, copied, merged or deleted: `view.save()` asked during a write returns at once and writes again afterwards, unawaited | Without `saving` (not a boolean `true`), `view.save()` alone, as before | `specs-scenes.mjs` (a slow disk: “Delete” on the corkboard while the note's own tab is still writing) |
| `workspace.unsetActiveEditor(editor)` | `src/view/editable-embed.ts` | Mounting a section doesn't make it the active editor | Required by `embedSupported()` | `specs-manuscript.mjs` |
| `workspace.onQuickPreview(file, text)` | `src/view/editable-embed.ts` | After merging an outside edit into unsaved typing, other views of the note get the merged text | Skipped if missing (other views then show the outside version until the save lands, as in Obsidian) | `specs-manuscript.mjs` (same note in a tab) |
| A Markdown tab's `lastSavedData` (the text it merges outside changes against), and its `getViewData()` | `src/view/editable-embed.ts` (`markSaved`) | Before a section writes, a tab of the same note that shows exactly that text is told it is what the file holds, so typing in the tab while the write is on its way isn't merged with it as if it were an outside change (doubled text) | Skipped for a view without them: it merges as Obsidian always did | `specs-manuscript.mjs` (same note in a tab); none tests its absence |
| `vault.getConfig('trashOption')` | `src/view/internals.ts` (`trashKind`, `trashPhrase`) | Saying where deleted and merged-away notes go (the system trash, the vault's trash, or nowhere) in the questions asked before deleting | "The system trash" (Obsidian's default) | `specs-qa3-scenes.mjs` |
| `vault.getConfig('alwaysUpdateLinks')` | `src/view/internals.ts` (`updatesLinks`) | After a merge or a split, pointing links at the note that has the text now, only if Obsidian is set to update links itself | Links are left as they are, and the merge says how many will stop working | `specs-qa6-features.mjs` |
| A menu's `items` (each with its `dom`) and `select(index)` | `src/view/internals.ts` (`selectMenuItem`) | The filter menu, opened again after a pick, has the picked item marked for the keyboard to carry on from | Nothing is marked, as in any menu | `specs-qa3-labels.mjs` |
| A menu item's `dom`, whose click Obsidian closes the menu on (a capturing listener is added to it) | `src/view/internals.ts` (`keepOpen`) | The Arrange menu's two switches, and the Filter menu on a phone's sheet, stay open while several things are ticked | The caller is told it is false and opens the menu again after each pick | `specs-lanes.mjs`, `specs-qa3-labels.mjs` (not checked that either names this) |
| `.menu-item-title` inside a menu item's `dom` | `src/view/internals.ts` (`selectMenuItem`) | Finding the item whose title was just picked, to mark it | Nothing is marked | `specs-qa3-labels.mjs` |
| A menu's `dom` | `src/view/internals.ts` (`fitItemMenu`) | Long card and row popovers scroll within a tablet or desktop viewport | Native menu sizing | none that checks the `binders-item-menu` class (`specs-qa5-cork.mjs`, the tablet test, opens such menus) |
| A submenu's own `addItem` and its items' `onClick` (public methods, replaced on the instance) | `src/view/internals.ts` (`submenu`) | Choosing something in "Set status" or "Set label" closes the menu it came from too (Obsidian only does that for a mouse click) | Only reached when `setSubmenu()` exists; if replacing them throws, the item opens a menu of its own | `specs-qa3-labels.mjs` |
| `vault.getConfig('readableLineLength')`, and `vault.on('config-changed')` for changes | `src/view/internals.ts` (`readableLineLength`), `src/view/BinderView.ts` | The manuscript's page follows the editor's "Readable line length" | Readable width, as by default | `specs-themes.mjs` |
| `vault.on('config-changed')` | `src/view/manuscript.ts` | Keeping sections in live preview when the vault's editing mode changes | Also checked on `css-change` | `specs-manuscript.mjs` |
| CSS classes of Obsidian's File recovery and Sync history dialogs: `mod-sidebar-layout`, `mod-sync-history`, `modal-sidebar mod-history`, `modal-sidebar-inner`, `modal-sidebar-list`, `modal-sidebar-list-item`, `file-recovery-list-item-header`, `sync-history-content-container`, `sync-history-content`, `modal-setting-titlebar`, `modal-setting-title`, `modal-setting-titlebar-actions`, `modal-setting-back-button`, `sync-history-preview`, `sync-history-diff`, `diff-collapsed`, and `diff-line mod-left` (the probe in `historyLook()`); the dialog's closing button (`modal-header-button`, `modal-close-button`), which the dialog moves onto its top line; and a toolbar's quiet button (`text-icon-button` with `text-button-icon`, `text-button-label`, `is-active`, `is-disabled`) for "Show changes" | `src/view/snapshots.ts`, checked by `historyLook()` in `src/view/internals.ts` | The Snapshots dialog looks like Obsidian's own history dialogs in every theme (a list at the side, the text beside it), and is the same sheet on a phone. What changed is drawn by Binders' own rules (`del` and `ins` in the note's paragraphs, in Obsidian's red and green) | `historyLook()` looks at what the classes do (the dialog's content is a row; Obsidian's diff line is tinted, the sign its history stylesheet is there). If not, the dialog gets `is-plain` and Binders' own rules for the same layout and colors (`.binders-snapshots.is-plain` in `styles.css`, on its own class names). A phone then gets the list and the text without the sheet's transitions | `specs-snapshots.mjs` (the look is detected; with the classes taken off, the fallback lays it out the same) |
| A menu's `items` (each with `section` and `dom`), in the `files-menu` of the file explorer | `src/explorer.ts` (`dropNewFolderItem`) | In a binder a selection's menu has one "new folder" item: Obsidian's own, added before `files-menu` is sent, is taken out where Binders adds its own | Not found: both items show | `specs-explorer.mjs` |
| The file explorer's `getSortedFolderItems` patch (above), also with binder order turned off | `src/explorer.ts` (`arrange`) | A binder's `Snapshots` folder is never listed in the explorer, whatever the settings, and with "Detect all file extensions" on | Without the method, the folder shows as an ordinary folder; its `.snapshot` files still don't (Obsidian lists only kinds of file it opens, unless "Detect all file extensions" is on) | `specs-snapshots.mjs` (both) |
| `app.internalPlugins` (`switcher`'s `QuickSwitcherModal`, `global-search`'s `openGlobalSearch` and its view's `dom.resultDomLookup`), `metadataCache.getLinkSuggestions()` | only `tests/e2e/specs-snapshots.mjs` | Checking through Obsidian's own data that snapshots are in no search, quick switcher or link suggestion | Not used by the plugin | `specs-snapshots.mjs` |
| Class names of Obsidian's window, hidden by `body.binders-focus` in one block of `styles.css`: `.workspace-ribbon`, `.workspace-split.mod-left-split`, `.workspace-split.mod-right-split`, `.status-bar`, `.mobile-navbar`, `.workspace-tab-header-container`, `.titlebar-button-container`, `.mod-root .workspace-tabs` and `.workspace-split` (other panes), `.workspace-leaf`, `.view-header`, `.inline-title`, `.embedded-backlinks`, `.workspace-leaf-resize-handle`; and the variables `--metadata-display-editing`, `--metadata-display-reading`, `--view-top-spacing-markdown`, `--safe-area-inset-top`, `--status-bar-*` | `styles.css` ("Focus mode") | Focus mode: everything around the page out of sight, a note's properties hidden, the numbers drawn as the status bar is | A class Obsidian renames stays in sight while writing; nothing else changes (nothing is collapsed or closed, so there's nothing to put back) | `specs-focus.mjs` (each is 0×0 in focus and back afterwards; "Obsidian still has every element focus mode hides or reads") |
| A note's page: `.markdown-source-view .cm-scroller > .cm-sizer > .cm-contentContainer`; reading, `.markdown-reading-view .markdown-preview-view > .markdown-preview-sizer` with its `.mod-header` and `.mod-footer` | `src/focus/dom.ts` (`noteColumn`) | Focus mode: where the text stands (held still on the way in and out, and the glide), and the scenes before and after drawn above and below it | Null: nothing is drawn before and after (the commands still go there), and the way in and out is one step without the glide | `specs-focus.mjs` (fallbacks) |
| The editor's own bottom padding on `.cm-content` (half its height, an inline style) | `src/focus/dom.ts` (`tailRoom`) | Focus mode: the scene after is drawn up over it, to stand a break below the last line | `0px`: the scene after is half a screen below the text | `specs-focus.mjs` (the scene after stands under the last line) |
| The `Editor`'s `cm` (already above), with `EditorView.scrollHandler` in a `Compartment` added by `StateEffect.appendConfig` (public CodeMirror API), added again when Obsidian gives the tab's editor a new state for another note | `src/focus/dom.ts` (`editorView`), `src/focus/focus.ts` (`typewriter`) | Focus mode: typewriter scrolling in a note's tab | No typewriter line there: the editor scrolls as it always does | `specs-focus.mjs` (fallbacks; typewriter scrolling) |
| `cm-active` on the line with the cursor, `cm-focused` on the editor with the keyboard | `styles.css` ("Dim other paragraphs") | Focus mode: which paragraph is being written | Nothing is dimmed | `specs-focus.mjs` (each option shows its piece) |
| `vault.getConfig('vimMode')` (already above) | `src/view/internals.ts` (`vimMode`) | Focus mode leaves Escape to Vim | Escape leaves focus | `specs-focus.mjs` (Escape) |
| `app.plugins.plugins.longform` (loaded plugins by id) | `src/longform.ts` (`longformRunning`) | Leaving rename and delete tracking in Longform projects to Longform while it runs, so the index note isn't written twice | Treated as not running: Binders writes renames and deletes itself (the same change Longform would make) | `specs-longform.mjs` (a stand-in plugin) |
| `.mobile-navbar` (the bar of buttons Obsidian lays over the foot of a phone's screen) | `src/view/drag.ts` (`visibleBottom`), `styles.css` | A drag held near the foot of a view scrolls from the top of the bar, not from the edge of the pane under it | Without the bar, the pane's own edge | `specs-qa4-mobile.mjs`, `specs-mobile.mjs` |
| `.popover.hover-popover` (a note preview over a link) | `src/focus/focus.ts` (`onEscape`) | Escape closes a preview before it leaves focus mode | Escape leaves focus mode with the preview open | `specs-focus.mjs` (added 2026-10-02) |
| `window.event`, the event whose listeners are running now | `src/view/editable-embed.ts` (`currentEvent`) | Telling that the page is going (a `pagehide`) when another handler's save hears of it before Binders does, so nothing is started as the page goes on a computer | Not an event of that kind: the module's own `leaving` flag decides | none that reaches it (`specs-binders.mjs` sends `pagehide` by script, which `going()` doesn't count: it wants a trusted event) |
| Obsidian's popup classes `.suggestion-container`, `.modal-container`, `.prompt`, `.menu` (and `.popover.hover-popover`, below) | `src/view/manuscript.ts` (`.modal-container, .menu, .suggestion-container, .prompt` at line 429, and `:scope > .suggestion-container` at line 899), `src/focus/focus.ts` (line 464) | A key pressed while a dialog, menu, suggestion list or prompt is open isn't taken as typing for the manuscript's section; in focus mode Escape and other keys are left to an open suggestion list or menu | Not found: a key goes to the section, and Escape leaves focus mode, with the popup open | `specs-focus.mjs` (`.menu`, `.prompt`, `.modal-container`), `specs-qa2-manuscript.mjs` and `specs-qa4-manuscript.mjs` (`.suggestion-container`); `.popover.hover-popover`: `specs-focus.mjs` |
| `.footnotes` (the block of footnotes Obsidian's renderer adds at the end of a rendered section) and `.callout` (a rendered callout), matched against the elements of a rendered section | `src/view/manuscript.ts` (`space()`, lines 813 and 815) | The rendered text of a section is spaced as its editor will be, so the page doesn't move when the editor takes over: the footnotes block is left out of the blocks counted, and a rendered callout is looked for as `.callout` | If the blocks don't line up with the note's index (a renamed class leaves an extra or an unmatched block), `space()` returns and the spacing is left to the style sheet: a blank line between blocks | `specs-qa4-manuscript.mjs` (the height test with footnotes and callouts in the sections) |
| `.cm-content` (the editor's text), tested with `matches()` on the focused element, and `.cm-editor` (the whole editor), tested with `closest()` | `src/view/BinderView.ts` (lines 105 and 116: Mod+Z and F2 leave an editor alone; line 246: an editor's caret is left to the manuscript while a field is brought into sight), `src/view/manuscript.ts` (line 381, typing outside any editor), `src/focus/focus.ts` (lines 452 and 465: which key counts as writing, and Escape in an editor) | Telling that the focus is in a note's or a section's editor, rather than in a field | Not matched (a renamed class): Mod+Z would undo a binder move while typing in a section, F2 would rename from the wrong place, a typed key would not hide what's around the page in focus mode, and a field brought into sight would also be scrolled to when it is an editor | `specs-manuscript.mjs`, `specs-focus.mjs` (Escape and typing) |
| `.lucide-folder-plus` (the icon of an explorer menu item, drawn by Obsidian's `setIcon`) | `src/explorer.ts` (`dropNewFolderItem`, line 114) | Recognising Obsidian's own "New folder with selection" among a selection's menu items (its title is in the app's language), to take it out where Binders adds its own | Not found: both items show | `specs-explorer.mjs` (the selection menu, and the test where the item isn't found) |

Focus mode's public API that looks like internals, and isn't: `app.keymap.pushScope()` and `popScope()`, `Scope`,
a view's `scope`, `view.addAction()`, `view.contentEl`, `MarkdownView.getMode()`, the workspace's `editor-menu` and
`editor-change` events, `app.loadLocalStorage()` and `saveLocalStorage()` (Obsidian 1.8.7), and the Web Animations
API.

Public API that looks like an internal, and isn't: CodeMirror's `EditorView.scrollHandler` and
`StateEffect.appendConfig` (`src/view/editable-embed.ts`); `leaf.isDeferred` (Obsidian 1.7.2); the workspace's `quit`
event and its `tasks.addPromise()` (`src/view/manuscript.ts`); `getSettingDefinitions()`, `setControlValue()` and
`update()` on the setting tab (Obsidian 1.13.0, the oldest Binders runs on: `minAppVersion`); a view's `setEphemeralState()` and `getEphemeralState()`; `MenuItem.setIsLabel()`.

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
- The patched method also puts the “binder” tag and the label dots on the items it returns (`mark`), so rows that
  appear later (a folder expanded) get theirs. A label dot is a `div.binders-explorer-label` appended to the item's
  `selfEl`; the metadata cache's `changed` event repaints the dot of that note, and of its folder if it's the
  folder's note. Unloading removes every icon and dot.
- An explorer popped out into its own window has its own `document`. The click and drag listeners are added to every
  window's document: the ones open at start, and new ones on `window-open` and `layout-change`.
- Obsidian 1.13 shows notices in a window of their own, so tests find them through a notice's `noticeEl.ownerDocument`.

### Dragging to reorder (checked on Obsidian 1.13.7)

- The explorer makes every row draggable through `app.dragManager.handleDrag`, which fills `dragManager.draggable`
  when a drag starts (`dragFile`, `dragFolder`, `dragFiles`) and clears it on `dragend`. Each row's drop handler is
  added by `dragManager.handleDrop(el, handler)`: its `dragover`, `dragenter` and `drop` listeners all begin with
  `if (!e.defaultPrevented)`. Binders listens for the same events on the document in the capture phase, so it sees
  them first; when the pointer is over the top or bottom of a row in a binder it calls `preventDefault()` and the
  explorer's handler does nothing. Everywhere else the event is left alone and the explorer behaves as it always does.
- The line is a `div.drop-indicator.is-active` (the class of the line Obsidian shows where a dragged bookmark would
  go), placed over the explorer with `position: fixed`, in the document of the window the drag is in. `setAction()`
  words the hint in Obsidian's drag ghost, and `updateHover(null, '')` clears the tint a folder got while the pointer
  was over its middle.
- Where a drop goes is read from the rows: a note's top or bottom half, a folder's top or bottom quarter (its middle
  is left to Obsidian: "move into"). Below an open folder's name is the top of what's in it. Below the last item of
  a folder, the pointer left of where that item's name starts (`.tree-item-inner`'s edge; right of it in
  right-to-left layouts) means after the folder itself, and so on outward.
- Several dragged items are put in the order they show in (`store.inOrder`), not the order they were clicked in; an
  item dragged along with the folder it's in comes with the folder.
- A place the items can't take is refused, not left to Obsidian: the event is still taken, `dropEffect` is `none`,
  no line shows, the hint says why ("“Part One” already has “Arrival”", a note that would become the folder's note,
  two dragged items of one name), and a drop there shows the reason as a notice. Where it isn't a binder's to say
  (a newer-format binder, a binder or folder note, a folder into itself), the drag is Obsidian's own.
  One exception: a folder dragged out of a binder view (`draggable.source === 'binders'`) onto its own row, or a row
  inside it, is refused with the reason, since Obsidian says nothing there.
- A drop goes through `store.put()`, one change that "Undo last move" takes back.
- Escape cancels a drag in Chromium itself, which then sends `dragend` and no `drop`; nothing can test that in the
  harness, where drags are made of mouse events.
- On the corkboard a drag is pointer events, not HTML drag and drop; it only borrows the look: Obsidian's reordering
  (`Yv` in its bundle: a base's toolbar, a note's properties) clones the item into a `div.drag-reorder-ghost`, adds
  `mod-dragged-item`, sets `is-grabbing` on the body, and animates the others to their new places over 300ms with
  `cubic-bezier(0.2, 0, 0, 1)`. The corkboard uses the same classes and the same timing.
- The outliner's rows are dragged with pointer events too (`src/view/drag.ts`: a mouse or pen after 5px, a finger
  after a 450ms press). They borrow the look of a note dragged in the file explorer: a `div.drag-ghost` with a
  `drag-ghost-self` (icon and name, or "3 items") and a `drag-ghost-action` (where it would go), a `drop-indicator`
  line, and `is-being-dragged-over` on a folder's row. Rows glide to their places with the same timing.

### A card dragged out of the view (checked on Obsidian 1.13.7, desktop and `app.emulateMobile(true)` as a tablet)

`src/view/file-drag.ts` is the only module that touches this; the corkboard, the board by label and the outliner call
`FileDrag.begin()`, `move()`, `drop()` and `end()` from their own pointer drags.

- Inside the view's pane (its header and its own tab included) nothing happens: the drag is the view's.
- Outside it, a `dragstart` is sent from the card, and in it the drag manager is told what's dragged exactly as
  `dragManager.handleDrag` does for a row of the file explorer: `dragFile` / `dragFolder` / `dragFiles`, then
  `onDragStart`, which makes Obsidian's ghost and sets `draggable`. By touch `onDragStart` also notes a drag that
  hasn't moved yet (`dragStart`), to open a menu if it ends so: ours has moved, and says so.
- Then, on every pointer move (and every 50ms while it's still, as a real drag does), the element under the pointer
  gets `dragenter` / `dragleave` when it changes and `dragover`. Obsidian's `window` listeners place the ghost and
  word its action; a handler that takes the event (`preventDefault()`) and the `dropEffect` it sets say whether a
  drop would do anything. Text being edited takes a drop without saying so, as in the browser.
- Let go: a `drop` on that element if something would take it, then `dragend`; `onDragEnd()` is called too if
  anything is still set. Back over the view, off the window, Escape or the view closing: a `dragleave` with no
  related target and no screen position (what a real drag leaving the window sends: Obsidian detaches its ghost and
  the explorer forgets a refusal), then the same ending. Nothing is left in `draggable` or `ghostEl`.
- Near the top or bottom of a list that scrolls, the list scrolls, as Chromium scrolls it under a real drag.
- A canvas reads a dragged folder as every file in it, its hidden folder note too: over `.canvas-wrapper` the
  `draggable` is swapped for a `files` one of the folder's scenes (`store.scenes`), and swapped back on leaving.
- The look: the card in hand gets `is-handed-over` (it shrinks to where it's held and fades), Obsidian's ghost gets
  `binders-file-ghost mod-morph` (it grows from the same spot); on the way back a copy of the ghost (`is-leaving`)
  fades where it was. 300ms, `cubic-bezier(0.2, 0, 0, 1)`; nothing shrinks or grows under "reduce motion". An
  outliner's row ghost is already Obsidian's look, at the same offset from the pointer: it's hidden and Obsidian's
  shows, with nothing to see change.
- Not done: a window of its own (the drag manager's listeners are in the main window; there the drag stays a card
  drag), a phone (nothing is beside the view to drop on), and a move out of the binder isn't recorded for "Undo last
  move" unless the file explorer placed it in a binder.

## The editable embed (checked on Obsidian 1.13.7, desktop and `app.emulateMobile(true)`)

See [spike-manuscript.md](spike-manuscript.md) for why this route. `src/view/editable-embed.ts` is the only module that
touches it; `mountEditor()` builds one embed and patches that instance only:

- **`onFileChanged`**, before `load()` binds it: native embeds skip outside changes while they have unsaved typing, then
  save over them. Ours always goes through `loadFileInternal`, which does Obsidian's 3-way merge when dirty. After a
  merge it passes the merged text to other views of the note (`onQuickPreview`), which Obsidian's own split views don't
  do (they lose text in that case).
- **`set`**, after `loadFile()`: a reload calls `set(text, true)`, which rebuilds the editor (cursor, scroll and undo
  lost); ours applies it as a diff.
  While the cursor isn't in the editor, that change is kept out of its undo history (CodeMirror's public
  `Transaction.addToHistory`, added by an `EditorState.transactionExtender`; the history then moves its steps along
  with the change, as for a collaborator's edit). So undo in a section takes back what was typed there, never text
  that arrived from another app, sync or another editor of the note while the writer was elsewhere. Obsidian replaces
  whole lines when it takes in new ones, so typing on a line next to them can lose its undo step; it never removes
  the outside text. With the cursor in the editor an outside change is an undo step, as in a tab of the note.
- **`save`**: wrapped to report typing (`onChange`) for the word count; the write itself is untouched.
- **`unload`**: whoever tears the embed down (the manuscript, the view closing, the plugin unloading), pending typing is
  written first and `editMode.saveHistory()` keeps undo history for a remount. `destroy()` returns that write, and a
  remount of the same note waits for it, so it never loads the old text.
- **Undo across a remount.** Obsidian gives a new editor the history cached for its path whenever the text has the
  same *length* as when it was saved. After a change of equal length made while the note had no editor (sync moving a
  phrase; a history left by a tab of the note), undo would apply its steps to a text they weren't recorded on and
  take out other words. The wrapper remembers the text and the text-changing steps of each history it saves (up to
  20, as Obsidian does), and after `showEditor()` compares: unless the editor's history is that one and its text is
  that text, the editor state is built again with no history (`set(text, true)` with `path` shadowed as `''` for the
  call, so nothing is looked up). `@codemirror/commands` (for `historyField`) is provided by Obsidian like `state` and
  `view`; `src/codemirror-commands.d.ts` declares the one export used.
- `save()` does nothing until `loadFile()` resolves, so the editor is only shown after it.
- `showEditor()` focuses the new editor and queues "scroll to the top of the note" for CodeMirror's next measure. The
  wrapper puts focus back, unsets the active editor, and restores the scroll position of every scrolled ancestor.
- The editor never scrolls the page. The wrapper adds a CodeMirror `EditorView.scrollHandler` (public CodeMirror
  API, added with `StateEffect.appendConfig`) that always says the scroll is handled. An editor asked to scroll to a
  caret that's off screen measures itself over and over ("Measure loop restarted"), and the queued scroll above
  would move the whole manuscript. When the editor has the focus, the handler passes the position on (`onCaret`) and
  the manuscript scrolls its own page so the caret is in sight. It runs while CodeMirror measures, so the caret's
  place is read from the DOM (`domAtPos` and a range's rectangles), not from `coordsAtPos`. Without
  `EditorView.scrollHandler` (an older CodeMirror) nothing is added and the editor scrolls as it would.
- **`showPreview`** and **`toggleMode`**, after `showEditor()`: an embed leaves its editor for its reading view on
  Escape and on "Toggle reading view", and destroys the editor as it goes. Both are replaced with functions that do
  nothing, on that embed only, so a section is always its editor.
- **`onFileChanged`** also handles a second view of the same note saving our typing with its own on top: if the
  file already holds our change (`contains(lastSavedData, data, theirs)`), it's loaded as it is, not merged, which
  would double the text.
- **A save asked for during a write.** The embed's `save(text, true)`, called while an earlier write is on its way,
  writes nothing: it notes `saveAgain`, clears `dirty`, and returns; when the earlier write lands it calls
  `save(text)`, which only asks for a save two seconds on (and `saveAgain` is never cleared, so every later write
  asks for one more). A caller that waited for the save would go on with the older text on disk: a note deleted
  then is in the trash without its last words, and a merge, a copy, a snapshot or a compile lacks them. So
  `flush()` loops: it asks, waits for the write in flight, and asks again until nothing is `dirty` and no write was
  started meanwhile (only `dirty` is read; `saving` and `saveAgain` aren't). An editor that's gone cancels the save
  Obsidian asked for, so nothing is written later over what a tab of the note has typed since.
- A new editor on a note waits for the pending writes of every other live editor on that note (`openEditors`:
  another manuscript in a split or tab) and for the last write of one that has just gone (`closing`), or it would
  load the old text. `saveEditors(files)` is the same wait for whoever reads, copies, moves or removes a note
  (`saveOpen` in `src/scenes.ts`: split, merge, duplicate, delete, compile, snapshots, a synopsis from text).
- When the page is scrolled more than a screen and a half past the section with the caret, the manuscript blurs
  that editor (one kept that far out of sight can't draw its caret) and remembers the place. The next key typed, or
  scrolling back to the section, puts the caret back; keys typed while its editor is mounted again go in at the
  caret. This reads `.modal-container`, `.menu`, `.suggestion-container` and `.prompt` in the document to tell that
  nothing else is using the keyboard.
- Quitting doesn't unload views: the manuscript adds each unsaved section's write to the workspace's `quit` tasks
  (public API).
- With live preview off in the vault the editor opens in source mode and shows raw frontmatter: `toggleSource()` on that
  editor only; re-checked on `config-changed` and `css-change`.
- Commands and hotkeys need nothing: the embed sets `workspace.activeEditor` to itself when it gets focus (and updates
  the mobile toolbar). On desktop, undo is CodeMirror's own Ctrl+Z; `editor:undo`/`editor:redo` are mobile commands.
- Obsidian keeps undo history for the 20 most recent files; a section scrolled far away and unmounted beyond that loses
  its undo history, as closing a tab does.

## Focus mode (checked on Obsidian 1.13.7, desktop and `app.emulateMobile(true)`)

- Nothing of Obsidian's state is changed: the classes `binders-focus` on `<body>` and `binders-focus-leaf` on the
  tab's `.workspace-leaf` hide what's around the page. `workspace.getLayout()` is the same before, during and after.
  `leftSplit.collapse()` isn't used: it's saved with the layout, and would stay collapsed after a crash.
- Other panes are hidden with `:has()`: `.mod-root :is(.workspace-tabs, .workspace-split):not(:has(.binders-focus-leaf))`.
- With the keyboard up on a phone whose view is under 180 px tall (a small phone on its side), Obsidian's `.view-header`
  is slid off the top while the manuscript is being typed in, as a note's header is (styles only; test: `specs-mobile.mjs`,
  "a small phone on its side, typing in the manuscript with the keyboard up").
- With stacked tabs on, the other tabs' strips are hidden and the page takes the window's width: `.workspace-tabs.mod-stacked`,
  `.workspace-tab-container` and `.workspace-tab-header` (styles only; test: `specs-qa6-features.mjs`, "stacked tabs").
- Escape: Obsidian's key handler is on the window, in the capture phase, before anything in the page hears a key,
  and gives it to the scope on top of its stack. A menu, a dialog, the palette and a list of suggestions each push
  a scope of their own, so one opened in focus takes Escape first; a listener of our own on the document would hear
  the key only after Obsidian had closed them, and would leave as well. A scope's handler that returns `false`
  takes the key; anything else leaves it to the page. The scope's parent is the view's own scope (the binder view's
  F2 and Mod+Z still work).
- `workspace.getMostRecentLeaf()` doesn't report a tab that isn't shown (the other tabs are hidden in focus): the
  tab taken up is read from the `active-leaf-change` event.
- A tab's editor is the same `EditorView` for every note opened in it, but Obsidian gives it a new state per note,
  which drops anything added with `appendConfig`: the typewriter handler is added again on `file-open`
  (`slot.get(state) === undefined`).
- The handler runs while CodeMirror measures, so the cursor's place is read from the DOM (`caretRect`), as in the
  manuscript. It returns `true` (handled) only when the cursor is on the last line of the text; otherwise `false`,
  and CodeMirror scrolls as it always does. The page is then moved over a few frames, outside the measure.
- In the manuscript the same question is asked in `showCaret()` (`src/view/manuscript.ts`), where the manuscript
  moves its page anyway: no second scroll handler, nothing to fight CodeMirror ("Measure loop restarted").
- On a phone Obsidian removes its bar of buttons (`.mobile-navbar`) from the page while an editor has the keyboard,
  and lets the page run up under the clock (`--safe-area-inset-top`): the strip with the way out starts below it.
- Embedded editors (the manuscript's sections) send the workspace's `editor-change` with their note, as a tab's
  editor does: the day's words are counted from that one event.
- A hard reload within two seconds of typing loses that typing in Obsidian itself (it saves a note two seconds
  after the last key), in focus or not: nothing focus mode does changes when a note is saved.

## The binder view (checked on Obsidian 1.13.7)

- Obsidian pads every view's content (`.view-content`) unless a rule for that view type says otherwise, as it has for
  notes, bases and canvases. Binders has one for `data-type="binders-view"`, so the view runs edge to edge and its
  scrollbar is at the pane's side.
- The toolbar and the cards read a base's own CSS variables where Obsidian defines them (`--bases-header-height`,
  `--bases-cards-background`, `--bases-cards-radius`, `--bases-cards-shadow`, `--bases-cards-shadow-hover`), each with
  a fallback for versions before Bases, so a theme that restyles bases restyles binders the same way.
- A card's or an outliner row's menu (`src/view/actions.ts`) sends the public `file-menu` and `files-menu` workspace
  events with the source `binders-card`, which is how Obsidian's own file explorer items ("Reveal file in
  navigation", "Bookmark…") and other plugins' get into it.
- The toolbar's buttons use Obsidian's `text-icon-button`, `text-button-icon` and `text-button-label` classes (a
  base's toolbar), the outliner's "+" its `clickable-icon`, and rendered manuscript sections its `markdown-rendered`.
  These only style: without them the controls still work.

- A view's `setState(state, result)` gets `result.history = false` when only its state changes. Setting it to `true`
  records the change in the tab's history (as file views do when their file changes), so Back returns to the folder
  before. This is public API.
- Obsidian's own hotkey Mod-Enter ("Open link in new tab") runs, and swallows the key, whenever an editor was active
  last, even while a binder view has the focus. The view claims Mod-Enter in its own `scope` while a synopsis is being
  typed. Likewise F2 is Obsidian's "Rename file": the view's `scope` claims it and passes it on to the focused card,
  outliner row or manuscript section, which it renames.
- Mod+Z, Mod+Shift+Z and Mod+Y are registered in the view's `scope` for "Undo last move" and "Redo last move". They
  do nothing (and the key goes on to whoever wants it) while the focus is in an input, a text area, something
  editable or an editor (`.cm-content`), or when the binder has no move to undo.
- A view's `getEphemeralState()` and `setEphemeralState()` (public API) carry `place`: where the mode was scrolled
  to and what was selected, so Back returns there. Switching modes keeps a place per mode and folder in the view.
- In the e2e harness, `activeDocument` can be another of Obsidian's windows, so menus opened without a position open
  there; the harness focuses the main window before each test, click and right-click.
