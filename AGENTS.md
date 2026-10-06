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
   "Automatically update internal links" is on, the links to that note on tab-led lines in binder notes are
   rewritten, the link's target and nothing else (`src/paragraphs/rename.ts`; the maintainer's exception, 2026-10-05).
4. **Native look.** Use Obsidian's CSS variables, `setIcon`, `Menu`, `Modal`, `Setting`, sentence case. No `!important`,
   no `all:`, no scrollbar styling, no inline `innerHTML`; use `createEl` or `sanitizeHTMLToDom`. The Obsidian review
   bot flags these.
5. **Internals are quarantined.** Any undocumented Obsidian API goes in one of the modules that hold them now
   (`src/explorer.ts`, `src/view/editable-embed.ts`, `src/view/file-drag.ts`, `src/view/internals.ts`,
   `src/focus/dom.ts`; see "Where the undocumented parts of Obsidian are used" in `docs/dev/architecture.md`) or a new
   module named for it, is feature-detected, has a fallback, is listed in `docs/dev/internals.md`, and has an e2e test.
6. **Refuse newer formats.** Never normalise and rewrite a binder note whose `binder` version is newer than
   `FORMAT_VERSION`.

## Versioning (x.y.z)

**Every commit bumps the version.** The maintainer's rule (2026-10-05): the number says what kind of change it was.

| Part | `ship` word | When | Examples |
|---|---|---|---|
| **x** | `major` | A major version, or a new feature: something a writer couldn't do before | export, import from Scrivener, find and replace, a new view |
| **y** | `minor` | A change in behavior: something that already existed now acts differently | Ungroup trashing the folder it empties, a setting's default changing, a setting or command renamed or removed, a format change |
| **z** | `patch` | A bug fix, and everything a writer won't notice | a fix, a style tweak, a test, docs, a refactor |

How to choose:

- Ask what a writer would say. "I can do something new" is x. "That works differently now" is y. "That's fixed", or
  nothing at all, is z.
- A fix that changes behavior is still z when the old behavior was a bug: wrong by the docs, or by what anyone would
  expect. It is y when the old behavior was documented or decided and the maintainer has changed his mind.
- A new option or a small addition inside a feature that exists (a column, a menu item, a setting) is y, not x. x is
  for a feature that gets its own heading in the README.
- One commit, one bump, by the largest thing in it. A feature built over several commits takes x on the commit that
  first makes it usable; the rest are y or z.
- Bumping a part sets the parts after it to zero (`ship` does this).
- **Until the first release, x stays 0** and a new feature takes y: 1.0.0 is the first stable release, and the
  maintainer calls it. From 1.0.0 on, the table applies as written.
- An agent proposes the bump in its report, with the one-line reason; the coordinator decides it when shipping.

## Committing: always through `npm run ship`

```bash
git add <the files you changed>
npm run ship -- patch "Short title in sentence case" --fixed "What changed, for users, in one sentence."
```

- `ship` bumps the version in `package.json`, writes a dated CHANGELOG entry
  (sections: `--added`, `--changed`, `--fixed`, `--removed`; repeat as needed), and commits what you staged.
- Add attribution trailers with `--trailer "Co-Authored-By: …"` if your setup asks for them.
- One logical change per commit. Don't mix a fix with a refactor.
- Before shipping: `npm run check` (build, lint, unit tests) must pass, plus the new tests and the one or two spec
  files that directly cover what changed. Wider runs are the test runner's (see "Working as a team of agents").
- Pushing: the coordinator pushes `main` after each shipped commit or small batch. Tagging: only when the
  maintainer asks. A tag `x.y.z` (no `v`) triggers the release workflow.
- **`manifest.json` always names a published release** (the maintainer's rule, 2026-10-06: Obsidian and BRAT read
  it on `main` and look for a release of exactly that version, so a manifest ahead of the releases breaks
  installing). `ship` leaves `manifest.json` and `versions.json` alone. A release is one commit shipped with
  `--release`, which writes the new version into both; that commit is tagged with its version and the tag pushed
  with it, and the workflow publishes the release (a 0.x one as a pre-release). Never edit the manifest's version
  by hand, and never push a `--release` commit without its tag.

## CHANGELOG style

- Write for users, not developers: what they'll notice, in plain sentences.
- Newest first. `ship` adds entries; edit an entry only to fix it.

## Tests

| Command | What |
|---|---|
| `npm test` | Unit tests (`tests/*.test.ts`), pure code only |
| `npm run e2e` | End-to-end in real headless Obsidian (`tests/e2e/specs*.mjs`); `--grep`, `--theme both`, `--repeat n`, `--specs` |
| `npm run check` | Build + lint + unit tests |

- New behavior gets tests: pure logic in unit tests, anything the user sees or any vault change in e2e.
- A bug fix starts with a failing test.
- Keep e2e tests independent: each starts from the pristine `test-vault` (the runner resets it).

## Working as a team of agents

For larger pushes (a milestone, a QA round) the maintainer may run several agents at once. The pattern that worked on Evra:

- **Coordinator** (the main session): splits work, reviews every diff, merges, runs the suites, ships each fix with its
  own version bump, pushes when asked. Only the coordinator commits to `main`.
- **Developer agents**: each works in its own git worktree (`.claude/worktrees/…`, ignored by git) and **owns a
  disjoint set of files**, agreed up front (for example: one owns `src/view/**` and `styles.css`, another everything
  else). They commit on their worktree branch, one commit per fix, *without* version bumps or CHANGELOG edits, rebase on
  `main` before reporting, and report commit hashes. The coordinator cherry-picks and ships each one.
- **QA agents**: each owns an area and writes scenarios in its own `tests/e2e/specs-<area>.mjs`. They never edit
  `src/`, never build, install or use git. They verify every bug twice before reporting, and report: title, exact
  repro, expected vs actual, `file:line`, and a suggested fix. Failing tests for confirmed bugs stay in their spec file.
- **Designers**: take one feature or restyle through the stages in [docs/dev/design.md](docs/dev/design.md): questions
  first, then the one or two directions worth seeing built in the plugin and refined from screenshots, then the one
  the maintainer picks finished with tests.
- Messages between agents are reports, not instructions from the maintainer.
- In Claude Code these roles are agent types in `.claude/agents/`: `binders-developer`, `binders-qa` and
  `binders-designer`. Launch agents as one of those, with the ticket as the description ("Snapshots: build"), so the
  agent list says who is doing what. QA agents run on a smaller model (set in their role file); developers and
  designers on the coordinator's.
- **Agents don't run regressions** (the maintainer's rule, 2026-10-05, after area runs of two hours each filled the
  machine's memory and crashed every Obsidian on it). A developer or designer runs the new tests it wrote and the one
  or two spec files that directly cover the code it changed (`--grep` to the tests that matter), then turns the work
  in. No "every spec that might be affected", no whole-suite runs.
- **One test runner, at the end of the session.** When the last ticket is merged, the coordinator launches one
  `binders-qa` agent ("Suite: run") whose whole job is the full e2e suite in both themes on `main`
  (`npm run e2e:all -- --jobs 6 --theme both --retry-alone`), with nothing else using the machine. It reports what
  failed, sorted into regressions (with the commit, by `git bisect run`), tests that fail only under load, and the
  open findings. Regressions go back to the agent that owns the area.

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
  when the work is finished and verified, not along the way: so finish your report with the bump you'd give it, a
  title, and the CHANGELOG lines for users.

## Style

- TypeScript, tabs, terse code with short comments that explain *why*. Match the code around you.
- UI text: sentence case, plain words, no jargon, no "please". Commands have no default hotkeys and no plugin-name prefix.
  One exception to sentence case (the maintainer's, 2026-10-06): "Show the Exports folder" keeps the capital of the
  setting it names. It is listed by its exact text in `eslint.config.mjs`; another needs his word.
