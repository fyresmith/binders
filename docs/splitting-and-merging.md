# Splitting, merging and grouping

The tools for changing a book's shape: cut one scene into two, join several into one, copy a scene, put scenes in a
folder, and take a folder away again.

## Split a scene

1. Put the cursor where the new scene should begin, in a note of a binder or in the manuscript.
2. Run **Split scene at cursor** from the command palette.

The text from the cursor on moves into a new note right after this one.

**Split scene with selection as title** does the same and names the new note from the words you have selected.

### Undoing a split

Undo in the note you split (Ctrl+Z, or Cmd+Z on macOS) takes the whole split back: the text returns and the new note
goes to the trash. Redo splits again.

- If you have already edited, renamed or moved the new note, it stays, and a notice says the text is then in both.
- This works only while Obsidian stays open and Binders stays on. After a restart, or once the note's own undo
  history is gone, the split is two notes like any others. You can [merge](#merge-scenes) them back.
- If the note changes in the moment it is being split, both notes keep the text and a notice says so.

## Merge scenes

1. Select several notes on the corkboard or in the outliner, or in the file explorer.
2. Right-click one and choose **Merge 3 notes** (or however many).
3. Read what the window says, then confirm.

Their text is joined into the first, in binder order, with a blank line between. Their synopses and
[scene notes](scene-notes.md) are joined too. The other notes go to the trash, with their other properties, once the
merged note has been checked to hold all their text.

If a source note changes during the merge, or the merged note no longer holds its text, that source and the
remaining notes stay in place. A notice explains why. The text already joined into the first note stays there,
so you can compare the copies before deciding what to keep.

## Links after a split or a merge

If Obsidian is set to update links automatically (**Settings → Files and links → Automatically update internal
links**), links are pointed at the note that has the text now:

- links to a merged-away note go to the merged note;
- links to a heading or block that moved in a split go to the new note.

If the setting is off, the merge says how many links will stop working before you confirm.

## Duplicate

**Duplicate** in a card's or row's menu makes a copy right after the original, named by counting on:
"Arrival" gives "Arrival 2". A folder is copied with everything in it, in its order. What you have typed and not yet saved is copied too.

## Group: put scenes in a folder

1. Select the notes or folders. They must be in the same folder.
2. Right-click and choose **New folder from selection**. (With one item selected, the menu says **Put in a new
   folder**.)
3. Type the folder's name.

The folder takes the place of the first of them. The same item is in the file explorer's menu when several items of
one binder folder are selected.

This isn't offered in a Longform project, which has no folders.

## Ungroup: take a folder away

**Ungroup** in a folder's menu moves what the folder holds out to where the folder stood. The emptied folder goes to
the trash with its synopsis, label and target.

- **Undo last move** brings the folder back with all of them and puts its notes back inside, in order.
- A folder stays if something is still in it: text you wrote in its folder note, say, or a file Obsidian doesn't
  list. A notice says so.

## Set synopsis from text

**Set synopsis from text** in a card's or row's menu fills a note's synopsis from its opening lines.

- For one note that already has a synopsis, it asks before replacing it.
- With several notes selected, it fills only the ones that have none.

## Moving without dragging

**Move up**, **Move down** and **Move to** in a card's or row's menu move a note or folder one place, or to any
folder of the binder. **Move up** and **Move down** are commands too, and are in a note's right-click menu in the
file explorer.

## Deleting

**Delete** in a card's or row's menu (or the Delete key) asks first, and says how many notes go with a folder. What
you delete goes to the trash, as Obsidian's **Deleted files** setting says. A deleted note's
[snapshots](snapshots.md) stay.

## What can be undone

| Change | How to undo it |
|---|---|
| A split | Undo in the note you split (Ctrl+Z) |
| A move, a new folder from a selection, an ungroup | **Undo last move**. See [Undoing a move](undo.md) |
| A merge, a duplicate, a delete, a rename | Not undone by Binders. Merged-away and deleted notes are in the trash |

Next: [Snapshots](snapshots.md)
