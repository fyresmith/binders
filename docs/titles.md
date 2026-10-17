# Titles

A note can have a **title** that Binders shows in place of its file name. This is for notes whose file names are
something else: an ID, a date, a number. Name the file `a8f3k2`, give it `title: The supply boat`, and the supply
boat is what you see.

```yaml
---
title: The supply boat
synopsis: Mara arrives on the island.
---
```

## Where it shows

A note that has a title is shown by it everywhere Binders shows the note's name:

- cards on the corkboard, the lanes and the timeline, and rows in the outliner
- headings in the manuscript, and in focus mode
- the inspector, the contents, the revision pane, and find and replace
- menus and notices that name the note
- the headings and the contents list of an export
- the file explorer, for notes in a binder (it goes with the *Order binders in the file explorer* setting)

A note without one is shown by its file name, as before. A title that is empty counts as none. A folder is always shown
by its name.

## Changing it

Editing a name in a card, an outliner row or a manuscript heading changes the `title` property when the note has one,
and leaves the file alone. A note without a title is renamed, as before. Undo takes either back.

Obsidian's own rename in the file explorer (and in a tab's menu) always renames the file, starting from its file name.

## The property's name

If your notes already keep the name elsewhere, say `name`, change the **Title** property under *Property names* in
[Settings](settings.md#property-names).

## Things to know

- Links, the quick switcher and the title bar are Obsidian's, and still use the file name.
- A template that writes `title: {{title}}` gives each new note a title equal to its name. If you then rename the file,
  the title stays; rename it from the binder view and the title is what changes.
- Splitting a note doesn't copy its title to the new notes: they are shown by their file names.
- Sorting the outliner by *Title* sorts by what is shown.
