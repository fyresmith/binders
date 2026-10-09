# Find and replace

Find a word across every note of a binder, and change it in one place or in all of them. Press **Ctrl+F** (**Cmd+F** on
a Mac) in a binder view: the same key as in a note, and the same bar.

- **In the manuscript** the bar is over the page in the column of the text, as Obsidian's own is. It looks through
  every note of the folder shown, in binder order, as one page. A match is brought into sight and selected in its
  section; the section becomes its editor to show it, and the keyboard stays in the bar.
- **On the corkboard and in the outliner** the bar is the width of the view. Nothing changes to the manuscript:
  the cards and rows whose note has a match stay as they are, and the rest step back. A card shows the line of its
  first match where its synopsis was, while the bar is open. A folder's card is lit when something in it matches,
  and the notes it lists that match are in bold. On the outliner a row says how many matches its note has at its
  end, and a folder's row adds up what is in it. **Next** and **Previous** go to the next lit card or row.
- **In a folder** the search is that folder's. In a note in a tab of its own it is Obsidian's own bar, as ever.

The bar counts as Obsidian's does (`3 / 12`) and says how many notes they are in. On the boards it says only how many
(`12 in 4 notes`): the card or row selected is the one you are on.

**Replace** is the bar's second row. It opens with Obsidian's own **Search and replace** key (Ctrl+H, with the cursor in a
manuscript section), the command **Find and replace in binder** or, on a phone, the view's **More options** menu.
**Match case** is the button beside Previous and Next. A query is always the text as you typed it: there are no
patterns, and no whole-word option.

## What a search looks through

- **Only the text of the notes.** Not the title, not the synopsis, not any property of a note, and not the binder
  note or the folder notes. Cards and rows show the text of a note only: a card's title or synopsis is not looked through.
- **Where a link leads is not text to change.** Searching `Mara` does not find the `Mara` in `[[Mara]]`,
  `[[Mara#Storm]]`, `![[Mara]]` or `[a link](Mara.md)`: changing it would break the link, and the note it leads to keeps
  its name. The words a link shows (`her` in `[[Mara|her]]`) are text and are found.
- **Tags are left alone the same way.** `Mara` does not find the `Mara` in `#Mara`.
- **Code and comments are not prose.** `Mara` in `` `Mara` ``, in a fenced block, in `%% a comment %%` and in
  `<!-- a comment -->` is not found.
- **To find or change one of these, type it as it is written.** `[[Mara` finds the links that start so (the plain,
  the aliased, the heading link and the embed); `#Mara` finds the tags; `` `Mara` `` the code; `%% Mara` the comment.
  A search that includes the mark reaches outside the part that is guarded, so it finds it as written.
- **No match runs across the end of one note and the start of the next.**

## Replace all

**Replace all** opens a review before it changes anything: how many places in how many notes, the notes in binder order on
the left, and each change on the right where it falls in its paragraph, the old words struck out and the new underlined
(so a link's target is seen not to change). Closing the review changes nothing.

Confirming it:

1. saves what is being typed in any note it will change,
2. takes a snapshot of the binder (or of the folder you are in) named for the replace, for example
   *Before replacing “Mara” with “Maren”*. An automatic snapshot, so it shows with the rest under **Show snapshots of the
   binder**, where it can be brought back,
3. changes each note, only at the matches. Every other character of every note is left as it was, and so is
   everything in the properties,
4. and leaves "Replaced 12 in 4 notes" in the bar, with **Undo**.

A note that is not what the review showed (you or another app changed it after the search) is left as it is, and the bar
counts it: "1 note was changed meanwhile, and left as it is". A replacement that would turn the start of a note into
properties (a note beginning with a line between two rules, made to read like properties) is left too, and counted.

**Undo** takes the replace back in every note that is still exactly what it left, and leaves any you have typed in since,
saying how many. In a note's section of the manuscript, **Ctrl+Z** also takes the change back there. Taking the
snapshot back is the other way, and goes further: **Show snapshots of the binder**, then **Bring back**.

A replace is never made in a binder that can't be changed (one made by a newer Binders), or one that can't have
snapshots: there is no replace row, and the bar says why. **Replace** (one match) is only offered in the manuscript,
where each match is in an editor; the boards offer Replace all only.

## In focus mode

With **Show the scenes before and after** on, **Ctrl+F** in a note in focus mode (in the manuscript, or in a tab of its
own) is Binders' bar over the shown part of the scene before, the note, and the shown part of the scene after. A match in a
neighbour is marked and scrolled to, but nothing is replaced there: the replace is made in the note only, and takes that
note's own snapshot, not the folder's. With those off, a note in its own tab keeps Obsidian's own bar.

## On a phone or a tablet

There is no Ctrl+F: use the view's **More options** menu, **Find in binder** or **Find and replace in binder**, or the
command palette. The buttons are the size of a finger, and the review opens as a sheet.

Matches in text a section shows without being an editor are marked with the browser's own highlights. Where there are
none (iOS before 17.2), each match is marked with a yellow background instead, put on and taken off with the search, and
the text itself is never changed.

## Commands

| Command | What it does |
|---|---|
| **Find in binder** | Opens the bar over the binder view in front |
| **Find and replace in binder** | The same, with the replace row |

Neither has a default key; Obsidian's own **Search current file** (Ctrl+F) and **Search and replace** open the same bar
wherever a binder view is in front.
