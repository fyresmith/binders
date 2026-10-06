Binder snapshots: stages 1 (questions) and 2 (built, by eye) are done and waiting on the maintainer's pick. Nothing is finished, nothing is for `main`, no version bump.

## Where things are

- **The page:** `/tmp/claude-1000/-home-calebsmith-Projects-binder/9233dfcf-0304-4e57-9f50-1f65d5cceed6/scratchpad/binder-snapshots/options.html`
- **Screens:** `…/binder-snapshots/screens/light/` (23 shots) and `…/screens/dark/` (12)
- **Sample files a snapshot writes:** `…/binder-snapshots/sample/A one file/` and `…/sample/B shared texts/` (the novel's three snapshots, each way)
- **Numbers:** `…/binder-snapshots/numbers-whole.json`, `numbers-shared.json`
- **The round's scripts** (seed, shoot, measure, verify): `…/binder-snapshots/scripts/`
- **Branch:** `worktree-agent-a6571d04fdc5d3f1d`, rebased on main at 0.32.6 (`609eb59`)
  - `815306e` Design round: snapshots of a folder and of a binder, behind a switch
  - `7c1f58c` Design notes: what the round learned (in `docs/dev/design.md`, per your note about the move)
- New code: `src/set-text.ts` (pure: the file, and what changed), `src/sets.ts` (vault side), `src/view/sets.ts` (dialog, menus, the Bring back screen). Hooks in `BinderView.ts`, `view/snapshots.ts`, `snapshots.ts`, `main.ts`, `settings*.ts`, `styles.css`. Module names are the round's and want choosing.

## What I recommend

- **One word, "snapshot"**, for a note and a folder. The binder view's header gets the note's clock button with "Take a snapshot" and "Show snapshots...".
- **The note's dialog, grown to hold a book.** The same list under "The binder now"; beside it the book's contents in order. "Show changes" marks what is different: rewritten (with words in and out), new, gone, moved, renamed, properties. A row opens that note with the existing prose comparison. "Read" shows the snapshot as a manuscript. "Compare with" sets it against another snapshot.
- **On disk, one plain-text file per snapshot** (direction A), in `Snapshots/` under the folder's path, e.g. `2026-09-19 16.20.05 Draft sent to Sam.binder-snapshot`. It has its own format number (`binder-snapshot: 1`). Ones Binders takes itself end in `.auto.binder-snapshot`, and only those would ever be thinned.
- Direction B (an index plus each note's file once under its fingerprint in `Snapshots/Texts`) is also built, behind a hidden setting `setStore`, so the two could be measured.

## Real and inert

- **Real:** the switch (Settings, Snapshots, off by default); the header button; taking, both ways of keeping; the list, including a subfolder's list showing the binder's snapshots; contents; changes; compare with another; one note; read; naming; deleting; a phone and a tablet; keyboard and ARIA roles.
- **Real restores, none of which touch what is there without a snapshot first:** one note's text brought back (through the note's own guarded path); a deleted note made again; "Make a binder from this snapshot" (a new folder beside the binder).
- **Inert:** the whole-binder "Bring back..." screen is real and its counts are computed, but its button only says nothing was changed.
- **Not built:** the inspector's list for a folder, thinning, automatic snapshots, the restore journal and undo, checking fingerprints on read (it reads by length), exact bytes for a note with a byte-order mark, a folder's snapshot files following a rename or move, committing a field being typed before taking.

## Numbers

Desktop, headless, with the suite run and two developers on the machine, so treat them as upper bounds. The novel is 98,057 words, 133 notes with folder notes, 534 KB.

| | A. One file | B. Shared texts |
|---|---|---|
| Novel, first snapshot | 18 ms, 1 file, 550 KB | 38 s, 134 files, 552 KB |
| Novel, another after a small edit | 14 ms, 550 KB | 0.6 s, 2 files, 26 KB |
| 30 days, one a day | 16.7 MB | 1.1 MB, 128 files |
| A year, unthinned (extrapolated) | about 203 MB | about 13 MB, 1,550 files |
| A year, automatic ones thinned to weekly after two weeks | about 36 MB | about 13 MB |
| Novel: read now + read snapshot + compare | 6 + 11 + 10 ms | 12 + 58 + 66 ms |
| 5,000 notes, first snapshot | 65 ms, 3.2 MB | 246 s, 5,002 files |
| 5,000 notes: read now + read snapshot + compare | 163 + 36 + 99 ms | 168 + 16 + 331 ms |
| 5,000 notes, dialog open with changes drawn | 0.6 s | not shot |
| 300 snapshots of the messy draft | 2.1 s to take, 23 MB, dialog opens in 1.0 s | not run |

- **Round trip:** a binder made from the novel's first snapshot matched the original 133 of 133 notes byte for byte, in the same order, and is itself a binder. This holds for both A and B.
- **Through the dialog, checked by script:** one note's text brought back, the replaced text kept as a note snapshot, a gone note remade byte for byte, compare with another, naming, tree keyboard and labels, no second snapshot of an unchanged binder. This took two runs: a notice covered a button in each, in different places, so no single run passed every check, though each check passed in one of them.
- `npm run check` passes after the rebase. `tests/e2e/specs-snapshots.mjs` passed 56 of 56 with the round's code in, but that run and all the shots were before the rebase (on 0.32.2).

## Found on the way

- Making 133 notes through the vault took 30 s here, because the binder store looks at each one. A restore that creates many files needs progress and one store update at the end.
- A notice sits over the dialog's bar buttons for its six seconds, in the note's dialog too; a second click lands on the notice.
- On a tablet the bar leaves the snapshot's name only a few letters. The note's dialog has the same squeeze.
- `ROADMAP.md` still says "Whole-project drafts and branching: defer". If he goes ahead, that line needs changing.

## Questions for the maintainer, with my answers

1. One file per snapshot (A) or shared texts (B)? **A.** It can't be half there and opens without Binders; thinning bounds the disk.
2. One word, "snapshot", for both? **Yes.**
3. May "Bring back" on a folder write a note's properties as they were, and make, rename and move notes? **Yes, only there, after the screen.** This widens golden rule 3, so it needs his word.
4. Notes written since the snapshot: stay, or go to a folder? **Stay by default**, with a dropdown to move them. Never deleted.
5. Automatic snapshots at 1.0? **Only before bringing one back and before find and replace.** Daily comes later, off by default.
6. Remove "Take a snapshot of every note..." and leave its old batches as the notes' own snapshots? **Yes.** They hold text only, so calling them binder snapshots would promise an order they don't have.
7. Files that aren't notes: listed, not copied? **Yes.**

Branching: no, now or later. "Make a binder from this snapshot" covers "try a different ending".

## The finishing stage

The page has the hard-cases table, with a stated behaviour for each.

1. **Take, see, compare.** What is in the pictures, finished: tests, the inspector's list, snapshot files following a folder rename or move, Longform, newer format refused, exact bytes, fingerprint checks, the tablet bar, docs and the format page. About one session. Bump: y, as a new option inside Snapshots while x stays 0.
2. **Bring back the text, and the order.** The two scopes that create and move nothing, plus the "before" snapshot, the written plan, finish-or-put-back after an interruption, and undo. One session.
3. **Bring back everything.** Notes and folders made again, renames and moves, properties, "new since". One to two sessions; this is the risky one.
4. **Automatic.** Daily when changed, thinning, the export checkbox. Half a session.

Testing: one table of cases drives it. For each hard case, change the binder, restore, and compare the vault byte for byte with a copy made at snapshot time; then restore the "before" snapshot and compare with a copy of the present. The same cases run with an outside edit mid-way, with Obsidian closed mid-way, and on a phone.

Memo `binder-snapshots` is set to done.