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
- **Git:** local only; no GitHub remote yet.

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

## First thing to do in a new chat

**If the answers below aren't recorded yet** (no "Answers" section below, or questions still unanswered), start by
asking the maintainer these questions, in one message, with your recommendation for each. Record the answers here under
"Answers", update `docs/plan.md` and `docs/file-format.md` to match, and ship the change (`npm run ship -- patch …`)
before starting 0.2.

1. **Subfolder synopses.** Where should a subfolder's card text (a chapter's synopsis) come from?
   - a folder note inside the subfolder (`Part One/Part One.md`);
   - an entry in the binder note;
   - no synopsis for folders in 1.0.

   Recommended: a folder note, so it's plain Markdown and works with folder-note plugins.
2. **Hiding the binder note.** Should the binder note be hidden in the file explorer by default, since clicking the
   folder opens the binder view? Recommended: yes, with a setting to show it.
3. **Plot grid cell text.** 1.0 cells are on/off (a scene's `plotlines` property). If cells later hold text, where should
   it live?
   - in the scene's properties (`plot: {Mara: "…"}`), though nested objects aren't editable in Obsidian's Properties
     panel;
   - under a heading in the scene note;
   - separate notes.

   Recommended: decide later, but reserve a property name now.
4. **Mobile.** Is mobile a 1.0 requirement, or best-effort? The explorer patch should work there; the manuscript's
   embedded editors need testing on iOS and Android. Recommended: best-effort for 1.0, with the manuscript read-only on
   mobile if editing isn't solid.
5. **GitHub.** Create `fyresmith/binders` now? Public or private? Recommended: private until 0.4 (the first usable
   corkboard), then public.

## Answers

(None yet.)

## Working with the maintainer

- Every commit goes through `npm run ship` and bumps the version: patch for small, minor for bigger (see AGENTS.md).
- Commit attribution trailers, if your setup provides them, go through `--trailer`.
- Ask before pushing, tagging, creating remotes, or anything outward-facing.
- Never touch the maintainer's real vaults (e.g. anything under `~/Documents/Vaults`). Test only in `test-vault/`.
- Keep replies short and lead with the result.
