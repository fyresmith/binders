# Outliner

The outliner shows the same notes as rows of a table, folders with their notes under them, in binder order. It is
the place to see many scenes at once, compare them by status or word count, and change several together.

![The outliner](images/outliner.png)

The title comes first, with the synopsis under it. The other columns are yours to pick.

## Columns

| Column | What it shows |
|---|---|
| **Label** | The note's label, in its color |
| **Status** | The note's status |
| **Words** | Words in the note; for a folder, in every note in it |
| **Target** | The note's word count target; for a folder without one, its notes' targets together |
| **Progress** | How far along its target the note is |
| **Export** | Whether the note is included when the binder is exported |
| **Export as** | The part the note plays in the book: a chapter, a scene, front matter. Click it on a selected row for its menu. See [Book details and structure](book-details.md#overruling-it) |
| **Notes** | Your [notes on the scene](scene-notes.md), which are never exported |
| **Story date** | When the note happens in the story, in words (`14 June 1987`). Type it in words or as `1987-06-14`; nothing typed takes it away. Sorted by story time, with undated notes last whichever way it runs, and something that isn't a date is shown as typed, muted. A folder without a date of its own shows its earliest note's, faint. See [Story date](story-date.md) |
| **Created**, **Modified** | When the note was created and last changed |
| Any property | A property of your notes, such as a POV or a date |

A new outliner starts with Label, Status and Words.

- **Add or remove a column** with **+** at the end of the header row, or **Columns** in the view's **More options**.
  **Other property...** asks for a property's name.
- **Move a column** by dragging its header, or with **Move left** and **Move right** in the header's right-click
  menu. **Hide column** is there too.
- **Resize a column** by dragging the edge of its header.
- **Hide the synopses** with **Show synopses** in **More options**, or in the menu of the title's header.

The outliner remembers its columns, and a newly opened outliner starts with the ones you last arranged.

## Sorting

Click a header to sort by it: ascending, then descending, then binder order again. Right-click the header for the
same as a menu: **Sort ascending**, **Sort descending**, **Binder order**.

Sorting only changes what you see, within each folder. The binder's order stays as it is, unless you choose **Make
this the binder order** in that menu. That can be [undone](undo.md).

Rows can't be dragged while the outliner is sorted.

## Editing

- **Rename a row** with F2.
- **On a selected row**, click a label or status for its menu, or click the synopsis, a target or a property to type
  in it.
- **With several rows selected**, the change is made to all of them.
- **Ticks** (the Export column, and yes/no properties) change with a click.

Typing into a property column on a folder's row keeps the value in the folder's own note, which Binders makes if the
folder has none. See [How your files look](files.md#folder-notes).

## Folders

Folders fold with the arrow beside them. **Expand all** and **Collapse all** are in the view's **More options**.

A folder's row adds up the words of the notes in it, and their targets if it has none of its own. The last row does
the same for everything shown.

## Rows

Rows are selected, dragged and right-clicked as cards are. See [Corkboard](corkboard.md#selecting-several-cards) for
selecting and [a card's menu](corkboard.md#a-cards-menu) for the menu.

Drag a row between two rows, onto a folder, or below everything.

## Keyboard

| Key | What it does |
|---|---|
| Up, Down | Move between rows |
| Home, End, Page Up, Page Down | Go further |
| Left, Right | Fold and unfold a folder. Right goes on into a row's cells |
| Space | Fold or unfold |
| Enter | Open the note |
| Ctrl+A (Cmd+A on macOS) | Select all |
| F2 | Rename |
| Delete | Delete, after asking |
| Typing a name's first letters | Go to that row |
| Alt+Up, Alt+Down | Move the selected rows |
| Alt+Left | Take the selected rows out of their folder |
| Alt+Right | Put them in the folder above |

Inside a row's cells, the arrow keys move from cell to cell and Enter (or Space) opens the cell's menu or field.

## On a phone

A tap on a header opens that column's menu: sort, **Move left**, **Move right**, **Hide column**. On a phone the
label column shows the color alone. See [Phones and tablets](mobile.md).

Next: [Manuscript](manuscript.md)
