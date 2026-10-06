# Book details and structure

This page covers what every export of a binder shares: the book's title and author, how its folders and notes
become parts, chapters and scenes, and what your Markdown turns into. It applies to the
[manuscript](export-manuscript.md) and the [ebook](export-ebook.md).

## Book details

In the [Export window](export.md), click the button beside the book's name. On a phone it is **Book details**
under the choices. **Book details...** is in the window's **More** menu too.

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

There is no Save button. Each detail is kept as you change it, as a property of the binder note and nowhere else.
One you clear is taken out of the note again. Nothing else in the note is touched.

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
| Folders one level deep | Folders are chapters, and the notes in them are scenes, joined with a scene break. A note at the top is a chapter by itself |
| Top folders all named "Part…", "Book…" or "Act…" | Folders are parts, notes are chapters |
| Folders in folders | Parts, chapters and scenes |
| A Longform project | Every note is a chapter |

**Contents**, in the Export window, lists every item with the part it was given, so you can check before you
export.

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

An ebook includes them, each on a page of its own. A manuscript leaves them out unless you turn on **Front and back
matter**.

### Overruling it

- **For one note or folder:** set **Export as** in the [inspector](inspector.md) to **Part**, **Chapter**,
  **Scene**, **Front matter** or **Back matter**. **Automatic** goes back to what its place gives it. What is in a
  folder follows: notes in a folder that is a chapter are scenes.
- **For the whole book:** set **Structure** in Book details to **Folders are chapters, notes are scenes**,
  **Folders are parts, notes are chapters**, **Parts, chapters and scenes** or **Every note is a chapter**.

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
| A web link | A link |
| Footnotes, `[^1]` and `^[typed in place]` | Footnotes |
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

Next: [Manuscript (Word)](export-manuscript.md)
