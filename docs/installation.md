# Installation

Binders needs Obsidian 1.13.4 or later. It works on a computer, a phone and a tablet.

Binders is in public beta. It is in Obsidian's [community plugin directory](https://community.obsidian.md/plugins/binders), which is the easiest way to
install it.

## From Obsidian

1. Open **Settings → Community plugins**. If community plugins are off, turn them on.
2. Choose **Browse** and search for **Binders**, or open its [page in the directory](https://community.obsidian.md/plugins/binders).
3. Choose **Install**, then **Enable**.

Obsidian keeps it up to date from there: **Settings → Community plugins → Check for updates**. This works on a phone
or tablet too.

## With BRAT

BRAT is the community's plugin for trying plugins that are in beta. It installs Binders from its releases on GitHub
and keeps it up to date. Use it if you want each version as it comes out.

1. Open **Settings → Community plugins**. If community plugins are off, turn them on.
2. Choose **Browse**, search for **BRAT**, then **Install** and **Enable**.
3. Open the command palette and run **BRAT: Plugins: Add a beta plugin for testing (with or without version)**.
4. Give it the repository, `https://github.com/fyresmith/binders`, choose the newest version in the list, and add
   the plugin.
5. Enable **Binders** under **Settings → Community plugins**, if BRAT hasn't.

This works on a phone or tablet too.

## By hand, from a release

1. Open the [releases](https://github.com/fyresmith/binders/releases) and take the newest. Download `main.js`,
   `manifest.json` and `styles.css` from it.
2. Put them in `<your vault>/.obsidian/plugins/binders/`. Make the folder if it isn't there.
3. In Obsidian, open **Settings → Community plugins** and enable **Binders**.

The `.obsidian` folder is hidden on most systems. Your file manager has a setting to show hidden files.

## From source

For those who want to build it themselves:

```bash
npm install
npm run build
```

Then copy `main.js`, `manifest.json` and `styles.css` into the plugin folder as above. The
[development notes](dev/development.md) have the details.

## Updating

- **With BRAT:** run **BRAT: Plugins: Check for updates to all beta plugins and UPDATE**, or **Plugins: Choose a
  single plugin version to update** to pick a version yourself.
- **By hand:** replace the three files with the ones from the newer release and restart Obsidian.

The [changelog](../CHANGELOG.md) says what changed in each version. Binders refuses to change a binder made by a
newer version of itself, so going back to an older version never rewrites what a newer one wrote.

## Before you start

Binders is new. It is tested hard not to lose writing, and it has still not been used by many writers. Keep a
backup of your vault, as you would with any new plugin. [Known limitations](limitations.md#not-yet-tried) lists
what hasn't been tried yet.

## Turning it off

Disable **Binders** under **Settings → Community plugins**. Your notes stay exactly as they are: ordinary Markdown
notes in ordinary folders. See [How your files look](files.md) for what is left behind.

Next: [Getting started](getting-started.md)
