# Roadmap

Where Binders stands: what is built and released, what is left before 1.0, and what is planned for after it.
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

## Left before 1.0

In this order.

- [ ] **Export, checked by other hands.** The files are held to tests here; they have not all been opened where a
      writer will open them: the Word file in Word, the ebook in Kindle Previewer and Apple Books, the PDF on
      macOS and Windows and through a printer's checks (KDP, IngramSpark), and a project as export writes it in
      Scrivener. The list is in [docs/dev/export.md](docs/dev/export.md), "Not verified yet".
- [ ] **Snapshots of a folder and of the binder, the last step:** thinning the automatic snapshots, so they don't
      pile up. Not built. (`docs/dev/plan.md`, "Snapshots of a folder and of the binder".)
- [ ] **Phones and tablets on real devices.** The emulated phone and tablet tests are the standard for the
      automated suite. The maintainer uses Binders on an iPhone, which has found what the emulation could not
      (issue 32). Not yet tried: an iPad, any Android device, Android's back button, the share sheet.
      [Not yet tried](docs/limitations.md#not-yet-tried)
- [ ] **Open issues** in the [tracker](https://github.com/fyresmith/binders/issues), and the findings left open on
      purpose in `tests/e2e/open-findings.json`.
- [ ] **1.0.0.** The first stable release.

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
  lost. A snapshot of the binder (built) is read, compared and brought back; "Make a binder from this
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
