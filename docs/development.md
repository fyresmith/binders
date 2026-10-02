# Development

## Setup

```bash
npm install
npm run build          # type-check and bundle main.js
npm run install-vault  # copy the build into ./test-vault and turn it on
```

Open `test-vault` in Obsidian to try it: it holds a sample binder, *The Lighthouse*, and a Longform project,
*Longform demo*. `npm run dev` rebuilds on every
change (reload Obsidian, or use the Hot Reload plugin, to pick it up).

## Checks

| Command | What it does |
|---|---|
| `npm run check` | Build, lint (the same rules as Obsidian's review bot) and unit tests |
| `npm test` | Unit tests only: bundles each `tests/*.test.ts` for Node and runs it |
| `npm run e2e` | End-to-end tests in real, headless Obsidian |

### Unit tests

Pure code only (no Obsidian): each file is bundled with a stand-in for the `obsidian` module (`tests/obsidian-stub.ts`)
and run in Node. `tests/harness.ts` has the `test` and assertion helpers.

| File | Covers |
|---|---|
| `tests/model.test.ts`, `tests/qa-model.test.ts` | The binder index (`src/model.ts`): reading `contents`, ordering, renames, moves, batches of changes |
| `tests/longform.test.ts` | Longform projects (`src/longform.ts`): reading and writing `longform.scenes`, groups, conversion |
| `tests/view.test.ts` | Word counts (`src/view/words.ts`), labels and statuses (`src/view/labels.ts`), settings as saved (`src/settings-data.ts`) |
| `tests/outliner.test.ts` | The outliner's columns, sorting, targets and typed values (`src/view/outliner-data.ts`) |
| `tests/scene-text.test.ts` | Splitting, merging, a synopsis from text, names, compiling (`src/scene-text.ts`) |
| `tests/focus-session.test.ts` | Focus mode's pure parts (`src/focus/session.ts`): the day's words, the last line, the scenes before and after, a goal as typed; and its settings' defaults |
| `tests/snapshot-text.test.ts` | Snapshots (`src/snapshot-text.ts`): a snapshot's name and file read back byte for byte, comparing two texts as prose |

### End-to-end tests

`tests/e2e/driver.mjs` starts Obsidian (Electron) headless with a throwaway profile and a throwaway copy of
`test-vault`, and drives it over the Chrome DevTools protocol. The runner resets every note between tests, and fails a
test on any console error.

```bash
npm run build && npm run install-vault
npm run e2e -- --theme both          # light and dark
npm run e2e -- --grep explorer       # tests whose name matches
npm run e2e -- --repeat 3            # flakiness check
npm run e2e -- --specs tests/e2e/specs-corkboard.mjs,tests/e2e/specs-outliner.mjs
npm run e2e -- --shots /tmp/shots    # where failure screenshots go
```

Without `--specs`, every `tests/e2e/specs*.mjs` runs:

| File | Area |
|---|---|
| `specs.mjs` | Smoke tests: the plugin loads, the settings tab |
| `specs-binders.mjs` | The binder store: detection, keeping the list in step, batching, newer formats, commands |
| `specs-explorer.mjs` | The file explorer: order, hidden notes, icon, click to open, dragging to reorder |
| `specs-view.mjs` | The view shell: state, breadcrumb, modes, word count and target, filter, synopsis |
| `specs-corkboard.mjs` | The corkboard |
| `specs-outliner.mjs` | The outliner: rows, folding, keyboard, editing in place, columns, sorting, dragging |
| `specs-manuscript.mjs` | The manuscript and the editable embed: every test that types checks the disk |
| `specs-scenes.mjs` | Split, merge, synopsis from text, duplicate, group and ungroup, compile, undo and redo of a move |
| `specs-focus.mjs` | Focus mode: the defaults and each option, typewriter scrolling, Escape, Obsidian as it was after leaving, a reload and the plugin turned off, nothing typed lost, the day's words, settings, motion, screen readers, fallbacks, a phone and a tablet |
| `specs-snapshots.mjs` | Snapshots: taking (open, closed, the manuscript, several, a folder under one name), Rewrite, bring back (with an edit made meanwhile), naming, deleting, following renames and moves, Longform, never in the explorer, search or the binder, the dialog (both looks, a phone), sync-style writes |
| `specs-longform.mjs` | Longform projects and "Convert to binder" |
| `specs-a11y.mjs` | Keyboard and screen readers across the view |
| `specs-themes.mjs` | Theme variables and appearance settings (run with `--theme both`) |
| `specs-mobile.mjs` | A phone and a tablet through `app.emulateMobile`, with touch |
| `specs-perf.mjs` | A generated 1,000-scene binder, with generous limits |
| `specs-qa-*.mjs`, `specs-qa2-*.mjs` | QA rounds (store, explorer, corkboard, manuscript). Tests named "BUG: …" or "UX: …" were written to fail until what they show is fixed, and stay as regressions after |

**Findings still open.** A scenario that fails on purpose, until what it shows is fixed or decided, is listed by its
test's name in `tests/e2e/open-findings.json`, with why. The runner marks such a failure `○` and doesn't count it, so
a run with no `✗` is green; when a listed test passes, the run says so at its end, and the entry comes off the list.
Only the coordinator adds to the list: a new failure is a bug until the maintainer says otherwise, and a test that
fails only sometimes doesn't belong on it.

`view-helpers.mjs` has helpers the view specs share. `node tests/e2e/screenshots.mjs [outdir]` remakes the README's
screenshots (`docs/images`) from the same throwaway copy of the test vault.

It expects Obsidian at `/usr/lib/electron43/electron` with `/usr/lib/obsidian/app.asar`; set `OBSIDIAN_ELECTRON` and
`OBSIDIAN_ASAR` otherwise. Failure screenshots go to `test-dist/e2e-failures`.

The tests copy `test-vault` as it is on disk, so notes you made there by hand come along (and can fail tests that
count them). To run against a clean copy while you keep using `test-vault`, point `BINDERS_TEST_VAULT` at one:

```bash
git checkout-index -a --prefix=/tmp/binders-clean/        # the committed test vault, untouched
npm run install-vault -- /tmp/binders-clean/test-vault
BINDERS_TEST_VAULT=/tmp/binders-clean/test-vault npm run e2e
```

### Checking the look against Obsidian itself

"Native" is checked, not guessed: Obsidian's own stylesheet and code are in `obsidian.asar`, next to `app.asar`.

```bash
npx @electron/asar extract-file /usr/lib/obsidian/obsidian.asar app.css   # every rule and variable Obsidian ships
npx @electron/asar extract-file /usr/lib/obsidian/obsidian.asar app.js    # how it drags, reorders, builds menus
```

The binder view is modelled on a base's cards view (toolbar, cards, group headings) and the outliner on a base's
table; card drags on Obsidian's `drag-reorder-ghost` reordering, row drags on the file explorer's `drag-ghost`, and
the insertion lines on its `drop-indicator`. When one of those changes
in a new Obsidian, compare again: make a `.base` file with a cards view in the test vault and put the two side by side.

Each spec file exports `specs`, a list of `{ name, fn(p, h, t) }`: `p` drives Obsidian (`p.ev`, `p.click`, `p.dbl`,
`p.key`, `p.drag`, `p.at`, `p.shot`…), `h` has helpers (`h.open`, `h.run`), `t` asserts (`t.ok`, `t.eq`). Input is
real: `p.dbl` is a double-click the page sees as one, and `p.key('Enter')` types a new line where a real key would.

Before each test the runner closes every tab, restores the test notes, deletes what tests made, puts every setting back
to its default, removes the saved mobile layout, clears notices and focuses the main window, so tests don't depend on
their order.

## Versions and commits

Every commit goes through `npm run ship`, which bumps the version and writes the CHANGELOG. See [AGENTS.md](../AGENTS.md).

## Releasing

1. Make sure `main` is green (`npm run check`, e2e) and pushed.
2. Tag the version: `git tag x.y.z && git push origin x.y.z` (no `v`; it must match `manifest.json`).
3. The **Release** workflow checks and builds the plugin, attests `main.js`, `manifest.json` and `styles.css`, and
   publishes a release whose notes are the CHANGELOG since the previous tag. `0.x` tags become draft pre-releases;
   `1.x` and later are published as the latest release.

## Submitting to the community plugin directory

See <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>: a public repository with `README.md`, `LICENSE`
and `manifest.json`, a release with the three files attached, then add the plugin at <https://community.obsidian.md>.
