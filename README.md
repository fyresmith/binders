<h1 align="center">Binders</h1>

<p align="center"><b>Ordered folders for long-form writing, inside Obsidian.</b><br>
A binder in the file explorer · a corkboard · an outliner · the whole manuscript as one editable page</p>

Folders in Obsidian list their notes by name. Books don't work that way. Binders turns a folder into a **binder**: its
chapters and scenes keep the order you give them, in Obsidian's own file explorer. Open a binder to see the same notes
as a corkboard, an outliner, or one continuous manuscript you can edit.

Everything stays plain Markdown. A binder is a folder plus one note that holds its order, and everything about a scene
is in that scene's own properties. Turn Binders off and your notes are still ordinary notes.

![Corkboard](docs/images/corkboard.png)

## Getting started

1. Right-click a folder in the file explorer and choose **Make this folder a binder**. Its notes and subfolders keep the
   order they show in now. Or start a new one: **New binder**, beside **New note** and **New folder** in the menu of
   the file explorer's empty space (and of any folder that isn't in a binder).
2. Click the folder. The binder view opens on it, as a corkboard. A click that opens a folder's view doesn't fold the
   folder; click it again, or its arrow, to fold it.
3. Drag cards into the order you want, or drag the notes themselves up and down in the file explorer. Each follows
   the other.

To add a scene, use **New note** at the end of a group on the corkboard, **New** in the view's toolbar (which makes
folders too), or **New scene here** in the folder's right-click menu or the command palette.

## The binder view

One view, three ways of seeing the notes in a binder or in one of its folders. Switch with the button at the top left,
or with the commands **Show corkboard**, **Show outliner** and **Show manuscript**. Inside a folder, the breadcrumb
beside it goes back up to the binder. The word count shows the target of the binder or folder, if it has one, with a
bar for how far along it is. Click the text under the toolbar to write a synopsis of the binder or folder. Each mode
keeps its place when you look at another, and when you open a note and come back.

### Corkboard

One index card per note, in order, with its title, synopsis, status, label color and word count (and, for a note with
a target, how far along it is). Subfolders show under their own heading and synopsis, or, from the view's **More
options** menu, as single stacked cards.

- Drag cards to reorder them, or into another folder's group to move the notes there. The card follows the pointer,
  a line shows where it will go, and the others glide aside when you let go. Shift-click or Ctrl-click (Cmd-click on
  macOS) selects several, and they move together.
- Click a card to select it; click a selected card's synopsis to edit it. Right-click a card to rename it, set its status, label or target, duplicate
  it, move it or delete it; the menu also has what Obsidian and your other plugins offer for that note (bookmark it,
  reveal it in the file explorer, and so on).
- Right-click the board itself for a new note or folder, the card size (small, medium or large), stacks,
  **Number the cards** (each note's place in the order), and **Tint cards with their label color** (on as it comes: a
  labeled card has its border and, faintly, its face in that color, as a colored card on a canvas; turn it off for the
  border alone).
- Double-click a card, or press Enter, to open the note. Ctrl-double-click (Cmd on macOS) or a middle
  click opens it in a new tab.
- With the keyboard: arrow keys move between cards, Alt+arrows move a card, F2 renames, Delete asks before deleting,
  Shift+F10 opens the card's menu. Ctrl+arrows (Cmd on macOS) move the focus without changing the selection, and
  Space adds the focused card to it or takes it out.

### Outliner

![Outliner](docs/images/outliner.png)

The same notes as rows of a table, folders with their notes under them, in binder order. The title comes first, with
the synopsis under it (**Show synopses** turns that off); the other columns are yours to pick.

- **Columns:** label, status, words, target, progress, compile, created and modified, and any property of your notes
  (a POV, a date). Add and remove them with **+** at the end of the header row. Drag a header to move its column, and
  its edge to resize it.
- **Sorting:** click a header to sort by it: ascending, then descending, then binder order again. Right-click it
  for the same as a menu. Sorting only changes what you see, within each folder; the binder's order stays as it is,
  unless you choose **Make this the binder order** in that menu.
- **Editing:** F2 renames a row. On a selected row, click a label or status for its menu, or the synopsis, a target
  or a property to type in it; with several rows selected, the change is made to all of them. Ticks (compile, and
  yes/no properties) change with a click.
- **Folders** fold with the arrow beside them. A folder's row adds up the words of the notes in it, and their targets
  if it has none of its own; the last row does the same for everything shown.
- **Rows** are selected, dragged and right-clicked as cards are: drag between two rows, onto a folder, or below
  everything. Rows can't be dragged while the outliner is sorted.
- With the keyboard: Up and Down move between rows, Left and Right fold and unfold, Space folds, Enter opens,
  Ctrl+A (Cmd+A on macOS) selects all, Delete asks before deleting, and typing a name's first letters goes to its
  row. Right goes on into a row's cells, where the arrows move from cell to cell and Enter opens the cell's menu or
  field. Alt+Up and Alt+Down move the selected rows; Alt+Left takes them out of their folder, Alt+Right puts them in
  the folder above.

### Manuscript

![Manuscript](docs/images/manuscript.png)

Every note in the binder or folder, in order, as one page: folder names as headings, each note's title above its text.
Each section is a real Obsidian editor on that note, so typing, undo, links, formatting and commands work as they do in
the note itself, and every keystroke is saved to that note. Properties are hidden here; the corkboard and outliner
edit them.

- Arrow keys move on into the next note and back. Page Up and Page Down move a screen at a time, and Ctrl+Home and
  Ctrl+End (Cmd on macOS) go to the start and end of the whole manuscript.
- Click a note's title to rename it; Ctrl-click (Cmd-click on macOS) opens the note. Right-click it for the menu
  its card has: status, label, a new note after it, move up or down, delete. A folder's heading opens that folder.

Long binders stay quick: only the sections near the screen are live editors, and the rest show as rendered text until
you scroll to them.

## Labels, statuses and targets

- **Labels** are a name and a color (Red, Blue… to start with). Change, reorder, add and remove them in settings; a
  color is one of your theme's own, or any color you pick. **Set label** on a card or row also has **Custom
  color…**, for a color on that note alone. A label shows as the border and tint of its card, a dot in the outliner, and
  a dot beside the note in the file explorer.
- **Statuses** are a list in settings too (Idea, Draft, Revised, Done to start with). **New status...** in the menu
  takes any other.
- **Targets:** **Set target...** gives a note or a folder a word count to reach. Click the word count in the toolbar
  to set the target of the folder you're in (on the binder itself, the binder's). Cards, folder headings, the
  outliner's Target and Progress columns and the toolbar show how far along each is.
- The **Filter** button shows only the notes with a given status or label, in all three modes.
- Renaming a label or a status in settings offers to rename it in the notes that have it.

## Splitting, merging and compiling

- **Split scene at cursor** (a command, in a note or in the manuscript) moves the text from the cursor on into a new
  note right after this one. **Split scene with selection as title** names the new note from the selected words.
- Select several notes and their menu offers to merge them (**Merge 3 notes**): their text and synopses are joined
  into the first, in binder order, and the others go to the trash once the merged note has been checked to hold all
  their text.
- If Obsidian is set to update links automatically (Files and links), links to a merged-away note, or to a heading
  or block that moved in a split, are pointed at the note that has that text now. If it isn't, the merge says how
  many links will stop working before you confirm.
- The same menu has **Duplicate**, **New folder from selection** (or **Put in a new folder**), **Ungroup** on a
  folder, and **Set synopsis from text**, which takes a note's opening lines.
- **Compile binder** (a command, and **Compile...** in a binder folder's right-click menu) writes the whole binder, or
  the folder shown, as one note beside the binder, or copies it. You choose the title, whether folders and note
  titles become headings, what goes between notes, and whether comments are left out. Your notes aren't changed.
  Turn off **Include in compile** on a note or folder to leave it out. Compiling again replaces the last compile; a
  note that has been written in since, or wasn't made by Compile, is asked about first.

## Undoing a move

**Undo last move** and **Redo last move** take back, or make again, a drag, a **Move up** or **Move down**, a sort
kept as the binder's order, or a folder made around notes (or taken away from them): each note goes back beside the
neighbours it had, and to the folder it was in. Whatever you renamed or added since stays as it is. In the binder
view, Ctrl+Z and Ctrl+Shift+Z (Cmd on macOS) do the same when you aren't typing. Undo of text is still the editor's
own.

## The file explorer

![File explorer](docs/images/explorer.png)

- Binders show in their own order in Obsidian's file explorer. A binder folder says **binder** at the end of its row,
  as a canvas says “canvas”, and the folder a binder view is showing is marked there as the open note is.
- Clicking a binder, or a folder in one, opens it in the binder view and still expands it. Ctrl-click (Cmd-click on
  macOS) or middle-click opens it in a new tab.
- The binder note and folder notes are hidden, since the binder view shows what they hold. A setting shows them.
- Drag a note or folder between two others to put it there, in the same folder or another: a line shows where it
  will go, and a hint says so. Dropping onto the middle of a folder still moves it into that folder, as always.
  (Dragging below an open folder's name puts it first in that folder; below a folder's last item, further left
  puts it after the folder.) Several dragged together arrive in the order they show in. A drop that can't be made,
  such as onto a folder that already has a note of that name, says why.
- Labeled notes and folders show a dot in their label's color. A setting turns the dots off.
- A note's right-click menu has **Show in binder** and **New scene after this**; several notes selected have **New
  folder from selection** and **Merge notes**.
- **Move up** and **Move down** in a note's right-click menu (and as commands) move it one place in its folder.
- **Open binder** opens the binder view from any note in it, with that note's card selected.

## How the files look

A binder is a folder with a **binder note**, named like the folder (`The Lighthouse/The Lighthouse.md`). Its
`contents` property is the order, as paths inside the binder:

```yaml
---
binder: 1
contents:
  - Prologue
  - Part One/
  - Part One/Arrival
  - Part One/The keeper
  - Epilogue
target: 50000
synopsis: A keeper, a newcomer, and the night the light went out.
---
Anything you like: notes on the book, links, a to-do list.
```

Each scene is an ordinary note. What the cards and the outliner show are its properties:

```yaml
---
synopsis: Mara arrives on the island with the supply boat.
status: Revised
label: Blue
target: 1200
---
The supply boat left Mara on the jetty with two cases and a letter she had not opened.
```

`label` is the name of a label from settings, one of the theme's colors (`blue`), or a color of its own (`#7c3aed`).
`compile: false` leaves a note out when the binder is compiled.

A subfolder can have a **folder note** named like it (`Part One/Part One.md`) for its own synopsis, status, label and
target. Binders creates it the first time you give the folder one of these.

Binders changes only `contents` and its own properties in the binder note, and only the properties you edit in its views
in your notes. Renaming, moving or deleting notes anywhere in Obsidian keeps the order up to date. Notes the order
doesn't mention yet show after the others, by name. The full format is in [docs/file-format.md](docs/file-format.md).

## Longform

Binders shows [Longform](https://github.com/kevboh/longform) projects (multi-scene ones) as binders, in Longform's own
format: the corkboard, outliner and manuscript all work on them, and reordering writes only `longform.scenes`, as
Longform does. Scenes indented under a scene show as a group. **Convert to binder**, in the index note's right-click
menu or the command palette, turns a project into a binder, and can move groups into folders.

## Settings

| Setting | What it does |
|---|---|
| Order binders in the file explorer | Show binders in their own order, and drag there to reorder. Turn this off if another plugin replaces the file explorer. |
| Open binders from the file explorer | Clicking a binder, or a folder inside one, opens its binder view. |
| Hide binder and folder notes | Don't list a binder's note, or a folder's note, in the file explorer. |
| Show label colors in the file explorer | A dot in its label's color beside each labeled note and folder in a binder. |
| Labels | The labels a note can have: a name and a color each. Add, rename, recolor, reorder and delete them. |
| Statuses | The statuses a note can have, in the order a draft goes through them. |
| Property names | The properties for the synopsis, status, label and target, if your notes already use other names. |

Renaming a label or status in settings doesn't change the notes that have it: a note has a label when its property
says that name.

## On phones and tablets

Binders works on iOS and Android. Tap a card to select it, then tap its synopsis to edit it or its title to open the
note; press and hold for its menu, and hold and drag to move it. Rows in the outliner work the same way. Menus open
as Obsidian's own sheets, and the manuscript uses Obsidian's editor and its toolbar.

![Binders on a phone](docs/images/mobile.png)

## Compatibility

- Binders changes the order of Obsidian's own file explorer. Plugins that replace the file explorer (such as Notebook
  Navigator) don't show binder order; turn off **Order binders in the file explorer** if you use one. The binder view
  works either way.
- Binders relies on a few parts of Obsidian that aren't in its plugin API (the explorer's sorting and dragging, and
  the editor that embeds notes, as Canvas does). Each is checked when Binders starts: if an Obsidian update changes
  one, the explorer falls back to name order (and dragging there to what it does without Binders), or the manuscript
  to read only, and Binders says so.
- Requires Obsidian 1.6.6 or later.

## Privacy

Binders makes no network requests and collects nothing. Everything it does happens in your vault's files.

## Documentation

| | |
|---|---|
| [File format](docs/file-format.md) | Binder notes, folder notes, scene properties, Longform projects |
| [Plan](docs/plan.md) | The design, and what's done |
| [Obsidian internals](docs/internals.md) | The undocumented parts of Obsidian Binders uses, and their fallbacks |
| [Development](docs/development.md) | Building, testing, releasing |
| [AGENTS.md](AGENTS.md) | How to contribute |

## License

[MIT](LICENSE)
