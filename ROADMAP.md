# Roadmap: what's left before 1.0

Decided with the maintainer on 2026-10-01. Everything here ships before the first release. The four features apply
only to notes inside a binder; a note anywhere else in the vault is left exactly as Obsidian has it.

## Now

- [ ] **Mobile QA, to the end.** Every mode, the file explorer, the dialogs and the settings, on phone and tablet
      sizes, by touch: every bug found is fixed with a test, and the result is tried on a real iPhone or iPad and a
      real Android device (so far phones are only emulated). Findings live in `tests/e2e/specs-qa4-mobile.mjs` and
      `tests/e2e/specs-qa5-*.mjs`.

## Next, in this order

- [ ] **Arrange by label.** The corkboard's cards laid along one line per label, in binder order, as Scrivener's
      "Arrange by Label" does: which thread each scene is on, and how the threads interleave. Lines run across or
      down; dragging a card to another line gives it that label. A design is being drawn up for the maintainer to
      approve (2026-10-01); nothing is built until then.

- [ ] **Export.** A binder (or a folder of it) out as a book: EPUB, DOCX and PDF, with front and back matter, a
      title page, chapters from folders, and scene breaks. "Compile" today makes one Markdown note; export builds on
      it. To settle first: what is built in, and what goes through Pandoc where it is installed. Mobile needs an
      answer too (EPUB can be built without outside tools).
  - **And out as a Scrivener project** (added 2026-10-01): a `.scriv` folder Scrivener 3 opens, for a writer who
    moves on to Scrivener or sends the book to someone who uses it. Not a book but the binder itself: folders and
    notes in binder order as Scrivener's Draft, each note's text as rich text (headings, bold, italics, lists, links
    and footnotes kept; what has no match in rich text stays as plain Markdown), and what a writer set here carried
    across: synopsis, label (with its color), status, word count targets, and snapshots once those are built. One
    way only: it writes a new project and never reads one back or changes the vault. Built without outside tools, so
    it works on phones. To settle first: Scrivener 3 only or the Windows version 1 format too; whether notes that
    aren't part of the manuscript go to Research; and a test that opens the result in Scrivener itself.
- [ ] **Find and replace across the manuscript.** One search over every note of the binder, in binder order, with
      replace one or replace all, from the manuscript. Never loses writing: replace all is one step to undo, and says
      how many notes it will change before it does.
- [ ] **Snapshots of a scene ("Rewrite").** **Take a snapshot** sets a scene's text aside as it is; **Rewrite** takes
      one and starts again, from the same text or a blank page; **Snapshots** lists every earlier one to read, compare
      with the note now, and bring back (the text it replaces is kept as a snapshot first). Only the text is kept, not
      the synopsis, status or label. Snapshots live in one folder per binder that never shows in the file explorer
      or in search, never counts as part of the binder, follows a scene when it's renamed or moved, and stays when
      a scene is deleted. Design approved 2026-10-01; being built.
- [ ] **Focus mode.** The text and nothing else, for a note of a binder (in the manuscript and in a note's own
      tab), in the vault's own type, with one key to leave, and typewriter scrolling for the last line only
      (editing further up scrolls as ever). Everything more is an option, off as it comes: the scenes before and
      after shown in the page, the scene's place and synopsis in the margin, the word counts (hidden while typing),
      a goal for today, and dimming the other paragraphs. Design approved 2026-10-01; being built.

## Then

- [ ] 1.0: release and directory submission (see `docs/plan.md`, Milestones).

Smaller things wanted after 1.0 are listed at the end of `docs/plan.md`.
