# Privacy

Binders makes no network requests and has no telemetry. It collects nothing.

What it reads and writes is on your device:

- **In your vault:** your notes' properties, binder notes and folder notes, snapshots, and exported files in the
  `Exports` folder. See [How your files look](files.md).
- **Outside your vault, on a computer:** an exported file, only where you choose in the save dialog. See
  [Export](export.md#where-the-file-goes).
- **In Obsidian's storage for the vault, on the device:** the words written today, and the places exports are saved
  without asking.
- **In the plugin's settings file:** your settings, including **Your name** and **Contact details** if you fill
  them in for a manuscript's title page. If you sync or share your vault's `.obsidian` folder, they go with it.

On a phone or tablet, an exported file is handed to the system's share sheet. Where it goes from there is up to
you.

Import from Scrivener reads the project or the zip you choose, and nothing else outside the vault. It makes a new
folder in this vault, with the project's original files in it, and adds the project's labels and statuses to
Binders' settings. It doesn't change the project, and sends nothing anywhere.
