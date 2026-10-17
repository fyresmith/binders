# Story date

A **story date** says when a scene happens in the story, not when you wrote it. It is an ordinary property of the
note, `story-date`, so it is in the file you can read and in Obsidian's own Properties view. An outliner column
shows it, sorting by it puts the book in the order things happen, and the [timeline](timeline.md) lays the scenes
out along it.

## Setting one

Any of these sets it, for one note or for several selected together:

- the **Story date** column of the [outliner](outliner.md): select a row, click the cell, type, Enter;
- the **Story date** row of the [inspector](inspector.md);
- **More › Set story date...** in the menu of a card or row, on the [timeline](timeline.md) too (the menu is the way on a
  phone). **More › Remove story date** is there
  when a selected note has one;
- dragging a card on the [timeline](timeline.md#dragging): onto a date, into a gap, onto the tray;
- **More › Shift story dates...**, when more than one dated note is selected, moves them earlier or later by days, months or
  years, keeping the space between them.

Type it the way you would say it: `14 June 1987`, `June 14, 1987`, `June 1987`, `1987`, or in ISO shape,
`1987-06-14`. A year before 0 takes a minus: `-30`. Typing nothing takes the date away, and the property with it.
What isn't a date, or a day the month hasn't got (`30 February`), is refused with a notice that says why, and what you
typed stays in the field.

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

Scenes are ordered by date and time, then by a whole number in a second property, `story-order` (1 for the first),
among scenes with exactly the same date and time. Scenes with no time come before timed scenes on that day;
without a story order they stay in the binder's order. You can set `story-order` in Obsidian's Properties view.
Binders takes it away when a scene's date changes. Dragging a scene on the timeline sets its date or its place in a day.

Without a calendar of its own (below), a book's dates are in the ordinary calendar.

## A book's own calendar

A book can have its own months, leap days and eras: **Calendar...** in the timeline's **More options**, or the command
**Edit calendar...** (which opens the Calendar page of [Binder settings](binder-settings.md)). They are kept in the binder note (see [How your files look](files.md)), and every place that
shows or takes a story date uses them: the outliner, the inspector, **Set story date...**, the timeline, **Shift
story dates...** and filters.

- **Start from** offers ready-made calendars: the ordinary one, twelve months of 30 days, thirteen moons of 28 days,
  four seasons, and years only. Change the months from there: a name and a length each, moved by dragging the handle
  at the row's start (or with its menu, or Alt+Up and Alt+Down in the name).
- **Leap days**: "Add 1 day to Midsummer every 4 years, except every 100, unless every 400."
- **Eras** each have a name, a short name ("AL" by default, from the name's initials) and the year they begin. Their
  years count up from 1, or down to the next era, as BC does: an era that counts down can begin "from the start of
  time".

Type a date in the book's words: `14 Frost 802`, `Frost 802`, `802`, `14 Frost 12 LQ`, `LQ 12`, `30 BD`. It is
written in the same shape as any story date, the year on the book's one count and the month as its number in the
book's calendar:

| You typed | In the note | Shown |
|---|---|---|
| `14 Frost 802` | `story-date: 0802-11-14` | 14 Frost 802 AL |
| `14 Frost 12 LQ` | `story-date: 0814-11-14` | 14 Frost 12 LQ |
| `Midsummer 802` | `story-date: 0802-07` | Midsummer 802 AL |
| `30 BD` | `story-date: "-0029"` | 30 BD |

So a renamed month or era, or an era that begins in another year, changes no note: it only changes how dates read.
The dialog says, before anything is saved, how many dates would read differently and which notes would have a date
the new calendar hasn't got (they keep their dates as written, and wait in the timeline's tray). When months are
moved, **Move their dates with their months** (not ticked until you tick it) writes the dates in those months so they
keep their months, in the same step: one **Undo** takes the calendar and the dates back together. Saving the
calendar is one step for **Undo** too.

A date that isn't in the calendar is refused, and the notice says why: "Frost has 30 days.", "This book's calendar has
no month “Brumaire”.", "The Age of Lamps has 802 years: 900 AL isn't in it." In the ordinary calendar too: "February
has 28 days in 2001."

## Dates that aren't dates

A value such as `sometime in spring` is left exactly as you typed it. The column shows it as it is, in muted text,
and it sorts with the undated notes, last; on the timeline its scene waits in the tray. Binders never rewrites it
unless you set a date on that note. Looking at,
sorting or closing a binder writes nothing.

## Seeing the book in story time

The [timeline](timeline.md) is a mode of the binder view: the scenes along a line in the order they happen, each year
named, long stretches with nothing in them drawn short, and the undated scenes in a tray. Each card keeps its number
in the manuscript, so the two orders can be read against each other. A folder's own date isn't shown there.

## Putting a book in story order

Sort the outliner by **Story date**. Undated notes come last, whichever way the column runs. Then
**Make this the binder order** (right-click the header, or the view's menu) writes that order down for every folder in
view, as one change **Undo last change** takes back. The notes themselves aren't changed. See [Undo and redo](undo.md).

## Undo

Setting, changing or removing a story date is one step, however many notes it covers, and a drag on the timeline or
a shift is one step too; undoing it puts the file back as it was: a month stays a month, and a note that had no date
has none again. See [Undo and redo](undo.md).

## A different property

The property's name is in **Settings → Binders → Property names**, beside the synopsis, status, label and target. It
can't be one of the names Binders keeps for itself.

Obsidian's own **Date** property type is for a full day, such as `1987-06-14`. A month, a year alone and a year before
1 aren't days, so leave the property's type as **Text** if you write those.

Next: [Scene notes](scene-notes.md)
