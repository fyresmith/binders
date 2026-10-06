# The file explorer

Binders works inside Obsidian's own file explorer. A binder's notes and folders show there in the order you gave
them, and you can drag them there to reorder.

![A binder in the file explorer](images/explorer.png)

## What you see

- **Binder order.** A binder's notes and folders are listed in the binder's order, not by name.
- **The word "binder"** at the end of a binder folder's row, as a canvas says "canvas".
- **The open folder is marked.** The folder a binder view is showing is marked as the open note is.
- **Label dots.** Labeled notes and folders show a dot in their label's color.
- **No binder or folder notes.** The note that holds a binder's data, and a folder's, are hidden, since the binder
  view shows what they hold.

Each of these has a setting. See [Settings](settings.md#file-explorer).

## Opening a binder

- **Click** a binder, or a folder in one, to open it in the binder view. The click still expands the folder.
- A click that opens a folder's view doesn't fold the folder. Click it again, or its arrow, to fold it.
- **Ctrl-click** (Cmd-click on macOS) or **middle-click** opens it in a new tab.

Turn off **Open binders from the file explorer** in settings if you'd rather a click only folded and unfolded.
**Open binder** in the folder's right-click menu still opens it.

## Dragging to reorder

- **Between two items:** drag a note or folder between two others to put it there, in the same folder or another. A
  line shows where it will go, and a hint says so.
- **Into a folder:** dropping onto the middle of a folder still moves it into that folder, as always.
- **First in an open folder:** drag just below the open folder's name.
- **After a folder:** drag below the folder's last item and further left.
- **Several together** arrive in the order they show in.
- A drop that can't be made, such as onto a folder that already has a note of that name, says why.

A drag here can be taken back with **Undo last move**. See [Undoing a move](undo.md).

## Menus

Binders adds items to the file explorer's right-click menus.

| On | Items |
|---|---|
| A note in a binder | **Show in binder**, **New scene after this**, **Move up**, **Move down**, and **Take a snapshot**, **Rewrite...**, **Show snapshots...** |
| Several notes in a binder | **New folder from selection**, **Merge 3 notes** (or however many) |
| A binder, or a folder in one | **Open binder**, **New scene here**, **Export...**, **Take a snapshot**, **Show snapshots...** (of the folder: see [Snapshots](snapshots.md)); on a folder inside a binder, **Move up** and **Move down** |
| A folder that isn't in a binder | **Make this folder a binder**, **New binder** |
| The explorer's empty space | **New binder**, beside **New note** and **New folder** |
| A Longform project's index note or folder | **Convert to binder**. See [Coming from Longform](longform.md) |

**Open binder** opens the binder view. **Show in binder** opens it with that note's card selected.

**New folder from selection** takes the place of Obsidian's own **New folder with selection** when the selected
items are in one folder of a binder: Binders' puts the folder where the first of them was and can be undone.

## Changes made outside Binders

Renaming, moving or deleting notes anywhere in Obsidian keeps the binder's order up to date.

- A renamed note keeps its place.
- A note moved to another folder of the binder goes to the end of that folder.
- A note moved out of the binder is taken off its list. One moved in is added at the end of its folder.
- A new note shows after the listed ones, by name, until something in its folder is moved. Then its place is
  written down with the rest.
- A copy made with Obsidian's **Make a copy** goes right after the original.

## Limits

- **Other file explorers.** Plugins that replace the file explorer, such as Notebook Navigator, don't show binder
  order. Turn off **Order binders in the file explorer** if you use one. The binder view works either way. See
  [Compatibility](compatibility.md).
- **A selection that spans two folders** of a binder, or a Longform project, still has Obsidian's own **New folder
  with selection**, which puts the folder last.
- **A copied folder.** Obsidian's **Make a copy** of a folder is placed right after the original, in the original's
  order, and keeps the folder's synopsis, label and target. See [Known limitations](limitations.md) for the edge
  cases.

Next: [Phones and tablets](mobile.md)
