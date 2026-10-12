# Filters

A filter shows only some of a binder's notes, in every mode, and lets you work on just those: "Alice's scenes that still need
revision", edited continuously in the manuscript. It never changes a note.

## Putting a filter on

Press **Filter** in the toolbar. A popover opens (a sheet from the foot of the screen on a phone) with a first row to fill in:

1. **Property.** Status, Label, Target, Story date and Include in export come first, then the properties your notes have
   (a list such as `characters`, a text such as `pov`, a number, a checkbox, a date), then Words, Title, Folder, Created and
   Modified. Type to search the list. A property's kind is the type Obsidian gives it in its Properties view, or, if it has
   none, what its values are.
2. **Operator**, in the words Obsidian's Bases uses: *is, is not, contains, does not contain, is empty, is not empty* for
   text; *contains any of, contains all of, does not contain any of* for a list; `=` `≠` `<` `≤` `>` `≥` for numbers; *on,
   not on, before, on or before, after, on or after* for dates.
3. **Value.** For text and lists, a list of the values in use in the binder (with how many notes have each) to tick,
   several at once; type to search, or to use a name no note has yet. "No status" is there for notes that have none.
   For a number, a number; for a date, a date as you would type it in "Set story date..." (`14 June 1987`, `June 1987`,
   `1987`); for a checkbox, a tick.

**Add filter** adds a row. With more than one, choose whether *all*, *any* or *none* of the conditions are true. A change to a
row applies at once. A row you have not finished (no value yet) filters nothing, and a value that can't be read says so under
the row. **Clear filter** takes it all off.

### How things are compared

- Text ignores case: `draft` is `Draft`.
- A link means the note it points at, whatever it shows: `[[Harrow|the keeper]]` is `[[Harrow]]`. A plain `Mara` is the
  same name as `[[Mara]]`. Two different notes that are both called Mara are two people.
- A date given as a year or a month stands for every day in it. *On 1925* is any day of 1925; *before June 1925* means
  wholly before the 1st; *after June 1925* wholly after the 30th; *on or before* and *on or after* also take a vaguer date that
  could be either. A time of day is ignored.
- A number can be written as text (`2,000`).

## What you see

While part of the binder is hidden, a line under the toolbar says so: the filter's name (or "Filter" if it isn't saved), how
many notes show of the folder's ("11 of 19 notes"), and **Show the whole binder** (a cross on a phone) to take it off. Its name
opens the popover. The word count reads as the words shown out of all of them.

- **Corkboard.** One folder at a time, as always. A folder's card says "1 of 3 notes" and names only the notes that match;
  a folder with no match is not shown.
- **Outliner.** The rows that match, under the folders that have any.
- **Manuscript.** The sections that match. Where notes lie between two sections shown that are not neighbours, a dashed line
  says "2 notes not shown"; hover it for their names (a screen reader reads them).
- **Timeline.** The scenes that match, numbered as they are in the book.

A note you make while a filter is on shows, even if it doesn't match yet, so you can name it.

### When a note stops matching

Edit a scene so it no longer matches (set its status to Revised under "Draft") and **nothing leaves the page**: the note stays,
dimmed on a card or row, and "No longer matches the filter" under its title in the manuscript. The line under the toolbar says
"1 no longer matches" with **Refresh**. Press it, or change the conditions, and those notes go. The section you are typing in
always stays. Undo and Redo of the change, a status set from the inspector, from another pane or by a sync, all behave the same.

Reordering under a filter works as it did: **Move up** and **Move down** step past the next note shown, and the notes hidden keep
their places.

## Saved filters

A filter you will use again can be saved with the binder: **Save as…** at the foot of the popover, and a name. Saved filters
are listed at the top of the popover; choose one to put it on (choose it again to take it off), and use its ⋯ menu to
**Rename**, **Duplicate**, **Move up**, **Move down** or **Delete** (the last four under **More** and **Move** in the menu). Each of those is one step of **Undo**.

- Changing the conditions of a saved filter changes it at once, as in Bases. To try a variant, duplicate it first.
- A filter belongs to the binder and applies to whichever folder you are in. Add a *Folder is …* condition to pin it.
- Which filter is on is remembered for each tab and binder, as the mode is.
- They are kept in the binder note's `filters` property ([file format](dev/file-format.md)), so they go with the binder through
  sync. Edit that by hand, or have a sync change it, while the filter is on, and the view follows. If the filter is deleted
  elsewhere, it stays on as a filter that is not saved, and says so.
- A **Longform project** can be filtered but not saved ("Save as…" says to convert it to a binder), and so can a binder
  made by a newer version of Binders (it is read only).
- Rename a status or a label in the settings and the saved filters that name it are renamed in the same pass.

Filtering writes nothing to your notes. Saving writes only the binder note's `filters`.
