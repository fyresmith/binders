# Undo and redo

**Undo last change** and **Redo last change** take back, or make again, what you did by hand to a binder: a move, and
a property you set. They are separate from the editor's undo, which is for text.

## What can be undone

**Order**

- a drag, on the corkboard, in the outliner or in the file explorer;
- **Move up**, **Move down** and **Move to**;
- a sort kept as the binder's order (**Make this the binder order**);
- a folder made around notes (**New folder from selection**);
- a folder taken away (**Ungroup**): the folder comes back with its synopsis, label and target;
- a card dragged to another label's line on the corkboard.

Each note goes back beside the neighbours it had, to the folder it was in, and to the label it had. Whatever you
renamed or added since stays as it is.

**Properties**

- a synopsis, typed on a card, in a row, in the inspector or in a folder's header;
- a status, a label or a word count target, from the menus, the inspector or the outliner (set for five notes at
  once, it is one change);
- a story date, set, changed or removed from the outliner, the inspector or the menu (for five notes at once, one
  change); undone, a month is still a month and a note that had none has none;
- the notes kept on a note;
- **Include in export** and **Export as**;
- any other property you edit in a column of the outliner;
- **Set synopsis from text**.

**Renames**

- a note or a folder renamed on a card, in a row, on a lane card, in the manuscript's title or a folder's heading.

Undo gives the note its old name again, the way the rename did it, so the links to it that Obsidian updated for the
rename are updated back (if "Automatically update internal links" is on; if it is off, or you declined, the links stay
as they are both ways). A rename is taken back only if the item still has the name the rename gave it and the old name
is free: if you renamed it again, in the file explorer say, or another note has the old name now, nothing is renamed and
a notice says so. Renames made in Obsidian's own file explorer are not in the history.

**New notes, new folders and copies**

- a note or folder made with **New** or **New note after this**, and a copy of a note (**Duplicate**). The name you type
  for a new note is part of making it: one **Undo** takes the note away.

Undo takes a new note away (to the trash) only if it is still exactly as it was made: if you typed in it, or set a
synopsis, status or anything else on it from outside, nothing is taken and a notice says the note "has been written in
since it was made, so it stays". A folder goes only while nothing is in it but its folder note with no text. **Redo**
makes the note again from what was kept in memory, byte for byte, in the place it had. A copy of a **folder** isn't in
the history: delete it from the trash or the menu.

A property goes back to what it was, in the place it stood among the note's other properties. Nothing else in the
note is touched.

Unlike a move, a property is taken back only if it is still what your change left it. If the note was changed since
(by another program, or by Sync), nothing is written, and a notice says which property: "The synopsis of “Arrival”
has been changed since, so it stays as it is." Ask again with nothing changed and the change is given up, and the
one before it is taken back instead.

## How to undo

| Where | How |
|---|---|
| Anywhere | Run **Undo last change** or **Redo last change** from the command palette |
| In the binder view's toolbar | The **Undo** and **Redo** arrows, dimmed when there is nothing to take back; hold the pointer over one to read what it will do. On a phone, or in a pane narrower than about 440 px, only **Undo** is there: **Redo** is in **More options** |
| In the binder view, when you aren't typing | Ctrl+Z and Ctrl+Shift+Z (Cmd on macOS) |
| In the binder view's **More options** menu | **Undo** and **Redo**, each saying what it will take back |

A notice says what was undone.

## Which binder

Undo works on one binder at a time:

1. the binder in front, or the one the open note is in;
2. with neither, the binder that was changed last.

A change made in another binder, out of sight, is not the one taken back. The history of a binder is the same in
every view of it: the corkboard, the outliner and the manuscript; a change made in the inspector is part of it.

## What it doesn't cover

- **Text.** Undo of text is the editor's own, in each note. Typing in a note that is open is never touched by an
  undo of a property: it is saved first, and kept.
- **A split.** A split is undone in the note you split, with the editor's undo. See
  [Splitting, merging and grouping](splitting-and-merging.md#undoing-a-split).
- **Deletes and merges.** Deleted and merged-away notes are in the trash.
- **Renames made in Obsidian's file explorer or a tab's title.** They are not made through Binders.

## Limits

- Undo remembers the last hundred changes of each binder, while Obsidian is open. It is not kept when Obsidian
  closes.
- Undo refuses, and changes nothing, if a place has been taken or a folder is gone since, or a property was changed
  since.
- Undoing a kept sort of thousands of notes is slow.
- For screen readers, "Undo last change" isn't announced.

Next: [Paragraphs](paragraphs.md)
