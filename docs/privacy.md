# Privacy

Binders makes no network requests and has no telemetry. It collects nothing.

What it reads and writes is on your device:

- **In your vault:** your notes' properties, binder notes and folder notes, snapshots, export styles, and exported
  files in the `Exports` folder. See [How your files look](files.md).
- **Outside your vault, on a computer, written:** an exported file, and a copy of an export style you choose to
  share, each only where you choose in the system's save dialog. See [Export](export.md#where-the-file-goes).
  Exporting again to a place you chose before writes there again; **Remembered places** in settings lists the ones
  saved without asking.
- **Outside your vault, read:** the Scrivener project or zip you choose to import, a style's file you choose to add,
  and, to tell whether an exported file is still as export left it, that file's size and date.
- **In Obsidian's storage for the vault, on the device:** the words written today, and the places exports are saved
  without asking.
- **In the plugin's settings file:** your settings, including **Your name** and **Contact details** if you fill
  them in for a manuscript's title page. If you sync or share your vault's `.obsidian` folder, they go with it.

On a phone or tablet, an exported file is handed to the system's share sheet. Where it goes from there is up to
you.

The typefaces and hyphenation patterns an export uses are inside the plugin: nothing is downloaded. A PDF is made
by Obsidian itself, on your computer.

Import from Scrivener reads the project or the zip you choose, and nothing else outside the vault. It makes a new
folder in this vault, with the project's original files in it, and adds the project's labels and statuses to
Binders' settings. It doesn't change the project, and sends nothing anywhere.
