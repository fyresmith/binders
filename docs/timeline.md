# Timeline

The timeline shows the scenes of a binder, or of one of its folders, in the order they happen in the story. A scene
stands at its [story date](story-date.md); the scenes that have none wait in a tray. Every card carries its number in
the manuscript, so you can read story time against the order of telling: a flashback told late stands first on the
line with a high number on it.

![The timeline, with time running down](images/timeline.png)

Choose **Timeline** from the button at the top left of the binder view, or run **Show timeline**.

## Reading it

- **The cards** are the corkboard's: title, synopsis, status, word count, and the label as the card's color. The
  number before a title is the note's place in the manuscript, counted through the folder shown and the folders in
  it. The numbers are always on here.
- **The line** is not to scale. Each date gets the room its scenes need, so a week of daily scenes and a jump of ten
  years take about the same space.
- **Each year** has a heading, and stays in sight while you scroll through its dates. A date under it says its day
  and month. A scene dated only to a month stands at that month, before any day in it; one dated only to a year reads
  "In 1925".
- **A gap** is a stretch drawn short: the line breaks, and says how long it was ("5 months", "10 years"). A stretch
  is drawn as a gap when it is long beside the stretches around it, so the quiet years of a book are not a row of
  gaps, but the jump into them is one.
- **Scenes on one day** stand together, ordered by a time if you wrote one, then by `story-order`, then as the
  manuscript has them. See [Story date](story-date.md#how-it-is-written).
- **The tray**, headed **No date** with a count, holds the scenes with no story date, and those whose date isn't a
  date ("sometime in spring"), in the manuscript's order. Click its heading to fold it away. While no scene has a
  date, the tray is the whole page.

The timeline shows scenes only. A folder's own story date doesn't make a card.

## Time down, or across

**Arrange** in the toolbar chooses which way time runs. The same two choices are in the view's **More options** menu
and in the menu you get by right-clicking the board's empty ground.

- **Time down** is how it opens: each date is a row, its name beside the line and its cards beside that, as many to a
  row as fit. The tray is down the right side.
- **Time across** puts a card above or below the line at each date, the dates on the line and the years over the
  cards. A date with several scenes takes more of the line. The tray is along the foot. With nowhere to scroll down,
  the mouse wheel moves along the line.

![The timeline, with time running across](images/timeline-across.png)

The choice is kept with the view. A pane narrower than 520 px, and a phone, has time down only.

## Giving a scene a date

Right-click a card and choose **Set story date...**, then type the date the way you would say it: `14 June 1987`,
`June 1987`, `1987`. With several cards selected, all of them get it. **Remove story date** sends a card back to the
tray. Each is one step for **Undo** in the toolbar. The outliner's **Story date** column and the inspector's row do
the same; see [Story date](story-date.md#setting-one).

You can't yet drag a card to another date.

Looking at the timeline changes nothing: opening it, scrolling, filtering and switching its shape write to no note.

## Selecting and opening

As on the corkboard:

- Click a card to select it. Ctrl-click (Cmd-click on macOS) adds or removes one, and Shift-click selects from the
  last card clicked to this one, through story order. Drag across empty ground to select with a box.
- Double-click a card, or press Enter, to open its note. Ctrl+Enter opens it in a new tab.
- Click a selected card's synopsis to edit it in place; F2 renames the note.
- The arrow keys move through the scenes: Left and Right to the one before or after in story time, Up and Down to the
  nearest card that way. Home and End go to the first and last. Shift with an arrow extends the selection.
- The [inspector](inspector.md) shows the card you're on.

**New** in the toolbar makes a note at the end of the folder shown. It has no date, so it appears in the tray.

**Filter** works here as in the other modes: only the scenes with the statuses and labels you tick are shown, and the
numbers count the scenes that show. [Find](find-and-replace.md) lights the cards whose notes have a match.

**Card size** and **Tint cards with their label color**, in **More options**, are the corkboard's own settings and
are shared with it. A card here is one height at each size, so a long synopsis ends in an ellipsis.

## Limits

- Cards can't be dragged to set a date, and can't be dragged out of the view as files.
- The calendar is the ordinary (Gregorian) one.
- The timeline has no zoom: it is always as long as its cards need.
- In a [Longform project](longform.md) it shows the project's scenes, each read from its own note.
- On a phone or tablet, see [Phones and tablets](mobile.md#timeline).

Next: [The inspector and the contents](inspector.md)
