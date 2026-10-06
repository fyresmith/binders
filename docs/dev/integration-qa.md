# Integration QA, October 2026

Arrange by label, snapshots and focus mode are integrated on `main`. The card-to-explorer drag prototype remains in
its handoff for the next design round, as requested by the maintainer. Mobile QA remains open until the plugin is
tried on real iOS and Android devices; desktop emulation cannot verify their keyboards, app suspension or back button.

## Verified fixes

- A split keeps both notes intact if the source changes while the second note is being created. External edits and
  editor undo are covered by `specs-scenes.mjs`.
- Saving a manuscript waits for writes already in flight; backgrounding the app flushes pending text.
- New scenes appear ready to name, including inside a folder on a phone. New folders stay selected once named.
- Moving cards keeps keyboard focus. Switching modes selects the containing folder or the correct manuscript scene.
- Moving a whole binder inside another preserves its scene order; copies made during a pending move follow their original.
- Large phone text leaves room for the outliner's Words heading. The corkboard toolbar fits narrow landscape panes.
- Long card and row menus fit tablet viewports. The manuscript caret follows the phone keyboard, and its scroll-past-end
  space does not push a short pane outside the view, including in focus mode.
- The test driver uses a debugging port reserved by Chromium and checks the vault path before testing. A regression
  verifies that two sessions cannot modify one another's throwaway vaults.

The test vault's installed plugin is updated without replacing the maintainer's edited notes. Automated tests use a
separate pristine copy of the committed test vault.

## Findings still open

These scenarios remain active tests. A failing test is not automatically a request to redesign the corresponding
interaction, and its `BUG:` or `UX:` prefix is the QA author's classification rather than a release verdict.

### Existing behavior and design proposals

- Split undo restores the second half in the original editor and leaves the newly created note in place. Changing
  this to remove that note needs a design that preserves anything subsequently written in it.
- Phone card titles and breadcrumbs have smaller tap areas than the proposed 44 pixels. Opening the whole card would
  also change how tapping selects it.
- A dragged phone card overlaps its insertion line. The proposed test requires an unobscured line.
- Very narrow phone toolbars hide the word count and progress bar. An older journey test expects both always visible.
- A selected outliner row with an empty synopsis does not expose a blank inline editing field by touch; its menu can edit it.

### Existing limitations needing follow-up

- Native explorer grouping and folder copying do not preserve binder placement and child order as Binders' own actions do;
  selection menus show both Obsidian's and Binders' grouping actions.
- Dragging twenty notes over a 5,000-note folder exceeds the proposed one-frame performance budget.
- If another plugin removes Binders' explorer wrapper when unloading, the wrapper is not restored automatically.
- Narrow manuscript panes can log CodeMirror's “Measure loop restarted” warning while scrolling upwards.
- Rendered and editable heights differ for some complex Markdown: tables, long or indented code, images, embeds, math
  and footnotes. The height-comparison scenario remains failing.
- The full run encountered a split immediately after typing that left the source unchanged and the second half in a
  new note. Three isolated repeats of that scenario and three external-edit protection checks passed. This intermittent
  result remains under investigation; the source text was preserved, and the regression has not been disabled.

## Verification results

On 0.12.10 (2026-10-02): the build, the lint check and the unit tests pass. The e2e suite was run in both themes, split
over several Obsidians at once, against a clean copy of the committed test vault.

- Five of the six parts finished in both themes: 1,734 passed and 22 results were findings still open. The sixth
  (snapshots, the phone manuscript, outliner and tablet journeys, themes and the 1,000-note checks) finished its
  manuscript and snapshots files in both themes in a run of their own (540 passed, 13 open) and was most of the way
  through the light theme for the rest when the run was stopped; its dark half for the outliner, tablet, themes and
  1,000-note files was not run on this version.
- The findings still open are listed, by test, in `tests/e2e/open-findings.json` (22 tests: the ones above, each
  failing three times out of three before it was listed). The runner reports them and doesn't count them.
- Failing only with several Obsidians running at once, and passing every time alone: the long reordering journey
  (`specs-qa4-journey.mjs`, 1c), three phone checks that time frames with the CPU slowed, and the themes check of
  “Readable line length”.
- Still to explain: “typing, then at once Delete” on a phone (`specs-qa5-manuscript.mjs`) twice left the last words
  typed out of the note in the trash in a full run, and passed four times out of four alone. Like the split above, it
  is on the path where nothing typed may be lost, and it isn't on the list.
- Fixed on the way (0.12.9): after a manuscript showing a note with Windows line endings was closed, a late save could
  take out words typed in the note's own tab; and such a note was written again, without them, just for being shown.

## The sixth QA round and the hardening push, 2 October 2026

Eight QA agents (writing, scale, store, boards, menus, phone, tablet, features) confirmed 79 findings on 0.12.17; their
scenarios are `tests/e2e/specs-qa6-*.mjs`. Developers fixed them through the day, and about 125 patches went out
(0.12.18 to 0.12.141). What matters most:

- **Text that could be lost, all fixed with a test that failed first.** Words typed while a save was in flight, left
  out of a delete, merge, duplicate, split, snapshot or compile (0.12.39; compile is export's "One note" now). The first paragraph of a note that opens
  with a rule, dropped by merge, compile, snapshots (0.12.43) and by any property write (0.12.57). A second outside
  change undoing the first while typing was unsaved (0.12.52). A note left empty when the app was reloaded within two
  seconds of typing, because a write started as the page goes is cut off between emptying and filling the file
  (0.12.123). Words deleted coming back when the note was rewritten outside before the save (0.12.134). A reorder or a
  field still being typed, not written at quit (0.12.68, 0.12.85).
- **Both intermittents of the earlier rounds are explained, and neither lost text.** "Typing, then at once Delete" read
  a stale file in the vault's trash left by an earlier test (the runner empties the trash between tests since
  0.12.78). A split right after typing keeps the second half in both notes, on purpose, when the note changes while it
  is being split.
- **What a hundred patches on targeted tests cost.** A clean run of the whole suite on 0.12.116 left 45 tests failing
  alone. Thirteen were product bugs (four of them regressions from the day's own fixes, each found with `git bisect
  run`), twenty-five were tests that still described behavior changed on purpose or specs left half-edited, six were
  listed as open, one was load. A re-check of all 45 in both themes on 0.12.133 left none failing alone. The rule
  since: a fix runs its area's specs in both themes before it ships, and the whole suite runs after each batch
  (`docs/dev/development.md`, "Before a fix ships").
- **Still open**, each listed in `tests/e2e/open-findings.json` with why, and in the README's known limitations: the
  split's undo; four kinds of content whose rendered and live heights differ; "Measure loop restarted" warnings from
  the editor in three places; a tap in another section with the caret at a wrapped line's start; the "New note" tile
  inside the list of cards; "Ungroup" leaving the emptied folder; comments in a properties block dropped by Obsidian's
  own writer; fast swipes through a thousand scenes on a phone. (Decided and fixed 2026-10-05: the split's undo,
  which now takes the whole split back, and "Ungroup", which now takes the emptied folder to the trash and gives it
  back on "Undo last move".)
- **Not verified:** a full run of the suite in both themes on the last version of the day was started as the session
  ended; anything on a real phone or tablet (none is to hand: the emulated tests are the standard); the lowest
  supported Obsidian (1.8.7) has never been run. A release audit and a gallery of fifty screenshots are in
  `.claude/handoff/release-check/` (not in git).
