# Installation

Binders needs Obsidian 1.13.4 or later. It works on a computer, a phone and a tablet.

## From Obsidian

<!-- directory link: to be added -->

1. Open **Settings → Community plugins**. If community plugins are off, turn them on.
2. Choose **Browse** and search for **Binders**.
3. Choose **Install**, then **Enable**.

## By hand, from a release

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/fyresmith/binders/releases/latest).
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

Obsidian updates community plugins from **Settings → Community plugins → Check for updates**. If you installed by
hand, replace the three files with the ones from the newer release and restart Obsidian.

## Turning it off

Disable **Binders** under **Settings → Community plugins**. Your notes stay exactly as they are: ordinary Markdown
notes in ordinary folders. See [How your files look](files.md) for what is left behind.

Next: [Getting started](getting-started.md)
