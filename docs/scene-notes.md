# Scene notes

Scene notes are your own notes about a scene: what it has to do, what to fix, a question for later. They are not
part of the manuscript and are never put in an exported book.

They are different from the **synopsis**. The synopsis says what happens in the scene, and shows on its card. Notes
are for everything else you want to remember about it.

## Writing them

1. Open the [inspector](inspector.md) in the right sidebar.
2. Put the cursor in a scene in the manuscript, or select a card or a row.
3. Click under **Notes** and type.

What you type is saved when you leave the field, move to another scene, or close the tab.

A folder can have notes too. Select the folder's card or row and type in the same place. The binder itself can have
them as well: with nothing selected at the top of the binder, the inspector shows the binder.

## Seeing them for many scenes

The outliner has a **Notes** column. Add it with **+** at the end of the header row. See [Outliner](outliner.md).

## Where they are kept

In the note's `notes` property. A folder's are in its folder note, which Binders makes if the folder has none. If
your notes already use `notes` for something else, change the property's name under **Settings → Binders →
Property names → Notes**.

```yaml
---
synopsis: Mara arrives on the island with the supply boat.
notes: Check the tide times. Does she already know the keeper's name?
---
```

## What happens to them

- **Export:** left out of a manuscript, an ebook and One note. A [Scrivener project](export-scrivener.md) carries
  them across as each document's notes, which Scrivener doesn't compile either.
- **Merge:** when notes are merged, their scene notes are joined as their synopses are.
- **Snapshots:** a snapshot keeps a scene's text only, not its notes.

Next: [Splitting, merging and grouping](splitting-and-merging.md)
