# Questions and answers

## What happens if I turn Binders off?

Your notes stay exactly as they are: ordinary Markdown notes in ordinary folders. The file explorer lists them by
name again, and the binder note and folder notes show as the notes they are. Snapshots are still in the binder's
`Snapshots` folder, as text files. Turn Binders back on and every binder is as you left it. See
[How your files look](files.md#without-binders).

One thing looks different: a paragraph you started with a tab shows as a code block again, as Markdown has it. See
[Paragraphs](paragraphs.md).

## Does it change my notes?

It writes the properties you set through its views, and nothing else in a note unless you type there or ask for it
(split, merge, bring back a snapshot, rewrite). The one exception is narrow and is described in
[How your files look](files.md#what-binders-writes-and-what-it-never-touches).

## Does it work with Obsidian Sync?

Yes. Notes, binder notes and folder notes sync as any note does. Snapshots and export styles sync only with **Sync
all other types** turned on in Obsidian's Sync settings, on each device.

## Does it work with git, iCloud, Dropbox or Syncthing?

Yes. They carry every file, snapshots included. Everything Binders keeps in the vault is plain text, so it reads
well in a diff.

## Does it work with other file explorer plugins?

The binder view does. Binder order in the file explorer doesn't: Binders orders Obsidian's own file explorer, and a
plugin that replaces it, such as Notebook Navigator, lists notes its own way. Turn off **Order binders in the file
explorer** if you use one. See [Compatibility](compatibility.md).

## Does it work on my phone?

Yes, on iOS and Android, with all three modes. Phone and tablet support is new and has had little testing on real
devices. See [Phones and tablets](mobile.md).

## Can I have more than one binder?

As many as you like, anywhere in the vault. A binder can't be inside another binder, and the top of the vault can't
be one.

## Can a note be in two binders?

No. A note is in the binder its folder is in.

## Do I have to use Binders' property names?

No. If your notes already keep a synopsis or a status under another name, set the names under **Settings → Binders
→ Property names**.

## Can I keep research in a binder?

Yes. Put it in a folder at the top of the binder and turn off **Include in export** on the folder. It stays in the
binder's order and out of every exported book. See [Export](export.md#leaving-a-note-out).

## I use Longform. Do I have to convert?

No. Longform projects open as binders as they are. Convert when you want folders. See
[Coming from Longform](longform.md).

## Can I open my Scrivener project?

Yes. Run **Import from Scrivener...** from the command palette: it makes a new binder from a Scrivener 3 project, or
a zipped backup of one, and shows it to you first. See [Import from Scrivener](import-scrivener.md). To go the other way, see
[Scrivener project](export-scrivener.md).

## Can I make a PDF for print?

Yes, on a computer. **Paperback** in the Export window makes a print-ready PDF on the trim size you choose, with
its typefaces in the file. See [Paperback](export-paperback.md). A manuscript can be a PDF too.

## Can I change how the exported book looks?

Yes. Choose a style in the Export window, and click the sliders button beside it to change it or make your own. See
[Styles](export-styles.md).

## Is it in Obsidian's community plugins?

Yes: search for **Binders** under **Settings → Community plugins → Browse**, or open its
[page in the directory](https://community.obsidian.md/plugins/binders). See [Installation](installation.md).

## Where do I report a problem or ask for something?

In the [issue tracker](https://github.com/fyresmith/binders/issues).
