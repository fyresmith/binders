# Export: the design

Decided with the maintainer on 2026-10-05. This is what is to be built, written as decided. **Step 1 of "The
order" is built** (2026-10-05: the book model, the Word manuscript, the window with Manuscript and One note, where
files go, "Compile" renamed); what it is as built is in the README ("Export"), `docs/dev/file-format.md` ("Export")
and `docs/dev/architecture.md` ("Export"). **Step 2 is built too** (2026-10-05: the ebook: the EPUB writer, Classic
as the first book style, Book details, the made pages, the cover, EPUBCheck in the tests); what was decided while
building it is under "Decided while building the ebook (step 2)". **So is step 4, the Scrivener project**
(2026-10-05): what it is as built, the format's choices and what each stands on are under "The Scrivener project".
**And step 5, overruling and owning** (2026-10-06: Modern, style files and the style editor, "Export as" from
Contents, the menus and the outliner, Export again): "Overruling and owning, as built". What is left is step 3's (the
pages: the PDF, the Paperback kind, the exact preview) and step 6. The
research behind it (Scrivener's Compile, the neighbouring tools, the formats, the routes tried), the two directions
that were turned down, the screens and the sample files are in `.claude/handoff/export-design/` (`DESIGN.md`,
`screens.html`, `samples/`, `spike/`), which git doesn't carry. The points the designer left open (the
save dialog, where a style's file lives, built-in styles edited in place, the names Classic and Modern, custom CSS
in the file only, margins by name, manuscript styles in the editor) were settled the same day as written here.

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
Open Font License and travel in the plugin.

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
- **A built-in style can be changed and can't be broken:** it is edited in place, the editor says
  "Built in · 3 changes", and Reset puts it back. "Duplicate" makes a style of the writer's own, based on the one
  it was made from; that one can be renamed and deleted.
- The editor's menu: Duplicate; Rename (a style of one's own); Reset to the original (a built-in one); Save a copy
  to share (on a phone: Share this style); Add a style from a file; Show the style's file (a computer); Delete (a
  style of one's own).
- Styles belong to the vault: a style changed for one book is changed for every book that uses it.
- On a phone the editor is a screen of its own, the same rows at full width, with Preview at its foot.

**The style's file.** A style of the writer's own, or the changes made to a built-in one,
is one plain file, `Export styles/<name>.bookstyle`, in a folder at the top of the vault that Binders keeps out of
the file explorer, as it does a binder's `Snapshots` (its name is a setting). Like a snapshot it is not a note:
Obsidian doesn't index it, so it is in no search, switcher or graph; and Obsidian Sync carries it only with "Sync
all other types" on. Sharing a style is sending that file; adding one is choosing a file.

The format, as built, is in [file-format.md](file-format.md), "Export styles": properties under the editor's
rows' names, `export-style` as its version, `based-on` for the style it starts from (only the differences are
written), then optional CSS.

- A property Binders doesn't know is left alone; a value it can't read falls back to the style it is based on, and
  is listed with the warnings. A style whose `based-on` is missing falls back to Classic.
- Binders writes these files itself, only from the editor; a newer `export-style` is refused, not rewritten (golden
  rules 3 and 6).
- **Custom CSS is kept, and only in the file:** the editor has no field for it. It is for the few who
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

A note's notes (its `notes` property) are never part of a book: no kind of export but this one carries them, as no
kind carries any property. Here they become the document's notes.

A kind of its own: not a book but the binder itself, so no style and no Book details. Two switches: Notes outside
the manuscript (into Research) and Snapshots. One way, into a new folder; a phone gets it zipped.

| Binders | Scrivener |
|---|---|
| Folder, note, their order | Folder and Text items under Draft, in order |
| Synopsis | `synopsis.txt` |
| Notes (the `notes` property, typed in the inspector) | The document's notes, `notes.rtf` |
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

### As built (step 4, 2026-10-05)

The writer is `src/export/scriv/` (pure, tested in Node); `vault.ts` there reads the binder and saves the project;
the window's part is `src/view/export-scriv.ts`. It doesn't go through the book: a project is the binder itself, so
each note is read by itself (the same Markdown reader, `text.ts`), nothing is typeset (quotes and dashes stay as
typed), nothing is joined into chapters, and a note left out of export is still in the project.

**What is manuscript and what is Research.** The binder's items, in binder order, are the Draft. With **Notes
outside the manuscript** on (the default), three things go to Research instead, in this order: the binder note's own
text, as a document named "*Binder* (binder note)"; every note or folder **at the top of the binder that is left out
of export** (`export: false`: that is how a binder keeps its research beside its book), with all that is in it; and,
for a Longform project, the notes in its folder that are no scenes of it. With it off, the first and last aren't
exported, and the second stay where they are in the Draft, not included in compile. A note left out deeper in the
binder (a cut scene in a chapter) always stays in its place, not included in compile; a folder left out leaves out
what is in it. Pictures the text shows are also files in Research, either way.

**What Markdown becomes in a project** (where it differs from the table under "The model"):

| In the note | In the project |
|---|---|
| A paragraph begun with a tab | A first-line indent (`\fi360`), no space after it, never a tab. Any other paragraph: flush left, with space after (`\sa200`) |
| `%% comment %%` | Scrivener's inline annotation, in place (on one line, whatever it was). `<!-- -->` is left out |
| `[^1]`, `^[inline]` | Scrivener's inline footnote where the mark is; its paragraphs run together. One marked twice is written once |
| `[[Note]]` | A link to that document (`scrivlnk://`) when the note is in the project; its words otherwise |
| `![[Note]]` | Stays as typed (a link to the document, if it is one), and is counted: Scrivener sets no document inside another |
| A picture | In the text (PNG and JPEG), no wider than a page; and a file in Research. A GIF, or one not found: as typed, counted |
| A callout | A block quotation, its title in bold (rich text has a match after all) |
| A table | Stays as Markdown, monospaced, and is counted |
| A list | Paragraphs with a hanging indent and a bullet or its number: they look like a list and are not one of Scrivener's |
| Quotes, dashes, `...` | As typed: a project is the writing, not a book |
| A scene break | `* * *`, centered |
| Notes on a note or folder (the `notes` property, or the one settings name) | The document's notes (`notes.rtf`): never compiled there, as they are never exported here |
| `tags` | Keywords. Other properties: custom metadata, as text |

**The format's choices, and what each stands on.** No specification exists. The evidence is the 13 projects written
by Scrivener itself that the designer read (Mac 3.1.4 to 3.5.2, Windows 3.1.5.1), and the format spike's eight
projects, which the maintainer opened in his Scrivener on 2026-10-05: "I opened the test projects and it worked."
Which of the eight, his version and his system aren't known yet, so that is taken as: the main project, shaped like
one Scrivener wrote, opens. Each open choice is one constant in `src/export/scriv/parts.ts`.

| Choice | Written | Stands on |
|---|---|---|
| The root element, `Version="2.0"`, `Files/version.txt` = `23` | The Mac form | Every real project read; the spike's opened |
| `Creator` | `BINDERS-<version>`: honest (`HONEST_CREATOR`) | The spike's variant 5 said this; whether that one was opened isn't known. `false` writes a string a real Scrivener wrote |
| `Files/styles.xml`, `Settings/compile.xml` | Written (`FULL_SHAPE`) | The spike's main project had both. The bare shape (variant 2) is unconfirmed |
| A `Files/Data/<id>/` folder | Only for an item with text, a synopsis or notes | Real projects; the spike |
| Left out of compile | The element is left out; never `No` | No real project says `No` |
| RTF | Plain RTF 1, ASCII, `\uN?` for everything else, Times New Roman and Courier New | The spike; LibreOffice reads every file the same |
| Footnotes, comments | `{\Scrv_fn=…\end_Scrv_fn}`, `{\Scrv_annot …\end_Scrv_annot}` as text | Scrivener's own Tutorial (Mac 3.5.2); Windows unconfirmed |
| Labels | The settings' list, then any other label used; Obsidian's colors as its default light theme has them | The spike |
| Ids | Derived from the binder's path and each item's path in it: the same on every export | The spike (it used SHA-1; this is a hash of our own, as stable) |
| Section types | Part, Chapter, Scene, Front matter, Back matter, Group; a default for folders and one for notes, by the structure; an item whose role differs says its own (`ITEM_SECTION_TYPES`) | The defaults: the spike's shape. An item's own `<SectionType>`: from real projects, **not yet opened** |
| Keywords (`KEYWORDS`), more custom fields, `notes.rtf` | Only when the binder has tags, other properties, `notes` | Real projects; **not yet opened**. A binder without them writes none of these elements |
| Snapshots | `Snapshots/<id>.snapshots/index.xml` and an `.rtf` named for its date | The spike's variant 7; whether that one was opened isn't known |

**Saving.** On a computer the project is a `.scriv` folder where the save dialog says, written whole or not at all
(`writeFolder` in `desktop.ts`: beside its place, then renamed). Exported again to the same place, a project that is
still exactly what export left (every file's size, their number, the newest date) is replaced whole. One that isn't
(it has been opened in Scrivener, which writes into it; or export never made it) is **never written over**: the
window says so and offers the first free name beside it ("The Lighthouse 2.scriv"). On a phone or tablet, and on a
computer where a folder can't be written, the project is zipped (`Name.scriv.zip`) into the Exports folder in the
vault, and on a phone handed to the share sheet.

**Decided while building** (the design was silent):

1. What "outside the manuscript" is (above). The spike had it hard-coded.
2. The Draft folder is titled "Draft", as the design's screen has it (the spike wrote "Manuscript").
3. A paragraph not begun with a tab gets space after it, whether or not a blank line followed it in the note.
4. A callout is a block quotation with a bold title, not Markdown. A note embedded in another stays as typed.
5. A footnote marked twice is written once, at its first mark.
6. A label named for one of Obsidian's colors has that color as the default light theme has it, in either theme.
7. Binders' notes on a note or folder are the document's notes in Scrivener: they are "never exported" into a
   book, and Scrivener's document notes are never compiled either, so the binder itself carries them.
8. A folder's target is written too (the spike wrote notes' only).
9. The remembered place stays the one chosen when a project is saved beside it under another name.
10. Roles reach Scrivener as section types by the smallest means: two defaults, and an item's own type only where
    it differs.

**What the import will need from this** (the next roadmap item). The custom metadata field `binderspath` on every
item: its path in the binder as `contents` writes it (`Part One/`, `Part One/Arrival`; the binder's name for the
binder note's document), so a project that began here is matched note for note; and the ids, which are the same on
every export of the same binder. Round-trips: order and nesting, titles, synopses, labels (by name), statuses,
targets, "Include in export", tags, other properties (as text), `notes`, snapshots with names and dates, footnotes,
comments, links between notes, emphasis, headings, quotations, pictures. Does not: which paragraphs had a blank line
between them; a list's own numbers when they weren't in order; a callout's kind; a footnote's second mark; an HTML
comment; a label's color where the theme gave it; where a top-level left-out item stood among its neighbours (it is
in Research); the dates of folders (they are their folder notes'). Import still needs the RTF reader, for both of
Scrivener's dialects: `tests/export-scriv-words.ts` has a small one that reads what this writer writes, no more.

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
Apple Books and Kobo (EPUBCheck passes it); Vellum and Atticus importing the DOCX; the Scrivener project in any
Scrivener but the maintainer's, and as production writes it in his (the spike's projects opened there: "As built");
Scrivener for Windows and for iOS; macOS and
Windows; an old Obsidian installer; the share sheet on a real phone.

## The order

Each step leaves something a writer can use.

| | Step | Leaves |
|---|---|---|
| 0 | What needs other hands: a minimal `.scriv` in the maintainer's Scrivener; the sample DOCX and EPUB opened in the real apps; `printToPDF` on macOS, Windows and an old installer; the parser against the demo vault | Answers |
| 1 | The book model and the manuscript: the parser, roles from structure, the window with Manuscript and One note, the Word writer, the word-for-word test. "Compile" renamed | A submission manuscript in one step |
| 2 | Ebook: the EPUB writer, the first book style, Book details, the made pages, EPUBCheck in the tests | A valid ebook, on phones too |
| 3 | Pages: the paginator made whole, hyphenation, fonts, the PDF module, page sizes, the exact preview | A paperback and a manuscript PDF |
| 4 | Scrivener project (can run beside 2 and 3). **Built** | A project Scrivener opens |
| 5 | Overruling and owning: "Export as" and its column; the style editor and style files; the second book style; the warnings; where files go, remembered; Export again. **Built** | The design complete |
| 6 | Finish: phones and tablets by touch, both themes, the docs, a QA round | Ready for 1.0 |

**Tests.** An export never drops, repeats or reorders a word: for each writer, the words read back out of the file
equal the words that went in. EPUBCheck, an Open XML validator, LibreOffice and `pdffonts` run in the test run, as
dev-time tools only. End to end: the window by keyboard and touch, each kind from the test vault and the demo
vault's extremes, a 150,000-word binder under a time limit, a phone and a tablet, the fallback without a `<webview>`.

**Waits until after 1.0:** PDF on a phone; replacements; several kinds in one go; drop capitals; typefaces installed
on the computer; pages of equal depth; PDF/X; math; single-file HTML and plain text; Fountain; large print.

## Overruling and owning, as built (step 5, 2026-10-06)

**The second book style.** Modern is a built-in style beside Classic (`MODERN` in `src/export/style.ts`): Source
Serif 4, 10 on 14.5, a large plain numeral at the left, breaks as space, the title along the top and the page number
at the top outside.

**Style files.** As designed; the format is in [file-format.md](file-format.md), "Export styles". The pure parts
are `src/export/style-rows.ts` (one table: the editor's rows, the file's properties and what is checked when a file
is read) and `style-file.ts` (read, changed a line at a time, resolved over what it is based on); the vault's side
is `styles.ts` (`plugin.styles`), which keeps the folder read and reads it again on every change there.

**The style editor** (`src/view/export-style-editor.ts`). "Edit this style" is the button beside the Style dropdown
(and in the window's menu): the sidebar becomes the editor, the preview stays and follows each change 90 ms after
the last one. A book style edited from Ebook has 8 rows (9 with "Your own" heading), a manuscript style 7; the 9
rows that are the pages' alone are in the table, marked `pages`, and shown when the editor is opened from a kind
that has pages (`StyleEditorHost.pages`). It is laid out on Bases' "Configure view" classes, with Binders' own
rules for the same layout where an Obsidian has none (`configLook`, [internals.md](internals.md)).

**"Export as"** is one menu (`src/view/export-as.ts`) and one write path (`writeExportAs` in `src/view/props.ts`),
offered from a row of Contents in the window, a card's and a row's menu (a submenu beside "Include in export"), the
outliner's column "Export as", and the inspector's row. A role Binders read from the binder's shape is said more
quietly than one written by hand, everywhere.

**Export again** (`src/view/export-again.ts`): the command, and "Export again" in the binder view's menu once the
binder has been exported on this device. The last kind, to the last place, with the choices as they stand now.

### Decided while building (step 5)

Where the design was silent, or the code said otherwise:

1. **Modern's heading is `{number} / {title}`**, not `{number}` as the design's sample had it. The sample chapter
   had no title, so it looks the same; a chapter that has a title keeps it, set under the numeral.
2. **A style's family is said by what it is based on.** The design gave one file format for both families and no
   property for which: a style is a manuscript style when the built-in style at the bottom of its `based-on` is one.
3. **A style based on a built-in one is based on it as it is changed in this vault.** So a duplicate starts as the
   style looked when it was made, and Reset on the built-in one changes what is based on it too.
4. **A broken file and a newer one are never written, and the editor's rows are disabled for them**; a file with
   one value that can't be read is edited as usual, and the editor leaves the bad line alone until its row is set.
5. **Deleting a style keeps the styles based on it as they look** (they are rewritten to stand on the built-in
   style, with what they had from the deleted one, its CSS too), and the binder notes that named it name the style it
   was based on, as the delete dialog says. **Renaming** follows into them and into the binder notes that named the
   style. Delete is to the trash.
6. **Sharing.** "Save a copy to share" (a computer) and "Share this style" (a phone) send a copy that stands by
   itself on a built-in style, so it works in a vault that has none of the writer's other styles. A built-in style
   with nothing changed has nothing to send. "Add a style from a file" takes the file under its name, or the first
   free one like it ("Classic 2"), and never replaces a style; a newer or broken file isn't taken.
7. **The styles folder with anything but styles in it is shown** in the file explorer (it is the writer's then).
   Changing its name in settings renames the folder, and never to a name that is taken: a folder that is there
   already is the writer's, and isn't adopted and hidden.
8. **A manuscript's style is the binder's** (`manuscript-style`, as the design lists it), falling back to the one
   last used in the vault.
9. **The manuscript preview shows the running head once**, over the first page of the text, so the "Along the top"
   row has something to change in a preview that isn't pages yet.
10. **The size and line-spacing sliders** go by 0.5 pt and 0.01 (the design's 0.02 can't land on Modern's 1.45).
11. **Contents.** The pages Binders makes are listed first, quietly. A row opens its note; its role, at the row's
    end, is the button for "Export as" (and the row's own menu). A folder that only groups shows its menu on hover
    or focus. The design's highlight of the row whose pages are in view is not built: it needs the pages.
12. **"Export as" on an item that is left out puts it back in** from the menus (where "Leave out" is one of the
    choices); the inspector keeps its own box for that, as it had.
13. **Export again with nothing exported yet opens the window.** The place it goes to is the last one whether or
    not "Save here next time without asking" was ticked, and using it doesn't tick it. It asks only before
    replacing a file that is no longer what export left. On a phone: the Exports folder, then the share sheet.
14. **"Show the Exports folder" is worded "Show where exports go"**: the review bot's sentence-case rule reads a
    capital in the middle of a menu item as a mistake, and can't be told otherwise.
15. **Custom CSS reaches the ebook's file, not the window's preview of it**: the preview is Binders' drawing of
    the book's shape, not the EPUB rendered.

## Decided while building the ebook (step 2)

Where the design was silent, as built:

- **No typeface travels in the EPUB.** The design leaves an ebook's typeface to its reader; so nothing is embedded
  (0 kB), and the stylesheet sets no face, size, colour or justification. Fonts come with the pages (step 3).
- **Pictures:** PNG, JPEG and GIF, as in the manuscript; the cover a PNG or a JPEG. The design asks for no more.
- **The cover is the package's cover image and no page of its own:** Kindle's guidelines ask that it not be put in
  the text a second time. A cover under 1,400 pixels on its longer side is said with the warnings.
- **The made pages, in order:** the title page, the copyright page, the book's own front matter, the contents, the
  text, the back matter. The contents page is the EPUB's navigation document, in the reading order; with "Never"
  it is still the reading app's list and no page.
- **Two properties the Book details screen shows and the property list didn't name:** `title-page` (written only
  as `false`) and `contents-page` (`always`, `never`).
- **The copyright page without a line** says `© year author`: no word of Binders', in any language. With no author
  and no line there is no page. It has no switch of its own: a note named "Copyright" takes its place.
- **The book's language reaches the words export writes.** "Chapter" and "Part" in the built-in heading, the
  contents page's heading and the notes' name are the language's own for eighteen languages; numbers are in words
  only in English ("Chapitre 3"); a language Binders has no words for gets the number alone and the book's title
  over its contents. The title page has the title, the subtitle and the author, and no "by".
- **A part's heading** is "Part" and its number, set as the chapter pattern sets its number, then its title: a
  style has one pattern, the chapter's.
- **The identifier** is made from the title, the author and the language, so the same book exported twice is the
  same book to a store. Nothing is kept in the vault for it.
- **Footnotes** are numbered from one in each chapter and set under their chapter, each with its way back; a
  footnote in a footnote is set in its place in brackets, as in Word.
- **A link to a note of the book** leads to the section that note is in (its chapter, not the scene's own line).
- **Text against the book's direction** (Hebrew in an English book, English in an Arabic one) is marked
  `dir="auto"` paragraph by paragraph; a book whose language runs right to left turns its pages that way.
- **A Longform project** has no Book details to write: its note is Longform's. The details are read from it if
  typed there.
- **The manuscript's "by" and "about N words" stay in English** whatever the book's language: standard manuscript
  format is an English-language convention. Left as step 1 built it; to be decided.

