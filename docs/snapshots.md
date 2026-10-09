# Snapshots

A snapshot is how something was, set aside so you can rewrite without losing anything. Take one before a big
change. Later you can read it, see what has changed since, and bring it back.

- **A note's snapshot** is its text as it was. It keeps the text only, not the synopsis, status, label or notes.
- **A folder's or a binder's snapshot** is everything in it as it stood: every note's text and properties, the
  folders' own synopses and notes, the order, and which notes were there. See
  [Snapshots of a folder or the binder](#snapshots-of-a-folder-or-the-binder), below.

![The Snapshots window, comparing an earlier snapshot with the note now](images/snapshots.png)

Only binders, their folders and their notes have snapshots.

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
- **A whole folder or binder:** that is a snapshot of its own kind, which keeps the order and the properties too.
  See [below](#snapshots-of-a-folder-or-the-binder).

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

## Snapshots of a folder or the binder

A binder view has the same **Snapshots** button (the clock) in its header as a note has. It is for the folder the
view shows: the binder, or the subfolder you are in. On a phone the header has no room for it: **Take a snapshot** and
**Show snapshots...** are under **More options**.

- **Take a snapshot** asks nothing and says what it took: "Took a snapshot of “The Lighthouse”: 7 notes · 5,204
  words." What you have typed and not yet saved goes in. If nothing at all has changed since the last one, it says
  so and takes none.
- **Show snapshots...** opens the folder's snapshots.

The same two are in a folder's menu (its card, its outliner row, the file explorer), in the binder view's **More
options**, and in the [inspector](inspector.md), which lists a folder's snapshots when a folder is selected and the
binder's when nothing is. Two commands work from a binder view or from any note of the binder: **Take a snapshot of
the binder** and **Show snapshots of the binder**.

### The window

![A binder's snapshots, with Show changes on: each note says what is different about it since the snapshot](images/binder-snapshots.png)

The list is on the left, newest first, under the binder (or folder) as it is now. Beside it is the snapshot you
picked: the contents as they stood, in their order.

| To | Do this |
|---|---|
| See what has changed since | Leave **Show changes** on. Each item says what is different about it: "+48 −7 words", "moved to “Part Two”", "now “The moor road”", "label, status", "new", "gone". Stretches that are the same fold into one line: click it to open them |
| See the contents as they stood | Turn **Show changes** off. Each note shows its words, each folder its notes |
| Read one note as it was | Click it. With **Show changes** on you see its paragraphs with the words taken out struck through and the words put in marked, as in a note's own snapshots |
| Read the whole thing | **Read** shows the snapshot as a manuscript, top to bottom. With **Show changes** on it shows only what changed, as prose, in order. (On a phone or tablet, **Read** is in the menu) |
| Compare two snapshots | **Compare with** in the menu, then the other snapshot. To compare with now again, choose the first item |
| Name it | **Name this snapshot...** in the menu: "Draft sent to Sam" |
| Delete it | **Delete snapshot** in the menu. It goes to the trash |
| Take a new one | The camera over the list |

With more than a dozen snapshots, the list says the months, and a filter button beside the camera shows only the
ones you named.

A subfolder's list also has the snapshots of the folders it is in, marked "In the whole binder": a snapshot of the
binder holds the folder too. A snapshot taken of a subfolder alone is in that folder's list only.

### Getting something back

- **One note's text:** click the note in the snapshot, then **Bring back**. The text the note has now is taken as a
  snapshot of the note first, so nothing is lost. The note's properties stay as they are.
- **A note that is gone:** a deleted note shows struck through. Click it, then **Bring back**: the note is made
  again with the text and properties it had, after the note it used to follow. If another note has its name now,
  it comes back as "Arrival 2" and the other note is not touched.
- **The whole binder, as a copy:** **Make a binder from this snapshot** in the menu writes the binder as it stood
  into a new folder beside yours, named for the snapshot: "The Lighthouse (Draft sent to Sam)". It is a binder you
  can open, compare and take notes from. Nothing in your binder changes. For a subfolder the item is **Make a
  folder from this snapshot**, and the copy goes right after the folder.

### Bringing a whole snapshot back

With a snapshot shown, **Bring back...** puts the binder (or the folder) back as the snapshot has it, in place. It
opens a screen first that says what will change, and changes nothing until you press **Bring back** there.

| Bring back | What comes back |
|---|---|
| Everything | The folder as it stood: each note's whole file (its text and its properties, as they were written), the notes and folders that are gone made again, the ones renamed or moved put back, and the order. See "Everything", below |
| The text and the order | Both of the below |
| The text of the notes | Every note that is still there gets the text it had. A note renamed or moved since is still that note, and gets its text under the name and in the folder it has now |
| The order | In each folder, the items that were in it go back to the order they had. A note written since stays after the note it follows now |

The screen opens on **Everything**. It counts the notes and items, names the first few, and lists under **Left as
it is now** everything that is different and does not come back. With one of the other three choices, that is:

- a note or folder that is gone is not made again (bring a note back by itself: open it in the snapshot);
- a note that is in another folder now stays there, and a renamed one keeps its name;
- properties (synopsis, label, status, target and the rest) stay as they are now;
- notes written since stay where they are. Nothing is ever deleted.

Nothing is lost by it:

- **A snapshot of everything as it is now is taken first**, named "Before bringing back" and the snapshot's name.
  It is in the list, a little quieter than the ones you took. To take the whole thing back, bring that one back.
  (If your newest snapshot already holds exactly what is there, that one serves and no other is taken.)
- What you have typed and not saved, in a note or in a field, is saved first, so it is in that snapshot.
- A note that is open is changed in its editor: one **Undo** there takes its text back. The order is one change
  that **Undo last move** takes back.
- A note that changes while the screen is open, or while the notes are being written (a sync, another program),
  is left as it is, and the notice at the end names it. The same goes for the order if items come or go meanwhile.
- If Obsidian is closed half-way, some notes have their old text and some don't. Bring the same snapshot back
  again to finish, or bring back the "Before bringing back" one to return to where you were.

In a Longform project the order is written to Longform's list of scenes, and nothing else in its index note.

### Everything

**Everything** puts the folder back as the snapshot has it. The screen says, by count and by name, what will be
made again, what gets its old name back, what goes back to the folder it was in, which notes get their text and
which their properties.

- **Nothing is ever deleted.** A note or folder that is new since the snapshot stays where it is, after the item
  it follows now. Or choose **Move it to one folder** under **What is new since**: the new notes and folders then
  go into one folder at the end of the binder, named "Since" and the snapshot's name (two notes of one name are
  both kept, the second counted on).
- **A note's file comes back to the byte**: the properties as you wrote them (comments, quotes, lists on one
  line), not written again in another form. One exception: when something new since stays in the binder, the
  binder note's list of contents is written by Binders, as it is whenever the order changes.
- **Renamed and moved notes are put back through Obsidian**, so links to them follow, if "Automatically update
  internal links" is on in Obsidian's settings (if it is off, links stay as they are written, and the screen says
  so). A note's own snapshots follow it.
- **A note moved to another folder of the binder is not made again.** Bringing back "Everything" on a folder's
  snapshot finds a note that is gone from the folder but is still in the binder, in another folder, by the same rule
  as a renamed note. It is listed under "Left as it is now", with where it is, and whether its text has changed.
  Bringing back never moves it: the snapshot's text stays in the snapshot.
- **A note is recognised after Obsidian has rewritten its links.** When a note is renamed or moved, Obsidian points
  the links in other notes at the new name, and a short note (one paragraph) changes with them. Binders compares
  notes with their link targets set aside, so such a note is still the same note. Where two notes would match
  equally well, neither is taken for the other.
- **A name that a new note has now** stays that note's. The note coming back keeps the name it has, or is named
  by counting on ("Arrival 2"), and the screen says which. Moving what is new to one folder frees the name.
- **Files that aren't notes** (pictures, PDFs) are not kept in a snapshot, so one that is gone can't be made again.
- **A note that is short** (under three paragraphs) and sits at a path a note had is taken for that note, whatever
  it says: it gets the text it had. So two short notes that changed names with each other get their texts back.
- **A note that changes meanwhile** (a sync, another program) is left as it is and named at the end. If an item
  is made, renamed or moved between the screen and the button, nothing is done at all: look again.
- **Undo:** a note that is open is changed in its editor, and one **Undo** there takes that note back. **Undo last
  move** takes none of it back. To take the whole thing back, bring back the "Before bringing back" snapshot
  (what was made again then stays: nothing is deleted).
- **If Obsidian is closed half-way**, the next time it opens Binders says "Bringing back … was interrupted" and
  offers **Finish**, **Put it back as it was** (which brings back the "Before bringing back" snapshot) and **Leave
  it as it is**. The first two show the same screen first. Until you answer, no other snapshot is brought back in
  that binder.

### What a snapshot of a folder does not keep

- Files that aren't notes (pictures, PDFs, canvases). They are listed in the snapshot with their size, not copied.
- Notes outside the folder.

## Snapshots of notes that are gone

When a note is deleted, merged away or moved out of the binder, its snapshots stay. The binder view's **More
options** menu lists **Snapshots of notes that are gone...**, and there is a command, **Show snapshots of notes that
are gone**.

For each, **Show** opens its snapshots, and **Give to a note...** hands them to a note of the binder.

## Where snapshots are kept

Snapshots are plain-text files, with Markdown inside, in a `Snapshots` folder in the binder. A note's are in a
folder of its own; a folder's or the binder's is one file each, with everything in it:

```
The Lighthouse/Snapshots/Part One/Arrival/2026-10-01 14.32.07 First draft.snapshot
The Lighthouse/Snapshots/Part One/2026-10-03 09.12.44 Before the new order.binder-snapshot
The Lighthouse/Snapshots/2026-10-05 16.20.05 Draft sent to Sam.binder-snapshot
```

- A `.binder-snapshot` file is the whole folder in one file, in order: each note under a line that says which it
  is, exactly as it was. A snapshot of a 100,000-word novel is about half a megabyte.
- They follow the note or folder when you rename or move it.
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
- **Without Binders, they're still there.** Open a `.snapshot` or `.binder-snapshot` file in any text editor. A
  binder's snapshot reads as the whole book, in order.
- **With git on Windows,** add the line `*.binder-snapshot -text` to `.gitattributes`, so git doesn't rewrite the
  line endings inside them. If it already has, Binders still reads them; a note that had Windows line endings of
  its own is then marked as not matching.
- **Windows line breaks in an open note.** Bringing back into a note that is open in an editor puts every word and line
  back, and Obsidian's editor then saves it with its own line breaks and without a byte-order mark, as it does for
  any note you type in. A note that is closed comes back byte for byte.
- **Obsidian Sync's Standard plan** carries files up to 5 MB. A snapshot of a binder of about 900,000 words is
  bigger than that and stays on the device that took it.

## Limits

- A folder at the top of a binder can't be named "Snapshots": that is where the binder keeps its snapshots.
- A binder made by a newer version of Binders shows its snapshots but can't take or bring back any.
- A snapshot file made by a newer version of Binders is listed and says so. This version doesn't open, rename or
  delete it.
- A snapshot file that was changed outside Binders, or that a sync hasn't finished bringing, says which notes in it
  no longer match. It can be read, and nothing is brought back or made from it.
- A Longform project has snapshots of the whole project, not of a part of it.

Next: [Undoing a move](undo.md)
