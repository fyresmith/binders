# Architecture

A map of the code as it is. Read this first if you are new: it says where things live, what each part owns and must
never do, how a change travels from a gesture to a file, and where the rules that keep writing safe are kept. The
design (what Binders is for, and how each feature behaves) is in [plan.md](plan.md); the file format in
[file-format.md](file-format.md); the parts of Obsidian we rely on that it doesn't document in
[internals.md](internals.md); building and testing in [development.md](development.md). The working rules are in
[AGENTS.md](../../AGENTS.md).

## The shape of it

Binders is one plugin: `src/main.ts` builds everything and hands each part what it needs. The parts sit in layers, and
code in a layer uses the layers below it, not the ones above. (There are a few sideways and circular imports between
neighbours, for example the store and `snapshots.ts`, which follow each other's renames; none goes up a layer.)

```
 main.ts, settings.ts                       the plugin: commands, menus, the settings tab
 ───────────────────────────────────────────────────────────────────────────────────
 view/BinderView.ts  ->  modes: corkboard.ts, lanes.ts, outliner.ts, manuscript.ts     what the writer sees
 focus/focus.ts      view/snapshots.ts       view/actions.ts, card.ts, edit.ts, drag.ts, ...
 inspector/views.ts, contents-pane.ts       the sidebar: what's in hand, and the book with where you are
 ───────────────────────────────────────────────────────────────────────────────────
 binders.ts   the store: the only code that changes a binder (and its undo: undo.ts)
 scenes.ts    splitting, merging, one note of many   snapshots.ts    taking and bringing back
 export/export.ts   a binder read as a book, made into a file, saved        view/export.ts   the Export window
 ───────────────────────────────────────────────────────────────────────────────────
 explorer.ts  patches Obsidian's file explorer (asks the store through `ExplorerSource`)
 view/editable-embed.ts   the live editors of the manuscript
 ───────────────────────────────────────────────────────────────────────────────────
 pure logic, no Obsidian: model.ts  longform.ts  scene-text.ts  snapshot-text.ts  settings-data.ts
   export/model.ts  markdown.ts  typography.ts  roles.ts  book.ts  picture.ts  docx.ts  docx-parts.ts
                    style.ts  details.ts  epub.ts  epub-text.ts  epub-css.ts
   focus/session.ts  view/labels.ts  view/outliner-data.ts  view/lanes-data.ts  view/file-drag-data.ts
   view/tap-text.ts
```

Three rules hold the layers together:

1. **Pure logic has no Obsidian in it.** Everything in the bottom band imports nothing from `obsidian` (but
   `longform.ts` takes its `App` type for the one function at its end, `longformRunning`, and `view/words.ts` counts
   words purely but its `WordCounter` reads notes through the app) and is covered by unit tests that run in Node. If a rule can be written as a function from data to
   data, it belongs there, and the vault-facing code is a thin layer that calls it.
2. **Only the store changes a binder.** Views and the explorer ask `plugin.binders` (`BinderStore`) to move, make,
   rename or label things. They never edit a binder note themselves.
3. **Undocumented Obsidian API is quarantined** in the modules named in
   [Where the undocumented parts are](#where-the-undocumented-parts-of-obsidian-are-used), each feature-detected, with a
   fallback and a test.

Not every file under `src/view/` is a view: `labels.ts`, `outliner-data.ts`, `lanes-data.ts` and `file-drag-data.ts`
are pure and live there because they belong to one view's idea. The store, `settings-data.ts` and `scenes.ts` reach into
`view/` for those, and for `view/modals.ts` and `view/internals.ts`; they never reach for a view itself. (Focus mode, a
layer above, does use `BinderView`.)

## Module by module

Each entry says what the module owns and what it must never do.

### The plugin

| File | What it is | Must never |
|---|---|---|
| `src/main.ts` | `BindersPlugin`: the lifecycle (`onload` builds the store, the explorer patch, the views, focus mode), every command, the file and files menus, `openBinder`, and the small actions the commands run (make a binder, new scene, move up and down, undo). Every action runs through `tell()`, which shows a failure as a notice instead of failing silently. | Hold logic that a view or the store needs: commands call into them. |
| `src/settings-data.ts` | What the settings are (`BindersSettings`), their defaults, and `readSettings`, which makes whatever was saved whole again (missing keys get defaults; lists that aren't well formed are put right). Pure. | Import Obsidian. |
| `src/settings.ts` | The settings tab, declarative: Obsidian draws it from `getSettingDefinitions`. Renaming a label or status asks whether to rename it in the notes that use it. | Rewrite notes without asking. |

### The binder store

| File | What it is | Must never |
|---|---|---|
| `src/model.ts` | The binder note as data: `readIndex` (parse `contents`), `orderChildren`, and the operations on the list: `renameIn`, `relocate`, `removeFrom`, `moveTo`, `applyOps` (a batch of `ListOp`s). `FORMAT_VERSION` and `checkFormat`, which refuses a newer binder. Pure. | Import Obsidian, or normalise a newer format. |
| `src/binders.ts` | `BinderStore`, as `plugin.binders`. Finds binders (a note with `binder` in its properties; a Longform index note), keeps one `State` per binder (the list as the note has it, plus changes not yet written), follows the vault's `rename`, `delete` and `create` events and the metadata cache's `changed`, answers "what is in this folder, in what order", and does every change: `put`/`move`, `reorder` (a folder's items given a new order in one step and one write), `moveUp`/`moveDown`, `newScene`, `newFolder`, `duplicate`, `group`/`ungroup`, `makeBinder`, `convertToBinder`, `setProps`/`editProps`, `label`. Emits `changed` (batched) to anyone showing a binder. The file explains its API at the top. | Write anything but the binder note's `contents` (or a Longform index note's `longform.scenes`) and the properties a view's edit asks for; write a binder whose format is newer (`problem`); apply a change to a stale copy of the note (see [Invariants](#invariants-that-keep-writing-safe)). |
| `src/undo.ts` | `MoveHistory`: for each change made by hand (a drop, Move up, a sort kept, a label given by a drop) where each item was before and after, kept in memory (50 changes), and taking it back or doing it again by asking the store to move the files and write the order. Reached through `MoveHost`, a small interface the store implements. | Touch the vault itself, or undo part of a change: it moves nothing unless everything can move. |
| `src/properties.ts` | `editProperties`: the one way a property is written to a scene. Goes through Obsidian's own writer, except for the two kinds of note that writer would damage: a note that opens with a `---` block that is text (the properties are added as a new block above it) and a note that starts with a byte-order mark (its block is rewritten in place). | Call `processFrontMatter` on a scene anywhere else. |
| `src/longform.ts` | Longform projects as data: reading `longform` properties, flattening and nesting `scenes`, the shown order, groups, the plan for "Convert to binder". Pure, except `longformRunning` (see internals). | Write anything but `longform.scenes`; keep any other key of `longform` out of what it hands back to be written. |
| `src/longform-convert.ts` | The "Convert to binder" dialog. | Convert without saying first what will happen. |

### The file explorer

| File | What it is | Must never |
|---|---|---|
| `src/explorer.ts` | The core file explorer: binder order (patches the explorer view's `getSortedFolderItems`), hiding binder and folder notes and `Snapshots` folders, the "binder" tag, label dots, the click that opens a folder's view, and dragging to reorder with an insertion line. It knows binders only through `ExplorerSource`, which the store implements, so it imports nothing of Binders'. Everything undocumented is in its "Internals" block. | Throw when the explorer isn't what it expects: it says so once and leaves Obsidian's own order. Leave anything behind when the plugin unloads. |

### Scenes and snapshots (the vault side)

| File | What it is | Must never |
|---|---|---|
| `src/scene-text.ts` | The text rules for scene work: where properties end and text begins, `splitAt`, `joinBodies`, `synopsisFrom`, names for new notes, link repointing, comment stripping, and `compile` (a binder's text as one note: export's "One note"). Pure; these are the places writing could be lost, so every rule is unit-tested. | Import Obsidian. |
| `src/scenes.ts` | Split, merge, synopsis from text and one note of many (`oneNoteText`, `writeOneNote`) where the rules meet the vault; `isExported`, which reads `export: false` and `compile: false`. Ordered so text exists twice before it exists once: a split's second half is saved in its own note before the first lets go of it, and merged notes are trashed only after the merged note has been read back. `saveOpen` writes pending typing (a tab, the manuscript) before anything reads a note from disk. | Delete or overwrite a note before its text exists somewhere else. |
| `src/snapshot-text.ts` | A snapshot's file name and contents (`snapshotName`, `snapshotFile`, `readSnapshot`) and `compare`, which diffs two texts as prose. Pure. | Import Obsidian. |
| `src/snapshots.ts` | Snapshots, vault side: `takeSnapshot`, `rewrite`, `bringBack`, naming, following a renamed or moved note, and the leftovers of notes that are gone. Reads a snapshot back from disk before doing anything else; replaces a note's text only through the editor it is open in (one Undo) or in one write that refuses if the note changed. | Change a snapshot file once written; replace a note's text before it is in a snapshot. |

### Export

The design is [export.md](export.md). One model, read by every writer; the pure parts are tested in Node, and the
word-for-word test (development.md) holds each writer to "no word dropped, repeated or reordered".

| File | What it is | Must never |
|---|---|---|
| `src/export/model.ts` | The book model: `Book`, its `Section`s (part, chapter, front and back matter), `Block`s and `Inline`s, footnotes, warnings, the outline "Contents" shows; word counts and numbers in words. Pure. | Know how anything looks: a style decides that, in a writer. |
| `src/export/markdown.ts` | A note's text read for a book (`parseBody`): micromark with footnotes, tables and strikethrough, and Obsidian's own syntax taken out first and put back as the model has it. A new line is a new paragraph; only a fenced block is code; a rule is a scene break. Pure. | Lose a word: what it can't set is kept as typed, and said in a warning. |
| `src/export/typography.ts` | Quotes curled for the book's language, dashes, ellipses. Pure. | Change anything but those characters; touch code. |
| `src/export/roles.ts` | The structure rule: `guessStructure` from a binder's shape, `assignRoles` (with `export-as` and what is left out), `titleFrom` a name. Pure. | |
| `src/export/book.ts` | `buildBook`: the binder's items, read and given roles, joined into sections; embeds and pictures brought in through a `Resolver`; footnotes numbered in the order of their marks; warnings with their note. Pure. | Read a file itself. |
| `src/export/picture.ts` | A picture's kind and size from its first bytes (PNG, JPEG, GIF). Pure. | |
| `src/export/style.ts` | Book styles as data, under the names a `.bookstyle` file has (`BookStyle`; built in: `CLASSIC`); `bookHeading` (the heading pattern: `{number}`, `{number:words}`, `{number:roman}`, `{title}`, `/`), the few words export writes in the book's language (`bookWord`), which languages and paragraphs run right to left. Pure. | Know what an ebook or a page looks like: the writers read it. |
| `src/export/details.ts` | Book details as the binder note's properties: `readDetails`, `applyDetails` (only `DETAIL_PROPS`; an empty one is taken out), `languageTag` (a checked tag or null), the languages offered. Pure. | Write to a note (that is `saveDetails` in `export.ts`). |
| `src/export/epub.ts`, `epub-text.ts`, `epub-css.ts` | The ebook writer: a book as an EPUB 3, written by hand as text and zipped with fflate (`mimetype` first, stored). `epub.ts` is the package, the navigation document (the contents page too), the NCX, the cover and the accessibility metadata; `epub-text.ts` a section as XHTML (headings, first words, breaks, footnotes as pop-up notes, links inside the book, pictures); `epub-css.ts` a style as a stylesheet. Pure. | Set a typeface, a size, a colour or justification: those are the reader's. |
| `src/export/docx.ts`, `docx-parts.ts` | The Word writer: a book as a .docx in standard manuscript format, written by hand as text and zipped with fflate. `docx-parts.ts` has the styles (the three manuscript styles), numbering, settings and the package's small files. Pure. | Change the order of elements inside `w:pPr`, `w:rPr`, `w:style` or `w:sectPr` without checking it against the schema: Word refuses a file for that. |
| `src/export/export.ts` | Export where it meets the vault: `readBook` (what is typed is saved first, the binder is read in its order, what notes embed is found as Obsidian finds it), `manuscript`, and `save`: the system's dialog or the Exports folder, the places remembered on this device, the share sheet. | Write to a note, its text or its properties. Replace a file export didn't write without asking. |
| `src/export/scriv/` | The Scrivener project. `project.ts` (`writeScriv`: a binder's items with what Binders knows of each, into the project's files; what goes to Draft and what to Research), `scrivx.ts` (the `.scrivx` and `compile.xml` as text), `rtf.ts` (a note's blocks as RTF, with Scrivener's inline footnotes and annotations), `text.ts` (the Markdown reader with comments and tab-led paragraphs kept through it), `parts.ts` (the format's open choices, one constant each; ids, dates, colors), `styles-xml.ts` (Scrivener's own default styles file). All pure. `vault.ts` is where it meets Obsidian: `readScriv` reads the binder (properties, folder notes, snapshots, pictures), `saveScriv` puts the project where it goes. | Write to a note; write into a project that isn't as export left it; go through the book model (a project is the binder, not a book). |
| `src/view/export-scriv.ts` | The Export window's Scrivener kind: its two switches, its bar, its preview (the binder as Scrivener will list it) and its export. `view/export.ts` asks here for each. | |
| `src/export/desktop.ts` | The save dialog and the disk, on a computer: Electron's and Node's, asked for only when used (golden rule 5). `writeFolder` writes a folder of files (a Scrivener project) whole or not at all. `desktop()` is null when anything is missing. Reached through `plugin.exportHost`, so a test can stand in for the dialog. | Be imported for anything but saving an export; throw when something isn't there. |
| `src/view/book-details.ts` | Book details (`BookDetailsModal`): Obsidian's setting rows over the binder note's own properties, kept as they are changed; `pickCover`. A binder that can't be written (a newer format, a Longform project) is shown and not changed. | |
| `src/view/export.ts`, `export-preview.ts` | The Export window (`ExportModal`): Obsidian's two-pane dialog with the kinds that exist (Manuscript, Ebook, Scrivener project, One note), their choices, where the file goes, the warnings; the bar, Contents, and the preview (`export-preview.ts` draws a manuscript's text on paper from the book model, and the outline). A phone has the choices first and the preview second. | Write anything itself: it asks `export/export.ts` and `scenes.ts`. |

### The binder view

| File | What it is | Must never |
|---|---|---|
| `src/view/BinderView.ts` | The view shell (`binders-view`): toolbar, mode switcher, "Arrange" menu, filter, the folder's synopsis, view state (kept in the workspace), history, and the store subscription that makes the current mode refresh. Mounts one mode from `plugin.modeFactories`. | Draw a mode's content, or edit a binder. |
| `src/view/mode.ts` | The contract between the view and its modes: `ModeContext` (what a mode may ask of the view) and `BinderMode` (what a view may ask of a mode). | Import any mode. |
| `src/view/corkboard.ts` | The corkboard grid. Cards in binder order, a folder as one card, drag and keyboard reorder, editing in place. | Redraw while something is being typed or dragged. |
| `src/view/lanes.ts`, `lanes-data.ts` | The corkboard arranged by label: one line per label, the cards along them. `lanes-data.ts` is the pure model (the lines, the places, what a drop means); `lanes.ts` draws it. Not a mode of its own: `BinderView` picks it from the corkboard's `arrange` option. | |
| `src/view/card.ts` | The index card both boards draw, and what they share: `held` (the first five notes and folders a folder's card names, under the filter's view of them), `passing` (the notes a filter lets through), `crumbAt` (the breadcrumb's crumb under a pointer, as a drop target). | |
| `src/view/outliner.ts`, `outliner-columns.ts`, `outliner-data.ts` | The outliner: rows of a tree table, editing in place, sorting, folding, dragging. `outliner-columns.ts` is its header (a column's menu, sorting, resizing, reordering, which columns show) and asks the outliner only through `ColumnsHost`. `outliner-data.ts` is the pure part: which columns exist, how values sort, read and are typed. | |
| `src/view/manuscript.ts` | The manuscript: every note as a section of one scrolling page, live editors only near the viewport (on a phone, only on the section that was tapped), caret and keyboard handling across sections, saving on every route out (switching mode, closing, quitting). | Mount an editor except through `editable-embed.ts`; leave unsaved typing behind. |
| `src/view/editable-embed.ts` | One live editor on one note, built from Obsidian's own editable embed. Merges outside edits into unsaved typing, keeps undo history across remounts, writes pending typing before it lets go. | Be used by anything but the manuscript and snapshots (`liveEditors`); trust Obsidian's embed without `embedSupported()`. |
| `src/view/tap-text.ts` | Where a tap on a section's rendered text is in the note's source: `sourceOffset`, which finds the place by the words drawn around it (the editor and the rendered text don't break lines at the same words). Pure. | Touch the DOM or Obsidian. |
| `src/view/actions.ts` | What can be done to a note or folder, the same on a card and in a row: the item menu, renaming, deleting, status, label, target, properties. Views say how their own parts work through `Hooks`. | |
| `src/view/drag.ts` | A press that may become a drag (mouse, pen, or a finger's long press), and the glide after a redraw. Reads the pointer only. | Decide what a drag does. |
| `src/view/file-drag.ts`, `file-drag-data.ts` | A card or row dragged out of the view becomes a file drag Obsidian understands (a canvas, a tab, bookmarks, the explorer). `file-drag-data.ts` holds the pure geometry. | Do anything while the pointer is inside the view. |
| `src/view/edit.ts` | Text edited in place (a title, a synopsis, a cell). What's typed stays in the field until it is saved; a failed save keeps it. | Drop typed text. |
| `src/view/labels.ts` | Labels and statuses: the palette, colors, reading what notes and settings hold. Pure. | |
| `src/view/words.ts` | Word counts as Obsidian counts them; `WordCounter` caches per note by modification time and reads in the background. | Block a view on disk reads. |
| `src/view/modals.ts` | Small dialogs in Obsidian's own style: confirm, ask for text, pick a color, new label. | |
| `src/view/snapshots.ts` | Snapshots, writer side: "Take a snapshot", "Rewrite", the Snapshots dialog and its diff, a snapshot opened in a pane (`SnapshotView`), the menu items, notes that are gone. | Write snapshot files itself: it asks `src/snapshots.ts`. |
| `src/view/windows.ts` | What belongs to the window a view is in when that is a window of its own: `watchSize` observes an element's size from its own window and follows it when its tab moves to another. | Use the main `window`'s observers or frames for a view that may be in a popout. |
| `src/view/internals.ts` | Undocumented Obsidian API the views use: submenus, keeping a menu open, opening settings, header titles, the vault's trash, link and Vim settings, the history dialogs' classes. Each function checks for what it needs and falls back. | Throw if something is missing. |

### The inspector and the contents

Two views for the sidebar. They read the binder view and the workspace, and write only through the functions the
cards and rows write through.

| File | What it is | Must never |
|---|---|---|
| `src/inspector/follow.ts` | `Follow`, one for the plugin (`plugin.inspect`): which tab the writer was last in (never a sidebar's) and what is in hand there (`Target`: the section with the cursor or at the top of the page, selected cards or rows, a folder, a note in a tab). Tells the panes by `on('target')`. `rev` goes up when the data may have changed, and not when only the place did. | Change anything; follow a sidebar's own tab. |
| `src/inspector/views.ts` | `FollowingView`, the base of both views (it saves open fields on every way out, as `BinderView` does), `InspectorView` (`binders-inspector`), "Show inspector". | |
| `src/inspector/place.ts` | `placeSide`: both tabs put among the right sidebar's whenever a binder view opens or is restored, if neither sidebar has them, unless the setting is off. | Open the sidebar, bring a tab to the front, or add a second of either. |
| `src/inspector/scene-pane.ts` | The inspector's pane: synopsis, label, status, target, export and role, notes, a note's snapshots, for one item or several. Fields are `view/edit.ts`'s; menus and writes are `view/actions.ts`'s and `view/props.ts`'s. | Save a field to any note but the one it was opened on; draw while a field is being typed in; turn to another item before what's typed is saved. |
| `src/inspector/roles.ts` | The role each item plays in an export, as `export/roles.ts` assigns it, read from properties alone. | Read a note's text. |
| `src/inspector/contents-pane.ts` | `ContentsPane` and `ContentsView` (`binders-contents`): the binder as a tree in reading order, the mark, a click that goes there in the open binder view, folding (kept in the view's state), the keys. Rows are kept and put right (`sync`); a change of place only moves the mark. | Reorder, rename or delete anything; draw the whole list again for a change. |
| `src/view/props.ts` | Reading and writing a note's card data and its notes under the property names in settings: the one way, for the binder view and the inspector. | |

### Focus mode

| File | What it is | Must never |
|---|---|---|
| `src/focus/focus.ts` | `Focus`: in and out, the classes on `<body>` and the tab, typewriter scrolling, the scenes before and after, the place and the counts, dimming, fullscreen, its commands and menu, the day's words. A state of the view already open, never a view of its own. | Close, collapse or save anything of Obsidian's; remount the editor being typed in; keep any state that says focus is on. |
| `src/focus/session.ts` | The day's words, "the last line", the excerpts of the scenes before and after, a goal as typed. Pure. | Import Obsidian. |
| `src/focus/dom.ts` | Obsidian's own page and editor as far as focus mode reaches into them (the column a note's text is in, the room under its last line, where the cursor is on screen). | |
| `styles.css` | One style sheet for the whole plugin. Focus mode's hiding of Obsidian's window is one block in it, by class name. | Use `!important`, `all:`, scrollbar styling. |

### Paragraphs

| Module | Owns | Must never |
|---|---|---|
| `src/paragraphs/paragraphs.ts` | `installParagraphs`: the editor extension that gives an editor on a binder's note its reading of tab lines and its first-line indents (and takes them away when the note or the settings change), the post-processor for reading view, `forRender` for what Binders renders itself. | Write to a note. Touch an editor whose note isn't in a binder. |
| `src/paragraphs/mode.ts`, `src/paragraphs/language.ts` | Obsidian's Markdown mode wrapped so a line begun with a tab is read as a paragraph; the language made from it. The undocumented part. | Throw: anything not as expected is null, and the lines stay code. |
| `src/paragraphs/first-line.ts` | "Indent paragraphs" in the editor: which lines are paragraphs that follow a paragraph. | Put anything in the text. |
| `src/paragraphs/text.ts` | Which lines of a text are paragraphs begun with a tab; the text made ready for a renderer; whether a link meant a renamed file; links on those lines repointed. Pure. | Import Obsidian. |
| `src/paragraphs/rename.ts` | Links in tab paragraphs following a rename: the one place a note's text is rewritten without a command (golden rule 3). | Change anything but a link's note; write before Obsidian has finished with the note, or over unsaved typing; guess when a link is ambiguous. |

## How a change travels

Three journeys cover almost everything. In each, the file on disk is the source of truth and every view is told, never
trusted.

### A drag on the corkboard to the binder note on disk

1. `drag.ts` reads the pointer. Past a few pixels (or after a long press by touch) it calls the corkboard's `PressHost`
   hooks; the corkboard works out the drop: which folder, and before which card.
2. On drop the corkboard calls `store.put(items, folder, anchor, depth)`. `put` runs through `store.change(...)`, which
   (via `MoveHistory`) first records where each item is.
3. For each item `store.move` checks the move can be made (not into itself, no name clash, not a binder or folder
   note), moves the file with `fileManager.renameFile` if the folder changed (so links follow), and queues a `ListOp`
   (`move`) with what the binder held when the move was made.
4. `queue` clears the cached order and emits `changed` (one event for the batch). Every view and the explorer redraw
   from the new order at once; the cards glide to their places. Nothing has been written to the binder note yet.
5. 300 ms later (`DEBOUNCE`) `write` applies all the queued operations to **what the binder note says at that moment**
   (not to a copy kept earlier) inside `fileManager.processFrontMatter`, which writes `contents` and nothing else. If the
   note's `binder` version is newer it throws before writing.
6. The metadata cache reports the note changed; the store re-reads it and, if the order is what it already showed, says
   nothing more.

Moving a folder of 40 notes is 40 `ListOp`s and one write. "Move up", a drop in the outliner or the explorer, and a
label dragged across the lines of the board by label take the same road (`put`, `move`, or `label`).

### A keystroke in the manuscript to the note on disk

1. A section near the viewport has a live editor, made by `mountEditor` from Obsidian's own editable embed
   (`editable-embed.ts`). The keystroke is Obsidian's: CodeMirror, undo, formatting and links behave as in a note.
2. The embed's `save(text)` runs on each update; Obsidian's debounced write puts the note on disk. Binders' wrapper
   reports the typing (for the word count) and keeps track of the write in flight, so that `flush()` can wait for it.
3. When the note changes from outside this editor (another app, sync, a tab of the same note) the embed's
   `onFileChanged` is replaced by ours: it always goes through Obsidian's three-way merge when the editor has unsaved
   typing, and passes the merged text to other views of the note.
4. On every route out (a mode switch, closing the view, the plugin unloading, quitting) pending typing is written
   first, and a new editor for the same note waits for that write. `flush()` loops until nothing is unsaved: words
   typed during a write in flight are written by the next one, not left behind. Whatever reads, copies, merges or
   deletes a note calls `saveOpen` (`scenes.ts`) first, which asks every manuscript's editors to `saveEditors`
   (their flushes, and the last write of an editor that has just gone) and every tab of the note to `saveTab` (it
   waits for the tab's own write in flight, and writes nothing if the tab holds nothing the file doesn't). As the page
   itself leaves (a reload, a closed window) on a computer, nothing is started: a write there is in two steps, and
   one cut off between them would leave the note empty, so the note stays as last saved, as in a tab of its own.
   Quitting asks for the writes first and waits for them.
5. Sections far from the viewport are rendered text, not editors. They are re-rendered when the file changes
   (`manuscript.ts`, `onModify`).

If the embed API isn't there (checked by `embedSupported()`), the manuscript is read-only rendered Markdown and clicking
a section opens the note.

### An outside edit back into every view

1. Someone changes a note or the binder note outside Binders (a text editor, sync, another plugin).
2. Obsidian's metadata cache reports `changed`. The store (`onMeta`) re-reads the binder note's `contents`, and
   emits `changed` only if the order or the binder's state is different from what it showed. A `rename`, `delete` or
   `create` in the vault is followed the same way: the store turns it into `ListOp`s so an item keeps its place, then
   writes them.
3. `BinderView` hears `changed` (for its folder or one above it) and the cache's `changed` (for a note in it), and
   schedules `mode.refresh()`. A mode updates in place, keeping scroll and selection, and **waits while something is
   being typed or dragged**.
4. The explorer hears the same `changed` and re-sorts. Focus mode redraws its own numbers.
5. In the manuscript, a section with a live editor merges the outside edit (step 3 above); a rendered one is drawn again.

## Where the undocumented parts of Obsidian are used

The full table (what each internal is, how it is detected, the fallback, the test) is
[internals.md](internals.md). This is the map of where to look:

| Module | What it reaches into |
|---|---|
| `src/explorer.ts` | The file explorer view: `getSortedFolderItems`, `fileItems`, `requestSort`, `startRenameFile`, a folder item's `collapsed`/`toggleCollapsed`/`setCollapsed`, `tree.handleItemSelection`, the explorer's DOM, and `app.dragManager` for dragging. |
| `src/view/file-drag.ts` | `app.dragManager` in full (`dragFile`, `dragFolder`, `dragFiles`, `onDragStart`, `onDragEnd`, `ghostEl`), drag events made by hand, and a few class names (a canvas, bookmarks, tabs). |
| `src/view/editable-embed.ts` | `app.embedRegistry.embedByExtension.md`, the embed's own methods and fields, `workspace.unsetActiveEditor`, `workspace.onQuickPreview`, Obsidian's cache of undo histories, a tab's `lastSavedData`. |
| `src/export/desktop.ts` | Electron's `remote.dialog.showSaveDialog` and `shell`, Node's `fs` and `path`: saving an export where the writer says, a file or (a Scrivener project) a folder of files. |
| `src/view/internals.ts` | `MenuItem.setSubmenu`, a menu's `items`, `select` and `dom`, `app.setting`, `vault.getConfig` (`trashOption`, `alwaysUpdateLinks`, `vimMode`, `readableLineLength`), `leaf.updateHeader`, `titleEl`, the history dialogs' class names. |
| `src/focus/dom.ts` | The editor's `cm`, the structure of a note's page, the editor's bottom padding. |
| `src/paragraphs/mode.ts`, `src/paragraphs/language.ts` | The state of Obsidian's Markdown mode (`indentation`, `indentationDiff`, `list`, `quote`) and its token `hmd-indented-code`; that the editor's language is a stream language. |
| `src/longform.ts` | `app.plugins.plugins` (is Longform running). |
| `src/inspector/scene-pane.ts`, `src/inspector/contents-pane.ts`, `styles.css` | No API: the class names of Obsidian's own sidebar views, for their look (`metadata-property`, `tree-item`, `pane-empty`). |
| `src/view/manuscript.ts`, `src/view/drag.ts`, `src/focus/focus.ts`, `styles.css` | A few class names of Obsidian's own window, each with a fallback. |

When you add one, put it in one of those places (or a new module named for it), feature-detect it, give it a
fallback, add a row to `internals.md`, and add an e2e test. That is golden rule 5.

## Invariants that keep writing safe

These are the rules the code is held to. A change that breaks one needs a new test that shows why it is safe.

1. **Binders writes few things.** A binder note's `contents`, its own properties (and a folder note's), the properties
   you edit in a view, a Longform index note's `longform.scenes`, snapshot files, the notes that scene work creates,
   the file an export makes (and never a note it read), and
   note text only through an editor you are typing in, or a snapshot-guarded replace.
2. **Apply, don't overwrite.** Changes to a list are kept as operations and applied inside `processFrontMatter` to what
   the note says then, so an outside edit made in the meantime is not lost. A write drops entries that no longer name
   anything, but if that would drop all of them, or more than half, with no rename or delete to account for it, they
   are kept after the rest.
3. **A newer format is never touched.** `checkFormat` runs before every write; the binder is read-only (`problem`) and
   every change reports why.
4. **Text exists twice before it exists once.** Split, merge and snapshot "Rewrite" and "Bring back" put the text
   somewhere safe, read it back, and only then let the first copy go.
5. **Nothing waits in a buffer at the end.** The store flushes pending writes when the plugin unloads; the manuscript
   writes pending typing on every route out; a new editor waits for the previous one's write.
6. **Moves are all or nothing.** Undo moves nothing unless every item can go back, and refuses with the reason if a
   place was taken or a folder is gone.
7. **Degrade, don't break.** Every undocumented API is detected; when one is missing the feature falls back (alphabetical
   explorer, read-only manuscript, no typewriter line) and says so once.
8. **Leave nothing behind.** Focus mode changes no state of Obsidian's; unloading removes the explorer patch, the icons
   and dots, and the classes.
9. **A save waits for the words typed during a write in flight.** A flush is done only when nothing is unsaved and
   no write is on its way; one that returned earlier would let a read, a merge or a delete go ahead on old text.
10. **A merge is against what the editor holds.** An outside change is merged (three ways) with the text in the editor
    and what was last saved, not with a copy kept earlier, so typing and the outside edit both survive.
11. **A block that isn't properties is text, everywhere.** One rule (`scene-text.ts`) says where a note's properties end;
    merge, split, export, snapshots, the manuscript and focus mode all use it.
12. **Nothing is started as the page goes.** See the keystroke journey, step 4.
13. **A property write never drops text.** `editProperties` is the one way a property is written to a scene; for the
    two kinds of note Obsidian's writer would damage, it writes the block itself.
14. **Never block a view on the disk.** Word counts read in the background, redraws are batched, and only the rows or
   cards that changed are drawn.

## How the tests map onto it

| Layer | Unit tests (`tests/*.test.ts`, run in Node) | End-to-end specs (`tests/e2e/specs*.mjs`, real Obsidian) |
|---|---|---|
| Binder model | `model`, `qa-model` | `specs-binders`, `specs-qa-store` |
| Longform | `longform` | `specs-longform` |
| Settings, labels, words | `view` | `specs` (settings tab), `specs-labels`, `specs-qa3-labels` |
| Scene work | `scene-text` | `specs-scenes`, `specs-qa3-scenes` |
| Export | `export-model`, `export-style`, `export-docx` and `export-epub` (the word-for-word tests; EPUBCheck) | `specs-export` |
| Paragraphs | `paragraphs` | `specs-paragraphs` |
| Snapshots | `snapshot-text` | `specs-snapshots` |
| Focus mode | `focus-session` | `specs-focus` |
| Explorer patch | | `specs-explorer`, `specs-qa2-explorer`, `specs-qa4-explorer` |
| Binder view shell | | `specs-view`, `specs-a11y`, `specs-themes` |
| Corkboard and lanes | `lanes` | `specs-corkboard`, `specs-lanes`, `specs-qa-corkboard`, `specs-qa2-corkboard`, `specs-qa5-cork` |
| Outliner | `outliner` | `specs-outliner`, `specs-qa3-outliner`, `specs-qa5-outliner` |
| Manuscript and embed | | `specs-manuscript`, `specs-qa-manuscript`, `specs-qa2-manuscript`, `specs-qa4-manuscript`, `specs-qa5-manuscript` |
| Dragging between views | `file-drag` | `specs-card-file-drag` |
| Phones and tablets | | `specs-mobile`, `specs-qa4-mobile`, `specs-qa5-tablet`, `specs-qa5-nav`, `specs-qa4-journey` |
| Speed on a large binder | | `specs-perf` |
| The inspector and the contents | `view` (the notes setting), `outliner` (the Notes column) | `specs-inspector` |
| The sixth QA round, by area (2026-10-02) | | `specs-qa6-writing` (nothing typed is lost), `specs-qa6-scale` (thousands of notes), `specs-qa6-store`, `specs-qa6-boards`, `specs-qa6-menus` (every menu item, command and setting), `specs-qa6-phone`, `specs-qa6-tablet` (also keyboard, screen readers, themes), `specs-qa6-features` (snapshots, focus mode, scene work) |
| The test tools themselves | `demo-vault` | `specs-driver`, `specs-hover` |

`tests/e2e/driver.mjs` and `view-helpers.mjs` are the harness (`run.mjs` runs spec files in one Obsidian, `run-all.mjs`
splits the whole suite over several); `tests/harness.ts` and `tests/obsidian-stub.ts` are the
unit tests'. Which spec file covers what, how to run them, and the list of failures still open
(`tests/e2e/open-findings.json`) are in [development.md](development.md). Anything that touches how notes are read,
written, renamed or edited has an e2e test that checks the file on disk, not only what the screen shows.

## Where to add things

- **A new rule about text or order:** a pure function in `model.ts`, `scene-text.ts` or a `-data.ts` file, with a unit
  test first. Then call it from the store or a view.
- **A new change to a binder:** a method on `BinderStore` (so it is queued, batched, undoable if made by hand, and
  refuses a newer format). Not a write from a view.
- **A new mode of the binder view:** a `ModeFactory` in `plugin.modeFactories` and a `BinderMode`, as `outliner.ts` is;
  its pure parts in a `-data.ts` file.
- **A new command:** `src/main.ts` (focus mode's and the snapshots' are registered where they live), no default hotkey,
  sentence-case name without the plugin's name, and a `checkCallback` that returns false where it doesn't apply.
- **A new setting:** `settings-data.ts` first (field, default, reading it back, unit test), then `settings.ts`.
- **Anything of Obsidian's that isn't in its API:** see the invariants above and golden rule 5.
