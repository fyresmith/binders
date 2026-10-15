# Export

Export turns a binder into a file you can send or publish. It is what Scrivener calls Compile. Your writing stays
plain in Obsidian, and the look is given when the book is exported.

Export reads your notes and writes the exported file. Your notes aren't changed.

## What you can make

| Kind | What it is | Page |
|---|---|---|
| **Manuscript** | A Word file (.docx), or a PDF, in standard manuscript format, for agents and editors | [Manuscript](export-manuscript.md) |
| **Ebook** | An EPUB for Kindle, Apple Books and Kobo | [Ebook](export-ebook.md) |
| **Paperback** | A print-ready PDF: the book on a page of the size it will be printed at | [Paperback](export-paperback.md) |
| **Scrivener project** | The binder itself as a Scrivener 3 project (.scriv) | [Scrivener project](export-scrivener.md) |
| **One note** | The whole binder as a single Markdown note in your vault | [One note](export-one-note.md) |

A manuscript is set in a **manuscript style**; an ebook and a paperback in a **book style**. Change
one, or make your own, in the [style editor](export-styles.md).

A PDF is made on a computer. On a phone or tablet you can look at its pages and choose its style, and export it when
the vault is open on a computer.

## Opening the Export window

- In the binder view, open **More options** (the three dots) and choose **Export...** (once the binder has been exported, it is under **Export**).
- In the file explorer, right-click a binder, or a folder in one, and choose **Export...**.
- On the corkboard or in the outliner, right-click a folder and choose **Export...**.
- From the command palette, run **Export binder**, or **Export with...** to choose one of the binder's exports by
  name and open the window on it.

Export works on the binder, or on the folder you opened it from: export one part of a book by exporting its folder.

## Export again

Once a binder has been exported, **Export again** makes the same export once more (the one last made, by its name),
in the same place, without opening the window. It is in the binder view's **More options** menu, under **Export**, and in the command palette.

- It uses the choices as they stand now: that export's style, page and part of the book, and the book's details.
- It asks one thing, and only when it must: whether to replace a file that is no longer the one the last export
  left there.
- A binder that hasn't been exported on this device gets the window instead.
- On a phone or tablet the file goes to the `Exports` folder and then to the share sheet, as always.

## The window

![The Export window with Ebook chosen: the five kinds and the ebook's choices on the left, the book as it will read on the right](images/export.png)

The window has two sides.

**On the left**, what to make and its choices:

1. The book's exports. A binder starts with one of each kind (Manuscript, Ebook, Paperback, Scrivener project, One
   note); under each name is what it makes ("Word · Standard manuscript", "PDF · Classic · 6 × 9 in"). Click one.
   The window opens on the one you made last. See [The book's exports](#the-books-exports).
2. The chosen export's few choices, such as **Style**. Each kind's page lists them. The sliders button beside
   **Style** is **Edit this style**: see [Styles](export-styles.md). A manuscript, an ebook and a paperback also
   have **What goes out** (below), and an ebook and a paperback their **ISBN**.
3. Where the file will go, or where it went.
4. A list headed "3 things to look at" (or however many): what export will leave out or change. See
   [below](#things-to-look-at).

Beside the book's name is the **Book details** button, for a manuscript, an ebook or a paperback. See
[Book details and structure](book-details.md).

**On the right**, what is being made:

- Its name and size: "12,480 words · 9 chapters", or for a PDF "212 pages · 5 × 8 in". When only part of the book
  goes out, that comes first: "Part Two · 18,400 words · 4 chapters". The words are the text's, without the front
  and back matter.
- **Contents** lists the pages Binders makes, then every note and folder that goes out, with the part it was given
  in the book: part, chapter, scene, front or back matter. Front and back matter, and the pages Binders makes, have a
  box: untick it to leave that page out of this export only. Click a row to open its note. Click the part at the end of a row to
  change it: see [Export as](book-details.md#overruling-it). Click **Contents** again for the preview.
- **Export** makes the file. While a long book is being made the bar says what it is doing, with **Cancel** beside
  it.
- The **More** menu has **Choose where to save...**, **Show the Exports folder**, **Edit this style**, **Book
  details...** and **This export** (New export, Duplicate, Rename..., Delete).
- The preview: the text as it will read. For a PDF it is the pages themselves, exactly as they will print.

Nothing has to be decided before the first file. Choose a kind and choose **Export**.

## The book's exports

A book usually goes out in several ways: a submission manuscript, a chapter for a critique group, a Kindle ebook, a
Kobo one, a paperback. Each can be an export of its own, named, with its own choices, ready the next time.

- **Right-click an export** (or open **More**, then **This export**) for **New export** (choose a kind), **Duplicate**,
  **Rename...** and **Delete**. Deleting an export deletes no file it made, and changes no note.
- **Each export keeps its own choices:** its style, a manuscript's file and paper, a paperback's page, what goes out,
  which front and back matter it takes, and an ebook's or paperback's ISBN. The style is the vault's: two exports
  that use Classic share it, and changing Classic changes both.
- **Its file is named for it** when its name isn't its kind's: "The Lighthouse (Kindle).epub". Each export remembers
  its own place to save.
- They are kept in the binder note, as `exports`, so they travel with the book. A binder that has never named one
  shows the five kinds, and nothing is written until you change one.

### What goes out

**What goes out** chooses what part of the book an export takes:

- **The whole book** (as it comes);
- **a folder**, such as one part;
- **a saved filter**: the notes it keeps, each with the folders that hold it (see [Filters](filters.md));
- **the selected cards**, offered only when you open the window with several cards or rows selected. It is for this
  export only, and is never kept.

When only part of the book goes out, front and back matter don't, and **Numbering** says whether chapters keep their
numbers from the whole book ("Chapter Seven") or start from 1. If the folder or filter an export names is gone, the
window says so under the things to look at, and Export is off until you choose another.

## Where the file goes

### On a computer

1. Export opens your system's save dialog. It starts in a folder named `Exports` beside the binder.
2. Choose where to save. This is the one place Binders writes outside your vault, and only where you say.
3. The window then says where the file was saved, with **Show in folder** and **Open**.

Under that is **Save here next time without asking**. Tick it and later exports of that kind, of that binder, go
straight to the same place.

- A file already there that export didn't write, or that has been changed since, is asked about before it is
  replaced.
- To be asked again, choose **Choose where to save...** in the window's **More** menu, untick the box, or choose
  **Ask again** under **Remembered places** in Binders' settings.
- **Show the Exports folder**, in the **More** menu, opens that folder in your file manager. The folder is made when
  a file is first saved there.
- A manuscript exported as a PDF to the place its Word file was saved goes beside the Word file, not over it.
- Remembered places are kept on the device, not in your vault, since a path on one computer means nothing on
  another.

### On a phone or tablet

The file goes into the `Exports` folder in your vault, and then to the share sheet, so you can send it to another
app. A Scrivener project is zipped first. A PDF isn't made there: see [Paperback](export-paperback.md#on-a-phone-or-tablet).

### The Exports folder

- **Exports folder** in Binders' settings renames it. A name, such as `Exports`, is a folder beside each binder. A
  path, such as `Books/Exports`, is one folder for the whole vault.
- Obsidian lists a .docx or an .epub in its file explorer only with **Detect all file extensions** turned on, under
  **Settings → Files and links**. The files are there either way.

**One note** is different: it makes a note in your vault, where you say. See [One note](export-one-note.md).

## Leaving a note out

Turn off **Include in export** on a note or a folder to leave it out of every kind of export. A folder that is left
out takes everything in it along.

You'll find **Include in export** in:

- a card's or row's right-click menu, as **Leave out** under **Export as** (a Longform project's notes have **Include in export** as a row);
- the outliner's **Export** column;
- the [inspector](inspector.md).

**Leave out**, under **Export as** in the same menus and on a row of **Contents** in the Export window, does the
same thing.

This is how a binder keeps research, character sheets or an outline beside its book.

To leave a page of front or back matter out of **one** export only (the Kobo "Also by" page from the Kindle ebook),
untick its box in **Contents** instead: see [The window](#the-window). A manuscript takes no front or back matter
until you tick it there.

## Things to look at

Under the choices the window lists each thing export will leave out or change, with the note it is in. Click one to
open its note (or, for a style's line, the style editor).

- a picture that isn't found, or isn't a PNG, JPEG or GIF;
- an embedded PDF or other file;
- part of a note embedded by its heading;
- math, and a tag in a line of text (both exported as you typed them);
- HTML (its text is kept);
- a folder deeper than the book's structure reaches;
- for an ebook, a cover smaller than stores ask for;
- for a paperback, a book whose language isn't written in letters the style's typeface has;
- a line of a [style's file](export-styles.md#a-styles-file) that can't be read;
- an export whose folder or saved filter is gone (nothing is exported until another is chosen).

What is listed is for you to decide about. The export goes ahead either way.

## What is remembered

A book's exports and their choices, and its own details, are kept in its binder note. Which export you chose last,
and where each saves, are kept on the device. One note's switches, and the file and paper a manuscript takes when
its export says none, are kept in Binders' settings, for the vault. See [Book details and structure](book-details.md).

## Limits

- A PDF is made on a computer only.
- Pictures in formats other than PNG, JPEG and GIF are not exported.
- Export doesn't change your notes. A Word manuscript can be [imported as a new binder](import-manuscript.md),
  and a Scrivener project has its own [import](import-scrivener.md). Neither merges changes into the original binder.

Next: [Book details and structure](book-details.md)
