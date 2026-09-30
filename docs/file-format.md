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
---
Anything you like: a synopsis of the whole book, notes, links.
```

| Property | Type | Meaning |
|---|---|---|
| `binder` | number | Format version. Binders refuses (and never rewrites) a binder note with a version newer than it knows. |
| `contents` | list of text | The binder's order. Paths use `/`, are relative to the binder folder, have no `.md`, and folders end in `/`. |
| `plotlines` | list of text | The plot grid's columns. |
| `target` | number | Optional word count goal for the binder. |
| `synopsis`, `status`, `label` | | The binder's own card data, as for scenes (below). |

## Folder notes

A subfolder in a binder can have a **folder note**: the note directly inside it with the folder's name
(`Part One/Part One.md`). It holds the folder's own `synopsis`, `status` and `label`, and its body is free for notes.
Binders creates it when you first give the folder a synopsis, status or label in a binder view.

- A folder note is not a scene: it never appears in `contents`, on the corkboard, in the plot grid or in the manuscript.
- The binder note and folder notes are hidden in the file explorer by default.
- The binder folder's own data lives in the binder note, which is its folder note.

## Rules

- Items in the folder that `contents` doesn't mention appear after the listed items of their own folder, in name order.
- Items in `contents` that don't exist are ignored, and dropped the next time Binders writes the list.
- Duplicate entries count once. Paths that leave the folder (`..`) are ignored.
- The binder note and folder notes never appear in `contents` or as scenes in the binder views.
- A binder note inside a binder (a nested binder) is an ordinary note in 1.0.
- Binders writes only `contents` (and its own properties above) in the binder note, and never changes the rest of it.

## Scene properties

Each note in a binder can have these properties. They are ordinary Obsidian properties; the names can be changed in
settings.

| Property | Type | Used for |
|---|---|---|
| `synopsis` | text | The corkboard card's text |
| `status` | text | A chip on the card, and a filter (for example idea, draft, revised, done) |
| `label` | text | The card's color |
| `plotlines` | list of text | The plot grid's ticks for this scene |
| `plot` | object | Reserved: text per plotline for this scene (`plot: {Mara: "…"}`), for a later version of the plot grid |

## Compatibility

- Later versions of format 1 only add optional properties.
- A change older versions couldn't read raises `binder` to 2, and older versions refuse such binders instead of
  rewriting them.
