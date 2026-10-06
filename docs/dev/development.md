# Development

How the code is laid out is in [architecture.md](architecture.md); the rules everyone works to are in
[AGENTS.md](../../AGENTS.md).

## Setup

You need Node 20 or newer (CI uses 20) and npm. Building, linting and the unit tests run anywhere Node does. The
end-to-end tests need an installed Obsidian as well, and look for it where Linux packages put it; see
[End-to-end tests](#end-to-end-tests) for other systems.

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
| What it is | The small fixture the e2e tests count on: *The Lighthouse* and *Longform demo* | Example books and stress binders, for a person to open in Obsidian |
| In git | Yes (its notes and three settings files) | No: generated, and ignored |
| For hand use | **No.** The tests copy it as it is on disk, so a note added or changed there by hand fails tests that count notes. Keep it as committed (`git status test-vault` should be clean) | Yes: change anything |
| Gets each build | Yes | Yes, once it exists |

**One way in.** Every build that succeeds (`npm run build`, each rebuild of `npm run dev`, and so `npm run check`) ends
by copying `main.js`, `manifest.json` and `styles.css` into `test-vault` and, if it has been made, `demo-vault`, and
turning the plugin on there (`installAll` in `scripts/install-to-vault.mjs`, called from `esbuild.config.mjs`). Neither
vault can run an older build than the one just made (`npm run ship` copies the bumped `manifest.json` the same way). For any other vault, by hand:
`npm run install-vault -- /path/to/a/throwaway/vault`. Never a real vault.

**Opening either vault by hand.** Obsidian starts a vault it hasn't seen in Restricted mode, with community plugins
off: answer "Trust author and enable plugins" when it asks (or turn Restricted mode off under Settings → Community
plugins), or Binders won't load. The tests answer for themselves.

### The demo vault

`npm run demo-vault` writes `demo-vault/` (`scripts/make-demo-vault.mjs`; what's in it is
`scripts/demo-vault/`). Open the folder as a vault in Obsidian and trust the plugin; it opens on a README
that says what each folder is for, and what to try in it. Two folders at the top:

**`Examples/`: books as a writer would have them** (about 215,000 words in all). Between them they have everything
a real manuscript throws at Binders, and each of the four structures export can guess.

| Folder | What it is |
|---|---|
| Low Water at Corran | A full-length novel, about 93,000 words: three parts, thirty chapters (folders), ninety-odd scenes, a prologue and an epilogue, front and back matter; a synopsis, a point of view (label and `pov`), a status and a target on every scene, `notes` on some, three scenes left out of export |
| Corran story bible | Not a binder: the novel's people, places and timeline beside it, linked from its scenes |
| Twelve Hives | A novella with chapters only: twelve folders named "One" to "Twelve", scenes in each; first person, typed with curly quotes |
| Kettleby Junction | A novel that is one flat list of 36 notes, every paragraph begun with a tab, with italics and links on those lines |
| Nine Kinds of Weather | A story collection, each story a different shape (a note, a folder of scenes, numbered sections, flash fiction, a folder in a folder, fragments, all talk, an epigraph and a footnote, only a card); `structure` set by hand |
| The Kitchen Table Press | A handbook: parts and chapters, front and back matter in folders of those names, headings, footnotes of every kind, tables, lists, quotations, callouts, four drawn figures, links, a bibliography |
| The Varga Job | A draft in progress: mixed statuses, empty scenes, a one-paragraph scene, comments and notes to self, targets missed, repeated names, `export-as` on five items, cut scenes, an unlisted note, six snapshots |
| Die Uhr von Sankt Veit, Le Bac de minuit | Short books in German and French (`language: de`, `fr`), for export's quotes |
| Other Alphabets | Hebrew, Arabic, Chinese, Japanese, Korean, Greek, Russian, emoji, accents, dashes and dots, verse with line breaks, a chapter of letters |
| The Cartographer's Winter | A Longform project that is a real book: fourteen scenes, two nested, an ignored file, a snapshot |
| What Markdown becomes | A scene for each row of that table in `docs/dev/export.md`, each synopsis saying what an export should do with it |

The examples' prose is composed, not typed: `scripts/demo-vault/prose.mjs` puts paragraphs together (dialogue with
its attributions, description, long and short paragraphs, a thought in italics, scene breaks) from sentences and
half-sentences written for the purpose in `scripts/demo-vault/stock/` (shared English stock, and each book's own
people, places, things and sentences). It reads like a draft when skimmed and means nothing. What has to be
particular is written by hand in each book's module in `scripts/demo-vault/examples/`: every synopsis, the
openings, the handbook's tables and notes, the other languages, the Markdown rows. The handbook's figures are drawn
by `png.mjs`. `node scripts/demo-vault/stats.mjs` prints each book's size (`stats.mjs repeats`: how often its
commonest sentences come round), and `node scripts/demo-vault/sample.mjs` a page of prose, for whoever adds stock.

**`Stress tests/`: binders that are too big, too deep, oddly named or wrong on purpose.** Their text is filler.

| Folder | What it tries |
|---|---|
| The Salt Road | A small novel: labels, statuses, synopses, targets on scenes, folders and the book, research left out of an export, snapshots (one of a note that's gone) |
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

- **The same every time.** Text comes from a seed (`SEED` in `core.mjs`), each folder with its own run of random
  numbers, so two runs give the same bytes and changing one folder leaves the others as they were. A run takes
  about 0.4 seconds (5,700 files, 26 MB; 0.2 seconds before the examples).
- **Adding an example.** A module in `scripts/demo-vault/examples/` with a `make(add, rand)` that adds the book's
  files (`shape.mjs` writes a binder from a tree of notes and folders), and an entry in `examples/index.mjs` with
  what it is and what to try: the README and the tests take it from there. A line that says "about N words" is
  held to it by the tests.
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
  binder, the sixty labels, the snapshots, and what a re-run may write. `tests/demo-examples.test.ts` holds each
  example to what its line claims: that it is a valid binder, its parts, chapters and scenes as export builds them,
  its footnotes, tables and pictures, its tab-led lines, its words, that every link leads to one note, and that a
  second run changes nothing.

## Checks

| Command | What it does |
|---|---|
| `npm run check` | Build, lint (the same rules as Obsidian's review bot) and unit tests |
| `npm test` | Unit tests only: bundles each `tests/*.test.ts` for Node and runs it |
| `npm run e2e` | End-to-end tests in real, headless Obsidian |
| `npm run e2e:all` | The same, shared out over several Obsidians at once (`--jobs`) |

### Unit tests

Pure code only (no Obsidian): each file is bundled with a stand-in for the `obsidian` module (`tests/obsidian-stub.ts`)
and run in Node. `tests/harness.ts` has the `test` and assertion helpers.

```bash
npm test                 # every tests/*.test.ts
npm test -- lanes        # only the files whose name has "lanes" in it (several words: any of them)
```

| File | Covers |
|---|---|
| `tests/model.test.ts`, `tests/qa-model.test.ts` | The binder index (`src/model.ts`): reading `contents`, ordering, renames, moves, batches of changes |
| `tests/longform.test.ts` | Longform projects (`src/longform.ts`): reading and writing `longform.scenes`, groups, conversion |
| `tests/view.test.ts` | Word counts (`src/view/words.ts`), labels and statuses (`src/view/labels.ts`), settings as saved (`src/settings-data.ts`) |
| `tests/book-words.test.ts` | Word counts that agree with the book (`src/view/book-words.ts`): each kind of content, the light reader against export's parser (the demo vault's notes, notes made at random), the views' totals against `bookWords` for every demo binder and every row of "What Markdown becomes", the day's words across a change of the setting |
| `tests/outliner.test.ts` | The outliner's columns, sorting, targets and typed values (`src/view/outliner-data.ts`) |
| `tests/lanes.test.ts` | The corkboard by label (`src/view/lanes-data.ts`): the lines, where a card is on them, where a drop lands, what is announced |
| `tests/file-drag.test.ts` | A card dragged out as a file (`src/view/file-drag-data.ts`): inside the view or out of it, the drop effect, scrolling at the edge, the ghost's title |
| `tests/run-all.test.ts` | The parallel e2e runner's pure parts (`tests/e2e/run-all-lib.mjs`): sharing spec files out over jobs, reading a job's output; and the driver's `reap`, with stand-in processes |
| `tests/demo-vault.test.ts` | The demo vault's generator (`scripts/demo-vault/build.mjs`), read back with the plugin's own readers: every binder, the labels, the snapshots, what a re-run may write |
| `tests/demo-examples.test.ts` | The demo vault's example books, each built into a book by export's own code: valid binders, the structure guessed, parts, chapters and scenes counted, footnotes, tables and pictures, tab-led lines, words, links |
| `tests/scene-text.test.ts` | Splitting, merging, a synopsis from text, names, a binder's text as one note (`src/scene-text.ts`) |
| `tests/export-model.test.ts` | Export's book model (`src/export/`): every row of "What Markdown becomes" (`markdown.ts`), quotes and dashes (`typography.ts`), roles from structure, titles and numbers (`roles.ts`), the book put together with its footnotes, embeds and warnings (`book.ts`), a picture's size (`picture.ts`) |
| `tests/export-docx.test.ts` | The Word writer (`src/export/docx.ts`, `docx-parts.ts`): the shape of a manuscript, the three styles, and the word-for-word test (below) |
| `tests/export-scriv.test.ts`, `export-scriv-words.test.ts` | The Scrivener project's writer (`src/export/scriv/`): the shape of a project piece by piece; and its word-for-word test with the structural checks (below) |
| `tests/tap-text.test.ts` | Where a tap on a manuscript section's rendered text is in the note (`src/view/tap-text.ts`): plain prose, repeated words, bold, links, headings, lists, quotes, line breaks |
| `tests/focus-session.test.ts` | Focus mode's pure parts (`src/focus/session.ts`): the day's words, the last line, the scenes before and after, a goal as typed; and its settings' defaults |
| `tests/paragraphs.test.ts` | Paragraphs (`src/paragraphs/text.ts`, `mode.ts`): which lines are paragraphs begun with a tab, the text made ready for a renderer, whether a link meant a renamed file, links repointed byte for byte, Obsidian's Markdown mode wrapped (with a stand-in) and refused when it isn't the one known; the two settings |
| `tests/snapshot-text.test.ts` | Snapshots (`src/snapshot-text.ts`): a snapshot's name and file read back byte for byte, comparing two texts as prose |

### The word-for-word test

Golden rule 2 has a cousin in export: **an export never drops, repeats or reorders a word.** `tests/export-docx.test.ts`
holds the Word writer to it. Two readers that share no code are compared: `readDocx` (`tests/export-words.ts`) reads the
words back out of the file, and `sourceWords` reads the words that went in straight from the notes' Markdown, with a
few patterns of its own (not the parser export uses). A word is a run of letters and digits, so typeset quotes and
dashes are no difference. The text and the footnotes are each compared in order. It runs on:

- one note that has every row of the table "What Markdown becomes" in `docs/dev/export.md`;
- the test vault's binder, read from disk (`tests/export-vault.ts` reads a vault held in memory as binders);
- every binder of the demo vault, made in memory by its generator (27, about 710,000 words: the example books, and among the stress binders
  a note of 100,000 words, 5,000 notes, fifteen folders deep, odd names and odd files);
- a generated binder of 150,000 words, which must be read and written in under ten seconds;
- and the test itself is tested: a paragraph taken out, or two sections changing places, must be noticed.

Every file made is also checked as a package (`sound`: each part has a content type, each relationship leads
somewhere, each style, footnote and list used is defined, the XML is well formed and has no character XML can't hold).
Where they are installed, two outside readers run on the test vault's manuscript, as dev-time tools only: `xmllint`
on every part, and LibreOffice (`soffice --headless --convert-to pdf`), which must open the file and make a PDF of it
(about ten seconds; `BINDERS_NO_SOFFICE=1` skips it). Without them the run says so and goes on. The files are left in
`test-dist/export-docx/` to look at. Not run here: Microsoft's Open XML validator, and Word itself.

`tests/export-epub.test.ts` holds the ebook to the same: the words read back out of the `.epub` (by
`tests/export-epub-read.ts`, which goes as a reading app goes: the container, the package's reading order, a file at
a time, with patterns of its own and none of the writer's code) are the words that went in, for the same four
sources, front and back matter included; the pages Binders makes are no words of the writer's and are left out.
Each file is checked as an EPUB (`sound`: `mimetype` first, stored and bare; every file in the manifest and every
manifest entry a file; every link and footnote leading somewhere; no id twice; well-formed text).

**EPUBCheck**, the validator every ebook store names, runs on every EPUB those tests make (the samples, the test
vault, each binder of the demo vault, the 150,000-word book) and on the files `specs-export.mjs` exports. It is a
dev-time tool only, never part of the plugin, and it needs Java:

```bash
npm run get-epubcheck      # once: EPUBCheck, and a Java runtime if the computer has none (about 60 MB together)
```

It is unpacked outside the repository, into `~/.cache/binders-tools` (or the folder `BINDERS_TOOLS` names), so every
worktree finds it. **Without it the tests still pass, and say in capitals that EPUBCheck was not run**: an ebook
change isn't verified until it has been. With it, `npm test -- export-epub` takes about a minute and a half longer
(a Java starts for each file, four at a time; the two largest demo binders take most of it):
`BINDERS_EPUBCHECK=some` checks one demo binder in four, `BINDERS_NO_EPUBCHECK=1` none. The files are left in
`test-dist/export-epub/` to open in a reading app.

`specs-export.mjs` repeats the word-for-word check end to end, on the file a real Obsidian wrote to the disk.

**The Scrivener project** is held to the same rule document by document (`tests/export-scriv-words.test.ts`): for
every note and folder note, the words read back out of its RTF file equal the words of its Markdown, and the tree in
the `.scrivx` is the binder in its order. The two readers are the test's own (`tests/export-scriv-words.ts`: a small
RTF text reader, and a few patterns over the Markdown) and share nothing with the writer. Every project made on the
way gets the structural checks of the format spike's `check-scriv.mjs` (`checkProject` in
`tests/export-scriv-tools.ts`): every XML file parses; one Draft, one Research, one Trash; no id twice; every folder
of files belongs to an item of the tree; every label, status, keyword, custom field, section type and link leads to
something that exists; the RTF is balanced and ASCII. Where LibreOffice is installed it reads the sample projects'
RTF files too and must see the same words in the same order as the test's reader (`BINDERS_NO_SOFFICE=1` skips it,
and the run says in capitals that it did). `BINDERS_SCRIV_SAMPLES=<folder> npm test -- export-scriv-words` writes
the sample projects there, zipped, for a real Scrivener to open: nothing here can stand in for that.
`specs-export-scriv.mjs` is the kind end to end: the folder on the disk, a project opened since, the fallback.

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
npm run e2e -- --hover               # with a mouse that hovers (below)
```

Without `--specs`, every `tests/e2e/specs*.mjs` runs:

| File | Area |
|---|---|
| `specs.mjs` | Smoke tests: the plugin loads, the settings tab |
| `specs-driver.mjs`, `specs-hover.mjs` | The driver itself: sessions keep to their own throwaway vaults; the pointer (a mouse that hovers, a finger under touch emulation), `p.hover` and `p.tooltip` |
| `specs-readme.mjs` | What the README tells a writer, sentence by sentence: the keyboard lists of the three views, what Binders writes and never touches, undo, export, known limitations and troubleshooting |
| `specs-binders.mjs` | The binder store: detection, keeping the list in step, batching, newer formats, commands |
| `specs-explorer.mjs` | The file explorer: order, hidden notes, icon, click to open, dragging to reorder |
| `specs-view.mjs` | The view shell: state, breadcrumb, modes, word count and target, filter, synopsis |
| `specs-word-counts.mjs` | Word counts that agree with the book: a note with comments, links and code on a card, a stack, the toolbar, the outliner, a target, the inspector, Contents and focus mode, and in the export window; the setting off (as the status bar counts); a chapter's title; an embedded note; the day's words across a change of the setting |
| `specs-corkboard.mjs` | The corkboard |
| `specs-lanes.mjs` | The corkboard arranged by label: a line per label, dragging across and along the lines, stacks, the filter, the keyboard, a line's menu, Longform, right to left, a phone, a thousand cards |
| `specs-card-file-drag.mjs` | A card or an outliner row dragged out of the view as a file: each place that takes one, the refusals, Escape, a tablet, the fallback |
| `specs-labels.mjs` | Labels, statuses and targets: the lists in settings, what a card offers and shows, label dots in the explorer |
| `specs-outliner.mjs` | The outliner: rows, folding, keyboard, editing in place, columns, sorting, dragging |
| `specs-manuscript.mjs` | The manuscript and the editable embed: every test that types checks the disk |
| `specs-background.mjs` | The app going to the background: what is being typed is written at that moment, and a slow save loses nothing |
| `specs-scenes.mjs` | Split, merge, synopsis from text, duplicate, group and ungroup, export as one note, undo and redo of a move |
| `specs-export.mjs` | Export: the window (the kinds, the choices, the text on paper, Contents), a manuscript through the save dialog to a Word file read back word for word, remembered places, a dialog cancelled and a place that can't be written, the fallback into the vault, roles and what is left out, warnings, an outside edit, one note, the keyboard and screen readers, 150,000 words in time, a phone and a tablet |
| `specs-focus.mjs` | Focus mode: the defaults and each option, typewriter scrolling, Escape, Obsidian as it was after leaving, a reload and the plugin turned off, nothing typed lost, the day's words, settings, motion, screen readers, fallbacks, a phone and a tablet |
| `specs-inspector.mjs` | The inspector and the contents: what they follow in each mode; every edit against the file; nothing typed lost (the cursor moved, another item, a refused save, the note edited, renamed, moved or deleted under an open field, the view or the plugin closed, the page hidden, a quit, a card's field and the pane's on one synopsis); a read-only binder; notes, their column and merge; snapshots; both tabs put in the sidebar with a binder (once, unopened, back after being closed, not with the setting off, at startup); the contents' order, mark, clicks, folding, keys, Longform indents, rows kept; a phone and a tablet |
| `specs-snapshots.mjs` | Snapshots: taking (open, closed, the manuscript, several, a folder under one name), Rewrite, bring back (with an edit made meanwhile), naming, deleting, following renames and moves, Longform, never in the explorer, search or the binder, the dialog (both looks, a phone), sync-style writes |
| `specs-paragraphs.mjs` | Paragraphs: a line begun with a tab as a paragraph in live preview, source mode, the manuscript, reading view, an embed, the snapshots dialog and focus mode; the fallback; a note outside a binder; the switch; typing, undo and outside edits on disk; "Indent paragraphs"; links in tab paragraphs following a rename (every kind of link, the settings, ambiguity, folders, unsaved typing, line endings) |
| `specs-longform.mjs` | Longform projects and "Convert to binder" |
| `specs-a11y.mjs` | Keyboard and screen readers across the view |
| `specs-themes.mjs` | Theme variables and appearance settings (run with `--theme both`) |
| `specs-mobile.mjs` | A phone and a tablet through `app.emulateMobile`, with touch |
| `specs-perf.mjs` | A generated 1,000-scene binder, with generous limits |
| `specs-qa-*.mjs` to `specs-qa6-*.mjs` | QA rounds, each file an area. Tests named "BUG: …" or "UX: …" were written to fail until what they show is fixed, and stay as regressions after. Rounds 1 and 2: the store, the explorer, the corkboard, the manuscript. Round 3: labels, the outliner, the scene tools, and `qa3-look`, which records screenshots and measurements and asserts nothing. Round 4: the explorer, the manuscript, a writer's whole day (`qa4-journey`), a phone and a tablet. Round 5: a phone and a tablet by touch, mode by mode (`cork`, `outliner`, `manuscript`, `nav`, `tablet`). Round 6: `writing`, `scale`, `store`, `boards`, `menus`, `phone`, `tablet`, `features` (eight files, `specs-qa6-*.mjs`) |

**The whole suite, in several Obsidians at once.** In one Obsidian the suite takes hours.
`tests/e2e/run-all.mjs` shares the spec files out over several, each job a `run.mjs` of its own.

**Run it from a checkout that won't move:** a worktree or a clone at one commit, built there, and left alone until the
run has ended (not the folder work is being merged into). Each job reads the spec files as it starts, each Obsidian
takes the built plugin as it is launched, and each retry reads the spec files again: a run over a checkout that
changes is a run of several versions. The runner writes down the commit, the scripts and spec files it runs and the
built plugin when it starts, and looks again when the jobs are done: if anything differs it says "THE CHECKOUT MOVED
DURING THE RUN" with what changed, retries nothing, and fails the run. The summary's first line has the commit.

```bash
npm run e2e:all -- --jobs 6 --theme both      # six Obsidians, light then dark in each
npm run e2e:all -- --jobs 6 --retry-alone     # then each failure again by itself
npm run e2e:all -- --jobs 3 --hover --out /tmp/e2e   # a hovering mouse; logs somewhere else
```

- **Sharing out.** Every spec file is imported and its tests counted (with `--grep`, those that match), and the files
  go heaviest first into the lightest job. After a whole run has finished, what each file took is kept in
  `timings.json` beside the logs, and the next run weighs files by that instead: a file of forty slow phone tests is
  not a file of forty quick ones.
- **Logs.** `--out` (default `test-dist/e2e-all`) gets `job-1.log`, `job-2.log`… (each job's `run.mjs` output, as it
  comes), `shots/` (failure screenshots), `summary.txt` and `results.json` (every result: name, theme, mark, message,
  time, job, file). Failures are printed as they happen, and a count every two minutes.
- **The summary** at the end is one for all jobs: passed, failed, open findings; each failure with its file, job and
  message; tests that didn't run because a job stopped early; and "Listed as open, and passing".
- **Exit code.** 1 for a failure that isn't in `open-findings.json`, or a job that stopped early; 0 otherwise (130
  after Ctrl-C).
- **`--retry-alone`.** Tests that time frames or race typing can fail from load alone. With this, once every job is
  done, each failure runs again by itself with nothing else running, and the summary sorts them into "Fails alone too"
  and "Passed alone (load)". Then only the first kind fails the run.
- **Ctrl-C** stops every job; each closes its Obsidian and removes its throwaway folder (the driver does that for
  any runner that is interrupted or killed, `run.mjs` alone too), and the summary of what had run is printed.
- **A test that never ends** (a call the page doesn't answer, a wait for something that doesn't come) fails after
  its time limit with "timed out: the test did not finish in 600 s". Its Obsidian is closed and another started
  for the tests that are left, as below; the failure's screenshot is taken first if the page still answers within
  ten seconds. The limit is ten minutes (the slowest honest test takes a little over two with six Obsidians
  running); `--timeout 1200` sets it in seconds for a run, and a test that needs longer says so itself:
  `{ name, fn, timeout: 1200000 }` (ms) in its spec file, which wins over the flag. Before this, one stuck call held a
  job for two hours and 402 tests never ran.
- **An Obsidian that ends under a test** (a crash, or the machine out of memory: with many running at once it
  happens) fails that test with "Obsidian is gone", and `run.mjs` starts another for the tests that are left; the
  log says "Obsidian ended: starting another". After four in a row it stops, and the job counts as stopped early.
- **`--reap`**, for what Ctrl-C can't cover: a runner killed outright (`kill -9`, the machine out of memory) or
  started detached and forgotten leaves its Obsidians running. Every Obsidian the driver starts, its throwaway folder
  and the runner that started it are written down, a line each, in `started.jsonl` in the run's screenshots folder.
  `npm run e2e:all -- --reap` (with the same `--out`) ends exactly those, removes their folders and the list, and
  stops; `--reap --shots dir` does it for a run made with `npm run e2e` alone (its default folder is
  `test-dist/e2e-failures`). Each process is checked against its command line first, so a process id that has since
  gone to something else is left alone, and nothing is ever killed by name. It ends a run that is still going, too.
- `--jobs` is how many Obsidians the machine can take without the tests slowing each other into failures: about one
  per two cores, fewer if anything else is running. `--theme`, `--grep`, `--repeat` and `--specs` mean what they do for
  `npm run e2e`; `BINDERS_TEST_VAULT` is passed on.

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
pictures (`docs/images`: `corkboard`, `explorer`, `arrange-by-label`, `outliner`, `manuscript`, `snapshots`,
`focus-mode`, `mobile`) from a throwaway copy of the test vault, which it first fills out a little (storylines as
labels, a third part, a longer scene). Look at each picture after remaking them, and at the README beside them.

**Where Obsidian is.** The driver runs Obsidian's `app.asar` with the Electron it ships with, and looks for them where
the Arch Linux package puts them: `/usr/lib/electron43/electron` and `/usr/lib/obsidian/app.asar`. Anywhere else
(another distribution, macOS, Windows), set `OBSIDIAN_ELECTRON` to the Electron binary and `OBSIDIAN_ASAR` to the
`app.asar` of your installation; only Linux has been tried. Without an Obsidian, `npm run check` and the unit tests
are what you can run. Failure screenshots go to `test-dist/e2e-failures`.

**Another Obsidian: the oldest one the manifest allows.** The same two variables point the tests at any build, so
`minAppVersion` in `manifest.json` (1.13.4) can be run and not only read. Each installer in Obsidian's releases
(github.com/obsidianmd/obsidian-releases) carries its own Electron, and an AppImage unpacks without installing:

```bash
mkdir -p ~/.cache/binders-e2e && cd ~/.cache/binders-e2e
curl -LO https://github.com/obsidianmd/obsidian-releases/releases/download/v1.13.4/Obsidian-1.13.4.AppImage
chmod +x Obsidian-1.13.4.AppImage && ./Obsidian-1.13.4.AppImage --appimage-extract && mv squashfs-root obsidian-1.13.4
cd -   # back to the project
OBSIDIAN_ELECTRON=~/.cache/binders-e2e/obsidian-1.13.4/obsidian \
  OBSIDIAN_ASAR=~/.cache/binders-e2e/obsidian-1.13.4/resources/app.asar \
  npm run e2e:all -- --jobs 3 --retry-alone --out /tmp/e2e-1.13.4
```

- **Why 1.13.4 and not 1.13.0.** The API Binders needs (the settings tab's definitions) begins at 1.13.0, but
  Obsidian's public releases have no installer for 1.13.0 to 1.13.3 (the releases go from 1.12.7 to 1.13.4), so
  1.13.4 is the oldest 1.13 that can be run, and the floor is a build that has been (the maintainer's choice,
  2026-10-05).
- Unpack it on a disk, not in `/tmp` where that is kept in memory: a build is about 340 MB.
- Use the installer, not the `obsidian-x.y.z.asar.gz` beside it: that file is only the app's own code, and an old one
  run in a newer Electron is a pairing nobody has. (Obsidian's shell also loads the newest `obsidian-*.asar` it finds
  in its profile over the one it shipped with: the driver's profile is new for every launch, so what the installer
  shipped is what runs.)
- Every launch says what it is, as the page reports it: `Obsidian 1.13.4, Electron 43.1.1` is the first line of a
  `run.mjs` log, and `e2e:all` puts it in its summary. Check that line before believing a run was of the old version.
- The old build runs with a profile and a vault of its own like any other, and never sees the Obsidian installed on
  the machine.
- An Obsidian that doesn't close when asked (1.8.7 did this, headless: it ended its windows and stayed) is ended by
  the driver two seconds later, so no launch leaves a process behind.
- What has been run on 1.13.4 (2026-10-05, light): the smoke tests, the driver's, the explorer's and the settings
  tests of `specs-qa6-menus`, 33 tests, all passing. Not the whole suite.
- Why the floor is 1.13 and not lower: until that day it was 1.8.7, which had never been run. Run, it passed 109 of
  118 tests of the explorer, the manuscript, the card file drag and focus mode; its settings tab (drawn by hand
  before 1.13) lacked two things, focus mode on a phone didn't give the header back, and two tablet tests ended
  Obsidian. The maintainer raised the floor instead of carrying a second, untested path.
- When `minAppVersion` changes, change it in `manifest.json` only: `version-bump.mjs` writes it into `versions.json`
  for the next version `ship` makes, and the versions already there keep the floor they were made with.

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

(`npx` downloads `@electron/asar` from npm the first time: it isn't one of the project's dependencies.)

```bash
npx @electron/asar extract-file /usr/lib/obsidian/obsidian.asar app.css   # every rule and variable Obsidian ships
npx @electron/asar extract-file /usr/lib/obsidian/obsidian.asar app.js    # how it drags, reorders, builds menus
```

The binder view is modelled on a base's cards view (toolbar, cards, group headings) and the outliner on a base's
table; card drags on Obsidian's `drag-reorder-ghost` reordering, row drags on the file explorer's `drag-ghost`, and
the insertion lines on its `drop-indicator`. When one of those changes
in a new Obsidian, compare again: make a `.base` file with a cards view in the test vault and put the two side by side.

Each spec file exports `specs`, a list of `{ name, fn(p, h, t) }` (and `timeout`, in ms, for a test that honestly
needs more than ten minutes): `p` drives Obsidian (`p.ev`, `p.click`, `p.dbl`,
`p.key`, `p.drag`, `p.at`, `p.shot`…), `h` has helpers (`h.open`, `h.run`), `t` asserts (`t.ok`, `t.eq`). Input is
real: `p.dbl` is a double-click the page sees as one, and `p.key('Enter')` types a new line where a real key would.

Before each test the runner closes every tab (a view of the plugin's left in a sidebar too, and every other window),
restores the test notes, deletes what tests made, puts every setting back to its default and Obsidian's own settings
(the vault's config: "Deleted files", Vim, the font size, the theme…) back to what that Obsidian started with, removes
the saved mobile layout, clears notices and focuses the main window, so tests don't depend on their order. A test
still puts back what it changes; the runner is there for the one that fails before it can.

## What's in `scripts/`

| Script | Run as | What it does |
|---|---|---|
| `ship.mjs` | `npm run ship -- patch "Title" --fixed "…"` | Bumps the version, writes the CHANGELOG entry and commits what is staged. Every commit goes through it (see [AGENTS.md](../../AGENTS.md)) |
| `memo.mjs` | `npm run memo` | Progress memos for a team of agents: write one, list them all, read one (AGENTS.md, "Progress memos") |
| `install-to-vault.mjs` | by every build; `npm run install-vault -- <vault>` | Copies the build into a vault and turns the plugin on there |
| `make-demo-vault.mjs`, `demo-vault/` | `npm run demo-vault` | Makes or updates `demo-vault/` (above) |
| `banner/` | `npm run banner`; `node scripts/banner/shoot.mjs` | The README's headline image, the social preview and the mark (`docs/images/banner.png`, `social-preview.png`, `mark*.svg`, `mark-tile.png`), from the screenshot in `banner/raw/`; `shoot.mjs` takes that screenshot again (after `npm run build`). See "The banner and the mark" in [design.md](design.md) |
| `run-tests.mjs` | `npm test [-- name]` | Bundles and runs the unit tests |
| `hyphenation-patterns.mjs` | `node scripts/hyphenation-patterns.mjs` (`--check`, `--from <folder>`) | Makes the hyphenation patterns in `src/export/pages/patterns/` from TeX's hyph-utf8 files at one commit, each with its licence at its head. Run it only to add a language or take a newer commit (see "Where the patterns come from" in [export.md](export.md)) |

`esbuild.config.mjs` (the build) and `version-bump.mjs` (called by `npm version`, so by `ship`) are at the top of the
project. The e2e tools are in `tests/e2e/`: `driver.mjs`, `run.mjs`, `run-all.mjs`, `screenshots.mjs`.

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

Every commit goes through `npm run ship`, which bumps the version and writes the CHANGELOG. See [AGENTS.md](../../AGENTS.md).

### Before a fix ships

Learned on 2026-10-02, when about a hundred patches shipped having run only the test written for each, and several
broke older tests nobody had run:

- **A fix runs the spec files that directly cover what it changed** (one or two, in both themes:
  `npm run e2e -- --theme both --specs …`), not only the test it added, and not every file that might be affected:
  on 2026-10-05 area runs of twenty-five files per agent took two hours each and ran the machine out of memory.
- **The whole suite runs once, at the end of a session**, by one dedicated test runner with the machine to itself:
  `npm run e2e:all -- --jobs 6 --theme both --retry-alone`. Agents building tickets don't run it.
- **A failure on `main` is found with `git bisect run`, before anyone guesses** which change caused it.

A script for `git bisect run` builds the commit, runs the one failing test and turns its summary into an exit status
(0 good, 1 bad, 125 to skip a commit that doesn't build). The runner's own exit code is 1 on a failure, but 0 when
`--grep` matches nothing, so the script looks for "1 passed, 0 failed" instead:

```bash
#!/bin/bash
# bisect.sh: does the test pass at this commit?
npm run build >/dev/null 2>&1 || exit 125          # a commit that doesn't build can't be judged
npm run install-vault >/dev/null 2>&1 || exit 125  # (the build installs too; this makes sure test-vault has it)
npm run e2e -- --grep "a status set in a note with a comment" 2>&1 | tee /tmp/bisect.log | tail -3
grep -q "1 passed, 0 failed" /tmp/bisect.log
```

```bash
git bisect start <bad commit> <good commit>
git bisect run bash /path/to/bisect.sh
git bisect reset
```

Keep the script outside the repository (a bisect checks out old commits), and the test's name specific enough that
exactly one test matches.

## Releasing

1. Make sure `main` is green (`npm run check`, e2e) and pushed. There is no version to bump by hand: the last
   `npm run ship` already set it in `manifest.json`, `package.json` and `versions.json`, and that commit is what you tag.
2. Tag the version: `git tag x.y.z && git push origin x.y.z` (no `v`; it must match `manifest.json`).
3. The **Release** workflow checks and builds the plugin, attests `main.js`, `manifest.json` and `styles.css`, and
   publishes a release whose notes are the CHANGELOG since the previous tag. `0.x` tags become draft pre-releases;
   `1.x` and later are published as the latest release.

## Submitting to the community plugin directory

See <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>: a public repository with `README.md`, `LICENSE`
and `manifest.json`, a release with the three files attached, then add the plugin at <https://community.obsidian.md>.

## PDFs in the tests

`tests/e2e/specs-export-pdf.mjs` exports real PDFs from a headless Obsidian and reads them back with Poppler's
`pdftotext`, `pdffonts` and `pdfinfo` (the `poppler` package of any Linux, Homebrew's `poppler` on a Mac). They are
dev-time tools: nothing of them is in the plugin. **Without one, the part of a test that needs it says so loudly and
is skipped, not passed.** The spec also puts the demo vault's example books into the vault under test (from
`scripts/demo-vault/`) and lays out and prints each.

```bash
BINDERS_KEEP_PDF=/some/folder npm run e2e -- --specs tests/e2e/specs-export-pdf.mjs   # keeps every PDF it makes, to look at
```

The fonts in `src/export/fonts/` are made by `scripts/subset-fonts.py` from the families' static TrueType files
(`pip install fonttools brotli`); run it only to change what the subsets hold.
