# Binders: plan

Status: feature-complete except what is in [ROADMAP.md](../../ROADMAP.md), and in QA. The explorer, binder store, corkboard
(in a grid, or arranged by label), outliner, editable manuscript, Longform integration, labels and statuses, word count
targets, scene operations (split, merge, duplicate, group), export (step 1: a manuscript, one note), snapshots, focus mode, dragging a card out of the
view, and undo of moves all work, on desktop and in mobile emulation. Nothing is tagged yet: the version in
`package.json` is the latest committed. Six QA rounds have been run (`tests/e2e/specs-qa*.mjs`); the findings still
open are in `tests/e2e/open-findings.json` and [integration-qa.md](integration-qa.md). Left before 1.0: mobile QA on real
devices (so far phones and tablets are only emulated), export, import from Scrivener, and find and replace across the
manuscript. Then release (1.0).

## What it is

Binders makes folders behave like a writer's binder. A **binder** is a folder whose notes and subfolders have an order
you choose, not alphabetical. Obsidian's own file explorer shows them in that order. Clicking a binder (or a folder inside
one) opens the **binder view**, which switches between three ways of seeing the same notes:

- **Corkboard**: one index card per note (title, synopsis, status, label color), in order, grouped by subfolder. Drag
  cards to reorder or move them between folders.
- **Outliner**: notes and folders as rows of a tree, with columns the writer picks (label, status, words, target,
  progress, export, dates, any note property), sortable, editable in place.
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
  folder's own data: its synopsis, status, label and target (and `export: false` to leave the folder out of an
  export). Binders creates it the first time you give the folder one of these in a binder view. It never shows as a
  scene, in `contents`, or in the manuscript.
- **Per-note properties**: `synopsis` (the card text), `status` (draft, revised…), `label` (a label's name or a
  color), `target` (a word count), with names configurable, and `export` (`false` leaves the note out of an export; `compile: false`, its name before export, is read as the same).
  They show in Obsidian's Properties panel and work with Bases and Dataview. The binder note and folder notes use the
  same `synopsis`, `status`, `label` and `target`.
- **Labels and statuses** are lists in the plugin's settings, not in any note: a label is a name and a color (one of
  the theme's palette colors, or a hex color); a status is a name. A note's `label` can be a label's name, a palette
  color's name, or a hex color of its own.
- **View preferences** (mode, filter, card size, numbers on the cards, label tint, the corkboard's arrangement, the
  outliner's columns, sort and folded folders) are kept with the view in the workspace, not in the binder note. The outliner's columns as last arranged are also
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
- **Commands** (all in `src/main.ts` except focus mode's, in `src/focus/focus.ts`): "Open binder", "Show corkboard", "Show
  outliner", "Show manuscript", "Arrange corkboard by label", "Make this folder a binder", "New binder", "New scene
  here", "Convert to binder" (Longform), "Split scene at cursor", "Split scene with selection as title", "Set word
  count target", "Export binder", "Undo last move", "Redo last move", "Move up", "Move down", "Take a snapshot",
  "Rewrite", "Show snapshots", "Take a snapshot of every note in the binder", "Show snapshots of notes that are
  gone", "Toggle focus mode", "Go to previous scene", "Go to next scene". None has a default hotkey.
- **File menu** (a note's or folder's right-click menu): "Open binder", "Show in binder", "Make this folder a binder", "New
  binder", "New scene here", "New scene after this", "Export...", "Convert to binder", the snapshot items, "Move up",
  "Move down", each only where it applies. Several items selected: "New folder from selection", "Merge N notes".
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
  synopsis, "Set synopsis from text", "Set status", "Set label", "Set target...", "Move to" (every folder of the binder), "Duplicate", "Merge N notes",
  "New folder from selection" / "Put in a new folder", "Ungroup", "Include in export", "Move up", "Move down",
  what Obsidian and other plugins add (`file-menu`, source `binders-card`), and "Delete".

### Corkboard

- Cards in a responsive grid (or one column on narrow panes), drawn as a base's cards are (flat, a hairline border).
  The board shows one folder: each of its items is a card, in the binder's order. A subfolder is a single card, as on
  Scrivener's corkboard, of the same size and edge as a note's: a folder glyph before its name, its own synopsis from
  its folder note (two lines; three on a large card), then the names of the first things it holds (three; two on a
  small card, five on a large), each with its label's dot, and its count at the foot. A small card with a synopsis
  shows the synopsis alone. It's gone into to see what it holds, and the breadcrumb leads back out. (The names in place
  of a drawn stack of cards: decided 2026-10-02, see `docs/dev/design.md`.) (Decided 2026-10-01, after a study of three layouts: before that,
  subfolders showed as sections under headings, which left loose notes in rows of their own between them.) A
  Longform project, which has no folders, still shows the scenes indented under a scene as a group below it. Card
  size (small, medium, large) is a view option.
- The synopsis of the binder or folder being viewed shows under the header, editable in place, as does a subfolder's
  synopsis on its card (one with none doesn't offer the line: "Edit synopsis" in its menu adds it). Editing writes to
  that folder's note (creating it if needed).
- One "New note" tile ends the board: the next card's place, with a plus and the words in its middle; it becomes a
  card while the title is typed.
- **Selecting several** (decided 2026-10-05, the maintainer's request: "Shift click should allow you to multi-select
  cards", and a selection box, on a plain drag too "if that is typical behavior": it is, in Finder, Explorer and
  Scrivener's corkboard). As in a file manager and Obsidian's file explorer: a click selects one; Shift-click selects
  from the anchor (the card last clicked) to this one, or with no anchor this card, which becomes it; Mod-click turns
  one over; Mod+Shift-click adds the range to what's selected. A card not yet selected is selected as it's pressed,
  with a modifier too, so a press that moves a little (which makes it a drag, with no click after) has still selected,
  and drags the lot. Two Shift-clicks on one card don't open it. A press on empty space (not a card, the tile, a
  heading, a field) that moves more than 5 px draws a **selection box** (`SelectBox` in `src/view/drag.ts`, used by the
  grid and by the board by label): plain it replaces the selection with the cards it touches, with Shift it adds
  them, with Mod it turns each over; Escape puts back what was selected; a click that doesn't move still clears the
  selection. The box is begun at a place on the board, so the board scrolls under it when the pointer is held near the
  pane's edge (the drag's own speeds). It selects through the same `select` a click uses, so the inspector hears of it
  the same way. Mouse and pen only: a finger on empty space scrolls, and "Select more" in a card's menu is touch's way.
  It is a pointer's convenience: the keyboard has Shift+arrows, Mod+A and Space. Drawn as a canvas draws its own (the
  accent at 10%), with a 1 px line.
- Card: title, synopsis (editable in place), status chip, label color (the card's border, and by default its face
  faintly tinted, as a colored card on a canvas; the view option "Tint cards with their label color" turns the tint
  off), word count (as the book has it: "What a word of the book is", below). A note with a target shows "words / target" and a progress line along the
  card's foot. Double-click opens the note.
- Drag to reorder; onto a folder's card to move into that folder; onto a folder in the breadcrumb to move out to it. Multi-select as in a file manager (below). A drag
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
  "Sort") is one menu, the same items in the same order whatever is chosen: "In a grid" / "By label, across" / "By
  label, down" (one ticked, each one click from the others); then two switches, "Show notes in subfolders" (off by
  default; not in a Longform project) and "Show unused labels" (on by default). By label the switches flip with the
  menu staying open; in the grid they are disabled and still say how they stand. The button always reads "Arrange";
  its icon is the arrangement's, its accessible name says it ("Arrange: by label, across"), and it is tinted by
  label. The same items, from one function (`arrangeItems` in `BinderView.ts`), are in the corkboard's part of "More
  options" and in the menu of the board by label. "Arrange corkboard by label" is a command: grid to by label and
  back, the lines as they last ran. The state is in the corkboard's view options: `arrange` (`grid` or `label`),
  `lines` (`across` or `down`), `linesFlat`, `linesUnused`; card size, numbers and tint are the grid's own options.
  (Until 0.12.4 the menu grew "Lines across" / "Lines down" and the switches only once "By label" was chosen, and
  the button then read "By label": the maintainer found that odd, 2026-10-01.)
- **The lines:** "No label" first, then the labels in settings in their order, then any other labels the cards
  have (a name that isn't in settings, a color of a note's own), as they first come. Each has its name at its
  start: its color, its name, how many notes are on it. A line is drawn as an edge on a canvas is (two pixels, its
  label's color, behind the cards); a card is the grid's card, unchanged.
- **The places:** the binder's order, one place per card (so the order still reads), each card on its label's
  line. Since no two cards share a place, the lines may stand closer than a card is tall: they spread to fill the
  pane and close up to a little over half a card when there are many. A subfolder is one card, on its own label's
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
- **Not done:** dropping a card onto a folder's card (as the grid allows) while arranged
  by label; "Arrange by status".

### Outliner

- A tree table (`role="treegrid"`): one row per note or subfolder of the folder shown, in binder order, a folder's
  items indented under it. Longform scenes are indented as Longform has them.
- **Title column**, always first: the name, with the synopsis under it ("Show synopses" turns that off).
- **Columns**, picked from "+" at the end of the header row or "Columns" in the view's More options: Label, Status,
  Words, Target, Progress, Export, Created, Modified, and any note property (the binder's most used are offered;
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
  property cell edits it; a label or status cell opens its menu; Export and yes/no properties are checkboxes. A
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
  mounts. Footnotes are drawn there as the editor draws them, not as reading view does: a footnote's text where the
  note has it, in the editor's small lines; a mark as `[^1]`; one written in the line (`^[so]`) in full; no list at
  the foot. (70 kinds of content are measured both ways in `specs-qa4-manuscript.mjs`; all are equal.)
- Large binders are virtualized: only sections near the viewport have live editors; the rest show rendered text.
- On a phone (`Platform.isPhone`) no section gets its editor by coming near: it stays rendered until it's tapped (or
  the caret is sent into it: a new note, a command, a key of a keyboard that's plugged in). The tap puts the caret on
  the letter under the finger (found by the words around it, not by the point: an editor doesn't always break its
  lines where the rendered text does) and holds that line where it was on screen. A section stays an editor while
  the caret is in it, while it has typing that isn't saved, and, with the keyboard put away, while it's the one the
  caret was last in and still near the screen; then it's rendered again. Tablets and desktops are as above.
- Fallback: if the internal embed API isn't available, the manuscript is read-only rendered Markdown, with a notice,
  and clicking a section opens that note.

### Labels, statuses and targets

- **Settings** hold two lists. Labels: a name and a color each, the color one of the theme's palette (`red`,
  `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `pink`: the theme's own shade) or a custom hex color.
  Statuses: names, in the order a draft goes through them. Both can be renamed, reordered, added to, deleted, and
  put back to the defaults. Renaming one asks whether to rename it in the notes that have it too (and leaves them as they are if the answer is no).
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
  synopsis. The new note is written before the first lets go of the text. The editor's own undo right after (Ctrl+Z,
  the command, a phone's button) takes the whole split back: an editor extension (`splitUndo` in `src/scenes.ts`)
  sees the undo that puts the second half back, and trashes the new note if it is still byte for byte what the split
  wrote and where the split put it, once the first note is on disk with the second half in it; links that followed a
  heading to the new note are pointed back. A new note that was edited, renamed or moved stays, with a notice. Redo
  makes the new note again before anything else. Remembered in memory only (the last 20 splits).
- **Merge N notes**: text and synopses joined into the first, a blank line between; the result is read back and
  checked before the others go to the trash. Asks first.
- **Duplicate** (a note, or a folder with everything in it, in order), **New folder from selection** / **Put in a
  new folder**, **Ungroup** (a folder's items move out, to where it stood; the folder, left with nothing but its
  folder note, goes to the trash with that note, and "Undo last move" makes it again with the note byte for byte. A
  folder that still holds something stays: a file Obsidian doesn't list, or a folder note with text under its
  properties, which is writing and is never trashed unasked; a notice says so), **Set synopsis from text** (the
  note's first paragraph).
- **Export** (step 1 built 2026-10-05; the design is [export.md](export.md)): "Export binder" (command) and
  "Export..." (the view's menu, a binder folder's menu, a folder card's menu) open the Export window. Its kinds so
  far: **Manuscript**, a Word file in standard manuscript format, and **One note** (what "Compile" was): title as
  the first heading, folders as headings, note titles as headings, what goes between notes (`* * *`, `#`, `---` or a
  blank line), leave out comments, take tabs off paragraphs, and where to save. One note writes one Markdown note
  beside the binder (never in it), or copies the text. Notes and folders with `export: false` ("Include in export"
  off; `compile: false` is read as the same) are left out of every kind.

### Snapshots

In `src/snapshots.ts` (the vault side), `src/snapshot-text.ts` (names, the file's own text, and comparing two texts
as prose; pure) and `src/view/snapshots.ts` (the dialogs, the menus, and a pane that shows one). The format is in
`docs/dev/file-format.md`.

- The model is Scrivener's: the note stays the note (its place, its properties, the links to it), and its text as it
  was is set aside. A snapshot holds the text only.
- **Take a snapshot** (one note, several, or every note of a folder or the binder under one name), **Rewrite...**
  (take one, then start from the same text or a blank page; after a blank page the snapshot opens beside the note on
  desktop) and **Show snapshots...** (the list: read, "Show changes" against the note now, "Bring back", take one now; in its menu copy, name,
  open to the right, delete; with none yet, what a snapshot is and a button that takes the first). In a card's, a row's or a manuscript title's menu the three are one item, "Snapshots",
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
- Undo is per binder: the commands take back the last change in the binder in front (or the open note's), and with
  neither, the binder changed last; a change in another binder is not the one undone. The 50 changes are kept
  together, for all binders.
- A folder made around notes ("New folder from selection") is undone with the move, and a sort kept as the binder's
  order too. Not undone this way: renames, deletes, splits, merges and duplicates.

### Dragging a card out of the view

A card or an outliner row dragged out of the binder view is handed to Obsidian as a file drag, as a row of the file
explorer is, so everything that takes a note takes it: the file explorer (moved), a note (a link), a canvas (a card of
it; a folder as the notes in it), a tab (the note opened) and the bookmarks. Inside the view the drag is the view's own.
`src/view/file-drag.ts` (geometry in `file-drag-data.ts`), listed in `docs/dev/internals.md`. Not on a phone, and not in a
window of its own: there the drag stays inside the view. A move to a folder in a binder through the file explorer is
one change that "Undo last move" takes back; a move out of the binder isn't recorded.

### Focus mode

A state of the view that's open, for a note of a binder in a tab (editing or reading) or the manuscript; never a view
of its own, so the editor being typed in is never remounted. `src/focus/focus.ts`.

- **What it does to Obsidian:** a class on the window's `<body>` and one on the tab; the style sheet hides the ribbon,
  sidebars, tab bar, status bar, view header, other panes, the binder toolbar and, on a phone, the bar of buttons.
  Nothing is collapsed, closed or saved, and nothing is kept that says focus is on: after leaving, a reload, a crash
  or the plugin being turned off, Obsidian is as it was. With "Enter fullscreen" on (off by default; desktop only)
  it takes the system's fullscreen through the standard `requestFullscreen`, and gives it back on leaving, only if
  it was focus mode that took it.
- **In and out:** "Toggle focus mode" (no hotkey), a button in the header of a binder's notes (and only those), a
  button at the end of the manuscript's toolbar. Escape leaves, through Obsidian's stack of key scopes, so a dialog,
  a menu, the palette or suggestions take it first; it's also left to a field, a name being typed, text being
  composed, several cursors, and to Vim when its keys are on. The leave button (top right) comes back when the
  pointer moves, and is said once in a notice the first time. Focus ends when another tab is taken up, or its tab
  shows something that isn't a note of a binder or the manuscript; another scene of the binder in the tab keeps it.
- **The page:** the vault's own type and "Readable line length"; a note's properties, inline title and backlinks
  are hidden. With the defaults there is the text and the leave button, nothing else.
- **Typewriter scrolling** (on by default): only for the last line. While the cursor is on the last line of the
  text (everything after its line is blank: the last paragraph, or an empty line after it), that line is held at
  42% of what can be seen of the page, and the page moves under it. In the manuscript "the text" is the section the
  cursor is in. Anywhere else, and after a click, the page scrolls as the editor (or the manuscript) always does.
- **Options, off by default:** "Show the scenes before and after" (a note in a tab: the end of the scene before
  above its text and the start of the scene after below, set as the manuscript sets its sections; a click goes
  there); "Show where you are" (the folders down to the scene, and its synopsis: a note in the margin, or a strip
  along the top where there's no margin); "Show word counts" (the scene's, with its target, and the day's, with the
  goal; hidden while typing, back after a pause of 2.5 s); "Words to write today". In settings under "Focus mode"
  and in focus mode's menu (a right click or long press on the leave button, "Focus mode" in the editor's menu, a
  click on the numbers).
- **"Dim other paragraphs", on by default:** while typing, every block of the editor but the one with the cursor
  (a paragraph is a line of it; a table, a callout, an image or an embed a block beside the lines), the manuscript's
  other sections and the scenes before and after are at 0.3 opacity; the pointer moving brings them back. It was
  0.62, which kept 4.5:1 against the page; the maintainer asked (2026-10-05) for the dimming to be "significant",
  so the dimmed text no longer keeps a reading contrast (about 2.3:1 on the charcoal): it is there to be seen, the
  paragraph being written is what must read (13:1 on the charcoal), and nothing is dimmed unless keys are being
  pressed. No setting for the strength: one can be added if 0.3 isn't right for everyone.
- **"Dim the background", on by default** (the maintainer, 2026-10-05: "the background turns to a deep charcoal,
  almost black, but not quite"). In focus the page and what's left of the window around it are `#161616`: a neutral
  grey a step under Obsidian's dark page (`#1e1e1e`), well short of black. In a light theme too, which is the hard
  part: a dark page needs every color on it to be a dark theme's. So while focus is on with this option, `<body>`
  has Obsidian's own `theme-dark` in place of `theme-light` (`dark` in `focus.ts`): the stylesheet's, the theme's and
  any snippet's dark colors apply to everything, as in the dark appearance, with nothing listed here to go stale;
  and `binders-focus-dark` sets the page's color over them. Everything else of the window is out of sight in focus,
  so nothing is seen to change but the page; a menu, a dialog or the command palette opened over it is dark too.
  On leaving, the class `<body>` had is put back, by what Obsidian says its appearance is then (so a change of theme
  made while in focus stands). The color comes and goes over 0.3 s with the way in and out (not under "reduce
  motion"). Rejected: giving only the tab the dark variables, since Obsidian works its colors out on `<body>` and
  a theme's rules look for the class there. On a phone Obsidian's own dark page is black: the charcoal is lighter.

- **"Go to previous scene" and "Go to next scene":** commands, in or out of focus. A note in a tab gives way to that
  note in the same tab (Obsidian saves the one left); in the manuscript the cursor goes to that section.
- **The day's words:** a session is a day's writing in a binder on one device: each note's word count when it was
  first seen that day and its count now (`src/focus/session.ts`, pure; counted as every count is: "What a word of
  the book is", below). Counted in any note of a binder as it's
  typed, in focus or not; kept in the vault's local storage (`app.saveLocalStorage`), never in a note or in
  `data.json`. Renames follow; a note split or merged counts once. A session that runs past midnight carries on
  until focus is left.
- **Motion:** in: what's around the page fades out where it stands (140 ms), then it's gone and the text, which
  hasn't moved, glides to the middle (300 ms, the corkboard's timing). Out: the same backwards. With reduced motion,
  one step.
- **Phone and tablet:** the bar of buttons and the header go; the way out is under the clock; typing hides it and a
  touch brings it back; the line being written is held in what the keyboard leaves in sight.

### Paragraphs

The maintainer, 2026-10-05: "A big block for Obsidian is that the tab does not display a real tab, but makes a quote
thingy. For a writing app that is a big deal." A line begun with a tab is Markdown's indented code, and Obsidian has
no setting for it.

- **A tab starts a paragraph** (on by default, binder notes only; four spaces count as a tab). Shown as a paragraph
  with a first-line indent wherever a binder's note is shown. Display only: the file keeps the tab.
- **Indent paragraphs** (off by default): a first-line indent for a paragraph that follows another, nothing typed,
  nothing in the file. The blank line between paragraphs stays.
- One measure for both, 1.5em, with no setting (`--binders-paragraph-indent`).
- **Links in tab paragraphs follow a rename.** Obsidian's index reads those lines as code, so it would leave their
  links at the old name while Binders shows them as live links. Binders rewrites them itself, narrowly: the
  maintainer's exception to "never rewrites note bodies" (golden rule 3). Backlinks, the graph and tags on those
  lines stay untracked, and the README says so.
- Export knows about both (built with export's step 1): see "Export and paragraphs" below.

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

The map of the code (each module, the layers, how a change travels from a gesture to a file, where the undocumented
parts of Obsidian are used, and the rules that keep writing safe) is in [architecture.md](architecture.md). The
undocumented parts, one by one, are in [internals.md](internals.md).

## Milestones

**What's left before 1.0 is in [ROADMAP.md](../../ROADMAP.md)**: mobile QA to the end (on real devices), export, import
from Scrivener, and find and replace across the manuscript.

The numbers are the plan's milestones, not the versions in the CHANGELOG (those are 0.12.x now, and every commit bumps
them: see AGENTS.md). Nothing is tagged yet.

| Version | Scope | Status |
|---|---|---|
| 0.1 | Scaffold: build, lint, tests, e2e harness, release workflow, docs, binder index model | Done |
| 0.2 | Binders in the vault: detection, index cache, rename/move/delete tracking, commands to make a binder and add scenes | Done |
| 0.3 | File explorer: order patch, binder icon, click to open, move up/down, hide binder note | Done |
| 0.4 | Binder view shell and corkboard (read, reorder, move between folders, new card, edit synopsis/status/label) | Done |
| 0.5 | Plot grid | Done, then replaced by the outliner in 0.9 |
| 0.6 | Manuscript: read-only first, then editable embedded editors, virtualization | Done |
| 0.7 | Longform integration | Done |
| 0.8 | Polish: keyboard, touch, themes, performance on a 1,000-scene binder, a full mobile pass, README | Done in emulation (keyboard and screen readers, themes, mobile emulation, `specs-perf.mjs`, a native-look pass against Obsidian's Bases and drag styles, explorer drag-to-reorder); real iOS and Android devices still to try |
| 0.9 | QA rounds (as with Evra: parallel QA agents, e2e suites, fixes), and, on the maintainer's request (2026-10-01), from Scrivener: the outliner in place of the plot grid, labels and statuses in settings, custom label colors, label tint and explorer label dots, word count targets, split, merge, duplicate, group and ungroup, synopsis from text, compile, undo and redo of moves | Built. Six QA rounds so far (`specs-qa-*.mjs` to `specs-qa5-*.mjs` and the integration round in [integration-qa.md](integration-qa.md)); the sixth is the 2026-10-02 hardening push |
| 0.10 | Before release (2026-10-01): mobile QA to the end; export (EPUB, DOCX, PDF, and a Scrivener project); import from Scrivener; find and replace across the manuscript; snapshots of a scene ("Rewrite"); focus mode. See ROADMAP.md | Arrange by label, snapshots, focus mode and dragging a card out of the view are built; mobile QA is in progress (emulated only); export, import and find and replace are not started |
| 0.12.x | The 2026-10-02 hardening push: a sixth QA round, fixes, and refactors so the code is in files of one idea each (the undo history, the outliner's columns, the shared card helpers; folder cards that name what they hold), the documentation checked against the code | Release-ready work in progress: six QA rounds done, the findings still open listed in `tests/e2e/open-findings.json`. Not released: see "Decided" |
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
- **Mobile**: a 1.0 requirement, including the editable manuscript. Tested so far only in Obsidian's emulation of
  phones and tablets; a real iPhone, iPad and Android device are still to try.
- **Corkboard folders** (2026-10-02, the maintainer): a folder is one card of the same size and edge as a note's, with
  a folder glyph and the names of the first things it holds, not a drawn stack of cards.
- **Arrange by label** (2026-10-01, approved after a prototype): an arrangement of the corkboard, not a mode.
- **Snapshots** (2026-10-01): plain `.snapshot` files in a `Snapshots` folder in the binder, never `.md`; the cost is
  that Obsidian Sync needs "Sync all other types" on to carry them.
- **Focus mode** (2026-10-01, the maintainer): the text and nothing else by default, with typewriter scrolling the
  only thing on; typewriter scrolling is for the last line only; the scenes before and after, the place and synopsis,
  the word counts, the goal and dimming are each an option; a session is today's words in this binder on this
  device; the numbers hide while typing and return on a pause; focus mode doesn't take the OS full screen. Changed the same day: dimming is on by default, and "Enter
  fullscreen" is an option, off by default.

- **No release before export is built** (2026-10-02, the maintainer). Nothing is tagged, and the directory submission
  waits. Until then the project is brought to a release-ready state: the code, the tests and the documentation, each
  checked against the others.
- **A phone's manuscript section is its editor only when tapped** (2026-10-05, the maintainer): making an editor
  costs a phone a frame or more, and swiping through a long manuscript made one after another for text that was only
  being read. Tablets and desktops keep editors on the sections near the screen.
- **Export** (2026-10-05, the maintainer, from a design round; the whole design is [export.md](export.md)):
  - It is called **Export**, not Compile. Today's Compile becomes one of its kinds, "One note"; `export: false` is
    written and `compile: false` still read.
  - **Roles and styles.** A note or folder has a role in the book (part, chapter, scene, front or back matter) from
    one structure rule that Binders guesses first, overruled per item with "Export as" (`export-as`). A style sets
    every role; nothing is assigned by hand. The book's own details are plain properties of the binder note.
  - **Two built-in book styles and a style editor in the Export window.** A writer never sees a style's file: styles
    are edited in the window, beside pages that follow each change, and their files are kept out of sight.
  - **No PDF on phones or tablets** in 1.0: everything else is exported there, and the window says a PDF is made on
    a computer.
  - **Where files go:** an `Exports` folder by default; on a computer always the save dialog, with a checkbox to
    remember the place afterwards; the folder can be changed in Binders' settings.
  - **A new line is a new paragraph** in every export.
  - A hand-made `.scriv` is opened in the maintainer's Scrivener before anything else is built.
- **Mobile: "emulator is king"** (2026-10-02, the maintainer). He has no phone or tablet to try it on yet, so
  Obsidian's emulation of both, run in the e2e suite, is the standard for what works on mobile. A real iPhone, iPad and
  Android device are still to try when there is one, and the README says so.
- **The inspector and the contents** (2026-10-05, the maintainer, from two directions built): two sidebar views, not
  one view with both in it. Both tabs are put among the right sidebar's whenever a binder view opens (or comes
  back with the workspace), if they aren't anywhere already: the sidebar isn't opened, nothing is brought to the
  front, and they stay when the last binder closes. A closed one comes back with the next binder unless "Show the
  inspector and contents with a binder" is off. (He changed this the same day, after trying "the inspector once,
  the contents by command": "the contents and inspector tab should be automatically included in the right tabs when
  a binder is open".) In the manuscript the panes are on the section
  with the cursor, and on the section at the top of the page once the cursor is out of sight. Scene notes are a
  property (`notes`, its name a setting), never exported. A note's snapshots are listed in the inspector, and a row
  opens the dialog on that snapshot. The contents don't reorder at 1.0. Left out on purpose: other properties
  (Obsidian's own view shows them), comments and footnotes as a list, bookmarks, progress bars. See
  [design.md](design.md).
- **How fixes ship** (2026-10-02): a fix runs its area's specs in both themes before it ships, the whole suite runs
  after each batch, and a failure on `main` is found by bisecting before anyone guesses. See
  [development.md](development.md).

## Export and paragraphs (built with export's step 1, 2026-10-05)

- **One note** writes a note outside the binder, where its tab lines would be code again: "Take tabs off
  paragraphs", on by default, takes the tabs off the start of paragraphs (`untab` in `src/paragraphs/text.ts`, by
  the lines `tabLines` names), leaving plain Markdown paragraphs.
- **Export** (the Word manuscript now; the EPUB and the PDF after it) uses the same rule before any writer sees the
  text: a paragraph begun with a tab is
  a paragraph, never a code block and never a literal tab. The tab is dropped and the paragraph gets a real
  first-line indent from the export's style ([export.md](export.md), "What Markdown becomes").
- Whether the book's paragraphs are indented is the export style's own choice ("Paragraphs": first line indented, or
  space between; none after a heading or a scene break). The built-in styles indent. A tab in the source doesn't
  decide it paragraph by paragraph, and neither does the editor's "Indent paragraphs".
- **Scrivener import** keeps tabs as typed.

## What a word of the book is (2026-10-06)

One rule, and it is export's. A card, a stack, the outliner's Words column and its last row, the toolbar's count and
its progress, a target on a note, a folder or the binder, the inspector, Contents' foot, focus mode's numbers and the
day's words all count a note as the exported book has it, so none of them says more words than the book. The
setting **"Count words as the exported book does"** (Settings, "Word counts"; on to begin with) turns this off: then
every one of them counts as Obsidian's status bar does (`countWords` in `src/view/words.ts`), which is how Binders
counted before 0.33 and what a writer who checks a note against the status bar will want.

Nothing about the rule is written twice. `src/view/book-words.ts` hands a note to export's own reader
(`parseBody` in `src/export/markdown.ts`) and counts with export's own `countWords` and `blocksText`
(`src/export/model.ts`), as `bookWords` does. So the table below is "What Markdown becomes" in
[export.md](export.md) read for its words, and a change to export changes the counts with it.

| In a note | Counted |
|---|---|
| Properties | No |
| `%%comment%%`, `<!-- comment -->`, on a line or over several | No. In code they are the writer's text, and counted |
| `[[Note]]` | The note's name (and what follows a `#`): the words the book shows |
| `[[Note\|words]]` | The words shown; not the note's name |
| `[words](https://…)`, `[words][label]` | The words; not the address, and not a link's definition (`[label]: …`) |
| `<https://…>` | Yes: the address is what the page shows |
| `[^1]` and its text, `^[a footnote typed in place]` | The text, once, however often it is marked: a footnote is in the book (at the foot of the page, or a pop-up). A footnote nothing points at is left out of the book, and isn't counted |
| `![[Note]]` | The embedded note's words, each time it is embedded, as the book has them there. A whole note only, one level deep: `![[Note#Heading]]`, a note embedded by an embedded note, and anything that isn't a note are left out |
| `![[picture.png]]`, `![description](picture.png)` | No: a picture's description is no word on the page |
| `> [!note] Title` | The title and the text; not the kind (`[!note]`) |
| `## Heading` | Yes |
| `# Heading` as a note's first block | In a scene, yes. In a note that opens a section (a chapter, a part, a page of front or back matter) it is that section's title: export sets it with its own headings and doesn't count those, so it isn't counted |
| A table | Its cells; not its rule |
| A fenced code block, `code` in a line | Yes, as typed: export sets code in the book. (Not the fence, or the language it names) |
| A paragraph begun with a tab or with spaces | Yes: a paragraph, never code |
| HTML | The text between the tags; not the tags |
| `==highlight==`, `*emphasis*`, `**bold**`, `~~struck~~` | The words (`un*believ*able` is one) |
| `$math$`, `$$math$$` | As typed |
| A list's number or mark, a task's box, a rule (`---`, `* * *`) | No |
| `#tag` in a line of text | As typed. A line of nothing but tags: no |
| `^block-id` at a line's end | No |
| `&amp;`, `\*` | The character they stand for |

A word is what export says it is: a run of letters and digits, with `'`, `’`, `.` or `-` inside it (`don’t`,
`well-known`, `3.14`). That differs from the status bar in small ways, and in two that matter (2026-10-06, said to
export's owners): `1,000` is two words, and a run of Chinese or Japanese characters is one word, where the status
bar counts each character. Until export counts those as a writer would, a book in Chinese or Japanese is better
counted with the setting off.

What a count leaves to the writer's own sense:

- **A note left out of an export** (`export: false`) still shows its own words, and is still in its folder's and
  the binder's totals: the totals are of the binder, and the export window's is of what is exported. Front and back
  matter count too, as they do in an ebook; a manuscript without them has fewer words than the toolbar says.
- **The day's words** are counted by the same rule as everything else, from each note's own text (not what it
  embeds). Changing the setting counts every note of the day again by the new rule and keeps what was written
  (`Session.recount`): the switch neither adds to the day nor takes from it. Which rule the day was counted by is
  kept beside the session, in the vault's local storage.
- **A snapshot's** words are its own text's, by the same rule.
- **Nothing says so when a count drops.** With the setting on, a note with comments or links has fewer words than
  it showed before, and a target that was just met may be just unmet. Nothing records that a target was met, so
  there is nothing to put right: the changelog says it, and the setting's description says why.

**Fast enough.** Export's reader is a full Markdown parser: half a second on a note of 100,000 words, where the
status bar's way takes 9 ms. So `readBody` hands the parser only the lines that need it. A line of plain prose
(letters, digits, spaces, a sentence's punctuation, and emphasis marks that can't join two pieces of a word) has the
same words wherever it stands, so it is counted as it is, and a full stop stands in for it in what the parser reads,
which keeps every other line in the paragraph, list, quotation or block it was in. A footnote's and a link's
definition take the lines after them along. Measured on the demo vault, on a busy machine: the note of 100,000
words in 8 ms (the status bar's way: 9 ms; the parser: 530 ms), the binder of 5,000 notes in 45 ms (24 ms; 2.2 s).

**Held to export by a test.** `tests/book-words.test.ts` fails if the views ever count a word export doesn't: the
light reader against the parser on every note of the demo vault, on 6,000 notes made at random from lines of every
kind, and on a list of awkward texts; each row of the demo vault's "What Markdown becomes" as a chapter and as a
scene against `bookWords` of the book export builds; and the views' total for each of the 27 demo binders against
`bookWords` of that binder.

## After 1.0 (from Scrivener)

Not built yet:

- A session word target and a deadline (focus mode has a goal for one day, in one binder, on one device).
- Writing history and statistics.
- An inspector sidebar for the open scene (Obsidian's Properties view shows the same properties).
- Status stamps on cards.
- Arranging the corkboard by status (arrange by label is built).
- Dropping a card onto a folder's card while the corkboard is arranged by label (onto a folder in the breadcrumb works,
  as it does on the grid and in the outliner).
- Options for the outliner's totals row.
- Templates for new scenes.
- Dragging a note from the file explorer onto the corkboard (the other way, a card out to the explorer, is built).
- Automatic snapshots on a timer, and pruning old ones.

Built since this list was first written: card numbers ("Number the cards"), keeping a sort as the binder's order,
undo and redo of moves, link updates after a merge or a split, label lanes on the corkboard ("Arrange"), dragging a
card out of the view.

Also later: nested binders, and export beyond one Markdown note (Pandoc, PDF) through other plugins.
