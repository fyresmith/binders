# Ebook (EPUB)

An ebook is an EPUB 3 file: what Kindle (through KDP), Apple Books and Kobo take, and what any reading app opens.
Choose **Ebook** in the [Export window](export.md).

## The book's shape, not its typeface

In an ebook the reader chooses the typeface, the size and the colors, and stores remove a book's own. So a style
gives an ebook its shape, not its type: how a chapter opens, its first words, the scene breaks, the indents.

## Choices

| Choice | What it does |
|---|---|
| **Style** | The book's shape: **Classic**, **Modern**, or a style of your own. The sliders button beside it is **Edit this style** |
| **Cover** | **Choose...** a PNG or a JPEG from your vault. **Change...** offers **No cover** as well |

**Classic** sets:

- a centred chapter line in capitals ("Chapter One"), with the chapter's title under it;
- the first words of a chapter in small capitals;
- three asterisks between scenes;
- paragraphs indented, except the first after a heading or a break.

**Modern** sets:

- a large plain numeral at the left, with the chapter's title under it;
- the first words of a chapter as the rest;
- space between scenes, with no mark;
- paragraphs indented, as in Classic.

The style you choose is kept with the book, in its binder note. The same style sets the book's
[paperback](export-paperback.md).

To change a style or make your own, see [Styles](export-styles.md). Opened from **Ebook**, the editor has the rows
that shape an ebook: paragraphs, quotes and dashes, the chapter heading and its lettering, size and place, the
first words, and the scene break's mark. CSS of your own in a style's file reaches the ebook too.

## Pages made for you

- **A title page:** the title, the subtitle and the author.
- **A copyright page:** your copyright line, or "© year author".
- **The contents:** both as a page and as the list the reading app shows. The reading app's list is always there,
  even when the contents page is set to **Never**.

A note of the book named "Title page" or "Copyright" takes the made page's place. Whether each is made, and what
it says, is set in [Book details](book-details.md).

Front and back matter (a dedication, an epigraph, acknowledgements, about the author) are in the book, each on a
page of its own.

The order is: the title page, the copyright page, your front matter, the contents, the text, your back matter.

## The cover

Stores ask for a cover at least 1,400 pixels on its longer side. Kindle likes 2,560. A smaller one is said in the
window before you export.

The cover is the book's cover image and not a page of its own inside the text, as Kindle's guidelines ask.

The cover is kept in the binder note as a link, so it follows the picture when you rename it.

## Footnotes, links and pictures

- **Footnotes** are notes a reader taps open. They are numbered from one in each chapter.
- **Links to the web** are links.
- **A link to a note that is in the book** leads to its chapter. A link to any other note is its words.
- **Pictures** (PNG, JPEG, GIF) are in the file.

## Other languages and scripts

The book's language sets its quotation marks and the words Binders writes ("Chapitre 3", "Kapitel 3"). A book in
Arabic or Hebrew runs right to left, and a paragraph in another script than the book's runs its own way. Set the
language in [Book details](book-details.md).

## The preview

The preview is one column on paper in the book's shape, with the made pages. It is not pages: an ebook has none
until a reader opens it.

## A valid file

The file is written to pass EPUBCheck, the validator the stores use. No typeface is put in the file.

## Limits

- The ebook has been checked with EPUBCheck. It hasn't yet been opened in Kindle Previewer, Apple Books or Kobo by
  the maintainer. See [Known limitations](limitations.md#not-yet-tried).
- Pictures are PNG, JPEG or GIF. The cover is a PNG or a JPEG.

Next: [Paperback (PDF)](export-paperback.md)
