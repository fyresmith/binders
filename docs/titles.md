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
- the file explorer, for notes in a binder (whether or not *Order binders in the file explorer* is on)
- the Progress window: the parts, the records and the text's facts, for notes that still exist
- the snapshot windows: a note's heading, and the notes of a folder's snapshot, for notes that are still there
- the Scrivener project: a note's item is titled by it (the file name stays on disk, and is what links go by)

A note without one is shown by its file name, as before. A note that is gone is named as its record or snapshot has it. A title that is empty counts as none. A folder is always shown
by its name.

## From a heading

If your notes open with their title as a heading rather than a property, Binders can read it there. Under *Property
names* in [Settings](settings.md#property-names), **Name a note from** offers *Its title property or file name* (the
default), *First heading 1* to *First heading 6*, and *First heading of any level*. It is one setting for the whole vault.

```md
## #26-10-19-14-41-39

### The supply boat
#### Mara arrives
```

With *First heading 3*, this note is shown as "The supply boat". The first heading of that level is the one used, and
a heading that says nothing in words (a lone tag or a comment) is passed over.

- What a heading shows that isn't words is left out: tags (`#working-title`), comments (`<!-- ... -->`), the brackets
  of links (`[[Note|the scene]]` is "the scene") and emphasis marks.
- A `title` property still comes first: the property, then the heading, then the file name.
- It follows the note as you edit it: change the heading and the name changes.
- It is read from the note and never written to it. Editing the name in Binders (a card, an outliner row, a manuscript
  heading) writes a `title` property, which then wins over the heading; the heading and the file are left as they are.
  Take the property away and the heading is shown again.
- In an export the heading is the note's title and is printed once: the heading in the note's text is not printed
  again. (A heading 1 at the top of a note already was its chapter title.)

## Changing it

Editing a name in a card, an outliner row or a manuscript heading changes the `title` property when the note has one
(or is named from a heading), and leaves the file alone. A note without a title is renamed, as before. Undo takes either back.

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
