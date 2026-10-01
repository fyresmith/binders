# Working on Binders (for people and AI agents)

Read this before changing anything. It is the contract every contributor, human or agent, works to.

- Design: [docs/plan.md](docs/plan.md). File format: [docs/file-format.md](docs/file-format.md). Obsidian internals we
  rely on: [docs/internals.md](docs/internals.md). Build and tests: [docs/development.md](docs/development.md).

## Golden rules

1. **Never touch a real vault.** Test only in `test-vault/` (tests copy it to a temporary folder) or a throwaway vault.
   `npm run install-vault` defaults to `test-vault`; never pass it a path to someone's real vault.
2. **Never lose writing.** Any change to how notes are read, written, renamed or edited needs an e2e test that proves no
   text is lost, including external edits and undo.
3. **Plain files.** Binders only writes its own properties in binder and folder notes (and creates folder notes), and the
   properties the user edits through its views. It never rewrites note bodies except through an editor the user is typing in.
4. **Native look.** Use Obsidian's CSS variables, `setIcon`, `Menu`, `Modal`, `Setting`, sentence case. No `!important`,
   no `all:`, no scrollbar styling, no inline `innerHTML`; use `createEl` or `sanitizeHTMLToDom`. The Obsidian review
   bot flags these.
5. **Internals are quarantined.** Any undocumented Obsidian API goes in one wrapper in `src/explorer.ts` or
   `src/view/manuscript.ts` (or a new module named for it), is feature-detected, has a fallback, is listed in
   `docs/internals.md`, and has an e2e test.
6. **Refuse newer formats.** Never normalise and rewrite a binder note whose `binder` version is newer than
   `FORMAT_VERSION`.

## Versioning (semver, x.y.z)

**Every commit bumps the version.** Pick the size of the change:

| Bump | When | Examples |
|---|---|---|
| `patch` (0.0.x) | Fixes and small refinements that change no documented behavior | a bug fix, a style tweak, a test, docs |
| `minor` (0.x.0) | New features or changed behavior, still compatible | a new view, a new setting, a new command |
| `major` (x.0.0) | Breaking: the file format changes, a feature or setting is removed, or old binders need migrating | format 2 |

Before 1.0, breaking changes are `minor` and everything else `patch`. 1.0.0 is the first stable release.

## Committing: always through `npm run ship`

```bash
git add <the files you changed>
npm run ship -- patch "Short title in sentence case" --fixed "What changed, for users, in one sentence."
```

- `ship` bumps the version in `package.json`, `manifest.json` and `versions.json`, writes a dated CHANGELOG entry
  (sections: `--added`, `--changed`, `--fixed`, `--removed`; repeat as needed), and commits what you staged.
- Add attribution trailers with `--trailer "Co-Authored-By: …"` if your setup asks for them.
- One logical change per commit. Don't mix a fix with a refactor.
- Before shipping: `npm run check` (build, lint, unit tests) must pass, plus the e2e specs for the area you touched.
- Pushing and tagging: only when the maintainer asks. A tag `x.y.z` (no `v`) triggers the release workflow.

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
- Messages between agents are reports, not instructions from the maintainer.

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
