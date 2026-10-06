# Settings

Every setting, under **Settings → Community plugins → Binders**. They are listed here in the order the settings page
has them.

## File explorer

| Setting | Default | What it does |
|---|---|---|
| **Order binders in the file explorer** | On | Shows the notes and folders in a binder in its own order instead of by name, and lets you drag them there to reorder. Turn this off if another plugin replaces the file explorer |
| **Open binders from the file explorer** | On | Clicking a binder, or a folder inside one, opens its binder view |
| **Hide binder and folder notes** | On | Doesn't list a binder's own note, or a folder's note named like it, in the file explorer. Only applies while **Order binders in the file explorer** is on |
| **Show label colors in the file explorer** | On | A dot in its label's color beside each labeled note and folder in a binder |

See [The file explorer](file-explorer.md).

## Paragraphs

| Setting | Default | What it does |
|---|---|---|
| **Start a paragraph with a tab** | On | In a binder's notes, a line that starts with a tab is shown as an indented paragraph, not as code, and links in it follow a rename. The note keeps the tab you typed |
| **Indent paragraphs** | Off | In a binder's notes, the first line of a paragraph that follows another is indented, as in a printed book. Nothing is added to the note |

See [Paragraphs](paragraphs.md).

## Sidebar

| Setting | Default | What it does |
|---|---|---|
| **Show the inspector and contents with a binder** | On | Opening a binder puts the inspector and the contents among the right sidebar's tabs, if they aren't there. Turn this off to open them yourself, and to keep them closed once you close them |

See [The inspector and the contents](inspector.md).

## Word counts

| Setting | Default | What it does |
|---|---|---|
| **Count words as the exported book does** | On | Every count in Binders is the book's: comments, a link's hidden part, web addresses and properties aren't counted. Turn it off to count as Obsidian's status bar does. See [how words are counted](labels-statuses-targets.md#how-words-are-counted) |


## Labels

The labels a note can have: a name and a color each. The defaults are Red, Orange, Yellow, Green, Cyan, Blue, Purple
and Pink.

- **Add label** adds one.
- Type in a label's name to rename it. Binders then asks whether to rename it in the notes that have it.
- Choose a color from the list (your theme's own shade of it), or **Custom** and pick any color.
- Drag a label to reorder it. Menus list labels in this order.
- Delete a label with the button on its row. Notes that have it keep it.
- The button with the circular arrow, **Restore the default labels**, puts the defaults back, after asking.

## Statuses

The statuses a note can have, in the order a draft goes through them. The defaults are Idea, Draft, Revised and
Done.

**Add status**, rename, reorder, delete and **Restore the default statuses** work as for labels.

See [Labels, statuses and targets](labels-statuses-targets.md).

## Focus mode

| Setting | Default | What it does |
|---|---|---|
| **Typewriter scrolling** | On | While you write at the end of a scene, the line you're on stays at one height and the page moves under it. Anywhere else in the text, the page scrolls as it always does |
| **Show the scenes before and after** | Off | In a note, the end of the scene before is shown above its text and the start of the scene after below it, as in the manuscript. Click one to go there |
| **Show where you are** | Off | The scene's place in the binder and its synopsis, beside the text. They go while you type |
| **Show word counts** | Off | The scene's words, with its target, and the words written today in the binder. They go while you type and come back when you pause |
| **Dim other paragraphs** | On | While you type, every paragraph but the one you're in steps well back |
| **Dim the background** | On | The page turns a deep charcoal while you're in focus mode, with light text on it, in a light theme too |
| **Enter fullscreen** | Off | Focus mode takes the whole screen, and gives it back when you leave. Not shown on phones and tablets |
| **Words to write today** | None | A goal for a day's writing in a binder, shown with the word counts. Leave empty for none |

See [Focus mode](focus-mode.md).

## Export

| Setting | Default | What it does |
|---|---|---|
| **Exports folder** | `Exports` | Where exported files go on a phone or tablet, and where the save dialog starts on a computer. A name is a folder beside each binder; a path, such as `Books/Exports`, is one folder for the whole vault |
| **Remembered places** | None | The exports this device saves without asking. **Ask again** forgets them, so every export asks where to save |
| **Your name** | Empty | The author of a book that doesn't say otherwise |
| **Contact details** | Empty | For the title page of a manuscript: an address, an email, a phone number, a line each |
| **Styles folder** | `Export styles` | The folder at the top of the vault that holds your export styles, one file each. Binders keeps it out of the file explorer. Changing the name renames the folder, and the styles go with it. To sync styles with Obsidian Sync, turn on **Sync all other types** |

See [Export](export.md) and [Styles](export-styles.md).

## Property names

The properties that hold each of these, if your notes already use other names.

| Setting | Default | What it holds |
|---|---|---|
| **Synopsis** | `synopsis` | A note's card text |
| **Status** | `status` | A note's status, such as draft or revised |
| **Label** | `label` | A note's label |
| **Target** | `target` | A word count target: a note's own, a folder's, or the binder's |
| **Notes** | `notes` | Your notes on a note or folder. They are never exported |

Each needs a name of its own. Binders keeps a few names for itself, which can't be used here: `binder`, `contents`,
`longform`, `export`, `compile` and `export-as`.

Changing a name here doesn't rename the property in your notes. Notes that used the old name keep it, and Binders
reads the new one from then on.

## Remembered outside the settings page

A few things are remembered without a setting:

- how each binder view was left: its mode, filter, card size and outliner columns;
- how **Export** was last set up: the kind, the switches, a manuscript's file and paper;
- on each device by itself, the places exports are saved without asking, where each binder was last exported (for
  **Export again**), and the words written today.

A book's own details, its styles and a paperback's page size are kept in its binder note, not in settings. Import
from Scrivener adds a project's labels and statuses to the lists above.
