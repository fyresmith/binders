# Story date

A **story date** says when a scene happens in the story, not when you wrote it. It is an ordinary property of the
note, `story-date`, so it is in the file you can read and in Obsidian's own Properties view. An outliner column
shows it, and sorting by it puts the book in the order things happen.

## Setting one

Any of these sets it, for one note or for several selected together:

- the **Story date** column of the [outliner](outliner.md): select a row, click the cell, type, Enter;
- the **Story date** row of the [inspector](inspector.md);
- **Set story date...** in the menu of a card or row (the menu is the way on a phone). **Remove story date** is there
  when a selected note has one.

Type it the way you would say it: `14 June 1987`, `June 14, 1987`, `June 1987`, `1987`, or in ISO shape,
`1987-06-14`. A year before 0 takes a minus: `-30`. Typing nothing takes the date away, and the property with it.
What isn't a date, or a day the month hasn't got (`30 February`), is refused with a notice, and what you typed stays in
the field.

A folder can have a date too, kept in its folder note. Without one, a folder shows its earliest note's date, faint,
and sorts by it.

## How it is written

As text in ISO shape, the form a computer sorts:

| You typed | In the note | Meaning |
|---|---|---|
| `14 June 1987` | `story-date: 1987-06-14` | A day |
| `June 1987` | `story-date: 1987-06` | A month, placed at its start |
| `1987` | `story-date: 1987` | A year |
| `412` | `story-date: "0412"` | A year, padded to four digits |
| `1 February -30` | `story-date: -0030-02-01` | Before year 0 |

A month stays a month and a year stays a year: Binders never makes a date more exact than you said. Months are numbers.

A **time**, `1987-06-14T21:30`, is read and kept, and orders scenes within one day. Binders shows only the day, and
editing the cell shows the time, so it isn't lost.

Scenes on the same day are ordered by their time, or by a whole number in a second property, `story-order` (1 for the
first). Binders will set it when you drag a scene within a day, and takes it away when a scene's date changes. Scenes with
neither stay in the binder's order.

The calendar is the ordinary (Gregorian) one.

## Dates that aren't dates

A value such as `sometime in spring` is left exactly as you typed it. The column shows it as it is, in muted text,
and it sorts with the undated notes, last. Binders never rewrites it unless you set a date on that note. Looking at,
sorting or closing a binder writes nothing.

## Putting a book in story order

Sort the outliner by **Story date**. Undated notes come last, whichever way the column runs. Then
**Make this the binder order** (right-click the header, or the view's menu) writes that order down for every folder in
view, as one change **Undo last change** takes back. The notes themselves aren't changed. See [Undo and redo](undo.md).

## Undo

Setting, changing or removing a story date is one step, however many notes it covers, and undoing it puts the file
back as it was: a month stays a month, and a note that had no date has none again. See [Undo and redo](undo.md).

## A different property

The property's name is in **Settings → Binders → Property names**, beside the synopsis, status, label and target. It
can't be one of the names Binders keeps for itself.

Obsidian's own **Date** property type is for a full day, such as `1987-06-14`. A month, a year alone and a year before
1 aren't days, so leave the property's type as **Text** if you write those.

Next: [Scene notes](scene-notes.md)
