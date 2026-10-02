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
(`Part One/Part One.md`). It holds the folder's own `synopsis`, `status`, `label` and `target`, and its body is free
for notes. `compile: false` in it leaves the whole folder out of a compile. Binders creates it (empty) when you first
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
- "Make this folder a binder" creates `Folder/Folder.md` with `binder: 1` and `contents` in the order the file explorer
  showed (folders first, then notes, by name; only notes and folders are listed, and a `Snapshots` folder is left out). If `Folder/Folder.md` already exists, it adds `binder: 1` (and
  `contents`, if it has none) to its properties and leaves its text alone. If that note already has a `contents` property
  that isn't a list, Binders leaves the note as it is and doesn't make the folder a binder.

## Scene properties

Each note in a binder can have these properties. They are ordinary Obsidian properties. The names of the first four
can be changed in settings; `compile` is fixed.

| Property | Type | Used for |
|---|---|---|
| `synopsis` | text | The corkboard card's text, and the text under the title in the outliner |
| `status` | text | A chip on the card, a column in the outliner, and a filter. Settings list the statuses offered (Idea, Draft, Revised, Done to start with); any other text works too |
| `label` | text | The note's color: the border and tint of its card, a dot in the outliner and in the file explorer, and a filter. See below |
| `target` | number | A word count target for the note: progress on its card, and the outliner's Target and Progress columns. A whole number above zero and up to a billion; text such as `"1,500"`, `"1 500"` or `"1.500"` is read as 1500; anything else (`1.5`, `lots`, `0`) is no target |
| `compile` | checkbox | `false` leaves the note out of "Compile". Missing, or anything else, means included; turning it back on removes the property |

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
  synopsis, and only then removes that text from the first note.
- "Merge" appends the other notes' text to the first, a blank line between, joins their synopses the same way, reads
  the result back to check every note's text is in it, and only then moves the others to the trash.
- "Duplicate" copies files byte for byte. A copied folder keeps its order, and its folder note is renamed to match.
- "Compile" writes one new note outside the binder (replacing a note of that name if there is one) and changes none
  of the binder's notes.
- "Rewrite" with "Start from a blank page" and "Bring back" in the Snapshots dialog replace a note's text, after
  keeping it as a snapshot (below). The note's properties are left byte for byte.

## Snapshots

A binder can have a folder named `Snapshots` at its top. It holds earlier texts of the binder's notes and is not part
of the binder: it never appears in `contents`, in a binder view, in a word count, the filter or a compile, and
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
  whole name.
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
