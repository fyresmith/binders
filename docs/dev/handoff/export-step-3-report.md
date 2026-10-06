## Export step 3 (pages and PDF): built

Paperback and the manuscript as a PDF both export from the window, and the window shows the very pages that print. Nine commits on branch `worktree-agent-aec3bff7277c01755`, rebased on local `main` at `39ee51b` (0.33.2). `npm run check` passes; the three export spec files pass 78 of 78 in both themes.

**Not made: the Modern samples.** `BOOK_STYLES` on `main` still has only Classic (step 5 hasn't landed), so there is no "Low Water at Corran" in Modern. The Source Serif 4 files are in and load by family name, but no test or sample has exercised them.

### Commits, in order

| Hash | Bump | Title | CHANGELOG |
|---|---|---|---|
| `5e197cb` | patch | Export pages: the paginator, the page's measures, hyphenation | (nothing a writer sees yet) |
| `895d339` | patch | EB Garamond and Source Serif 4 travel in the plugin | (nothing yet) |
| `c9c6514` | patch | The PDF module, feature-detected | (nothing yet) |
| `d05b7fb` | **minor** (makes Paperback usable) | Export: Paperback, and the manuscript as a PDF, with the exact pages in the window | Added: "Paperback: a book style on a trim size (5 × 8 to 6 × 9 in, or A5), exported as a print-ready PDF with its fonts embedded." / "A manuscript can be exported as a PDF as well as a Word file, on Letter or A4." / "For a PDF the Export window shows the pages themselves, facing, exactly as they will print." / "On a phone or tablet a PDF's pages can be looked at; the PDF is made on a computer." |
| `43ee281` | patch | A manuscript's parts are headed as chapters | Fixed: "A part in a manuscript PDF has the header and its page number." |
| `e7ddd32` | patch | A finished page's lines are made fast | Fixed: "A page of a PDF no longer comes out a line too long, and a word broken at a line's end keeps its hyphen." / "A book with pictures prints." |
| `01bc637` | patch | The typeface's warning in the window | Added: "Export says when a book's language isn't written in letters the style's typeface has." |
| `df3d5fe` | patch | Docs: the pages and the PDF, as built | — |
| `c40b6bf` | patch | The frame's scrollbar follows the theme; a phone doesn't say where a PDF would go | Fixed: both, as the title says. |

The first three could be shipped as one with `d05b7fb`; they are separate so each passes `npm run check` alone.

### For step 5
- `drawPages(el, book, style, { size?, progress? })` in `src/view/export-preview.ts` returns `{ stop, laid }`. Stop it and call again when the style changes.
- `BookStyle`'s shape is unchanged.
- `Details` gained `pageSize` (`page-size`); settings gained `exportFile` and `exportPaper`.
- My edits to `src/view/export.ts` are in `d05b7fb`, `01bc637` and `c40b6bf`.

### Results
- **Word for word:** the test vault's book (pages against the notes, PDF against the pages); 11 demo example books, 231,307 words on 1,113 pages, each section's text and notes in order against its EPUB, then every printed page against the window's page; a generated 150,000-word binder against its source, in the window and in the PDF.
- **Not covered:** the demo vault's 16 stress-test binders were not paged. Only the 11 in `Examples/` were, so 231,000 words, not 714,000.
- **Timing, 150,000 words (542 pages):** laid out in 2.6 to 3.4 s, exported (read, laid out again, printed, saved) in 4.6 to 6.4 s. Under the suite's load (load average 48) the same layout took up to 46 s, so the test's limits are 60 s and 180 s; it prints the real numbers.
- **`pdffonts`:** every font is embedded as a subset, and EB Garamond is never Type 3. In "Other Alphabets" this machine's own Noto Sans CJK and Noto Color Emoji are embedded as Type 3; the test says so aloud rather than failing.
- **Bundle:** `main.js` 644,633 → 1,234,260 bytes. EB Garamond is 145 kB as files and Source Serif 4 is 117 kB (about a third more as base64, roughly 350 kB together); hyphenation patterns about 190 kB; the rest is code.

### Two bugs the tests found
- **Soft hyphens were never recognised as used.** Chromium gives a used soft hyphen two boxes, the first empty; I read the first. Every hyphen was being stripped and the text re-broken without them, and a word cut at a page's foot lost its hyphen.
- **Pages a line over-full.** Taking a soft hyphen out restores kerning, which can move a line's end; five of the demo novel's pages (430 in the design note) were a line over. Each line's end is now written into a finished page as a break, so neither that nor a printer measuring differently can re-break a line. Table cells are not pinned.

### Verified by a test, or by eye
- **Unit (`tests/export-pages.test.ts`, 56):** the paginator on numeric pages, including the spike's footnote-mark case, a long footnote carried over, widows and orphans, headings and breaks, tables by rows, right-hand openings, and 300 random books; heads and numbers; the page's measures; hyphenation; the PDF's information.
- **e2e (`tests/e2e/specs-export-pdf.mjs`, 10 tests, both themes):** the kind and its choices, preview pages equal printed pages (count, words, first words), the saved file with its size, title, author and language, the manuscript PDF, the page size kept in the binder note, the fallback, a phone, spreads on a wide window, the layout invariants and contents numbers on the demo books, the typeface warning.
- **By eye only:** how the pages look (title page, contents, chapter opening, the handbook's table and footnotes, the manuscript's title page), and the two window screenshots I opened (desktop dark, phone light).

### Decided while building
Listed in full in `docs/dev/export.md`, "Decided while building the pages (step 3)". The ones worth a look:
1. Trim sizes are 5 × 8, 5.25 × 8, 5.5 × 8.5, 6 × 9 in and A5.
2. Front matter is counted in Roman numerals and the text starts at 1.
3. The manuscript's PDF is a "File" choice on Manuscript, with "Paper" beside it, not a sixth kind.
4. A table's head row is not repeated over a page; a dedication and an epigraph have no heading; the printed contents leave out the title page.
5. Seven languages are hyphenated (English US and GB, German, French, Spanish, Italian, Portuguese); Dutch was left out for size.
6. A book whose language is in a script the faces lack is set whole in the computer's serif, with a warning.
7. Export lays the book out again out of sight rather than printing the window's pages.

### For the maintainer to decide
- The bundle nearly doubled.
- The `hyphenation.*` packages have no licence field; the patterns are TeX's under per-language licences, and I did not check each.
- On a phone the Manuscript kind has one more row, so Preview and Export can sit under the fold on a small screen. I added a scroll-into-view to the older phone test for this.
- Older tests in `specs-export.mjs` were edited only for the new kind and row.

### Unverified
- macOS and Windows, and an old Obsidian installer.
- A print shop's intake (KDP, IngramSpark), and a printed copy.
- A tablet with a PDF kind.
- Scrolling a 600-page preview: finished pages use `content-visibility: auto`, which I reasoned about but did not test.
- A table row taller than a page overflows and nothing warns.
- Right-to-left books' spine side is coded but no test has a book whose language is RTL.
- The e2e harness reports only a test's first failure, so a failing run may hide later assertions.

### For the manual
- **Paperback** makes a PDF ready for a printer. Choose a Style and a Page (5 × 8, 5.25 × 8, 5.5 × 8.5, 6 × 9 in, or A5). The page is remembered with the book.
- **Manuscript** has a File choice: Word, or PDF. With PDF, choose Paper: Letter or A4.
- For either PDF the window shows the real pages, two facing on a wide window and one under another on a narrow one. The bar says how many pages and what size.
- A PDF is made on a computer. On a phone or tablet you can look at the pages and choose the style and page; there is no Export for it there.
- Footnotes sit at the foot of the page their mark is on; a long one continues on the next page. Front matter is numbered i, ii, iii; the text starts at 1.
- Limits: lines are justified one at a time, so an occasional loose line; facing pages may end at different heights; the file is RGB, with no bleed or crop marks. Words are hyphenated in English, German, French, Spanish, Italian and Portuguese only. Russian, Greek, Hebrew, Arabic, Chinese, Japanese and Korean books are set in the computer's own serif, and Export says so.

### Where things are
- Samples and screenshots are in `/tmp/claude-1000/-home-calebsmith-Projects-binder/9233dfcf-0304-4e57-9f50-1f65d5cceed6/scratchpad/export-step-3/`:
  - `test-vault-the-lighthouse.pdf`
  - `test-vault-manuscript-a4.pdf`
  - `demo-low-water-at-corran-classic.pdf`
  - `demo-the-kitchen-table-press-classic.pdf` (the handbook)
  - `demo-other-alphabets-classic.pdf`, plus the other eight demo books
  - `generated-150000-words.pdf`
  - `window-*.png` and `phone-*.png`, light and dark
- Run with `BINDERS_KEEP_PDF=<folder>` to keep them again.
- Code: `/home/calebsmith/Projects/binder/.claude/worktrees/agent-aec3bff7277c01755/src/export/pages/`, `src/export/pdf.ts`, `src/export/pdf-info.ts`, `src/export/fonts/` (the OFL notices are beside the font files), `scripts/subset-fonts.py`.
- Docs: `docs/dev/export.md` ("Pages and PDF, as built"), `docs/dev/internals.md`, `docs/dev/architecture.md`, `docs/dev/development.md`, `ROADMAP.md`. README untouched, as asked.