# Binder settings

Everything a binder keeps about itself is in one dialog: its book details, its goal, its own labels and statuses, the
template for its new notes, and its calendar. Each page's choices are kept in the binder note (see
[How your files look](files.md)).

## Opening it

- **Binder settings...** in the binder view's **More options**, beside **Open binder note**. In a folder inside a
  binder it opens the binder's settings, and says which binder.
- **Binder settings...** in the file explorer's menu on a binder's folder, after **Export...**.
- The command **Open binder settings**.
- **Edit labels...** (in a label menu or a line's menu in the corkboard's lanes) opens it at **Labels**. **Edit
  calendar...** and the timeline's **Calendar...** open it at **Calendar**. **Book details...** in the
  [Export window](export.md) opens it at **Book**.

On a phone the dialog is a list of pages; tap one for the page, and the arrow at the top goes back. Because the
**More options** sheet on a phone is full, **Open binder note** is a row at the foot of the **Book** page there.

## The pages

Every choice is kept as you make it, as in Obsidian's own settings: there is no Save or Done. A text is kept when you
leave its field or press Enter. Each choice keeps the undo it had: changing the goal, or a template, is one step of
[Undo](undo.md). The lists of labels and statuses are not in the undo history.

| Page | What it holds |
|---|---|
| **Book** | The book's title, author, structure and publishing details. See [Book details and structure](book-details.md) |
| **Goal** | The word count target, the deadline and the days you write on. The [Progress](progress.md) window paces the writing by them, and has the same form |
| **Labels** | The labels the binder's notes can have: the vault's, or the binder's own. See below |
| **Statuses** | The same for statuses |
| **New notes** | The template new notes start from (see [Templates](templates.md)), and the note revision tasks go in |
| **Calendar** | The book's own calendar and eras. See [Story date](story-date.md#a-books-own-calendar) |

**Calendar** is the one page with a **Save** button, because saving a calendar can change what the story dates
already written mean. The page says what it would do before you save.

## A binder's own labels and statuses

**Labels** and **Statuses** each start with a choice: **The vault's labels** (the default) or **This binder's
own**. The vault's are the ones in Binders' settings, and every binder without its own list uses them. Choosing the
binder's own starts from a copy of the vault's, so nothing changes until you change it. Then add, rename, recolor,
reorder (drag a row, or use the handle's menu with **Move up** and **Move down**) and remove as in the settings.

The binder's own list is used by that binder's notes only: its cards, outliner, lines, filters, the inspector, the
file explorer's dots, and the menus that set a label or status, in the list's order. Notes outside a binder, and other
binders, use the vault's.

- Renaming a label or status in the binder's list asks whether to rename it in this binder's notes too, as one step of
  Undo. Other binders' notes are not asked about. Renaming one in the vault's list skips binders with their own.
- Choosing **The vault's labels** again asks first if the lists differ, and takes the binder's list away. Your notes
  are never changed by choosing.
- **Edit the vault's labels** opens the vault's list in Binders' settings.
- **Save as binder template** keeps the lists.

## When a binder can't be changed

A binder made by a newer version of Binders is shown on every page with nothing enabled, and a line at the top says
why. A [Longform project](longform.md) is shown the same way: Longform keeps its settings in its index note, and
Binders writes nothing of its own there. **Convert to binder** is offered on the page.
