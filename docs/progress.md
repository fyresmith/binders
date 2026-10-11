# The record of your writing

Binders keeps a record of each binder's writing, so that it can tell you, later, how the book grew. This page says
what is kept, where, and what never is. (The window that shows it comes later.)

## What is kept

For each day you write, on each device:

- the words you **added** and **cut** by typing, in each note;
- the words that **came or went a block at a time** in each note: a single change of more than 50 words, such as a
  paste, a cut, a chapter deleted or an import. These move the book's total but are not counted as writing, so moving
  a scene by cutting and pasting nets to nothing, and deleting a chapter is not a day of minus four thousand;
- the words you added in each hour, and your **sittings** (a sitting ends after thirty minutes without typing);
- the binder's **total** at the end of the day, its number of scenes, and its words in each status.

And, with the time it happened, **what you did to the binder**: a note made, deleted, renamed or moved; a status or
label changed, from and to; a word count target set; the order changed; a snapshot taken (with its name) or brought
back; an export made (with its kind); an import; a split, a merge, a copy; a Replace all.

Import, split, merge, copy, Replace all and bringing back a snapshot are Binders' own acts. Each is recorded, and none
of them counts as writing.

A **day ends at four in the morning**, local time. Writing at half past midnight is still the day that is ending.
Focus mode's *words written today* use the same rule and the same record, so they are the same on every device.

## What is never kept

Any text of your notes; the keys you press, or how fast; the time you spend without typing; edits to a synopsis;
anything outside a binder; or any name of your device beyond the one you gave it (**This device is called**, in
settings).

Nothing in the record is ever written into a note, and nothing in it is sent anywhere. Binders deletes none of it.

## Where it is

In the binder's `Snapshots` folder, in `History`: one plain-text file for each device and year, such as
`Snapshots/History/2026 MacBook a1b2c3.binder-history`, one JSON object to a line. A device writes only its own file, so
two devices never overwrite each other's days. You can open one in any text editor; the format is in
[the binder format](dev/file-format.md#the-record-of-a-binders-writing-binders-history-1). It is a part of the
`Snapshots` folder, so it is not in the file explorer, the binder's contents, search or an export.

About 100 KB a year for a device that writes most days. It is written every few minutes while you write, when you
leave the binder, when the app goes to the background, and when Obsidian closes. A Longform project's record is in its
scene folder's `Snapshots` folder.

## Sync

With Obsidian Sync, a `.binder-history` file is carried only if **Sync all other types** is on (under Sync's settings,
**Selective sync**): the same as for snapshots. With it off, each device keeps its own record and the devices' days
are not added together. iCloud, Dropbox, Syncthing and git carry the files as they are.

## Stopping it, and deleting it

**Settings, Binders, Progress, Keep a record of your writing** turns recording off. Turning it off deletes nothing.
To delete a record, delete the files in `Snapshots/History` yourself (or the folder): Binders starts a new one the next
time you write, if recording is on.

## Good to know

- Only typing in Obsidian is counted as writing. An edit made in another program, or on a device without Binders,
  shows later as *changed elsewhere*: the difference between the book's totals and what was typed.
- A binder in a newer format than your Binders understands, or one that can't be changed, is not recorded.
- If a file can't be written (a full disk, a locked file), your typing is not affected; it is tried again.
