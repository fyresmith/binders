# Roadmap: what's left before 1.0

Decided with the maintainer on 2026-10-01. The work under Now and Next ships before the first release. These features apply
only to notes inside a binder; a note anywhere else in the vault is left exactly as Obsidian has it.

Added 2026-10-02: nothing is released before export is built. Until then the project is brought to a release-ready
state (code, tests and documentation).

## Now

- [ ] **Mobile QA, to the end.** Every mode, the file explorer, the dialogs and the settings, on phone and tablet
      sizes, by touch: every bug found is fixed with a test, and the result is tried on a real iPhone or iPad and a
      real Android device (so far phones are only emulated; "emulator is king": until the maintainer has a real
      device, the emulated phone and tablet tests are the standard). Findings live in `tests/e2e/specs-qa4-mobile.mjs` and
      `tests/e2e/specs-qa5-*.mjs`. Integration results and remaining findings: [integration QA](docs/dev/integration-qa.md).

## Next, in this order

- [x] **Arrange by label.** The corkboard's cards laid along one line per label, in binder order, as Scrivener's
      "Arrange by Label" does: which thread each scene is on, and how the threads interleave. "Arrange" in the
      corkboard's toolbar chooses; lines run across or down; dragging a card to another line gives it that label,
      along the lines changes its place, and Undo takes both back. Design approved by the maintainer and built
      (2026-10-01); see `docs/dev/plan.md`, "Arranged by label".

- [ ] **Export.** A binder (or a folder of it) out as a book: EPUB, DOCX and PDF, with front and back matter, a
      title page, chapters from folders, and scene breaks. **Designed and decided 2026-10-05:
      [docs/dev/export.md](docs/dev/export.md)** (roles and styles, a style editor with the real pages beside it, five
      kinds, built with no outside tools, PDF on a computer only, and the order it is built in, steps 0 to 6).
  - [x] **Step 1: the book model and the manuscript** (2026-10-05). The Markdown reader and the one book model
        every writer reads; roles from the structure Binders reads off a binder's shape (`export-as` and
        `structure` honoured as properties); the Export window with Manuscript and One note; the Word writer in
        standard manuscript format, held to the word-for-word test; where files go (the save dialog, remembered
        places, the Exports folder). "Compile" is now Export's "One note", and `export: false` is what is written.
  - [x] Step 2: the ebook (the EPUB writer, the first book style, Book details, the made pages).
  - [x] Step 3 (2026-10-06): pages. The paginator, hyphenation, EB Garamond and Source Serif 4 inside the plugin,
        the PDF module, **Paperback** (a book style on a trim size) and the manuscript as a PDF, and the window
        showing the very pages that are printed. A computer makes the PDF; a phone shows the pages.
        `docs/dev/export.md`, "Pages and PDF, as built".
  - [x] **Step 4: the Scrivener project** (2026-10-05). The binder itself as a `.scriv` folder: the `.scrivx`, RTF
        documents, synopses, labels, statuses, targets, snapshots, section types, held to the word-for-word test;
        written whole or not at all, never over a project opened since; zipped on a phone. Opened so far only as
        the format spike's projects, in the maintainer's Scrivener: `docs/dev/export.md`, "As built".
  - [x] Step 5: overruling and owning ("Export as" from Contents, the menus and an outliner column; the style editor
        and style files in a hidden `Export styles` folder; the second book style, Modern; Export again).
  - [ ] Step 6: finish (phones and tablets by touch, both themes, the docs, a QA round).
  - **And out as a Scrivener project** (added 2026-10-01): a `.scriv` folder Scrivener 3 opens, for a writer who
    moves on to Scrivener or sends the book to someone who uses it. Not a book but the binder itself: folders and
    notes in binder order as Scrivener's Draft, each note's text as rich text (headings, bold, italics, lists, links
    and footnotes kept; what has no match in rich text stays as plain Markdown), and what a writer set here carried
    across: synopsis, label (with its color), status, word count targets, and snapshots once those are built. One
    way only: it writes a new project and never changes the vault (reading one is **Import**, below). Built without
    outside tools, so it works on phones. Settled 2026-10-01: Scrivener 3's format only; a toggle in the export
    dialog, **Include notes outside the manuscript**, puts those in Scrivener's Research folder; the maintainer has
    Scrivener and opens each build's result in it before this ships.
- [x] **Import from Scrivener.** A Scrivener 3 project (`.scriv`) in as a new binder: the Draft's folders and
      documents as folders and notes in the same order, rich text as Markdown, and synopsis, label, status, targets
      and snapshots carried across, with the same toggle for Research. Makes a new folder and never writes into an
      existing one or changes the Scrivener project. Built: from the command palette, a project's folder on a
      computer or a zipped backup anywhere, shown before it is made. Every original file is kept. See
      [Import from Scrivener](docs/import-scrivener.md).
- [ ] **Find and replace across the manuscript.** One search over every note of the binder, in binder order, with
      replace one or replace all, from the manuscript. Never loses writing: replace all is one step to undo, and says
      how many notes it will change before it does.
- [x] **Snapshots of a scene ("Rewrite").** **Take a snapshot** sets a scene's text aside as it is; **Rewrite** takes
      one and starts again, from the same text or a blank page; **Snapshots** lists every earlier one to read, compare
      with the note now, and bring back (the text it replaces is kept as a snapshot first). Only the text is kept, not
      the synopsis, status or label. Snapshots live in one folder per binder that never shows in the file explorer
      or in search, never counts as part of the binder, follows a scene when it's renamed or moved, and stays when
      a scene is deleted. Built 2026-10-01: plain `.snapshot` files in the binder's `Snapshots` folder (see
      `docs/dev/file-format.md`). Obsidian Sync carries them only with "Sync all other types" turned on.
- [x] **Focus mode.** The text and nothing else, for a note of a binder (in the manuscript and in a note's own
      tab), in the vault's own type, with one key to leave. Typewriter scrolling is on as it comes (for the last
      line only: editing further up scrolls as ever). Everything more is an option, off as it comes: the scenes
      before and after shown in the page, the scene's place and synopsis in the margin, the word counts (hidden
      while typing), a goal for today, and dimming the other paragraphs. Built 2026-10-01 (`src/focus/`,
      `tests/e2e/specs-focus.mjs`); still to do on real devices: iOS and Android, and Android's back button.

## Then

- [ ] 1.0: release and directory submission (see `docs/dev/plan.md`, Milestones).

Smaller things wanted after 1.0 are listed at the end of `docs/dev/plan.md`.

## After 1.0: focused additions

Added 2026-10-05 after reviewing the implemented workflow and the existing plans. These additions do not delay 1.0.
Priority weighs recurring writing value (40%), fit with native Obsidian and the existing views (25%), safety and
implementation feasibility (20%), and low ongoing maintenance and UI cost (15%). These are design judgments,
not measured user demand. Reassess after writers use the released plugin; a competitive feature list alone is
not a reason to build something.

### 1. Saved manuscript subsets

- [ ] **Saved filters, then collections.** Work on scenes scattered across a book without moving or copying them.
      First support named filters scoped to a binder or folder: label, status, export inclusion, and selected
      existing properties, including list membership and missing values. Combine conditions with AND; allow several
      accepted values within a condition. Example: scenes whose `characters` contains Alice and whose status is Draft.
      Reuse the current Filter control, three views, and native property names and types; no new view or query language.
      Scene order always follows the manuscript. Show the active subset and its count, with one action to return to
      the full manuscript. An empty result explains the filter and offers to clear it.
  - Start with saved filters. Add manually picked collections only after use establishes that property filters
    cannot serve a recurring task. Example: five scenes selected for a critique session, with no shared property.
  - Store definitions as readable binder metadata; follow renamed files in manual collections and show missing
    members rather than silently substituting notes. Explain that saved subsets do not change export inclusion.
  - Ship when a writer can save, reopen and edit a cross-chapter subset in all three views, with ancestors shown
    only as context and no change to the full manuscript's order. Reordering is disabled in a subset initially;
    adding scenes and changing properties must not hide pending edits or discard the caret.
  - **Weight:** highest value, strong architectural fit, moderate complexity. This extends tools already built.

### 2. A small revision queue

- [ ] **Scene-linked revision tasks.** Capture “establish why Alice leaves” while drafting, then visit the affected
      scenes in manuscript order and mark the work done. Start with Markdown checkboxes and links to scenes in one
      ordinary revision note per binder. Offer a capture command, an unresolved count and next/previous navigation
      through an optional native pane. Manual edits to that note remain supported. No separate task database,
      scheduler, priorities, assignments or notifications.
  - A task may include a quoted passage for context. The quote is a reference, not a promise that a text range will
    follow edits. File renames use Obsidian's link handling; a missing scene remains visible as an unresolved link.
  - Ship when capture does not interrupt or lose pending writing, navigation opens the correct scene, completing
    a task changes only its checkbox, and the queue remains readable and usable with Binders disabled.
  - Add passage anchors only if scene-level navigation proves insufficient in actual revision work. Any later
    anchor must report ambiguity or a missing passage instead of attaching a comment to the wrong words.
  - **Weight:** high writing value, good native fit, moderate complexity in this limited form. Validate that the
    capture and navigation save work beyond an ordinary task note before expanding it.

### 3. Predictable recovery from merge

- [ ] **Explicit recovery for merged scenes.** Make reversing a merge discoverable. Design around the original
      text, affected files, properties, order and links. A merge needs one understandable recovery action; do not
      promise universal Ctrl+Z across editors and vault actions. First prototype merge recovery, then decide whether
      it belongs in the existing history UI. Split already has safe editor undo on current main; preserve that behavior.
  - If any affected scene has been edited, moved, deleted, synced or linked differently since the operation, refuse an
    automatic reversal and offer the preserved text for comparison or recovery. Never delete subsequent writing.
  - Ship only with external-edit, pending-save, link, name-collision and repeated-recovery tests proving that prose
    survives. Persistent recovery data must be bounded and readable; this is not a general vault transaction system.
  - **Weight:** high trust value and little UI cost, but high implementation risk. Keep behind subsets and the
    revision queue unless released users encounter restructuring problems frequently.

### Defer or leave to Obsidian

- **Branching:** do not add. Two live versions of a book need merging, and merging prose is where writing is
  lost. A snapshot of the binder (below, built) is read, compared and brought back; "Make a binder from this
  snapshot" writes it out as a second binder for the writer who wants to try another ending.
- **Daily automatic snapshots of a binder:** later, off by default. Snapshots of a folder and of the whole binder
  were decided and built on 2026-10-06 (`docs/dev/plan.md`, "Snapshots of a folder and of the binder"): taking,
  reading, comparing, one note brought back and a binder made from a snapshot first; then bringing back the text
  and the order; then everything; then the automatic ones before a bring back and before find and replace.
- **A research browser or story-bible system:** do not add. Use ordinary links, backlinks, Properties and split
  panes. Reconsider a small scene-to-reference navigation action only if observed writing sessions expose a gap;
  no duplicated character, location or source database.
- **Named writing workspaces:** leave to Obsidian's Workspaces core plugin and Binders' existing view state. Add
  missing state restoration to those mechanisms if necessary, rather than a second workspace manager.
- **Universal undo:** defer beyond existing split undo and proposed merge recovery. Renames, deletes and duplicates have different conflict
  and recovery rules; one global history would add substantial state and false expectations.

For every addition: identify a repeated writing task, show the shortest usable interaction, keep the result
readable without Binders, and test it in a book-sized binder before expanding scope. No new dashboard, permanent
toolbar group or configuration system unless the workflow cannot work through existing controls.
