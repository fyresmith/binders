# Changelog

All notable changes to Binders. Versions follow [semantic versioning](https://semver.org): see AGENTS.md for what
counts as a patch, minor or major change. Entries are added by `npm run ship`.

## 0.12.96 (2026-10-02)

### Fixed

- Words that arrived in a note from another device or program were counted as written today at the next key.
- Merging two notes written in today took their words off the day's count.

## 0.12.95 (2026-10-02)

### Fixed

- On a tablet, a task's box tapped in a manuscript section that wasn't an editor yet looked ticked but left the note unchanged.

## 0.12.94 (2026-10-02)

### Fixed

- On a phone, switching to the manuscript could leave the note you were on under the navigation bar, or open at the top of the book.

## 0.12.93 (2026-10-02)

### Added

- A screen reader is told where a card or row is after it is moved.

### Fixed

- The Filter button says when a filter is on.
- In a right-to-left interface the corkboard's arrow keys go the way they point.
- A word count target that is too big is refused with words that say why.

## 0.12.92 (2026-10-02)

### Fixed

- With very large text or in a very narrow pane, the view's name in the toolbar now gives way so that “New” is not pushed off the edge.

## 0.12.91 (2026-10-02)

### Changed

- Nothing a writer will notice: the plan no longer lists dropping a card on a folder in the breadcrumb as missing when arranged by label.

## 0.12.90 (2026-10-02)

### Changed

- Deleting many selected cards redraws the corkboard once, when they have all gone.

## 0.12.89 (2026-10-02)

### Added

- On the corkboard by label, a card dragged onto a folder in the breadcrumb moves out to that folder, as it does on the grid.

## 0.12.88 (2026-10-02)

### Changed

- Nothing a writer will notice: a helper that was written twice is written once, and two unused values are gone.

## 0.12.87 (2026-10-02)

### Changed

- In the outliner on a phone, a note several folders down keeps a readable width for its name: levels step in by less, and the title column widens with the depth shown.

## 0.12.86 (2026-10-02)

### Changed

- On a phone the outliner's rows and headers are 44 px tall, and a selected row with no synopsis offers “Add a synopsis”.

## 0.12.85 (2026-10-02)

### Fixed

- A synopsis or a title still being typed on a card, a row or under the toolbar is now saved when Obsidian quits.

## 0.12.84 (2026-10-02)

### Fixed

- Deleting hundreds of rows at once in the outliner no longer redraws after every note.

## 0.12.83 (2026-10-02)

### Changed

- Deleting several items with folders among them now says how many notes are in those folders.

### Fixed

- In a right-to-left interface, the arrow keys on an outliner row fold, unfold and go into its cells the mirrored way.
- Typing the name of the status, label, target or compile property under “Other property...” shows that column instead of adding a second one.

## 0.12.82 (2026-10-02)

### Fixed

- “No label”, “No status”, an emptied target or an empty synopsis no longer gives a folder a hidden folder note it has no use for.

## 0.12.81 (2026-10-02)

### Changed

- Nothing a writer will notice: comments on the helpers the views share.

## 0.12.80 (2026-10-02)

### Changed

- By touch in the outliner, the room above and below a name opens its note, a target's or property's whole cell edits it, and the room around a selected row's synopsis edits the synopsis.

## 0.12.79 (2026-10-02)

### Fixed

- On a phone or tablet, tapping the outliner's first row right after opening it no longer counts as keyboard focus.

## 0.12.78 (2026-10-02)

### Fixed

- Nothing a writer will notice: a test that looked in the vault's trash could read a note an earlier test had put there. The trash is now emptied between tests.

## 0.12.77 (2026-10-02)

### Fixed

- After “Move to” in a card's menu, the keyboard is on the card beside where the moved one was, not back on the board's first card.

## 0.12.76 (2026-10-02)

### Changed

- On a phone with the keyboard up and little room, the manuscript now runs under Obsidian's header as a note does, so a phone on its side has three lines or more to write in.

## 0.12.75 (2026-10-02)

### Changed

- Nothing a writer will notice: comments on the text helpers, and one line-ending helper where there were two.

## 0.12.74 (2026-10-02)

### Changed

- The menu item that lists a note's snapshots is “Show snapshots...” everywhere (it was “Snapshots...” in some menus).

## 0.12.73 (2026-10-02)

### Fixed

- “Show changes” on a note of thousands of paragraphs marks what changed, instead of showing every paragraph as taken out and put in.

## 0.12.72 (2026-10-02)

### Fixed

- A snapshot named with a number in brackets at the end, such as “Final draft (3)”, is listed under that whole name.

## 0.12.71 (2026-10-02)

### Fixed

- Splitting or duplicating a note whose name ends in a number with zeros in front keeps the zeros: “Scene 01” gives “Scene 02”, not “Scene 2”.

## 0.12.70 (2026-10-02)

### Fixed

- A link with other words to show, inside a table, now follows the text when notes are merged or split, instead of being left leading nowhere.

## 0.12.69 (2026-10-02)

### Fixed

- In settings, the color picker in each label's row now has a name for screen readers.

## 0.12.68 (2026-10-02)

### Fixed

- A note moved in the last moment before Obsidian quits, or before a phone puts the app away, is now written to the binder.

## 0.12.67 (2026-10-02)

### Fixed

- “Undo last move” run from a binder's view no longer takes back a move made in another binder that isn't on screen.

## 0.12.66 (2026-10-02)

### Changed

- In a light theme the ring around a selected card with a pale label (yellow, cyan, green, orange) is a little darker, so it can be seen.

## 0.12.65 (2026-10-02)

### Changed

- On phones and tablets the toolbar's buttons, the way up, a card's title and the manuscript's titles are finger-sized to the touch, with nothing moved.
- On a phone, a selected folder card with no synopsis offers “Add a synopsis”, as a note's card does.

### Fixed

- On a phone the line that shows where a carried card will land is drawn over the card instead of under it.

## 0.12.64 (2026-10-02)

### Fixed

- Obsidian's “Make a copy” of a folder in a binder now puts the copy right after the original, with its notes in the same order, instead of at the end of the binder in name order.

## 0.12.63 (2026-10-02)

### Fixed

- Taking a snapshot, compiling, merging or splitting no longer rewrites a note that is merely open in a tab: a file with Windows line breaks keeps them unless you type in it.

## 0.12.62 (2026-10-02)

### Changed

- Nothing a writer will notice yet: the manuscript keeps the cursor clear of anything that covers the top of its page.

## 0.12.61 (2026-10-02)

### Fixed

- In the manuscript, a section not yet turned into its editor hid the first paragraph of a note that opens with a rule.

## 0.12.60 (2026-10-02)

### Fixed

- “New status...” with nothing typed now stays open and says a status needs a name, as “New label” does; so does adding an outliner column by a property's name.

## 0.12.59 (2026-10-02)

### Fixed

- In the outliner, a row dragged onto a folder in the breadcrumb moves to the end of that folder, as a card on the corkboard does.

## 0.12.58 (2026-10-02)

### Fixed

- With several notes of a binder selected in the file explorer, the menu no longer offers two ways to make a folder of them. Binders' own, which keeps their place and order and can be undone, is the one shown.

## 0.12.57 (2026-10-02)

### Fixed

- Setting a status, label, target or synopsis on a note that opens with a rule (and has another further down) no longer deletes the paragraph between them: the properties are added above the note's text.
- A note saved with a byte-order mark keeps its properties when one is changed.

## 0.12.56 (2026-10-02)

### Fixed

- A row in the outliner, a card on the board by label, or a column being moved or resized no longer stays in hand when the mouse button was let go while another window was in front.

## 0.12.55 (2026-10-02)

### Fixed

- After switching to the outliner from the keyboard, the focus is on a row, where it shows.

## 0.12.54 (2026-10-02)

### Fixed

- In the outliner, moving a row to another folder from its menu leaves the keyboard on that row, or on the row beside where it was if it left the folder shown.

## 0.12.53 (2026-10-02)

### Fixed

- On a busy device, words typed and saved in a manuscript section could be taken off the page again when Obsidian finished indexing the note as it was before.

## 0.12.52 (2026-10-02)

### Fixed

- A note changed twice from outside while it had unsaved typing in the manuscript (a status then a label, or two writes from a sync) lost the first change. And a section stopped following its note after an Undo in the note's own tab.

## 0.12.51 (2026-10-02)

### Fixed

- If another plugin that also changes the file explorer was turned off, binders could fall back to name order until Obsidian was restarted. Binder order now returns by itself.

## 0.12.50 (2026-10-02)

### Changed

- Nothing a writer will notice: the file format document says what Binders takes for a note's properties, and what setting a property does to them.

## 0.12.49 (2026-10-02)

### Fixed

- An empty binder's corkboard no longer takes the keyboard from a note being typed in beside it when its first note arrives, and deleting the last card of a folder from the keyboard no longer drops the focus to the page.

## 0.12.48 (2026-10-02)

### Fixed

- A card or row being dragged when the window lost the focus no longer stays in hand and drops at the next click.

## 0.12.47 (2026-10-02)

### Fixed

- A folder's card no longer names a picture, a PDF or a canvas kept in the folder as if it were a note.

## 0.12.46 (2026-10-02)

### Added

- Nothing a writer will notice: the tests can run in several Obsidians at once, and the development guide covers the demo vault, the runner and how to run one unit test.

## 0.12.45 (2026-10-02)

### Fixed

- Renaming several notes in quick succession (a swap of two names, or a folder and a note in it) no longer leaves a note's snapshots under a name it no longer has, or mixes two notes' snapshots.

## 0.12.44 (2026-10-02)

### Fixed

- Dragging a selection of notes over a very large folder in the file explorer no longer stutters.

## 0.12.43 (2026-10-02)

### Fixed

- A note that opens with a rule and has another further down no longer loses the paragraph between them when it is merged, compiled or kept as a snapshot. Only a block that really is properties is treated as properties, the same way everywhere: merge, split, compile, synopsis from text, snapshots, the manuscript and focus mode.

## 0.12.42 (2026-10-02)

### Fixed

- On the corkboard by label with a filter on, a line's count now adds up the notes its folder cards show, not every note in those folders.

## 0.12.41 (2026-10-02)

### Fixed

- In Windows high contrast mode, the selected card or row and whatever has the keyboard are now outlined.

## 0.12.40 (2026-10-02)

### Changed

- Word counts on cards, what a folder's card holds and the outliner's last row are in the theme's muted text instead of its faintest.

## 0.12.39 (2026-10-02)

### Fixed

- Words typed while a note was still being saved could be left out when it was deleted, merged, duplicated, split, compiled or given a snapshot straight away: the note in the trash, the copy or the merged note lacked them. Binders now waits until everything typed is on disk first, in the manuscript and in a note's own tab.

## 0.12.38 (2026-10-02)

### Fixed

- Pointing at the Focus mode button in the manuscript's toolbar now shows its name in a wide pane too.

## 0.12.37 (2026-10-02)

### Fixed

- In the outliner, Escape in the Status or Label menu closes the menu and leaves the keyboard on that cell.

## 0.12.36 (2026-10-02)

### Fixed

- After Escape, Tab or Ctrl+Enter in the synopsis under the toolbar, the keyboard stays on the synopsis instead of dropping to the top of the window.

## 0.12.35 (2026-10-02)

### Fixed

- On a small phone on its side the toolbar had gone even with no keyboard up. It now steps aside only while you are typing, and is back as soon as you stop.

## 0.12.34 (2026-10-02)

### Changed

- On a phone, when the keyboard leaves the binder view only a few lines (a small phone, or any phone on its side), the toolbar steps aside for the page and comes back when the keyboard closes.

## 0.12.33 (2026-10-02)

### Changed

- The README's pictures show the plugin as it looks now, with new ones for arranging by label, snapshots and focus mode.

## 0.12.32 (2026-10-02)

### Fixed

- Nothing a writer will notice: stopping the tests part-way no longer leaves Obsidian running.

## 0.12.31 (2026-10-02)

### Added

- A demo vault for developers: npm run demo-vault makes binders of every size and oddity to try by hand, and every build installs itself into it.

### Changed

- Building the plugin now installs it into the test vault by itself.

## 0.12.30 (2026-10-02)

### Changed

- Nothing a writer will notice: three tests of the corkboard on a phone now describe the folder card as it has been since 0.12.17.

## 0.12.29 (2026-10-02)

### Fixed

- Sorting, hiding or showing an outliner column from the keyboard leaves the keyboard on that header instead of throwing it out to the rows.

## 0.12.28 (2026-10-02)

### Fixed

- Arranging the corkboard by label after a look at another mode keeps the card you had selected.

## 0.12.27 (2026-10-02)

### Fixed

- Looking at another mode and coming back no longer scrolls the outliner to its selected row: it is where you left it.

## 0.12.26 (2026-10-02)

### Changed

- No change to how Binders behaves: comments in the code were corrected and two unused functions removed.

## 0.12.25 (2026-10-02)

### Added

- The README has a troubleshooting section for the problems a writer is likely to meet.

## 0.12.24 (2026-10-02)

### Changed

- Nothing a writer will notice: editors now indent code with tabs as the code is, the working rules name the modules that hold Obsidian's undocumented parts, and an old design note says what became of it.

## 0.12.23 (2026-10-02)

### Changed

- Nothing a writer will notice: the plan says what is built and what was decided, and the README mentions Move to and dragging a card out of the view.

## 0.12.22 (2026-10-02)

### Changed

- Nothing a writer will notice: tests can now run Obsidian with a real hovering mouse, so hover styles and tooltips are checked.

## 0.12.21 (2026-10-02)

### Changed

- Nothing a writer will notice: the file format and internals documents now say exactly what the code does.

## 0.12.20 (2026-10-02)

### Changed

- The README describes every feature, command and setting as they are now, says what Binders writes to your files and what it never touches, and lists what isn't finished.

## 0.12.19 (2026-10-02)

### Fixed

- Pointing at the + at the end of the outliner's column headers now says “Columns”.

## 0.12.18 (2026-10-02)

### Added

- Nothing a writer will notice: a guide to how the code is laid out, for people who work on Binders.

## 0.12.17 (2026-10-02)

### Changed

- On the corkboard a folder's card is now a card like any other, with a folder icon and the names of the first things in it, each with its label color, in place of the drawn stack of cards.
- A folder with no synopsis gets one from Edit synopsis in its menu.

### Fixed

- Several cards dragged at once are drawn as one even pile.
- With a mouse, a folder card you are about to drop a card into now shows its ring and tint.

## 0.12.16 (2026-10-02)

### Changed

- Nothing you'll notice: the corkboard and the board by label share the same code for numbering and counting cards.

## 0.12.15 (2026-10-02)

### Changed

- Nothing you'll notice: two text rules are now tested on their own.

## 0.12.14 (2026-10-02)

### Changed

- Nothing you'll notice: the outliner's column menus, resizing and reordering now live in their own file, with a test that a column drag leaves nothing behind when the mode changes.

## 0.12.13 (2026-10-02)

### Changed

- Nothing you'll notice: the code that undoes moves now lives in its own file.

## 0.12.12 (2026-10-02)

### Changed

- Nothing a writer will notice: what the last full test round found, and what is still open, is written down.

## 0.12.11 (2026-10-02)

### Changed

- Nothing a writer will notice: tests for things known to be unfinished are listed, and reported apart from real failures.

## 0.12.10 (2026-10-02)

### Changed

- Nothing a writer will notice: a test now expects the binder's note to take its folder's new name, as it has since 0.9.

## 0.12.9 (2026-10-02)

### Fixed

- After a manuscript showing a note with Windows line endings was closed, words typed in that note's own tab in the next two seconds could be taken out again. They stay now.
- A note with Windows line endings that is only shown in the manuscript, and not typed in, is no longer written again with other line endings.

## 0.12.8 (2026-10-02)

### Changed

- The Snapshots dialog is cleaner: one aligned row of controls, dates that read at a glance, changes shown in the text itself, and a button that takes a snapshot from the list.

## 0.12.7 (2026-10-02)

### Changed

- The corkboard's Arrange menu always lists the same choices: in a grid, by label across or by label down, each one click away. The button's icon shows which is on.

## 0.12.6 (2026-10-02)

### Changed

- Nothing a writer will notice: the project's notes for contributors say what is built and what is left.

## 0.12.5 (2026-10-02)

### Changed

- Nothing a writer will notice: three small cleanups in the code that the checks pointed out.

## 0.12.4 (2026-10-02)

### Changed

- On the corkboard by label, each line now runs from the edge of the pane through its head.

### Fixed

- Hovering the corkboard by label or the outliner no longer shows a tooltip at the bottom of the view.

## 0.12.3 (2026-10-02)

### Fixed

- Undo in the manuscript no longer removes or garbles text that another app or sync changed while you were elsewhere.

## 0.12.2 (2026-10-02)

### Changed

- On the corkboard by label, each line now starts at a head in its color, holding the label's name and count, and runs to the far edge of the pane at any size.

## 0.12.1 (2026-10-02)

### Added

- Notes of a binder have a Snapshots button in their header, to the right of the focus mode button: take a snapshot, rewrite, or see the snapshots.

## 0.12.0 (2026-10-02)

### Added

- Focus mode has an "Enter fullscreen" option, off to begin with: it takes the whole screen and gives it back when you leave.

### Changed

- "Dim other paragraphs" is on by default in focus mode. If you have changed Binders' settings before, yours stay as they are.

## 0.11.3 (2026-10-02)

### Changed

- A test now expects a binder moved into another to keep the order of its scenes and folders.

## 0.11.2 (2026-10-02)

### Fixed

- Splitting a scene no longer restores text from an earlier save while the new draft is being written.

## 0.11.1 (2026-10-02)

### Fixed

- Deleting a note stops if its latest writing cannot be saved.

## 0.11.0 (2026-10-02)

### Added

- Drag a card or an outliner row out of the binder view: onto the file explorer to move it, a note to link it, a canvas, a tab or the bookmarks.

### Changed

- Folders in a binder spring open in the file explorer when something is dragged over them.

## 0.10.16 (2026-10-02)

### Changed

- Expanded automated checks cover phone and tablet navigation, editing, ordering, dialogs and the integrated features.

## 0.10.15 (2026-10-02)

### Fixed

- The manuscript stays inside its pane on small phones with the keyboard open and on phones turned sideways, including focus mode.

## 0.10.14 (2026-10-02)

### Fixed

- The manuscript scrolls its cursor into view when the phone keyboard opens, before another key is typed.

## 0.10.13 (2026-10-02)

### Fixed

- The Arrange button stays an icon in narrow panes so the corkboard toolbar fits on phones turned sideways.

## 0.10.12 (2026-10-02)

### Fixed

- Long card and row menus scroll within the screen on tablets and desktops.

## 0.10.11 (2026-10-02)

### Fixed

- Automated checks connect only to their own throwaway vault, even when several checks run together.

## 0.10.10 (2026-10-02)

### Fixed

- A note copied while a previous move is still saving appears directly after its original.

## 0.10.9 (2026-10-02)

### Fixed

- Moving a whole binder into another binder keeps its scenes in their previous order.

## 0.10.8 (2026-10-02)

### Fixed

- The Words column has room for its heading when the phone uses larger text.

## 0.10.7 (2026-10-02)

### Fixed

- Switching to the manuscript keeps the cursor in the selected scene while its editor loads.

## 0.10.6 (2026-10-02)

### Fixed

- Switching from a nested manuscript scene or outliner row to the corkboard selects its containing folder card.

## 0.10.5 (2026-10-02)

### Fixed

- A newly named folder stays selected on the corkboard, so Enter opens that folder.

## 0.10.4 (2026-10-02)

### Fixed

- The corkboard keeps keyboard focus when selected cards leave the board after a move.

## 0.10.3 (2026-10-02)

### Fixed

- Scenes created from the file explorer appear ready to name, including scenes inside a folder on phones.

## 0.10.2 (2026-10-02)

### Fixed

- Commands wait for manuscript writes already in progress, and pending text is saved when the app goes into the background.

## 0.10.1 (2026-10-02)

### Fixed

- A split refuses to remove text if the note changes while the new note is being saved.

## 0.10.0 (2026-10-02)

### Added

- Focus on a binder note or manuscript with optional scene context, word counts, daily goals and paragraph dimming.

### Changed

- Requires Obsidian 1.8.7 or later.

## 0.9.8 (2026-10-02)

### Added

- Take snapshots before rewriting, compare earlier drafts, and bring text back with the replaced draft kept safely.

## 0.9.7 (2026-10-01)

### Added

- Arrange corkboard cards along label lines to see how story threads interleave, and drag to change their label and order together.

## 0.9.6 (2026-10-01)

### Changed

- Design rounds build and refine in the real plugin again; the saving comes from settling questions first and looking more cheaply.

## 0.9.5 (2026-10-01)

### Changed

- Design rounds now go in stages (questions, one sheet of options, then one build), and what makes Binders look native is written down in one place.

## 0.9.4 (2026-10-01)

### Changed

- The roadmap now has import from a Scrivener project after export, and the Scrivener export's open questions are answered.

## 0.9.3 (2026-10-01)

### Changed

- The roadmap's export now includes a Scrivener project, alongside EPUB, DOCX and PDF.

## 0.9.2 (2026-10-01)

### Added

- Agents working on Binders now have named roles (developer, QA, designer) instead of one generic label.

## 0.9.1 (2026-10-01)

### Added

- For contributors: agents keep a short progress memo per ticket (npm run memo), described in AGENTS.md.

## 0.9.0 (2026-10-01)

### Added

- “Move to” in a card's or row's menu: every folder of the binder, to move the selection to.
- Drop cards on a folder in the breadcrumb to move them out to it.
- “New binder”, as a command and in the file explorer's menu, and “Open binder” in a binder note's menu.
- “Select more” in a card's or row's menu on a phone or tablet, to select several by touch; Undo and Redo of the last move in the view's More options.
- Compile remembers where each folder was last compiled to.

### Changed

- The corkboard shows one folder at a time: every note and folder in it is a card in one grid, in binder order. A folder is a stack you double-click to go into, and the breadcrumb leads back out. The option to show subfolders as stacks is gone, since it is always so.
- One “New note” tile ends the board, the size of a card, and the toolbar's New makes a note after the selected card.
- A selected card has a ring in its own label color instead of the accent color, and labeled cards are tinted faintly by default, as cards on a canvas are. A labeled folder's stack is colored all the way through.
- In the file explorer a click that opens a folder's view no longer folds the folder, and a binder's note follows its folder's name when the folder is renamed.
- Dialogs are Obsidian's own confirmation sheets on a phone, with Cancel last; the filter's sheet stays open while you tick; target fields ask for a number pad.

### Fixed

- What you are typing is saved when the app goes to the background, and typing during a slow save is no longer lost.
- In the manuscript, a tap in another section after the cursor sat at the edge of a wrapped line no longer leaves the typing in the first note; the page keeps its place when you switch mode and come back.
- On a phone, new notes, renamed cards and revealed cards no longer end up under Obsidian's button bar; the navigation bar's Back lights up inside a binder; a long press that wobbles still opens the menu.
- Undoing a move of several notes puts each back in its own place, and an undo that can't be made no longer blocks the ones before it.

## 0.8.0 (2026-10-01)

### Added

- An outliner: the binder as a table of titles, synopses, labels, statuses, word counts and targets, with columns you choose, sorting, folding, and dragging to reorder.
- Labels and statuses are yours to set: rename them, pick their colors, or give one note a custom color, in Binders' settings and from any card or row.
- Word targets for a note, a folder or the whole binder, with progress on cards, rows and the toolbar.
- Scene tools: split a note at the cursor, merge notes, duplicate, put notes in a new folder or ungroup one, fill a synopsis from the text, and compile a folder into one note.
- Undo and redo for moves made by hand, in the binder view and the file explorer.
- New binder in the file explorer's menu, beside New note and New folder.
- The filter works in the manuscript too, and a folder's name can be changed where it stands there.

### Changed

- A new look for cards, after Obsidian's canvas: a label colors the card's border and faintly its face, and a selected card has a ring in its own color.
- In the file explorer a binder says “binder” at the end of its row, the folder a binder view shows is marked like the open note, and a click that opens a folder's view no longer folds it.
- The manuscript keeps its place and its cursor more reliably, saves a section as soon as you leave it, and moves less when a section turns into its editor.

### Removed

- The plot grid, in favor of the outliner.

## 0.7.0 (2026-10-01)

### Added

- Screenshots and a fuller guide in the README.

### Changed

- The binder view works on phones and tablets, follows your theme's colors, fonts and corners, can be used from the keyboard and with a screen reader, and stays quick in binders of a thousand notes.

## 0.6.31 (2026-09-30)

### Fixed

- Typing in the manuscript and in the same note in another tab no longer doubles text when you switch between them quickly.

## 0.6.30 (2026-09-30)

### Fixed

- Opening a binder's manuscript in a split or second tab while typing in another no longer loses or doubles what you typed.

## 0.6.29 (2026-09-30)

### Fixed

- Typing in the manuscript is no longer lost if you quit Obsidian within two seconds of your last keystroke.

## 0.6.28 (2026-09-30)

### Fixed

- A folder moved from one binder to another keeps the order of its notes.

## 0.6.27 (2026-09-30)

### Fixed

- Renaming a folder to the name of a note inside it no longer fails; if the names clash, both notes are left as they are.

## 0.6.26 (2026-09-30)

### Fixed

- A binder moved out of another binder, or a binder note or Longform index moved into a folder, is recognised right away.

## 0.6.25 (2026-09-30)

### Fixed

- Moving a binder note into another folder by mistake no longer wipes the binder's order; moving it back restores it.

## 0.6.24 (2026-09-30)

### Fixed

- “Make this folder a binder” no longer overwrites a folder note's own “contents” property; it explains why it can't go ahead instead.

## 0.6.23 (2026-09-30)

### Fixed

- Move down now works past images and other files in a binder, and drops next to them land in the right place.

## 0.6.22 (2026-09-30)

### Fixed

- A note or folder moved to another folder of its binder goes to the end of that folder, as one moved in from outside does.

## 0.6.21 (2026-09-30)

### Fixed

- Notes whose names end in “.md” (like notes.md.md) keep their place.

## 0.6.20 (2026-09-30)

### Fixed

- A note whose name looks like a number (such as 1984), typed into the list by hand, keeps its place.

## 0.6.19 (2026-09-30)

### Added

- Drop a note on a stack to move it into that folder.

## 0.6.18 (2026-09-30)

### Added

- Rename a folder from its heading's menu.

## 0.6.17 (2026-09-30)

### Fixed

- In narrow panes, folder names stay readable; counts give way first.

## 0.6.16 (2026-09-30)

### Changed

- The New note button is smaller and quieter.

## 0.6.15 (2026-09-30)

### Fixed

- Stacks line up with note cards.

## 0.6.14 (2026-09-30)

### Fixed

- A card partly out of view scrolls into view when you edit it.

## 0.6.13 (2026-09-30)

### Fixed

- Statuses appear the same way everywhere, as you wrote them.

## 0.6.12 (2026-09-30)

### Added

- Middle-click a card or folder heading to open it in a new tab.

## 0.6.11 (2026-09-30)

### Changed

- Cards show when you point at them.

## 0.6.10 (2026-09-30)

### Fixed

- On phones, the last cards are no longer hidden under the navigation bar.

## 0.6.9 (2026-09-30)

### Fixed

- Back returns to a folder even after it was renamed.

## 0.6.8 (2026-09-30)

### Fixed

- After deleting a card, the next card has the focus, so the keyboard keeps working.

## 0.6.7 (2026-09-30)

### Fixed

- Escape cancels a card drag, as in the file explorer.

## 0.6.6 (2026-09-30)

### Fixed

- If a new note can't be made, the title you typed stays in the field.

## 0.6.5 (2026-09-30)

### Fixed

- A note made while a filter is on stays on the board until you change the filter.

## 0.6.4 (2026-09-30)

### Fixed

- With a filter on, moving a card up or down steps past the cards you can see and leaves hidden notes where they are.

## 0.6.3 (2026-09-30)

### Fixed

- Note names can't start with a dot, which would make a hidden file Obsidian doesn't show.

## 0.6.2 (2026-09-30)

### Fixed

- Renaming a note to its folder's name, or a folder to the name of a note in it, is refused instead of hiding the note.

## 0.6.1 (2026-09-30)

### Fixed

- Moving a note into a folder with the same name is refused, so the note no longer turns into that folder's note and disappears.

## 0.6.0 (2026-09-30)

### Added

- Longform projects show as binders in the file explorer, the corkboard, the plot grid and the manuscript; reordering writes only Longform's own scene list.
- Convert to binder: turns a Longform project into a binder, optionally moving its groups into folders.

## 0.5.0 (2026-09-30)

### Added

- The binder view: click a binder to open it, with breadcrumbs, word count and target, and a switch between corkboard, plot grid and manuscript.
- The corkboard: index cards in binder order, with editable synopses, status and label, drag to reorder or move between folders, new cards, and a full right-click menu.

## 0.4.1 (2026-09-30)

### Changed

- Binders now needs Obsidian 1.6.6 or later.

## 0.4.0 (2026-09-30)

### Added

- The manuscript: every scene in a folder as one continuous page you can edit, with changes saved to each note and edits made elsewhere merged in.

## 0.3.3 (2026-09-30)

### Fixed

- In the plot grid, a scene can be dropped last in the folder even when the last row is inside a subfolder.

## 0.3.2 (2026-09-30)

### Fixed

- Renaming or deleting a plotline now renames or removes its text in each scene's plot property.

## 0.3.1 (2026-09-30)

### Changed

- Internal: property edits apply to the note as written, not a cached copy.

## 0.3.0 (2026-09-30)

### Added

- A plot grid of scenes against plotlines: toggle cells, add, rename, color, reorder and delete plotlines, and drag scenes into a new order.

## 0.2.3 (2026-09-30)

### Fixed

- Internal: end-to-end tests can now press Obsidian hotkeys.

## 0.2.2 (2026-09-30)

### Changed

- Internal: proof that the manuscript can edit notes in place safely, and the notes for building it.

## 0.2.1 (2026-09-30)

### Changed

- Internal: the contract the corkboard, plot grid and manuscript views share.

## 0.2.0 (2026-09-30)

### Added

- Binders are found and kept in order as notes and folders are renamed, moved or deleted.
- Commands and right-click menu items: Make this folder a binder, New scene here, Move up, Move down.
- Settings to hide binder and folder notes, and to rename the synopsis, status, label and plotlines properties.

### Changed

- Renaming a subfolder in a binder also renames its folder note, so it stays the folder's note.

## 0.1.3 (2026-09-30)

### Added

- Binders show in their own order in the file explorer, with a binder icon; binder and folder notes are hidden; clicking a binder folder will open it.

## 0.1.2 (2026-09-30)

### Added

- The plot property is reserved for text per plotline in the plot grid.

### Changed

- Subfolders get a hidden folder note for their synopsis, status and label; binder and folder notes are hidden in the explorer by default; mobile is required for 1.0.

## 0.1.1 (2026-09-30)

### Added

- CLAUDE.md: where the project stands, decisions so far, and the open questions to settle first.

## 0.1.0 (2026-09-30)

### Added

- Project scaffold: build, lint, unit and end-to-end tests, release workflow with build attestations, and documentation.
- The binder format (version 1) and its model: reading a binder note's table of contents, ordering a folder's
  children, and following renames, removals and moves. Binder notes from a newer version are refused, never rewritten.
- Plugin settings for the file explorer (not used yet).
