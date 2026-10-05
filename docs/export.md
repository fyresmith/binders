# Export: the design

Decided with the maintainer on 2026-10-05. Not built yet: this is what is to be built, written as decided. The
research behind it (Scrivener's Compile, the neighbouring tools, the formats, the routes tried), the two directions
that were turned down, the screens and the sample files are in `.claude/handoff/export-design/` (`DESIGN.md`,
`screens.html`, `samples/`, `spike/`), which git doesn't carry. A few points are still the maintainer's to confirm;
they are marked **(to confirm)**.

**The idea.** Writing stays plain in Obsidian; the look is given when the book is exported. Export is what Scrivener
calls Compile, with one vocabulary where Scrivener has two, the real pages in the window, and nothing to wire up
before the first file.

## The name

**Export.** "Export..." (the binder view's menu, a binder folder's menu) and the commands "Export binder" and
"Export again" (the last kind, to the same place, no window).

- Today's "Compile..." and "Compile binder" go. What they do is one of Export's kinds, **One note**, with the same
  options and its Copy button.
- "Include in compile" becomes "Include in export", and the outliner's column "Compile" becomes "Export".
- The property written is `export: false`. `compile: false` is read as the same thing, for good.

## The model: how a binder becomes a book

**The book** is the binder, or the folder exported. What every export of it shares is kept in the binder note
("Book details"): its title (the folder's name unless said), subtitle, author (the setting "Your name" unless said),
structure, cover, copyright line and language.

**Roles.** Every note and folder that is included has one:

| Role | In the book |
|---|---|
| Part | A part title on a page of its own; chapters under it |
| Chapter | Opens a chapter. Numbered, unless it is named Prologue, Epilogue, Interlude, Introduction, Foreword, Preface or Afterword: then it has its name and no number |
| Scene | Text that goes on with the chapter, after a scene break |
| Front matter, back matter | A page of its own before or after the text: by its name a dedication, an epigraph, acknowledgements, about the author, also by; anything else a titled page |
| Left out | `export: false` |

**The structure rule** says which is which. One of four, chosen in Book details:

- Folders are chapters, notes are scenes. (A note at the top is a chapter of one scene.)
- Folders are parts, notes are chapters.
- Parts, chapters and scenes.
- Every note is a chapter. (Folders only group. A Longform project is this.)

Until the writer chooses, Binders guesses from the binder's shape: how deep it goes, and whether the top folders are
named "Part", "Book" or "Act". Notes before the first chapter or after the last with a front- or back-matter name,
and everything in a folder named "Front matter" or "Back matter", take those roles. Folders deeper than the rule
reaches only group their notes, and a warning says so.

**Overruling it.** "Export as" in an item's menu (Automatic, with what that comes to, then the roles), written as
`export-as: chapter` on the note or in the folder's note; and an outliner column beside "Export". The Export window
shows the result ("Contents": every item with the role it was given) and each row there has the same menu. There are
no layouts to assign: a style knows how to set every role, for every kind of output.

**Titles.** A chapter's title is its note's or folder's name without a number it starts with ("03 - Storm warning" is
"Storm warning"), and nothing if the name is only a number, "Chapter 3" or "Part One". A level-one heading at the top
of the note is the title instead, and isn't printed twice.

**Made for the writer:** a title page; a copyright page from the one line in Book details; the ebook's table of
contents, and a printed contents page when chapters have titles; the manuscript's title page (contact details, the
word count rounded). A note of the book named "Copyright" or "Title page" takes the made one's place.

**What Markdown becomes.**

| In the note | In the book |
|---|---|
| Properties | Never exported |
| A blank line, or a new line | A new paragraph. Two spaces or `\` at a line's end: a line break |
| A tab or spaces at a paragraph's start | Dropped: the paragraph is a paragraph, and the style gives the indent (`tabLines` in `src/paragraphs/text.ts` says which lines). Only a fenced block is code |
| `*italic*`, `**bold**` | Italic, bold (a manuscript style may underline italics) |
| `"straight"`, `--`, `...` | Curly quotes for the book's language, a dash, an ellipsis, unless the style says as typed |
| `---`, `***`, `___` alone on a line; the join of two scenes | A scene break |
| A heading inside a note | A subheading |
| `[[Note]]`, `[[Note\|words]]` | Its words; a link in the ebook when that note is in the book |
| `[words](https://…)` | A link in the ebook and in Word; its words in print |
| A picture | The picture, with its alt text. One that isn't found is left out, with a warning |
| `![[Note]]` | The note's text, one level deep. Anything else embedded is left out, with a warning |
| `[^1]`, `^[inline]` | A footnote: at the foot of the page in the PDF and in Word, a pop-up note in the ebook |
| `%% comment %%`, `<!-- -->` | Left out |
| `==highlight==` | Its words |
| `#tag` | Left out when alone on a line; otherwise as typed, with a warning |
| A callout | A block quotation, its title in bold |
| A quotation, a list, a table | The same |
| Code | Monospaced, as typed |
| Math | As typed, with a warning |
| `^block-id` | Dropped |

Whatever is left out or changed is counted in the window before anything is exported, each with the note it is in.

## Kinds

Five, in one window:

| Kind | File | Where it works |
|---|---|---|
| Manuscript | Word (.docx), or PDF, in standard manuscript format, with real Word styles (Heading 1 chapters, a scene-break style, footnotes): what agents, editors, Vellum and Atticus read | Word: everywhere. PDF: a computer |
| Ebook | EPUB 3, valid for Kindle, Apple Books and Kobo | Everywhere |
| Paperback | PDF at a trim size, fonts embedded | A computer |
| Scrivener project | A `.scriv` Scrivener 3 opens | Everywhere |
| One note | Markdown, in the vault (today's Compile) | Everywhere |

## Styles

A style is how each role is set. Two families: **manuscript** styles (Word and PDF) and **book** styles (the ebook
and the paperback together: choose once and they are the same book).

**Built in:** manuscript: Standard manuscript (Times New Roman, Shunn's modern format); Standard manuscript, Courier
(italics underlined); Plain, for a typesetter (single-spaced, no title page or header, `***` breaks). Book:
**Classic** (EB Garamond: a centred small-capital chapter line, first words in small capitals, three asterisks, the
author and the title along the top, the page number at the foot) and **Modern** (Source Serif: a large plain numeral
at the left, breaks as space, the title and the page number together at the top outside). Both typefaces are SIL
Open Font License and travel in the plugin. **(to confirm: the names. They were "Garamond" and one other while a
style could not change its typeface; now it can.)**

**The style editor.** A writer never opens a style's file. Beside the Style dropdown is "Edit this style": the
window's sidebar becomes the editor, laid out as Obsidian's Bases lays out "Configure view" (a back arrow, the
style's name, groups of rows, each a label over a dropdown or a slider), and the pages beside it follow every
change. What it offers, and no more:

| Group | Book styles | Manuscript styles |
|---|---|---|
| Text | Typeface; size; line spacing; paragraphs (first line indented, or space between); lines (justified and hyphenated, or ragged right); quotes and dashes (typeset, or as typed) | Typeface (Times New Roman, Courier); line spacing; italics (italic, underlined) |
| Chapters | Heading ("Chapter One", "Chapter 1", "One", "1", "I", with its title, its title only, or the writer's own pattern); lettering; heading size; placed in the middle or at the left; space above; opens on a right-hand page or the next; first words (small capitals, or as the rest) | A chapter starts a third of the way down, or at the top; the scene break's mark |
| Scene breaks | The mark, or space only | |
| Pages | Along the top (author and title, title, nothing); page numbers (foot, top outside, none); margins (narrow, normal, wide) | Along the top (Surname / TITLE / page, the page number, nothing); title page |

- A heading pattern of the writer's own uses `{number}`, `{number:words}`, `{number:roman}` and `{title}`; `/` starts
  a new line; a line whose `{title}` is empty is dropped.
- Margins are three steps, not numbers: the inside margin is worked out from the page size and the number of pages
  (the printers' table). The page size is the window's own choice ("Page"), not the style's.
- Edited from the Ebook kind, the editor leaves out what an ebook doesn't decide (the typeface, the size, the
  pages), and says why: a reader chooses them.
- Changes are kept as they are made, as Obsidian's settings are. There is no Save.
- **A built-in style can be changed and can't be broken (to confirm):** it is edited in place, the editor says
  "Built in · 3 changes", and Reset puts it back. "Duplicate" makes a style of the writer's own, based on the one
  it was made from; that one can be renamed and deleted.
- The editor's menu: Duplicate; Rename (a style of one's own); Reset to the original (a built-in one); Save a copy
  to share (on a phone: Share this style); Add a style from a file; Show the style's file (a computer); Delete (a
  style of one's own).
- Styles belong to the vault: a style changed for one book is changed for every book that uses it.
- On a phone the editor is a screen of its own, the same rows at full width, with Preview at its foot.

**The style's file (to confirm: the place).** A style of the writer's own, or the changes made to a built-in one,
is one plain file, `Export styles/<name>.bookstyle`, in a folder at the top of the vault that Binders keeps out of
the file explorer, as it does a binder's `Snapshots` (its name is a setting). Like a snapshot it is not a note:
Obsidian doesn't index it, so it is in no search, switcher or graph; and Obsidian Sync carries it only with "Sync
all other types" on. Sharing a style is sending that file; adding one is choosing a file.

```yaml
---
export-style: 1              # format version: a newer one is listed, not used, and never rewritten
based-on: Classic            # a built-in style, or another style; only the differences are written
margins: wide
scene-break: "⁂"
---
/* optional: CSS added after Binders' own rules, in the ebook and in the PDF */
```

- The properties are the editor's rows under plain names: `typeface`, `type-size`, `line-spacing`, `paragraphs`,
  `alignment`, `quotes`, `chapter-heading`, `heading-lettering`, `heading-size`, `heading-alignment`, `space-above`,
  `chapter-opens`, `first-words`, `scene-break`, `running-heads`, `page-numbers`, `margins` (a manuscript style:
  `typeface`, `line-spacing`, `italics`, `chapter-starts`, `scene-break`, `header`, `title-page`).
- A property Binders doesn't know is left alone; a value it can't read falls back to the style it is based on, and
  is listed with the warnings. A style whose `based-on` is missing falls back to Classic.
- Binders writes these files itself, only from the editor; a newer `export-style` is refused, not rewritten (golden
  rules 3 and 6). `docs/file-format.md` gains this section when styles are built.
- **Custom CSS is kept, and only in the file (to confirm):** the editor has no field for it. It is for the few who
  will open the file by hand ("Show the style's file"); it reaches the ebook and the PDF, not Word.

**Kept per binder**, in the binder note, all optional (so still format 1): `title`, `subtitle`, `author`,
`structure`, `cover`, `copyright`, `language`, and what it last used: `book-style`, `manuscript-style`, `page-size`.
**Per vault** (settings): the Exports folder, the styles folder, "Your name", contact details for a manuscript's
title page. **Per device** (plugin data): the places remembered for each binder.

## The window

Obsidian's two-pane dialog, the one File recovery and Snapshots use.

- **Left:** the book's name with one button (Book details); the five kinds, each a row with what it is for; under
  them the chosen kind's two or three choices (Style, and Page, File or Cover); at the foot, where the file goes,
  and what export will have to leave out or change, each line opening its note.
- **Right:** a bar with what is being made and how big it is, "Contents", the one filled button, **Export**, and a
  menu. Under it the preview.
- **No decision is needed before the first file.** The kind is the last one used (Manuscript the first time), the
  structure is guessed, the title is the folder's name. The writer's name is asked for once.

**The preview.**

| Kind | Shown | How true |
|---|---|---|
| Paperback; Manuscript as PDF | The pages, facing | Exact: they are what is printed |
| Manuscript as Word | The same pages | Close: Word sets its own lines, and the window says so |
| Ebook | One column on paper | The book's shape; the window says a reader chooses the type |
| Scrivener project | The binder as Scrivener will list it, and what is carried across | A list |
| One note | The note | Exact |

Pages are paper, white in both themes. While it runs the bar says what is happening in words, with Cancel; no
progress line. A failure says what and which note, and leaves no half-written file.

## Where files go

- **The Exports folder** is the default place: a folder named `Exports` beside each binder. Binders' settings can
  name another, or one folder for the whole vault.
- **On a computer, Export always opens the system's save dialog**, starting in the Exports folder with the book's
  name. When the file is saved the window says where, with "Show in folder" and "Open", and under the choices a
  checkbox: **"Save here next time without asking"**. Ticked, later exports of that kind of that binder go straight
  there, the window says "Saves to …", and unticking it (or "Choose where to save..." in the menu, or "Ask again" in
  settings) brings the dialog back. A file there that export didn't write is never replaced without asking.
- **On a phone or tablet** there is no save dialog: the file goes to the Exports folder, and then to the share sheet.

## Phones and tablets

Everything but PDF. The choices are the first screen, with Preview and Export at its foot; the preview is the
second. Paperback says "PDF, made on a computer" in its row and, chosen, in a sentence: its pages can be looked at
and its style edited on the phone, and it is exported when the vault is open on a computer. A tablet has both panes.
A PDF made on a phone needs a second typesetting engine: after 1.0, if writers ask.

## The Scrivener project

A kind of its own: not a book but the binder itself, so no style and no Book details. Two switches: Notes outside
the manuscript (into Research) and Snapshots. One way, into a new folder; a phone gets it zipped.

| Binders | Scrivener |
|---|---|
| Folder, note, their order | Folder and Text items under Draft, in order |
| Synopsis | `synopsis.txt` |
| Label and its color; status | The project's lists, and the item's label and status |
| Target | The document's target, in words |
| "Include in export" off | Not included in compile |
| Role | Section types, with the defaults by structure, so Scrivener's own Compile works on the project at once |
| Snapshots | The item's snapshots, with names and dates |
| A folder's note text; the binder note's text | The folder's own text; a document at the top of Research |
| Other properties; tags | Custom metadata; keywords |
| Footnotes; `%%comments%%` | Inline footnotes; inline annotations |
| Links to notes in the binder | Links between the documents |
| Text | Rich text. What rich text has no match for stays as Markdown, and is counted in the window |

The mapping lives in one pure module that the import after it uses too; export writes each note's path into a custom
metadata field, so a project that began in Binders can be matched note for note; the test for both is the round
trip. What only a real Scrivener can settle is being tried first (the `scriv-spike` ticket).

## How it is built

No outside tools, no network.

| Part | Route |
|---|---|
| Reading | A real Markdown parser (micromark/mdast with footnotes and tables) with small additions for Obsidian's syntax, into one book model that every writer reads. Pure, tested in Node |
| Zip | fflate `zipSync` (the EPUB's `mimetype` first and stored) |
| EPUB, DOCX, `.scrivx` and RTF | Written by hand as text |
| PDF | Pages laid out by Binders, lines by Chromium, printed by a hidden `<webview>`'s `printToPDF`. Golden rule 5: a module of its own, detected, with "PDF isn't available here" as the fallback |
| Fonts | Inside `main.js`, static files, about 100 kB a family |
| Saving | A computer: Electron's save dialog and `fs`, behind `Platform.isDesktopApp`, required at use. A phone: the vault, then `navigator.share` |

**What the spike found** (one chapter of the test vault, exported for real; `spike/` in the handoff folder):

1. Electron has no hyphenation dictionaries: `hyphens: auto` does nothing. Binders hyphenates (TeX's patterns, about
   20 kB a language), and takes the unused soft hyphens out again after layout so the PDF's text stays searchable.
2. Chromium's own paging can't do a book: no running head from the text, no footnotes at the foot of a page, no
   restart of the page number, and a chapter's first page can't have its own margins without a break after the
   heading.
3. So the pages are Binders' and the lines are Chromium's: fixed page boxes filled paragraph by paragraph, a
   paragraph cut at a line, a note at the foot of the page its mark is on. It needs nothing newer than `@page
   { size }`, so it works on old installers.
4. The preview is therefore exact: it shows the boxes that are printed. A style applied to 145,000 words was laid
   out in under three seconds and printed in under two.
5. Variable fonts embed as Type 3; static files embed as subsets. Fonts must be loaded before anything is measured.

**Its ceiling:** lines are broken one at a time, so a loose line here and there; facing pages aren't forced to equal
depth; the file is RGB and not PDF/X (KDP's rules, not IngramSpark's stated ones). A good trade paperback, below a
professional typesetter's.

**Not verified yet:** the DOCX in Word, Pages and Google Docs (LibreOffice opens it); the EPUB in Kindle Previewer,
Apple Books and Kobo (EPUBCheck passes it); Vellum and Atticus importing the DOCX; a real Scrivener; macOS and
Windows; an old Obsidian installer; the share sheet on a real phone.

## The order

Each step leaves something a writer can use.

| | Step | Leaves |
|---|---|---|
| 0 | What needs other hands: a minimal `.scriv` in the maintainer's Scrivener; the sample DOCX and EPUB opened in the real apps; `printToPDF` on macOS, Windows and an old installer; the parser against the demo vault | Answers |
| 1 | The book model and the manuscript: the parser, roles from structure, the window with Manuscript and One note, the Word writer, the word-for-word test. "Compile" renamed | A submission manuscript in one step |
| 2 | Ebook: the EPUB writer, the first book style, Book details, the made pages, EPUBCheck in the tests | A valid ebook, on phones too |
| 3 | Pages: the paginator made whole, hyphenation, fonts, the PDF module, page sizes, the exact preview | A paperback and a manuscript PDF |
| 4 | Scrivener project (can run beside 2 and 3) | A project Scrivener opens |
| 5 | Overruling and owning: "Export as" and its column; the style editor and style files; the second book style; the warnings; where files go, remembered; Export again | The design complete |
| 6 | Finish: phones and tablets by touch, both themes, the docs, a QA round | Ready for 1.0 |

**Tests.** An export never drops, repeats or reorders a word: for each writer, the words read back out of the file
equal the words that went in. EPUBCheck, an Open XML validator, LibreOffice and `pdffonts` run in the test run, as
dev-time tools only. End to end: the window by keyboard and touch, each kind from the test vault and the demo
vault's extremes, a 150,000-word binder under a time limit, a phone and a tablet, the fallback without a `<webview>`.

**Waits until after 1.0:** PDF on a phone; replacements; several kinds in one go; drop capitals; typefaces installed
on the computer; pages of equal depth; PDF/X; math; single-file HTML and plain text; Fountain; large print.
