# Known limitations

What doesn't work yet, what works in a way you might not expect, and what is planned. Anything else that goes wrong
is a bug: [open an issue](https://github.com/fyresmith/binders/issues).

## Planned, not built

- Thinning the automatic snapshots of a folder or binder, so they don't pile up.

See the [roadmap](../ROADMAP.md).

## Not yet tried

Binders is in public beta. It is built on Linux and tested there, on macOS and Windows, and in Obsidian's own
emulation of a phone and a tablet. The maintainer also uses it on an iPhone; that has found bugs emulation missed.
These things have not been tried yet, and are where a beta tester is most likely to find something:

- **An iPad or Android device.** Automated touch tests use desktop emulation. Real iPad and Android keyboards,
  app suspension, Android's back button and their share sheets have not been tried. iPhone use is not a completed
  check of every feature on iOS.
- **A PDF anywhere but Linux.** Making the file, and the typefaces a Mac or Windows has for the scripts that the
  two typefaces inside Binders don't hold.
- **A printer's checks.** No paperback PDF has been sent to KDP or IngramSpark, and none has been printed.
- **The Word file in Word.** It opens in LibreOffice. It has not been opened in Word, Pages or Google Docs, or
  brought into Vellum or Atticus.
- **The ebook in a store's own reader.** It passes EPUBCheck. It has not been opened in Kindle Previewer, Apple
  Books or Kobo.
- **A Scrivener project in Scrivener.** The format was worked out from projects Scrivener wrote, and trial projects
  were opened in the maintainer's Scrivener. A project as export writes it now has not been opened there, nor in
  Scrivener for Windows or iOS.
- **Import from Scrivener** has been checked against projects written by hand and by Binders' own export, and one
  written by Scrivener on a Mac. None from Scrivener for Windows.
- **Importing real Word manuscripts.** Tests use generated fixtures, Binders' exports and a LibreOffice-generated
  file. Representative manuscripts saved by hand in Word, Google Docs, Pages and other writing tools still need
  checking against their own plain-text exports. See [Import: tests and samples](dev/import.md#the-word-reader-srcdocx-srcimportdocxts).

If you try one of these, [say how it went](https://github.com/fyresmith/binders/issues), whether it worked or not.

## Import from Scrivener

Scrivener 3 projects only, up to 256 MB. Rich text becomes Markdown: fonts, sizes, colors, underlining and the
layout of tables don't come across, and every original file is kept beside the notes. An import that is cancelled or
fails leaves the notes it had made, as plain notes. Import makes a new binder: it doesn't merge into one, and there
is no link back to Scrivener. See [Import from Scrivener](import-scrivener.md#limits).

## Phones and tablets

Phone and tablet support is new and has had little testing on real devices. See [Phones and tablets](mobile.md).

## Splitting

- After **Split scene at cursor**, Undo in the note you split takes the split back only while Obsidian stays open
  and Binders stays on. After a restart, or once the note's own undo history is gone, the split is two notes like
  any others.
- If the note changes in the moment it is being split, both notes keep the text and a notice says so.

## Undo and redo

- **Undo last change** covers moves, a folder made around notes or ungrouped, and properties set by hand (a synopsis,
  a status, a label, a target, notes, export settings), renames made in a view, notes and folders made by hand, copies of notes, deletes, merges and splits (a split also by the editor's own undo). It doesn't cover a copy of a folder, or renames made in Obsidian's file explorer.
- It remembers the last hundred changes of each binder, while Obsidian is open.
- A property is taken back only if it is still what the change left it; one that was changed since (by another
  program, say) stays, and a notice says which.
- A note with Windows line endings (`\r\n`) comes back with its text byte for byte, but Obsidian writes the lines of
  a changed properties block with its own line breaks, as it does for any property you change.
- A delete can be kept in memory even when Obsidian deletes for good. The history's 100-entry and shared 32 MB
  limits can drop it before the session ends; it can't be undone after a restart, and a delete over 32 MB isn't kept.
- A link written with its folder in it (`[[Part One/Arrival]]`) is rewritten by a rename, and again by its undo, in Obsidian's shortest form (`[[Arrival]]`), so such a link isn't spelled as it was after an undo.
- Undoing a rename updates links as Obsidian does: if it was set not to update links (or you declined), the links stay as they are, in both directions.
- Undoing a kept sort of thousands of notes is slow.
- For screen readers, "Undo last change" isn't announced.

## Properties

- **Setting a property** (a status, a label, a target, a synopsis) goes through Obsidian, which writes the note's
  whole properties block again in its own form: comments in the block are dropped, and `0123` becomes `123`. The
  same happens to a binder note, or a Longform project's index note, when its order is written. Obsidian's own
  Properties view does the same. The note's text is never touched.
- **Windows line breaks.** Binders leaves a note's line breaks alone unless you type in it. Obsidian itself rewrites
  a note that has Windows line breaks with its own when the note's tab is closed or given to another note.
  A note with Windows line breaks or a byte-order mark that is open in an editor when you bring back a snapshot
  ends the same way: every word and line is back, saved by Obsidian's editor with its own line breaks and no mark.
  Closed, it comes back byte for byte.

## Paragraphs that start with a tab

To everything but Binders, a line that starts with a tab is a code block: in the same note outside a binder, in
another Markdown app, in Obsidian Publish. Obsidian doesn't list links or tags in such a line among backlinks, in
the graph or in the tag list. See [Paragraphs](paragraphs.md).

## The file explorer

- Plugins that replace the file explorer don't show binder order.
- A selection that spans two folders of a binder, or a Longform project, still has Obsidian's own **New folder with
  selection**, which puts the folder last.
- **Copying a folder.** Obsidian's **Make a copy** of a folder (or a copy made in a file manager while Obsidian is
  open) is placed right after the original, in the original's order, and keeps the folder's synopsis, label and
  target: Binders renames the copied folder note to match the copy. A folder note with none of those properties, or
  one that differs from the original's, is left under its old name and shows in the copy as a scene, listed last.

## Binders

- Nested binders aren't supported: a binder note inside a binder is treated as an ordinary note.
- The top of the vault can't be a binder.
- Longform projects that hold a single note (`format: single`) aren't binders.
- A binder made by a newer version of Binders is read only.

## Export

- A PDF (a paperback, or a manuscript as a PDF) is made on a computer only. A phone or tablet shows its pages.
- A paperback's PDF is RGB, with no bleed and no crop marks, in one of two typefaces. See
  [Paperback](export-paperback.md#limits).
- A book in a script the two typefaces don't hold is set in the computer's own serif, and the window says so.
- Hyphenation is for English, German, French, Spanish, Italian and Portuguese. Other languages are set without
  hyphens.
- Export styles sync with Obsidian Sync only with **Sync all other types** on.
- Pictures are PNG, JPEG or GIF. Other formats are listed and left out.
- An embedded PDF or other file, and part of a note embedded by its heading, are left out. Math and tags in a line
  of text are exported as typed.
- A manuscript's "by" and word count line are in English whatever the book's language.
- Scrivener's format has no published description, so a version of Scrivener may read an exported project
  differently. Import makes a new binder and doesn't merge into the one a project came from. See [Scrivener project](export-scrivener.md).
- Obsidian lists exported .docx and .epub files in its file explorer only with **Detect all file extensions** on.

## Snapshots

- Obsidian Sync carries snapshots only with **Sync all other types** on.
- Obsidian's "Move file to..." list shows the `Snapshots` folders.
- A note's snapshot keeps its text, not its properties. A folder's or a binder's keeps both, and the order.
- **Bring back...** restores a whole folder or binder in place, after a review and a snapshot of what is there
  now. **Everything** can restore text, properties, names, folders and order, but never deletes what was written
  since. It clears that binder's undo history; bring back the automatic "Before bringing back" snapshot to take
  the whole operation back. See [Snapshots](snapshots.md#everything).
- A snapshot of a folder lists files that aren't notes (pictures, PDFs) and doesn't copy them.

## Timeline

- Dates can be set through a card's menu, the outliner or the inspector. Cards can't yet be dragged to set dates,
  or dragged out of the timeline as files.
- The calendar is Gregorian. There are no custom calendars, eras or zoom controls yet.

See [Timeline](timeline.md).

## Find and replace

Text only: a note's properties, the binder note and the folder notes are not looked through, and no query is a pattern
(there is no regular expression and no whole-word option). A link's target, a tag, code and a comment are left alone
unless the query is typed with their marks (`[[Mara`, `#Mara`, a backtick, `%%`). **Replace** (one match) is only
offered in the manuscript; on the corkboard and the outliner there is Replace all. A folder's card says which of the
first five notes it lists have a match, not of the rest. On a computer Obsidian's own **Search and replace** key opens
the bar only while the caret is in a manuscript section; elsewhere the command **Find and replace in binder** does.
In a binder of a newer format, and one that can't have snapshots, nothing can be replaced. See
[Find and replace](find-and-replace.md).

## Focus mode

- With Vim key bindings on, Esc is Vim's: leave with the button or the command.
- **Enter fullscreen** isn't available on phones and tablets.
- The words written today are the record's (see [The record of your writing](progress.md)): they are the devices'
  together only where the record syncs, which with Obsidian Sync takes **Sync all other types**. Text put in by something
  other than the editor's own typing, undo and redo (a plugin that rewrites a note, Vim's commands if Obsidian's Vim mode
  doesn't send them as typing) is not counted as writing.

## The record of your writing

- It counts typing in Obsidian's own editors. Edits made in another program, or on a device without Binders, are not
  typing, and are only known by the difference they make to the book's total.
- Words are counted as Obsidian's status bar counts them, a few characters at a time as you type; the book's total is
  counted as the exported book has it (**Count words as the exported book does**). The two can differ a little, most
  in a book that embeds notes in others, and the difference shows as *changed elsewhere*.
- With Obsidian Sync it is carried only with **Sync all other types** on. A phone that has not synced yet stamps a
  total that is short of the other devices' words; the next day's total is true again.
- A change of more than 50 words at once is brought in or taken out, not written or cut, whatever it was: a long
  passage typed at once by dictation, or an autocomplete, counts as brought in.
- It is not yet shown anywhere but in focus mode's count; the window that shows it is to come.
- Not tried on a real phone or on Obsidian Sync.
