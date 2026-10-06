# Undoing a move

**Undo last move** and **Redo last move** take back, or make again, a change to a binder's order. They are separate
from the editor's undo, which is for text.

## What can be undone

- a drag, on the corkboard, in the outliner or in the file explorer;
- **Move up**, **Move down** and **Move to**;
- a sort kept as the binder's order (**Make this the binder order**);
- a folder made around notes (**New folder from selection**);
- a folder taken away (**Ungroup**): the folder comes back with its synopsis, label and target;
- a card dragged to another label's line on the corkboard.

Each note goes back beside the neighbours it had, to the folder it was in, and to the label it had. Whatever you
renamed or added since stays as it is.

## How to undo

| Where | How |
|---|---|
| Anywhere | Run **Undo last move** or **Redo last move** from the command palette |
| In the binder view, when you aren't typing | Ctrl+Z and Ctrl+Shift+Z (Cmd on macOS) |
| In the binder view's **More options** menu | **Undo** and **Redo**, each saying what it will take back |

A notice says what was undone.

## Which binder

Undo works on one binder at a time:

1. the binder in front, or the one the open note is in;
2. with neither, the binder that was changed last.

A move made in another binder, out of sight, is not the one taken back.

## What it doesn't cover

- **Text.** Undo of text is the editor's own, in each note.
- **A split.** A split is undone in the note you split, with the editor's undo. See
  [Splitting, merging and grouping](splitting-and-merging.md#undoing-a-split).
- **Renames, deletes, merges and duplicates.** Deleted and merged-away notes are in the trash.

## Limits

- Undo remembers the last fifty changes, of all binders together, while Obsidian is open. It is not kept when
  Obsidian closes.
- Undo refuses, and moves nothing, if a place has been taken or a folder is gone since.
- Undoing a kept sort of thousands of notes is slow.
- For screen readers, "Undo last move" isn't announced.

Next: [Paragraphs](paragraphs.md)
