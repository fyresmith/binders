# Privacy

Binders makes no network requests and has no telemetry. It collects nothing.

What it reads and writes is on your device:

- **In your vault:** your notes' properties, binder notes and folder notes, snapshots, export styles, and exported
  files in the `Exports` folder. See [How your files look](files.md).
- **Outside your vault, on a computer, written:** an exported file, and a copy of an export style you choose to
  share, each only where you choose in the system's save dialog. See [Export](export.md#where-the-file-goes).
  Exporting again to a place you chose before writes there again; **Remembered places**, in **Folders** in settings, lists the ones
  saved without asking.
- **Outside your vault, read:** the Scrivener project, zip, Word file, text file or Markdown file you choose to import, a style's file you choose to add,
  and, to tell whether an exported file is still as export left it, that file's size and date.
- **In your vault, the record of your writing:** for each binder, in its `Snapshots` folder, in `History`, the words
  you added and cut in each note each day, the hours, and what you did to the binder (a note made, a status changed, a
  snapshot or an export). Numbers and names only, never the text of a note. It is never sent anywhere. You can stop
  it in settings and delete the files at any time. See [The record of your writing](progress.md).
- **In Obsidian's storage for the vault, on the device:** the places exports are saved without asking, and an
  identifier and a name for this device, which go on the record's files.
- **In the plugin's settings file:** your settings, including **Your name** and **Contact details** if you fill
  them in for a manuscript's title page. If you sync or share your vault's `.obsidian` folder, they go with it.

Undo history, including the text of notes deleted during the session, is kept in memory. It is cleared when the
plugin unloads. An interrupted whole-folder restore keeps its recovery plan in the binder's `Snapshots` folder;
see [Snapshots](snapshots.md#everything).

On a phone or tablet, an exported file is handed to the system's share sheet. Where it goes from there is up to
you.

The typefaces and hyphenation patterns an export uses are inside the plugin: nothing is downloaded. A PDF is made
by Obsidian itself, on your computer.

Import a manuscript reads the one file you choose (or a note or Word file of this vault) and makes a new folder in this vault,
with a copy of a file from outside the vault in it. It doesn't change the file or the note, and sends nothing anywhere.

Import from Scrivener reads the project or the zip you choose, and nothing else outside the vault. It makes a new
folder in this vault, with the project's original files in it, and adds the project's labels and statuses to
Binders' settings. It doesn't change the project, and sends nothing anywhere.
