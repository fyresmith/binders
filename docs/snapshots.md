# Snapshots

A snapshot is a note's text as it was, set aside so you can rewrite without losing anything. Take one before a big
change. Later you can read it, see what has changed since, and bring it back.

![The Snapshots window, comparing an earlier snapshot with the note now](images/snapshots.png)

Only notes in a binder have snapshots. A snapshot keeps the text only, not the synopsis, status, label or notes.

## Where to find them

The three things below are in several places:

- the **Snapshots** button (a clock) in the header of any note of a binder;
- a note's own **More options** menu, and its right-click menu in the file explorer;
- under **Snapshots** in the menu of a card, an outliner row or a manuscript title;
- the command palette: **Take a snapshot**, **Rewrite** and **Show snapshots**;
- the [inspector](inspector.md), which lists a note's snapshots and has a camera to take one.

In the manuscript, the commands apply to the section the cursor is in.

## Take a snapshot

**Take a snapshot** keeps the text as it is on screen now. It asks nothing. If nothing has changed since the last
snapshot, it says so and takes none.

- **Several notes:** select their cards or rows and choose **Take a snapshot of 3 notes** (or however many) to take one of each.
- **A whole folder or binder:** choose **Take a snapshot of every note...** in a folder's menu or the binder view's
  **More options**, or run **Take a snapshot of every note in the binder**. They are all taken at one moment, under
  one name if you give it one, such as "Draft sent to Sam".

## Rewrite

**Rewrite...** takes a snapshot, then lets you start again.

1. Choose **Rewrite...**. Give the snapshot a name if you like.
2. Choose **Start from this text** or **Start from a blank page**.

After a blank page, the old text opens beside the note so you can read it as you write. On a phone it's under
**Snapshots**. Undo in the note brings the text back.

## Show snapshots

**Show snapshots...** lists a note's snapshots, newest first, under the note as it is now.

| To | Do this |
|---|---|
| Read a snapshot | Click it in the list |
| See what changed | Turn on **Show changes**. You see the note's own paragraphs, with the words taken out struck through and the words put in marked where they fall |
| Put its text back | Choose **Bring back**. The text it replaces is taken as a snapshot first, so nothing is lost |
| Copy its text | **Copy text** in the menu beside it. Or select part of the text and copy that |
| Name it | **Name this snapshot...** in the menu |
| Read it beside the note | **Open to the right** in the menu |
| Delete it | **Delete snapshot** in the menu. It goes to the trash |
| Take a new one | The camera over the list |

With no snapshots yet, the window says what a snapshot is and offers to take the first.

## Snapshots of notes that are gone

When a note is deleted, merged away or moved out of the binder, its snapshots stay. The binder view's **More
options** menu lists **Snapshots of notes that are gone...**, and there is a command, **Show snapshots of notes that
are gone**.

For each, **Show** opens its snapshots, and **Give to a note...** hands them to a note of the binder.

## Where snapshots are kept

Snapshots are plain-text files, with Markdown inside, in a `Snapshots` folder in the binder, one folder per note:

```
The Lighthouse/Snapshots/Part One/Arrival/2026-10-01 14.32.07 First draft.snapshot
```

- They follow the note when you rename or move it.
- They're kept out of your way: never in a binder's order, word counts or exports, and never listed in the file
  explorer.
- Not being notes, they are not in search, the quick switcher, backlinks, the graph or tags.
- A [Scrivener project](export-scrivener.md) is the one export that carries them, as Scrivener's own snapshots.

## Three things to know

- **Obsidian Sync skips snapshots unless you turn on "Sync all other types"** in Obsidian's Sync settings, on each
  device. Until you do, snapshots stay on the device that took them. Tools that copy every file in the vault
  (iCloud, Syncthing, Dropbox, git) carry them without any setting.
- **Obsidian's own folder lists** ("Move file to...") do show the `Snapshots` folders, and with **Detect all file
  extensions** turned on, a search by file name finds them.
- **Without Binders, they're still there.** Open a `.snapshot` file in any text editor.

## Limits

- A folder at the top of a binder can't be named "Snapshots": that is where the binder keeps its snapshots.
- A binder made by a newer version of Binders shows its snapshots but can't take or bring back any.

Next: [Undoing a move](undo.md)
