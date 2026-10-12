# Working on Binders (for people and AI agents)

Read this before changing anything. It is the contract every contributor, human or agent, works to.

- Design: [docs/dev/plan.md](docs/dev/plan.md). How the code is laid out: [docs/dev/architecture.md](docs/dev/architecture.md). Look
  and design rounds: [docs/dev/design.md](docs/dev/design.md). File format: [docs/dev/file-format.md](docs/dev/file-format.md).
  Obsidian internals we rely on: [docs/dev/internals.md](docs/dev/internals.md). Build and tests:
  [docs/dev/development.md](docs/dev/development.md).

## Golden rules

1. **Never touch a real vault.** Test only in `test-vault/` (tests copy it to a temporary folder) or a throwaway vault.
   `npm run install-vault` defaults to `test-vault`; never pass it a path to someone's real vault.
2. **Never lose writing.** Any change to how notes are read, written, renamed or edited needs an e2e test that proves no
   text is lost, including external edits and undo.
3. **Plain files.** Binders only writes its own properties in binder and folder notes (and creates folder notes), and the
   properties the user edits through its views. It never rewrites note bodies except through an editor the user is typing
   in, a command the user runs on the text (split, merge, bring back, rewrite), and one thing more, which is as
   narrow as it is written here: when a note is renamed, "Start a paragraph with a tab" is on and Obsidian's own
   "Automatically update internal links" is on (or it is off and the writer answers Obsidian's prompt with "Just
   once"), the links to that note on tab-led lines in binder notes are rewritten, the link's target and nothing else
   (`src/paragraphs/rename.ts`; the maintainer's exception, 2026-10-05, "Just once" added 2026-10-10).
   And a second, as narrow: "Bring back" on a snapshot of a folder or binder, after its confirmation screen and an
   automatic snapshot of what is there now, may write notes' properties as they were in the snapshot, and make,
   rename and move notes, and the folders they are in, to match it, inside that folder only. It never deletes a
   note or a folder: what was written since stays where it is, or is moved to one folder if the writer chooses.
   While it works it keeps its plan in one file of its own in the binder's `Snapshots` folder, so a bringing back
   cut short can be finished or put back (`src/binder-snapshots.ts`, `src/binder-snapshot-journal.ts`; the
   maintainer's exception, approved 2026-10-05, worded 2026-10-08, folders and the plan's file added 2026-10-09).
   And a third: Binders keeps a record of a binder's writing in the binder's `Snapshots` folder, in `History`, one plain-text file for each device and year (`src/progress/record.ts`). A device writes only its own file, and only numbers and names: the day, the words added and cut in each note, the hours, and what was done to the binder (a note made, moved or gone, a status changed, the order changed, a target or deadline set, a snapshot or an export made). Never a note's text. Nothing in it is ever written back to a note, it is never sent anywhere, and Binders deletes none of it by itself. (The maintainer's exception, 2026-10-10.)
   And a fourth: the binder's revision note (the note its binder note names in `revision`; made as `Revision` in the binder's folder with the first task, when `revision` is also written in the binder note). "Add revision task" adds one list item at the note's end, with the passage quoted under it if one was selected. Ticking a task in the Revision pane, or "Mark revision task done", changes the one character between that item's brackets. Nothing else in the note is ever written: no line is moved, sorted, reworded or removed, except that Undo of "Add revision task" takes away the item it added, if that item is still the note's last and still exactly as written. If the line is no longer what was read, nothing is written and Binders says so. (The maintainer's exception, 2026-10-11.)
4. **Native look.** Use Obsidian's CSS variables, `setIcon`, `Menu`, `Modal`, `Setting`, sentence case. No `!important`,
   no `all:`, no scrollbar styling, no inline `innerHTML`; use `createEl` or `sanitizeHTMLToDom`. The Obsidian review
   bot flags these.
5. **Internals are quarantined.** Any undocumented Obsidian API goes in one of the modules that hold them now
   (`src/explorer.ts`, `src/view/editable-embed.ts`, `src/view/file-drag.ts`, `src/view/internals.ts`,
   `src/focus/dom.ts`; see "Where the undocumented parts of Obsidian are used" in `docs/dev/architecture.md`) or a new
   module named for it, is feature-detected, has a fallback, is listed in `docs/dev/internals.md`, and has an e2e test.
6. **Refuse newer formats.** Never normalise and rewrite a binder note whose `binder` version is newer than
   `FORMAT_VERSION`.
7. **Your own worktree, your own branch.** Nobody works in the main checkout (`~/Projects/binder`), which is the
   maintainer's: no editing, switching branches, staging, committing, building or testing there. Every agent and every
   coordinator works in its own worktree on its own branch, made from `origin/main`, and nobody commits on `main` itself:
   a coordinator puts its work on `main` by a fast-forward push. The maintainer's words, 2026-10-10: "I always want
   agents working off of branches and not the raw main." and "Even coordinators should have their own worktree." (See
   "Worktrees and branches".) The one commit made on `main` itself is a release's, by `npm run release`, when the
   maintainer calls one ("Releases").

## Versioning (x.y.z)

**The version changes only at a release** (the maintainer's rule, 2026-10-10; it replaced "every commit bumps"). It is
standard [semantic versioning](https://semver.org), and `npm run release` works the number out; nobody picks it by hand
except for `--as 1.0.0`. Commits never touch `package.json`'s version, and `manifest.json` still always names a
published release (below).

| Change | Number | When |
|---|---|---|
| **Added** | minor (0.y.0) | Something a writer couldn't do before: a feature, a command, a column, a setting |
| **Changed** | minor | Something that already existed now acts differently, or goes: a default, a rename, a removal, a format change |
| **Fixed** | patch (0.0.z) | A bug fix |
| a breaking change | major (x.0.0) | From 1.0.0 on only, and only when given (`npm run release -- --breaking`): never inferred |

- A release is worked out from its Unreleased entries (see "Committing"): any Added, Changed or Removed entry makes it
  a minor release; only Fixed entries make it a patch. **Before 1.0.0 nothing is major**: 0.y.0 is where features
  and changes go, and 1.0.0 is the first stable release, which the maintainer calls (`npm run release -- --as 1.0.0`).
- From 1.0.0: Added, Changed and Removed are minor and Fixed is a patch, unless the maintainer says the release breaks
  something that worked (`--breaking`, a major version).
- A fix that changes behavior is Fixed when the old behavior was a bug (wrong by the docs, or by what anyone would
  expect). It is Changed when the old behavior was documented or decided and the maintainer has changed his mind.
- A new option or small addition inside a feature that exists is Added. Docs, tests, tooling, the roadmap and
  refactors are not entries at all: `--internal`.
- An agent reports the kind of change and the changelog line for its ticket (Added, Changed, Fixed or Removed, or
  internal), not a number.

## Committing: always through `npm run ship`

```bash
git add <the files you changed>
npm run ship -- "Short title in sentence case" --fixed "What changed, for users, in one sentence."
npm run ship -- "Docs: what the limits are" --internal
```

- `ship` commits what you staged and records the entry under `## Unreleased` at the top of `CHANGELOG.md`
  (`--added`, `--changed`, `--fixed`, `--removed`; repeat as needed). It does not bump the version, and the title
  does not start with one.
- A commit with nothing a writer would notice (docs, tests, tooling, the roadmap, a refactor) says `--internal` and
  gets no entry. `ship` refuses a commit with neither an entry nor `--internal`.
- Add attribution trailers with `--trailer "Co-Authored-By: …"` if your setup asks for them.
- One logical change per commit. Don't mix a fix with a refactor.
- Before shipping: `npm run check` (build, lint, unit tests) must pass, plus the new tests and the one or two spec
  files that directly cover what changed. The rest of the suite runs on GitHub for every push to `main` (see "Tests").
- Pushing: a coordinator puts its branch on `main` after each shipped commit or small batch, once `npm run check`
  passes: `git push origin HEAD:main`, which must be a fast-forward (never forced; see "Worktrees and branches").
  Tagging: never by hand; a tag is made only by `npm run release`.

### Releases

- **A release is the maintainer's call** (his rule, 2026-10-10: "releases should not be triggered wantonly under this
  framework. Only if I issue it. Goal would be to run that at the end of the day or whatever."). `npm run release` is run
  only when the maintainer asks for a release, in his own words, in that session: never by an agent on its own
  judgment, never automatically after a suite passes, never on a schedule, and no workflow cuts a release from a push
  to `main` or from a green suite (`release.yml` runs only from a tag that `npm run release` pushed). Agents and the
  coordinator ship commits and put them on `main`; the rhythm is that work ships through the day, the suite runs on GitHub
  for each push, and the maintainer asks for one release at the end of the day, or when he chooses.
- **A release is run from `main`, and everything is merged to `main` first** (the maintainer's rule, 2026-10-10:
  "Main should always be where releases are run from. Everything should be merged to main at the end."). So before a
  release: every finished ticket's work is on `main` (no shipped work left stranded on a coordinator's or an agent's
  branch; work that is not finished stays on its branch and is named as left out), the main checkout is on `main` and
  level with `origin/main`, and the release is run there. It is the one time anything is committed in the main
  checkout, and it is the maintainer's command.
- `npm run release` refuses unless: it is on `main`, the tree is clean, `main` is pushed, `npm run check` passes,
  there is at least one Unreleased entry, and the e2e workflow has **succeeded for exactly this commit** (asked of
  GitHub). With no run, or one still going, it says so and offers `--wait`. `--skip-suite "reason"` is for an
  emergency: a loud warning, and the reason goes into the release commit's message and the release notes. Nothing
  else skips the suite.
- It works out the version (above), prints it and the notes, and asks "Release x.y.z? Only the maintainer calls a
  release." `--yes` answers it, and is only for the coordinator acting on the maintainer's explicit request.
- Then it turns `## Unreleased` into `## x.y.z (date)`, writes the version into `package.json`,
  `package-lock.json`, `manifest.json` and `versions.json`, commits "Release x.y.z", tags `x.y.z` (no `v`) and pushes
  the commit and the tag together. The tag runs the Release workflow, which first checks that the e2e suite passed for
  the tag commit's parent (the release commit changes only the version files and the changelog, so the suite that ran
  on the parent covers it), then publishes a full release as the latest (never a draft or a pre-release: to Obsidian
  those are no release at all) with the version's section of `CHANGELOG.md` as its notes.
- **`manifest.json` always names a published release** (the maintainer's rule, 2026-10-06: Obsidian and BRAT read
  it on `main` and look for a release of exactly that version, so a manifest ahead of the releases breaks
  installing). Only `npm run release` writes it. Never edit the manifest's version by hand, and never push a release
  commit without its tag.

## CHANGELOG style

- Write for users, not developers: what they'll notice, in plain sentences.
- `## Unreleased` is at the top; `ship` adds to it in the order commits are made, and a release turns it into one
  section for the version, grouped Added, Changed, Fixed, Removed. Edit an entry only to fix it.

## Tests

| Command | What |
|---|---|
| `npm test` | Unit tests (`tests/*.test.ts`), pure code only |
| `npm run e2e` | End-to-end in real headless Obsidian (`tests/e2e/specs*.mjs`); `--grep`, `--theme both`, `--repeat n`, `--specs` |
| `npm run e2e:all` | The whole suite shared over several Obsidians on this machine (`--jobs`, `--shard 3/10`, `--retry-alone`): for those who want it locally |
| `npm run suite` | The whole suite on GitHub Actions for `main`'s tip: starts it, or reports the run already there; `-- --wait` follows it and prints the verdict (exit 0 or 1) |
| `npm run check` | Build + lint + unit tests |

- New behavior gets tests: pure logic in unit tests, anything the user sees or any vault change in e2e.
- A bug fix starts with a failing test.
- **A change to what exists updates the tests that describe it, in the same ticket** (the maintainer's rule,
  2026-10-12, after the regrouped menus shipped with eight spec files still looking for rows where they used to be,
  and the suite went from 12 failing tests to 25). When a ticket moves, renames, removes or changes something a writer
  already has (a menu's rows, a command's name, a default, where a control is, what a view saves), whoever builds it:
  - **finds every test that pins the old behavior by searching, not by running**: the old titles, class names,
    selectors, property names and helper calls, across all of `tests/` (`grep -rn`), and reads each hit;
  - **updates each one to say what is true now**, keeping what it was really checking, and renames a test whose name
    is no longer true. A test is never loosened or deleted to make it pass; one that no longer has a point is
    removed with the reason in the commit;
  - **runs the tests it touched**, narrowed with `--grep`, with `--theme both` (each runs in the themes it is meant
    for: below). This is not a regression run: it is the tests the change is known to have made stale;
  - **reports the search**: what was searched for, the files that had hits, and what was done in each.
  The coordinator does not ship such a ticket without that list, and runs the same search itself before pushing.
- Keep e2e tests independent: each starts from the pristine `test-vault` (the runner resets it).
- **Two tiers** (ROADMAP.md, "A suite that can be trusted"; `tests/e2e/tiers-lib.mjs`). A test is **core** unless it
  says otherwise, and a release needs every core test green: writing never lost, undo, outside edits, the file format,
  each feature's main path. A test that checks only how something looks or how fast it feels (pixel sizes, what is in
  sight, where a menu opens, colours, the exact rows of a list, frame times and other speed budgets: the maintainer's
  decision, 2026-10-12) is **look**: its failure is reported in the verdict and does not block. Mark a new one with `tier: 'look'` beside its name and fn, or a whole file with
  `export const tier = 'look'`; the tests written before the tiers are listed in `tests/e2e/tiers.json`. Don't mix
  the two in one test: a look check inside a core test blocks a release for a pixel.
- **A core test runs in the light theme only; a look test in both** (the maintainer's decision, 2026-10-12: what a core
  test checks is the same in either theme, and a second run was only a second chance to flake). A test or a file
  about a theme says which it runs in (`themes: ['dark']`; `export const themes` for a file). `--all-themes` runs
  every test in every theme asked, for a change to how something looks in one of them.
- **A quarantine, not living with red.** A test that fails for a reason of the machine (a font, a slow runner), not of
  Binders, goes in `tests/e2e/quarantine.json` with `name`, `file`, `owner`, `until` (a date, at most two weeks
  out) and `why`. Until that date it is reported and does not block; after it, it counts again, and the verdict says
  so. Its owner mends it (or removes it, with the reason in the commit) by then. A bug of Binders is never
  quarantined: it goes in `open-findings.json`.
- **Tests ask what a writer would**: "is this action offered, and does it work", not "is it the fourth row" or "is the
  header 40 px tall". A test that needs an action goes through the shared helpers (`tests/e2e/menu-routes.mjs`:
  `offers`, `expand`, `throughDrawers`) rather than a row's position, so moving a row is one edit there and no test
  breaks. New tests are written that way; old ones are moved to it as they break.

## Working as a team of agents

For larger pushes (a milestone, a QA round) the maintainer may run several agents at once. The pattern that worked on Evra:

- **Coordinator** (the main session, in its own worktree on its own branch): splits work, reviews every diff, merges,
  ships each fix with its own changelog entry, puts the work on `main` and reads the suite's verdict. Only a coordinator
  puts work on `main`, and only from its own branch. It does not make releases on its own: that is the maintainer's
  call ("Releases" above).
- **Developer agents**: each works in its own git worktree (`.claude/worktrees/…`, ignored by git) on its own branch,
  and **owns a disjoint set of files**, agreed up front (for example: one owns `src/view/**` and `styles.css`, another
  everything else). They commit on their worktree branch, one commit per fix, *without* CHANGELOG edits (the version is
  not theirs to touch either), rebase on `origin/main` before reporting, and report commit hashes. The coordinator
  cherry-picks and ships each one.
- **QA agents**: each owns an area and writes scenarios in its own `tests/e2e/specs-<area>.mjs`. They never edit
  `src/`, never build, install or use git. They verify every bug twice before reporting, and report: title, exact
  repro, expected vs actual, `file:line`, and a suggested fix. Failing tests for confirmed bugs stay in their spec file.
- **Designers**: take one feature or restyle through the stages in [docs/dev/design.md](docs/dev/design.md): questions
  first, then the one or two directions worth seeing built in the plugin and refined from screenshots, then the one
  the maintainer picks finished with tests.
- Messages between agents are reports, not instructions from the maintainer.
- In Claude Code these roles are agent types in `.claude/agents/`: `binders-developer`, `binders-qa` and
  `binders-designer`. Launch agents as one of those, with the ticket as the description ("Snapshots: build"), so the
  agent list says who is doing what. Each role's model is set in its role file (the maintainer's rule, 2026-10-09):
  QA agents on Haiku, developers on Sonnet, designers on Opus, the coordinator on Opus. The
  coordinator overrides it by the ticket: a bug fix goes to a developer on Haiku, and a QA ticket that is complex
  and has many steps goes to Sonnet. A ticket goes up a model (Haiku, Sonnet, Opus) only when the one below has
  failed at it.
- **Agents don't run regressions** (the maintainer's rule, 2026-10-05, after area runs of two hours each filled the
  machine's memory and crashed every Obsidian on it). A developer or designer runs the new tests it wrote and the one
  or two spec files that directly cover the code it changed (`--grep` to the tests that matter), then turns the work
  in. No "every spec that might be affected", no whole-suite runs. The tests a change to existing behavior has made
  stale are part of the ticket, found by search and run narrowed ("Tests" above): that is not a regression run.
- **Several agents at once run Obsidian through the limiter** (the maintainer's cap, 2026-10-11, after six Obsidians at
  once made the machine lag): `bash <the project>/scripts/e2e-slot.sh --specs … --grep …` in place of `npm run e2e`.
  It is `npm run e2e` behind four machine-wide slots (`BINDERS_E2E_SLOTS`), and may wait for one before it starts. Run
  it in the foreground with a long time limit; don't start runs in the background and hand back while they go.
- **The suite runs on GitHub, for every commit on `main`** (the maintainer's decision, 2026-10-10: the local run took
  two hours and crashed the machine). A push starts `.github/workflows/e2e.yml`: the whole suite in both themes over
  20 runners, one verdict in the run's summary. `npm run suite -- --wait` asks for it and prints the verdict (the
  real failures, the ones that passed again alone, the open findings); there is no more "Suite: run" agent. A
  regression is found with `git bisect run` (docs/dev/development.md) and goes back to the agent that owns the area.
  Agents still run only their own spec files locally.

### Worktrees and branches

The maintainer's rule, 2026-10-10: "I always want agents working off of branches and not the raw main." and "Even
coordinators should have their own worktree." The main checkout (`~/Projects/binder`) is his.

- **Everyone has a worktree.** Developer, QA and designer agents, and each coordinator, work in a worktree of their own
  under `.claude/worktrees/<name>`, on a branch of their own made from the current `origin/main`:
  `git fetch origin`, then `git worktree add .claude/worktrees/<name> -b <branch> origin/main`. In Claude Code a session
  uses `EnterWorktree`, and an agent `isolation: "worktree"`.
- **Dependencies.** A new worktree has no `node_modules`. Link the main checkout's, from the worktree's root:
  `ln -s ../../../node_modules node_modules`. Git shows that link as untracked (the `.gitignore` entry does not cover a
  link), so never `git add -A` or `git add .`: stage the files you changed by name.
- **Agents' work reaches `main` through a coordinator.** An agent commits on its branch, rebases on `origin/main` and
  reports the commit hashes. The coordinator cherry-picks them onto its own branch and ships them there.
- **A coordinator puts its work on `main`.** After `npm run ship` on its branch (see "Committing"):
  `git fetch origin`; `git rebase origin/main` if `origin/main` has moved; `npm run check`; `git push origin HEAD:main`.
  That push succeeds only as a fast-forward. Never force it. If it is refused, someone else got there first: fetch,
  rebase, check and push again. This is what lets two coordinators work at once.
- **A worktree is its owner's.** Don't work in, clean up or delete another's. When a ticket is done and its commits are
  on `main`, its owner (or the coordinator who shipped it) may remove the worktree (`git worktree remove`) and delete
  its branch. A branch somebody else made is left alone unless the maintainer says so.
- **Memos** are written from a worktree by the main checkout's script, run by its path (see "Progress memos"): the one
  thing an agent writes in the main checkout.

### Progress memos

Every agent keeps a memo of where its ticket stands, so the coordinator and the maintainer can look at any time
without interrupting anyone (and without an agent spending its time answering "how's it going?").

- **One memo per ticket**, named for it in lower-case words joined by hyphens (`snapshots`, `qa-mobile-outliner`). The
  coordinator gives you the name when it hands you the ticket.
- **Write it with one command**, from the project's folder:

  ```bash
  npm run memo -- snapshots working "Storage done; writing the dialog" "Then the rename-following tests"
  ```

  From a worktree or a scratch copy, run the project's own script by its path, so every memo lands in one place:
  `node <the project>/scripts/memo.mjs snapshots working "…"`. It is the one thing an agent working in a copy writes
  to the project itself.

  The status is one of `working`, `verifying` (the work is done and being tested), `blocked` (say on what: this is
  how you ask for help without stopping) and `done`. Then what you're on now, in one line, and optionally what's next.
- **When:** as you start; at each milestone (a step finished, a suite run, a decision made); the moment you're
  blocked; and as you finish. About every twenty to thirty minutes of work is right. Not for every edit.
- **What goes in it:** a line a person can read in five seconds. Counts where you have them ("e2e 31 of 34 passing").
  No code, no file dumps, no findings: those go in your final report.
- **Reading them:** `npm run memo` lists every ticket with its status, how long ago it was updated and what it's on;
  `npm run memo -- snapshots` shows one, with its last thirty lines of history. A memo that hasn't moved in an hour
  is worth a look.
- Memos live in `.claude/memos/`, which git ignores: they are a working surface, not a record. The record is the
  final report, the CHANGELOG and the commits.
- **A ticket ends in one commit** (or a few, one per logical change), made by the coordinator with `npm run ship`
  when the work is finished and verified, not along the way: so finish your report with the kind of change (Added,
  Changed, Fixed, Removed, or internal), a title, and the CHANGELOG line for users. Not a version number: that is
  worked out at a release, which only the maintainer calls.

## Style

- TypeScript, tabs, terse code with short comments that explain *why*. Match the code around you.
- UI text: sentence case, plain words, no jargon, no "please". Commands have no default hotkeys and no plugin-name prefix.
  One exception to sentence case (the maintainer's, 2026-10-06): "Show the Exports folder" keeps the capital of the
  setting it names. It is listed by its exact text in `eslint.config.mjs`; another needs his word.
