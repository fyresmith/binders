# Changelog

All notable changes to Binders. Versions follow [semantic versioning](https://semver.org): see AGENTS.md for what
counts as a patch, minor or major change. Entries are added by `npm run ship`.

## 0.47.0 (2026-10-09)

### Changed

- Tab on a line that already holds its tab and nothing else adds no second one, so Enter then Tab gives each paragraph one tab.

## 0.46.32 (2026-10-09)

### Changed

- The manual says how to start a paragraph with a tab on a phone: the Indent button of Obsidian's toolbar over the keyboard.

## 0.46.31 (2026-10-09)

### Fixed

- A tabbed line straight under a line of text is set in in the manuscript's text, the Snapshots window and focus mode, as it is in the editor.

## 0.46.30 (2026-10-09)

### Fixed

- In a long note, tab paragraphs no longer flash with a guide line and jump sideways when the page is put back where you left it or you jump far into the note.

## 0.46.29 (2026-10-09)

### Fixed

- An open reading view follows both paragraph settings, and a note moved into or out of a binder, without opening the note again.

## 0.46.28 (2026-10-09)

### Fixed

- "Indent paragraphs" now works in the manuscript's sections shown as text, the Snapshots window and focus mode's scenes before and after.

## 0.46.27 (2026-10-09)

### Fixed

- A binder's note that is open when Obsidian starts, or moved into a binder while open, shows its tab paragraphs at once, not at the next click or key.

## 0.46.26 (2026-10-09)

### Fixed

- With "Indent paragraphs" on, the cursor on a new line after a paragraph waits at the indent, so the first letter doesn't jump.

## 0.46.25 (2026-10-09)

### Fixed

- Tab on an empty line in a binder's note, and the tab Enter carries on, is drawn as the paragraph's indent at once: no guide line, and the cursor no longer moves sideways when the first letter is typed. Four spaces fill the indent as a tab does.

## 0.46.24 (2026-10-09)

### Changed

- Nothing a writer will notice: which model the designer role runs on.

## 0.46.23 (2026-10-09)

### Fixed

- In the manuscript, a word longer than the column no longer runs off the edge of a section shown as plain text (on a phone, every section until it is tapped); it wraps there as it does in the editor.

## 0.46.22 (2026-10-09)

### Fixed

- Bringing back everything from a snapshot of a folder no longer makes again a note that was moved to another folder of the binder. The screen lists it under what is left as it is, with where it is now, and says if its text has changed.

## 0.46.21 (2026-10-09)

### Fixed

- Bringing back everything no longer makes a second copy of a short note that was renamed after Obsidian rewrote the links in it; the renamed note gets its name back, as longer notes already did.

## 0.46.20 (2026-10-09)

### Fixed

- In a snapshot's Show changes, a paragraph that starts with a tab is indented as it is in the note, instead of sitting flush left.

## 0.46.19 (2026-10-09)

### Changed

- Nothing a writer will notice: which model each kind of ticket runs on.

## 0.46.18 (2026-10-09)

### Changed

- Nothing a writer will notice: which model each agent role runs on.

## 0.46.17 (2026-10-09)

### Fixed

- A paragraph begun with a tab, exported to a Scrivener project and imported again, comes back with its tab when "Start a paragraph with a tab" is on.

## 0.46.16 (2026-10-09)

### Added

- Since 0.44.16: "Bring back..." on a snapshot of a folder or the binder (the text and the order, or everything), and the last round of fixes to Export, on a computer, a phone and a tablet.

## 0.46.15 (2026-10-09)

### Changed

- Nothing a writer sees: one test of export styles now tests what Binders promises, and two round-trip findings through Scrivener are listed as open.

## 0.46.14 (2026-10-09)

### Changed

- The manual now says that a note with Windows line breaks or a byte-order mark, brought back while it is open in an editor, gets every word and line back and is then saved by Obsidian's editor with its own line breaks, as any note you type in is.

## 0.46.13 (2026-10-09)

### Changed

- Nothing a writer sees: a round-trip test now accepts the vault's own spelling of a status.

## 0.46.12 (2026-10-09)

### Fixed

- A table that went out to a Scrivener project comes back as a table, with its rows together, instead of with a blank line between each row.

## 0.46.11 (2026-10-09)

### Changed

- Nothing a writer sees: tests written before "Everything" became the screen's first choice now choose their scope.

## 0.46.10 (2026-10-09)

### Fixed

- On a phone turned on its side, the Bring back screen puts its two buttons in one row and shows the start of what will change without scrolling.

## 0.46.9 (2026-10-09)

### Fixed

- On a phone, a long note name with no spaces now wraps in the Bring back screen instead of running off the edge.

## 0.46.8 (2026-10-09)

### Fixed

- A style file deleted outside Binders while a change to it was waiting no longer comes back or shows an error in the console.

## 0.46.7 (2026-10-09)

### Fixed

- Two comments in a row inside a sentence leave one space in the exported book, not two.

## 0.46.6 (2026-10-09)

### Fixed

- A binder that was moved or renamed since its last export no longer asks to replace its own exported file. Two binders with the same name are still asked.

## 0.46.5 (2026-10-09)

### Fixed

- On a phone, the Export window of an empty binder now says "Nothing to export" above its Export button, as it does on a computer.

## 0.46.4 (2026-10-09)

### Changed

- Nothing a writer sees: the style editor's sliders are the size of Obsidian's own, and the test now says so.

## 0.46.3 (2026-10-09)

### Fixed

- On a phone, a title too wide for an ebook's preview page breaks onto the next line instead of running off the page's edge.

## 0.46.2 (2026-10-09)

### Fixed

- On a phone, a long chapter name in Export's Contents wraps onto a second line instead of being cut off by its chapter label.

## 0.46.1 (2026-10-09)

### Changed

- Nothing a writer sees: seven test scenarios that failed on their own steps are taken out.

## 0.46.0 (2026-10-09)

### Added

- "Bring back..." on a snapshot of a folder or binder can now bring back everything: each note as it was with its properties, notes and folders that are gone made again, and renamed or moved ones put back. Nothing is deleted; what is new since stays where it is, or goes into one folder if you choose.
- If Obsidian closes while a snapshot is being brought back, Binders says so the next time it opens and offers to finish or to put things back as they were.

### Changed

- The "Bring back..." screen now opens on "Everything"; "The text and the order" is still there.

## 0.45.22 (2026-10-09)

### Changed

- Nothing a writer sees: a test's name.

## 0.45.21 (2026-10-09)

### Fixed

- Reordering a Longform project that has scenes indented under others no longer makes the sidebar's Contents list fail.

## 0.45.20 (2026-10-09)

### Fixed

- "Export again" on a binder whose notes have all gone, or are all left out, now says there is nothing to export and leaves the earlier file as it is.

## 0.45.19 (2026-10-09)

### Changed

- Nothing a writer sees: six new sets of tests, with the bugs they found left failing until each is fixed.

## 0.45.18 (2026-10-09)

### Changed

- Nothing a writer sees: the roadmap says export's QA round is finished, and what is still to be checked in other programs.

## 0.45.17 (2026-10-09)

### Changed

- Nothing a writer sees: the design notes for export say how the QA round's fixes work.

## 0.45.16 (2026-10-09)

### Fixed

- On a phone or tablet, the role at the end of a Contents row is large enough to tap.

## 0.45.15 (2026-10-09)

### Fixed

- When two books would save a file of the same name into one Exports folder, Export now asks before replacing the other book's file.

## 0.45.14 (2026-10-09)

### Fixed

- Export is turned off, and says why, when a binder has no notes or all of them are left out.

## 0.45.13 (2026-10-09)

### Fixed

- A manuscript's title page no longer says "about 100 words" for a book with no words.

## 0.45.12 (2026-10-09)

### Fixed

- A comment inside a sentence no longer leaves a double space in the exported book.

## 0.45.11 (2026-10-09)

### Changed

- Nothing a writer sees: a round of tests over every kind of export, on a computer, a phone and a tablet.

## 0.45.10 (2026-10-09)

### Changed

- Nothing a writer sees: the design notes for export say how the last fixes work.

## 0.45.9 (2026-10-09)

### Fixed

- With many things to look at, the Export window's sidebar scrolls instead of running off the window.

## 0.45.8 (2026-10-09)

### Fixed

- The warning that a typeface lacks a book's letters goes away when you choose another kind or change the style's typeface.

## 0.45.7 (2026-10-09)

### Fixed

- The Export window follows the page size and the style when they change in the binder's note while it is open.

## 0.45.6 (2026-10-09)

### Fixed

- Cancelling an export, or closing the Export window, while a PDF is being printed now stops the printing at once.

## 0.45.5 (2026-10-09)

### Fixed

- The Export window no longer checks whether Obsidian can print each time it redraws.

## 0.45.4 (2026-10-09)

### Fixed

- Changing a style while it is being renamed no longer leaves a second style under the old name.

## 0.45.3 (2026-10-09)

### Fixed

- Changing a style no longer overwrites a change made to its file a moment before by sync or another program.

## 0.45.2 (2026-10-09)

### Fixed

- Deleting a style no longer removes lines Binders couldn't read from the styles based on it.

## 0.45.1 (2026-10-09)

### Fixed

- Importing a Scrivener project that Binders exported no longer warns of a colour clash on every label or makes a second set of labels.

## 0.45.0 (2026-10-09)

### Added

- "Bring back..." on a snapshot of a folder or the binder puts back the text of the notes that are still there, the order of the items, or both. A screen first says what will change and what is left as it is. A snapshot of everything as it is now is taken first, so it can be taken back.

### Changed

- Bringing back a folder's snapshot never makes, renames, moves or deletes a note, and leaves properties as they are; a note that changes while it is being brought back is left alone and named.

## 0.44.17 (2026-10-09)

### Changed

- Nothing a writer sees: the contributors' rules and the roadmap now say what bringing back a whole snapshot may do, and what is left of it to build.

## 0.44.16 (2026-10-07)

### Fixed

- This release carries the fix for the Folder notes plugin: with it on, clicking a binder or a folder inside one opens the binder view, not the folder's note.

## 0.44.15 (2026-10-07)

### Fixed

- With the Folder notes plugin on, clicking a binder or a folder inside one in the file explorer opens the binder view again, not the folder's note. Folders outside binders still open their folder notes.

## 0.44.14 (2026-10-07)

### Fixed

- Nothing you'll notice: a style rewrite from 0.44.9 that Obsidian's plugin review counted twice is undone.

## 0.44.13 (2026-10-07)

### Fixed

- Nothing you'll notice: four more lines of code that Obsidian's plugin review flagged are written the way it prefers.

## 0.44.12 (2026-10-07)

### Fixed

- Nothing you'll notice: this release carries the code and style clean-ups that Obsidian's plugin review asked for.

## 0.44.11 (2026-10-07)

### Fixed

- Nothing you'll notice: the remaining style rules Obsidian's plugin review flagged for performance were replaced.

## 0.44.10 (2026-10-07)

### Fixed

- Nothing you'll notice: three style rules were rewritten in a form Obsidian's plugin review prefers.

## 0.44.9 (2026-10-07)

### Fixed

- Nothing a writer will notice: a few lines of code and style that Obsidian's plugin review flagged are written the way it prefers.

## 0.44.8 (2026-10-06)

### Changed

- Nothing a writer will notice: releases are published as full releases, which Obsidian's directory can see, and no longer as pre-releases.

## 0.44.7 (2026-10-06)

### Changed

- The README and the manual say how to install Binders from Obsidian's community plugins, with a link to its page there.

## 0.44.6 (2026-10-06)

### Changed

- Nothing a writer will notice: the plugin's manifest keeps the version of the last release between releases, so installing never looks for a release that isn't there.

## 0.44.5 (2026-10-06)

### Changed

- Nothing a writer will notice: the project's notes for its developers say the first beta is released.

## 0.44.4 (2026-10-06)

### Added

- The first public beta of Binders. A folder becomes a binder: its notes and folders keep the order you give them, in Obsidian's own file explorer, and open as a corkboard, an outliner, or the whole manuscript as one page you can write in.
- In this beta: labels, statuses and word count targets; an inspector and the book's contents in the sidebar; split, merge, duplicate and group; snapshots of a scene, a folder or the whole binder; focus mode; export as a manuscript (Word or PDF), an ebook, a print-ready paperback PDF, a Scrivener project or one note, with styles you can change; import from Scrivener; Longform projects; phones and tablets.
- Install it with BRAT (`fyresmith/binders`) or by hand from this release's three files. It is not in Obsidian's community directory yet.

### Changed

- Be careful of: Binders is tested on Linux and in Obsidian's emulation of a phone and a tablet. It has not been tried on a real phone, on macOS or on Windows. The exported Word file, ebook and PDF have not been opened in Word, Kindle Previewer or Apple Books, or sent to a printer. Keep a backup of your vault, and say what you find in the issue tracker. The manual's "Known limitations" has the full list.

## 0.44.3 (2026-10-06)

### Fixed

- In the style editor, a slider shows its value once ("11 pt"), not twice ("11 pt 11.00").

## 0.44.2 (2026-10-06)

### Fixed

- On a phone, the binder view's title is centred again: the Snapshots button is no longer in the header there, and Take a snapshot and Show snapshots... are under More options. Tablets and computers keep the button.

## 0.44.1 (2026-10-06)

### Fixed

- Nothing a writer will notice: older tests expect what has been built since they were written, and two phone and tablet tests now run at the screen sizes they name.

## 0.44.0 (2026-10-06)

### Changed

- A book in Russian, Ukrainian, Bulgarian, Serbian, Belarusian, Macedonian, Kazakh, Mongolian or Greek in the Modern style is set in Source Serif itself, not in the computer's own serif, and the Export window no longer warns about it. A Greek or Cyrillic word in any Modern book uses Source Serif's letters too.

## 0.43.3 (2026-10-06)

### Fixed

- The Modern style's typeface, Source Serif 4, is now carried exactly as Adobe released it, as its licence asks. Pages in Modern are set as they were; the plugin's file is about 220 kB larger.

## 0.43.2 (2026-10-06)

### Changed

- The manual has pages for the paperback PDF and export styles, says what has not been tried yet, and has new pictures; the README says how to install the beta, what is read and written outside the vault, and shows its screenshots in the dark theme.

## 0.43.1 (2026-10-06)

### Fixed

- The manual's list of what is planned no longer names the paperback PDF and the style editor, which are built.

## 0.43.0 (2026-10-06)

### Added

- Import from Scrivener, in the command palette: a Scrivener 3 project, or a zipped backup of one, becomes a new binder. You see the binder and read any note of it before anything is made.
- The order, synopses, notes, labels, statuses, targets, keywords and snapshots come across; Research can be left behind. The project itself is never changed, and every original file is kept beside the notes.

## 0.42.1 (2026-10-06)

### Fixed

- When many snapshots arrive at once (from sync, say), the Snapshots dialog and the inspector show them straight away; before, the list could stand still for seconds, or minutes on a busy machine.

## 0.42.0 (2026-10-06)

### Changed

- On a tablet, a card's, row's or title's menu is shorter so that all of it shows without scrolling: Move up, Move down, Move to and Put in a new folder are under one Move, and Include in export is Leave out under Export as.

### Fixed

- On a tablet on its side, a tap in a note's menu could open the item below the one tapped.

## 0.41.1 (2026-10-06)

### Fixed

- A folder's or binder's snapshot whose file had been changed to name places outside its folder could have notes written there by "Make a binder from this snapshot". Such a snapshot now counts as damaged, and nothing is made from it.

## 0.41.0 (2026-10-06)

### Added

- Snapshots of a folder or a whole binder: the clock button in the binder view's header takes one (one file holding every note, in order) and lists them; Show changes says what is different, note by note; Read shows one as it stood; Make a binder from this snapshot writes it beside the one that's there.

### Removed

- Take a snapshot of every note. A folder's or binder's snapshot takes its place; snapshots it took stay each note's own.

## 0.40.9 (2026-10-06)

### Changed

- Nothing a writer will notice: the notices for the typefaces, hyphenation patterns and libraries inside the plugin now travel in its own file, as their licences ask.

## 0.40.8 (2026-10-06)

### Added

- Third-party notices: whose hyphenation patterns, typefaces and libraries are inside the plugin, and under which licences.

### Changed

- The hyphenation patterns in exported pages are now TeX's current ones, with their makers' notices: a few words break in better places (in English, 'manuscript' and 'something'; German, Spanish, Italian and Portuguese use newer patterns).

## 0.40.7 (2026-10-06)

### Removed

- Nothing a writer will notice: the notes that carried the work to a cloud session are taken out, now that it is merged.

## 0.40.6 (2026-10-06)

### Changed

- The menu beside Export says "Show the Exports folder", where it said "Show where exports go".

## 0.40.5 (2026-10-06)

### Changed

- The handoff note says what the cloud session shipped, fixed and left open.

## 0.40.4 (2026-10-06)

### Fixed

- Older tests expect the "Export as" menu item and column, leave the styles folder out of the property names, and tap a menu item only once its menu has stopped scrolling.

## 0.40.3 (2026-10-06)

### Fixed

- Laying a book's pages out again, as the style editor does with each change, no longer holds on to the memory of its pictures.

## 0.40.2 (2026-10-06)

### Fixed

- The hidden page that prints a PDF no longer has Node turned on.

## 0.40.1 (2026-10-06)

### Fixed

- A manuscript saved as a Word file and then exported as a PDF to the same place no longer replaces the Word file: the PDF goes beside it.

## 0.40.0 (2026-10-06)

### Added

- The style editor opens from Paperback too, with the rows that are the pages' own: typeface, size, line spacing, lines, space above, where chapters open, along the top, page numbers and margins.
- Export again makes a paperback, or a manuscript as a PDF, once more.

## 0.39.2 (2026-10-06)

### Fixed

- The scrollbar beside a PDF's pages follows the light or dark theme.
- A phone no longer says where a PDF it can't make would be saved.

## 0.39.1 (2026-10-06)

### Changed

- The developer notes describe the pages and the PDF as built.

## 0.39.0 (2026-10-06)

### Added

- Export says when a book's language isn't written in letters the style's typeface has.

## 0.38.2 (2026-10-06)

### Fixed

- A page of a PDF no longer comes out a line too long, and a word broken at a line's end keeps its hyphen.
- A book with pictures prints.

## 0.38.1 (2026-10-06)

### Fixed

- A part in a manuscript PDF has the header and its page number.

## 0.38.0 (2026-10-06)

### Added

- Paperback: a book style on a trim size (5 × 8 to 6 × 9 in, or A5), exported as a print-ready PDF with its fonts embedded.
- A manuscript can be exported as a PDF as well as a Word file, on Letter or A4.
- For a PDF the Export window shows the pages themselves, facing, exactly as they will print.
- On a phone or tablet a PDF's pages can be looked at; the PDF is made on a computer.

## 0.37.4 (2026-10-06)

### Fixed

- The styles folder setting no longer adopts and hides a folder that is already there, and the styles folder is shown whenever it holds anything but styles.

## 0.37.3 (2026-10-06)

### Fixed

- Deleting an export style that binders use now gives them the style it was based on, as the delete dialog says, instead of the first built-in style.

## 0.37.2 (2026-10-06)

### Fixed

- A test of deleting a style no longer depends on whether the computer has a system trash.

## 0.37.1 (2026-10-06)

### Changed

- The developer notes describe export styles, the style editor, Export as and Export again as built.

## 0.37.0 (2026-10-06)

### Added

- "Export again" (a command, and in the binder view's menu once a binder has been exported) repeats the last export to the same place with no window; it asks only before replacing a file that has changed since.
- "Show where exports go" in the Export window's menu.

## 0.36.0 (2026-10-06)

### Added

- "Export as" (Automatic, Part, Chapter, Scene, Front matter, Back matter, Leave out) in a card's and a row's menu, as an outliner column, and on each row of Contents in the Export window.

### Changed

- Contents lists the pages Binders makes, and says a role it worked out more quietly than one you set.

## 0.35.0 (2026-10-06)

### Added

- "Edit this style" beside the Style dropdown turns the Export window's sidebar into a style editor; the preview follows every change, and changes are kept as you make them.
- Built-in styles can be changed and reset; Duplicate makes a style of your own, which can be renamed, deleted, shared as a file and added from one.
- Styles are plain files in "Export styles" at the top of the vault, kept out of the file explorer (the folder's name is a setting).

### Changed

- A manuscript's style is now kept with its binder.

## 0.34.0 (2026-10-06)

### Added

- A second book style, Modern: Source Serif, a large plain numeral at the left (a chapter's title under it), scene breaks as space.

## 0.33.8 (2026-10-06)

### Fixed

- The end-to-end tests now start Obsidian when run as root, as in a cloud sandbox or a container.

## 0.33.7 (2026-10-06)

### Changed

- Nothing a writer will notice: the handoff note records the finished PDF work waiting on its branch.

## 0.33.6 (2026-10-06)

### Changed

- Nothing a writer will notice: a script sets up a new machine for the tests, and the design notes record what has been turned down.

## 0.33.5 (2026-10-06)

### Changed

- Nothing a writer will notice: the state of unfinished work, and the designs and research behind it, are written into the repository.

## 0.33.4 (2026-10-06)

### Changed

- A link in the manual's settings page is back in its place.

## 0.33.3 (2026-10-06)

### Changed

- The manual says how words are counted, and lists the new setting.

## 0.33.2 (2026-10-06)

### Fixed

- The export window's count for One note is counted the same way as every other count.

## 0.33.1 (2026-10-06)

### Fixed

- An export's word count takes each Chinese or Japanese character for a word, as Obsidian does, counts a number such as 1,000 as one word, and no longer splits a word at an accent typed as a separate mark.

## 0.33.0 (2026-10-06)

### Added

- A setting, Count words as the exported book does (on to begin with): turn it off to count as Obsidian's status bar does. Changing it leaves the day's words as they were.

### Changed

- Word counts now say what an export says: comments, the hidden part of a link, a web address and a note's properties aren't counted, and a footnote is counted once. Cards, stacks, the outliner, the toolbar, targets, the inspector, Contents, focus mode and the day's words all follow. A note with comments or links shows fewer words than before, and a target that was only just met may be just short.
- A heading at the top of a note that opens a chapter is the chapter's title, and isn't counted with its text. A note that embeds another counts the embedded note's words.

## 0.32.7 (2026-10-06)

### Changed

- The README opens with a banner: the Binders mark and name over a novel's corkboard.

## 0.32.6 (2026-10-06)

### Fixed

- Merging notes keeps sources that change during the merge, including their properties, and stops if the merged copy no longer holds their text.

## 0.32.5 (2026-10-06)

### Changed

- The README is a short introduction titled Binders for Obsidian, with the public beta note, installation, a quick start and links into the manual.

## 0.32.4 (2026-10-06)

### Changed

- The documentation is now a manual in the docs folder, a page per topic.

## 0.32.3 (2026-10-06)

### Changed

- Nothing a writer will notice: the design, architecture and development notes moved to docs/dev, to make room for a user manual in docs.

## 0.32.2 (2026-10-06)

### Changed

- The README is titled Obsidian Binders, has a table of contents and an Installation section, and its limitations list is brought up to date.

## 0.32.1 (2026-10-06)

### Fixed

- Nothing a writer will notice: a settings test expects the new focus mode switch.

## 0.32.0 (2026-10-06)

### Added

- Focus mode has a new option, Dim the background, on to begin with: the page turns a deep charcoal with light text while you're in focus, in a light theme too, and everything is as it was when you leave.

### Changed

- Dim other paragraphs dims much more: while you type, everything but the paragraph you're in steps back to about a third of its strength, tables, callouts and images included.

## 0.31.1 (2026-10-06)

### Changed

- The docs say when the inspector and the contents appear.

## 0.31.0 (2026-10-06)

### Changed

- Opening a binder puts the inspector and the contents among the right sidebar's tabs, without opening the sidebar. Close one and it comes back with the next binder you open; turn off Show the inspector and contents with a binder in settings to keep them closed.

## 0.30.2 (2026-10-06)

### Changed

- The README says where a note's role and a book's structure are set now: the inspector and Book details.

## 0.30.1 (2026-10-06)

### Fixed

- "Remembered places" in settings says "Scrivener project", "Ebook" or "Manuscript", not the kind's internal name.

## 0.30.0 (2026-10-06)

### Added

- Export makes an ebook: an EPUB for Kindle, Apple Books and Kobo, in the Classic style, with a title page, a copyright page and contents made for you, footnotes a reader taps open, and a cover from your vault.
- Book details (the button beside the book's name in the Export window): title, subtitle, author, structure, title page, copyright line, contents page and language, kept in the binder note's properties.

### Fixed

- The Export window no longer asks for your name when the book already has an author.

## 0.29.4 (2026-10-06)

### Changed

- Nothing a writer will notice yet: the parts of Export that make an ebook, with a test that no word is dropped or reordered and EPUBCheck in the test run.

## 0.29.3 (2026-10-06)

### Fixed

- "Your name" in the Export window was squeezed to a few letters beside its field.

## 0.29.2 (2026-10-06)

### Fixed

- A folder holding only pictures no longer changes how Export reads a binder's structure.

## 0.29.1 (2026-10-06)

### Fixed

- In a French or German book, an apostrophe inside or after a word (qu'il, geht's, Hans' Uhr) was exported as a quotation mark.

## 0.29.0 (2026-10-06)

### Added

- Export has a new kind, Scrivener project: the binder itself as a Scrivener 3 project (.scriv), with its order, synopses, labels and colors, statuses, targets, snapshots, notes, footnotes, comments and links carried across.
- A project you have since opened in Scrivener is never written over: export offers to save beside it instead.
- On a phone or tablet the project is zipped into the Exports folder and handed to the share sheet.

## 0.28.1 (2026-10-06)

### Changed

- Nothing a writer will notice yet: the part of Export that writes a Scrivener project, with a test that no word is dropped or reordered.

## 0.28.0 (2026-10-06)

### Added

- Drag on empty space of the corkboard to draw a selection box: the cards it touches are selected. With Shift they're added to what's selected; with Ctrl (Cmd on macOS) each one touched changes sides. Esc while dragging puts the selection back. Works in the grid and by label.

### Fixed

- A Shift-click or Ctrl-click on a card selects even when the pointer moves a little between pressing and letting go; before, that picked the one card up and dropped the rest of the selection.
- Two Shift-clicks on the same card no longer open the note.

## 0.27.2 (2026-10-06)

### Changed

- The README and the format notes describe the inspector, the contents and scene notes.

## 0.27.1 (2026-10-06)

### Changed

- Nothing a writer will notice: tests for the inspector and the contents.

## 0.27.0 (2026-10-06)

### Added

- Contents, a sidebar view of the whole book in its order with the row you are on marked. Click a row to go there in the binder view you have open. Show contents opens it, from the command palette or the binder view's More options.

## 0.26.0 (2026-10-06)

### Added

- The inspector, a sidebar view that shows the scene you are in (or the selected card, row, folder or binder) and lets you set its synopsis, label, status, target, whether it is exported and as what, your notes on it, and see its snapshots, without leaving the page. Its tab is added to the right sidebar once; Show inspector brings it back.

## 0.25.0 (2026-10-06)

### Added

- Notes on a scene or folder, kept in its notes property (the name is a setting) and never exported. The outliner has a Notes column for them.

### Changed

- Merging notes joins their notes as it joins their synopses.

## 0.24.9 (2026-10-06)

### Changed

- Nothing a writer will notice: the views share one way of reading and writing a card's details.

## 0.24.8 (2026-10-06)

### Changed

- The demo vault (npm run demo-vault) now has a set of complete example books to try Binders on: a full-length novel with a story bible, a novella, a novel typed with tabs, a story collection, a handbook with footnotes, tables and figures, a draft in progress, short books in German and French, other scripts, a Longform project, and a binder with a scene for everything export has to decide about. The stress binders moved into a folder of their own.

## 0.24.7 (2026-10-06)

### Fixed

- Nothing a writer will notice: the phone tests that expected an editor without a tap now tap first, and the check that unsaved phone typing survives an outside edit runs again.

## 0.24.6 (2026-10-06)

### Fixed

- Nothing changes in the plugin: the whole-suite test run now says so, and retries nothing, if the code changed while it ran.

## 0.24.5 (2026-10-06)

### Fixed

- Nothing changes in the plugin: an end-to-end test that hangs now fails after a time limit instead of holding the whole run.

## 0.24.4 (2026-10-06)

### Fixed

- Nothing changes in the plugin: the end-to-end tests no longer leave a view or a setting behind for the next test.

## 0.24.3 (2026-10-06)

### Fixed

- A link written just before a merge or a split now follows it to the note that has the text, even when Obsidian hasn't indexed the link yet.

## 0.24.2 (2026-10-06)

### Fixed

- Nothing a writer will notice: two tests of links following a merge or a split no longer depend on which test ran before them.

## 0.24.1 (2026-10-05)

### Changed

- The README and the format notes describe Export as it is so far.

## 0.24.0 (2026-10-05)

### Changed

- Compile is now One note in the Export window, with the same options and Copy, and a new option, on by default, that takes the tabs off the start of paragraphs.
- 'Include in compile' is 'Include in export', and the outliner's Compile column is Export. Binders now writes export: false. compile: false is still read, and no note is rewritten to change it.
- The note One note makes is named '... (exported)'.

### Removed

- The commands and menu items named Compile.

## 0.23.0 (2026-10-05)

### Added

- Export: Export binder and Export... open a window that makes a manuscript, a Word file in standard manuscript format with real Word styles, footnotes, a title page and a header. Parts, chapters and scenes are read from the binder's shape.
- On a computer Export asks where to save, starting in an Exports folder beside the binder, and can remember the place. On a phone or tablet the file goes to the Exports folder and then to the share sheet.
- Settings: Exports folder, Remembered places, Your name, Contact details.

## 0.22.9 (2026-10-05)

### Changed

- Nothing a writer will notice yet: the part of Export that writes a Word file, with a test that no word is dropped, repeated or reordered.

## 0.22.8 (2026-10-05)

### Changed

- Nothing a writer will notice yet: the part of Export that reads a binder into a book.

## 0.22.7 (2026-10-05)

### Changed

- Nothing a writer will notice: the working rules now name the commands that rewrite text and the one exception for links in tab paragraphs.

## 0.22.6 (2026-10-05)

### Changed

- The export design is approved; the points left open in it are settled as written.

## 0.22.5 (2026-10-05)

### Changed

- The export design, as decided on 2026-10-05, is written down in docs/export.md.

## 0.22.4 (2026-10-05)

### Fixed

- Typing in a very long note of a binder is lighter: counting the day's words no longer reads the whole note at every key.

## 0.22.3 (2026-10-05)

### Fixed

- A manuscript in a window of its own keeps drawing sections and making editors while the main window is minimised, and the page no longer jumps when a section above the one you're reading grows.

## 0.22.2 (2026-10-05)

### Changed

- Nothing a writer will notice: a check for an older editor was removed from the manuscript.

## 0.22.1 (2026-10-05)

### Fixed

- If a future Obsidian changes its embedded editor, the manuscript falls back to read only, or leaves a section as plain text, instead of failing while saving.

## 0.22.0 (2026-10-05)

### Changed

- In the manuscript, a section you aren't typing in shows its footnotes as the editor does: each footnote's text where you wrote it, in small lines, and the numbered list at the foot is gone, so the page no longer moves when you click into a section with footnotes.

## 0.21.0 (2026-10-05)

### Changed

- Binders now needs Obsidian 1.13.4 or later: the oldest 1.13 there is an installer for, and the oldest it has been run on.

## 0.20.2 (2026-10-05)

### Fixed

- Nothing a writer will notice: a phone test no longer taps while the page is still coasting from a swipe.

## 0.20.1 (2026-10-05)

### Fixed

- Scrolling up through the manuscript in a narrow pane no longer makes Obsidian's editor log 'Measure loop restarted'.
- On a phone, a tap in another section moves the caret there even when it was at the start of a wrapped line.

## 0.20.0 (2026-10-05)

### Changed

- On a phone, a section of the manuscript is plain text to read and swipe through until you tap it: the caret goes to the letter under your finger and the keyboard opens. Swiping through a long manuscript no longer hitches.

### Fixed

- A tap in a manuscript section that was still plain text could put the caret a word away from where you tapped.
- Turning a phone with the caret in the manuscript no longer loses the caret.
- On a phone, a table wider than the page can be swiped sideways before its section is tapped.

## 0.19.3 (2026-10-05)

### Changed

- The README and the format notes describe paragraphs that start with a tab, first-line indents, and their limits.

## 0.19.2 (2026-10-05)

### Fixed

- Manuscript sections shown as text show paragraphs that start with a tab as paragraphs.

## 0.19.1 (2026-10-05)

### Fixed

- The snapshots dialog and focus mode's scenes before and after show paragraphs that start with a tab as paragraphs.

## 0.19.0 (2026-10-05)

### Added

- Links in a paragraph that starts with a tab are updated when the note they lead to is renamed or moved, as Obsidian updates every other link.

## 0.18.0 (2026-10-05)

### Added

- Indent paragraphs: the first line of a paragraph that follows another can be indented in a binder's notes, with nothing added to the note.

## 0.17.0 (2026-10-05)

### Added

- In a binder's notes, a line that starts with a tab is a paragraph with its first line indented, not a block of code: italics, links and spell-check work in it. On to begin with (Settings, Paragraphs). The note keeps the tab you typed.

## 0.16.3 (2026-10-05)

### Changed

- The README says Obsidian 1.13.0 or later is required.

## 0.16.2 (2026-10-05)

### Changed

- Nothing you'll notice: a check for old Obsidian versions in the file explorer code was simplified.

## 0.16.1 (2026-10-05)

### Removed

- The older settings page, which only Obsidian before 1.13 showed, is gone.

## 0.16.0 (2026-10-05)

### Changed

- Binders now needs Obsidian 1.13.0 or later.

## 0.15.8 (2026-10-05)

### Fixed

- Undo last move after Ungroup, refused once because a folder of the same name had a note in the way, now brings the folder's synopsis, label and target back when asked again.

## 0.15.7 (2026-10-05)

### Fixed

- Quitting Obsidian is no longer held up by an open binder view that has nothing left to save.

## 0.15.6 (2026-10-05)

### Fixed

- Nothing a writer will notice: a settings test no longer fails when it runs after a test that simulates quitting.

## 0.15.5 (2026-10-05)

### Fixed

- In a pane only a few dozen pixels wide, what you type into a card's synopsis or name now comes out in the order typed, not backwards.

## 0.15.4 (2026-10-05)

### Changed

- Nothing a writer will notice: the working rules now say main is pushed as fixes ship, and the map of the code lists the helper for views in their own window.

## 0.15.3 (2026-10-05)

### Changed

- Nothing changes in the plugin: the end-to-end tests can now be run on the oldest Obsidian Binders allows, and a run says which Obsidian it was.

## 0.15.2 (2026-10-05)

### Changed

- The post-1.0 roadmap prioritizes saved manuscript filters, a scene-linked revision queue, and merge recovery, with scope limits to keep the writing workflow lean.

## 0.15.1 (2026-10-05)

### Changed

- Nothing a writer will notice: the project's rules now say what each part of the version number means.

## 0.15.0 (2026-10-05)

### Fixed

- A folder copied with Obsidian's Make a copy, or in a file manager while Obsidian is open, keeps its synopsis, label and target: its folder note is renamed to match the copy instead of showing there as a scene.

## 0.14.0 (2026-10-05)

### Changed

- Undo (Ctrl+Z) right after Split scene now takes the whole split back: the text returns to the note and the new note goes to the trash, and redo splits again. A new note you have already edited, renamed or moved stays, and a notice says the text is in both.

## 0.13.0 (2026-10-05)

### Changed

- Ungroup now takes the emptied folder away, to the trash, with its synopsis, label and target. Undo last move brings the folder back with all of them and puts its notes back inside, in order. A folder that still holds something, such as text written in its folder note, stays.

## 0.12.154 (2026-10-05)

### Fixed

- Nothing a writer will notice: the tests put the window and the sidebars back before each test, and several measurements now wait for the layout to settle, so the suite no longer fails on a busy machine.

## 0.12.153 (2026-10-05)

### Fixed

- In a window of its own, a board follows the window's size and scrolls when a card is dragged to its edge; a binder view closed while Obsidian was still starting no longer builds itself in the background.

## 0.12.152 (2026-10-05)

### Fixed

- A screen reader now announces the corkboard's cards as a list of cards alone, and the “New note” tile as a button after it.

## 0.12.151 (2026-10-05)

### Changed

- In a pane or on a phone narrower than 360 px, the corkboard/outliner/manuscript button shows its icon alone, leaving the room to the folder's name and the word count; its name is its tooltip.

## 0.12.150 (2026-10-05)

### Changed

- Nothing a writer will notice: the team's working rules now have agents run only the tests for what they changed, and one dedicated runner run the whole suite at the end of a session.

## 0.12.149 (2026-10-02)

### Changed

- Nothing a writer will notice: a test of the phone's outliner swipes to a column that is now out of sight before tapping it.

## 0.12.148 (2026-10-02)

### Changed

- Nothing a writer will notice: one more of Obsidian's parts that a style rule relies on is listed.

## 0.12.147 (2026-10-02)

### Changed

- Nothing a writer will notice: the list of Obsidian's undocumented parts that Binders relies on says, for each, what the code really does when it is missing and which test covers it.

## 0.12.146 (2026-10-02)

### Changed

- Tests now check what the README tells a writer: the keyboard lists for all three views, what Binders writes and never touches, undo, compile, and troubleshooting. One sentence about copied folders says what happens, not what may.

## 0.12.145 (2026-10-02)

### Fixed

- On a very small phone held sideways with the keyboard up, the header no longer prints its title across the line you are typing in the manuscript: it slides away, as it does in a note, and comes back when you stop.

## 0.12.144 (2026-10-02)

### Changed

- Nothing a writer will notice: the last of Obsidian's undocumented parts that had no test has one.

## 0.12.143 (2026-10-02)

### Changed

- Nothing a writer will notice: styles are now read from the window the element is in, which matters in popout windows.

## 0.12.142 (2026-10-02)

### Changed

- Nothing a writer will notice: the record of test rounds says what the sixth round found, what was fixed and what is still open.

## 0.12.141 (2026-10-02)

### Changed

- On the narrowest phones the view's button shows its icon and arrow instead of a cut-off name; the word count keeps its room.

## 0.12.140 (2026-10-02)

### Fixed

- On the board by label, a folder card's synopsis is no longer sliced mid-line: it ends in an ellipsis.

## 0.12.139 (2026-10-02)

### Fixed

- On a phone, an outliner with folders inside folders no longer cuts its last column through the middle: the column is whole, a swipe to the side away.

## 0.12.138 (2026-10-02)

### Changed

- Nothing a writer will notice: two tests check that the binder note and a note whose synopsis is being typed are whole after the app is reloaded.

## 0.12.137 (2026-10-02)

### Changed

- Nothing a writer will notice: a pause before renaming a new folder or revealing a new note no longer runs if the plugin is turned off in that moment.

## 0.12.136 (2026-10-02)

### Changed

- Nothing a writer will notice: the architecture, development and plan documents and the roadmap match the code as it is, and say what this round's fixes established.

## 0.12.135 (2026-10-02)

### Fixed

- A change made earlier today (0.12.98) had Obsidian's editor log a warning while typing at the foot of the window in the manuscript. It is taken back; fast swipes on a phone are as they were before it.

## 0.12.134 (2026-10-02)

### Fixed

- Words deleted or undone in the manuscript could come back if the note was written again by something else (a sync, another plugin) before the manuscript had saved.

## 0.12.133 (2026-10-02)

### Changed

- Nothing a writer will notice: each file format rule is stated once in its place, and three more of Obsidian's undocumented parts that the code relies on are listed.

## 0.12.132 (2026-10-02)

### Changed

- The README describes the folder card, the keys, undo for the binder in front and how the views behave on a phone as they are now.

## 0.12.131 (2026-10-02)

### Added

- Nothing a writer will notice: the tests of the sixth QA round (writing, scale, store, boards, menus, phone, tablet, features) are part of the suite, and the findings that are still open are listed with why.

## 0.12.130 (2026-10-02)

### Fixed

- Deleting a binder just after changing it no longer leaves an error in the console.

## 0.12.129 (2026-10-02)

### Fixed

- Deleting a folder with thousands of notes from a binder, or the whole binder, takes a moment instead of several seconds.

## 0.12.128 (2026-10-02)

### Changed

- Nothing a writer will notice: four older tests measure the phone's indent, row height and short view as they are now, and say what going into a folder does to the keyboard.

## 0.12.127 (2026-10-02)

### Fixed

- In a very narrow pane (four binders side by side on a tablet, a small window zoomed to 300%) the toolbar's buttons stay whole and nothing runs off the side; the word count gives way.

## 0.12.126 (2026-10-02)

### Fixed

- In the outliner, the status or label menu of a row at the very bottom of the screen no longer runs off the screen.

## 0.12.125 (2026-10-02)

### Fixed

- Reloading Obsidian in the moment a reorder or a synopsis was waiting to be saved could have left the binder note, or that note, empty. On a computer nothing is now started as the page goes; quitting still saves first.

## 0.12.124 (2026-10-02)

### Changed

- Nothing a writer will notice: a phone test scrolls the line it types on clear of Obsidian's bar first.

## 0.12.123 (2026-10-02)

### Fixed

- Reloading Obsidian within a couple of seconds of typing in the manuscript could leave that note empty. The note now stays as it was last saved.

## 0.12.122 (2026-10-02)

### Changed

- Nothing a writer will notice: the first release's notes will be that version's entry alone, a comment no longer trips a text-matching check, and the Obsidian types are pinned to a version.

## 0.12.121 (2026-10-02)

### Changed

- Nothing a writer will notice: the design notes record the decisions made about phones, counts and rings, and the notes for contributors say where the project stands.

## 0.12.120 (2026-10-02)

### Changed

- Nothing a writer will notice: five older tests describe the folder card, the outliner's header, the Filter button, the phone's word count and the phone's indent as they are now.

## 0.12.119 (2026-10-02)

### Fixed

- In a read-only binder the word count is no longer announced as a button or reached with Tab.

## 0.12.118 (2026-10-02)

### Fixed

- “Set target...” on several notes whose targets differ no longer takes them all away when Enter is pressed on the empty field; type 0 to remove them.

## 0.12.117 (2026-10-02)

### Changed

- The README's list of known limitations says what is still open after this round of fixes, and no longer lists what was fixed.

## 0.12.116 (2026-10-02)

### Fixed

- Renaming a folder again within a moment of renaming it no longer leaves its folder note under the old name, where it showed as a scene.

## 0.12.115 (2026-10-02)

### Fixed

- A file and a note named after it (paper.pdf and paper.pdf.md) in a binder no longer show as the same note twice; each has its own place, and the note is in the manuscript and a compile once.

## 0.12.114 (2026-10-02)

### Changed

- Nothing a writer will notice: two tests of the phone's outliner and corkboard measure the place they check instead of assuming it.

## 0.12.113 (2026-10-02)

### Fixed

- On a phone, picking up a row in the outliner no longer shifts the rows under your finger, so it drops where you put it.

## 0.12.112 (2026-10-02)

### Fixed

- Sections with images, embedded notes, math, long code blocks, a table at the top, task lists or quotes no longer shift the page when you click into them.

## 0.12.111 (2026-10-02)

### Changed

- Nothing a writer will notice: three tests describe the look and the folder card as they are now.

## 0.12.110 (2026-10-02)

### Changed

- Nothing a writer will notice: comments corrected and code that could no longer run removed.

## 0.12.109 (2026-10-02)

### Fixed

- Just after switching to the manuscript, scrolling to another section could be pulled back, so a click landed in the wrong note.

## 0.12.108 (2026-10-02)

### Fixed

- “Make this the binder order” on a folder of thousands of notes takes a second or two instead of most of a minute.

## 0.12.107 (2026-10-02)

### Fixed

- A note moved just before the binder note's properties became unreadable for a moment (a sync half-way through) is no longer forgotten.

## 0.12.106 (2026-10-02)

### Fixed

- A note that another program rewrites by deleting it and creating it again (git pull, some editors) stays where it was in the binder.

## 0.12.105 (2026-10-02)

### Fixed

- A note or folder whose name starts or ends with a space no longer drops to the end of its folder.

## 0.12.104 (2026-10-02)

### Changed

- On the corkboard by label, Tab reaches the lines' heads once; the arrow keys go from one head to the next.

## 0.12.103 (2026-10-02)

### Fixed

- Making the window narrower or wider, or turning a tablet, keeps the card you were looking at in sight on the corkboard.

## 0.12.102 (2026-10-02)

### Fixed

- With Obsidian's stacked tabs on, focus mode now hides the other tabs' strips and gives the page the window's width.

## 0.12.101 (2026-10-02)

### Fixed

- On the narrowest phones the word count is no longer hidden: it shows as its number, and a tap on it still sets the target.

## 0.12.100 (2026-10-02)

### Fixed

- In the manuscript a screen reader found no headings to move by: a folder's heading was announced only as a link.

## 0.12.99 (2026-10-02)

### Changed

- Nothing a writer will notice: comments corrected, and one helper where there were two.

## 0.12.98 (2026-10-02)

### Changed

- Swiping fast through a long manuscript on a phone hitches a little less: editors that scroll out of sight are taken down one a frame.

## 0.12.97 (2026-10-02)

### Fixed

- On a phone, the first time in focus mode a notice said to press Esc and covered the button that leaves.
- Rename on a folder's heading in the manuscript has the icon and place it has everywhere else.

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
