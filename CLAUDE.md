@AGENTS.md

# Binders: context for Claude

## Where things stand

- **What it is:** Binders, an Obsidian plugin (id `binders`) that makes folders behave like a writer's binder:
  - ordered notes and subfolders, shown in that order in Obsidian's own file explorer;
  - one binder view with three modes: corkboard, plot grid, and the whole manuscript as one editable page.
- **Where it came from:** planned 2026-09-30 in a session that also built and released the maintainer's first plugin,
  **Evra Timelines** (`~/Projects/evra`). Binders reuses Evra's toolchain and team workflow. Evra is a good reference
  for native-looking UI, e2e tests, the release workflow, and the lessons in AGENTS.md.
- **Version:** 0.1.0, the scaffold. Only `src/model.ts` (the binder index), the settings tab and the test harness exist.
  Next milestone: **0.2**, binders in the vault: detection, index cache, rename/move/delete tracking, "Make this folder
  a binder", "New scene here". See the milestone table in `docs/plan.md`.
- **Git:** remote `origin` is `github.com/fyresmith/binders`.

## Decisions already made (don't reopen without cause)

- **The goal is to feel native to Obsidian.** The main competitor, StoryLine (about 41k downloads), is full-featured, but
  the maintainer finds it vibe-coded and not native. Quality and feel beat feature count.
- **Patch the core file explorer** for binder order. Being incompatible with explorer-replacing plugins such as Notebook
  Navigator is accepted. Keep the patch isolated, feature-detected, with an alphabetical fallback and a setting to turn
  it off.
- **Binders has its own format** (`docs/file-format.md`) plus a **Longform integration**: read Longform projects and write
  only `longform.scenes` on reorder. Don't use Longform's format as the native one: it's flat, keyed by file name, and
  its nesting has no fixed meaning.
- **1.0 ships all three views:** corkboard, plot grid and the editable manuscript.

## Answers (2026-09-30)

1. **Folder data:** binders and subfolders each have a hidden note (the binder note; a folder note named like the
   folder) that stores their data. Their synopsis is set in the binder view. See `docs/file-format.md`.
2. **Hiding:** binder and folder notes are hidden in the explorer by default, with a setting to show them.
3. **Plot grid cell text:** in scene properties, `plot: {Mara: "…"}` (reserved now, used after 1.0).
4. **Mobile:** a 1.0 requirement, including the editable manuscript. Test on iOS and Android from 0.3 on.
5. **GitHub:** `fyresmith/binders` (remote `origin`).

## Working with the maintainer

- Every commit goes through `npm run ship` and bumps the version: patch for small, minor for bigger (see AGENTS.md).
- Commit attribution trailers, if your setup provides them, go through `--trailer`.
- Ask before pushing, tagging, creating remotes, or anything outward-facing.
- Never touch the maintainer's real vaults (e.g. anything under `~/Documents/Vaults`). Test only in `test-vault/`.
- Keep replies short and lead with the result.
