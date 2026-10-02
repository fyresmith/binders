# Binders: plan

Status: feature-complete for 1.0, in QA. The explorer, binder store, corkboard, outliner, editable manuscript,
Longform integration, labels and statuses, word count targets, scene operations (split, merge, duplicate, group,
compile) and undo of moves all work, on desktop and in mobile emulation. The last version committed is 0.6.31. The
outliner (in place of the plot grid), labels and statuses in settings, note and folder targets, the scene operations
and undo of moves are in the working tree, unreleased, and ship as the next minor. Next: finish the QA rounds,
real-device checks, then release (1.0).

## What it is

Binders makes folders behave like a writer's binder. A **binder** is a folder whose notes and subfolders have an order
you choose, not alphabetical. Obsidian's own file explorer shows them in that order. Clicking a binder (or a folder inside
one) opens the **binder view**, which switches between three ways of seeing the same notes:

- **Corkboard**: one index card per note (title, synopsis, status, label color), in order, grouped by subfolder. Drag
  cards to reorder or move them between folders.
- **Outliner**: notes and folders as rows of a tree, with columns the writer picks (label, status, words, target,
  progress, compile, dates, any note property), sortable, editable in place.
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
  folder's own data: its synopsis, status, label and target (and `compile: false` to leave the folder out of a
  compile). Binders creates it the first time you give the folder one of these in a binder view. It never shows as a
  scene, in `contents`, or in the manuscript.
- **Per-note properties**: `synopsis` (the card text), `status` (draft, revised…), `label` (a label's name or a
  color), `target` (a word count), with names configurable, and `compile` (`false` leaves the note out of a compile).
  They show in Obsidian's Properties panel and work with Bases and Dataview. The binder note and folder notes use the
  same `synopsis`, `status`, `label` and `target`.
- **Labels and statuses** are lists in the plugin's settings, not in any note: a label is a name and a color (one of
  the theme's palette colors, or a hex color); a status is a name. A note's `label` can be a label's name, a palette
  color's name, or a hex color of its own.
- **View preferences** (mode, filter, card size, label tint, stacks, the outliner's columns, sort and folded folders)
  are kept with the view in the workspace, not in the binder note. The outliner's columns as last arranged are also
  kept in settings, as what a newly opened outliner starts with.
- `plotlines`, `plotlineColors` and `plot`, which the plot grid used, are no longer read or written. Notes that have
  them keep them, as ordinary properties.
- **Not in the list**: notes and folders the list doesn't mention show after the listed ones, by name. Listed items
  that no longer exist are skipped, and dropped the next time Binders writes the list.
- **Nested binders** are not allowed in 1.0: a binder note inside a binder is treated as an ordinary note.
- **Format versions**: the binder note carries its version. A binder from a newer version is refused and left
  untouched, never downgraded.

### Keeping the list right

- Renames and moves inside a binder (from the explorer, links, other plugins) update `contents` through
  `vault.on('rename')`, so an item keeps its place. Moving a note out of the binder removes it; moving one in appends it.
- Binders writes only the binder note's `contents` (and its own options), through `processFrontMatter`, so the rest of
  the note is never touched. It renames, moves, creates or trashes files only when asked to: dragging something to
  another folder (which moves the file, as dragging in the explorer does), renaming in a view, the scene operations
  below, and undoing a move. The one thing it does unasked is rename a folder note to follow its renamed folder.
- A move records what the binder held when it was made (`ListOp` `move` with `known`), so a rename or delete that
  lands before the write can't shift the place it was given.
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
- **Reordering in the explorer**: dragging a note or folder between two others in a binder puts it there (moving
  the file if that's in another folder), as dragging in Scrivener's binder does. A row takes a drop above or below it
  (a folder: along its top and bottom edges; below an open folder's name is the top of what's in it), shown by
  Obsidian's own insertion line and a hint under the pointer ("Move before “Arrival”"). The middle of a folder is still
  Obsidian's "move into". Implemented as capture-phase `dragover`/`drop` listeners that take the event before the
  explorer's own handlers (which skip a prevented event); what's dragged comes from Obsidian's drag manager. With the
  order patch off, or without the drag manager, dragging is Obsidian's own. Also "Move up/down" in the right-click menu.
  - Several items dragged together land in the order they show in.
  - Below the last item of a folder, the pointer left of where its name starts places the drop after the folder
    (outdent), and further left, after that folder's folder.
  - A drop that can't be made is refused with the reason in the hint and, on drop, a notice: a name already in that
    folder, or a note that would become the folder's note.
  - It works in an explorer popped out into its own window.
- **Labels**: a dot in its label's color after each labeled note and folder in a binder (a setting, on by default).
- **Commands**: "Open binder", "Show corkboard", "Show outliner", "Show manuscript", "Arrange corkboard by label",
  "Make this folder a binder",
  "New scene here", "Convert to binder" (Longform), "Split scene at cursor", "Split scene with selection as title",
  "Compile binder", "Undo last move", "Redo last move", "Move up", "Move down". None has a default hotkey.
- **File menu** (a note's or folder's right-click menu): "Open binder", "Make this folder a binder", "New scene here", "Compile...",
  "Convert to binder", "Move up", "Move down", each only where it applies.
- Not compatible with plugins that replace the explorer (Notebook Navigator and the like): documented, and the setting
  turns the patch off.

## The binder view

One view type (`binders-view`) per binder or subfolder. Its toolbar is laid out and sized as a base's is (Obsidian's
own model for a view of notes): the view switcher on the left (Corkboard · Outliner · Manuscript), then, inside a
subfolder, the breadcrumb (Binder › Part One); on the right the word count (with a bar for the target of the folder
shown: the binder's, or a subfolder's from its folder note), the filter by status/label (corkboard and outliner), and
New (note, folder). The view runs edge to edge, as a base, a canvas or a note does.

- A view saved in the `plotgrid` mode by an earlier version opens as the outliner.
- Each mode keeps its place (scroll, selection, caret) per folder when another mode is shown, and in the tab's
  history, so Back returns to it.
- The corkboard and the outliner share one item menu and its actions (`src/view/actions.ts`): open, rename, edit
  synopsis, "Set synopsis from text", "Set status", "Set label", "Set target...", "Duplicate", "Merge N notes",
  "New folder from selection" / "Put in a new folder", "Ungroup", "Include in compile", "Move up", "Move down",
  what Obsidian and other plugins add (`file-menu`, source `binders-card`), and "Delete".

### Corkboard

- Cards in a responsive grid (or one column on narrow panes), drawn as a base's cards are (flat, a hairline border).
  The board shows one folder: each of its items is a card, in the binder's order. A subfolder is a single card drawn
  as a stack, as on Scrivener's corkboard, with its own synopsis from its folder note; it's gone into to see what it
  holds, and the breadcrumb leads back out. (Decided 2026-10-01, after a study of three layouts: before that,
  subfolders showed as sections under headings, which left loose notes in rows of their own between them.) A
  Longform project, which has no folders, still shows the scenes indented under a scene as a group below it. Card
  size (small, medium, large) is a view option.
- The synopsis of the binder or folder being viewed shows under the header, editable in place, as does a subfolder's
  synopsis on its stacked card. Editing writes to that folder's note (creating it if needed).
- One "New note" tile ends the board: the next card's place, with a plus and the words in its middle; it becomes a
  card while the title is typed.
- Card: title, synopsis (editable in place), status chip, label color (a stripe along the top, or, as a view option,
  the whole card tinted), word count. A note with a target shows "words / target" and a progress line along the
  card's foot. Double-click opens the note.
- Drag to reorder; onto a stack to move into that folder; onto a folder in the breadcrumb to move out to it. Multi-select with Shift/Ctrl. A drag
  looks like Obsidian's own reordering: the card follows the pointer (`drag-reorder-ghost`), a tinted slot holds its
  place, an insertion line shows where it goes, and the group it would move into is tinted as a folder in the explorer
  is. Nothing on the board moves until the drop (what's under the pointer stays there); then every card glides to its
  place, with Obsidian's timing, unless the system asks for reduced motion. The board scrolls when the pointer nears
  its top or bottom edge. By touch, a long press (450ms) lifts a card to drag it, or opens its menu if it isn't moved.
- New card: creates a note in that folder at that position; the title is typed on the card. New folder (the toolbar's
  New, or the board's right-click menu): made last in the folder shown and named in place.
- A card's menu is the shared item menu (above).
- Keyboard: arrows move the selection, Enter opens, Alt+arrows reorder, F2 renames, Mod+A selects all, Delete asks
  before trashing, Shift+F10 opens the menu.

#### Arranged by label

Approved by the maintainer on 2026-10-01, after a design study and a prototype (Scrivener's "Arrange by Label").

- **Where it lives:** an arrangement of the corkboard, not a mode. "Arrange" in the toolbar (where a base has
  "Sort") is a menu: "In a grid" / "By label"; then, by label, "Lines across" / "Lines down", "Show notes in
  subfolders" (off by default) and "Show unused labels" (on by default). The button reads "By label" when on. The
  same items are in the corkboard's part of "More options", and "Arrange corkboard by label" is a command. The state
  is in the corkboard's view options: `arrange` (`grid` or `label`), `lines` (`across` or `down`), `linesFlat`,
  `linesUnused`; card size, numbers and tint are the grid's own options.
- **The lines:** "No label" first, then the labels in settings in their order, then any other labels the cards
  have (a name that isn't in settings, a color of a note's own), as they first come. Each has its name at its
  start: its color, its name, how many notes are on it. A line is drawn as an edge on a canvas is (two pixels, its
  label's color, behind the cards); a card is the grid's card, unchanged.
- **The places:** the binder's order, one place per card (so the order still reads), each card on its label's
  line. Since no two cards share a place, the lines may stand closer than a card is tall: they spread to fill the
  pane and close up to a little over half a card when there are many. A subfolder is one stack, on its own label's
  line; with "Show notes in subfolders" every note under the folder shows, each folder's after its name.
- **Dragging:** across the lines changes the label (only that property is written, through `processFrontMatter`; a
  folder's goes in its folder note, made if need be); along them changes the place in the binder; both at once does
  both. The line is the one under the middle of the card in hand. Before the drop the card in hand takes the line's
  color and the label's name shows beside it, the line is tinted, and an insertion line across all the lines shows
  the place. Several cards let go where the held one already is keep their places. It is one change to undo.
- **A line's menu:** "New note with this label", "Select its notes", "New label..." (name and color, saved to
  settings), "Edit labels...". A double-click on a line where there's no card makes a note there with its label.
- **Keyboard:** arrows along the lines go through the binder's order, arrows across to the nearest card on the next
  line; Alt+arrow along moves the card, Alt+arrow across gives it the next line's label; the rest as in the grid.
  The board is a `listbox`; each line is a named `group` that owns its cards (`aria-owns`), a card's name says its
  label, and a change of label is said in a polite live region.
- **Phones and narrow panes** (under 520px): the same lines across, with small cards unless a size was chosen.
- **Longform projects:** the scenes are one flat run; a new place writes only `longform.scenes`.
- **Code:** `src/view/BinderView.ts` picks the board the corkboard mode shows from `options.arrange`
  (`corkboard.ts`, the grid; `lanes.ts`, by label); `lanes-data.ts` is the pure model (the lines, the places, what a
  drop means), unit-tested in `tests/lanes.test.ts`; `card.ts` draws the card both boards use. e2e:
  `tests/e2e/specs-lanes.mjs`.
- **Not done:** dropping a card onto a stack or onto a folder in the breadcrumb (as the grid allows) while arranged
  by label; "Arrange by status".

### Outliner

- A tree table (`role="treegrid"`): one row per note or subfolder of the folder shown, in binder order, a folder's
  items indented under it. Longform scenes are indented as Longform has them.
- **Title column**, always first: the name, with the synopsis under it ("Show synopses" turns that off).
- **Columns**, picked from "+" at the end of the header row or "Columns" in the view's More options: Label, Status,
  Words, Target, Progress, Compile, Created, Modified, and any note property (the binder's most used are offered;
  "Other property..." takes a name). Kept with the view, and in settings as the start for the next outliner.
- **A header's menu** (click, or Enter): "Sort ascending", "Sort descending", "Binder order" (when sorted), "Move
  left", "Move right", "Hide column"; on the title, "Show synopses". Dragging a header moves the column; dragging its
  edge resizes it (double-click: back to its default width); Alt+Left and Alt+Right move it from the keyboard.
- **Sorting** is within each folder and only for show: `contents` isn't touched. Blank values come last either way.
  Labels and statuses sort in the order settings list them. A sorted Longform project is one flat list.
- **Folders fold** (the arrow, Left and Right, Space; "Expand all" and "Collapse all"). A folder's row totals its
  notes' words, and their targets if it has no target of its own. The last row shows the number of notes and the
  totals for words, target and progress.
- **Editing in place**: F2 (or "Rename") edits the title; on a selected row, a click on the synopsis, a target or a
  property cell edits it; a label or status cell opens its menu; Compile and yes/no properties are checkboxes. A
  property cell keeps the type it had: a number stays a number, a list is split at commas, empty removes it.
- **Selection** as on the corkboard: click, Shift-click, Mod-click, Mod+A; actions apply to every selected row.
- **Keyboard**: Up and Down, Home and End; Left folds or goes to the parent; Right unfolds or goes to the first item;
  Alt+Up and Alt+Down move the row (not while sorted); Enter opens (Mod+Enter in a new tab); Space folds; F2 renames;
  Delete asks before trashing; Escape drops a multiple selection; Shift+F10 opens the menu.
- **Dragging rows** reorders: between two rows, onto the middle of a folder (into it), below an open folder's name
  (first in it), or below the last row (last in the folder shown). The ghost is Obsidian's file drag ghost with a
  hint. Not while sorted: a notice says to choose "Binder order". Touch: long press, as on the corkboard.
- "New" puts a note or folder after the focused row (inside it, if that's an open folder), named in place.
- Only rows that changed are drawn again; rows that changed place glide there.

### Manuscript

- Every note in the binder, in order, stacked into one scrolling page: subfolder names as headings, a divider and the
  note's title between notes, then the note's body in a live editor.
- Editing: each section is a real embedded Markdown editor for that note (Obsidian's internal editable embed, as Canvas
  uses). Typing, undo, formatting, links and the cursor all behave as in a normal note; saving goes to that note.
- Properties are hidden in the manuscript (the corkboard and outliner edit them).
- It reads as one page: arrow keys move between sections; Page Up and Page Down move the caret a screen, across
  sections; Mod+Home and Mod+End go to the manuscript's start and end; a click beside or below the text puts the
  caret in the nearest section.
- The page follows the caret (the editors never scroll it themselves). Scrolled more than a screen and a half from
  the caret, the editor lets go of the focus; the next key typed, or scrolling back, returns to it.
- A section's title is its note's name: a click renames it in place (F2 in the section does too), Mod-click or a
  middle click opens the note. A folder's heading is a link into that folder.
- Escape and "Toggle reading view" leave a section an editor.
- Rendered sections are spaced as the live editor spaces them, so a section doesn't change height when its editor
  mounts.
- Large binders are virtualized: only sections near the viewport have live editors; the rest show rendered text.
- Fallback: if the internal embed API isn't available, the manuscript is read-only rendered Markdown, with a notice,
  and clicking a section opens that note.

### Labels, statuses and targets

- **Settings** hold two lists. Labels: a name and a color each, the color one of the theme's palette (`red`,
  `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `pink`: the theme's own shade) or a custom hex color.
  Statuses: names, in the order a draft goes through them. Both can be renamed, reordered, added to, deleted, and
  put back to the defaults. Renaming one doesn't rewrite notes.
- "Set label" lists the labels in settings, then others the binder's notes use, "Custom color..." (a hex color for
  that note alone), "No label" and "Edit labels..." (opens the settings). "Set status" lists the statuses, others in
  use, "New status..." and "No status".
- **Targets**: "Set target..." (or the outliner's Target cell) writes `target` on a note, or on a folder's note. The
  binder's target is `target` in the binder note. Shown on cards, in the outliner's Target and Progress columns, and
  in the toolbar for the folder shown.

### Scene operations

In `src/scenes.ts` (the vault side) and `src/scene-text.ts` (the text rules, pure). Each is ordered so text exists
twice before it exists once.

- **Split scene at cursor**, **Split scene with selection as title** (editor commands, in a note or a manuscript
  section): the text from the cursor on becomes a new note right after, with the note's properties except its
  synopsis. The new note is written before the first lets go of the text.
- **Merge N notes**: text and synopses joined into the first, a blank line between; the result is read back and
  checked before the others go to the trash. Asks first.
- **Duplicate** (a note, or a folder with everything in it, in order), **New folder from selection** / **Put in a
  new folder**, **Ungroup** (a folder's items move out, after it; the folder stays), **Set synopsis from text** (the
  note's first paragraph).
- **Compile**: "Compile binder" (command) and "Compile..." (a binder folder's menu) open a dialog: title as the first
  heading, folders as headings, note titles as headings, what goes between notes (`* * *`, `#`, `---` or a blank
  line), leave out comments, and where to save. It writes one Markdown note beside the binder (never in it), or
  copies the text. Notes and folders with `compile: false` ("Include in compile" off) are left out. Pandoc or PDF
  from there is other plugins' work.

### Snapshots

In `src/snapshots.ts` (the vault side), `src/snapshot-text.ts` (names, the file's own text, and comparing two texts
as prose; pure) and `src/view/snapshots.ts` (the dialogs, the menus, and a pane that shows one). The format is in
`docs/file-format.md`.

- The model is Scrivener's: the note stays the note (its place, its properties, the links to it), and its text as it
  was is set aside. A snapshot holds the text only.
- **Take a snapshot** (one note, several, or every note of a folder or the binder under one name), **Rewrite...**
  (take one, then start from the same text or a blank page; after a blank page the snapshot opens beside the note on
  desktop) and **Snapshots...** (the list: read, "Show changes" against the note now, copy, "Bring back", name,
  open to the right, delete). In a card's, a row's or a manuscript title's menu the three are one item, "Snapshots",
  that opens them (that menu is long, and three more ran it off a tablet's screen); in a note's own menu and the file
  explorer's they're side by side.
- Storage: `Snapshots/<the note's path in the binder>/<when> <name>.snapshot`, plain text. Not `.md`, so Obsidian
  doesn't index them (no search, quick switcher, backlinks, graph, tags), and the explorer patch never lists the
  folder. The price: Obsidian Sync carries them only with "Sync all other types" on, and Obsidian's own folder
  pickers still show the folders. A dot-folder would hide them everywhere, but Obsidian Sync never carries one and
  the vault API can't see it.
- Never loses writing: a snapshot is read back from the disk before anything else is done; a note's text is replaced
  only after it is in a snapshot, through the editor it's open in (a tab or a manuscript section: one Undo), or else
  in one write that refuses if the note no longer says what was kept. A snapshot file is never changed once written.
- The store (`binders.ts`) leaves the folder out of a binder's items, ignores what happens inside it, and moves a
  note's or a folder's snapshots when it's renamed or moved (within a binder, to another binder, in a Longform
  project). Deleted, merged-away and moved-out notes leave theirs behind, listed under "Snapshots of notes that are
  gone".
- The dialog wears the classes of Obsidian's File recovery dialog and diff, with Binders' own rules for the same
  layout where they're missing (`historyLook` in `src/view/internals.ts`).
- Automatic snapshots are taken only when Binders itself replaces text ("Before bringing back", and before a blank
  page). There are no timed ones and no pruning.

### Undo of moves

- `BinderStore.put()` is what a drop does (corkboard, outliner, explorer) and `change()` wraps it, and "Move up" and
  "Move down", with a snapshot of the order and of the folder each moved item was in. `undo()` moves the files back
  and writes the order back (a `set` op); redo is the same the other way. The last 50 changes are kept, in memory.
- "Undo last move" and "Redo last move" (commands), and Mod+Z, Mod+Shift+Z or Mod+Y in the binder view when no text
  is being typed. Text undo stays the editor's own.
- A change may carry a property it gave its items as well (`BinderStore.label()`: a card dragged to another label's
  line): what each had before, as written, and what it was given. Undo puts the property back (or takes it away)
  along with the places; redo gives it again. A folder note made to hold a folder's label stays when it's undone,
  without the property.
- Not undone this way: renames, deletes, splits, merges, duplicates, grouping and ungrouping.

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
  indents it); the outliner indents rows as Longform does; the manuscript runs the scenes in order, with no headings.
- **Writing**: reordering (the views, Move up/down, New scene here) writes only `longform.scenes`, through
  `processFrontMatter`, batched and applied to what the note says then, in the nested shape Longform writes. Every other
  property, and every other key inside `longform`, is kept. A moved scene keeps its indent unless a view gives a new one
  (dropping it into a group); a note not listed yet takes the indent of the scene before it. Files never move.
- **Renames and deletes**: when Longform is running it updates `scenes` itself, so Binders only shows the change.
  Otherwise Binders writes them, as Longform would: a rename keeps the scene's place, a deleted or moved-out scene is
  dropped, a note moved in shows after the listed ones.
- **The project's own data** (`synopsis`, `status`, `label`, `target`) lives at the top level of the index note, not
  inside `longform`. A project has no folders, so "New folder", grouping and ungrouping aren't offered.
- **Convert to binder** (command, and the index note's and scene folder's right-click menu): a dialog says what will
  happen, then writes `binder: 1` and `contents` (the Longform order) into the index note (or, if the index note is
  outside the scene folder, a new binder note named like that folder). Options, both off by default:
  - *Move groups into folders*: each top-level scene with scenes indented under it gets a subfolder named after it,
    next to it, and those scenes move into it (deeper indents are flattened; links update). Scenes indented under
    nothing go in "Group 1", "Group 2"…
  - *Remove the "longform" property* from the index note. Left on, Longform still lists the project, but its order no
    longer follows changes made in Binders.
  Notes Longform ignored, and subfolders, become part of the binder. No text changes.

## Architecture

```
src/
  main.ts              plugin lifecycle, commands, file-menu items
  settings.ts          the settings tab (declarative, with a fallback for Obsidian before 1.13)
  settings-data.ts     what the settings are, their defaults, reading saved ones (pure, unit-tested)
  model.ts             the binder index: parse, order, rename, move (pure, unit-tested)
  binders.ts           finds binders in the vault, keeps an index per binder, writes changes (debounced); undo of moves
  explorer.ts          the file explorer: order patch, icon, label dots, click to open, drag to reorder (isolated; feature-detected)
  scenes.ts            split, merge, synopsis from text, compile (and its dialog): where the text rules meet the vault
  scene-text.ts        the text rules for those (pure, unit-tested)
  snapshots.ts         snapshots of a scene: taking, bringing back, naming, following a renamed note (the vault side)
  snapshot-text.ts     a snapshot's name and file, and comparing two texts as prose (pure, unit-tested)
  longform.ts          Longform projects: reading and writing `longform.scenes` (pure, unit-tested)
  longform-convert.ts  the "Convert to binder" dialog
  view/
    BinderView.ts      the view shell: toolbar, switcher, filter, state, places
    mode.ts            the contract between the view and its modes
    corkboard.ts
    outliner.ts
    outliner-data.ts   the outliner's columns, sorting, targets, typed values (pure, unit-tested)
    manuscript.ts
    editable-embed.ts  embedded editors (isolated; feature-detected)
    actions.ts         an item's menu and what it does, shared by the corkboard and the outliner
    card.ts            an index card, as both boards draw it
    lanes.ts           the corkboard's cards by label: a line per label, the cards along them
    lanes-data.ts      what that board is, as data: the lines, the places, what a drop means
    drag.ts            a press that may become a drag (mouse, pen, long press), and gliding after a redraw
    edit.ts            text edited in place (titles, synopses, cells)
    labels.ts          labels and statuses: colors, names, reading saved ones (pure, unit-tested)
    modals.ts          confirm, ask for text, pick a color
    snapshots.ts       "Take a snapshot", "Rewrite", the Snapshots dialog, a snapshot in a pane, gone notes' snapshots
    words.ts           word counts, as Obsidian counts them
    internals.ts       undocumented Obsidian API the views use (submenus, settings tab, header titles, line length)
```

- `model.ts` has no Obsidian imports; everything that touches the vault goes through `binders.ts`.
- Each Obsidian internal used is wrapped in one function with a type guard, listed in `docs/internals.md`, and has an e2e
  test that fails loudly if an Obsidian update changes it. The exceptions, and the tests still missing, are marked
  in that list.

## Milestones

**What's left before 1.0 is in [ROADMAP.md](../ROADMAP.md)**: mobile QA to the end, then export, find and replace
across the manuscript, versions of a scene, and a focus mode (all four only for notes in a binder).

The numbers are the plan's milestones, not the versions in the CHANGELOG (the last committed is 0.6.31, which
already has milestones 0.1 to 0.7). Every commit bumps the version (see AGENTS.md).

| Version | Scope | Status |
|---|---|---|
| 0.1 | Scaffold: build, lint, tests, e2e harness, release workflow, docs, binder index model | Done |
| 0.2 | Binders in the vault: detection, index cache, rename/move/delete tracking, commands to make a binder and add scenes | Done |
| 0.3 | File explorer: order patch, binder icon, click to open, move up/down, hide binder note | Done |
| 0.4 | Binder view shell and corkboard (read, reorder, move between folders, new card, edit synopsis/status/label) | Done |
| 0.5 | Plot grid | Done, then replaced by the outliner in 0.9 |
| 0.6 | Manuscript: read-only first, then editable embedded editors, virtualization | Done |
| 0.7 | Longform integration | Done |
| 0.8 | Polish: keyboard, touch, themes, performance on a 1,000-scene binder, a full mobile pass, README | In progress: explorer Mod-click, cold start, keyboard and screen readers, themes, mobile emulation pass, perf guard (`specs-perf.mjs`), README, and a native-look pass against Obsidian's own Bases and drag styles (toolbar, flat cards, drag and glide, explorer drag-to-reorder) done; real-device iOS and Android checks to do |
| 0.9 | QA rounds (as with Evra: parallel QA agents, e2e suites, fixes). Added on the maintainer's request (2026-10-01), from Scrivener: the outliner in place of the plot grid, labels and statuses in settings, custom label colors, label tint and explorer label dots, word count targets, split, merge, duplicate, group and ungroup, synopsis from text, compile, undo and redo of moves | In progress: two QA rounds written (`specs-qa-*.mjs`, `specs-qa2-*.mjs`); the added features are built and unreleased |
| 0.10 | Before release (2026-10-01): mobile QA to the end; export (EPUB, DOCX, PDF, and a Scrivener project); import from Scrivener; find and replace across the manuscript; snapshots of a scene ("Rewrite"); focus mode. See ROADMAP.md | Mobile QA in progress; the corkboard arranged by label is built |
| 1.0 | Release and directory submission | |

## Risks

| Risk | Mitigation |
|---|---|
| Explorer internals change | One module, feature detection, fallback to alphabetical, e2e test per Obsidian version |
| Embedded editors (internal API) | Isolated; read-only fallback; heavy e2e on typing, undo, switching notes, external edits |
| Losing text in the manuscript | Each editor saves its own file through Obsidian; merge-on-external-change like Evra; soak tests |
| Conflicts with explorer plugins | Setting to turn the patch off; documented |
| Mobile (a 1.0 requirement) | Test each milestone from 0.3 on iOS and Android; touch drag and long-press menus; the manuscript's editors must be solid there, not read-only |
| Big binders | Index cache; virtualized manuscript; corkboard and outliner redraw only what changed (cards off screen aren't laid out); batched writes; a generated 1,000-scene binder with a perf guard (`specs-perf.mjs`) |
| Review (patching core UI) | Minimal patch, clean unload, explained in the README |
| Split and merge move text between notes | Text exists twice before it exists once (the new note is written first; a merge is read back before anything is trashed); pure rules unit-tested; `specs-scenes.mjs` checks byte for byte |
| Undo of a move after the vault changed | Undo refuses, with why, if a place has been taken or a folder is gone; only the order and the moved files are touched |
| Notes that used the plot grid | `plotlines`, `plotlineColors` and `plot` are left as they are; a saved `plotgrid` mode opens as the outliner |

## Decided

- **Folder data**: binders and subfolders each have a note (the binder note, and folder notes named like the folder),
  hidden in the explorer by default. Their synopsis is edited in the binder view.
- **Outliner, not plot grid** (2026-10-01, the maintainer's request): 1.0 ships the corkboard, the outliner and the
  manuscript. The plot grid and its properties are dropped; a writer who wants plotlines can keep them as an ordinary
  property and show it as an outliner column.
- **Labels and statuses are settings**, shared by every binder in the vault, not per binder.
- **Mobile**: a 1.0 requirement, including the editable manuscript.

## After 1.0 (from Scrivener)

Not built yet:

- A session word target and a deadline.
- Writing history and statistics.
- An inspector sidebar for the open scene (Obsidian's Properties view shows the same properties).
- Label lanes on the corkboard.
- Status stamps on cards.
- Options for the outliner's totals row.
- Templates for new scenes.
- Dragging between the file explorer and the corkboard.

Built since this list was first written: card numbers ("Number the cards"), keeping a sort as the binder's order,
undo and redo of moves, link updates after a merge or a split.

Also later: nested binders, and export beyond one Markdown note (Pandoc, PDF) through other plugins.
