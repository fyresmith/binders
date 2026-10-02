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
   order they show in now. Or start a new one: the **New binder** command, or **New binder** beside **New note** and **New folder** in the menu of
   the file explorer's empty space (and of any folder that isn't in a binder).
2. Click the folder. The binder view opens on it, as a corkboard. A click that opens a folder's view doesn't fold the
   folder; click it again, or its arrow, to fold it.
3. Drag cards into the order you want, or drag the notes themselves up and down in the file explorer. Each follows
   the other.

To add a scene, use **New note** at the end of the corkboard, **New** in the view's toolbar (which makes
folders too), or **New scene here** in the folder's right-click menu or the command palette.

## The binder view

One view, three ways of seeing the notes in a binder or in one of its folders. Switch with the button at the top left,
or with the commands **Show corkboard**, **Show outliner** and **Show manuscript**. Inside a folder, the breadcrumb
beside it goes back up to the binder. The word count shows the target of the binder or folder, if it has one, with a
bar for how far along it is. Click the text under the toolbar to write a synopsis of the binder or folder. Each mode
keeps its place when you look at another, and when you open a note and come back.

### Corkboard

One index card per note, in order, with its title, synopsis, status, label color and word count (and, for a note with
a target, how far along it is). A folder is one card too, drawn as a stack, with its own synopsis and the
count of what it holds: double-click it (or tap its name) to go into it, and use the breadcrumb above the board to
come back out. So the board is always one folder's items, in one order.

- Drag cards to reorder them, onto a stack to move them into that folder, or onto a folder in the breadcrumb to move
  them out to it. The card follows the pointer,
  a line shows where it will go, and the others glide aside when you let go. Shift-click or Ctrl-click (Cmd-click on
  macOS) selects several, and they move together.
- Click a card to select it; click a selected card's synopsis to edit it. Right-click a card to rename it, set its status, label or target, duplicate
  it, move it or delete it; the menu also has what Obsidian and your other plugins offer for that note (bookmark it,
  reveal it in the file explorer, and so on).
- Right-click the board itself for a new note or folder, the card size (small, medium or large),
  **Number the cards** (each note's place in the order), and **Tint cards with their label color** (on as it comes: a
  labeled card has its border and, faintly, its face in that color, as a colored card on a canvas; turn it off for the
  border alone).
- Double-click a card, or press Enter, to open the note. Ctrl-double-click (Cmd on macOS) or a middle
  click opens it in a new tab.
- With the keyboard: arrow keys move between cards, Alt+arrows move a card, F2 renames, Delete asks before deleting,
  Shift+F10 opens the card's menu. Ctrl+arrows (Cmd on macOS) move the focus without changing the selection, and
  Space adds the focused card to it or takes it out.

#### Arrange by label

**Arrange** in the toolbar shows the same cards **By label** instead of **In a grid**: one line for each label, and
the cards along the lines in the binder's order, each in a place of its own, on its label's line. It shows which
thread (a storyline, a point of view, a character) each scene is on, and how the threads take turns through the
book. Cards with no label are on the first line; then come the labels from settings, in their order.

- **Drag a card to another line** to give it that line's label: the card takes the line's color as you hold it
  there, and the label's name shows beside it. **Drag it along the lines** to change its place in the binder. Do
  both at once and it does both. Several selected cards go together. **Undo last move** takes the label and the
  place back as one change.
- **Lines across** (as it comes) or **Lines down**, in the **Arrange** menu. The lines stand as far apart as the
  pane has room for; when there are many they close up, and the cards pass each other.
- **Show unused labels** (on as it comes) keeps a line for every label, so there's always one to drop a card on;
  turn it off to see only the labels in use. **Show notes in subfolders** (off as it comes) shows every note under
  the folder, each subfolder's after its name, instead of one stack per subfolder.
- Click a line's name for its menu: **New note with this label**, **Select its notes**, **New label...** (a name and
  a color, added to the labels in settings) and **Edit labels...**. Double-click a line where there's no card to
  make a note there, with that line's label.
- With the keyboard: the arrows along the lines go through the binder's order, the arrows across them to the
  nearest card on the next line. Alt with an arrow along the lines moves the card; Alt with an arrow across them
  gives it the next line's label. Enter, F2, Delete and Shift+F10 are as in the grid.
- The filter, the card size, the numbers and the tint are the corkboard's own, and apply here too. The command
  **Arrange corkboard by label** goes from the grid to the lines and back. It works in a Longform project as well.

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
  Turn off **Include in compile** on a note or folder to leave it out. Compiling again offers the same note, and replaces the last compile; a
  note that has been written in since, or wasn't made by Compile, is asked about first.

## Snapshots

A snapshot is a note's text as it was, set aside so you can rewrite without losing anything. Only notes in a binder
have them. The three things below are in a note's own menu and in the file explorer's; on a card, an outliner row or
a manuscript title they're under **Snapshots**; and each is a command.

- **Take a snapshot** (a note's menu, or the command) keeps the text as it is on screen now. It asks nothing; if
  nothing has changed since the last snapshot, it says so and takes none. Select several notes to take one of each,
  or choose **Take a snapshot of every note...** on a folder or the binder to take them all at one moment under one
  name, such as "Draft sent to Sam".
- **Rewrite...** takes a snapshot (give it a name if you like), then lets you start again: from the same text, or
  from a blank page. After a blank page the old text opens beside the note (on a phone it's under Snapshots).
  Undo in the note brings the text back.
- **Snapshots...** lists a note's snapshots, newest first. Read one, turn on **Show changes** to see what was taken
  out and put in since, paragraph by paragraph and word by word, **Copy** it (or select part of it and copy that),
  or **Bring back** its text. Bringing one back never loses the text it replaces: that's taken as a snapshot first.
  The menu beside it names a snapshot, opens it to the right of the note, or deletes it (to the trash).

Snapshots are plain-text files (Markdown inside) in a `Snapshots` folder in the binder, one folder per note:
`The Lighthouse/Snapshots/Part One/Arrival/2026-10-01 14.32.07 First draft.snapshot`. They follow the note when you
rename or move it. They're kept out of your way: never in a binder's order, word counts or compile, never listed
in the file explorer, and (not being notes) not in search, the quick switcher, backlinks, the graph or tags. When a
note is deleted its snapshots stay; the binder view's menu lists **Snapshots of notes that are gone**.

Three things to know:

- **Obsidian Sync skips snapshots unless you turn on "Sync all other types"** in Obsidian's Sync settings, on each
  device. Until you do, snapshots stay on the device that took them. iCloud, Syncthing, Dropbox and git carry them
  without any setting.
- Obsidian's own folder lists ("Move file to...") do show the `Snapshots` folders, and with "Detect all file
  extensions" turned on, a search by file name finds them.
- Without Binders, they're still there: open a `.snapshot` file in any text editor.

## Undoing a move

**Undo last move** and **Redo last move** take back, or make again, a drag, a **Move up** or **Move down**, a sort
kept as the binder's order, a folder made around notes (or taken away from them), or a card dragged to another
label's line on the corkboard: each note goes back beside the neighbours it had, to the folder it was in, and to the
label it had. Whatever you renamed or added since stays as it is. In the binder
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

A note has a label when its property says that name, so renaming a label or status in settings asks whether to rename
it in the notes that have it too.

## On phones and tablets

Binders works on iOS and Android. Tap a card to select it, then tap its synopsis to edit it or its title to open the
note; press and hold for its menu, and hold and drag to move it. Rows in the outliner work the same way (a row
without a synopsis gets one from **Edit synopsis** in its menu). On a phone menus open as Obsidian's own sheets, on a
tablet beside the finger; the manuscript uses Obsidian's editor and its toolbar.

What a mouse and a keyboard do differently there:

- **Several at once:** there's no Shift or Ctrl, so a card's or row's menu has **Select more**: each tap then adds an
  item to the selection or takes it out, and the menu of any of them offers **Merge**, **New folder from selection**
  and the rest. A tap on the empty board ends it.
- **Undo:** **Undo** and **Redo** of the last move are in the view's **More options** menu.
- **Arrange by label:** on a phone the cards are small and the lines run across, their names down the left edge;
  swipe to go along the lines, hold a card and drag it to another line to give it that label. **Arrange** is an icon
  in the toolbar, and its menu a sheet.
- **The outliner's headers:** a tap opens a column's menu (sort, **Move left**, **Move right**, hide); on a phone the
  label column shows the color alone.
- **Targets:** on the narrowest phones the word count leaves the toolbar; **Set word count target** in the command
  palette sets a target there.
- **The file explorer:** on a phone a tap on a binder opens it, and a tap on a folder inside it folds or unfolds it.

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
| [Roadmap](ROADMAP.md) | What's left before 1.0: mobile QA, export, find and replace, focus mode |
| [Plan](docs/plan.md) | The design, and what's done |
| [Obsidian internals](docs/internals.md) | The undocumented parts of Obsidian Binders uses, and their fallbacks |
| [Development](docs/development.md) | Building, testing, releasing |
| [AGENTS.md](AGENTS.md) | How to contribute |

## License

[MIT](LICENSE)
