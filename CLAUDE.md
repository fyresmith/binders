@AGENTS.md

# Binders: context for Claude

## Where things stand

- **What it is:** Binders, an Obsidian plugin (id `binders`) that makes folders behave like a writer's binder:
  - ordered notes and subfolders, shown in that order in Obsidian's own file explorer;
  - one binder view with three modes: corkboard, outliner, and the whole manuscript as one editable page.
- **Where it came from:** planned 2026-09-30 in a session that also built and released the maintainer's first plugin,
  **Evra Timelines** (`~/Projects/evra`). Binders reuses Evra's toolchain and team workflow. Evra is a good reference
  for native-looking UI, e2e tests, the release workflow, and the lessons in AGENTS.md.
- **Version:** 0.51.x (the number is in `package.json`; every commit bumps it). **Released:** 0.51.1 is the latest
  release (2026-10-10; 0.44.5, on 2026-10-06, was the first public beta), and Binders is in Obsidian's community directory
  (https://community.obsidian.md/plugins/binders). `manifest.json` names the last release; only `ship --release`
  changes it, and every release is a full one, never a draft or a pre-release (AGENTS.md).
- **Open:** the findings in `tests/e2e/open-findings.json`. Snapshots of a folder and of a whole binder are at step 3 of 4 on `main`
  (take, see, compare; bring back the text and the order, or everything; an automatic one before Replace all):
  thinning the automatic ones is still to build (`docs/dev/plan.md`).
- **Built:** binders in the vault and in the file explorer (order, drag to reorder, label dots), the three modes, the
  Longform integration, the scene operations (split, merge, duplicate, group, compile, undo of moves), arrange by
  label, snapshots (a note's, and a folder's or binder's), find and replace across a binder (0.49.0), focus mode, export (EPUB, DOCX, PDF, a Scrivener project) and
  import from Scrivener. `docs/dev/architecture.md` is the map of the code; the milestone table in
  `docs/dev/plan.md` has the history.
- **Left before 1.0** (`ROADMAP.md`, in its order): export's checks by other hands (Word, Kindle Previewer, Apple Books, a
  printer, Scrivener: `docs/dev/export.md`, "Not verified yet"); the rest of binder snapshots (step 4: thinning); mobile on a real device (the maintainer has none yet, so the
  emulated phone and tablet tests are the standard: "emulator is king").
- **Tests:** unit tests and about seventy e2e spec files, ten QA rounds among them. The last whole-suite run was on
  0.43.0; since then each batch was run only in the spec files its work touched (0.49.21, before the 0.49.24 release: 22 spec files
  covering what changed since 0.48.3, 787 passed, light theme; the two table failures are issue 31). `npm run e2e:all -- --jobs 6 --theme
  both --retry-alone` runs the suite in several Obsidians at once (about two hours); tests known to fail on purpose are
  listed in `tests/e2e/open-findings.json` and don't count. `npm run demo-vault` makes a vault of extreme binders to
  try by hand; `test-vault` is the tests' fixture and is not for hand use.
- **How fixes ship** (learned 2026-10-02, when about a hundred patches shipped on targeted tests alone and several
  broke older tests; narrowed 2026-10-05, when area runs of two hours per agent crashed the machine): an agent runs
  its new tests and the one or two spec files that cover what it changed, and turns the work in; one dedicated test
  runner runs the whole suite at the end of the session (AGENTS.md). A failure on `main` is found with
  `git bisect run` before anyone guesses.
- **Git:** remote `origin` is `github.com/fyresmith/binders`.

## Decisions already made (don't reopen without cause)

- **The goal is to feel native to Obsidian.** The main competitor, StoryLine (about 41k downloads), is full-featured, but
  the maintainer finds it vibe-coded and not native. Quality and feel beat feature count.
- **Patch the core file explorer** for binder order. Being incompatible with explorer-replacing plugins such as Notebook
  Navigator is accepted. Keep the patch isolated, feature-detected, with an alphabetical fallback and a setting to turn
  it off.
- **Binders has its own format** (`docs/dev/file-format.md`) plus a **Longform integration**: read Longform projects and write
  only `longform.scenes` on reorder. Don't use Longform's format as the native one: it's flat, keyed by file name, and
  its nesting has no fixed meaning.
- **1.0 ships all three views:** corkboard, outliner and the editable manuscript. The outliner replaced the plot grid
  on 2026-10-01 (the maintainer's request); see "Decided" in `docs/dev/plan.md`.

## Answers (2026-09-30)

1. **Folder data:** binders and subfolders each have a hidden note (the binder note; a folder note named like the
   folder) that stores their data. Their synopsis is set in the binder view. See `docs/dev/file-format.md`.
2. **Hiding:** binder and folder notes are hidden in the explorer by default, with a setting to show them.
3. **Plot grid cell text:** in scene properties, `plot: {Mara: "…"}`. Superseded 2026-10-01: the plot grid was
   dropped, and `plot`, `plotlines` and `plotlineColors` are no longer read or written (notes that have them keep them).
4. **Mobile:** a 1.0 requirement, including the editable manuscript. Test on iOS and Android from 0.3 on.
5. **GitHub:** `fyresmith/binders` (remote `origin`).

## Working with the maintainer

- Every commit goes through `npm run ship` and bumps the version: x for a new feature, y for a change in
  behavior, z for a fix (x stays 0 until the first release; see "Versioning" in AGENTS.md).
- Commit attribution trailers, if your setup provides them, go through `--trailer`.
- Push `main` to `origin` after each shipped commit or small batch, once `npm run check` passes (the maintainer's
  rule, 2026-10-05). Ask before tagging, force-pushing, creating remotes, or anything else outward-facing.
- Never touch the maintainer's real vaults (e.g. anything under `~/Documents/Vaults`). Test only in `test-vault/`.
- Keep replies short and lead with the result.
