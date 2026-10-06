# Labels, statuses and targets

Three things you can give a note or a folder to keep track of a book: a **label** (a color that means what you want
it to), a **status** (how far along the scene is) and a **target** (a word count to reach).

Each is an ordinary property of the note. See [How your files look](files.md).

## Labels

A label is a name and a color. Binders starts with eight: Red, Orange, Yellow, Green, Cyan, Blue, Purple and Pink.
Rename them to what the colors mean in your book: a point of view, a storyline, a timeline.

**To set one**, right-click a card or row and choose **Set label**, or use the **Label** field in the
[inspector](inspector.md). The menu has:

- your labels from settings, then any other labels the binder's notes already use;
- **Custom color...**, for a color on that note alone;
- **No label**;
- **Edit labels...**, which opens Binders' settings.

**Where a label shows:**

- as the border and tint of its card on the corkboard;
- as a dot in the outliner's Label column;
- as a dot beside the note in the file explorer (a setting turns the dots off);
- as the line its card is on when the corkboard is [arranged by label](corkboard.md#arrange-by-label).

**To change the list**, open **Settings → Binders → Labels**. Add, rename, recolor, reorder and delete labels
there. A color is one of your theme's own, or any color you pick with **Custom**. The button with the circular
arrow restores the default labels.

## Statuses

A status is a name. Binders starts with four, in the order a draft goes through them: Idea, Draft, Revised, Done.

**To set one**, right-click a card or row and choose **Set status**, or use the **Status** field in the inspector.
The menu has your statuses from settings, any others the binder's notes use, **New status...** for any other name,
and **No status**.

**To change the list**, open **Settings → Binders → Statuses**.

## Renaming a label or a status

A note has a label or a status when its property says that name. So when you rename one in settings, Binders asks
whether to rename it in the notes that have it too. Say no and those notes keep the old name, which is then no
longer in the list.

Deleting a label or a status from the list, or restoring the defaults, changes no notes. A note whose label or
status is no longer in the list keeps it and shows it as it's written.

## Targets

A target is a word count to reach, for a note, a folder or the whole binder.

- **A note or folder:** right-click its card or row and choose **Set target...**, or use the **Target** field in the
  inspector. Type a number, such as 1,500. Clear the field to take the target away.
- **The folder you're in:** click the word count in the binder view's toolbar. On the binder itself this sets the
  binder's own target. The command **Set word count target** does the same.

**Where a target shows:**

- on a note's card, as how far along it is;
- on folder headings;
- in the outliner's **Target** and **Progress** columns;
- in the toolbar, as "282 / 60,000 words" with a bar.

A folder with no target of its own shows its notes' targets added together in the outliner.

For a goal for one day's writing, see **Words to write today** in [Focus mode](focus-mode.md#word-counts-and-a-goal-for-the-day).

## How words are counted

Binders counts the words that end up in the book, so a card, a target and an export agree.

- **Not counted:** a note's properties, comments (`%%like this%%` and `<!-- like this -->`), the note name behind
  `[[Note|shown words]]`, a link's web address, a picture's description, list numbers, and lines that hold only tags.
- **Counted:** a footnote's text (once, however often it is marked), code, headings, table cells, a callout's title,
  and the words of a note you embed with `![[Note]]`.
- **Chapter titles:** a `# Heading` at the very top of a note that opens a chapter is the chapter's title, and isn't
  counted with its text. In a scene it is counted.
- **Chinese and Japanese** are counted a character at a time, as Obsidian counts them.
- **Notes left out of export** still show their own words and still count toward their folder's and the binder's
  totals. The Export window counts only what is exported, so its number can be lower.
- **The day's words** in focus mode follow the same rule.

To count as Obsidian's status bar does, turn off **Count words as the exported book does** in
[Settings](settings.md#word-counts). Changing it leaves the day's words as they were. A note with comments or links
shows fewer words with the setting on, so a target that was only just met can be just short.

## The filter

The **Filter** button in the binder view's toolbar shows only the notes with a given status or label, in all three
modes. See [The binder view](binder-view.md#the-filter).

## Using your own property names

If your notes already keep a synopsis, status, label or target under other property names, tell Binders under
**Settings → Binders → Property names**. See [Settings](settings.md#property-names).

Next: [Scene notes](scene-notes.md)
