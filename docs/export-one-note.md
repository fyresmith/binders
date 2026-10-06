# One note

**One note** joins the whole binder, or the folder shown, into a single Markdown note in your vault. Use it to read
the draft in one piece, to paste it somewhere, or to hand it to another tool that takes Markdown. Choose **One
note** in the [Export window](export.md).

In earlier versions this was called Compile.

## Choices

| Choice | What it does |
|---|---|
| **Title** | On as it comes. Puts the binder's name at the top as the first heading |
| **Folders as headings** | On as it comes. Each folder's name becomes a heading |
| **Note titles as headings** | Off as it comes. Each note's name becomes a heading |
| **Between notes** | What separates one note from the next: `* * *` (as it comes), `#`, `---` or a blank line |
| **Leave out comments** | On as it comes. Takes out `%% comments %%` and `<!-- HTML comments -->` |
| **Take tabs off paragraphs** | On as it comes. Takes off the tabs that start paragraphs. Outside a binder Obsidian shows such a line as code; see [Paragraphs](paragraphs.md) |
| **Save as** | The note to write: a path in this vault, outside the binder |

The note is the notes' text only, without their properties. Notes with **Include in export** off are left out, and
the window says how many.

## Exporting

- **Export** writes the note and opens it. It is named after the binder or folder with "(exported)", as in
  "The Lighthouse (exported)", and goes beside the binder, never in it, unless you change **Save as**.
- **Copy** copies the text instead of saving it.

## Exporting again

Exporting again offers the same note, and replaces the last one. A note that has been written in since, or that
wasn't made by an export, is asked about first.

## The preview

The preview is the note as it will read. For a very long binder only the start is shown; the note itself has all of
it.

## Limits

- One note doesn't use [Book details](book-details.md) or the book's structure. It is your Markdown, joined.
- Your notes aren't changed.

Next: [The file explorer](file-explorer.md)
