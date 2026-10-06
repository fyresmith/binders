# Export: design (stages one and two, 2026-10-05)

Nothing here ships. Stage one was the research, three directions and a recommendation; the maintainer chose
(direction C, "Export", no PDF on phones, two styles with an editor in the window, an Exports folder with a save
dialog). Stage two, below, is what his answers changed: the style editor, the second style, where files go, the
phone. **The design as decided is now `docs/export.md` in the repository**; this file keeps the research and the
directions that were turned down.

**Where things are** (this folder):

| | |
|---|---|
| `DESIGN.md` | this |
| `screens.html` | the screens and the samples on one page; open it in a browser |
| `screens/` | 25 states of the Export window, dark and light, desktop and phone. Real Obsidian, Obsidian's own controls. The previews are live: the spike's renderer and paginator run in the window on the spike's real chapter, so a control moved in the editor lays the book out again |
| `samples/` | **spike output**, in both built-in styles: `sample-paperback.pdf` and `sample-paperback-modern.pdf` (5 × 8 in, printed from inside Obsidian), `sample.epub` and `sample-modern.epub` (both pass EPUBCheck), `sample.docx` (standard manuscript format), `sample-manuscript.pdf`, and pictures of them |
| `spike/` | the throwaway code that made them (`build.mjs`, `render.js`, `paginate.js`, `verify.mjs`, `obsidian-pdf.mjs`, `shots.mjs`), the notes it read, the fonts. Marked SPIKE; not production code |
| the mock-up | `src/view/export-mock.ts` and a block at the end of `styles.css`, on the worktree branch `worktree-agent-a904866b1fbdea99e`, behind three commands: "Export (design mock-up)", "Book details (design mock-up)", "Export settings (design mock-up)". Not for `main` |
| the docs | commits `8b26a63` and `243bd8f` on that branch (`docs/export.md`, `docs/plan.md`, `docs/design.md`, `ROADMAP.md`): for `main` |

## Stage two

### Newly open, for the maintainer

Each with the answer built into the screens. None blocks step 0 or step 1.

1. **How I read "always do a save dialog on a computer, remembered after with a checkbox".** Export always opens
   the system's save dialog, starting in `Exports` beside the binder. After the file is saved, a checkbox appears
   under the choices: "Save here next time without asking". *Ticked, the next export of that kind of that binder
   skips the dialog and replaces its own file there* (screens 08 and 09). The other reading: the dialog opens every
   time, and the checkbox only decides whether it opens in the last place or in `Exports`. If that is what you
   meant, the checkbox moves into settings and the window loses a line.
2. **Where the hidden style files live.** *One folder at the top of the vault, `Export styles/`, kept out of the
   file explorer as `Snapshots` is; one plain `.bookstyle` file per style (properties, then optional CSS).* Why not
   the others: the plugin's data isn't a plain file and can't be sent to another writer; `.obsidian/plugins/binders/`
   is deleted with the plugin and Obsidian Sync doesn't carry it; a dot-folder is invisible to Obsidian Sync
   entirely; a folder inside each binder would make a style belong to one book, and a series wants one style. The
   cost is the snapshots' cost: Obsidian Sync needs "Sync all other types" on.
3. **Built-in styles: change in place, with Reset** (screen 12: "Built in · 4 changes · Reset"), *or* must a writer
   duplicate one before changing anything? I built the first: one step less, and it can't be broken. Its cost: a
   changed "Classic" is changed for every binder in the vault.
4. **The styles' names: Classic and Modern.** "Garamond" stopped being true the moment the typeface became a row
   in the editor.
5. **Custom CSS: kept, in the file only.** The editor has no field for it; "Show the style's file" is the way in.
   Say if it should go altogether, or have a field.
6. **Margins are Narrow, Normal, Wide, not numbers**, and the inside margin grows with the page count by the
   printers' table. Say if you want inches.
7. **Manuscript styles get the editor too**, with seven rows (screen 17). It could be left out: the three built-in
   ones cover what agents ask for.

### A. The style editor

Screens 11 to 17 and 25.

- **Where:** in the Export window. "Edit this style", the small button beside the Style dropdown, turns the sidebar
  into the editor; the pages stay where they are and follow every change (a slider dragged lays the book out once,
  90 ms after it stops; the chapter takes about 60 ms, a novel under 3 s).
- **How it looks:** Obsidian's Bases, "Configure view", which I opened and read (`spike/look.mjs`): a back arrow
  and title, the name as a field, groups under a hairline, each row a label over a full-width dropdown or a slider
  with its value at the left. The mock-up uses Bases' own classes. No cards, no pills, no tabs.
- **What it offers:** 18 rows in four groups for a book style (Text, Chapters, Scene breaks, Pages), 7 for a
  manuscript style. The list is in `docs/export.md`. Scrivener's format designer has about twenty panes.
- **What it leaves out on purpose:** per-role fonts, separators as a matrix, numeric margins, anything per format.
  Front matter is the book's (Book details), not the style's.
- **Edited from Ebook** it hides what an ebook doesn't decide and says why (screen 16).
- **Built-in and own styles**, the menu (duplicate, rename, reset, share, add from a file, show the file, delete):
  screens 12 and 15.
- **Phone:** a screen of its own, the same rows, Preview at the foot (screen 25).
- **Not live in the mock-up:** Rename, Delete, sharing and "Show the style's file" are menu items that do nothing.
  Everything in the rows is live.

### B. The second style

"Modern": Source Serif 4 (SIL OFL), 10 on 14.5, a large plain numeral at the left, scene breaks as space (a mark
only where a break falls at the head of a page), the title and the page number together at the top outside.
`samples/sample-paperback-modern.pdf`, `sample-modern.epub`, and `samples/both-styles.png` beside Classic. Its
EPUB passes EPUBCheck. The same model and the same renderer made both; a style is seventeen values.

### C. Where files go

Screens 07 to 10: progress; saved the first time (the checkbox unticked); remembered ("Saves to …", ticked); the
rows export adds to Binders' settings (Exports folder, Remembered places with "Ask again", Your name, Contact
details, Styles folder). The system's own save dialog can't be shown from a headless Obsidian: it is the operating
system's, opened between screens 07's button and 08.

### D. The phone

Screens 21 to 25. A row is its name and its control on one line. Paperback says "PDF, made on a computer" in its
row and in a sentence under its choices, and has Preview but no Export.

### What stage two fixed in the spike

The paginator left blank lines at the foot of a page when a paragraph with a footnote mark was cut before the mark
(it kept the room the note would have taken). Found by looking at the editor's preview at 12 pt.

## Stage one's questions (answered 2026-10-05)

His answers: 1 C. 2 Export. 3 No PDF on phones. 4 Two, with a style editor in the window and the files hidden
(which replaces "a style is a note" below). 5 An Exports folder, always a save dialog on a computer, remembered with
a checkbox, changeable in settings. 6 Yes. 7 As recommended. 8 A `.scriv` first.


1. **Which direction?** *C, "roles and style notes"* (below): a note or folder is given a part to play in the book
   by a rule you can see and overrule; a style is a note in the vault; one window with an exact preview. A is the
   same window with the style files left out; B is Scrivener's system.
2. **The name: Export or Compile?** *Export.* It is Obsidian's word ("Export to PDF"), it is what the roadmap calls
   it, and in Scrivener itself the Scrivener-project output would be an "export", not a "compile". The old
   "Compile..." becomes one of its kinds, **One note**. The README says "Export (what Scrivener calls Compile)".
3. **PDF on a phone or tablet in 1.0?** *No, and say so in the window, as the screens do.* EPUB, Word, the Scrivener
   project and One note work everywhere; a PDF needs Obsidian on a computer (Obsidian's own "Export to PDF" is the
   same). The phone still shows the paperback's pages exactly. A PDF made on a phone needs a second typesetting
   engine (about 270 kB gzipped and weeks of work, or a 10 MB download): after 1.0, if writers ask.
4. **How many book styles, and which typefaces travel with the plugin?** *Two at 1.0*: "Garamond" (the sample: EB
   Garamond) and one plainer, modern one to be designed in stage two. Each family costs about 100 to 130 kB in
   `main.js` (385 kB today). A style can also name a typeface installed on the computer.
5. **Where does the file go?** *On a computer, the system's save dialog the first time (as Obsidian's own PDF export),
   then the same place again without asking.* On a phone, an `Exports` folder beside the binder, then the share
   sheet. (A .docx or .epub in the vault doesn't show in the file explorer unless "Detect all file extensions" is
   on, which is why the vault is not the default on a computer.)
6. **Is a new line a new paragraph?** *Yes, in every export.* Fiction is typed a paragraph to a line; Obsidian
   shows a single new line as a line break, but nobody wants a chapter that is one paragraph. Two spaces or a
   backslash at a line's end still make a line break inside a paragraph (verse, an address).
7. **Property names.** *`export: false` in place of `compile: false` (which is still read, for good), `export-as:
   chapter` for the override, and the book's own details as plain properties of the binder note (`title`, `author`,
   `structure` and so on).* Nothing is released, so the rename costs nothing now.
8. **Scrivener.** Nobody but you can open a `.scriv`. *The first thing built is a minimal project by hand (about a
   day), for you to open before anything else is written* (the ten things only Scrivener can settle are listed
   below).

## What I found

Five research passes (the web, real files, npm) and a spike. What was only read is marked; what I did is under
"Verified by doing". Quotes from forums came through a summarising fetch: close, not character-checked.

### Scrivener's Compile

Read: the Scrivener 3 manual for macOS (changelog to 3.3.7) and Windows, directly; Literature & Latte's blog and
forum; about fifteen guides and reviews. Reddit could not be fetched.

**How it works.** Three columns, "meant to be used in a left to right fashion": compile formats; a preview of
*section layouts* (tiles, not pages); and the project's options (contents, metadata, replacements, cover, table of
contents). The chain is **document → section type → section layout → output**:

- *Section types* belong to the project (Project Settings): names only, "not a single shred of formatting". A
  document gets one by structure ("Default Types by Structure": rows for folders, file groups and files, per
  outline level) or by hand, in four places.
- *Section layouts* belong to a compile format: which parts print (title, synopsis, text), the title's prefix and
  suffix with placeholders (`Chapter <$n>`), new-page behaviour, separators, formatting.
- **Assign Section Layouts** maps each type to a layout, *per project and per format*. Unassigned, a yellow warning
  shows and documents "print... verbatim".
- Around that: a per-document "Include in Compile" and filters by label, status or collection; front and back
  matter as folders outside the Draft, one per output kind; separators (four slots, four values each, per layout);
  replacements (project and format, with regex); transformations (straight quotes, italics to underline); styles
  matched by name; "Override text and notes formatting" per layout; page settings; a format designer of about twenty
  panes that change with the file type. Formats are saved per project or globally and travel as `.scrformat` files.
- Built in: Default, Manuscript (Courier), Manuscript (Times), Modern, Paperback (two sizes), Proof Copy, three
  outlines, Ebook, script formats, and **"Vellum Export"** (a DOCX whose style names Vellum understands).
- Scrivener for iOS has none of this: an "appearance" (five built in) which is a small YAML file (`.scomp`), no
  section types, no front matter, no EPUB. L&L already chose a plain-text file and far fewer choices for phones.

**What confuses people** (their words):

- The two-noun chain. "Is it 'Types'? or is it 'Layouts'?"; "two steps to take BEFORE the compiling process
  starts"; "these features are scattered throughout Scrivener, yet are so interdependent".
- Assigning layouts again for every format, and nothing working until you do, outside the Novel template.
- Chapter titles missing or doubled ("CHAPTER ONE / Chapter 1").
- The editor and the output disagreeing with no way to see why ("it'll appear as in the editor"; "Why can I not
  control the paragraph spacing…? And if I can, why is that impossible to find?"). One user asked for a diagnostic:
  "Why does my Compiled project look like this?"
- No real preview: compile, open the file, look, go back.
- Settings kept only if you compile.
- So: "compilation in Scrivener is a cancer… Vellum is the 'just works' option"; a market of paid compile courses;
  and the common route is *compile to DOCX, finish in Vellum or Atticus*. L&L ships a format for exactly that.
  (No survey measures how common; the practice is asserted everywhere.)

**What they love:** the same text out in several shapes without touching it; write in any font and get a clean
manuscript; standard manuscript format in one step; a format saved once and reused ("set it and forget it");
automatic chapter numbers; leaving documents out.

**What L&L says** (Keith Blount, 2017): Scrivener 2 formatted by outline level, which "ties each Compile format to a
particular project structure"; section types were the fix, and they "spent many months working out how to keep the
power but make it easier". He concedes "a little friction there".

**What I take from it.** The power is in six things: source and output apart; a role for each piece of the book,
given by structure and overruled by hand; named, saved formats; a small vocabulary for headings; include and leave
out; a few transformations. The maze is in four: two vocabularies wired together by hand, per format; the same
question asked in several panes (separators, overrides, fonts); no truthful preview; state you can't see.

### The neighbours

| Tool | What it gets right |
|---|---|
| **Vellum** | A book is a list of *typed elements* (chapter, prologue, dedication, about the author); the type carries the rules (numbering, where page numbers start, drop caps). One Book Style, then a *variant per feature* (heading, first paragraph, break), showing only features the book uses. A preview that is the output. One **Generate** for every store. And refusals: type size and leading are computed from the trim size; widows and balance are automatic |
| **Atticus** | The same, with a theme builder (heading, paragraph start, scene break, notes, header and footer). Rated less stable |
| **Ulysses** | The shortest full flow: pick a format, pick a style, look at the preview, press the one big button; the same on a phone. A style is a small text file in a CSS-like language, shared in a gallery |
| **iA Writer** | A template is a folder of HTML and CSS with a title page, header and footer: exactly what an EPUB and a printed page are made of |
| **Reedsy** | Three templates, four trim sizes, three switches. Free. The fewest decisions of any |
| **novelWriter** | Plain text and open source: heading formats as strings with placeholders (`Chapter {Chapter:Word}: {Title}`), per level; named, saved builds; "which documents" kept apart from "which parts of them" |
| **Pandoc** | The *reference document*: restyle a .docx in Word and the exporter borrows its styles. The right idea for editors |
| **Longform** (189k downloads) | Compile steps, vault-wide workflows; output is one Markdown note. EPUB and DOCX have been open requests since 2022-23 |
| **Obsidian's "Export to PDF"** | One note, desktop only, no page numbers or running heads. Better Export PDF (348k downloads) exists because of that |
| **Pandoc plugins** (about 1M downloads together) | Need Pandoc installed, and LaTeX for PDF; one is effectively unmaintained; neither knows what a book of many notes is |
| **StoryLine** | DOCX and PDF built in (hand-written XML and pdf-lib): three PDF fonts, no EPUB, no preview, no styles, no front or back matter. A small form: content, format, a few switches |

About a dozen newer plugins write EPUB or DOCX without outside tools; none has passed 7,000 downloads, and none
combines typed front and back matter, a few designed styles, a truthful preview, all three formats and phones.
**That combination is the gap.**

### The formats

**EPUB 3.** A valid one is small: `mimetype` first and uncompressed, `container.xml`, a package file (identifier,
title, language, modified date), a navigation document, XHTML, CSS. A *good* one: a file per chapter (Apple and Kobo
break pages between files); semantic marks for front matter, chapters and footnotes (pop-up notes on Kindle, Apple,
Kobo); a cover (2560 × 1600 for Kindle, at least 1400 px for Apple); the three accessibility properties stores now
expect (the European Accessibility Act has applied since June 2025); an NCX for old readers. The body text must be
left alone: Kindle's guidelines say no forced face, size, colour or background, and strip them. So **an ebook's
style is its shape** (headings, breaks, indents, first lines), not its typeface. Embedded fonts, if any, must be
TTF or OTF (Kobo and Kindle don't list WOFF2). KDP no longer takes MOBI. EPUBCheck (5.4.0, Java) is the validator
every store names.

**DOCX.** Shunn's format, read from his pages: 12 pt Times New Roman (Courier is "probably on its way out"),
double-spaced, one-inch margins, half-inch first-line indent, ragged right, header "Surname / KEYWORD / page" from
the first page of text, a title page with contact details and "about 80,000 words", each chapter on a new page
part-way down, a centred `#` for a scene break, italics as italics. **Real styles matter** because the next tool
reads them: Vellum and Atticus take a chapter from Heading 1, the title from the document's properties, footnotes
as footnotes. They disagree about scene breaks (Vellum wants `***` centred; Atticus wants it left-aligned and says
centred fails), so "for a typesetter" is a style with that choice in it. ODT and RTF: nobody downstream asks for
them.

**PDF for print.** KDP: trim sizes 5 × 8 to 6 × 9 and custom; inside margin by page count (0.375 in to 150 pages,
0.5 to 300, 0.625 to 500, then more); outside at least 0.25 in; every font embedded; no bookmarks or crop marks;
plain PDF accepted. IngramSpark asks for PDF/X-1a or X-3, 0.5 in margins and an even page count. **A browser's PDF
is RGB and not PDF/X**: it meets KDP's rules and not IngramSpark's stated ones (whether they refuse it in practice,
I couldn't confirm). What separates a typeset page from a word-processed one: paragraph-wide line breaking
(Knuth-Plass), hyphenation, facing pages of equal depth, no widows, real small capitals, old-style figures.

**The Scrivener 3 project.** No specification exists; this is from 14 real projects (Mac 3.1 to 3.5, Windows
3.1.5, the UK National Archives' samples) and the notes of people who have written them. It is XML, RTF and plain
text. Mac, Windows and iOS share it (`Version="2.0"`, `Files/version.txt` = `23`).

```
Name.scriv/
  Name.scrivx                       the binder: one XML file
  Files/version.txt                 "23"
  Files/Data/<UUID>/content.rtf     a document's text
  Files/Data/<UUID>/synopsis.txt    its synopsis (plain UTF-8)
  Files/Data/<UUID>/notes.rtf       its notes
  Snapshots/<UUID>.snapshots/       index.xml and one .rtf per snapshot
  Settings/compile.xml              which layout each section type uses
```

- The `.scrivx` must hold exactly one Draft, one Research and one Trash folder (a generator's projects would not
  open until Trash was there). Labels and statuses are lists with colours as three floats; a document's target is
  `<Target Type="Words">` in its text settings; **left out of compile is the element's absence** (no real file
  says `No`).
- Search indexes, checksums and the binder's backups are rebuilt silently when missing (L&L staff, and a test in
  Scrivener 3.5.2).
- Text must be RTF. Footnotes and comments have their own markers (`{\Scrv_fn=…}`, `{\Scrv_annot …}`); links
  between documents are `scrivlnk://UUID`.
- Section types can be written in (`<SectionTypes>` with defaults by structure), so **Scrivener's own Compile can
  work on the exported project at once**, as from its Novel template.
- No published writer of the format has evidence that Scrivener opens its output. Ten things only a real Scrivener
  can settle are listed under "Scrivener project export".

Other formats: single-file HTML is nearly free (it is what the EPUB and the PDF are made from) and worth having
later; plain text is trivial; Fountain and Final Draft are another audience; LaTeX, ODT, RTF: no.

### Building it in a plugin

| Part | Route | Cost | Notes |
|---|---|---|---|
| Zip | **fflate** `zipSync` (MIT) | 4 kB gzipped | Probed: writes `mimetype` first, stored, no extra field, as EPUB needs. Obsidian's API has no zip helper. JSZip is 30 kB |
| EPUB | hand-written XHTML and package files | about 10 kB | The libraries need Node or compile templates with `new Function` |
| DOCX | hand-written WordprocessingML, nine small parts | about 10 kB | The `docx` library is 115 kB gzipped, more than a quarter of the plugin today, and brings a second zip library. Risk: Word is strict about element order |
| Scrivener | hand-written `.scrivx` and RTF | about 10 kB | The RTF libraries are stale or Node-only |
| PDF on a computer | **our own pages, Chromium's lines, a hidden `<webview>`'s `printToPDF`** | about 10 kB, plus hyphenation patterns (18 to 27 kB a language) and fonts | See the spike. Better Export PDF does it the same way |
| PDF on a phone | none in 1.0 | | pdfkit with our own line breaking is about 270 kB gzipped plus fonts and a second pagination to keep in step; Typst as WASM is the best typesetter there is and 10 MB |
| Markdown | a real parser (micromark/mdast with footnotes and tables: 23 kB gzipped, MIT) with small additions for Obsidian's own syntax, into one model every writer reads | 23 kB | Obsidian has no public syntax tree. Rendering through `MarkdownRenderer` is true to Obsidian but slow, not testable in Node, and lets other plugins' output into a book |
| Fonts | inside `main.js` (the directory installs only `main.js`, `manifest.json`, `styles.css`) | about 100 kB a family (four styles, Latin, WOFF2) | All SIL OFL: EB Garamond, Literata, Source Serif 4, Crimson Pro, Libre Baskerville, Courier Prime. Precedent: a plugin in the directory carries 3.4 MB of fonts; Excalidraw is 5 MB. No size limit is stated |
| Saving | computer: Electron's save dialog and `fs`, behind `Platform.isDesktopApp`, required at use (what the review bot's own rule asks for); phone: the vault, then `navigator.share` | | The share sheet is reported working on iOS by another plugin's author; Android unknown |

Review: no remote code and nothing downloaded to run (which rules out fetching a typesetter); Node and Electron only
behind a desktop check; files written outside the vault said in the README. Nothing here needs the network. The
`<webview>` and its `printToPDF` are Electron's, not Obsidian's API: golden rule 5 applies (a module of its own,
detected, with "PDF isn't available here" as the fallback, a row in `docs/internals.md`, a test).

### Verified by doing (the spike)

One chapter of the test vault's *The Lighthouse* (its folder "Part One": three notes, written out to 1,454 words
for the purpose, with italics, a footnote, a comment, a wikilink, `--`, straight quotes, a `***` break inside a
note, and one note typed with tabs at each paragraph's start), read in binder order from a copy of the vault and
exported three ways by the route in the table.

- **EPUB**: 7.5 kB. **EPUBCheck: no errors or warnings** (its first run caught a real one: a landmark pointing at
  a file outside the reading order).
- **DOCX**: 8 kB, standard manuscript format, styles `Normal`, `Heading 1`, `Title`, `Scene Break`, a real
  footnote, the header with a live page number. **LibreOffice opens it** as intended (picture in `samples/`). Not
  opened in Word, Pages or Google Docs: none is on this machine.
- **PDF**: printed from inside a running Obsidian (headless, Electron 43.6, Chromium 150) through a hidden
  `<webview>`. 5 × 8 in, EB Garamond embedded as subsets, a tagged PDF.
- **No word lost**: a checker reads the words back out of each file and compares them with what went in. EPUB and
  DOCX: all 1,474, in order. PDF: all there (the 21 "differences" are the checker's own, at dashes and at
  "south-west").
- **A whole novel**: the chapter a hundred times over (145,000 words, 602 pages) was laid out in **2.7 seconds and
  printed in 1.7**, a 3.9 MB file.

What the spike taught, each of which changes the design:

1. **Electron has no hyphenation dictionaries.** `hyphens: auto` does nothing (confirmed; an open Electron issue
   says the same). Words are hyphenated by the plugin (TeX's patterns, about 20 kB a language) and Chromium breaks
   at the soft hyphens. Afterwards the unused ones are taken out again, or the PDF's text can't be searched or
   read aloud properly.
2. **Chromium's own paging is not enough for a book.** It has margin boxes with page numbers since Chromium 131,
   but no running head taken from the text, no footnotes at the foot of the page, and the page counter can't be
   restarted (I tried). And a chapter's first page can't hold text if it is to have no running head: giving it its
   own named page forces a break after the heading (six variants, all the same).
3. **So the pages are ours and the lines are Chromium's.** `paginate.js` (about 110 lines in the spike) fills
   fixed-size page boxes with the paragraphs in the page's own column, cuts a paragraph at a line when it doesn't
   fit (never one line alone at the foot or head of a page), and puts a note at the foot of the page its mark is
   on. Printing is then one box per sheet. This needs nothing newer than `@page { size }`, so **it also works on
   old Obsidian installers**, where margin boxes don't exist.
4. **The preview is therefore exact, for free.** The pages in the preview pane are the same boxes that are
   printed. That is the thing Scrivener doesn't have and Vellum is loved for.
5. **Variable fonts come out as Type 3** (which printers dislike); static font files embed as proper subsets.
   Fonts must be asked for before anything is measured, or the lines are measured in a fallback (it happened: a
   paragraph came out with a short line).
6. In headless Obsidian a second `BrowserWindow` crashes Electron; the `<webview>` works. (For tests, not users.)

**The honest ceiling of this PDF.** Chromium breaks lines one at a time, not by the paragraph: a loose line here
and there (the sample has one), where InDesign, TeX or Vellum would rebalance. Facing pages are not forced to
equal depth. The file is RGB and not PDF/X. It is a good trade-paperback interior, clearly better than a word
processor's or any Obsidian plugin's, and below a professional typesetter's. See `samples/paperback-spread-1.png`.

Not verified, and needing someone or something I don't have: Word, Pages, Google Docs; Kindle Previewer, Apple
Books, Kobo; Vellum and Atticus importing the DOCX; a real Scrivener; macOS and Windows; a real phone (the share
sheet); an old Obsidian installer.

### What Binders already has

- The order and the nesting (`contents`), folders with their notes, synopsis, label, status, target.
- "Include in compile" (`compile: false`, on a note, or in a folder note for the whole folder), in the item menu
  and as an outliner column: Scrivener's switch, already built.
- "Compile..." (`src/scenes.ts`, `compile()` in `src/scene-text.ts`): one Markdown note beside the binder, or the
  clipboard; folder and note names as headings, a separator, comments left out, footnote labels made unique across
  notes, a fingerprint so a compiled note someone has written in is never replaced without asking. Its rules for
  where properties end, for comments and for footnotes are the tested ones export should start from.
- Snapshots as plain files; the Longform reading; word counts; the two-pane dialog (Snapshots) the Export window
  reuses.
- `.claude/handoff/paragraph-indent/` did not exist when this was written. Export's rule doesn't depend on it:
  spaces or a tab typed at a paragraph's start are not text, and the style gives the indent.

## Three directions

They differ in one thing that matters: **where the answer to "how should this piece of the book look" lives.**

### A. Templates

Pick what to make (manuscript, ebook, paperback), pick one of three or four built-in styles, press Export. What a
folder or a note is comes from one dropdown ("Folders are chapters"); no per-item override, no style files, no
adjusting. Reedsy, in Obsidian.

- *Model:* by depth only. *Styles:* built in, closed. *Experience:* the window in the screens, without the style
  note and with a shorter Book details. *Name, Scrivener export:* the same in all three directions.
- *Costs:* a prologue that isn't a chapter, an interlude, a part with an epigraph, a writer who wants the scene
  break as a blank line: each is "go and finish it in Vellum". It doesn't rival Compile; it rivals StoryLine.
- *Size:* about two thirds of C.

### B. Layouts (Scrivener's system)

Section types per binder, assigned by structure and by hand; per format, a layout for each type (title prefix and
suffix with placeholders, separators before and between, what prints, new page), assigned in the window; a format
designer; replacements; front-matter folders per format; formats saved per binder or per vault.

- *Costs:* it is the maze, rebuilt. Two vocabularies and a wiring step; a designer of many panes that can't be put
  on a phone; a test matrix of formats × layouts × types; three or four times C's size. And it would still be
  second best at being Scrivener, to people who own Scrivener.

### C. Roles and style notes (recommended)

One vocabulary instead of two, and files instead of panes.

- A piece of the book has a **role**: part, chapter, scene, front matter, back matter, or left out. The role comes
  from a *structure* you choose once from four plain sentences (and Binders guesses first), and any item can be
  given another from its menu. That is Scrivener's "default types by structure" plus its per-document override,
  which is the part of section types that people understand.
- There are **no layouts to assign**. A style knows how to set each role, for every kind of output. Assign Section
  Layouts, the most-cited failure in the research, has no counterpart.
- A **style is a note** in the vault: a dozen plain properties (what the "Adjust this style" dialog edits) and, for
  whoever wants it, a block of CSS. The built-in ones are in the plugin; adjusting one saves a note. Shared by
  copying a file. This is where Scrivener's format designer goes: into Obsidian's own Properties and CSS, which an
  Obsidian user already knows.
- **One window, with the real pages in it.** The book as it will be exported is listed beside the pages, each item
  with the role it was given: the answer to "why does my book look like this?", with the fix in its menu.

What is kept from Compile, and where it lives:

| Compile has | Here |
|---|---|
| Include in Compile | "Include in export", as now (menu, outliner column, a folder note for a folder) |
| Section types, by structure and by hand | Roles: Book details › Structure, and "Export as" in an item's menu; an outliner column |
| Section layouts and assigning them | Nothing to do: the style sets each role |
| Title prefix, suffix, `<$n>` | `chapter-heading` in the style: `Chapter {number:words}`, `{title}` |
| Separators (4 slots × 4 values × layout) | Two facts in the style: the scene break's mark, and where a chapter opens |
| Front and back matter folders per format | Roles, by position and name; title and copyright pages made for you; the manuscript leaves them out unless asked |
| Compile formats, saved and shared | Style notes |
| Format designer | "Adjust this style" (the properties), and the note's CSS |
| Transformations | In the style: `quotes`, `italics`, `dashes` |
| Replacements | Not in 1.0 (a list in the style later; find and replace across the manuscript is on the roadmap) |
| Table of contents | Made for you: the ebook's always; a printed contents page when chapters have titles |
| Cover, metadata | Book details, kept in the binder note |
| Compile for: 20 file types | Five kinds |

*Costs:* more to build than A (the role override, the style files and their dialog). CSS as the escape hatch only
reaches the ebook and the PDF, not Word. A style note with a mistyped property has to be forgiven and reported.
And it will not do everything Compile does: no per-layout formatting matrix, no regex replacements, no LaTeX. That
is the point, but a Scrivener power user will find the edge.

**Why C.** A is the smallest version, and the maintainer's rule is the smallest version first; but A's saving is
exactly the two things (overrule a role, own a style) that make the difference between "export" and "rival
Compile", and both are small next to the writers and the paginator, which all three directions need. C can be
built *as A first*: the built-in styles and the structure dropdown ship in the first steps, and style notes and
"Export as" arrive in a later one without changing anything already built. B is not worth its cost.

## The recommended design

### 1. The model: how a binder becomes a book

**The book** is the binder (or the folder exported), and what every export of it shares is kept in the binder note
(Book details, `screens/9-book-details-*.png`): title (the folder's name unless said), subtitle, author (from a new
setting, "Your name", unless said), structure, the cover, the copyright line, language.

**Roles.** Every note and folder that is included gets one:

| Role | What it is in the book |
|---|---|
| Part | A part title on its own page; chapters under it |
| Chapter | Opens a chapter. Numbered, unless its name is one of Prologue, Epilogue, Interlude, Introduction, Foreword, Preface, Afterword (then it has its name and no number) |
| Scene | Text that continues the chapter, after a scene break |
| Front matter, Back matter | A page of its own before or after the text: by name a dedication, an epigraph, acknowledgements, about the author, also by; anything else is a titled page |
| Left out | `export: false` |

**Structure** says which is which. One of four, as sentences:

- *Folders are chapters, notes are scenes.* (A note at the top level is a chapter of one scene.)
- *Folders are parts, notes are chapters.*
- *Parts, chapters and scenes* (three levels).
- *Every note is a chapter* (folders only group; a Longform project is this).

Until the writer chooses, Binders guesses from the binder's shape: how deep it goes, and whether the top folders
are called "Part", "Book" or "Act". *The Lighthouse* (Prologue, Part One/, Part Two/, Epilogue) is guessed as
parts and chapters, with Prologue and Epilogue unnumbered. Notes before the first chapter or after the last with a
front- or back-matter name, and everything in a folder called "Front matter" or "Back matter", take those roles.
Folders deeper than the structure reaches only group their notes (a warning says so once).

**Overruling it:** "Export as" in an item's menu (Automatic, with what that comes to, then the roles), written as
`export-as: chapter` on the note or in the folder's note; and a column in the outliner beside "Export", where a
whole book's roles can be read and changed down a column. Not in the Export window: the outliner is already the
list Scrivener puts in its compile window, so it isn't built twice. The window *shows* the result ("Contents",
`screens/4-contents-and-warnings-*.png`) and each row there has the same menu.

**Titles.** A chapter's title is its note's or folder's name, without a number it starts with ("03 - Storm
warning" is "Storm warning"), and nothing at all if the name is only a number or "Chapter 3" or "Part One". If the
note opens with a level-one heading, that is the title and isn't printed twice. This is the cure for Scrivener's
doubled and missing titles: one rule, shown in the preview.

**Made for you:** a title page; a copyright page from the one line in Book details; the ebook's table of contents;
the manuscript's own title page (contact details, the word count rounded as Shunn says). A note of the book named
"Copyright" or "Title page" takes the made one's place.

**The same binder three ways, without touching a note:** the manuscript numbers its chapters "Chapter One", breaks
scenes with `#`, starts each chapter part-way down, leaves the dedication out; the ebook and the paperback set
them as the chosen style does, with the dedication and the copyright page. `samples/` is that, from one model.

**What Markdown becomes.**

| In the note | In the book |
|---|---|
| Properties | Never exported |
| A blank line, or a new line | A new paragraph (question 6). Two spaces or `\` at a line's end: a line break |
| A tab or spaces at a paragraph's start | Dropped: the style indents. (Only a fenced block is code) |
| `*italic*`, `**bold**` | Italic, bold. In the Courier manuscript style, italics underlined |
| `"straight"`, `--`, `...` | Curly quotes for the book's language, a dash, an ellipsis, unless the style says `quotes: as typed` |
| `---`, `***`, `___` alone on a line | A scene break |
| The break between two notes that are scenes | A scene break |
| A heading inside a note | A subheading (the first level-one heading of a chapter is its title) |
| `[[Note]]`, `[[Note\|words]]` | Its words. A link to a note that is in the book is a link in the ebook |
| `[words](https://…)` | A link in the ebook and in Word; its words in print |
| `![[picture.png]]`, `![](…)` | The picture, with its alt text. One that isn't found is left out, with a warning |
| `![[Note]]` | The note's text, one level deep. Anything else embedded (a PDF, audio, a canvas, a base): left out, with a warning |
| `[^1]` and `^[inline]` | A footnote: at the foot of the page in the PDF and in Word, a pop-up note in the ebook |
| `%% comment %%`, `<!-- -->` | Left out. In the manuscript, optionally a Word comment for the editor |
| `==highlight==` | Its words |
| `#tag` | Left out when alone on a line; otherwise kept as typed, with a warning the first time |
| A callout | A block quotation, its title in bold |
| A block quotation, a list, a table | The same |
| Code | Monospaced, as typed |
| Math | As typed, with a warning (after 1.0: set properly) |
| `^block-id` | Dropped |

Whatever is left out or changed is counted in the window before anything is exported, each with the note it is in.

### 2. Styles

**What a style is.** How each role is set, for one family of output. Two families: *manuscript* styles (Word and
PDF) and *book* styles (ebook and paperback together, as in Vellum: choose once and the ebook and the paperback
are the same book).

**Built in at 1.0:**

- Manuscript: **Standard manuscript** (Times New Roman, Shunn's modern format); **Standard manuscript, Courier**
  (Courier, italics underlined, for the markets that still ask); **Plain, for a typesetter** (single-spaced, no
  title page or header, Heading 1 chapters, `***` breaks: what Vellum, Atticus and an editor's own template want).
- Book: **Garamond** (the sample: centred small-capital chapter line, first words in small capitals, three
  asterisks, running heads with author and title, page number at the foot; EB Garamond) and one modern, plainer
  style on a contemporary face, to be designed in stage two and shown beside it.
- Few on purpose. The names are the typefaces because that is the truest thing to say about them; in an ebook the
  reader's own typeface is used and the style is its shape.

**What can be adjusted** ("Adjust this style...", a small dialog of dropdowns; the same things as the note's
properties): the chapter heading's words; where a chapter opens (next page, right-hand page); the first words (as
the rest, small capitals, a drop capital); the scene break (a mark, or space); paragraphs (indented, or spaced);
running heads (none, title, author and title, title and chapter); where the page number is; type size and line
height; quotes; and for the paperback, the page size. That is the whole list. **Margins are not on it**: they are
worked out from the page size and the number of pages (the printers' own table), as Vellum does.

**What the file is.** A note in a folder the writer names in settings ("Export styles", as the Templates plugin has
its folder). See `screens/10-style-note-*.png`: Obsidian's own Properties is the editor.

````markdown
---
export-style: 1              # format version: a newer one is listed, not used, and never rewritten
based-on: Garamond           # a built-in style, or another note; only the differences are written
chapter-heading: "Chapter {number:words}"
chapter-opens: right-hand page
first-words: small capitals
scene-break: "* * *"
paragraphs: indented
running-heads: author and title
page-numbers: foot
type-size: 11
line-height: 15
quotes: curly
---
Anything you like: what this style is for.

```css
/* optional: added after Binders' own rules, in the ebook and in the PDF */
p.break { letter-spacing: 0.3em; }
```
````

- Placeholders in `chapter-heading`: `{number}`, `{number:words}`, `{number:roman}`, `{title}`; `/` starts a new
  line; a line whose `{title}` is empty is dropped.
- A property Binders doesn't know is left alone and ignored; a value it can't read falls back to the style it is
  based on and is listed with the warnings. Binders writes a style note only from "Adjust this style", and only its
  properties (golden rule 3). A newer `export-style` is refused, not rewritten (golden rule 6).
- **Per binder** (in the binder note, added to `docs/file-format.md`, all optional, so still format 1): `title`,
  `subtitle`, `author`, `structure`, `cover`, `copyright`, `language`, and which style and page size it last used
  (`book-style`, `manuscript-style`, `page-size`). **Per vault:** the styles folder, "Your name" and contact
  details (for the manuscript's title page). **Per device** (plugin data, as `compiledTo` is today): where each
  binder's files were last saved.
- **Where the maze would start, and doesn't:** no per-role formatting beyond the list; no per-format overrides of
  a style; no conditions. Past the list there is CSS, and past CSS there is "Plain, for a typesetter".

### 3. The experience

**Where it starts:** "Export..." in the binder view's menu and a binder folder's menu (where "Compile..." is now),
the command "Export binder", and "Export again" (the last kind, to the same place, no window: a writer sending
chapters to a group does this weekly).

**The window** (`screens/1` to `8`). Obsidian's own two-pane dialog, the one File recovery and Binders' Snapshots
use.

- *Left:* the book's name with one button (Book details); **five kinds**, each a row with what it is for:
  Manuscript, Ebook, Paperback, Scrivener project, One note; under them the chosen kind's choices, two or three
  `Setting` rows, dropdowns before switches; at the foot, what export will have to leave out or change, each line
  opening its note.
- *Right:* a bar with what is being made and how big it is, "Contents" (a quiet toggle), the one filled button,
  **Export**, and a menu (Export again to the same place, Choose where to save, Adjust this style, Open the
  style's note, Book details). Under it, the preview.
- **How many decisions before the first good file: none.** Open, look, press Export. The kind is the last one
  used (Manuscript the first time); the structure is guessed; the title is the folder's name. The only thing
  Binders can't know is the writer's name, asked for once.

**The preview, and how true it is.**

| Kind | What is shown | How true |
|---|---|---|
| Paperback; Manuscript as PDF | The pages, facing | Exact: they are what is printed |
| Manuscript as Word | The same pages | Close: "Word sets its own lines, and may turn a page a line sooner or later" (said under the preview) |
| Ebook | One column on paper | The book's shape. "A reader chooses the typeface, the size and the colors" (said under it) |
| Scrivener project | The binder as Scrivener will list it, and what is carried across | A list, not a look |
| One note | The note | Exact |

Pages are paper, white in both themes, as Obsidian's own PDF viewer shows them. A long book is laid out a chapter
at a time from where the reader is looking; the page count says "about" until it is done (a whole novel took under
three seconds in the spike).

**While it runs:** the bar says what is happening in words ("Laying out pages… 212 of about 340") with Cancel;
then where it went, with Show in folder and Open (`screens/5`, `6`). No progress line. A failure says what and
which note, and leaves no half-written file (written beside the target, then renamed).

**Phones and tablets** (`screens/11` to `13`): the choices are the first screen with Preview and Export at the
foot, the preview the second, as Obsidian's own two-pane dialogs go. Paperback says "PDF. Needs Obsidian on a
computer" in its row; its pages can still be looked at. A tablet has both panes. The phone's `Setting` rows in the
screens still stack the control under its name: the finishing pass puts them on one line.

### 4. The name

**Export.** The reasons are in question 2. What happens to the old name:

- "Compile..." and "Compile binder" go; "Export..." and "Export binder" open the window, where **One note** is
  today's Compile with today's options and its Copy button.
- "Include in compile" becomes "Include in export"; the outliner's column "Compile" becomes "Export"; `export:
  false` is written, `compile: false` is read as the same thing for good.
- If the maintainer prefers **Compile**: everything above holds with the word changed, the property stays
  `compile`, and the one awkward spot is "Compile as › Scrivener project", which isn't a compile.

### 5. Scrivener project export

A kind of its own in the same window (`screens/7`): not a book, the binder itself, so no style and no Book
details. Two switches: **Notes outside the manuscript** (into Research; settled 2026-10-01) and **Snapshots**.

| Binders | Scrivener |
|---|---|
| Folder, note, their order | Folder and Text items under Draft, in order |
| Synopsis | `synopsis.txt` |
| Label, with its colour | The project's label list, and the item's label |
| Status | The status list, and the item's status |
| Target | The document's target, in words |
| "Include in export" off | Not included in compile |
| Role (by structure, and by hand) | **Section types**, with the defaults by structure, and `Settings/compile.xml`: Scrivener's own Compile works on the project at once |
| Snapshots | The item's snapshots, with their names and dates |
| A folder's note text; the binder note's text | The folder's own text; a document at the top of Research |
| Other properties | Custom metadata (as text) |
| Tags | Keywords |
| Footnotes; `%%comments%%` | Inline footnotes; inline annotations |
| Links to notes in the binder | Links between the documents |
| Pictures and other files | In the text where they were; files in Research |
| Text | Rich text: italics, bold, headings, lists, quotations, links. What rich text has no match for (a table, a callout, an embed, math) stays as Markdown, and is counted in the window |

One way, into a new folder, never the vault's notes. A computer gets a `.scriv` folder; a phone a zipped one.

**What only a real Scrivener can settle** (the maintainer has one): whether it opens a project with no `Settings`
or styles file; whether a foreign `Creator` is accepted; that a missing "include" reads as left out; whether a
small `compile.xml` makes Compile work without the prompt; the footnote and annotation markers on Windows; emoji;
hand-written snapshots; whether iOS opens it; how long the index rebuild takes on a big one; our tables and lists.

**Setting up Import.** The table above read right to left is the import. So: the mapping lives in one pure module
that both use; export writes each note's path into a custom metadata field, so a project that began in Binders
can later be matched note for note; and the test for both is the round trip (binder → `.scriv` → binder gives the
same order, properties and words). Import needs an RTF *reader* that export doesn't (Mac's and Windows's dialects,
both); the libraries are stale and Node-only, so it is a small tokenizer of our own, and it is import's main cost.

### 6. Scope, order, tests

**In 1.0:** the window; Manuscript (Word and PDF), Ebook, Paperback (computer), Scrivener project, One note; roles
by structure and by hand; Book details; two book styles and three manuscript styles; style notes and "Adjust this
style"; the exact preview; warnings; Export again; phones for everything but PDF.

**Waits:** PDF on a phone; replacements; several kinds in one go ("Export all"); drop capitals; a typeface picker
for installed fonts; pages of equal depth; PDF/X for IngramSpark; math; indexes; single-file HTML and plain text
(cheap, but each kind in the list is a thing to explain); Fountain; large print and hardback sizes.

**Order**, each step leaving something a writer can use. Sizes are for the way this project is built (an agent on a
ticket, reviewed and shipped), and rough.

| | Step | Leaves | Size |
|---|---|---|---|
| 0 | **Spikes that need other hands**: a minimal `.scriv` for the maintainer's Scrivener; the sample DOCX in Word, Pages, Google Docs, Vellum, Atticus; the sample EPUB in Kindle Previewer and Apple Books; `printToPDF` on macOS and Windows and on an old installer; the parser against the demo vault | Answers, no feature | 1 to 2 days, mostly waiting on people |
| 1 | **The model and the manuscript.** Notes to the book model (the parser, the table above); roles from structure; the window with Manuscript and One note; the Word writer; the word-for-word test | A submission manuscript in one step, and the hand-off to Vellum or Atticus. "Compile" renamed | 5 to 7 days. The foundation: the largest step |
| 2 | **Ebook.** The EPUB writer, the first book style, Book details (cover, copyright, language), the made pages, the ebook preview, EPUBCheck in the tests | A valid ebook for every store, on phones too | 3 to 4 days |
| 3 | **Pages.** The paginator made whole (tables, pictures, lists, long notes, part pages, blank pages), hyphenation, fonts, the PDF module (rule 5), page sizes and margins, the exact preview | A paperback PDF and a manuscript PDF, on a computer | 6 to 8 days. The riskiest step |
| 4 | **Scrivener project.** Can run beside 2 and 3: it shares only the reading of the binder | A project Scrivener opens | 3 to 4 days, plus the maintainer's rounds in Scrivener |
| 5 | **Overruling and owning.** "Export as" and the outliner column; style notes and "Adjust this style"; the second book style; warnings as a list; Export again | Direction C complete | 4 to 5 days |
| 6 | **Finish.** Phones and tablets by touch, both themes, the docs and the README, a QA round | Ready for 1.0 | 3 days |

Then Import from Scrivener, on the roadmap as its own item.

**Risks, in the order I'd face them:**

1. *Word rejecting hand-written XML* ("unreadable content"). Cheap to find in step 0; the fallback is the `docx`
   library at 115 kB.
2. *The paginator's edge cases* (a table across pages, a note longer than the room, a picture taller than what is
   left). The rule: when in doubt, the block moves whole and the page ends short; nothing is ever clipped. A test
   compares the words on the pages with the words that went in.
3. *Scrivener refusing the project.* Step 0, with the maintainer.
4. *The `<webview>`* going away or changing: detected, and PDF says it isn't available, with Word and EPUB
   untouched.
5. *Parser drift from Obsidian's dialect.* The demo vault and the QA vaults as a corpus; every difference a
   decision in the table.

**Tests.** Golden rule 2 has a cousin here: **an export never drops, repeats or reorders a word.**

- *Unit* (pure, in Node): the parser and the model (every row of the Markdown table); roles from structure; the
  writers as functions from the model to files; and for each writer, the words read back out of the file equal
  the words that went in, in order. The spike's `verify.mjs` is that test.
- *Validators in the test run, dev-time only:* EPUBCheck on every EPUB the tests make (Java: a 45 MB runtime
  unpacked beside the tests, as the spike did; skipped with a notice where it is missing, never in the plugin); the
  Open XML validator on the DOCX (prebuilt binaries on npm); LibreOffice converting the DOCX headless as a smoke
  test; `pdffonts` and `pdfinfo` on the PDF (every font embedded, the page size, the page count).
- *End to end* (real Obsidian): the window by keyboard and by touch; each kind exported from the test vault and
  from the demo vault's extremes; a note changed outside between preview and export; a 150,000-word binder under a
  time limit; a phone and a tablet; both themes; the fallback when the `<webview>` isn't there.
- *By hand, once per release:* the files opened in Word, Kindle Previewer, Apple Books, Vellum and Scrivener.

## Sources

Scrivener: the manuals (`literatureandlatte.com/docs/Scrivener_Manual-Mac.pdf`, `…-Win.pdf`); L&L's blog
("Scrivener 3: redesigning Compile", "Using section layouts", "Compile on iPad and iPhone", "Export to Vellum");
forum threads 54041, 41035, 54295, 139331, 135590, 38478, 153434; Gwen Hernandez's compile handout; Writer Unboxed,
Kindlepreneur, Cornell's guide, parrydox.com, ScribeCount.

Neighbours: `help.vellum.pub` (styles, elements, preview, generating, print, importing); `atticus.io`;
`help.ulysses.app` and `styles.ulysses.app`; `github.com/iainc/iA-Writer-Templates`; `reedsy.com/studio`;
`novelwriter.io/docs`; `pandoc.org/MANUAL.html`; the repositories of Longform, Enhancing Export, Pandoc Plugin,
Better Export PDF and StoryLine; Obsidian's plugin statistics file, read 2026-10-05.

Formats: W3C EPUB 3.3 and EPUB Accessibility 1.1; Amazon's Kindle Publishing Guidelines 2026.2 and KDP's help
pages; Apple Books Asset Guide 5.3.1; `github.com/kobolabs/epub-spec`; IngramSpark's File Creation Guide;
`shunn.net/format`; Vellum's and Atticus's import pages; `developer.chrome.com/blog/print-margins`; MDN's
compatibility data; Electron's `webContents` documentation and issue 33692.

Scrivener's format: `digital-preservation/PRONOM_Research`, `mindfu23/bartleby` (its `NOTES.md`),
`bpkennedy/tamareth`, L&L forum thread 141155 and the knowledge-base page on cross-platform compatibility.

Building: `docs.obsidian.md` (Developer policies, Plugin guidelines, Submission requirements),
`eslint-plugin-obsidianmd`, Obsidian's changelogs for the Electron in each installer, the npm registry and
measured bundles.
