# The binder view

The binder view is where you work on a binder as a whole. It is one view with three modes, three ways of seeing the
notes in a binder or in one of its folders:

- [Corkboard](corkboard.md): an index card for each note.
- [Outliner](outliner.md): a row for each note, with columns you pick.
- [Manuscript](manuscript.md): every note in order as one page you can write in.

![The binder view as a corkboard](images/corkboard.png)

## Opening it

- Click a binder, or a folder inside one, in the file explorer. Ctrl-click (Cmd-click on macOS) or middle-click
  opens it in a new tab.
- From a note of the binder, run **Open binder** from the command palette, or right-click the note in the file
  explorer and choose **Show in binder**. The view opens with that note's card selected.

A binder opens the way you last left it: the same mode, filter and options. If the binder is already open in a tab,
that tab comes to the front.

## Switching modes

Click the button at the top left of the view, which names the mode you're in, and choose another. The commands
**Show corkboard**, **Show outliner** and **Show manuscript** do the same, and so does the view's **More options**
menu.

Each mode keeps its place when you look at another, and when you open a note and come back.

## The toolbar

From left to right:

| Part | What it does |
|---|---|
| The mode button | Switches between **Corkboard**, **Outliner** and **Manuscript** |
| The breadcrumb | Inside a folder, shows the way back up to the binder. Click a name to go there |
| The word count | The words in the binder or folder shown. With a target, it reads "282 / 60,000 words" and a bar shows how far along you are. Click it to set the target |
| **Undo** and **Redo** | Take back and make again the last change made by hand to the binder. Dimmed when there is nothing to do; the tooltip says what it would do. On a narrow pane **Redo** is in **More options** instead. See [Undo and redo](undo.md) |
| **Arrange** | Corkboard only: lays the cards out in a grid or by label. See [Corkboard](corkboard.md#arrange-by-label) |
| **Filter** | Shows only the notes with a given status or label, in all three modes |
| **New** | Makes a new note or a new folder |
| The focus button | Manuscript only, at the end of the toolbar: goes into [focus mode](focus-mode.md) |

On a phone the buttons show their icons alone.

## The synopsis of a binder or folder

Under the toolbar is the synopsis of the binder or folder you're looking at. Click it to write one. A folder's
synopsis also shows on its card on the corkboard.

## Folders

The view shows one folder at a time: the binder itself, or a folder inside it.

- On the corkboard a folder is one card. Double-click it (or tap its name) to go into it.
- In the outliner folders hold their notes as rows under them, and fold.
- In the manuscript a folder's name is a heading. Click the heading to open that folder.

The breadcrumb takes you back up. Cards dragged onto a name in the breadcrumb move out to that folder.

## Adding notes and folders

- **New** in the toolbar makes a **New note** or a **New folder**. With a card or row selected, the new one goes
  right after it; otherwise it goes last.
- Right-click empty space on the corkboard for the same two.
- **New scene here** in a binder folder's right-click menu in the file explorer adds one to that folder. As a
  command, it adds a note right after the note you have open, or where the binder view would put one.
- **New scene after this** in a note's right-click menu in the file explorer, and **New note after this** in the
  menu of a manuscript title, add one right after that note.

A new note shows with its name ready to type.

## The filter

**Filter** lists the statuses and labels in use in the binder. Tick one or more to show only the notes that have
them. The button says how many are on ("Filter (2)"). **Clear filter** shows everything again.

The filter applies to all three modes. While it is on, the word count reads as the words shown out of all of them
("120 of 282 words").

## The More options menu

The three dots in the view's header open a menu with:

- **Corkboard**, **Outliner** and **Manuscript**, to switch modes.
- While the corkboard is showing: **In a grid**, **By label, across** and **By label, down** with the two switches
  that go with them, **Card size**, **Number the cards** and **Tint cards with their label color**.
- While the outliner is showing: **Show synopses**, **Columns**, **Expand all** and **Collapse all**.
- **Undo** and **Redo** of the last change, each saying what it will take back. See [Undo and redo](undo.md).
- **Export...**, and **Export again** once the binder has been exported. See [Export](export.md).
- **Take a snapshot** and **Show snapshots...**, of the folder shown. The same two are behind the **Snapshots** button (a clock) in the header; a phone's header has no such button, so there they are here only. See [Snapshots](snapshots.md).
- **Show contents**, which opens the [contents](inspector.md#the-contents) in the sidebar.
- **Open binder note**, or **Open folder note** inside a folder. This is how you reach the note that holds a
  binder's or folder's own data while it is hidden in the file explorer.
- **Snapshots of notes that are gone...**, when there are any. See [Snapshots](snapshots.md).

## Limits

- A binder can't be inside another binder. A binder note inside a binder is treated as an ordinary note.
- A binder made by a newer version of Binders opens read only. See [Troubleshooting](troubleshooting.md).

Next: [Corkboard](corkboard.md)
