# Roadmap

The path from a first draft to a finished novel in Obsidian: what is released, what is built on `main`, and what
comes next. Updated 2026-10-10 after the novel-writing workflow review.

Binders is a **public beta** (0.x). The [changelog](CHANGELOG.md) records releases; `manifest.json` names the published
plugin. Work under **Unreleased** is implemented on `main` but is not yet installed through Obsidian or BRAT.
The remaining major features below come before 1.0, followed by hardening (the maintainer's decision, 2026-10-10).
1.0.0 is the first stable release, and the maintainer calls it.

## Principles for every addition

- **Start with a repeated writing task.** Show the shortest useful interaction and test it in a novel-sized binder.
- **Keep writing in ordinary files.** Notes, links, properties, checkboxes and readable metadata remain useful with
  Binders disabled. Manual edits stay supported; no hidden task or character database.
- **Use Obsidian's design language.** Extend the current views, Filter control, inspector, menus and commands.
  Follow familiar Properties, Bases filter and template conventions. A new pane needs a task the existing ones
  cannot serve; no permanent dashboard or new query language.
- **Protect the manuscript.** Changing a view or scope never changes scene order or export inclusion. Writes have
  undo or reviewed recovery, and tests cover unsaved writing, external edits, renames and restart boundaries.
- **Keep context optional.** A writer can use linked characters, locations and subplots without adopting a fixed
  scene schema or a prescribed story structure. Keyboard and touch are part of each feature's first scope.

Detailed interactions still go through the design rounds in [docs/dev/design.md](docs/dev/design.md). The
[plan](docs/dev/plan.md) records earlier decisions; [architecture](docs/dev/architecture.md) maps the code.

## Built and released

The published release at this review is **0.51.1**. These are its foundations:

- **Ordered folders and the native file explorer:** binder order, drag to reorder, label dots and undo of moves.
  [File explorer](docs/file-explorer.md)
- **Three binder modes:** [corkboard](docs/corkboard.md), [outliner](docs/outliner.md) and
  [editable manuscript](docs/manuscript.md), with the [inspector and contents](docs/inspector.md).
- **Labels, statuses, word count targets and arrange by label.** [Labels, statuses, targets](docs/labels-statuses-targets.md)
- **Scene operations:** split, merge, duplicate, group and ungroup. [Scene tools](docs/splitting-and-merging.md)
- **Snapshots of a scene, folder or binder:** read, compare, copy and bring back text, properties, names and order.
  Automatic snapshots before restoring and Replace all. [Snapshots](docs/snapshots.md)
- **Focus mode and find and replace across a binder.** [Focus mode](docs/focus-mode.md) · [Find and replace](docs/find-and-replace.md)
- **All five export kinds:** manuscript (Word or PDF), ebook, paperback, Scrivener project and one note;
  editable styles and Export again. [Export](docs/export.md)
- **Scrivener import, Longform integration and mobile support.**
  [Import from Scrivener](docs/import-scrivener.md) · [Longform](docs/longform.md) · [Phones and tablets](docs/mobile.md)

## Implemented on main, not yet released

Checked items mean implemented, not a completed release or real-device validation. See
[Unreleased](CHANGELOG.md#unreleased) for the changes that will ship together.

- [x] **Shared undo and redo of changes:** moves, properties, renames, creation, note duplication, deletion,
      merges and splits; toolbar controls, 100 changes per binder and 32 MB of kept bytes across binders.
      Memory only, cleared when the plugin unloads. Text keeps the editor's own undo. [Undo and redo](docs/undo.md)
- [x] **Import a manuscript:** Word, Markdown and plain text as a new binder, with chapters, scenes and an editable
      preview. Word comments, tracked changes and underlining have choices; PNG and JPEG pictures are kept.
      The source stays as it is. [Import a manuscript](docs/import-manuscript.md)
- [x] **Split at headings:** split an existing binder note at headings, scene breaks or a chosen line, after a
      preview, as one change in undo history. Markdown import also places reference footnotes and links with the
      notes that use them. [Split at headings](docs/splitting-and-merging.md#split-at-headings)
- [x] **Story date:** a scene property, outliner column, inspector row and menus, with story-order sorting.
      [Story date](docs/story-date.md)
- [x] **Timeline display:** a fourth mode with time down or across, manuscript numbers and an undated tray;
      card editing and date menus. Dragging to set dates, custom calendars and eras remain below.
      [Timeline](docs/timeline.md)

## Features before 1.0

Build in the order below, starting with revision. The first three features work together: choose a character's
scenes, keep their context close, and work through what needs changing. Later work depends on those foundations.
This order replaces the earlier flat list; it is a priority order, not a delivery schedule.

| Order | Work | What it makes easier |
|---|---|---|
| 1 | Saved filters, revision tasks, pinned inspector properties | Revise an arc across the whole book without losing context |
| 2 | Synopsis read-through, structural summaries, templates, timeline editing | Plan the book and inspect how it holds together |
| 3 | Drafting and revision progress, more import formats, snapshot retention | Sustain work and keep recovery manageable |
| 4 | Scoped exports, export presets, returned editor changes | Share work and bring reviewed edits back safely |

### 1. Saved filters and editable subsets

- [ ] Save named filters scoped to a binder or folder, using label, status, export inclusion and ordinary scene
      properties. Support list membership, missing values, AND conditions and several accepted values within one
      condition. Example: `characters` contains `[[Alice]]` and status is Draft.
- [ ] Read and edit the matching scenes as one manuscript, in binder order; use the same subset in the other
      modes, with ancestors shown only as context. Keep each mode's own ordering conventions, including story
      order on the timeline. Make the active scope and its count clear, with one action to return to the whole book.

Reuse the existing Filter control. Store definitions as readable binder metadata. A filter never moves or copies
notes, changes export inclusion or silently becomes the binder's order. Initially disable reordering in a subset.
When an edit stops matching the filter, keep pending writing and the caret safe before the scene leaves the view.

Complete when a writer can save, reopen and edit a cross-chapter subset without changing the full manuscript's
order, and empty results explain the scope and offer to clear it. Add manually picked collections only after use
shows a repeated task filters cannot serve; missing or renamed members must remain identifiable.

### 2. Revision tasks tied to scenes

- [ ] Capture a task such as “establish why Alice leaves” while drafting, then visit unfinished tasks in manuscript
      order and mark them done. Offer an unresolved count and next/previous navigation in an optional native pane.

Keep Markdown checkboxes and scene links in one ordinary revision note per binder. A quoted passage can give
context, but does not promise to follow edits. Obsidian handles link renames; a missing scene stays an unresolved
link. Manual edits to the revision note remain supported.

Complete when capture preserves pending writing, navigation opens the correct scene, completion changes only
the chosen checkbox, and the queue works as Markdown with Binders disabled. Passage anchors come only if scene
navigation proves insufficient; ambiguous or missing passages must be reported, never guessed.

### 3. Custom properties in the inspector

- [ ] Let a binder pin a few existing properties beside synopsis and status: POV, characters, location, subplot,
      or the writer's own fields. Preserve Obsidian's property types and support links to ordinary reference notes.

Use the existing inspector and native editing controls, with normal hover previews and opening to the side.
Keep the same properties editable in the outliner and Obsidian's Properties view. No required character fields or
separate story-bible store. A writer can review Alice's scenes through a saved filter while reading her note beside them.

Complete when pinned fields follow scene selection, bulk edits handle mixed values, linked notes follow renames,
and every edit goes through the shared undo history without changing manuscript text.

### 4. A continuous synopsis read-through

- [ ] Read chapter headings and scene synopses as one outline, edit synopses in place, and open the underlying prose.
      Apply it to the whole book or a saved subset.

Make this a display option in an existing view, sharing its order, navigation and selection. An empty synopsis is
an invitation to write one, not generated text. Complete when a writer can review the structure continuously,
change a summary and return to the corresponding scene without writing into its body or changing the book's order.

### 5. Structural summaries in the outliner

- [ ] Show chapter lengths, words by POV, scenes by status and unresolved revision counts through column summaries
      or a modest optional overview. Respect the current folder and filter, and make the counted scope explicit.

Use the writer's properties and revision tasks. Measurements are descriptive: the writer decides whether a long
chapter or an uneven POV balance is a problem. Complete when a summary can take the writer to the relevant scenes,
agrees with the underlying counts, and stays useful in a novel-sized binder without a permanent dashboard.

### 6. Binder structures and scene templates

- [ ] Offer optional structures in New binder: a chapter-and-scene skeleton, three acts, or the writer's own saved
      binder, with its folders, synopses and targets. Let a folder choose a template note for new scenes.

Structures are plain binders, saved and shared as such. Templates are ordinary notes with properties and optional
planning prompts; follow Obsidian's template conventions. Complete when a structure or template can be inspected
and edited without Binders, a new scene keeps the template's text and types, and creating it is safely undoable.

### 7. Finish the timeline

- [ ] Drag a scene to set its story date, and within a date to set story order, as one undo step. A drop changes
      story time, never manuscript order. Gaps unfold to let the writer choose days, months or years.
- [ ] Support a book's own calendar and eras, using the calendar work from
      [Evra Timelines](https://github.com/fyresmith/evra), in Binders' own cards, menus and history.

Keep the decisions of 2026-10-10: one line of time, room for the cards, long empty stretches drawn short, no zoom,
numbers always on, down on phones and down or across on larger panes. Complete when dates, precision and within-date
order survive dragging, undo, external edits and switching shapes; undated scenes remain reachable by touch and keyboard.

### 8. Progress for drafting and revision

- [ ] **A record of the binder's writing.** One plain-text file for each device and year in the binder's
      `Snapshots/History`, merged when read: the words written and cut in each note each day, the hours and
      sittings, and what was done to the binder (a note made or gone, a status changed, a snapshot or export
      made). Numbers and names only, never a note's text. Being built.
- [ ] **Progress, a window on the book's life:** today and the last seven days, the book against its target, its
      words over time with what happened said on the chart, every day written on, when in the day and week, each
      part's growth, statuses over time, and its records. Designed and chosen 2026-10-10; built over the record.
- [ ] **A deadline:** a date beside the target, the words a day it takes recalculated each morning, and whether
      the book is on pace, said plainly. The toolbar's count opens the window and marks where the plan stands today.
- [ ] **An estimated past for a book that already exists,** worked out from its snapshots and file dates and drawn
      as an estimate.
- [ ] Track scenes reviewed or revision tasks completed alongside words, so a revision that shortens the book can
      still show useful progress. Make the measure explicit and optional.

Decided 2026-10-10: a change of more than 50 words at once is brought in or taken out, not written or cut; a day
ends at 4 in the morning; each device records only what was typed on it, and edits made elsewhere show as changed
elsewhere. Complete when the record survives sync and restarts, distinguishes drafting from revision, and can be
inspected by hand. No streak as a headline, no badges, no reminders.

## Hardening, then 1.0

Targeted validation belongs to every feature above. The final round tests how they work together:

- [ ] **A whole novel workflow:** start or import a book, draft, revise a character arc, finish revision tasks,
      compare and restore snapshots, share an excerpt, review returned edits and export the finished book.
- [ ] **Formats checked by other hands:** real imports from Word and other writing tools; exported Word in Word,
      EPUB in Kindle Previewer and Apple Books, PDF on macOS and Windows and through printer checks (KDP,
      IngramSpark), and exported projects in Scrivener. See [export validation](docs/dev/export.md).
- [ ] **Phones and tablets on real devices:** keep emulated phone and tablet coverage, and complete hardware checks
      on iPhone, iPad and Android, including keyboards, suspension, back navigation and sharing. The maintainer's
      iPhone use has already found bugs emulation missed. [Known limitations](docs/limitations.md#not-yet-tried)
- [ ] **Scale, accessibility and native design:** a novel-sized binder, keyboard and touch, screen readers, both
      themes and representative community themes; compare interactions with Obsidian's own controls.
- [ ] **A QA round and the full suite:** targeted tests locally; the whole suite on GitHub when work reaches `main`.
      Resolve [open issues](https://github.com/fyresmith/binders/issues) and review `tests/e2e/open-findings.json`.
- [ ] **1.0.0:** the first stable release, called by the maintainer after the features and hardening are complete.

## Not building

- **Live manuscript branches and prose merging.** Use readable, comparable snapshots and Make a binder from this
  snapshot for an alternative ending.
- **A research browser or story-bible database.** Use ordinary notes, links, backlinks, Properties and split panes;
  pinned fields and saved filters bring that context into writing.
- **Named writing workspaces.** Leave these to Obsidian's Workspaces core plugin and Binders' view state.
- **A separate task manager.** Revision tasks stay checkboxes and scene links; no scheduler, assignments or notifications.
- **Daily automatic binder snapshots.** Keep automatic snapshots before recovery and Replace all; use explicit
  snapshots for other milestones.
- **A plot grid or a worldbuilding suite.** The outliner replaced the plot grid. The timeline stays about scenes;
  events that aren't notes, lifespans, sides, pins, minimaps and extra timeline views remain in Evra's scope.
