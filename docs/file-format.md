# The binder format (version 1)

A binder is an ordinary folder with one **binder note** in it. Nothing else about the folder changes.

## The binder note

Any note inside the folder whose properties include `binder`. Name it like the folder (`Novel/Novel.md`) by convention.

```yaml
---
binder: 1                 # format version (a bare `binder:` or `binder: true` also means 1)
contents:                 # the order of everything in the binder, as paths relative to the folder
  - Prologue
  - Part One/             # folders end in /
  - Part One/Arrival      # notes without .md
  - Part One/The keeper
  - Epilogue
plotlines:                # the plot grid's columns, in order
  - Mara
  - The keeper's secret
plotlineColors:           # optional: a color per plotline
  Mara: blue
---
Anything you like: a synopsis of the whole book, notes, links.
```

| Property | Type | Meaning |
|---|---|---|
| `binder` | number | Format version. Binders refuses (and never rewrites) a binder note with a version newer than it knows. |
| `contents` | list of text | The binder's order. Paths use `/`, are relative to the binder folder, have no `.md`, and folders end in `/`. |
| `plotlines` | list of text | The plot grid's columns, in order. |
| `plotlineColors` | map of text | Optional. A color for some plotlines, by name: `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple` or `pink` (the theme's own shades). Plotlines without one use the accent color; unknown colors are ignored. |
| `target` | number | Optional word count goal for the binder. |
| `synopsis`, `status`, `label` | | The binder's own card data, as for scenes (below). |

## Folder notes

A subfolder in a binder can have a **folder note**: the note directly inside it with the folder's name
(`Part One/Part One.md`). It holds the folder's own `synopsis`, `status` and `label`, and its body is free for notes.
Binders creates it when you first give the folder a synopsis, status or label in a binder view.

- A folder note is not a scene: it never appears in `contents`, on the corkboard, in the plot grid or in the manuscript.
- The binder note and folder notes are hidden in the file explorer by default.
- The binder folder's own data lives in the binder note, which is its folder note.
- Renaming a subfolder in a binder renames its folder note to match (`Part 1/Part 1.md`), so it stays the folder note.
  This is the only file Binders renames on its own.

## Rules

- Items in the folder that `contents` doesn't mention appear after the listed items of their own folder, in name order.
- Items in `contents` that don't exist are ignored, and dropped the next time Binders writes the list.
- Duplicate entries count once. Paths that leave the folder (`..`) are ignored.
- An entry YAML reads as a number (a note called `1984`, typed bare) counts as that name. Binders writes such names
  quoted.
- Reading drops one `.md` from an entry. A note whose own name ends in `.md` (`notes.md.md`) is written with its full
  name, so it reads back as itself.
- The binder note and folder notes never appear in `contents` or as scenes in the binder views.
- A binder note inside a binder (a nested binder) is an ordinary note in 1.0, or the folder note if it's named like its
  folder.
- If a folder has several binder notes, the one named like the folder is the binder note; otherwise the first by name.
- The vault's top level can't be a binder.
- Binders writes only `contents` (and its own properties above) in the binder note, and never changes the rest of it.
- Renaming a plotline in the plot grid renames it in `plotlines`, in `plotlineColors`, and in every scene in the binder:
  in its `plotlines` and as a key in its `plot`, in one write per note. If a scene's `plot` already has an entry under
  the new name, that scene's `plot` is left as it is, so no text replaces another. Deleting a plotline removes it from
  `plotlines` and `plotlineColors`, and, only if you ask, from the scenes' `plotlines` and `plot` (a `plot` left empty
  is removed). Binders changes nothing else in `plot` yet.

## Keeping the list up to date

- Renaming an item inside a binder, from anywhere in Obsidian, keeps its place (a folder's items move with it). Moving
  an item to another folder of the binder puts it at the end of that folder, with its items. Moving an item out removes
  it from `contents`; moving one in adds it at the end of its folder. Deleting removes it.
- A new note isn't written into `contents` until you move it: until then it shows after the listed items.
- Moving an item in a binder writes down the place of everything there that isn't listed yet, files that aren't notes
  (images, PDFs) included, so what you see is what's kept.
- Changes are written together, a moment after the last one: moving a folder of 40 notes writes the binder note once.
  They're applied to what the binder note says at that moment, so edits made to it meanwhile are kept.
- "Make this folder a binder" creates `Folder/Folder.md` with `binder: 1` and `contents` in the order the file explorer
  showed (folders first, then notes, by name). If `Folder/Folder.md` already exists, it adds `binder: 1` (and
  `contents`, if it has none) to its properties and leaves its text alone.

## Scene properties

Each note in a binder can have these properties. They are ordinary Obsidian properties; the names can be changed in
settings.

| Property | Type | Used for |
|---|---|---|
| `synopsis` | text | The corkboard card's text |
| `status` | text | A chip on the card, and a filter (for example idea, draft, revised, done) |
| `label` | text | The card's color |
| `plotlines` | list of text | The plot grid's ticks for this scene. Names the binder has no column for still show, under "Other" |
| `plot` | object | Reserved: text per plotline for this scene (`plot: {Mara: "…"}`), for a later version of the plot grid |

## Longform projects

Binders also shows [Longform](https://github.com/kevboh/longform) multi-scene projects as binders, in Longform's own
format, and writes only `longform.scenes` in the index note:

```yaml
---
longform:
  format: scenes            # only multi-scene projects; `single` isn't a binder
  sceneFolder: /            # the binder folder, relative to this note
  scenes:                   # the order, by note name; a nested list is indented under the scene before it
    - Harbor
    - - Ticket office       # a group under "Harbor"
      - The crossing
    - Island
  ignoredFiles:             # names (wildcards * and ?) that aren't scenes
    - Notes*
plotlines:                  # the plot grid's columns: outside `longform`, as in a binder note
  - Ines
---
```

- Scenes are the notes directly in the scene folder. Notes `scenes` doesn't list show after the listed ones, by name.
- A reorder rewrites `scenes` in the same nested shape Longform writes; nothing else in the note changes.
- Renames and deletes of scenes update `scenes` when Longform isn't running (when it is, Longform does it).
- A Longform project inside a binder is ordinary notes, and a note with both `binder` and `longform` is a binder note.
- "Convert to binder" writes `binder: 1` and `contents` into the index note (or a new binder note named like the scene
  folder, if the index note is outside it), and optionally moves groups into subfolders and removes `longform`.

## Compatibility

- Later versions of format 1 only add optional properties.
- A change older versions couldn't read raises `binder` to 2, and older versions refuse such binders instead of
  rewriting them.
