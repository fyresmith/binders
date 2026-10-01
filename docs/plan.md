# Binders: plan

Status: feature-complete for 1.0 (0.8, polish). The explorer, binder store, corkboard, plot grid, editable manuscript and
Longform integration all work, on desktop and mobile. Next: QA rounds (0.9), then release (1.0).

## What it is

Binders makes folders behave like a writer's binder. A **binder** is a folder whose notes and subfolders have an order
you choose, not alphabetical. Obsidian's own file explorer shows them in that order. Clicking a binder (or a folder inside
one) opens the **binder view**, which switches between three ways of seeing the same notes:

- **Corkboard**: one index card per note (title, synopsis, status, label color), in order, grouped by subfolder. Drag
  cards to reorder or move them between folders.
- **Plot grid**: notes down the side, plotlines across the top; a cell marks that a plotline runs through that scene.
- **Manuscript**: every note in the binder, in order, as one continuous, editable document, with the subfolders as
  headings and a break between notes. Typing edits the real notes.

It should feel like part of Obsidian: the same icons, fonts, colors, spacing, menus, keyboard behavior and themes.

## Who it's for, and why now

- Scrivener users who come to Obsidian and miss the binder, the corkboard and "Scrivenings".
- Longform users (188k downloads). Longform has no corkboard; "corkboards in Longform" and "corkboard functionality in
  Canvas" are open requests.
- StoryLine (41k downloads in about seven months) shows the demand, but it imposes its own project structure and doesn't
  look or feel native. Binders stays close to plain folders and notes, and does less, better.

## Principles

1. **Plain files.** A binder is a folder plus one binder note. Everything about a scene lives in that note's own
   properties. Without the plugin, everything is still ordinary, readable Markdown.
2. **Native.** Obsidian's CSS variables, `setIcon`, `Menu`, `Modal`, `Setting`, tree-item styles in the explorer,
   and its keyboard conventions. No custom fonts, no heavy chrome. Light and dark themes, and community themes, just work.
3. **Never lose writing.** The manuscript edits real notes, so it is held to the highest standard: every keystroke
   lands in the right file, and any failure falls back to read-only rather than risking text.
4. **Degrade, don't break.** The explorer patch and the embedded editors use Obsidian internals. Each is isolated behind one
   module, feature-detected at load, and falls back (alphabetical order; read-only manuscript) if an Obsidian update
   changes those internals.

## Data model

See [file-format.md](file-format.md) for the full specification.

- **Binder note**: a note in the binder folder whose properties include `binder: 1` (the format version). By
  convention it is named like the folder (`Novel/Novel.md`), which also works with folder-note plugins.
- **`contents`**: the binder's table of contents, a list of paths relative to the binder, folders ending in `/`, in
  reading order. It is one list for the whole binder, so it reads like a table of contents and is easy to fix by hand.
- **Folder notes**: each subfolder in a binder can have a note named like it (`Part One/Part One.md`) that holds the
  folder's own data: its synopsis, status and label. Binders creates it the first time you give the folder a synopsis,
  status or label in a binder view. It never shows as a scene, in `contents`, or in the manuscript.
- **Per-note properties** (names configurable): `synopsis` (the card text), `status` (draft, revised…), `label` (a
  color), `plotlines` (a list), `plot` (text per plotline, reserved). They show in Obsidian's Properties panel and work
  with Bases and Dataview. The binder note and folder notes use the same `synopsis`, `status` and `label`.
- **Binder options**, in the binder note: `plotlines` (the grid's columns, in order), `target` (word count goal), and
  view preferences.
- **Not in the list**: notes and folders the list doesn't mention show after the listed ones, by name. Listed items
  that no longer exist are skipped, and dropped the next time Binders writes the list.
- **Nested binders** are not allowed in 1.0: a binder note inside a binder is treated as an ordinary note.
- **Format versions**: the binder note carries its version. A binder from a newer version is refused and left
  untouched, never downgraded.

### Keeping the list right

- Renames and moves inside a binder (from the explorer, links, other plugins) update `contents` through
  `vault.on('rename')`, so an item keeps its place. Moving a note out of the binder removes it; moving one in appends it.
- Binders writes only the binder note's `contents` (and its own options), through `processFrontMatter`, so the rest of
  the note is never touched. It never renames, moves or deletes files by itself, except when you drag something to
  another folder in a binder view (which moves the file, as dragging in the explorer does).
- Writes are debounced and batched: moving a folder of 40 notes writes the binder note once.

## The file explorer

- **Order**: patch the core file explorer's child sorting (its internal `getSortedFolderItems`, via `monkey-around`) so
  folders inside a binder sort by `contents`. Everything else keeps Obsidian's sort. The patch is removed on unload.
  Feature-detected: if the method isn't there, Binders shows a one-time notice and the explorer stays alphabetical.
- **Opening**: clicking a binder or a folder inside one opens the binder view on that folder (a setting; on by default),
  while still expanding the folder. Implemented as a click listener on the explorer's folder titles, not a patch.
- **Marking**: a small binder icon on binder folders. The binder note and folder notes are hidden from the explorer by
  default (a setting shows them), as folder-note plugins do, since clicking the folder opens the binder view. The
  folder's right-click menu and the binder view header have "Open folder note".
- **Reordering in the explorer**: not in 1.0 (dragging there moves files between folders, which Obsidian owns).
  Reorder in the binder view, or with "Move up/down" in the explorer's right-click menu.
- **Commands and menus**: "Make this folder a binder", "Open binder", "Move up", "Move down", "New scene here".
- Not compatible with plugins that replace the explorer (Notebook Navigator and the like): documented, and the setting
  turns the patch off.

## The binder view

One view type (`binders-view`) per binder or subfolder, with a header: breadcrumb (Binder › Part One), a view switcher
(Corkboard · Plot grid · Manuscript), word count and target, and a filter by status/label.

### Corkboard

- Cards in a responsive grid (or one column on narrow panes), grouped under subfolder headings; a subfolder can also show
  as a single stacked card (like Scrivener) with its own synopsis from its folder note.
- The synopsis of the binder or folder being viewed shows under the header, editable in place, as do a subfolder's
  synopsis on its heading or stacked card. Editing writes to that folder's note (creating it if needed).
- Card: title, synopsis (editable in place), status chip, label color stripe, word count. Double-click opens the note.
- Drag to reorder, including between groups (moves the file into that folder). Multi-select with Shift/Ctrl.
- New card: creates a note in that folder at that position; the title is typed on the card.
- Keyboard: arrows move the selection, Enter opens, Alt+arrows reorder, Delete asks before trashing.

### Plot grid

- Rows are scenes in binder order (grouped by subfolder); columns are the binder's plotlines.
- Clicking a cell toggles that plotline in the scene's `plotlines` property. Rows and columns can be reordered;
  columns can be added, renamed and colored.
- 1.0 cells are on or off; notes in cells (text per scene per plotline) are a later version, stored in the scene's
  `plot` property (`plot: {Mara: "…"}`), edited in the grid. The name is reserved in format 1. Obsidian's Properties
  panel can't edit nested properties, so the grid is where they're edited.

### Manuscript

- Every note in the binder, in order, stacked into one scrolling page: subfolder names as headings, a divider and the
  note's title between notes, then the note's body in a live editor.
- Editing: each section is a real embedded Markdown editor for that note (Obsidian's internal editable embed, as Canvas
  uses). Typing, undo, formatting, links and the cursor all behave as in a normal note; saving goes to that note.
- Properties are hidden in the manuscript (the card and grid edit them). Arrow keys move between sections naturally.
- Large binders are virtualized: only sections near the viewport have live editors; the rest show rendered text.
- Fallback: if the internal embed API isn't available, the manuscript is read-only rendered Markdown, with a notice,
  and clicking a section opens that note.
- Export (later): compile to one note, then Pandoc/PDF via other plugins.

## Longform integration

Supported (0.7): Longform's multi-scene projects. Single-note projects (`format: single`) aren't binders.

- **Detection**: a note whose `longform` property has `format: scenes` is a project. Its **scene folder**
  (`sceneFolder`, relative to the index note) is the binder folder and gets the binder icon; the index note is the
  binder note (hidden in the explorer when it's in the scene folder). The vault root can't be one. A project inside a
  binder is ordinary notes; a note with both `binder` and `longform` is a binder.
- **What's in it**: only the notes directly in the scene folder, as in Longform. Subfolders and notes matching
  `ignoredFiles` aren't scenes (the explorer still shows them, after the scenes).
- **Order**: `longform.scenes`, flattened with an indent per scene, as Longform reads it. Notes it doesn't list show
  after the listed ones, by name (Longform's "new scenes"). Listed names with no note are skipped.
- **Groups**: Longform projects have no subfolders; scenes indented under a scene form a group headed by it.
  `store.groups(folder)` gives groups for both kinds (a binder's groups are its subfolders), for the views' headings.
  The corkboard shows each group as an indented panel headed by its scene (dropping a card or making a new one there
  indents it); the plot grid indents rows as Longform does; the manuscript runs the scenes in order, with no headings.
- **Writing**: reordering (the views, Move up/down, New scene here) writes only `longform.scenes`, through
  `processFrontMatter`, batched and applied to what the note says then, in the nested shape Longform writes. Every other
  property, and every other key inside `longform`, is kept. A moved scene keeps its indent unless a view gives a new one
  (dropping it into a group); a note not listed yet takes the indent of the scene before it. Files never move.
- **Renames and deletes**: when Longform is running it updates `scenes` itself, so Binders only shows the change.
  Otherwise Binders writes them, as Longform would: a rename keeps the scene's place, a deleted or moved-out scene is
  dropped, a note moved in shows after the listed ones.
- **Plot grid**: `plotlines` and `plotlineColors` live at the top level of the index note, not inside `longform`.
- **Convert to binder** (command, and the index note's and scene folder's right-click menu): a dialog says what will
  happen, then writes `binder: 1` and `contents` (the Longform order) into the index note (or, if the index note is
  outside the scene folder, a new binder note named like that folder, with the plotlines). Options, both off by default:
  - *Move groups into folders*: each top-level scene with scenes indented under it gets a subfolder named after it,
    next to it, and those scenes move into it (deeper indents are flattened; links update). Scenes indented under
    nothing go in "Group 1", "Group 2"…
  - *Remove the "longform" property* from the index note. Left on, Longform still lists the project, but its order no
    longer follows changes made in Binders.
  Notes Longform ignored, and subfolders, become part of the binder. No text changes.

## Architecture

```
src/
  main.ts            plugin lifecycle, commands, events
  settings.ts        plugin settings (declarative, with a fallback for Obsidian before 1.13)
  model.ts           the binder index: parse, order, rename, move (pure, unit-tested)
  binders.ts         finds binders in the vault, keeps an index per binder, writes changes (debounced)
  explorer.ts        the file explorer patch and click handling (isolated; feature-detected)
  view/
    BinderView.ts    the view shell: header, switcher, state
    corkboard.ts
    plotgrid.ts
    manuscript.ts    embedded editors (isolated; feature-detected)
  longform.ts        Longform projects: reading and writing `longform.scenes` (pure, unit-tested)
  longform-convert.ts  the "Convert to binder" dialog
```

- `model.ts` has no Obsidian imports; everything that touches the vault goes through `binders.ts`.
- Each Obsidian internal used is wrapped in one function with a type guard, listed in `docs/internals.md`, and has an e2e
  test that fails loudly if an Obsidian update changes it.

## Milestones

Each is a minor version; patches in between. Every commit bumps the version (see AGENTS.md).

| Version | Scope | Status |
|---|---|---|
| 0.1 | Scaffold: build, lint, tests, e2e harness, release workflow, docs, binder index model | Done |
| 0.2 | Binders in the vault: detection, index cache, rename/move/delete tracking, commands to make a binder and add scenes | Done |
| 0.3 | File explorer: order patch, binder icon, click to open, move up/down, hide binder note | Done |
| 0.4 | Binder view shell and corkboard (read, reorder, move between folders, new card, edit synopsis/status/label) | Done |
| 0.5 | Plot grid | Done |
| 0.6 | Manuscript: read-only first, then editable embedded editors, virtualization | Done |
| 0.7 | Longform integration | Done |
| 0.8 | Polish: keyboard, touch, themes, performance on a 1,000-scene binder, a full mobile pass, README | In progress: explorer Mod-click, cold start, keyboard and screen readers, themes, mobile emulation pass, perf guard (`specs-perf.mjs`) and README done; real-device iOS and Android checks to do |
| 0.9 | QA rounds (as with Evra: parallel QA agents, e2e suites, fixes) | |
| 1.0 | Release and directory submission | |

## Risks

| Risk | Mitigation |
|---|---|
| Explorer internals change | One module, feature detection, fallback to alphabetical, e2e test per Obsidian version |
| Embedded editors (internal API) | Isolated; read-only fallback; heavy e2e on typing, undo, switching notes, external edits |
| Losing text in the manuscript | Each editor saves its own file through Obsidian; merge-on-external-change like Evra; soak tests |
| Conflicts with explorer plugins | Setting to turn the patch off; documented |
| Mobile (a 1.0 requirement) | Test each milestone from 0.3 on iOS and Android; touch drag and long-press menus; the manuscript's editors must be solid there, not read-only |
| Big binders | Index cache; virtualized manuscript; corkboard and plot grid redraw only what changed (cards off screen aren't laid out); batched writes; a generated 1,000-scene binder with a perf guard (`specs-perf.mjs`) |
| Review (patching core UI) | Minimal patch, clean unload, explained in the README |

## Decided

- **Folder data**: binders and subfolders each have a note (the binder note, and folder notes named like the folder),
  hidden in the explorer by default. Their synopsis is edited in the binder view.
- **Plot grid cell text** (after 1.0): the scene's `plot` property.
- **Mobile**: a 1.0 requirement, including the editable manuscript.
