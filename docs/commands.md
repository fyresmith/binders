# Commands

Every command Binders adds to Obsidian's command palette. Open the palette (Ctrl+P, or Cmd+P on macOS) and type the
name.

None has a default hotkey. Give the ones you use a hotkey of your own under **Settings → Hotkeys**.

Most commands only appear where they apply: with a binder view in front, or with a note of a binder open.

## Binders

| Command | What it does | Where it applies |
|---|---|---|
| **Import from Scrivener...** | Makes a new binder from a Scrivener 3 project, or a zipped backup of one, and shows it first. See [Import from Scrivener](import-scrivener.md) | Anywhere |
| **Import a manuscript...** | Makes a new binder from a Markdown note or a text file, split where its chapters start, and shows it first. A zipped Scrivener backup chosen there goes to the Scrivener import. See [Import a manuscript](import-manuscript.md) | Anywhere |
| **New binder** | Makes a new folder that is a binder, beside the open note if that's outside a binder, else at the top of the vault | Anywhere |
| **Make this folder a binder** | Turns the open note's folder into a binder | A note in a folder that isn't in a binder |

A note outside a binder also has **Make a binder from this note...** in its menu in the file explorer: the same as **Import a manuscript...**, with that note chosen.
| **Open binder** | Opens the binder view on the folder of the open note, with the note's card selected | A note of a binder |
| **Convert to binder** | Turns a Longform project into a binder. See [Coming from Longform](longform.md) | A note or view of a Longform project |

## The binder view

| Command | What it does | Where it applies |
|---|---|---|
| **Show corkboard** | Switches the binder view to the corkboard | A binder view in front |
| **Show outliner** | Switches it to the outliner | A binder view in front |
| **Show manuscript** | Switches it to the manuscript | A binder view in front |
| **Arrange corkboard by label** | Goes from the grid to the lines by label (as they last ran) and back | The corkboard |
| **Set word count target** | Sets the target of the folder the binder view shows (the binder's own, on the binder) | A binder view in front |
| **Show inspector** | Shows the inspector in the sidebar | Anywhere |
| **Show contents** | Shows the contents of the book in the sidebar | Anywhere |

## Scenes

| Command | What it does | Where it applies |
|---|---|---|
| **New scene here** | Makes a note after the open one, or, in a binder view, where the view would put one | A note of a binder, or a binder view |
| **Move up** | Moves the open note one place up in its folder | A note of a binder that isn't first |
| **Move down** | Moves the open note one place down in its folder | A note of a binder that isn't last |
| **Undo last change** | Takes back the last change made by hand to the binder: a move, a property set. See [Undo and redo](undo.md) | When there is a change to undo |
| **Redo last change** | Makes it again | When there is a change to redo |
| **Split scene at cursor** | Moves the text from the cursor on into a new note after this one | The editor of a note of a binder, or a section of the manuscript |
| **Split scene with selection as title** | The same, naming the new note from the selected words | The same, with text selected |

## Paragraphs

| Command | What it does | Where it applies |
|---|---|---|
| **Start a paragraph with a tab** | Puts a tab at the start of the line the cursor is in, or of each paragraph in what is selected. A line that has its tab is left; so are headings, lists, quotes and code. Made for a phone, which has no Tab key. See [Paragraphs](paragraphs.md) | The editor of a note of a binder, or a section of the manuscript, with **Start a paragraph with a tab** on in settings |

## Snapshots

| Command | What it does | Where it applies |
|---|---|---|
| **Take a snapshot** | Keeps the note's text as it is now | A note of a binder, or the manuscript section the cursor is in |
| **Rewrite** | Takes a snapshot, then starts again from the same text or a blank page | The same |
| **Show snapshots** | Lists the note's snapshots | The same |
| **Take a snapshot of the binder** | One snapshot of the whole binder: every note's text and properties, and the order | A binder view, or a note of a binder |
| **Show snapshots of the binder** | The binder's snapshots: read, compare, bring back | A binder view, or a note of a binder |
| **Show snapshots of notes that are gone** | Lists the snapshots left by deleted, merged-away or moved-out notes | A binder that has some |

## Find and replace

| Command | What it does | Where it applies |
|---|---|---|
| **Find in binder** | Opens the find bar over every note of the folder shown. See [Find and replace](find-and-replace.md) | A binder view in front |
| **Find and replace in binder** | The same, with the replace row | The same, in a binder that can be changed |

## Focus mode

| Command | What it does | Where it applies |
|---|---|---|
| **Toggle focus mode** | Goes into focus mode, or out of it | A note of a binder, or the manuscript |
| **Go to previous scene** | Moves to the scene before, in the binder's order | A note of a binder, or the manuscript, in focus mode or out of it |
| **Go to next scene** | Moves to the scene after | The same |

## Export

| Command | What it does | Where it applies |
|---|---|---|
| **Export binder** | Opens the Export window for the binder, or the folder shown: a manuscript, an ebook, a paperback, a Scrivener project, or one Markdown note. See [Export](export.md) | A binder view, or a note of a binder |
| **Export again** | Makes the last export of the binder once more, in the same place, without opening the window. With none yet, it opens the window. See [Export again](export.md#export-again) | A binder view, or a note of a binder |

## Things that are not commands

Some things are in menus only:

- **Merge 3 notes** (or however many), **Duplicate**, **New folder from selection**, **Ungroup**, **Set status**, **Set label**, **Set
  target...** and **Delete** are in the right-click menu of a card or a row. See [a card's menu](corkboard.md#a-cards-menu).
- **Export as**, **Include in export** and **Move to** are there too.
- **Show in binder** and **New scene after this** are in a note's right-click menu in the file explorer.
- A style's **Duplicate**, **Save a copy to share...** and the rest are in the [style editor](export-styles.md)'s menu.
- Focus mode's options are in its own menu and in settings.

## Keys in the binder view

These aren't commands, and work when the binder view has the keyboard:

| Key | What it does |
|---|---|
| Ctrl+Z, Ctrl+Shift+Z (Cmd on macOS) | Undo and redo the last change, when you aren't typing |
| F2 | Rename |
| Delete | Delete, after asking |
| Shift+F10 | Open the menu |

Each mode's page has its full list: [Corkboard](corkboard.md#keyboard), [Outliner](outliner.md#keyboard),
[Manuscript](manuscript.md#moving-around).
