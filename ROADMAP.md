# Roadmap: what's left before 1.0

Decided with the maintainer on 2026-10-01. Everything here ships before the first release. The four features apply
only to notes inside a binder; a note anywhere else in the vault is left exactly as Obsidian has it.

Added 2026-10-02: nothing is released before export is built. Until then the project is brought to a release-ready
state (code, tests and documentation).

## Now

- [ ] **Mobile QA, to the end.** Every mode, the file explorer, the dialogs and the settings, on phone and tablet
      sizes, by touch: every bug found is fixed with a test, and the result is tried on a real iPhone or iPad and a
      real Android device (so far phones are only emulated; "emulator is king": until the maintainer has a real
      device, the emulated phone and tablet tests are the standard). Findings live in `tests/e2e/specs-qa4-mobile.mjs` and
      `tests/e2e/specs-qa5-*.mjs`. Integration results and remaining findings: [integration QA](docs/integration-qa.md).

## Next, in this order

- [x] **Arrange by label.** The corkboard's cards laid along one line per label, in binder order, as Scrivener's
      "Arrange by Label" does: which thread each scene is on, and how the threads interleave. "Arrange" in the
      corkboard's toolbar chooses; lines run across or down; dragging a card to another line gives it that label,
      along the lines changes its place, and Undo takes both back. Design approved by the maintainer and built
      (2026-10-01); see `docs/plan.md`, "Arranged by label".

- [ ] **Export.** A binder (or a folder of it) out as a book: EPUB, DOCX and PDF, with front and back matter, a
      title page, chapters from folders, and scene breaks. "Compile" today makes one Markdown note; export builds on
      it. To settle first: what is built in, and what goes through Pandoc where it is installed. Mobile needs an
      answer too (EPUB can be built without outside tools).
  - **And out as a Scrivener project** (added 2026-10-01): a `.scriv` folder Scrivener 3 opens, for a writer who
    moves on to Scrivener or sends the book to someone who uses it. Not a book but the binder itself: folders and
    notes in binder order as Scrivener's Draft, each note's text as rich text (headings, bold, italics, lists, links
    and footnotes kept; what has no match in rich text stays as plain Markdown), and what a writer set here carried
    across: synopsis, label (with its color), status, word count targets, and snapshots once those are built. One
    way only: it writes a new project and never changes the vault (reading one is **Import**, below). Built without
    outside tools, so it works on phones. Settled 2026-10-01: Scrivener 3's format only; a toggle in the export
    dialog, **Include notes outside the manuscript**, puts those in Scrivener's Research folder; the maintainer has
    Scrivener and opens each build's result in it before this ships.
- [ ] **Import from Scrivener.** A Scrivener 3 project (`.scriv`) in as a new binder: the Draft's folders and
      documents as folders and notes in the same order, rich text as Markdown, and synopsis, label, status, targets
      and snapshots carried across, with the same toggle for Research. Makes a new folder and never writes into an
      existing one or changes the Scrivener project. After export, which settles how the two formats map.
- [ ] **Find and replace across the manuscript.** One search over every note of the binder, in binder order, with
      replace one or replace all, from the manuscript. Never loses writing: replace all is one step to undo, and says
      how many notes it will change before it does.
- [x] **Snapshots of a scene ("Rewrite").** **Take a snapshot** sets a scene's text aside as it is; **Rewrite** takes
      one and starts again, from the same text or a blank page; **Snapshots** lists every earlier one to read, compare
      with the note now, and bring back (the text it replaces is kept as a snapshot first). Only the text is kept, not
      the synopsis, status or label. Snapshots live in one folder per binder that never shows in the file explorer
      or in search, never counts as part of the binder, follows a scene when it's renamed or moved, and stays when
      a scene is deleted. Built 2026-10-01: plain `.snapshot` files in the binder's `Snapshots` folder (see
      `docs/file-format.md`). Obsidian Sync carries them only with "Sync all other types" turned on.
- [x] **Focus mode.** The text and nothing else, for a note of a binder (in the manuscript and in a note's own
      tab), in the vault's own type, with one key to leave. Typewriter scrolling is on as it comes (for the last
      line only: editing further up scrolls as ever). Everything more is an option, off as it comes: the scenes
      before and after shown in the page, the scene's place and synopsis in the margin, the word counts (hidden
      while typing), a goal for today, and dimming the other paragraphs. Built 2026-10-01 (`src/focus/`,
      `tests/e2e/specs-focus.mjs`); still to do on real devices: iOS and Android, and Android's back button.

## Then

- [ ] 1.0: release and directory submission (see `docs/plan.md`, Milestones).

Smaller things wanted after 1.0 are listed at the end of `docs/plan.md`.
