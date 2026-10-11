# Import: the pipeline and the rules

How a manuscript that is not a Scrivener project becomes a binder. Scrivener's import has its own page
(`docs/import-scrivener.md`) and its own pure code (`src/import/scriv/`); the two share the plan, the writer and the
second dialog. The manual page for writers is `docs/import-manuscript.md`. The plan this was built from was written
2026-10-10; where this page and that plan differ, this page is the code.

## Built, and not

| Step | What | State |
|---|---|---|
| 0 | The shared plumbing: `src/import/plan.ts`, `readZip` in `source.ts`, `markdown.ts`, `src/view/import-window.ts` over an `ImportJob` | Built |
| 1 | A Markdown or plain text file, or a note of the vault, as a new binder | Built |
| 2 | A Word `.docx` as a new binder (from a file, or a `.docx` of the vault from its menu or "Choose from this vault...") | Built. The reader is `src/docx/`; the importer is `src/import/docx.ts` |
| 4 | What Word files carry: comments, Reject all, underline, pictures, numbered headings | Built (`settle` options, `src/import/docx.ts` `wordRead`, rows in `manuscriptJob`) |
| 3 | Merge, split and rename in the preview | Built: `Edits`, `actionsFor` and `applyAction` in `manuscript.ts`; `ImportJob.rowActions`, `paragraphs`, `startHere` in the dialog |
| later | `.odt`, `.rtf`; "Split at headings..." for a note already in a binder (it changes that note: it waits for the undo history's split step) | Not built |

## The pipeline

```
bytes ── decodeText ── scanMarkdown / scanPlain ── Unit[] ── detect ── Cut[] ── planManuscript ── ImportPlan ── writeImport
                                  │                                                │
                                  └── Scan.text (what pieces are cut from)         └── slices of Scan.text by the units' offsets
```

- **`text.ts`** reads bytes as text: a byte-order mark says UTF-8 or UTF-16, else UTF-8 if it is valid, else
  Windows-1252 (and said). Line endings are made `\n`. A text with many control characters is refused.
  - `scanMarkdown` finds units in the text itself. A unit is a heading (ATX only, outside fences, `$$`, `%%` and
    `<!--` blocks), a mark on a line of its own between blank lines, an opaque block, or a paragraph (lines up to a blank
    line or a heading). Each unit has its offsets, so a piece is `text.slice(first.start, last.end)`: **the writer's
    own bytes**. A note's properties are skipped (`Scan.skipped`).
  - `scanPlain` first makes the text into Markdown (paragraphs with one blank line between; a hard-wrapped paragraph
    joined when most lines of the multi-line paragraphs are near the longest; `escapeMarkdown` on the rest; a mark
    becomes `***`; a leading tab kept only with "Start a paragraph with a tab" on; a title directly over its text split
    off), and finds units in that. A form feed is a page break.
- **`detect.ts`** is pure and knows nothing of files. It is handed `Unit`s (`text`, `heading`, `pageBefore`, `centered`,
  `emphatic`, `words`, `gap`, `marker`, `toc`, `start`, `end`) and the writer's `Choices` (the signal, a role per heading
  level, what scene breaks do), and answers `{ found, cuts }`. A `Cut` is a unit where a part, chapter or scene starts;
  `drop` says the unit is the title (it becomes the name and leaves the text).
- **`manuscript.ts`** makes cuts into the plan. Pieces are slices; names are `nameOf(heading)`; a chapter with one
  scene is a top-level note and with more a folder; the binder note gets `structure`.
- **`writeImport`** (`vault.ts`) is unchanged: new folder only, every file read back, the binder note last.

## The rules (detect.ts)

Agree with export's (`src/export/roles.ts`: `NUMBER`, `PARTLIKE`, `UNNUMBERED`, `MATTER` are exported for this).

- **R0.** Not a chapter's start: a unit in a table of contents by its style, and a run of three or more lines that read
  as chapters with fewer than 30 words between them.
- **R1. Headings.** `byLevel` is every heading but the book's title. The shallowest level with two or more is the
  chapters, or the parts if each text matches `PARTLIKE` and a deeper level with two or more exists (then that is the
  chapters). The level under the chapters is scenes if half the chapters have one, else `text`. A lone heading above
  the rest, first in the text, with at least two other headings, is the book's title. A level with one heading is `text`.
- **R2. Lines that read as titles**, when headings give fewer than two chapters. At most eight words, and one of:
  `chapter|part|book|act` and a number alone, or a separator and a title (or anything, if the line is centered or
  emphatic); `UNNUMBERED`; a bare figure, Roman numeral or spelled number if the line is centered or after a page
  break. No full stop at the end, except after "Chapter 12." Part-like ones are parts only beside chapters.
- **R3. Page breaks**, when R2 gives fewer than two: a short centered, emphatic or capital line after a page break.
- **R4. Scene breaks**, among the chapters: a mark (at most 12 characters, no letter or digit, `xxx`, `ooo`, `o0o`; not a
  lone `-`, `>` or `|`), else a unit with two or more blank lines before it, if fewer than a tenth of the gaps are
  that wide. A mark before the first chapter is front matter's text. "Keep in the text" makes no cut.
- **R5. Sanity.** Over 30% of the chapters under 50 words, or a median under 200: `doubtful`.
- **R6. Nothing found.** No cuts but scene breaks. With none, the plan is one note, "Manuscript". With only scene breaks,
  one folder "Chapter 1" of scenes (a chapter whose name is only a number has no title in an export). Never by length.

At one unit the highest cut wins (part over chapter over scene). The default signal is the first of headings, titles,
pages with two or more; a signal the writer chooses with none is `none`.

## What the plan makes

- Front matter before the first chapter, in a folder `Front matter` (export gives everything in it the front role), cut
  at headings that match `MATTER`; the first piece is "Title page".
- A part's own text, if it has some, is a note "*Part* text" first in its folder (as Scrivener's folders do).
- **`structure`** is written in the binder note: `notes` if no chapter has scenes and there are no parts; `chapters` if some
  have; `parts` or `parts-chapters` with parts. The guess (`guessStructure`) is never relied on.
- **Names:** `nameOf` strips marks, writes "Chapter 12: X" as "Chapter 12 - X" (export's `titleFrom` strips a number only when a
  separator follows), and puts capitals in title case. A note whose name differs from its heading by more than case and
  punctuation (compared by words) begins with `# the heading`. A folder can't: it is listed. `PlannedNote.heading` is the
  exact source heading.
- **Originals:** a file from the device goes to `Research/Originals/<name>`, with `Research` an `export: false` folder. A
  `.md` or `.markdown` gets `.original` after its name so it isn't a second note of the binder (a decision the plan didn't
  make: Obsidian would list it as a scene, and the binder's word count would count it twice). A note of the vault is linked, not copied.
- **Said** (`plan.said`, and in the binder note's "Import notes"): encoding, a skipped properties block, footnotes and links
  written out at the foot (they stay at the foot of the last note: moving each to the note that marks it is the same rewrite as
  "Split at headings...", and isn't done), links to a heading, no chapters found, doubtful chapters, a folder whose name isn't its heading,
  tabs dropped.

## Tests

- `tests/import-detect.test.ts`: each of R0 to R6, the choices.
- `tests/import-manuscript.test.ts`: decoding, a note with clean headings, lines, nothing, parts, names, plain text,
  Markdown details, the original, 200,000 words in time. **The word-for-word test**: the words of the source
  (`noteWords` of the whole text, from `tests/export-scriv-words.ts`) equal, for each planned row in order, the words of its
  `heading` and then of its body (a leading `# heading` line taken off). The test is tested: a paragraph dropped from a note,
  two chapters swapped and a word added are each noticed. For Markdown a second check holds the bytes: the lines of the pieces
  are the lines of the source apart from the headings that became names and the marks that became boundaries.
- `tests/import-source.test.ts`: `readZip`'s filter and wording, the exports the detector needs.
- `tests/e2e/specs-import-manuscript.mjs`: the real dialogs. A note from its menu (the binder shown before anything is made, the source
  note byte for byte after, the words in order from the files Obsidian wrote), lines, nothing, a name taken, a CRLF file and one with a
  byte-order mark through the browser's file chooser, Windows-1252, cancel, a Scrivener zip passed on, a Word file refused, a phone.

## The Word reader (`src/docx/`, `src/import/docx.ts`)

```
bytes ── readPackage ── readDocx ──▶ DocxFile ── settle(file, 'final') ──▶ SourceDoc ── docToScan ──▶ Scan ── (as for Markdown)
```

`docToScan` writes each paragraph as Markdown with a blank line between (list items under one another) and a `Unit` for
it, so `detect` and `planManuscript` are the same for Word and for Markdown, and the pieces are slices of that text.

**The subset read.** Everything else in the file is ignored, and the ones worth knowing are counted and said.

- **The package** (`package.ts`): a zip whose directory is walked by hand before anything is inflated (`readZip`, the same
  limits: 256 MB unpacked, 20,000 parts); the main part is found through `_rels/.rels`, never by its name; media
  (`word/media`, embeddings, images) is never inflated; a part named with a climbing path is refused; `word/document.xml`
  may be 64 MB. A file beginning `D0 CF 11 E0` (an older `.doc`, or any password-locked Office file, which is that
  container) is refused with a sentence; anything else not a zip is "not a Word file".
- **XML** (`xml.ts`): a stream of events from a sticky regular expression. No tree. A DOCTYPE, an entity declaration, an
  entity other than the five and character references, a tag that closes what is not open, or text left open: refused.
  Namespace prefixes are taken as written (`w:`, `mc:`).
- **Styles** (`styles.ts`): a paragraph style's built-in `w:name` (lower case; the id is never used), `outlineLvl`, `jc`,
  `ind` and `pageBreakBefore`; a character style's bold and italic; through `basedOn`, with a cycle guard. Numbering:
  whether a list's level is `bullet` or counts.
- **Paragraphs** (`read.ts`): runs with bold, italic, strike, underline (`w:b`, `w:i`, `w:strike`, `w:u`, and a character
  style's), tabs, line and page breaks, links (`w:hyperlink` by relationship), footnote and endnote references, comment
  range anchors, pictures (counted), fields (an instruction is never text; one that begins `TOC` marks its paragraphs), a
  content control whose `docPartGallery` is "Table of Contents", tables (their paragraphs, in order), text boxes
  (`w:txbxContent`, whose paragraphs are read once: `mc:Fallback` is skipped), a section's end (the next paragraph starts a
  page).
- **Revisions** (`read.ts` keeps every one, `settle.ts` resolves): `w:ins`, `w:del`, `w:moveFrom`, `w:moveTo`, and a paragraph
  mark's. Import calls `settle(file, 'final')`: deletions and moved-from text are gone, a deleted paragraph mark joins the
  paragraph to the next. `'original'` is the other settling, for a later "An editor's changes".
- **Said and not brought in:** comments (their anchors are read and dropped), headers and footers, pictures, tables'
  layout, endnotes' kind (they come as footnotes), fonts, sizes, colors, alignment other than centered (which only
  informs the detector), line spacing.

**What a heading is** (`docToScan`): style name `heading N`, or an outline level (direct or from the style, 0 to 8). `title`
and `subtitle` are the book's title (text in the front matter). A line break inside a heading is " - ": Binders writes
"Chapter One", a break, then the title, and "Chapter One - The jetty" is what export strips the number from. A Heading 1
that says "Part One" (or Book, Act) with nothing under it but the next heading, among chapters not so named, is a part (as
Binders' export writes parts: at one level with the chapters).

**Footnotes** are written in place as `^[...]` (Obsidian's inline footnote), so none is left at a foot and "split at
headings" has nothing to move. A footnote's own words are flattened to one line; a note inside a note is its words in the
text.

**Quotes and lists:** a style named `quote` or `block text`, or left and right indents of at least 720 twips, is a `> `
paragraph; a paragraph with a list is `- ` or `1. `, nested by level.

**Unverified, because no file from these programs is on this machine.** Each rests on what the program writes, and was
written from the file format's specification and the tests' own fixtures.

1. That Word writes a heading's style name as `heading 1` in `w:name` in every language (a localised Word changes the
   id, we are told; the fixture has the id `berschrift1` with the name `heading 1`).
2. That Word writes a text box twice (`mc:Choice` and `mc:Fallback`) with the same words, and that skipping the fallback
   reads it once.
3. That a heading Word numbers automatically ("Chapter 1" from a list, not typed) may hold no text. Such a heading is read as an empty
   paragraph: no chapter starts there, and no word is lost (it has none). Not done: naming it "Chapter N" by count.
4. That Word's table-of-contents field is `TOC` in its instruction, and that a content control's gallery is "Table of
   Contents" (these are in the specification, and LibreOffice writes the first).
5. That Google Docs, Pages, Atticus, Vellum, Dabble and Novelcrafter write a `.docx` this reader reads as Word's does:
   a document with `w:p`, `w:pStyle`, `w:r`, `w:t` in the usual places. Google Docs is said to write real heading styles
   and its suggestions as tracked changes; Pages' export to Word is said to write headings as direct formatting
   (bold, large) rather than styles, in which case chapters are found by R2 and R3 only.
6. That a password-locked `.docx` is an OLE container beginning `D0 CF 11 E0` (the specification says so, and "Encrypt
   with password" in Word produces one).
7. That `docProps/app.xml`'s `<Application>` names the program ("Binders" is checked: a Binders file's first-line indents
   read back as tab paragraphs).
8. That a `w:sectPr` in a paragraph's properties starts the next page.

**Files the maintainer needs to make**, each saved beside a plain-text copy made by the same program's own "Save as text",
the trusted oracle (the importer's words must equal that file's), in `tests/fixtures/import/`:

1. Word, a manuscript with real Heading 1 and Heading 2 styles, a footnote and an endnote.
2. Word, no styles: centered bold "CHAPTER TWELVE" after page breaks, `#` between scenes, tab-led paragraphs.
3. Word, with tracked changes (insertions, deletions, a moved paragraph, a deleted paragraph mark), comments, and Track
   Changes left on.
4. Word, with a text box, a picture, a table, and a table of contents made by References, Table of Contents.
5. A Courier manuscript with underlining for italics.
6. A Google Docs download as `.docx` with headings, suggestions and comments (and its "Download as Markdown").
7. A Pages "Export To, Word" file with chapter titles as plain large text.
8. LibreOffice saved by hand as `.docx` (the test already reads one made by `--convert-to` from HTML).
9. A Scrivener "Compile to .docx".
10. A password-locked `.docx`, and an old `.doc`.
11. One novel-length manuscript, kept out of the repository, to be read through a folder named by `BINDERS_IMPORT_SAMPLES`
    (any of the files above can go in the same folder).

**Step 4 (what a file carries).** `settle(file, as, { underline, comments })`:
- *Comments*: `read.ts` reads `comments.xml` (`DocxFile.comments`: id to author and text) and keeps the range anchors; `settle`
  puts a `{ kind: 'comment' }` run where a range ends, written `%%Author: text%%` (`%%` inside is `% %`). Off, none, said. In a
  heading they are dropped and said. The word oracle (`docxWords(bytes, { comments: true })`) puts the same words at the same
  place.
- *Tracked changes*: `'final'` or `'original'`, chosen in the dialog (`WordRead.reread`). A choice that changes the paragraphs
  lets go of the edits made by hand (they are keyed by unit).
- *Underline*: italic when the file has no italics, or when the writer says so; otherwise plain.
- *Pictures*: `a:blip r:embed` (and `v:imagedata`) give a picture run its relationship; `settle` keeps PNG and JPEG
  (`SourceDoc.pictures`, bytes only through `load()`, which inflates that one part, up to 32 MB); the text carries
  `![[binders-import-picture-N]]`, and `planManuscript` asks for the bytes the first time a note embeds a picture, puts them in
  `Research/Attachments/Picture N.png|jpg` and writes the embed with the whole path. A picture in a heading is dropped, said.
- *Numbered headings*: a style's `numPr` (or a paragraph's own) with a heading and no text is a heading unit with no words;
  the plan names it "Chapter N" by count and says so.
- *Tables*: their text, cell after cell, and a sentence. A Markdown table was weighed and not done: a cell may hold several
  paragraphs and a cut may fall inside a table, and a table made of units can't be cut safely.

**Samples.** `BINDERS_IMPORT_SAMPLES=<folder>` makes `tests/import-docx.test.ts` read every `.docx` in the folder: the plan's
words must equal `docxWords` (comments on), and the words of a `.txt` of the same name where there is one (as a set when the file
has footnotes, since a program's "save as text" puts them where it likes). Unset, it says in capitals that it was skipped.

## Round trip (`tests/import-roundtrip.test.ts`)

A binder exported by `writeDocx` in each of the three manuscript styles and imported again: the words equal a second reader's;
the words that went in come back; chapters and parts and their titles are the book's sections (by `titleFrom`); every word has
the italics, bold and strike it had. By design it cannot return straight quotes (export typesets them), comments, block ids,
tag lines or the notes' names. A book is not compared for chapters and formatting when it has one chapter with subheadings
(read as chapters by its subheadings), a footnote marked twice (export sets the second mark as a digit), or no chapters; and
bold is not compared where a table's header row is (export adds it). The words are compared in every case.

## Putting the preview right (`Edits`, `src/import/manuscript.ts`)

The writer's changes are kept as overrides over the detector's cuts, so a changed dropdown replans without losing them:
`Edits = { cuts: Map<unit, 'part' | 'chapter' | 'scene' | 'none'>, names: Map<key, string> }`. `applyEdits` puts them over `detect`'s
cuts (`'none'` takes a cut away: its heading, if it was a title, is then a line of the text before it). A heading that stays a
title leaves the text; one made a scene stays in it, so no change drops a word. A row of the plan carries `at` (the unit of its
own cut), `start` (the first unit of its text), `key` (the cut, else minus one minus the first unit), `level` and `units` (what
its text is, for the preview's per-paragraph "Start a note here"; `prefix` is a heading line the plan made). `actionsFor(row)`
says what can be done to it, `applyAction` returns the new edits.

- A renamed note keeps its heading as its first line (`# heading`, with `PlannedNote.heading` set); a folder's heading, when it
  isn't the folder's name (renamed, or too long or odd to be one), is the first line of its first note. (Step 1 only said
  so, and lost the words past a long heading's hundred characters; fixed here.)
- A scene made after a part and before any chapter is a chapter of that part.
- Cuts before the first chapter split the front matter.
- The edits are keyed by unit, so they are dropped when the source is read again differently (a Word file's tracked
  changes settled the other way).
- The preview draws a note paragraph by paragraph (300 at most; the rest as one text) so each can have its button.
- `tests/import-edits.test.ts` holds each action by hand, and 120 seeded runs of one to six random actions on a note and on a
  Word file, each checked to leave every word in order, every file inside the folder, no path twice.

### What the round trip does not compare, and what would close each

Of 84 files (28 binders in three styles), 24 are not compared for chapters and formatting; their words always are.

| Kind (files) | Why | Closed by |
|---|---|---|
| A book with **one chapter** (every row, One note, A folder called Snapshots: 12) | The file has one Heading 1, and the detector wants a level at least twice: it reads the subheadings as chapters, or finds none. The importer can't know it is a one-chapter book | Importer: trust Heading 1 as the chapter level when `docProps/app.xml` says Binders. Or export: stamp the sections (a custom property or a bookmark per section) so the importer reads what the file says it is |
| A **footnote marked twice** (What Markdown becomes: 3) | Export writes the second mark as its number, plain text | Export: a second `footnoteReference`, or a cross-reference field, instead of a digit. The importer can't tell a digit from a number the writer typed |
| **Chapter titles that differ** (Five thousand notes, Sixty labels, Odd names: 9) | "Chapter One Hundred": `roles.ts` spells numbers only to ninety-nine, so `titleFrom` doesn't strip it (the importer reads it right, as a heading); and `Hash # and caret ^`, whose characters a file name can't hold (a note's text begins with the heading, so nothing is lost) | The first: `src/export/roles.ts` could spell larger numbers (that file is shared by export and the detector). The second: not closable, a file name's limit |
| **No chapters** (Empty binder: 3) | Nothing to compare | |

Bold is not compared for a book with a table either: export bolds the header row, and the import writes a table as paragraphs.

