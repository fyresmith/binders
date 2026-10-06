# Handoff: where the work stands (2026-10-06)

Written for a session that starts fresh from this repository (for example Claude Code in the cloud) and has none
of the earlier conversation. Read `AGENTS.md` and `CLAUDE.md` first: they are the rules. This file is the state.

`main` is at 0.33.7 and is what users would get. Everything below that is "on a branch" is **not** on `main`.

## Since then (2026-10-06, a cloud session)

- **The e2e suite runs in a cloud sandbox.** `scripts/cloud-setup.sh` works as it is; Electron needed `--no-sandbox`
  as root, which `tests/e2e/driver.mjs` now passes. Then `. ./.cloud-env` and `npm run e2e` as anywhere.
- **Export steps 5 and 3 are shipped onto branch `claude/quirky-ramanujan-kysgwa`** (pull request
  fyresmith/binders#1, waiting for the maintainer's review), joined: Paperback uses the vault's styles and the style
  editor, Export again makes PDFs. Reviewing both found and fixed: a deleted style's binders falling back to Classic,
  the styles folder taking over an existing folder, a manuscript PDF written over its Word file, `nodeintegration`
  on in the print webview, picture URLs never freed. Older menu and settings specs now know "Export as".
  Left open (in the pull request): the bundle size and the hyphenation licences, for the maintainer; a landscape
  tablet's note menu, now taller than the screen, where an emulated tap scrolls it and opens the next item; the demo
  books test and a 5,000-note test logging ENOENT now and then while they write files from outside; the sync-burst
  snapshots test failing about one run in three on the branch (none of four on `main`).
- **Binder snapshots step 1 is rebased onto that branch, in a local branch `snapshots`** (not pushed: the session
  may push only its own branch). The test named below was the test's own fault (it typed where the manuscript had
  no editor); the stylesheet join, a date's wording and four more tests are fixed; the narrow dialog's title is
  laid out; counts follow the word-count setting; the older specs know a folder's snapshot. `specs-binder-snapshots`
  passes 26 of 28 in both themes. The two left wait on the maintainer: whether a note deleted and another made under
  its name is "rewritten" (what `changes()` documents) or "gone" plus "new" (what the test expects), and whether
  unchanged notes show their words in "Show changes".

## Unmerged work, on branches pushed to `origin`

| Branch | What | State | To finish |
|---|---|---|---|
| `export-step-5` | Export: the Modern style, style files, the style editor, "Export as" in menus, Contents and an outliner column, "Export again" | Finished and reported: 6 commits on 0.33.4, `npm run check` passes, 86 e2e passing in both themes. Not reviewed by the coordinator, not shipped | Review, cherry-pick each commit with `npm run ship` (bumps and CHANGELOG lines are in `export-step-5-report.md`), push. Ship this one first |
| `export-step-3` | Export: the paginator, hyphenation, fonts, the PDF module, the Paperback kind, the manuscript as a PDF, the exact page preview | Finished and reported: 9 commits on 0.33.2 (tip `c40b6bf`), `npm run check` passes, the three export spec files 78 of 78 in both themes; 11 demo books (231,307 words, 1,113 pages) word for word; 150,000 words laid out in about 3 s. Not reviewed, not shipped. **`main.js` goes from 645 kB to 1.23 MB** (two typefaces about 350 kB, hyphenation patterns about 190 kB): the maintainer has not been asked about that yet, and the hyphenation packages' licences were not checked | Ship step 5 first, then rebase this onto `main` and join the two as both reports describe (`export-step-3-report.md` "For step 5", `export-step-5-report.md` "merging with export-step-3"): the style editor's preview calls `drawPages`, `export-again.ts` needs a Paperback branch, and the Modern style has never been run through the paginator. Then make the Modern samples, verify, ship |
| `binder-snapshots` | Snapshots of a folder and of a whole binder (the design the maintainer approved) | **Work in progress, stopped for the usage limit.** Commit `b1fd4c3`, on 0.32.7, not rebased, not shippable | See "Binder snapshots" below |

## Binder snapshots

The maintainer asked for "a snapshots icon in the binder/subfolder view very similar to the note view that copies
the whole of the folders or binders. Extremely, extremely good versioning." A design round was built and he approved
every recommendation ("Yes to all those recs. I like that. Go for it."):

1. One plain-text file per snapshot (`…/Snapshots/<date time name>.binder-snapshot`, its own format number
   `binder-snapshot: 1`; automatic ones end `.auto.binder-snapshot` and only those are ever thinned).
2. One word, "snapshot", for a note and for a folder or binder; the note's clock button in the binder view's header.
3. "Bring back" on a folder or binder may write notes' properties as they were and make, rename and move notes,
   only there and only after its confirmation screen. **This widens golden rule 3 with his word**: write the
   exception into `AGENTS.md` rule 3, as narrowly as the tab-links one, when step 3 is built, and show him the wording.
4. Notes written since the snapshot stay where they are by default (an option moves them to a folder); never deleted.
5. Automatic snapshots at 1.0 only before bringing one back and before find and replace (not built yet: leave the
   hook). Daily ones later, off by default.
6. "Take a snapshot of every note..." is removed; its old batches stay as the notes' own snapshots.
7. Files that aren't notes are listed, not copied. No branching: "Make a binder from this snapshot" covers it.

The design page, screens and measurements are in `binder-snapshots/` here (`options.html`); the designer's report,
with the numbers and the hard cases, is `binder-snapshots-design-report.md`.

**The build is four steps, each shipped before the next:** (1) take, see, compare; (2) bring back the text, and the
order; (3) bring back everything (the risky one: every hard case a test that compares the vault byte for byte with a
copy made at snapshot time); (4) automatic snapshots and thinning.

**Where step 1 stopped** (branch `binder-snapshots`, commit `b1fd4c3`):
- In it: the one-file format with the switch gone; modules `src/binder-snapshot-text.ts`, `src/binder-snapshots.ts`,
  `src/view/binder-snapshots.ts`; exact bytes and fingerprints checked on read; snapshot files following a folder's
  rename; the inspector's list; the fix for a notice covering the dialog's buttons; the narrow-bar rule; "Make a
  binder from this snapshot" with progress; "every note" removed (command id `take-snapshots` kept, renamed "Take a
  snapshot of the binder"); the docs (`docs/snapshots.md`, `docs/dev/*`, `ROADMAP.md`).
- Tests: unit 74 passing. `tests/e2e/specs-binder-snapshots.mjs` has 28 tests: 15 have passed (light theme only).
- **One real failure to diagnose first:** "what is typed and not yet saved goes in": the command takes no snapshot
  while a synopsis field is being typed. Cause not found.
- Then: rerun the new spec in both themes (the phone and tablet tests have not passed yet); update the older specs
  that still name "Take a snapshot of every note" (`specs-snapshots`, `specs-qa4-explorer`, `specs-qa5-nav`,
  `specs-qa6-features`, `specs-qa6-menus`); measure whether writing the binder note last fixes 30 s for making 133
  notes; lint; rebase onto `main`; report step 1 with hashes and bumps.
- The whole-binder "Bring back..." screen was taken out of step 1 for step 2; it is in the design-round commit
  `841bd95` on the same branch.

## Not started, or waiting

- **A whole-suite e2e run on current `main`.** One was running on 0.32.1 when this was written (3,760 test runs, 28
  failures before sorting, not yet reported). Nothing since 0.22.4 has had a clean whole-suite verdict: Export, the
  inspector and contents, the selection box, focus mode's dark page, word counts. Run it from a clone at a fixed
  commit (`docs/dev/development.md`), then fix what it finds.
- **Export step 6**: phones and tablets by touch, a QA round on all of Export, the manual's export pages
  (`docs/export*.md` have `<!-- to come -->` marks for the paperback, the style editor and Export again; the text
  for them is under "For the manual" in `export-step-5-report.md`).
- **Screenshots** in `docs/images/` predate the Export window, the sidebar panes and focus mode's dark page; the
  manual lists which to retake.
- **Before 1.0, from the roadmap:** import from Scrivener; find and replace across the manuscript.
- **From the research** (`feature-research.md`): test the manuscript against popular editor plugins (Harper,
  LanguageTool, Typewriter Mode, Smart Typography, Linter); a two-device sync test of binder order.
- **A public beta release** to Obsidian's community directory: the maintainer will do this; the README has a marked
  place for the directory link. Tagging triggers the release workflow: only on his word.
- **Proposed, not approved:** the three-bar mark as the plugin's own tab icon (seven places use Lucide's `book`).

## Waiting on the maintainer

- Opening the Scrivener projects written by the real export in his Scrivener (they were on his machine only; make
  new ones with `BINDERS_SCRIV_SAMPLES=<folder> npm test -- export-scriv-words`).
- Real-world checks nobody has done: a real phone and tablet, macOS, Windows, the Word file in Word, the ebook in
  Kindle Previewer and Apple Books.

## What is only on the maintainer's machine

Git-ignored there and not here: the full design folders with every screenshot and sample file (export, inspector,
banner options), the agents' progress memos, the demo vault (remake it with `npm run demo-vault`), Obsidian itself
and the 1.13.4 floor build for e2e, EPUBCheck (`npm run get-epubcheck` fetches it; it needs Java). **Whether the
e2e suite can run in a cloud sandbox is unproven**: it drives a real headless Obsidian (Electron).
`scripts/cloud-setup.sh` fetches Obsidian and EPUBCheck and writes the two environment variables the tests need; it
has not been run in a sandbox yet, so proving it (or saying what stops it) is the first job there. Unit tests, lint
and the build need nothing but Node.

## In this folder

| File | What |
|---|---|
| `export-step-3-report.md` | The step 3 developer's full report: commits, bumps, CHANGELOG lines, results, what is unverified, text for the manual |
| `export-step-5-report.md` | The step 5 developer's full report: commits, bumps, CHANGELOG lines, what is and isn't tested, how to join it with step 3, text for the manual |
| `binder-snapshots-design-report.md` | The snapshots designer's report: recommendations, numbers, questions and answers, the finishing stages |
| `binder-snapshots/` | The design page (`options.html`), its screens in light and dark, the measurements |
| `export-design-research.md` | The research behind Export (Scrivener's Compile, the neighbours, the formats) and the directions turned down; the decided design is `../export.md` |
| `feature-research.md` | What other writing plugins and applications have that Binders doesn't, with verdicts |
