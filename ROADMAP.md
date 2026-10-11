# Roadmap

Where Binders stands: what is built and released, the features still to build, and the hardening that ends in 1.0.
The [changelog](CHANGELOG.md) is the record of what shipped and when; this page is the plan. When the two
disagree, the changelog is right and this page is behind.

Binders is a **public beta** (0.x). The first beta was 0.44.5, on 2026-10-06, and it has been in Obsidian's
[community plugin directory](https://community.obsidian.md/plugins/binders) since. 1.0.0 is the first stable
release, and the maintainer calls it.

## Built and released

Everything here is in the released plugin. The manual has a page for each.

- **Binders in the vault and the file explorer:** order, drag to reorder, label dots, undo of moves.
  [The file explorer](docs/file-explorer.md)
- **The binder view, three modes:** [corkboard](docs/corkboard.md), [outliner](docs/outliner.md) and the
  [editable manuscript](docs/manuscript.md), with the [inspector](docs/inspector.md) and the contents beside them.
- **Labels, statuses and word count targets,** and **arrange by label** on the corkboard (2026-10-01).
  [Labels, statuses, targets](docs/labels-statuses-targets.md)
- **Scene tools:** split, merge, duplicate, group. [Splitting and merging](docs/splitting-and-merging.md)
- **Snapshots of a scene** and "Rewrite" (2026-10-01), and **snapshots of a folder or the whole binder:** take,
  read and compare; make a binder from one; bring back one note, the text and the order, or everything (2026-10-06
  to 2026-10-09). An automatic snapshot is taken before bringing one back and before Replace all.
  [Snapshots](docs/snapshots.md)
- **Focus mode** (2026-10-01). [Focus mode](docs/focus-mode.md)
- **Export** (2026-10-05 to 2026-10-09): a manuscript in standard format (Word or PDF), an ebook (EPUB), a
  paperback (PDF), a Scrivener 3 project, one note; book styles and a style editor; Export again.
  [Export](docs/export.md)
- **Import from Scrivener** (2026-10-06): a Scrivener 3 project, or a zipped backup, as a new binder.
  [Import from Scrivener](docs/import-scrivener.md)
- **Find and replace across a binder** (0.49.0, 2026-10-09). [Find and replace](docs/find-and-replace.md)
- **The Longform integration:** Longform projects open as binders, and convert to them.
  [Coming from Longform](docs/longform.md)
- **Phones and tablets:** every mode by touch, tested in Obsidian's emulation of a phone and a tablet.
  [Phones and tablets](docs/mobile.md)

How each was designed and decided is in [docs/dev/plan.md](docs/dev/plan.md) and
[docs/dev/export.md](docs/dev/export.md).

## Features before 1.0

Decided by the maintainer on 2026-10-10: every major feature is built before 1.0, and nothing is held for after
it. Then the plugin is hardened (below) and 1.0.0 is called. In this order; the order can change, the list is the
commitment.

For every one: identify a repeated writing task, show the shortest usable interaction, keep the result readable
without Binders, and test it in a book-sized binder before widening it. No new dashboard, permanent toolbar group
or configuration system unless the task cannot be done through the controls there are.

### 1. Undo and redo of everything done through Binders

- [ ] **One history per binder.** Today only moves can be undone. The history grows to hold every change made by
      hand through Binders: reordering and moving, every property (synopsis, label, status, target, notes, export),
      renaming, new notes and folders, duplicating, deleting, merging and splitting. Typing in a note stays with
      the editor's own undo.
  - A step is undone only if the thing is still as that step left it; otherwise nothing is written and the writer
    is told why. A deleted note is kept byte for byte for the session and put back exactly. Undoing a new note
    never removes one that has been written in. Undoing a merge never takes text out of a note changed since.
  - In memory only: nothing new is written to the vault, and nothing travels by Sync.
  - In the view's toolbar, an Undo and a Redo button, which is how a phone reaches them.
  - Planned and decided 2026-10-10, being built in seven steps (the history refactored, then properties, renames,
    creating, deleting, merging, splitting). This takes in what was "Predictable recovery from merge". Decided: no
    history across restarts; a delete can be undone for the session even when Obsidian deletes for good; the delete
    confirmation stays; 100 steps for each binder.

### 2. Import an existing manuscript

- [ ] **From Word, and from one long note.** Most writers arrive with a Word file or a single long note, not a
      Scrivener project. Import a `.docx` as a new binder, split into chapters and scenes at its headings and scene
      breaks, shown before it is made, as the Scrivener import is. And split a note already in the vault into
      scenes at its headings in one go.
  - Makes a new folder, never writes into an existing one, and keeps the original file.
  - Ship when a novel-length Word file comes in with its words, order, italics, bold and scene breaks intact,
    held to a word-for-word test.

### 3. Progress over time

- [ ] **A deadline and a history.** A target for the book with a date, and the words a day it takes to get there;
      a record of words written each day, read as a small chart; and today's count carried between devices. Scene
      targets and focus mode's goal for today are built; this is the book's side of them.
  - Kept as readable data in the binder note or beside it, so it syncs as notes do.
  - No streaks, badges or reminders.

### 4. Saved filters

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

### 5. An editor's changes, brought back

- [ ] **A Word file returned by an editor.** Export sends a manuscript out; this brings it back. Read a `.docx`
      with tracked changes and comments, match it to the binder's notes, and show each change against the note as it
      is now, to take or leave one at a time. Comments are kept as revision notes (below).
  - Never applied in bulk without a review and an automatic snapshot, as Replace all is.
  - A change that no longer matches the note's text is shown and not applied.
  - The hardest item here to make safe. Design first, with real edited manuscripts to test against.

### 6. Revision notes tied to scenes

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

### 7. A new binder from a structure

- [ ] **A book's skeleton to start from, and templates for new notes.** "New binder" offers a structure (three
      acts, a chapter and scene skeleton, a writer's own saved from a binder) with its folders, synopses and
      targets. A folder can name a template note that its new scenes start from, properties and all.
  - Structures are plain binders; a writer's own is saved and shared as one.

### 8. The timeline, a fourth view

- [ ] **Scenes along story time.** A fourth mode of the binder view, beside the corkboard, the outliner and the
      manuscript: one line of time with the binder's scenes along it, each placed by a date property on its own
      note (`story-date`), each showing its number in the manuscript, so when things happen reads against the order
      they are told in. Dragging a card sets its date, as one step of Undo. Scenes with no date wait in a tray.
  - Re-implemented from [Evra Timelines](https://github.com/fyresmith/evra) in Binders' own look, on its cards,
    menus and history; Evra's calendar code is carried over, so a book can have a calendar of its own. Evra itself
    stays as it is, for worldbuilders.
  - Decided 2026-10-10: one timeline, not a line for each label; an axis that makes room for its cards, with long
    empty stretches drawn short, and no zoom. Cut from Evra: events that aren't notes, sides, lifespans, pins,
    saved views, the minimap, embeds, group cards.
  - In steps: the property with an outliner column and an inspector row; a design round; the view, read-only;
    dragging; a book's own calendar; eras. This changes "1.0 ships three views" (`docs/dev/plan.md`, "Decided").

### Also unfinished

- [ ] **Snapshots of a folder and of the binder, the last step:** thinning the automatic snapshots, so they don't
      pile up. (`docs/dev/plan.md`, "Snapshots of a folder and of the binder".)

## Hardening, then 1.0

Once the features above are built, in this order:

- [ ] **Export, checked by other hands.** The Word file in Word, the ebook in Kindle Previewer and Apple Books, the
      PDF on macOS and Windows and through a printer's checks (KDP, IngramSpark), and a project as export writes it
      in Scrivener. The list is in [docs/dev/export.md](docs/dev/export.md), "Not verified yet".
- [ ] **Phones and tablets on real devices.** The emulated phone and tablet tests are the standard for the
      automated suite. The maintainer uses Binders on an iPhone, which has found what the emulation could not
      (issue 32). Not yet tried: an iPad, any Android device, Android's back button, the share sheet.
      [Not yet tried](docs/limitations.md#not-yet-tried)
- [ ] **A QA round over each new feature,** and the whole suite in both themes.
- [ ] **Open issues** in the [tracker](https://github.com/fyresmith/binders/issues), and the findings left open on
      purpose in `tests/e2e/open-findings.json`.
- [ ] **1.0.0.** The first stable release. The maintainer calls it.

## Not building

- **Branching.** Two live versions of a book need merging, and merging prose is where writing is lost. A snapshot
  of the binder is read, compared and brought back; "Make a binder from this snapshot" writes it out as a second
  binder for the writer who wants to try another ending.
- **A research browser or story-bible system.** No database of characters, places or sources. Use ordinary links,
  backlinks, Properties and split panes; saved filters cover "every scene with Alice".
- **Named writing workspaces.** Left to Obsidian's Workspaces core plugin and Binders' own view state.
- **Daily automatic snapshots of a binder.** Automatic snapshots are taken before a bringing back and before
  Replace all. One a day, unasked, is not planned.
- **A plot grid.** Dropped on 2026-10-01 for the outliner (`docs/dev/plan.md`, "Decided").
