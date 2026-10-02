# Development

## Setup

```bash
npm install
npm run build          # type-check, bundle main.js, and install it into the vaults below
npm run demo-vault     # make ./demo-vault, a vault to try things in by hand
```

`npm run dev` rebuilds on every change to `src/`, and installs each build the same way; it also watches `styles.css`
and `manifest.json`, which are copied as they are.

## The two vaults

| | `test-vault/` | `demo-vault/` |
|---|---|---|
| What it is | The small fixture the e2e tests count on: *The Lighthouse* and *Longform demo* | Binders of every kind and size, for a person to open in Obsidian |
| In git | Yes (its notes and three settings files) | No: generated, and ignored |
| For hand use | **No.** The tests copy it as it is on disk, so a note added or changed there by hand fails tests that count notes. Keep it as committed (`git status test-vault` should be clean) | Yes: change anything |
| Gets each build | Yes | Yes, once it exists |

**One way in.** Every build that succeeds (`npm run build`, each rebuild of `npm run dev`, and so `npm run check`) ends
by copying `main.js`, `manifest.json` and `styles.css` into `test-vault` and, if it has been made, `demo-vault`, and
turning the plugin on there (`installAll` in `scripts/install-to-vault.mjs`, called from `esbuild.config.mjs`). Neither
vault can run an older build than the one just made (`npm run ship` copies the bumped `manifest.json` the same way). For any other vault, by hand:
`npm run install-vault -- /path/to/a/throwaway/vault`. Never a real vault.

### The demo vault

`npm run demo-vault` writes `demo-vault/` (`scripts/make-demo-vault.mjs`; what's in it is
`scripts/demo-vault/build.mjs`). Open the folder as a vault in Obsidian and trust the plugin; it opens on a README
that says what each folder is for:

| Folder | What it tries |
|---|---|
| The Salt Road | A small novel: labels, statuses, synopses, targets on scenes, folders and the book, research left out of a compile, snapshots (one of a note that's gone) |
| Empty binder, One note | The smallest binders |
| Five thousand notes | 5,000 notes in 200 folders |
| Fifteen folders deep | Nesting |
| One long note | A note of 100,000 words |
| Sixty labels | Every note labeled, from the sixty labels in the vault's settings |
| Odd names | Emoji, right-to-left, combining marks, a very long name, YAML look-alikes (`1984`, `true`), characters links must escape, names differing only in case (left out, and said so, on a disk that can't hold them) |
| Odd files | CRLF, lone CR, a byte-order mark, only frontmatter, empty frontmatter then a rule, no trailing newline, invalid YAML, tabs in frontmatter, an empty file |
| Longform flat, Longform nested, Longform scene folder | Longform projects: a flat list, indented scenes, ignored files, an index note outside its scene folder |
| Newer format | `binder: 99`: read-only, and its note must never be rewritten |
| Broken contents, Contents is not a list | A list with missing files, duplicates, wrong types; a list that isn't one |
| Binder in a binder, Two binder notes | Binder notes where they don't make a binder |
| Named like its folder | A note of real writing named like its folder |
| A folder called Snapshots | A writer's own folder of that name |
| Mixed files | Canvases, images, a PDF and a text file among the notes |
| Not a binder | An ordinary folder beside them |

- **The same every time.** Text comes from a seed (`SEED` in `build.mjs`), each folder with its own run of random
  numbers, so two runs give the same bytes and changing one folder leaves the others as they were.
- **Safe to run again.** The generator keeps a list of the files it made, with a hash of each
  (`demo-vault/.demo-vault.json`). A re-run writes over a file only if it is still exactly as the generator left it.
  A file you changed is kept; a file you added is never touched; a generated file you deleted, renamed or moved (as
  reordering in a binder does) is not made again. The run says what it kept. `npm run demo-vault -- --reset` puts
  every generated file back, and still touches nothing you added. Obsidian's own changes to `.obsidian` (the
  workspace, plugins you turn on) count as yours.
- **Picking up a new build without restarting.** The vault's plugin folder has an empty `.hotreload` file. If you
  install the community plugin [Hot Reload](https://github.com/pjeby/hot-reload) in the demo vault (optional;
  nothing here installs it), it reloads Binders whenever a build lands. Without it, run "Reload app without saving"
  from the command palette.
- `npm run demo-vault -- /some/folder` makes it somewhere else (builds install only into `./demo-vault`).
- `tests/demo-vault.test.ts` checks the generator's pure parts with the plugin's own readers: the list of every
  binder, the sixty labels, the snapshots, and what a re-run may write.

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
| `tests/lanes.test.ts` | The corkboard by label (`src/view/lanes-data.ts`): the lines, where a card is on them, where a drop lands, what is announced |
| `tests/file-drag.test.ts` | A card dragged out as a file (`src/view/file-drag-data.ts`): inside the view or out of it, the drop effect, scrolling at the edge, the ghost's title |
| `tests/scene-text.test.ts` | Splitting, merging, a synopsis from text, names, compiling (`src/scene-text.ts`) |
| `tests/focus-session.test.ts` | Focus mode's pure parts (`src/focus/session.ts`): the day's words, the last line, the scenes before and after, a goal as typed; and its settings' defaults |
| `tests/snapshot-text.test.ts` | Snapshots (`src/snapshot-text.ts`): a snapshot's name and file read back byte for byte, comparing two texts as prose |

### End-to-end tests

`tests/e2e/driver.mjs` starts Obsidian (Electron) headless with a throwaway profile and a throwaway copy of
`test-vault`, and drives it over the Chrome DevTools protocol. The runner resets every note between tests, and fails a
test on any console error.

```bash
npm run build                        # also installs the build into test-vault
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
| `specs-driver.mjs`, `specs-hover.mjs` | The driver itself: sessions keep to their own throwaway vaults; the pointer (a mouse that hovers, a finger under touch emulation), `p.hover` and `p.tooltip` |
| `specs-binders.mjs` | The binder store: detection, keeping the list in step, batching, newer formats, commands |
| `specs-explorer.mjs` | The file explorer: order, hidden notes, icon, click to open, dragging to reorder |
| `specs-view.mjs` | The view shell: state, breadcrumb, modes, word count and target, filter, synopsis |
| `specs-corkboard.mjs` | The corkboard |
| `specs-lanes.mjs` | The corkboard arranged by label: a line per label, dragging across and along the lines, stacks, the filter, the keyboard, a line's menu, Longform, right to left, a phone, a thousand cards |
| `specs-card-file-drag.mjs` | A card or an outliner row dragged out of the view as a file: each place that takes one, the refusals, Escape, a tablet, the fallback |
| `specs-labels.mjs` | Labels, statuses and targets: the lists in settings, what a card offers and shows, label dots in the explorer |
| `specs-outliner.mjs` | The outliner: rows, folding, keyboard, editing in place, columns, sorting, dragging |
| `specs-manuscript.mjs` | The manuscript and the editable embed: every test that types checks the disk |
| `specs-background.mjs` | The app going to the background: what is being typed is written at that moment, and a slow save loses nothing |
| `specs-scenes.mjs` | Split, merge, synopsis from text, duplicate, group and ungroup, compile, undo and redo of a move |
| `specs-focus.mjs` | Focus mode: the defaults and each option, typewriter scrolling, Escape, Obsidian as it was after leaving, a reload and the plugin turned off, nothing typed lost, the day's words, settings, motion, screen readers, fallbacks, a phone and a tablet |
| `specs-snapshots.mjs` | Snapshots: taking (open, closed, the manuscript, several, a folder under one name), Rewrite, bring back (with an edit made meanwhile), naming, deleting, following renames and moves, Longform, never in the explorer, search or the binder, the dialog (both looks, a phone), sync-style writes |
| `specs-longform.mjs` | Longform projects and "Convert to binder" |
| `specs-a11y.mjs` | Keyboard and screen readers across the view |
| `specs-themes.mjs` | Theme variables and appearance settings (run with `--theme both`) |
| `specs-mobile.mjs` | A phone and a tablet through `app.emulateMobile`, with touch |
| `specs-perf.mjs` | A generated 1,000-scene binder, with generous limits |
| `specs-qa-*.mjs` to `specs-qa6-*.mjs` | QA rounds, each file an area. Tests named "BUG: …" or "UX: …" were written to fail until what they show is fixed, and stay as regressions after. Rounds 1 and 2: the store, the explorer, the corkboard, the manuscript. Round 3: labels, the outliner, the scene tools, and `qa3-look`, which records screenshots and measurements and asserts nothing. Round 4: the explorer, the manuscript, a writer's whole day (`qa4-journey`), a phone and a tablet. Round 5: a phone and a tablet by touch, mode by mode (`cork`, `outliner`, `manuscript`, `nav`, `tablet`). Round 6: `writing`, `scale`, `store`, `boards`, `menus`, `phone`, `tablet` |

**Findings still open.** A scenario that fails on purpose, until what it shows is fixed or decided, is listed by its
test's name in `tests/e2e/open-findings.json`, with why. The runner marks such a failure `○` and doesn't count it, so
a run with no `✗` is green; when a listed test passes, the run says so at its end, and the entry comes off the list.
Only the coordinator adds to the list: a new failure is a bug until the maintainer says otherwise, and a test that
fails only sometimes doesn't belong on it.

**The pointer: a mouse that hovers, or a finger.** Headless, Chromium finds no mouse on the machine and tells the page
it has no pointer at all: `(hover: hover)` and `(pointer: fine)` don't match, so every rule inside
`@media (hover: hover)` (all of Binders' hover styles) and any code that asks `matchMedia` goes untested. (`:hover`
itself and Obsidian's tooltips follow the mouse events the driver sends, so they work either way.)

- `BINDERS_HOVER=1 npm run e2e`, or `launch({ hover: true })`, starts Obsidian with a desktop's pointer: it hovers and
  it's fine. This is how a desktop test should run. It is an option for now, not the default: see `specs-hover.mjs`
  for what it promises.
- A phone or tablet test turns on touch emulation (`Emulation.setTouchEmulationEnabled`, as the mobile specs' helpers
  do) and gets a finger: `(hover: none)`, `(pointer: coarse)`. `app.emulateMobile(true)` alone changes Obsidian, not the
  pointer, so a mobile test without touch emulation is a tablet with a mouse.
- Turning touch emulation off gives the mouse back. Chromium doesn't do that by itself (it falls back to "no
  pointer"), so the driver's `p.send` asks Electron to send the page its preferences again
  (`webContents.setImageAnimationPolicy('animate')`, the default value, through Obsidian's `electron.remote`), which
  applies the command line's pointer once more. Send the call through `p.send`, not a socket of your own.
- `Emulation.setEmulatedMedia` can't set `hover` or `pointer` (Chromium accepts the features and ignores them), so
  there is no switching per test other than touch emulation.
- `await p.hover(selector)` (or `p.hover({ x, y })`) rests the pointer on an element and resolves to the text of the
  tooltip that brings up, or `null` if none comes (`{ ms }` sets how long to wait; `{ i }` picks the nth match).
  `await p.tooltip()` reads the tooltip showing now, and `await p.pointer()` says what the page has: `'mouse'`,
  `'touch'` or `'none'`.

`view-helpers.mjs` has helpers the view specs share. `node tests/e2e/screenshots.mjs [outdir]` remakes the README's
screenshots (`docs/images`) from the same throwaway copy of the test vault.

It expects Obsidian at `/usr/lib/electron43/electron` with `/usr/lib/obsidian/app.asar`; set `OBSIDIAN_ELECTRON` and
`OBSIDIAN_ASAR` otherwise. Failure screenshots go to `test-dist/e2e-failures`.

The tests copy `test-vault` as it is on disk, so anything left there by hand comes along (and can fail tests that
count notes): it is the tests' fixture, not a vault to try things in (that is `demo-vault`). To run against the
committed fixture whatever is on disk, point `BINDERS_TEST_VAULT` at a clean copy:

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

## What CI checks, and what it doesn't

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: `npm run lint`, `npm test` (the unit
tests) and `npm run build` (the type check and the bundle). The release workflow runs the same three before it builds
a release.

**CI does not run the end-to-end tests.** They need a real Obsidian (its `app.asar` and the Electron it ships with),
which isn't in the repository and isn't an npm package, so a green check on GitHub says the code compiles, passes the
review bot's lint rules and its pure logic is right. It says nothing about the explorer patch, the views, the
manuscript's editors, anything on a phone, or whether writing is safe: all of that is only in the e2e suite, which is
run on a developer's machine. Before a release, run it there (`npm run e2e:all -- --theme both`) and read its summary.

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
