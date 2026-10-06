# The binder format (version 1)

A binder is an ordinary folder with one **binder note** in it. Nothing else about the folder changes.

## The binder note

Any note inside the folder whose properties include `binder`. Name it like the folder (`Novel/Novel.md`) by convention.

```yaml
---
binder: 1                 # format version (a bare `binder:` or `binder: true` also means 1)
contents:                 # the order of everything in the binder, as paths relative to the folder
  - Prologue
  - Part One/             # folders end in /
  - Part One/Arrival      # notes without .md
  - Part One/The keeper
  - Epilogue
target: 50000             # optional: a word count goal for the whole binder
synopsis: A keeper, a newcomer, and the night the light went out.
---
Anything you like: notes on the book, links, a to-do list.
```

| Property | Type | Meaning |
|---|---|---|
| `binder` | number | Format version, `1`. Binders refuses (and never rewrites) a binder note whose version is newer than it knows, and one whose value it doesn't understand (text, `0`, a fraction): such a binder is listed, read only, and says why. A bare `binder:` or `binder: true` means 1. |
| `contents` | list of text | The binder's order. Paths use `/`, are relative to the binder folder, have no `.md`, and folders end in `/`. |
| `target` | number | Optional word count goal for the binder, shown in the view's toolbar. |
| `synopsis`, `status`, `label` | | The binder's own card data, as for scenes (below). |

`binder` and `contents` are fixed names. The others are read under the names set in settings, as for scenes.

## Folder notes

A subfolder in a binder can have a **folder note**: the note directly inside it with the folder's name
(`Part One/Part One.md`). It holds the folder's own `synopsis`, `status`, `label`, `target` and `notes`, and its body is free
for notes. `export: false` in it leaves the whole folder out of an export, and `export-as` gives the folder a role (see
"Export", below). Binders creates it (empty) when you first
give the folder one of these in a binder view, or type into one of the outliner's property columns on the folder's
row.

- A folder note is not a scene: it never appears in `contents`, on the corkboard, in the outliner (the folder's row
  shows what it holds) or in the manuscript.
- The binder note and folder notes are hidden in the file explorer by default.
- The binder folder's own data lives in the binder note, which is its folder note.
- Renaming a subfolder in a binder renames its folder note to match (`Part 1/Part 1.md`), so it stays the folder note.
  Renaming the binder's own folder does the same for the binder note, if it was named like the folder. These, and
  the folders of snapshots (below), are the only files Binders renames on its own. If the folder already has a note with the new name, neither note is renamed
  (for a subfolder, that note is the folder note from then on; a binder note is one whatever its name).
- A scene renamed to its folder's name, or moved into a folder of its own name by something other than Binders,
  becomes that folder's note and stops showing as a scene; Binders says so. Binders itself refuses such a rename or
  move.
- A folder without a `target` of its own shows its notes' targets added together.

## Rules

- Items in the folder that `contents` doesn't mention appear after the listed items of their own folder: folders first,
  then notes, each by name (numbers in names in order, upper and lower case alike), as the file explorer lists them.
- Items in `contents` that don't exist are ignored, and dropped the next time Binders writes the list. If more than
  half of the entries are missing (and weren't renamed or deleted in Binders' sight), they're kept, after the others: the
  list most likely describes another folder (a binder note moved here by mistake), and moving the note back finds its
  order intact.
- A binder note moved to another folder makes that folder the binder (if nothing else does), with the note's list read
  afresh.
- Duplicate entries count once. Paths that leave the folder (`..`) are ignored.
- An entry YAML reads as a number (a note called `1984`, typed bare) counts as that name. Binders writes such names
  quoted.
- Reading drops one `.md` from an entry. A note whose own name ends in `.md` (`notes.md.md`) is written with its full
  name, so it reads back as itself.
- The binder note and folder notes never appear in `contents` or as scenes in the binder views.
- A binder note inside a binder (a nested binder) is an ordinary note in 1.0, or the folder note if it's named like its
  folder.
- If a folder has several binder notes, the one named like the folder is the binder note; otherwise the first by name.
- The vault's top level can't be a binder.
- Binders writes only `contents` (and its own properties above) in the binder note, and never changes the rest of it.
- A name keeps its own spaces, at its start and end too (`" Lead"`, `"Trail "`): a file can be named so, and an entry
  with them taken off would no longer name it. An entry typed by hand with stray spaces round a name (`  Prologue  `)
  that names nothing as it stands, but names an item once they are off, is taken for that item.
- A note named after a file beside it (`paper.pdf.md` next to `paper.pdf`) is listed with its `.md`; the bare entry is
  the file's.

## Keeping the list up to date

- Renaming an item inside a binder, from anywhere in Obsidian, keeps its place (a folder's items move with it). Moving
  an item to another folder of the binder puts it at the end of that folder, with its items. Moving an item out removes
  it from `contents`; moving one in adds it at the end of its folder (a folder from another binder brings its order along). Deleting removes it.
- A new note isn't written into `contents` until you move it: until then it shows after the listed items.
- Moving an item in a binder writes down the place of everything there that isn't listed yet, files that aren't notes
  (images, PDFs) included, so what you see is what's kept.
- Changes are written together, a moment after the last one: moving a folder of 40 notes writes the binder note once.
  They're applied to what the binder note says at that moment, so edits made to it meanwhile are kept.
- A note made beside one it's named after ("Arrival 1" next to "Arrival", as Obsidian's "Make a copy" does) goes
  right after that one, if that one is in the list.
- "Undo last move" writes the list back as it was before the move, and moves the items back to the folders they
  were in. It refuses if a place has been taken or a folder is gone. Undo history is kept in memory (the last 50
  moves), not in any file.
- "Ungroup" moves a folder's items out to where it stood. If nothing is then left in the folder but its folder note
  (in the vault and on the disk), the folder goes to the trash with that note, as Obsidian's "Deleted files" setting
  says. The note's bytes are kept in memory with the move, and "Undo last move" makes the folder again, writes the
  note back byte for byte, and puts the items back inside in their order; it refuses, moving nothing, if a file has
  the folder's name now or one of the items would become its folder note. A folder that still holds anything stays:
  a file Obsidian doesn't list, or a folder note with text under its properties (a notice says so).
- "Make this folder a binder" creates `Folder/Folder.md` with `binder: 1` and `contents` in the order the file explorer
  showed (folders first, then notes, by name; only notes and folders are listed, and a `Snapshots` folder is left out). If `Folder/Folder.md` already exists, it adds `binder: 1` (and
  `contents`, if it has none) to its properties and leaves its text alone. If that note already has a `contents` property
  that isn't a list, Binders leaves the note as it is and doesn't make the folder a binder.
- A folder made beside one it's named after ("Part One 1" next to "Part One", as Obsidian's "Make a copy" does) goes
  right after that one, and what's in it takes that folder's order.
- Such a copy brings the original's folder note along under its old name (`Part One 1/Part One.md`), where it would
  be a scene. Binders renames it to the copy's name (`Part One 1/Part One 1.md`), so the copy keeps its synopsis
  and the rest; only the name changes, and no note is written to. It does so only when the note is plainly the
  copied folder note: it is directly in the copy and named like the folder beside it that the copy is named after;
  that folder has a folder note, and this one is byte for byte the same; it has at least one folder-note property
  (`synopsis`, `status`, `label`, `target` under the names in settings, `export`, or `compile`); and the copy has no note under
  its own name. Anything else is left as it is. Files may arrive one by one (a sync, a file manager): the note is
  looked for as each arrives, for ten minutes after the last one.
- A file deleted and created again within two seconds (as git and some editors rewrite files) goes back to its place.

## Scene properties

Each note in a binder can have these properties. They are ordinary Obsidian properties. The names of the first four
and of `notes` can be changed in settings; `export` and `export-as` are fixed.

| Property | Type | Used for |
|---|---|---|
| `synopsis` | text | The corkboard card's text, and the text under the title in the outliner |
| `status` | text | A chip on the card, a column in the outliner, and a filter. Settings list the statuses offered (Idea, Draft, Revised, Done to start with); any other text works too |
| `label` | text | The note's color: the border and tint of its card, a dot in the outliner and in the file explorer, and a filter. See below |
| `target` | number | A word count target for the note: progress on its card, and the outliner's Target and Progress columns. A whole number above zero and up to a billion; text such as `"1,500"`, `"1 500"` or `"1.500"` is read as 1500; anything else (`1.5`, `lots`, `0`) is no target |
| `notes` | text | The writer's own notes on the note: not manuscript text, and never exported. Typed in the inspector or the outliner's Notes column, as plain text of as many lines as are typed (YAML writes them as a block). A folder's are in its folder note, the binder's in the binder note. Clearing them removes the property. The Scrivener project export (docs/export.md) is to carry them as the document's notes |
| `export` | checkbox | `false` leaves the note out of every export. Missing, or anything else, means included; turning it back on removes the property |
| `compile` | checkbox | The name `export` had before export was built. `false` is read as `export: false`, for good. Binders never writes it, and never rewrites a note to change one into the other: a note keeps it until "Include in export" is turned on for it, which removes both |
| `export-as` | text | The note's role in an exported book, when the structure's own answer isn't wanted: `part`, `chapter`, `scene`, `front matter` or `back matter`. See "Export" |

```yaml
---
synopsis: Mara arrives on the island with the supply boat.
status: Revised
label: Blue
target: 1200
---
```

### Labels

A `label` is one of:

- the name of a label in settings (any case), which shows in that label's color. A new vault's labels are Red,
  Orange, Yellow, Green, Cyan, Blue, Purple and Pink;
- one of the theme's color names (`red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `pink`), which shows
  in the theme's own shade even if no label in settings has that name;
- a hex color, `"#7c3aed"` or `"#73e"` (quoted, since YAML reads `#` as a comment), for a color on that note alone.
  "Custom color..." writes this. Any case; a transparency part is ignored.

If `label` is a list, its first entry is the label.

Any other text still counts as a label (it filters and sorts) and shows in a neutral color.

The labels and statuses themselves live in Binders' settings (`.obsidian/plugins/binders/data.json`), not in any
note. Renaming one there asks whether to rename it in the notes that have it too (and leaves them as they are if you say
no). Statuses and labels match whatever their case:
`status: draft` is Draft.

### Properties Binders no longer uses

Versions before the outliner had a plot grid, which used `plotlines` and `plotlineColors` in the binder note and
`plotlines` (and reserved `plot`) in scenes. Binders no longer reads or writes them. Notes that have them keep them:
they are ordinary properties now, and the outliner can show them as columns.

### What Binders writes in a note

Only the properties you change through its views or commands: the ones above, and any property you type into in an
outliner column (a number stays a number, a list is split at commas, an empty cell removes the property). Clearing a
synopsis, status, label or target removes the property. Note text is changed only by an editor you type in, and by
the commands you run on it:

- "Split scene" creates the new note with the text after the cursor and a copy of the note's properties, except the
  synopsis, and only then removes that text from the first note. Undo in the first note's editor puts the text back
  there, and the new note then goes to the trash, but only if it is still byte for byte what the split wrote, under
  the name and in the folder the split gave it, and only once the first note is on disk with that text; otherwise it
  stays and a notice says the text is in both. Redo writes the new note again, as the split wrote it.
- "Merge" appends the other notes' text to the first, a blank line between, joins their synopses and their notes the same way, reads
  the result back to check every note's text is in it, and only then moves the others to the trash.
- "Duplicate" copies files byte for byte. A copied folder keeps its order, and its folder note is renamed to match
  (as is the folder note of a folder copied outside Binders: see "Keeping the list up to date").
- "Export" writes a file (a Word manuscript where you say, or in the `Exports` folder; or one new note outside the
  binder, replacing a note of that name if there is one) and changes none of the binder's notes: not their text,
  and not their properties.
- "Rewrite" with "Start from a blank page" and "Bring back" in the Snapshots dialog replace a note's text, after
  keeping it as a snapshot (below). The note's properties are left byte for byte.

One change to a note's text is made without a command, and it is this and nothing wider. When a note or file is
renamed or moved, "Start a paragraph with a tab" is on and Obsidian's "Automatically update internal links" is on,
Binders rewrites the links to it that stand in paragraphs begun with a tab, in notes that are in a binder. Obsidian
updates every other link itself; these it leaves, because its index reads a line begun with a tab as code and has no
links for it (`src/paragraphs/rename.ts`).

- Only the note a link names changes: the shown text, a heading or block part, the kind of link (`[[…]]`, `![[…]]`,
  `[…](…)`), the tab, the line endings and a byte-order mark are as they were, and so is every other byte.
- Only on lines that are paragraphs begun with a tab by the text's shape and code by Obsidian's index: never in a
  fenced block, between backticks, in the properties, or on a tabbed line that carries on a paragraph (Obsidian
  updates those).
- Only a link that can't have meant another file: one that names the path, or an end of it that no other file's
  path ends with. Otherwise the link is left.
- It is written with `vault.process` after Obsidian has finished its own update of the note and after anything
  typed and unsaved has been saved, so nothing written meanwhile is lost.

Showing tab paragraphs and first-line indents writes nothing: a note keeps the tabs that were typed, and an indent
that wasn't typed is not in the file.

### What counts as a note's properties

A block that opens with `---` on the note's first line and closes at the next line starting with `---`, if what is
between reads as properties (YAML that is a mapping) or is empty (blank lines and `#` comments only). Anything else
between two such lines (a paragraph, a list, YAML that can't be read) is the note's text, and so is everything after
it: a note that opens with a rule, a paragraph and another rule has no properties. This is what Obsidian's own cache
and editor do, and Binders uses the one rule everywhere: merge, split, export, synopsis from text, snapshots, the
manuscript and focus mode. A byte-order mark at the start of a file is kept.

Setting a property goes through Obsidian, which writes the whole properties block again in its own form: comments in
the block are dropped, and values are written as YAML reads them (`0123` becomes `123`, `1.0` becomes `1`). Obsidian's
own Properties view does the same. The note's text is never touched.

Two kinds of note are written by Binders itself, because Obsidian's writer would damage them: a note that opens with a
`---` block that isn't properties gets its properties as a new block above that text, and a note that starts with a
byte-order mark has its block rewritten in place after the mark.

## Snapshots

A binder can have a folder named `Snapshots` at its top. It holds earlier texts of the binder's notes and is not part
of the binder: it never appears in `contents`, in a binder view, in a word count, the filter or an export, and
Binders never lists it in the file explorer.

```
The Lighthouse/
  The Lighthouse.md
  Part One/
    Arrival.md
  Snapshots/
    Part One/
      Arrival/
        2026-09-12 09.15.40 First draft.snapshot
        2026-10-01 14.32.07.snapshot
```

- The snapshots of a note are the files in `Snapshots/` under that note's path in the binder, without `.md`: those of
  `Part One/Arrival.md` are in `Snapshots/Part One/Arrival/`. Nothing in the note or the binder note points at them.
- A snapshot is a plain-text file ending in `.snapshot`, with Markdown inside. It is named for when it was taken, in
  local time (`2026-10-01 14.32.07`), followed by its name if it has one (`2026-10-01 14.32.07 First draft`); if two
  would have the same name, the second is counted on (`… First draft (2)`). Naming a snapshot renames its file. A name
  can't contain `* " \ / < > : | ?` and is at most 120 characters. A file named some other way still counts, under its
  whole name. A name that ends in a number in brackets (`Draft (2)`) is the name as typed: the brackets are read as a
  count only when the snapshot of the same time and the name without them is in the same folder.

- It holds two properties and then the note's text exactly as it was (line breaks and all). The note's own
  properties (synopsis, status, label, tags) are not copied:

  ```
  ---
  snapshot-of: "Part One/Arrival"
  taken: 2026-10-01T14:32:07
  ---
  The supply boat left Mara on the jetty with two cases and a letter she had not opened.
  ```

  `snapshot-of` is the note's path in the binder when the snapshot was taken (it isn't rewritten when the note is
  renamed: the folder says whose it is). `taken` is used for a file whose name has no time in it. A `.snapshot`
  file without these properties is all text.
- `.snapshot` is not a kind of file Obsidian takes for a note. Obsidian doesn't index it: a snapshot is in no
  search, quick switcher, link suggestion, backlink, graph or tag list. (With "Detect all file extensions" on in
  Obsidian's Files and links settings, a search by file name or path, and link suggestions, do list them.) Any
  text editor opens one.
- **Obsidian Sync does not carry snapshots unless "Sync all other types" is turned on** (Settings, Sync, Selective
  sync), on every device. It is off by default. iCloud, Syncthing, Dropbox, git and anything else that copies the
  vault's folder carry them like any other file.
- Binders writes a snapshot once and never changes it. Deleting one moves it to the trash (as Obsidian's "Deleted
  files" setting says).
- When a note or a folder is renamed or moved inside its binder, or to another binder, the folder of its snapshots is
  moved to match. Nothing is written over: if snapshots are already there (another device moved some, or a note of
  that name had its own), each file moves in beside them, a clashing name counted on (`… First draft (2)`).
- Snapshots stay where they are when their note is deleted, merged into another, or moved out of every binder.
  "Snapshots of notes that are gone" (the binder view's menu) lists them, to read, give to another note, or delete.
  A copy ("Duplicate") starts with none; after "Split scene" they stay with the first half.
- A folder named `Snapshots` that has notes in it is a folder of the writer's own, an item of the binder like any
  other, and Binders keeps no snapshots in that binder until it's renamed. Binders itself never makes a folder of
  that name at the top of a binder for anything else.
- A Longform project's snapshots are in `Snapshots/` inside its scene folder, by scene name
  (`Snapshots/Harbor/…`). Longform reads only the notes directly in its scene folder, and nothing is written to the
  index note.
- In a binder Binders can't change (a newer format), snapshots can be read but not taken, named, deleted or brought
  back.

## Export

What export reads from notes. All of it is optional, so this is still format 1. Export writes none of these itself
yet (the windows that set them come with later steps; until then they are typed as properties), and it never writes
to a note it reads. The design is [export.md](export.md).

**In a note, or in a folder's note for the folder:**

| Property | Type | Meaning |
|---|---|---|
| `export` | checkbox | `false`: left out of every export, with everything in it if it is a folder. "Include in export" writes and removes it |
| `compile` | checkbox | Read as `export`, for good (above). Never written |
| `export-as` | text | A role given by hand: `part`, `chapter`, `scene`, `front matter`, `back matter` (also read: `front`, `back`, with a hyphen, any case). Anything else is "automatic". On a folder, what is in it follows: notes in a folder that is a chapter are scenes; a folder said to be a scene only holds scenes |

A Scrivener project also reads, and never writes: `tags` (the document's keywords), `notes` (the document's notes
in Scrivener, which it never compiles), and every other property of a note (custom metadata, as text).

**In the binder note** (the book's own details):

| Property | Type | Meaning |
|---|---|---|
| `title` | text | The book's title. The folder's name without it |
| `author` | text | The author. Without it, "Your name" in Binders' settings |
| `language` | text | A language tag (`en`, `en-GB`, `de`, `fr`): which quotes are set, and what the exported file says it is written in. English without it |
| `structure` | text | Which rule gives folders and notes their roles: `chapters and scenes` (folders are chapters, notes are scenes), `parts and chapters` (folders are parts, notes are chapters), `parts, chapters and scenes`, or `every note a chapter`. Without it Binders reads the rule off the binder's shape: no folders, every note a chapter; folders one deep, parts and chapters if every top folder's name starts with "Part", "Book" or "Act", else chapters and scenes; deeper, parts, chapters and scenes. A Longform project is every note a chapter |

Not read yet, and kept for the steps that build them: `subtitle`, `cover`, `copyright`, `book-style`,
`manuscript-style`, `page-size`.

**What isn't in any note:**

- The folder exported files go to, "Your name" and the contact details for a manuscript's title page are Binders'
  settings, as is the kind and the manuscript style last used (per vault, not per binder, for now).
- The places exports are saved "without asking", and what each exported file was when export left it (its size and
  time, to tell a file that has been changed since), are kept on the device, in Obsidian's own local storage for the
  vault: a path on one computer's disk means nothing on another.
- An exported file is not a note and Binders keeps no record of it in the vault. In the vault's `Exports` folder it
  shows in the file explorer only with Obsidian's "Detect all file extensions" on.

## Longform projects

Binders also shows [Longform](https://github.com/kevboh/longform) multi-scene projects as binders, in Longform's own
format, and writes only `longform.scenes` in the index note:

```yaml
---
longform:
  format: scenes            # only multi-scene projects; `single` isn't a binder
  sceneFolder: /            # the binder folder, relative to this note
  scenes:                   # the order, by note name; a nested list is indented under the scene before it
    - Harbor
    - - Ticket office       # a group under "Harbor"
      - The crossing
    - Island
  ignoredFiles:             # names (wildcards * and ?) that aren't scenes
    - Notes*
---
```

- Scenes are the notes directly in the scene folder, except the index note. Notes `scenes` doesn't list show after the
  listed ones, by name, unless `ignoredFiles` matches them. A listed name with no note is skipped, and a name listed
  twice counts once. `sceneFolder` is `/` (the index note's own folder) if it isn't given.
- A reorder rewrites `scenes` in the same nested shape Longform writes; nothing else in the note changes.
- The index note's own `synopsis`, `status`, `label` and `target`, outside `longform`, are the project's, as a
  binder note's are the binder's. Scenes use the scene properties above.
- A project has no folders: "New folder", "New folder from selection" and "Ungroup" aren't offered.
- Renames and deletes of scenes update `scenes` when Longform isn't running (when it is, Longform does it).
- A Longform project inside a binder is ordinary notes, and a note with both `binder` and `longform` is a binder note.
- "Convert to binder" writes `binder: 1` and `contents` into the index note (or a new binder note named like the scene
  folder, if the index note is outside it), and optionally moves groups into subfolders and removes `longform`.

## Compatibility

- Later versions of format 1 only add optional properties. Binders writes only the ones it knows, and leaves any other
  property of a binder note as it found it.
- A change older versions couldn't read raises `binder` to 2, and older versions refuse such binders instead of
  rewriting them.
