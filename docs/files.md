# How your files look

Everything Binders keeps is plain Markdown in your vault. A binder is a folder plus one note that holds its order,
and everything about a scene is in that scene's own properties. Turn Binders off and your notes are still ordinary
notes.

This page says what a binder is on disk, what Binders writes, and what it never touches. The full specification is
in the [file format](dev/file-format.md).

## The binder note

A binder is a folder with a **binder note**, named like the folder: `The Lighthouse/The Lighthouse.md`. Its
`contents` property is the order, as paths inside the binder.

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

Folders end in `/`. Notes are written without `.md`. The text under the properties is yours: Binders never changes
it.

The binder note is hidden in the file explorer. Open it with **Open binder note** in the binder view's **More
options** menu, or turn off **Hide binder and folder notes** in settings.

## A scene

Each scene is an ordinary note. What the cards and the outliner show are its properties.

```yaml
---
synopsis: Mara arrives on the island with the supply boat.
status: Revised
label: Blue
target: 1200
---
The supply boat left Mara on the jetty with two cases and a letter she had not opened.
```

| Property | What it holds |
|---|---|
| `synopsis` | The text on the note's card |
| `status` | The note's status, such as Draft |
| `label` | The name of a label from settings, one of the theme's colors (`blue`), or a color of its own (`#7c3aed`) |
| `target` | A word count target |
| `notes` | Your [notes on the scene](scene-notes.md), typed in the inspector. Never exported |
| `export` | `false` leaves the note out when the binder is exported. (`compile: false`, its name in earlier versions, still does, and no note is rewritten to change it) |
| `export-as` | The part the note plays in an exported book: `part`, `chapter`, `scene`, `front matter` or `back matter` |

The first five can be kept under other names, if your notes already use them. See
[Settings](settings.md#property-names).

## Folder notes

A subfolder can have a **folder note** named like it, `Part One/Part One.md`, for its own synopsis, status, label,
target and notes, and for `export` and `export-as`. Binders creates it the first time you give the folder one of
these.

A folder note is not a scene. It never shows on the corkboard, in the outliner or in the manuscript. It is hidden in
the file explorer with the binder note. When you rename the folder, its folder note is renamed to match.

## Book details

The details of an exported book are properties of the binder note: `title`, `subtitle`, `author`, `structure`,
`cover`, `copyright`, `language`, `title-page`, `contents-page`, `book-style`, `manuscript-style` and `page-size`.
They are written only when you change one in [Book details](book-details.md), or choose a cover, a style or a
paperback's page in the Export window. One you clear is taken out of the note.

## Snapshots and exports

- **Snapshots** are `.snapshot` files in a `Snapshots` folder in the binder, one folder per note, and one
  `.binder-snapshot` file for each snapshot of a folder or of the binder. See
  [Snapshots](snapshots.md#where-snapshots-are-kept).
- **Exported files** go where the save dialog says on a computer, otherwise into the `Exports` folder beside the
  binder. See [Export](export.md#where-the-file-goes).
- **Export styles** of your own, and your changes to a built-in one, are `.bookstyle` files in an `Export styles`
  folder at the top of the vault. See [Styles](export-styles.md#a-styles-file).
- **An imported Scrivener project** is a new binder with a `Research` folder in it, which holds the project's
  original files. See [Import from Scrivener](import-scrivener.md).

## Keeping the order up to date

Renaming, moving or deleting notes anywhere in Obsidian keeps the order up to date. Notes the order doesn't mention
yet show after the others, by name. A new note is written into the list when something in its folder is moved.

## What Binders writes, and what it never touches

- **In a binder note:** `binder`, `contents`, and `synopsis`, `status`, `label`, `target` and `notes` for the binder
  itself, and the book's details above. Binders makes the note when you make a binder.
- **In a folder note:** `synopsis`, `status`, `label`, `target`, `notes`, `export` and `export-as`. It is made the
  first time you give a folder one of them.
- **In your notes:** only the properties you change through its views (`synopsis`, `status`, `label`, `target`,
  `notes`, `export`, `export-as`, and any property you edit in an outliner cell). They are written through
  Obsidian's own property writer, so the rest of the note stays as it is.
- **Note text** is never rewritten behind your back. It changes only where you type (in a note, or in the
  manuscript, which is Obsidian's own editor), or when you ask: **Split**, **Merge**, **Bring back** a snapshot,
  **Rewrite**, and the links repointed after a merge or split when Obsidian is set to update links. Each is ordered
  so the text exists in two places before it leaves the first.
- **Links in paragraphs that start with a tab** are the one exception. When the note or file they lead to is renamed
  or moved, Obsidian is set to update links and **Start a paragraph with a tab** is on, the name in the link
  changes, as Obsidian changes it in every other link, and nothing else in the note does. Obsidian doesn't do this
  itself, because it reads such a line as code. This is the one change to a note's text you didn't ask for one by
  one. See [Paragraphs](paragraphs.md).
- **New files:** notes you make or duplicate, folder notes, the one note an export makes (beside the binder, never
  in it), snapshots (in the binder's `Snapshots` folder), exported files, export styles (in `Export styles`), and
  the notes and files of a binder you import or make from a snapshot, each in a new folder of its own.
- **Files moved or renamed:** only when you move or rename them (dragging in a view or in the file explorer,
  renaming in a view, grouping), and a folder note or a note's snapshots, which follow when you rename the folder
  or the note.
- **Files moved to the trash:** only when you delete, merge or ungroup, and a split you undo.
- **A binder from a newer version of Binders** is left exactly as it is, and says why when you try to change it.
- **Nothing is sent anywhere.** See [Privacy](privacy.md).

## What Obsidian does when a property is set

Setting a property goes through Obsidian, which writes the note's whole properties block again in its own form.
Comments in the block are dropped, and `0123` becomes `123`. Obsidian's own Properties view does the same. The
note's text is never touched. See [Known limitations](limitations.md).

## Without Binders

Turn Binders off, or open the vault in another app, and:

- every scene is a Markdown note with a few properties;
- every folder is a folder;
- the binder note is a note with a list in it;
- snapshots and export styles are text files you can open in any editor;
- the file explorer lists the notes by name again.

Nothing needs converting back.

Next: [Commands](commands.md)
