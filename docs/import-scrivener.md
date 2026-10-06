# Import from Scrivener

Makes a new binder in your vault from a Scrivener 3 project. Its documents become notes, its folders stay folders,
and everything keeps its order. The project itself is only read: nothing in it is changed.

## Importing a project

1. Open the command palette and run **Import from Scrivener...**. It is only there: no folder's menu has it.
2. Choose the project.
   - On a computer, **Choose a project...** and pick the project's `.scriv` folder (or the `.scrivx` file inside
     it). Close the project in Scrivener first.
   - Anywhere, a phone and a tablet included, **Choose a zipped backup...** and pick a zip that holds one project.
     Scrivener's own backup command makes one.
3. The second dialog shows the binder as it will be. On the left:
   - **Name**: the new binder's. A name that is taken is refused as you type it.
   - **Create in**: the folder to make it in. Folders inside a binder, and the folders exports are kept in, aren't
     offered.
   - **Research** and **Snapshots**: both on to start with. Each is only shown if the project has any.
   - where the binder will go, what is left out, and **things to look at**: what import had to change or couldn't
     carry. Click one to see its note.
4. On the right is the binder's list, in Scrivener's order. Click a note to read it as it will be. Folders fold. With
   the keyboard, Up and Down walk the list, Right and Left go into and out of a folder.
5. **Import**. The bar says how far it is, and **Cancel** stops it. When it is done the new binder opens, and a
   notice offers **Open import notes** if there was anything to look at.

On a phone the choices come first, with **Preview** for the list; tap a note to read it, and the arrow goes back.

Nothing is made until you choose **Import**. Closing the dialog before that leaves the vault as it was.

## What comes across

| In Scrivener | In the new binder |
|---|---|
| The Draft's folders and documents | Folders and notes, in the same order |
| A folder, or a document with documents under it, that has text of its own | A folder, with that text as its first note, named "*its name* text" |
| Text on the Draft folder itself, or on Research | A note before that folder's others |
| Synopsis and document notes | The note's synopsis and notes |
| Labels, with their colors, and statuses | The note's label and status, and added to the lists in Binders' settings. Yours stay as they are |
| Targets in words | The note's target, and the binder's from the draft's |
| Targets in characters | A `scrivener-target` property |
| "Include in compile" off | The note stays, with **Include in export** off |
| Keywords | Tags. If a keyword has characters a tag can't have, the keywords as written are kept too, in `scrivener-keywords` |
| Custom metadata | Properties, as text. A name Binders or Obsidian uses gets "Scrivener" before it |
| Section types | A `scrivener-section` property |
| Research, and anything else outside the Draft | A **Research** folder that no export takes |
| A document's snapshots | That note's [snapshots](snapshots.md), with their names and dates |
| PDFs, pictures and other files in Research | The file itself, kept, with a note that links to it |
| Trash | Left out. The dialog says how many documents |

A label that has the name of one of yours but another color comes in under its own name, with the binder's after it.
A title that can't be a file's name (it has `:` or `/` in it, or another item beside it has the same one) is changed,
and listed with the things to look at. Links between documents point at the notes they became.

## The text

Rich text becomes Markdown. Your sentences come through as you typed them.

| Kept | Not kept (it is in the original file) |
|---|---|
| Paragraphs, line breaks, tabs at the start of a paragraph | Fonts, sizes, colors |
| Bold, italics, struck-through text | Underlining, highlighting, superscript and subscript (listed when a document has them) |
| Links to web pages, and links between documents | Alignment, indents, line spacing, page breaks |
| Footnotes, and Scrivener's inline footnotes | A table's layout: its text is kept, cell after cell |
| Inline annotations and comments written into the text, as Obsidian comments (`%%like this%%`) | Named styles other than headings |
| PNG and JPEG pictures, as files in **Research/Attachments** | Pictures of other kinds, page headers and footers |
| Headings, bullets and numbered lists that Scrivener marked | Comments in the margin (their file is kept) |

**Every original file is kept**, as it was, in **Research/Originals**, under its note's own path:
the original of `Part one/Arrival` is `Research/Originals/Part one/Arrival/content.rtf`. Its notes, its snapshots
and anything else the project held for that document are beside it. That folder is made whether or not **Research**
is on, and nothing in **Research** is ever exported. Delete it once you are sure of the notes.

A character that doesn't mean itself in Markdown (`*`, `_`, `[`, `#` at the start of a line and a few more) gets a
backslash before it, so it reads as you wrote it. Obsidian hides the backslash except where the cursor is.

## When something is wrong

- **A document that can't be read** (a damaged file, one that isn't rich text) doesn't stop the import. Its note
  links to its original, and it is named in the things to look at. The same goes for a snapshot without its text, a
  list of snapshots that can't be read, and a research file that is missing.
- **A project that can't be read at all** is said in the first dialog, with why: a project from an older Scrivener
  (open it in Scrivener 3, which brings it up to date), one from a newer Scrivener than Binders knows, a zip that
  is damaged or locked, one with no project or more than one in it.
- **The project changed on the disk** after it was read: import says so and stops. Close it in Scrivener and choose
  it again.
- **Cancel, or a write that fails** partway: the notes already made stay where they are, as plain notes, and the
  message says where. The folder is not a binder, because the binder's own note is written last. Nothing is
  deleted for you: look at the folder, delete it, and import again.

## Limits

- Scrivener 3 projects only.
- A project can be up to 256 MB and 20,000 files, and one document's text up to 32 MB. A project with a lot of
  research may be larger: leave the big files out of a copy of it, or import the zip of a smaller one.
- Zips that are split over several files, locked with a password, or hold links to files elsewhere are refused.
- Compile formats, collections, bookmarks and the layout of Scrivener's window don't come across.
- Import always makes a new binder. It never writes into a folder that exists, never merges into a binder, and
  importing twice makes two. There is no undo for a whole import: delete the folder.
- It has been checked against projects written by hand and by Binders' own export, and against one written by
  Scrivener on a Mac. If a project of yours comes in wrong, [open an issue](https://github.com/fyresmith/binders/issues).

Next: [Coming from Scrivener](scrivener.md) · [Snapshots](snapshots.md)
