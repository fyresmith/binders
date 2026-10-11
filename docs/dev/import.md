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
| 2 | A Word `.docx` | Not built. It needs `src/import/doc.ts` (the source document: paragraphs with style, outline level, page break, list, runs) and a writer from blocks to Markdown (`writeMarkdown`), which step 1 had no use for |
| 3 | Merge, split and rename in the preview | Not built. The dialog has the seam: `ImportJob.rows` and the plan's `Cut`s |
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
