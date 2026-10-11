# The inspector and the contents

Two views for the sidebar, as Obsidian's Outline and Backlinks are. The **inspector** shows the details of the scene
you have in hand and lets you change them without leaving the page. The **contents** are the whole book as one list,
so you always know where you are.

Put them side by side, one over the other, in either sidebar, or close them.

![The manuscript with the inspector over the contents in the right sidebar: the scene the cursor is in, and its place in the book](images/inspector.png)

## Where they are

Opening a binder puts both among the right sidebar's tabs, if they aren't there already. The sidebar isn't opened
for them, and the tab you had in front stays in front. Open the sidebar and they are there.

- They stay when you close the binder, as Outline stays with no note open.
- Close one and it comes back with the next binder you open.
- To keep them closed, turn off **Show the inspector and contents with a binder** in Binders' settings. Then you
  open them yourself.
- **Show inspector** and **Show contents** in the command palette open the sidebar on them, or make the tab if there
  is none. **Show contents** is in the binder view's **More options** menu too.

## The inspector

The inspector follows the tab you're writing in. It shows:

- in the manuscript, the section the cursor is in (once that has scrolled out of sight, the section at the top of
  the page);
- on the corkboard or timeline, or in the outliner, the selected card or row;
- with nothing selected, the folder the view shows, or the binder itself;
- a note of a binder open in a tab of its own.

### What you can set

| Field | What it is |
|---|---|
| **Synopsis** | The same synopsis the note's card shows. Click it to type. Ctrl+Enter (Cmd+Enter on macOS) saves; Esc leaves it as it was |
| **Label** | The same menu a card has. See [Labels, statuses and targets](labels-statuses-targets.md) |
| **Status** | The same menu a card has |
| **Target** | The word count target. Click to type a number |
| **Story date** | When the scene happens in the story. Click to type it in words or as `1987-06-14`; nothing typed takes it away. Not shown for the binder itself. See [Story date](story-date.md) |
| **Include in export** | Untick to leave the note or folder out of every export |
| **Export as** | The part the note or folder plays in an exported book: **Part**, **Chapter**, **Scene**, **Front matter** or **Back matter**. Until you choose one it shows the part export gives it by its place, marked "auto". **Automatic** in the menu goes back to that. A folder can't be a scene. See [Book details and structure](book-details.md) |
| **Notes** | Your own notes on the scene. See [Scene notes](scene-notes.md) |
| **Snapshots** | A note's snapshots, newest first, with a camera to take one; for a folder, the folder's own, and with nothing selected the binder's. Click a row to open the Snapshots window on it. See [Snapshots](snapshots.md) |

### Your own properties

A binder can pin a few of your own properties under Label and Status: a point of view, the characters in a scene, a
place, a subplot, or any other property of your notes. Pin one with **Pin property** under the rows: the menu lists
the properties your binder's notes already have, and **Other property...** asks for a name. Binders' own properties
(status, label, synopsis, export and the rest) are refused, since the inspector has them already. There is no limit.

- **Each is edited with Obsidian's own editor for its type**, the one the note's Properties view draws: text, a list,
  a number, a box, a date, a date and time, tags. A list shows its items with a small × and offers the values you
  already use; typing `[[` in a text or list offers your notes. A value that isn't of its property's type is shown as
  it is, with Obsidian's mark. If those editors are ever missing from an Obsidian, Binders draws plainer fields that
  read and write the same values. **Changing a property's type** stays in Obsidian's own Properties view.
- **They follow the scene** you are on, and are the same properties the outliner's columns and the note's own
  Properties show, so an edit in any one shows in the others at once. Clearing a value takes the property away.
- **A row's name opens its menu**: the type, **Move up**, **Move down** and **Unpin**. Which properties are pinned,
  and their order, belong to the binder: they are kept in the binder note (`inspector`, see
  [How your files look](files.md)), not in the undo history. A Longform project can't pin, since Binders writes
  nothing in a project's own note; **Convert to binder** makes it a binder that can. A binder from a newer version
  of Binders shows its pins and can't change them.
- **For a folder, or the binder itself,** the rows show the values in its folder note (or binder note). Binders makes
  the folder note the first time you give a folder a value.
- **A link opens beside your writing.** A plain click on a link in a row opens the note in a pane next to the one
  you are in, and the next link opens in the same pane, so a character's note can be read next to her scenes. Ctrl or
  Cmd and click, and the link's right-click menu, are Obsidian's own. The inspector and the contents stay on the
  scene while you read a note that isn't in any binder; a note of another binder takes them. Whether pointing at a
  link shows a preview follows Obsidian's **Page preview** setting for properties (Ctrl, or Cmd, held by default).
  On a phone a tap on a link is Obsidian's.
- **When a note is renamed,** the links to it in these properties follow if Obsidian updates links; otherwise they are
  left, as they are anywhere else.
- **Each edit is one step of undo**, and never touches the text of the note.

### Several at once

With several cards or rows selected the inspector shows what they share, and "Mixed" where they differ. A label,
status, target, story date or **Export as** set there goes to all of them. The **Include in export** box shows as
mixed when they differ.

For your own pinned properties, a list shows the items all of them have, and after them "1 more on some" (or "3 on
some"): the items only some have, with a menu on each to **Add to all** or **Remove from** the notes that have it.
Adding an item adds it to all of them and the × takes an item from all of them; what only some have stays in each
note's own order. Other types show "Mixed" where they differ, and what you set goes to all. It is one step of undo.
Items are compared as links are: `Mara` and `[[Mara]]` are the same name, and links to two different notes both named
Mara are two people.

### What you type is kept

A field is saved to the note it was opened on as soon as you leave the field, the cursor moves to another section,
or you close the tab or the app. If it can't be saved, the text stays in its field and the inspector stays on that
note, so you can try again or copy it.

## The contents

The contents are the whole book as one list, in its order, with the row you're on marked and kept in sight as you
write.

| To | Do this |
|---|---|
| Go to a scene | Click its row. In the manuscript the page scrolls to that section; on the corkboard its folder opens and its card is selected; in the outliner its row is selected; on the timeline its card is selected and brought into sight. With only a note open, the note opens |
| Open it in a new tab | Ctrl-click (Cmd-click on macOS) |
| Fold a folder | Click its arrow |
| Use the keyboard | The arrow keys, Home, End and Enter work as in the file explorer |

The contents don't reorder. Drag in the file explorer, on the corkboard or in the outliner for that.

With no binder open the contents say "No binder is open."

## On phones and tablets

The inspector and the contents are pages of the right drawer, put there when you open a binder. Swipe in from the
right edge, or run **Show inspector**. The inspector is on the section you last tapped. A tap on a row of the
contents closes the drawer on a phone and takes the manuscript there.

Next: [Labels, statuses and targets](labels-statuses-targets.md)
