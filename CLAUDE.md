@AGENTS.md

# Binders: context for Claude

## Where things stand

- **What it is:** Binders, an Obsidian plugin (id `binders`) that makes folders behave like a writer's binder:
  - ordered notes and subfolders, shown in that order in Obsidian's own file explorer;
  - one binder view with four modes: corkboard, outliner, the whole manuscript as one editable page, and a
    timeline of the scenes along story time (2026-10-10).
- **Where it came from:** planned 2026-09-30 in a session that also built and released the maintainer's first plugin,
  **Evra Timelines** (`~/Projects/evra`). Binders reuses Evra's toolchain and team workflow. Evra is a good reference
  for native-looking UI, e2e tests, the release workflow, and the lessons in AGENTS.md.
- **Version:** changes only at a release (`npm run release`; the maintainer's rule, 2026-10-10: standard semantic
  versioning, and a release only when he asks for one). **Released:** 0.51.1 is the latest release (2026-10-10;
  0.44.4, on 2026-10-06, was the first public beta), and Binders is in Obsidian's community directory
  (https://community.obsidian.md/plugins/binders). What has been implemented on `main` since is under `## Unreleased` in
  `CHANGELOG.md`. `manifest.json` names the last release; only `npm run release` changes it, and every release is
  a full one, never a draft or a pre-release (AGENTS.md).
- **Open:** the findings in `tests/e2e/open-findings.json`. Snapshots of a folder and of a whole binder are at step 3 of 4 on `main`
  (take, see, compare; bring back the text and the order, or everything; an automatic one before Replace all):
  thinning the automatic ones is still to build (`docs/dev/plan.md`).
- **Built:** binders in the vault and in the file explorer (order, drag to reorder, label dots), the four modes, the
  Longform integration, the scene operations (split, merge, duplicate, group), shared undo and redo of changes, arrange by
  label, snapshots (a note's, and a folder's or binder's), find and replace across a binder (0.49.0), focus mode, export (EPUB, DOCX, PDF, a Scrivener project) and
  import from Scrivener and from Word, Markdown or text, with an editable preview, and "Split at headings...". Story dates and the timeline's
  display, card editing and date menus are built; dragging to set dates is not. These latest additions are on
  `main`, not yet in 0.51.1. `docs/dev/architecture.md` is the map of the code; the milestone table in
  `docs/dev/plan.md` has the history.
- **Left before 1.0** (`ROADMAP.md`, in its order; the maintainer's decision, 2026-10-10: every major feature is
  built before 1.0 and nothing is held for after it): further import formats (`.odt`, `.rtf`), progress over time, saved filters, an editor's changes brought back, revision notes, a binder from
  a structure, timeline dragging, custom calendars and eras, and thinning the automatic snapshots. Then
  hardening: export's checks by other hands (`docs/dev/export.md`, "Not verified yet"), real devices (he has an
  iPhone; no iPad or Android yet, and the emulated phone and tablet tests are the suite's standard), a QA round,
  the open issues.
- **Tests:** unit tests and over a hundred e2e spec files. The whole suite runs on GitHub Actions for every push to
  `main`, in twenty shards (`.github/workflows/e2e.yml`); `npm run suite -- --wait` reads the verdict, and a release
  is refused without a pass for that commit. Tests known to fail on purpose are listed in
  `tests/e2e/open-findings.json` and don't count. `npm run e2e:all` still runs it on this machine (about two hours).
  `npm run demo-vault` makes a vault of extreme binders to try by hand; `test-vault` is the tests' fixture and is
  not for hand use.
- **How fixes ship** (learned 2026-10-02, when about a hundred patches shipped on targeted tests alone and several
  broke older tests; narrowed 2026-10-05, when area runs of two hours per agent crashed the machine): an agent runs
  its new tests and the one or two spec files that cover what it changed, and turns the work in; the whole suite
  runs on GitHub for each push to `main` (AGENTS.md). A failure on `main` is found with
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
- **1.0 ships four views:** corkboard, outliner, the editable manuscript and the timeline (added 2026-10-10). The outliner replaced the plot grid
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

- Every commit goes through `npm run ship`, which records what changed for writers under `## Unreleased`
  (`--added`, `--changed`, `--fixed`, `--removed`), or `--internal` for what they won't notice. It does not bump
  the version.
- **A release is his call, each time** ("releases should not be triggered wantonly ... Only if I issue it",
  2026-10-10): never run `npm run release` unless he asks for a release in that session.
- Commit attribution trailers, if your setup provides them, go through `--trailer`.
- Push `main` to `origin` after each shipped commit or small batch, once `npm run check` passes (the maintainer's
  rule, 2026-10-05). Never tag by hand. Ask before force-pushing, creating remotes, or anything else outward-facing.
- Never touch the maintainer's real vaults (e.g. anything under `~/Documents/Vaults`). Test only in `test-vault/`.
- Keep replies short and lead with the result.
