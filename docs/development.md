# Development

## Setup

```bash
npm install
npm run build          # type-check and bundle main.js
npm run install-vault  # copy the build into ./test-vault and turn it on
```

Open `test-vault` in Obsidian to try it: it holds a sample binder, *The Lighthouse*. `npm run dev` rebuilds on every
change (reload Obsidian, or use the Hot Reload plugin, to pick it up).

## Checks

| Command | What it does |
|---|---|
| `npm run check` | Build, lint (the same rules as Obsidian's review bot) and unit tests |
| `npm test` | Unit tests only: bundles each `tests/*.test.ts` for Node and runs it |
| `npm run e2e` | End-to-end tests in real, headless Obsidian |

### End-to-end tests

`tests/e2e/driver.mjs` starts Obsidian (Electron) headless with a throwaway profile and a throwaway copy of
`test-vault`, and drives it over the Chrome DevTools protocol. The runner resets every note between tests, and fails a
test on any console error.

```bash
npm run build && npm run install-vault
npm run e2e -- --theme both          # light and dark
npm run e2e -- --grep explorer       # tests whose name matches
npm run e2e -- --repeat 3            # flakiness check
npm run e2e -- --specs tests/e2e/specs-corkboard.mjs
```

It expects Obsidian at `/usr/lib/electron43/electron` with `/usr/lib/obsidian/app.asar`; set `OBSIDIAN_ELECTRON` and
`OBSIDIAN_ASAR` otherwise. Failure screenshots go to `test-dist/e2e-failures`.

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
