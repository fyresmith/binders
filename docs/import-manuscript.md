# Import a manuscript

Makes a new binder in your vault from a Word file, a long Markdown note or a text file. Binders finds where each chapter starts,
and makes a note of each (a folder, if the chapter has scenes). The note or file itself is only read: nothing in it
is changed.

For a Scrivener project, see [Import from Scrivener](import-scrivener.md).

**Other programs come in through Word.** Google Docs (File, Download, Microsoft Word), Pages (File, Export To, Word),
Atticus, Vellum, Dabble, Novelcrafter, LibreOffice and the rest all save a `.docx`: choose that. Google Docs'
"Download as Markdown" works too. `.odt` and `.rtf` files, and Pages and Scrivener's own files, aren't read yet:
save them as Word first.

## Importing

There are two ways in.

- **A file.** Open the command palette and run **Import a manuscript...**, then **Choose a file...** and pick a
  `.docx`, `.md`, `.markdown` or `.txt` file. This works on a phone and a tablet too.
- **A Word file already in your vault.** Right-click it in the file explorer and choose **Import as a binder...**. (Obsidian
  shows a `.docx` in the explorer only with **Detect all file extensions** on, in its Files and links settings. On a
  phone, run **Import a manuscript...** and **Choose from this vault...**, which lists Word files too.)
- **A note in your vault.** Right-click a note that isn't in a binder, in the file explorer, and choose **Make a
  binder from this note...**. Or run **Import a manuscript...** and choose **Choose from this vault...**, which lists the notes outside binders and
  the Word files.

A zipped Scrivener backup chosen in the first dialog goes on to the [Scrivener import](import-scrivener.md).

The second dialog shows the binder as it will be. On the left:

- **Name**: the new binder's. It starts as the book's title, if the text has one at its top (a single `#` heading), else
  the file's name. A name that is taken is refused as you type it.
- **Create in**: the folder to make it in.
- **Chapters start at**: how Binders found the chapters, with how many each way finds. A way that finds nothing
  can't be chosen.
- One row for each **level of heading** the text has, when chapters start at headings: **Heading 2 (42)** is
  a **Part**, a **Chapter**, a **Scene**, or **Keep in the text**.
- **Scene breaks**: **Start a new note** at each, or **Keep in the text**. Only there if the text has any.
- **Name scenes**: **By their first words** (about forty characters), or **Scene 1, Scene 2**.
- **Things to look at**: what import had to change or couldn't carry. Click one to see its note.

On the right is the binder's list. Click a note to read it as it will be. On a phone the choices come first, with
**Preview** for the list.

Nothing is made until you choose **Import**. Closing the dialog before that leaves the vault as it was.

## How chapters are found

Binders tries these in order, and uses the first that finds two or more chapters. You can choose another.

1. **Headings.** Markdown headings (`# Chapter one`). The shallowest level that occurs twice or more is the chapters.
   If every one of them starts with Part, Book or Act, and a deeper level exists, they are the parts, and the next
   level down is the chapters. A level under the chapters is **scenes** if half the chapters have one, else its
   headings stay in the text. A single `#` heading at the very top, above the rest, is the book's title and no
   chapter. Headings inside code, math and comments are not headings.
2. **Lines like "Chapter 12".** A short line, with no full stop, that reads as a title: "Chapter 3", "CHAPTER THREE",
   "Chapter 3: The storm", "Prologue", "Epilogue". A number alone on its line is one only if it is centered or comes
   after a page break (a form feed, in a text file). A typed list of contents isn't taken for chapters.
3. **Page breaks.** In a text file, a form feed before a short centered or capital line.

If there are none, the whole text comes in as **one note**, and the dialog says so. Binders never cuts by length:
split it where you like with **Split scene at cursor**.

**Scene breaks** are a line of its own that is only a mark (`***`, `* * *`, `---`, `#`, `~`, `§`, `xxx`), or, when
most of the text has single blank lines between paragraphs, the few places with two or more.

If most of what was found is very short, the dialog adds "These may not be chapters. Look at the list." Look at the
list before importing.

## What is made

- **A chapter with one scene** is a note at the top of the binder. **With more**, it is a folder of notes.
- **Parts** are folders holding their chapters.
- **Everything before the first chapter** goes in a **Front matter** folder: a title page, and a note each for
  a Dedication, an Epigraph and the like, if they have a heading of that name.
- The binder's own note says which rule the folders follow (chapters and scenes; parts and chapters; and so on), so
  an export doesn't have to guess.
- **Names.** A chapter is named by its heading. "Chapter 12: The storm" is named "Chapter 12 - The storm", which
  export strips the number from. A heading in capitals is put in title case. A heading that can't be a file's name
  (it has a `?` or a `:`) is named without the characters, and a chapter note then starts with the heading as it
  was, as a `#` line. A folder can't, so it is listed with the things to look at.
- **A file from outside the vault** is kept as it was in **Research/Originals** (a `.md` file gets `.original` added
  to its name, so it isn't a second copy of the writing in the binder), and nothing in **Research** is exported. A
  note of this vault is not copied: the binder's note links to it.

## A Word file

Binders reads a `.docx` itself, on any device, with nothing sent anywhere, and finds the chapters the same ways as
for any text.

- **Headings.** A paragraph is a heading by its style's built-in name (`Heading 1`, even in a Word that calls it
  something else in your language) or by its outline level. A `Title` or `Subtitle` is the book's title, not a chapter.
- **Page breaks, centered and bold lines.** A file written with no heading styles, with **CHAPTER TWELVE** centered
  and bold after page breaks, is read by those. So is a file that has `Chapter 12` lines in plain style.
- **Scene breaks.** A paragraph in a `Scene Break` style, a line of `***` or `#`, or an empty paragraph where they are
  rare.
- **A table of contents** (Word's, or a typed list) is not taken for chapters: it stays in the front matter.
- **A first-line indent** set by a style is layout and is dropped. A tab you typed at the start of a paragraph is kept
  if **Start a paragraph with a tab** is on, and dropped, with a line in the things to look at, if it is off. A file
  Binders exported comes back with its tab paragraphs.

What comes across: every word, in order; paragraphs; italics, bold and struck-through text; web links; footnotes
(in place, as `^[...]`); bulleted and numbered lists; quotations. Underlined text is read as italics when the file has no
italics at all (the manuscript way, and how Binders' Courier style writes them).

What doesn't, each said in the things to look at:

- **Tracked changes** come in as accepted, and are counted: "This file has 214 tracked changes. They are brought in as
  accepted." Look at the file in Word first if you want to accept some and reject others.
- **Comments** in the margin aren't brought in (the words they are on are). A later version will bring them in.
- **Tables** come in as their text, cell after cell.
- **Text boxes** come in once, where the box is.
- **Headers and footers, pictures, fonts, sizes, colors, alignment, line spacing** and page layout aren't brought in.
  The Word file itself is kept in **Research/Originals**.
- **Endnotes** come in as footnotes.

A file from older Word (`.doc`) or one locked with a password is refused, in words: save it as `.docx` with no
password, and choose that.

## The text

Every word comes across, in order, and nothing is added. The heading a chapter is named from is its name and not in
the text; a mark between scenes that becomes a new note is not in it either.

- **Markdown** is cut where the chapters are, so the notes joined are the text, byte for byte, apart from those
  headings. Italics, bold, links, footnotes, tabs at the start of a paragraph, comments and code are as written.
  The note's properties (the block at its top) aren't brought in, and the dialog says so.
- **Plain text** is made into Markdown that reads as it did: a blank line between paragraphs; a paragraph that was
  hard-wrapped at about seventy characters is joined into one line; characters Markdown would take for markup
  (`*`, `_`, `[`, a `#` at a line's start) get a backslash, which Obsidian hides. A paragraph that began with a tab
  keeps it if **Start a paragraph with a tab** is on in settings, and loses it, said, if it is off.
- **Encoding.** A byte-order mark and Windows line endings are no part of the writing. A file that isn't UTF-8 is read
  as Windows-1252, and the dialog says so.
- **Footnotes and links written out at the foot** of a long note stay at its foot, in the last note. Move each beside the note that marks it. The dialog says when there are any. A link to a heading of the old text
  (`[[#Chapter 1]]`) no longer finds one.

## When something is wrong

- **A file that can't be read** is said in the first dialog: a file that isn't text, one with nothing in it, a Word or
  Pages file, or one over 64 MB.
- **A note that changed** after it was read: import says so and stops. Choose it again.
- **Cancel, or a write that fails** partway: the notes already made stay as plain notes, and the message says
  where. The folder is not a binder, because the binder's own note is written last. Nothing is deleted for you.

## Limits

- Word (`.docx`), Markdown and plain text only. A file can be up to 64 MB, and a Word file up to 256 MB unpacked, with 64 MB for its text and 500,000 paragraphs.
- Import always makes a new binder. It never writes into a folder that exists, never changes the note or file it was
  made from, and importing twice makes two. There is no undo for a whole import: delete the folder.
- Setext headings (a line underlined with `===`), centered text in HTML, and chapters found by what a chapter
  contains rather than how it starts aren't read.

Next: [Import from Scrivener](import-scrivener.md) · [Splitting and merging](splitting-and-merging.md)
