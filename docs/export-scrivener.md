# Scrivener project

This kind of export makes the binder itself, not a book of it, as a Scrivener 3 project (`.scriv`). Use it to move
on to Scrivener, or to send the book to someone who works there. Choose **Scrivener project** in the
[Export window](export.md).

Nothing is typeset and nothing is joined. Every note is a document, every folder a folder, in your binder's order
under **Draft**. Quotes and dashes stay as you typed them.

## Choices

| Choice | What it does |
|---|---|
| **Notes outside the manuscript** | On to start with. Puts notes that aren't part of the book in Scrivener's **Research** folder. See below |
| **Snapshots** | On to start with. Carries each note's [snapshots](snapshots.md) across, with their names and dates |

### Notes outside the manuscript

With the switch on, these go to **Research**:

- the binder note's own text;
- any note or folder at the top of the binder that is left out of export, which is how a binder keeps research
  beside its book;
- for a Longform project, the notes in its folder that aren't scenes.

With it off, the first and last are left behind, and the second stay where they are in the Draft, marked as not
included in compile.

A note left out deeper in the binder, such as a cut scene inside a chapter, always stays in its place, marked as not
included in compile.

## What is carried across

| In Binders | In Scrivener |
|---|---|
| Synopsis | Synopsis |
| Labels, with their colors | Labels. Your list from Binders' settings becomes the project's |
| Statuses | Statuses. Your list becomes the project's |
| Word count targets | Targets. The binder's own becomes the draft's |
| **Include in export** off | "Not included in compile" |
| Snapshots | Snapshots, with their names and dates |
| A folder note's text | The folder's own text |
| Tags | Keywords |
| Your [notes on a note or folder](scene-notes.md) | The document's notes, as plain text: what you typed, with its `#`, stars and brackets as they are |
| Your other properties | Custom metadata |
| Part, chapter and scene | A section type each, so Scrivener's own Compile has something to work with |

## What the text becomes

The text becomes rich text: italics, bold, headings, lists, quotations, links and pictures.

| In your note | In the project |
|---|---|
| A footnote | Scrivener's inline footnote |
| A `%%comment%%` | Scrivener's inline annotation |
| A link to a note in the binder | A link to that document |
| A paragraph you began with a tab | A first-line indent, and no tab |
| A callout | A block quotation with its title in bold |
| A picture (PNG or JPEG) | In the text, and a file in Research |
| A table, a note embedded in another, a GIF | Stays as you typed it |

What rich text has no match for stays as you typed it, and the window lists each place first.

## Where it goes

**On a computer**, a `.scriv` folder is written where the save dialog says. A Mac with Scrivener shows it as one
file. It is written whole or not at all.

Exporting again replaces a project that is still exactly as export left it. A project you have since opened in
Scrivener is never written over, because what you did there would be lost. The window says so and offers to save
beside it, as "The Lighthouse 2.scriv".

**On a phone or tablet**, the project is zipped into the `Exports` folder and handed to the share sheet. Unzip it
where Scrivener is.

## One way

Export makes a new project and changes nothing in your vault. To read a project back in, see
[Import from Scrivener](import-scrivener.md): it makes a new binder, and doesn't merge into the one the project came from.

## Scrivener versions

The project is written for Scrivener 3. Scrivener's format has no published description, so Binders follows
projects Scrivener itself wrote.

If a project doesn't open, or something arrives wrong,
[open an issue](https://github.com/fyresmith/binders/issues) with your Scrivener's version and system.

See also: [Coming from Scrivener](scrivener.md).

Next: [One note](export-one-note.md)
