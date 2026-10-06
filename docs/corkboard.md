# Corkboard

The corkboard shows one index card for each note in the binder or folder you're looking at, in order. It is the
place to see the shape of a part of your book and to move scenes around.

![The corkboard](images/corkboard.png)

## What a card shows

- **A note's card:** its title, synopsis, status, label color and word count. A note with a target also shows how
  far along it is.
- **A folder's card:** a folder icon, the folder's own synopsis, the names of the first five things in it, each with
  its label color, and a count of what it holds. Only notes and folders are named: a picture or a PDF kept beside
  them isn't.

The board is always one folder's items, in one order. Double-click a folder's card (or tap its name) to go into it,
and use the breadcrumb above the board to come back out.

## Working with cards

| To | Do this |
|---|---|
| Select a card | Click it |
| Open the note | Double-click the card, or press Enter |
| Open it in a new tab | Ctrl-double-click (Cmd on macOS), or middle-click |
| Edit the synopsis | Click a selected card's synopsis and type. Ctrl+Enter (Cmd+Enter) or clicking away keeps it; Esc leaves it as it was |
| Rename | Press F2, or choose **Rename** in the card's menu |
| Open the card's menu | Right-click the card, or press Shift+F10 |
| Add a note | **New note** at the end of the board, or **New** in the toolbar |

A folder with no synopsis gets one from **Edit synopsis** in its menu.

## Selecting several cards

Select cards as you would files:

- **Shift-click** selects from the card you last clicked to this one.
- **Ctrl-click** (Cmd-click on macOS) adds a card or takes it out.
- **Ctrl+Shift-click** adds a range to what's selected.

Or draw a box. Drag on empty space of the board and the cards the box touches are selected.

- With Shift held, they're added to what's selected.
- With Ctrl (Cmd on macOS) held, each card the box touches changes sides: selected becomes unselected and the other
  way round.
- Hold the box near the top or the foot of the pane and the board scrolls under it.
- Esc while dragging puts the selection back as it was.

The box is for a mouse or a pen. On a phone or tablet a finger on empty space scrolls, and **Select more** in a
card's menu selects several. See [Phones and tablets](mobile.md).

## Moving cards

- **Drag a card** to reorder it. The card follows the pointer, a line shows where it will go, and the others glide
  aside when you let go.
- **Drag onto a folder's card** to move it into that folder.
- **Drag onto a folder in the breadcrumb** to move it out to that folder.
- Several selected cards move together.
- **Move up**, **Move down** and **Move to** in a card's menu do the same without dragging. **Move to** lists every
  folder of the binder.

A move can be taken back: see [Undoing a move](undo.md).

You can also drag a card out of the view and use it as a note anywhere Obsidian takes one: onto the file explorer to
move it, into an open note to link it, onto a canvas, a tab or the bookmarks. This isn't available on a phone.

## A card's menu

Right-click a card, or several selected together. The menu has:

| Item | What it does |
|---|---|
| **Open**, **Open in new tab**, **Open to the right** | Opens the note. For a folder, **Open** goes into it, and **Open folder note** opens its note if it has one |
| **Rename** | Renames the note or folder in place |
| **Edit synopsis** | Starts editing the synopsis on the card |
| **Set synopsis from text** | Fills the synopsis from the note's opening lines |
| **Set status**, **Set label**, **Set target...** | See [Labels, statuses and targets](labels-statuses-targets.md) |
| **Duplicate**, **Merge 3 notes**, **New folder from selection** (or **Put in a new folder**), **Ungroup** | See [Splitting, merging and grouping](splitting-and-merging.md) |
| **Export...** | On a folder: opens [Export](export.md) for that folder |
| **Include in export** | Ticked as it comes. Untick it to leave the note or folder out of every export |
| **Export as** | The part it plays in an exported book: **Automatic**, **Part**, **Chapter**, **Scene**, **Front matter**, **Back matter** or **Leave out**. See [Book details and structure](book-details.md#overruling-it) |
| **Move up**, **Move down**, **Move to** | Moves it one place, or to another folder of the binder |
| **Snapshots** | **Take a snapshot**, **Rewrite...**, **Show snapshots...**. See [Snapshots](snapshots.md) |
| **Delete** | Asks first, then moves the note or folder to the trash, as Obsidian's own settings say to |

After these come the items Obsidian and your other plugins offer for that note: bookmark it, reveal it in the file
explorer, and so on.

On a tablet the menu is shorter, with the moves under one **Move**: see [Phones and tablets](mobile.md).

## The board's own menu

Right-click empty space on the board for:

- **New note** and **New folder**.
- **Card size**: small, medium or large.
- **Number the cards**: shows each note's place in the order.
- **Tint cards with their label color**: on as it comes. A labeled card has its border and, faintly, its face in
  that color, as a colored card on a canvas. Turn it off for the border alone.

## Keyboard

| Key | What it does |
|---|---|
| Arrow keys | Move between cards |
| Home, End | Go to the first or last card |
| Enter | Open the note |
| F2 | Rename |
| Alt+arrow keys | Move the card |
| Delete | Delete, after asking |
| Shift+F10 | Open the card's menu |
| Esc | Go back to one selected card |
| Ctrl+arrow keys (Cmd on macOS) | Move the focus without changing the selection |
| Space | Add the focused card to the selection, or take it out |
| Ctrl+Z, Ctrl+Shift+Z (Cmd on macOS) | Undo and redo the last move |

## Arrange by label

**Arrange** in the toolbar shows the same cards by label instead of in a grid: one line for each label, with the
cards along the lines in the binder's order, each in a place of its own. It shows which thread (a storyline, a point
of view, a character) each scene is on, and how the threads take turns through the book.

![The corkboard arranged by label, with notes in subfolders shown and small cards](images/arrange-by-label.png)

Cards with no label are on the first line. Then come the labels from settings, in their order.

### The Arrange menu

The menu is always the same. The button's icon shows which arrangement is on.

| Item | What it does |
|---|---|
| **In a grid** | The ordinary corkboard |
| **By label, across** | One line per label, running across |
| **By label, down** | One line per label, running down |
| **Show notes in subfolders** | Off as it comes. On, every note under the folder is shown, each subfolder's notes after its name, instead of one card per subfolder |
| **Show unused labels** | On as it comes. Keeps a line for every label, so there's always one to drop a card on. Off, only the labels in use have lines |

The menu stays open while you turn the two switches on and off. In the grid they're greyed out: they are about the
lines.

The lines stand as far apart as the pane has room for. When there are many they close up, and the cards pass each
other.

The command **Arrange corkboard by label** goes from the grid to the lines (the way they last ran) and back.

### Moving cards between lines

- **Drag a card to another line** to give it that line's label. The card takes the line's color as you hold it
  there, and the label's name shows beside it.
- **Drag it along the lines** to change its place in the binder.
- Do both at once and it does both.
- Several selected cards go together. Shift-click, Ctrl-click and a box drawn on empty space select them, as in the
  grid.
- **Undo last move** takes the label and the place back as one change.

### A line's menu

Click a line's name for its menu:

- **New note with this label** (or **New note**, on the line for cards with no label).
- **Select its notes**.
- **New label...**: a name and a color, added to the labels in settings.
- **Edit labels...**: opens Binders' settings.

Double-click a line where there's no card to make a note there, with that line's label.

### Keyboard, by label

- The arrow keys along the lines go through the binder's order.
- The arrow keys across the lines go to the nearest card on the next line.
- Alt with an arrow along the lines moves the card.
- Alt with an arrow across the lines gives the card the next line's label.
- Enter, F2, Delete and Shift+F10 work as in the grid.

The filter, the card size, the numbers and the tint are the corkboard's own, and apply here too. Arranging by label
works in a Longform project as well.

Next: [Outliner](outliner.md)
