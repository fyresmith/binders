# Changelog

All notable changes to Binders. Versions follow [semantic versioning](https://semver.org): see AGENTS.md for what
counts as a patch, minor or major change. Entries are added by `npm run ship`.

## 0.6.11 (2026-09-30)

### Changed

- Cards show when you point at them.

## 0.6.10 (2026-09-30)

### Fixed

- On phones, the last cards are no longer hidden under the navigation bar.

## 0.6.9 (2026-09-30)

### Fixed

- Back returns to a folder even after it was renamed.

## 0.6.8 (2026-09-30)

### Fixed

- After deleting a card, the next card has the focus, so the keyboard keeps working.

## 0.6.7 (2026-09-30)

### Fixed

- Escape cancels a card drag, as in the file explorer.

## 0.6.6 (2026-09-30)

### Fixed

- If a new note can't be made, the title you typed stays in the field.

## 0.6.5 (2026-09-30)

### Fixed

- A note made while a filter is on stays on the board until you change the filter.

## 0.6.4 (2026-09-30)

### Fixed

- With a filter on, moving a card up or down steps past the cards you can see and leaves hidden notes where they are.

## 0.6.3 (2026-09-30)

### Fixed

- Note names can't start with a dot, which would make a hidden file Obsidian doesn't show.

## 0.6.2 (2026-09-30)

### Fixed

- Renaming a note to its folder's name, or a folder to the name of a note in it, is refused instead of hiding the note.

## 0.6.1 (2026-09-30)

### Fixed

- Moving a note into a folder with the same name is refused, so the note no longer turns into that folder's note and disappears.

## 0.6.0 (2026-09-30)

### Added

- Longform projects show as binders in the file explorer, the corkboard, the plot grid and the manuscript; reordering writes only Longform's own scene list.
- Convert to binder: turns a Longform project into a binder, optionally moving its groups into folders.

## 0.5.0 (2026-09-30)

### Added

- The binder view: click a binder to open it, with breadcrumbs, word count and target, and a switch between corkboard, plot grid and manuscript.
- The corkboard: index cards in binder order, with editable synopses, status and label, drag to reorder or move between folders, new cards, and a full right-click menu.

## 0.4.1 (2026-09-30)

### Changed

- Binders now needs Obsidian 1.6.6 or later.

## 0.4.0 (2026-09-30)

### Added

- The manuscript: every scene in a folder as one continuous page you can edit, with changes saved to each note and edits made elsewhere merged in.

## 0.3.3 (2026-09-30)

### Fixed

- In the plot grid, a scene can be dropped last in the folder even when the last row is inside a subfolder.

## 0.3.2 (2026-09-30)

### Fixed

- Renaming or deleting a plotline now renames or removes its text in each scene's plot property.

## 0.3.1 (2026-09-30)

### Changed

- Internal: property edits apply to the note as written, not a cached copy.

## 0.3.0 (2026-09-30)

### Added

- A plot grid of scenes against plotlines: toggle cells, add, rename, color, reorder and delete plotlines, and drag scenes into a new order.

## 0.2.3 (2026-09-30)

### Fixed

- Internal: end-to-end tests can now press Obsidian hotkeys.

## 0.2.2 (2026-09-30)

### Changed

- Internal: proof that the manuscript can edit notes in place safely, and the notes for building it.

## 0.2.1 (2026-09-30)

### Changed

- Internal: the contract the corkboard, plot grid and manuscript views share.

## 0.2.0 (2026-09-30)

### Added

- Binders are found and kept in order as notes and folders are renamed, moved or deleted.
- Commands and right-click menu items: Make this folder a binder, New scene here, Move up, Move down.
- Settings to hide binder and folder notes, and to rename the synopsis, status, label and plotlines properties.

### Changed

- Renaming a subfolder in a binder also renames its folder note, so it stays the folder's note.

## 0.1.3 (2026-09-30)

### Added

- Binders show in their own order in the file explorer, with a binder icon; binder and folder notes are hidden; clicking a binder folder will open it.

## 0.1.2 (2026-09-30)

### Added

- The plot property is reserved for text per plotline in the plot grid.

### Changed

- Subfolders get a hidden folder note for their synopsis, status and label; binder and folder notes are hidden in the explorer by default; mobile is required for 1.0.

## 0.1.1 (2026-09-30)

### Added

- CLAUDE.md: where the project stands, decisions so far, and the open questions to settle first.

## 0.1.0 (2026-09-30)

### Added

- Project scaffold: build, lint, unit and end-to-end tests, release workflow with build attestations, and documentation.
- The binder format (version 1) and its model: reading a binder note's table of contents, ordering a folder's
  children, and following renames, removals and moves. Binder notes from a newer version are refused, never rewritten.
- Plugin settings for the file explorer (not used yet).
