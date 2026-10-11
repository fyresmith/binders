# Troubleshooting

Common problems and what to do about each. If yours isn't here,
[open an issue](https://github.com/fyresmith/binders/issues) and say what you did, what you expected and what
happened.

## The file explorer shows my binder in name order

1. Check that **Order binders in the file explorer** is on in Binders' settings.
2. If another plugin replaces the file explorer (Notebook Navigator and the like), binder order can't show there.
   The binder view still works, and the setting is best turned off.
3. If Binders says "couldn't change the order of the file explorer in this version of Obsidian", an Obsidian update
   has changed something Binders relies on. The binder view and the rest still work, and an update to Binders is
   the fix.

## I can't find the binder's note, or a folder's note

They're hidden in the file explorer while **Hide binder and folder notes** is on. Open them from the binder view's
**More options** menu, with **Open binder note** (or **Open folder note** inside a folder), or turn the setting off.

## A binder says it is read only, or that it can't be changed

Its note was made by a newer version of Binders (it says which format), or its `binder` property holds something
Binders doesn't understand. Binders leaves such a binder exactly as it is. Update Binders, or fix the property by
hand: it should read `binder: 1`.

## A note isn't where I put it

Notes the binder's list doesn't mention show after the listed ones, by name. A new note is written into the list
when something in its folder is moved. Drag it to where it belongs and it stays.

In a Longform project, order is the project's own `longform.scenes`.

## The manuscript is read only

Binders says "The manuscript can't edit notes in this version of Obsidian". Click a section to open its note and
edit it there. The rest of Binders is unaffected, and an update to Binders is the fix.

## There is no Export button for a PDF

A PDF (a **Paperback**, or a **Manuscript** with **File** set to **PDF**) is made on a computer. On a phone or tablet
the window shows the pages and has no **Export**: export it when the vault is open on a computer. A computer that
says "PDF isn't available here" has an Obsidian that can't print pages to a file.

## A style I made isn't on my other device

Styles are files in the `Export styles` folder at the top of the vault. Obsidian Sync carries them only with **Sync
all other types** on. See [Styles](export-styles.md#a-styles-file).

## A paragraph shows as grey code

A line that starts with a tab is code to Markdown. Binders shows it as a paragraph in a binder's notes while **Start
a paragraph with a tab** is on. Check that the setting is on and that the note is in a binder. Outside a binder it
will always show as code. See [Paragraphs](paragraphs.md).

## The inspector and the contents aren't there

Open the right sidebar: they are put among its tabs, and the sidebar isn't opened for them. If they aren't there,
run **Show inspector** or **Show contents**, and check **Show the inspector and contents with a binder** in
settings.

## The inspector and the contents keep coming back

Turn off **Show the inspector and contents with a binder** in settings. Closed, they then stay closed.

## My snapshots aren't on my other device

Obsidian Sync carries `.snapshot` files only with **Sync all other types** turned on in Obsidian's Sync settings,
on each device. See [Snapshots](snapshots.md#three-things-to-know).

## I can't see my exported file in Obsidian

Obsidian lists a .docx or an .epub in its file explorer only with **Detect all file extensions** on, under
**Settings → Files and links**. On a computer the file is where you saved it; the Export window says where, with
**Show in folder**.

## Export doesn't ask where to save any more

You ticked **Save here next time without asking**. Choose **Choose where to save...** in the Export window's
**More** menu, or **Ask again** under **Remembered places** in Binders' settings.

## A Scrivener project doesn't open

The project is written for Scrivener 3. If it doesn't open, or something arrives wrong,
[open an issue](https://github.com/fyresmith/binders/issues) with your Scrivener's version and system.

## A Longform project shows Longform's order, not mine

That is by design: a project keeps its order in `longform.scenes`, and Binders writes only that. **Convert to
binder** makes it a binder with its own format. See [Coming from Longform](longform.md).

## Where did the words written today go?

They are kept on the device you write on, not in your notes or settings, so each device counts its own. **Start
counting from here** in focus mode's menu starts the day again.

## I can't leave focus mode

Press Esc. If a menu or a dialog is open, Esc closes that first. With Vim key bindings on, Esc is Vim's: move the
pointer and click the button at the top right, or run **Toggle focus mode**.

## Undo last change doesn't do anything

It works on the binder in front, or the one the open note is in. It doesn't undo deletes, copies of folders, merges, renames made in the file explorer, or text.
Its history is kept only while Obsidian is open. See [Undo and redo](undo.md).
