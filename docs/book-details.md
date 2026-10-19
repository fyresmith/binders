# Book details and structure

This page covers what every export of a binder shares: the book's title and author, how its folders and notes
become parts, chapters and scenes, and what your Markdown turns into. It applies to the
[manuscript](export-manuscript.md), the [ebook](export-ebook.md) and the [paperback](export-paperback.md).

## Book details

Book details are the **Book** page of [Binder settings](binder-settings.md). Open it from the [Export window](export.md):
click the button beside the book's name (on a phone it is **Book details** under the choices, and **Book details...**
is in the window's **More** menu too), or open Binder settings from the binder view's **More options**. A change is kept
as you make it; there is no Done.

| Detail | What it is |
|---|---|
| **Title** | The book's title. The folder's name unless you say |
| **Subtitle** | Set under the title on the title page |
| **Author** | Your name from Binders' settings unless you say |
| **Structure** | What a folder and a note are in the book. **Read from the binder's shape** unless you choose. See [below](#how-a-binder-becomes-a-book) |
| **Title page** | Whether a title page is made |
| **Copyright page** | The copyright page's line. With none, and an author, the page says "© year author" |
| **Contents page** | When a contents page is made: **When chapters have titles**, **Always** or **Never** |
| **Language** | Which quotation marks are set, and what the book says it is written in. Chosen from a list |

Under **Publishing**, what a published book says of itself. Each row says where it shows:

| Detail | Where it shows |
|---|---|
| **Series**, **Number in the series** | Under the title on the title page ("The Corran Light, Book Two"), and in the ebook |
| **Publisher** | At the foot of the title page, last on the copyright page, and in the ebook |
| **Edition** | On the copyright page, with the year it is published: "First edition, 2026" |
| **Published** | A date or a year: on the copyright page, and in the ebook |
| **Description** | In the ebook, where a store and a reader's library show it |
| **Keywords** | In the ebook. Separate them with commas |
| **Contributors** | One row each (**Add...** asks the role: editor, translator, illustrator, cover designer, narrator): on the copyright page ("Edited by June Hale") and in the ebook |
| **More on the copyright page** | More lines, each as typed: "All rights reserved.", a disclaimer |

The ISBN isn't here: each ebook or paperback export has its own (the **ISBN** row in the Export window), since a
Kindle edition and a paperback have different ones.

There is no Save button. Each detail is kept as you change it, as a property of the binder note and nowhere else.
One you clear is taken out of the note again. Nothing else in the note is touched.

The book's cover, and its [exports](export.md#the-books-exports) with their styles and pages, are kept in the binder
note too. They are chosen in the Export window, not here.

A note of the book named "Title page" or "Copyright" takes the made page's place.

Your name and contact details, for a book that doesn't say otherwise, are under **Settings → Binders → Export**.

A Longform project has no Book details to write: its note is Longform's. Type the same details as properties of the
project's note and export reads them. The property names are in the [file format](dev/file-format.md#export).

## How a binder becomes a book

Every note and folder plays a part in the book: a part, a chapter, a scene, front matter or back matter. Binders
works it out from the binder's shape.

| The binder's shape | What export makes of it |
|---|---|
| No folders | Every note is a chapter |
| Folders one level deep | Folders are chapters, and the notes in them are scenes, joined with a scene break. Notes at the top, side by side, are the scenes of one chapter in the same way, until a folder comes; a note named Prologue, Epilogue and the like is a chapter of its own and ends the run, and so is a note you set to Chapter in **Export as** |
| Top folders all named "Part…", "Book…" or "Act…" | Folders are parts, notes are chapters |
| Folders in folders | Parts, chapters and scenes |
| A Longform project | Every note is a chapter |

**Contents**, in the Export window, lists every item with the part it was given, so you can check before you
export. A part Binders worked out is said more quietly than one you set.

### Chapter numbers and titles

- A chapter is numbered ("Chapter One") unless it is named Prologue, Epilogue, Interlude, Introduction, Foreword,
  Preface or Afterword.
- A chapter's title is its note's or folder's name without a number it starts with: "03 - Storm warning" is "Storm
  warning".
- A name that is only a number, or "Chapter 3", gives no title: the chapter is just numbered.
- A level-one heading at the top of the note is the title instead.

### Front and back matter

These are front or back matter:

- notes at the start or the end of the binder named Dedication, Epigraph, Acknowledgements, About the author, Also
  by, Copyright or Title page;
- everything in a folder named "Front matter" or "Back matter".

An ebook and a paperback include them, each on a page of its own. A manuscript leaves them out unless you tick them
in **Contents** in the Export window. Any one of them can be left out of one export only, by its box there.

### Overruling it

- **For one note or folder:** set **Export as** to **Part**, **Chapter**, **Scene**, **Front matter** or **Back
  matter**. **Automatic** goes back to what its place gives it, and the menu says what that is ("Automatic:
  chapter"). **Leave out** takes it out of every export. What is in a folder follows: notes in a folder that is a
  chapter are scenes. A folder can't be a scene.
- **For the whole book:** set **Structure** in Book details to **Folders are chapters, notes are scenes**,
  **Folders are parts, notes are chapters**, **Parts, chapters and scenes** or **Every note is a chapter**.

**Export as** is in four places, and they are one setting:

- a card's or a row's right-click menu, where **Leave out** is **Include in export** unticked;
- the outliner's **Export as** column;
- the [inspector](inspector.md);
- a row of **Contents** in the Export window: click the part at the row's end.

With several cards or rows selected, it is set on all of them. A Longform project has no **Export as**: every note
of it is a chapter.

**Export as** is kept in the note's `export-as` property, and **Structure** in the binder note's `structure`.

A folder deeper than the structure reaches is listed under the things to look at.

## What your Markdown becomes

Properties are never exported. For the rest:

| In your note | In the book |
|---|---|
| A new line | A new paragraph |
| A tab or spaces at a paragraph's start | Dropped: the book indents every paragraph itself |
| Two spaces or a backslash at a line's end | A line break |
| Italic, bold, strikethrough | Stay as they are |
| Straight quotes | Curled, in the book's language |
| `--` | A dash |
| `...` | An ellipsis |
| `---`, `***` or `___` alone on a line | A scene break |
| The join of two scenes | A scene break |
| A heading inside a note | A subheading |
| A link to a note | Its words. In an ebook, a link to a note that is in the book leads to its chapter |
| A web link | A link. On paper, its words |
| Footnotes, `[^1]` and `^[typed in place]` | Footnotes: at the foot of the page in Word and in a PDF, notes a reader taps open in an ebook |
| Comments, `%% %%` and `<!-- -->` | Left out |
| Block ids, and lines of nothing but tags | Left out |
| Highlights | Their words |
| A callout | A quotation with its title in bold |
| Quotations, lists, tables, fenced code | Stay what they are |
| `![[A note]]` | That note's text, one level deep |
| A PNG, JPEG or GIF picture | Set in the page |

What can't be exported is counted first and listed in the window. See [Export](export.md#things-to-look-at).

## Other languages

The book's **Language** sets its quotation marks and the words Binders itself writes ("Chapitre 3", "Kapitel 3").
A book in Arabic or Hebrew runs right to left, and a paragraph in another script than the book's runs its own way.
Chapter numbers are written as words only in English.

Next: [Styles](export-styles.md)
