# Coming from Longform

If you write with [Longform](https://github.com/kevboh/longform), your projects open in Binders as they are. You
don't have to convert anything to try it, and you can keep using Longform beside it. When you're ready, one command
turns a project into a binder.

## Open a Longform project as it is

Binders shows Longform's multi-scene projects as binders, in Longform's own format. Click the project's folder in
the file explorer and the binder view opens on it.

- The corkboard, the outliner and the manuscript all work on it.
- Labels, statuses, targets, synopses, snapshots, focus mode and export work too.
- Reordering writes only `longform.scenes` in the project's index note, as Longform does. Nothing else in the note
  changes.
- Scenes indented under a scene show as a group under it.

Both plugins can be on at once. Longform still sees the project, and the order is the same in both.

### What is different while it is still a Longform project

- **No folders.** A Longform project is one flat folder, so **New folder**, **New folder from selection**,
  **Ungroup** and **Move to** aren't offered.
- **The order is Longform's.** It is kept in `longform.scenes`, not in a list of Binders' own.
- **Only the scenes.** Notes that Longform ignores (`ignoredFiles`) and subfolders aren't part of the project here
  either.
- **Export:** every note is a chapter. There are no Book details to write, because the index note is Longform's;
  type `title`, `author` and the rest as properties of that note and export reads them. See
  [Book details and structure](book-details.md).
- **Single-note projects** (`format: single`) aren't binders.

## Convert a project to a binder

Converting gives the project Binders' own format: its own order in a binder note, and subfolders for parts and
chapters.

1. Right-click the project's index note or its folder in the file explorer and choose **Convert to binder**. Or
   open a note of the project and run **Convert to binder** from the command palette.
2. Choose what you want:

   | Choice | What it does |
   |---|---|
   | **Move groups into folders** | Scenes indented under another scene move into a folder named after it. Links to them are updated |
   | **Remove the "longform" property** | Longform will no longer see this project. If the property stays, Longform keeps an order of its own that changes made here don't update |

3. Read **What will happen**. The window lists every change before it is made: which note becomes the binder note,
   how many notes keep their place, which folders are made and how many notes move into each.
4. Choose **Convert**.

No text changes. With both choices off, no file moves either: the index note gets a `binder` and a `contents`
property and that is all. If the index note is outside the scene folder, a new binder note named like the folder is
made instead.

After converting, notes Longform ignored and subfolders become part of the binder.

### Keeping Longform too

If you leave the `longform` property in place, Longform still lists the project. From then on the two orders are
separate: reordering in Binders changes the binder's order, not Longform's. If you moved groups into folders,
Longform drops the moved notes from its list. If you're moving over for good, remove the property.

## Moving over, step by step

1. Install Binders beside Longform and open your project. Nothing is converted.
2. Work in it for a while: the corkboard, the manuscript, export.
3. When you want folders, or you no longer use Longform, run **Convert to binder**.
4. Turn Longform off when you no longer need it. Your notes are the same notes.

Longform's compile steps and workflows aren't read by Binders. [Export](export.md) is Binders' own: a manuscript in
Word, an ebook, a Scrivener project or one Markdown note.

## Troubleshooting

**A Longform project shows Longform's order, not mine.** That is by design: a project keeps its order in
`longform.scenes`, and Binders writes only that. **Convert to binder** makes it a binder with its own format.

The details of how Binders reads a project are in the [file format](dev/file-format.md#longform-projects).

Next: [Getting started](getting-started.md)
