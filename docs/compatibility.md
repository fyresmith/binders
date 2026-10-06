# Compatibility

What Binders needs, and how it gets along with Obsidian's updates, other plugins and sync.

## Obsidian

Binders requires Obsidian 1.13.4 or later. It works on a computer, a phone and a tablet.

Phone and tablet support is new and has had little testing on real devices. See [Phones and tablets](mobile.md).

## Other file explorers

Binders changes the order of Obsidian's own file explorer. Plugins that replace the file explorer, such as Notebook
Navigator, don't show binder order.

If you use one, turn off **Order binders in the file explorer** in Binders' settings. The binder view works either
way, and so does everything else.

## Obsidian updates

Binders relies on a few parts of Obsidian that aren't in its plugin API: the file explorer's sorting and dragging,
and the editor that embeds notes, as Canvas does. Each is checked when Binders starts. If an Obsidian update changes
one, Binders falls back and says so:

| If this changes | What happens |
|---|---|
| The file explorer's sorting | The explorer lists binders by name, and dragging there does what it does without Binders. The binder view still shows and changes the order |
| The embedded editor | The manuscript is read only. Click a section to open its note and edit it there |
| The names of parts of Obsidian's window | In focus mode, a part that was renamed stays in sight while you write. Nothing else changes |

An update to Binders is the fix in each case.

## Sync and backup

- **Obsidian Sync** carries your notes, the binder note and folder notes as it carries any note. It carries
  snapshots (`.snapshot` and `.binder-snapshot` files) and export styles (`.bookstyle` files) only with **Sync all
  other types** on, in Obsidian's Sync settings, on each device.
  See [Snapshots](snapshots.md#three-things-to-know).
- **Tools that copy every file** (iCloud, Syncthing, Dropbox, git) carry everything, snapshots included, without
  any setting.
- **Settings** sync with the plugin's settings, if you sync those. The places exports are saved without asking, and
  the words written today, are kept on each device by itself.

## Longform

Longform's multi-scene projects open as binders, with both plugins on or with Longform off. Projects that hold a
single note (`format: single`) aren't binders. See [Coming from Longform](longform.md).

## Other plugins

- A card's or row's menu includes the items Obsidian's core plugins and your other plugins offer for that note, as
  the file explorer's menu does.
- Only notes in a binder are affected by Binders. A note anywhere else in the vault is left exactly as Obsidian has
  it.

## Nested binders

Nested binders aren't supported. A binder note inside a binder is treated as an ordinary note.

## Exported files

- **Word files** are .docx, for Word and anything that reads it, including Vellum and Atticus.
- **Ebooks** are EPUB 3, written to pass EPUBCheck.
- **PDFs** are made by Obsidian on a computer, with their typefaces inside.
- **Scrivener projects** are written for Scrivener 3. See [Scrivener project](export-scrivener.md#scrivener-versions).

Which of these have been opened in the apps they are for, and which haven't yet, is in
[Known limitations](limitations.md#not-yet-tried).
