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
filters:                  # optional: saved filters (see the table)
  - name: Mara, not yet revised
    conditions:
      - property: characters
        operator: contains any of
        value: "[[Mara]]"
      - property: status
        operator: is not
        value: Revised
inspector:                # optional: the properties pinned to the inspector, in order
  - pov
  - characters
---
Anything you like: notes on the book, links, a to-do list.
```

| Property | Type | Meaning |
|---|---|---|
| `binder` | number | Format version, `1`. Binders refuses (and never rewrites) a binder note whose version is newer than it knows, and one whose value it doesn't understand (text, `0`, a fraction): such a binder is listed, read only, and says why. A bare `binder:` or `binder: true` means 1. |
| `contents` | list of text | The binder's order. Paths use `/`, are relative to the binder folder, have no `.md`, and folders end in `/`. |
| `target` | number | Optional word count goal for the binder, shown in the view's toolbar. |
| `filters` | list of maps | Optional: the binder's saved filters, in the order the popover lists them. Each has a `name` (unique, compared as text is), `conditions` (a flat list of `property`, `operator`, `value`: `file.name`, `file.folder`, `file.words`, `file.ctime`, `file.mtime` are the file's own; operators are Bases' words, `>=` and `≥` both read; one value plain, several a list) and, only when not "all", `match: any` or `none`. A condition that isn't whole is skipped, so a half-made row filters nothing. Room is left for nested groups: a condition we can't read is kept where it is. No format change: a Binders that doesn't know it leaves it alone. Read tolerantly (an entry without a name, or that isn't a map, is passed over); written by editing the list as the note has it, so entries, keys and conditions Binders doesn't understand are never dropped. Never written in a binder of a newer format, nor in a Longform project's index note. Save, rename, duplicate, delete and move are each one step in the undo history; changes to a saved filter's conditions are not. `inspector`, `revision` and the rest are never touched by it, and it is never touched by them. |
| `deadline` | date | Optional: the day the binder's target is to be reached by, as Obsidian's own date type (`YYYY-MM-DD`; a date and a time are read as the day). It has no meaning without a `target`. See "A deadline" in [Progress](../progress.md#a-deadline). Not part of the format version: a Binders that doesn't know it leaves it as it finds it. Written only through the progress window, in one change with the target and the writing days (`writing-days` and the target are kept or taken away with it as the form says), and never in a binder of a newer format or a Longform project's index note. A folder note may have the same two for the folder's own deadline. Taking the deadline away leaves the target. |
| `writing-days` | list of text | Optional, with `deadline`: the weekdays that are written on, as names (`Monday`, `Tuesday` and so on), Monday first. Read in any case and by their first three letters; names that aren't days are ignored, and none (or the property missing) is every day. Written as names, and taken away when all seven days are written on. |
| `inspector` | list of text | Optional: the names of the properties the binder pins to the inspector, as rows under Label and Status, in this order (`pov`, `characters`, a place, any property of the writer's). It is view setup, not the writer's text, and no format change: a Binders that doesn't know it leaves it alone. Read tolerantly: a lone text is one name, a name once whatever its case, anything that isn't text is ignored; written without dropping what isn't understood (a number or a map in the list stays where it is) and taken away when its last name is. Never written in a binder of a newer format, nor in a Longform project's index note (a Longform project pins nothing). Binders' own names (`status`, `label`, `synopsis`, `export`, `contents`, a book's `title` and the rest) can't be pinned: they have rows or fields of their own. A property's *type* is Obsidian's (`.obsidian/types.json`), not kept here. Changing the list is not in the undo history; changing a value in a pinned row is. |
| `calendar` | map | Optional: the book's own calendar. `months` is a list, each `- Name: days` (or `{ name, days }`; 1 to 99 days, at most 99 months), or `none` for a book counted in years only; `leap` is an optional list of rules, each `month` (a month's name or number), `days` (1 or more; default 1), `every` and optionally `except` and `unless` (years). Absent, or `Gregorian`, is the ordinary calendar. A scene's `story-date` keeps its ISO shape in it: the year on the book's one count, the month by its number in `months` (`0802-11-14`); so renaming a month or an era rewrites no note. Read tolerantly: a month without a name or a length is passed over; a value that can't be read at all (`calendar: Middle-earth`, `months: twelve`), or a leap rule for a month there isn't or of fewer than one day, makes the calendar one Binders can't read, and then no story date is written in the binder until it is put right (the timeline says so). Written only by the Calendar dialog, as one change Undo takes back, never in a binder of a newer format or a Longform project's index note. Not part of the format version: a Binders that doesn't know it reads the book's dates in the ordinary calendar (a month past twelve is then not a date, and left as written). |
| `eras` | list of maps | Optional: named stretches of the book's years, each `name`, optionally `abbr` (else the initials of the name, leaving out "the", "of", "a" and "an"), `from` (its first year on the book's count; only the first era may have none, and runs from the start of time) and `counts: down` (its years count down to 1, the year before the next era begins, as BC does). Read in order of `from`. They change how years are shown and typed ("12 LQ"), never what is written. Written with `calendar`, by the same dialog. |
| `labels` | list | Optional: labels of the binder's own, in place of the vault's (Binders' settings). A list, each `- Mara: blue` (a name and its color: one of the theme's color names or a hex color; `{ name, color }` is read too). Absent: the vault's labels apply. An empty list (`labels: []`): no labels. Used by every note of the binder, in the list's order, wherever labels are shown or chosen. Read tolerantly (blank, repeated or malformed entries are dropped). Not part of the format version: a Binders that doesn't know it uses the vault's. Written only by the Labels page of Binder settings (not in the undo history), never in a binder of a newer format or a Longform project's index note. Copied by "Save as binder template". |
| `statuses` | list of text | Optional: the same for statuses: `statuses: [Idea, Draft, Done]`. Absent: the vault's; empty: none. |
| `synopsis`, `status`, `label` | | The binder's own card data, as for scenes (below). |
| `template` | link or text | Optional: the template new notes in the binder start from, as a link to a note (`template: "[[Scene]]"`), usually one in the templates folder of Obsidian's Templates plugin. A folder note may have it too, for its folder; a folder without it takes the nearest folder's above it that has it, up to the binder note. Empty (`template: ""`, or a link that leads to no note) says none: new notes there start empty, whatever a folder above says. Written by the New menu's "Template for new notes" (one change in the undo history; "Same as …" takes the property away). Not part of the format version: a Binders that doesn't know it leaves it alone. See [Templates](../templates.md). |
| `revision` | link | Optional. The binder's revision note, as a link: `revision: "[[Revision]]"`. Written when the first revision task is added (see "Revision tasks", below); a writer can point it at a note they already keep. Not part of the format version: a Binders that doesn't know it leaves it as it finds it. |

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
- A folder note's `template` names the template the folder's new notes start from (the binder note's table, above).

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
- A binder note inside a binder (a nested binder) is an ordinary note in format 1, or the folder note if it's named like its
  folder.
- If a folder has several binder notes, the one named like the folder is the binder note; otherwise the first by name.
- The vault's top level can't be a binder.
- Ordinary ordering writes only `contents` (and the properties the writer edits) in the binder note. Restoring
  **Everything** from a snapshot can restore the whole file, after review and a snapshot of now (below).
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
- "Undo last change" on a move writes the list back as it was before the move, and moves the items back to the
  folders they were in. It refuses if a place has been taken or a folder is gone. History is kept in memory:
  100 entries per binder, with 32 MB of kept bytes shared across binders. It is cleared when the plugin unloads.
  Property edits, renames, creation, note duplication, deletion, merge and split also use this history; see
  [Undo and redo](../undo.md) and `src/history/`.
- "Ungroup" moves a folder's items out to where it stood. If nothing is then left in the folder but its folder note
  (in the vault and on the disk), the folder goes to the trash with that note, as Obsidian's "Deleted files" setting
  says. The note's bytes are kept in memory with the move, and "Undo last change" makes the folder again, writes the
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

Each note in a binder can have these properties. They are ordinary Obsidian properties. The names of `title`, the first four,
of `story-date`, `story-order` and of `notes` can be changed in settings; `export` and `export-as` are fixed.

| Property | Type | Used for |
|---|---|---|
| `title` | text (or a number) | The name Binders shows for the note, wherever it shows a note's name (cards, outliner rows, manuscript headings, the inspector, the contents, find and replace, menus and notices, the file explorer, and the headings and contents of an export) in place of the file name (the name can be changed in settings). Whitespace is folded and trimmed; empty, a list or a yes/no is none. The file's name, its path and the links to it are not touched: the title is display only. Editing a shown name in a card, an outliner row or a manuscript heading writes this property when the note has it, and renames the file when it doesn't (the file explorer's own rename always renames the file). A new note has none. A split note's new notes do not copy it. A folder is always shown by its name. Binders reads it through Obsidian's metadata cache (`src/shown-name.ts`). |
| `synopsis` | text | The corkboard card's text, and the text under the title in the outliner |
| `status` | text | A chip on the card, a column in the outliner, and a filter. Settings list the statuses offered (Idea, Draft, Revised, Done to start with); any other text works too |
| `label` | text | The note's color: the border and tint of its card, a dot in the outliner and in the file explorer, and a filter. See below |
| `target` | number | A word count target for the note: progress on its card, and the outliner's Target and Progress columns. A whole number above zero and up to a billion; text such as `"1,500"`, `"1 500"` or `"1.500"` is read as 1500; anything else (`1.5`, `lots`, `0`) is no target |
| `story-date` | text or number | When the scene happens in the story (the name can be changed in settings). ISO text: `1987-06-14` a day, `1987-06` a month (placed at its start), `1987` a year (YAML reads a number; so does the reader), a year padded to four digits (`0412-10-14`) and with a minus before year 0 (`-0030-02-01`). A time (`1987-06-14T21:30`, seconds allowed) is read and kept and orders scenes within a day; the finest thing shown or set is a day. Months are numbers. Reading is forgiving (`14 June 1987` is read too); writing is exact: a four-digit year is the number, any other year alone is padded text (`"0412"`, `"-0030"`), and a day or a month is plain text. A value that isn't a date (`sometime in spring`) is left exactly as typed, shown as it is, sorted with the undated notes, and never rewritten unless a date is set on that note; clearing removes the property. In the binder's own calendar when its binder note has one (`calendar`, `eras`, above): months are then numbers into its months, and words are read in its month and era names. A folder's is in its folder note. See `docs/story-date.md` |
| `story-order` | number | A scene's place among the scenes of the same `story-date` (the name can be changed in settings): `1` is first. A whole number, or text that is one; anything else is ignored and left as typed. It means something only among scenes whose date is the same exact value (a month-only date orders among the same month-only value). Order of a story-date sort: by date (a time is part of the date), then `story-order` (those without one after those with), then the binder's order; so on a day, scenes with no time come first, then the timed ones by time. Binders removes it in the same write (and undo step) that changes or clears a scene's `story-date`, since the number belonged to the old day; setting the same date again leaves it. No column or inspector row of its own. |
| `notes` | text | The writer's own notes on the note: left out of exported books. Typed in the inspector or the outliner's Notes column, as plain text of as many lines as are typed (YAML writes them as a block). A folder's are in its folder note, the binder's in the binder note. Clearing them removes the property. The Scrivener project export carries them as the document's notes |
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
- A note made with New (or New scene here, New note after this) in a folder with a template, or with "New note from
  template", is made with the template's text: its properties as written (so their types are kept), `{{title}}`,
  `{{date}}` and `{{time}}` filled as Obsidian's Templates plugin fills them, Templater's `<% %>` left as written, and
  `binder` and `contents` left out. When the name typed for it is saved, its `{{title}}` is filled again with that
  name, only if the note is still byte for byte what was made; it is part of making the note, which one Undo takes away.
- "New binder" from a template makes a new folder: one of Binders' own is written as notes with only a synopsis, the
  binder note last with the order; one of the writer's (a binder or Longform project in the templates folder) is copied
  byte for byte, without its `Snapshots` folder, its own note renamed with it. Undo takes the new folder to the trash
  only while every file in it is still exactly as made.
- "Save as binder template" writes a copy of a binder in the templates folder, the same way, and changes nothing in
  the binder. Without "Keep the notes' text", each note in the copy keeps its properties block as written and no text;
  the binder note, folder notes and the revision note are copied whole.
- "Duplicate" copies files byte for byte. A copied folder keeps its order, and its folder note is renamed to match
  (as is the folder note of a folder copied outside Binders: see "Keeping the list up to date").
- "Export" writes a file (a Word manuscript where you say, or in the `Exports` folder; or one new note outside the
  binder, replacing a note of that name if there is one) and changes none of the binder's notes: not their text,
  and not their properties.
- "Rewrite" with "Start from a blank page" and "Bring back" in the Snapshots dialog replace a note's text, after
  keeping it as a snapshot (below). The note's properties are left byte for byte. That holds for one note brought
  back from a snapshot of its folder too.
- From a snapshot of a folder or the binder, "Bring back" on a note that is gone makes that note again (a new file,
  under a name that is free), and "Make a binder (or folder) from this snapshot" makes a new folder of new notes
  beside the one it is of. Neither writes to a note that is there.
- "Bring back..." with "The text of the notes", "The order" or "The text and the order" writes only the chosen
  text and order. The text of each note
  that is there and reads differently is replaced by the text it had, as one note's is (its properties, a
  byte-order mark and its name left byte for byte), after one snapshot of the whole folder as it is, which holds
  every text replaced. And the order: the binder note's `contents` (a Longform project's `longform.scenes`),
  written as any reorder is. No other property is written, and no note or folder is made, renamed, moved or
  deleted.
- "Bring back..." with "Everything" can restore whole note files (properties included), make missing notes and
  folders, and put names, locations and order back inside the snapshot's folder. It takes a snapshot of now first,
  reviews the changes with the writer and records the recovery plan in `Snapshots/Bringing back.binder-journal`
  before applying them. Notes or folders written since stay, or move to one folder if chosen; nothing is deleted.
  It clears the binder's session undo history. See [Snapshots](../snapshots.md#everything) for matching, concurrent
  changes, occupied names and interrupted recovery.

One change to a note's text is made without a command, and it is this and nothing wider. When a note or file is
renamed or moved, "Start a paragraph with a tab" is on and Obsidian's "Automatically update internal links" is on
(or it is off and the writer answers Obsidian's prompt with "Just once"), Binders rewrites the links to it that stand in paragraphs begun with a tab, in notes that are in a binder. Obsidian
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

A binder note whose properties can't be read (the YAML doesn't parse) has no properties, so the folder is not in a
binder until it is mended: the binder view says the folder isn't in a binder, the file explorer lists it in Obsidian's
own order, and nothing is written to the note meanwhile. Mending the YAML brings the binder back with the order the
note holds (the view follows an edit made on the disk, in another app or by hand).

Setting a property goes through Obsidian, which writes the whole properties block again in its own form: comments in
the block are dropped, and values are written as YAML reads them (`0123` becomes `123`, `1.0` becomes `1`). Obsidian's
own Properties view does the same. The note's text is never touched.

Two kinds of note are written by Binders itself, because Obsidian's writer would damage them: a note that opens with a
`---` block that isn't properties gets its properties as a new block above that text, and a note that starts with a
byte-order mark has its block rewritten in place after the mark.

## Snapshots

A binder can have a folder named `Snapshots` at its top. It holds earlier texts of the binder's notes, and snapshots
of its folders and of the binder itself (next section), and is not part of the binder: it never appears in `contents`, in a binder view, in a word count, the filter or an export, and
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

## Snapshots of a folder or of the binder (`binder-snapshot: 1`)

A snapshot of a folder is one plain-text file that holds everything in the folder as it stood. It has a format
number of its own, apart from the binder's.

```
The Lighthouse/
  Snapshots/
    2026-10-05 16.20.05 Draft sent to Sam.binder-snapshot      the binder's
    2026-10-06 21.15.02 Before bringing back Draft.auto.binder-snapshot
    Part One/
      2026-10-03 09.12.44 Before the new order.binder-snapshot   the folder's
      Arrival/
        2026-10-01 14.32.07 First draft.snapshot                 a note's (above)
```

- **Where.** In `Snapshots/` under the folder's own path in the binder; the binder's own at its top. A folder's
  files and the folders of its notes' snapshots share that folder. A note and a folder of one name share it too:
  `.snapshot` files there are the note's, `.binder-snapshot` files and folders are the folder's.
- **Its name** is a note's snapshot's: when it was taken, local time, then its name if it has one, counted on if
  taken (`… (2)`). Naming one renames its file. One Binders took unasked ends in `.auto` before the extension, and
  is named for why; only those may ever be thinned. Giving one a name takes the `.auto` away. Binders takes one
  before it brings a snapshot back ("Before bringing back", then that snapshot's name, or `the one from
  2026-10-05 16.20` for one with no name or one Binders took), unless the folder's newest snapshot already holds
  exactly what is there. None is thinned yet.
- **The file:**

  ```
  ---
  binder-snapshot: 1
  binder: "The Lighthouse"
  of: ""
  taken: 2026-10-05T16:20:05
  notes: 7
  words: 5204
  ---
  Everything in “The Lighthouse” as it stood, in its order. Each item starts at a line of ===== that says what it is and how long; a note’s file follows, exactly as it was.

  ===== "The Lighthouse.md" | binder note | 312 characters | 5f0c3a9e77b1d204 =====
  ---
  binder: 1
  contents:
    - Prologue
  ---
  ===== "Prologue.md" | note | 96 characters | 0b16f77849df045b =====
  ---
  synopsis: The light, seen from the sea.
  ---
  The light came round every twelve seconds.
  ===== "Part One/" | folder =====
  ===== "Part One/Part One.md" | folder note | 41 characters | f36c52fb4c7a7096 =====
  ---
  synopsis: Mara arrives.
  ---
  ===== "Part One/Arrival.md" | note | 88 characters | 8237ba997f642c0f =====
  The supply boat left Mara on the jetty with two cases and a letter she had not opened.
  ===== "map.png" | file | 48213 bytes =====
  ```

| Property | Meaning |
|---|---|
| `binder-snapshot` | The format, `1`. A file with a larger number is listed and says a newer Binders made it; this version never opens, renames, deletes or thins it |
| `binder` | The binder's name when it was taken (for a reader; nothing depends on it) |
| `of` | The folder it is of, as a path in the binder, `""` for the binder itself (for a reader: where the file is says whose it is, and that follows renames) |
| `taken` | When, local time |
| `why` | Only on one Binders took unasked: what it was about to do |
| `notes`, `words` | How many notes and words it holds, so a list can say so without reading the rest |

- **The items** follow one line of prose and a blank line, in the binder's order, each opened by a line
  `===== "<path>" | <kind>[ | <n> characters | <fingerprint>] =====`. The path is in the folder the snapshot is of,
  written as JSON text; a folder's ends in `/`. The kinds are `note`, `folder`, `binder note` and `folder note` (the
  note that holds a folder's own data, which comes right after its folder's line; the snapshotted folder's own
  comes first of all), and `file` for a file that isn't a note, which has `| <n> bytes` and no text: it is listed,
  not kept.
- **A note's text** follows its line: the note's whole file, properties and all, exactly `<n>` characters as
  JavaScript counts them (UTF-16 units), then one line break that is not part of it. It is read by that length, so
  nothing in a note can be taken for the next item. A byte-order mark, CR LF, a lone CR and a missing last line
  break are all kept as they were.
- **The fingerprint** is sixteen hex digits of the note's text (`fingerprint` in `src/binder-snapshot-text.ts`).
  Reading checks every note against its length and fingerprint, and that there are as many notes as the head says.
  A file that fails any of it (changed by hand, cut short by a sync) is still shown, says which notes don't match,
  and nothing is brought back or made from it.
- **Line endings.** Binders writes LF. If a tool has rewritten every line break in the file to CR LF (git does, on
  Windows, unless `.gitattributes` says `*.binder-snapshot -text`), the file is read with them put back; a note
  that had CR LF of its own then doesn't match its fingerprint and says so.
- **The order** is the order of the items. The binder note's own `contents` is in its text too, but nothing reads
  the order from there. A Longform project's scenes are in Longform's order; its index note is in the snapshot only
  when it is inside the scene folder.
- **Written once.** Binders never changes a snapshot file. It writes it, reads it back from the disk and compares
  before it says one was taken.
- **Nothing is taken twice in a row:** a snapshot that would hold exactly what the folder's newest one holds (the
  same items in the same order, every note's file the same) isn't written. Asked for under a name, the newest one
  takes the name if it has none.
- **Renames and moves.** When a folder is renamed or moved in its binder, or to another binder, its snapshot files
  go with it, as its notes' snapshot folders do; nothing is written over (a clashing name is counted on). A folder
  that is deleted or leaves every binder leaves its snapshots where they were.
- **Size.** About the size of the folder's notes: half a megabyte for a novel of 100,000 words.
- **The plan of a bringing back** (`Snapshots/Bringing back.binder-journal`, at the top of the binder's
  "Snapshots", one per binder). Written before "Bring back..." with "Everything" makes, renames or moves anything,
  and written again with `finished` set when it is done; the next one is written over it. It is JSON: `journal`
  (its format, `1`; a larger number is left as it is, and nothing is brought back in that binder until Binders is
  updated), `of` (the folder, as a path in the binder), `snapshot` and `before` (the two snapshot files' paths),
  `title`, `since` (`stay` or `gather`), `started`, `finished` (0 while it is under way), and `plan` (`made`,
  `moved`, `written`: paths, for a reader). Binders only reads `of`, `snapshot`, `before`, `since` and `finished`
  from it, looks the folder and the snapshots up in the binder itself, and never writes a note on its word. It is
  never deleted by Binders.
- Everything said above of `.snapshot` files holds for these: not notes, not indexed, never in the binder's order,
  counts, views or exports, never listed in the file explorer, and carried by Obsidian Sync only with "Sync all
  other types" on (and, on its Standard plan, only up to 5 MB a file).

## The record of a binder's writing (`binders-history: 1`)

Binders keeps a record of each binder's writing: one plain-text file for each device and year, in `History` in the
binder's `Snapshots` folder (a Longform project's, in its scene folder). It holds only numbers and names: never a
note's text. It is not a note, is not indexed, and is never in the binder's order, counts, views or exports.
Sync carries it only with "Sync all other types" on, like the snapshots.

- **Name:** `<year> <label> <device id>.binder-history`, for example `2026 MacBook a1b2c3.binder-history`. The label is
  how the writer named the device (settings, "This device is called"), with what a file name can't have turned into
  spaces. The id is six hex digits, made once for a device and kept in Obsidian's local storage for the vault, on that
  device (not in the vault, the settings or a note, so a copy of the vault on another device doesn't share it). The
  year is the year of the record's day (below), so a night's writing after midnight on 1 January is still last year's.
- **A device writes only its own file** and never another's. Reading adds the devices' files together.
- **One JSON object to a line.** A file cut short loses its last line, and the rest reads without Binders. A line
  that can't be read is passed over and kept when the file is written again; so is a line of a kind this version
  doesn't know. A file is written to a temporary name (`….binder-history.tmp`) and moved into place.
- **The first line is the header:** `{"binders-history":1,"device":"a1b2c3","label":"MacBook","kind":"desktop","year":2026}`.
  `kind` is `desktop`, `phone` or `tablet`. A file whose version is newer than this Binders knows is read as far as it
  is understood and never written (golden rule 6's manner).
- **A day ends at four in the morning**, local time, with no setting. Days are `YYYY-MM-DD`.

The other lines are of two kinds.

**A day, `"t":"day"`, one for each day this device wrote on** (the last of two for a day, by `u`, stands):

| Field | What it is |
|---|---|
| `d` | The day |
| `u` | When the line was last written to (ms). Which of two copies of a line is the later |
| `k` | The kind of device |
| `n` | By note (its path in the binder, without `.md`, as it was when typed; renames below): `[added, cut, brought in, taken out]`. Added and cut are words typed and words deleted by typing; brought in and taken out are words that came or went a block at a time: a single change of more than 50 words (a paste, a cut, a chapter deleted, an import) |
| `h` | Words added in each clock hour that had any: `{"21":120,"22":40}` |
| `s` | Sittings: `[first minute, last minute]`, in minutes since 1970; one ends after thirty idle minutes |
| `m` | Minutes in which something was typed |
| `tot` | The binder as it stood when last counted that day, stamped with the time: `{"at":ms,"w":words,"n":scenes,"st":{"draft":words,"":words}}` (words by status, `""` for none) |

**An event, `"t":"ev"`, one for each thing done to the binder:** `at` (ms), `d` (the day), `k` (the kind) and, by kind:

| `k` | Fields | When |
|---|---|---|
| `made`, `gone` | `p`, `w` (words, for a note that had some), `folder` (1 for a folder), `by` | A note or folder made or taken away. `by` says what did it when Binders did: `split`, `merge`, `import`, `duplicate`, `back` |
| `renamed`, `moved` | `from`, `to`, `folder` | A note or folder renamed (same folder) or moved. A scene's history follows its renames |
| `in`, `out` | `p`, `w`, `folder` | A note or folder came into the binder from outside, or left it |
| `status`, `label`, `target` | `p`, `from`, `to`, `folder` | A scene's (or, `folder`, a folder's) status, label or word count target changed. `to` and `from` are the property as written |
| `deadline` | `p`, `from`, `to`, `n`, `folder` | A binder's (`p` missing) or a folder's deadline set, changed or taken away (`to` missing), whether through the progress window or typed into the note's properties. `n` is the target it was set with. A plan begins on the day of the last `deadline` or `target` event of its folder, with the words the book had at the start of that day; with none, on the record's first day. A deadline that came stays on the book's life as a mark |
| `order` | `p` (the folder; `""` is the binder) | The order of a folder's items changed. A run of changes within two seconds is one |
| `snapshot` | `p` (`""` for the binder), `name` | A snapshot taken, with its name if it has one |
| `back` | `p`, `name` | A snapshot brought back |
| `export` | `name` (the kind) | An export made |
| `import` | `n` (notes), `w` (words) | A binder made by import |
| `split`, `merge`, `duplicate` | `p`, `n` | A scene split (into `n`), merged (`n` notes into it) or copied |
| `replace` | `n` (notes), `w` (replacements) | Replace all |

Import, split, merge, duplicate, Replace all and bringing back are Binders' own acts: each is an event and none of them
counts as writing. Where they move words in or out, it is as brought in or taken out.

**Never recorded:** any text, keystrokes or typing speed, time spent without typing, synopsis edits, anything outside a
binder, a device's name beyond the label the writer gave it.

**Two devices.** Each records only what was typed on it. Reading adds the devices' days; a day's total is the one
stamped last; the words that no device typed (an edit in another program, a device without Binders) are the difference
between a day's total and the day before's, less what was logged: "changed elsewhere". A note made, gone, renamed or
moved that the other device records too (Sync brings the note across) is one event, the same thing the same day.

An example file:

```
{"binders-history":1,"device":"a1b2c3","label":"MacBook","kind":"desktop","year":2026}
{"t":"day","d":"2026-10-09","u":1791583200000,"k":"desktop","n":{"Part One/Arrival":[412,38,0,0],"Part One/The keeper":[120,0,300,0]},"h":{"9":380,"10":152},"s":[[29859540,29859612]],"m":58,"tot":{"at":1791583200000,"w":41210,"n":57,"st":{"draft":30100,"revised":9000,"":2110}}}
{"t":"day","d":"2026-10-10","u":1791669600000,"k":"desktop","n":{"Part One/Arrival":[88,12,0,0]},"h":{"21":88},"s":[[29861375,29861395]],"m":14,"tot":{"at":1791669600000,"w":41286,"n":57,"st":{"draft":30100,"revised":9076,"":2110}}}
{"t":"ev","at":1791583260000,"d":"2026-10-09","k":"status","p":"Part One/Arrival","from":"draft","to":"revised"}
{"t":"ev","at":1791583300000,"d":"2026-10-09","k":"renamed","from":"Part One/Landing","to":"Part One/Arrival"}
{"t":"ev","at":1791669700000,"d":"2026-10-10","k":"snapshot","p":"","name":"Before the rewrite"}
```

The size is about 200 to 400 bytes a day, so about 100 KB a year for a device that writes most days. Only the current
year's file is written, every few minutes while there is something new, when the writer leaves the binder, when the app
goes to the background and when Binders unloads; and not at all for a binder in a newer format, or while recording is
off (settings, "Keep a record of your writing"; turning it off deletes nothing).

## Revision tasks

A binder's revision tasks are the checkboxes of one ordinary note, each carrying the link to the scene it is about.
Nothing about them is in the format's version: the note is a note, and the binder note names it in an optional
property.

```yaml
revision: "[[Revision]]"   # in the binder note
```

- **Which note.** The note the link names, found as Obsidian finds any link from the binder note, so a rename or a move
  of the note is followed by Obsidian rewriting the link, and a writer can name a note they keep already (in the
  binder's folder or anywhere in the vault). A `revision` that names nothing, the binder note itself or a folder's
  note means the binder has no revision note. Binders makes one only with the first task: a note called `Revision` in the
  binder's folder (`Revision 2` if that name is taken) and `revision` in the binder note.
- **It is not a scene.** It is not in `contents` and never shown as one: not in the order, the corkboard, the outliner,
  the manuscript, the timeline, a count, find and replace, a snapshot of the binder or an export, and typing in it is
  not counted in the record of the writing. In the file explorer it is listed after the binder's last item, like any
  note the order doesn't name. The same goes wherever it is kept: if the writer moves it into a subfolder of the
  binder, it is still not an item there.
- **Longform projects** have none. A project's index note is Longform's, and Binders writes nothing of its own there,
  so there is nowhere to say which note it is. (A project made a binder with "Convert to binder" has one like any
  binder.)
- **A binder in a newer format, or read only,** gets no revision note made or written (golden rule 6). Its note is
  still read.

### The text

A task is a list item with a checkbox, anywhere in the note (a bullet, a star, a plus or a number; nested or not;
not inside a block of code). A space between the brackets is unfinished; any other character is done, as Obsidian reads
it. Binders writes `x`. A line that is not a well-formed task is text, and is never touched.

```
- [x] [[The keeper]]: “Nineteen years” is said twice in two pages. Keep the secretary’s
- [ ] [[The wreck]]: Red or white? Ask someone who has fired one
	> The flare went up at ten past two, red, and hung over the Skerry longer than it should have.
- [ ] [[Lights out]], [[What the mate saw]]: Eleven minutes of dark or twelve? Pick one and hold to it
- [ ] Check every tide and sunset against the almanac for June 1911
```

- **What a task is about.** The links that lead its line, one after another (`[[A]], [[B]]: …`): the scenes it is
  about. A task about two scenes is listed under both and counted once. A link to a heading or a block names its note;
  an alias or a path is read as Obsidian reads them; a Markdown link to a note works too. A task with no link of its own
  takes its parent item's link, then the heading's it is under. With none it is about the book. A link in the middle of
  the text is only a word.
- **The passage.** Indented `>` lines under a task are a passage quoted for context. It is text: it does not follow
  edits to the scene.
- **What Binders writes** (golden rule 3, fourth exception; `src/revision/tasks.ts`): one item added at the note's
  end, `- [ ] <link>: <text>`, then a tab and `> ` with the passage on one line if there is one, in the note's own line
  ends (a blank line first, if the note does not end in a list); and the one character between one item's brackets. A
  note that ends inside a block of code takes no task. If the line is no longer what was read, or is there twice,
  nothing is written.
- A split leaves the tasks on the first half. A merge points a merged-away note's tasks at the note that stays, as it
  does any link to it (when Obsidian is set to update links).

## Export

What export reads from notes. All of it is optional, so this is still format 1. Exporting never writes to a note.
The book's own details, in the binder note, are written by **Book details** and the **Cover** button of the Export
window (and a style's new name when one is renamed), and by nothing else: only the properties in the second table, only when the writer changes one, through
Obsidian's property writer (the note's text and its other properties are untouched), never in a binder whose format
is newer than this version reads, and never in a Longform project's note. A detail that says nothing is taken out
of the note, not written empty. `export-as` and `export: false` are written by "Export as" (a card's and a row's menu, the
outliner's column, the inspector's row, a row of Contents in the Export window: one write path, `writeExportAs` in
`src/view/props.ts`), on the note or in the folder's note, and nothing else in the note changes. The design is
[export.md](export.md).

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
| `subtitle` | text | The book's subtitle, under its title on the title page |
| `language` | text | A language tag as the standard writes it (`en`, `en-GB`, `de`, `fr-CA`, `zh-Hant`): which quotes are set, which way the text runs, the few words export itself writes ("Chapitre 3"), and what the exported file says it is written in. Book details offers a list and writes only a tag from it; anything else typed here is not a language, is said with the warnings, and the book is taken to be in English |
| `copyright` | text | The copyright page's line (a line of it to a paragraph). Without it, and with an author, the page says `© year author`. A note of the book named "Copyright" takes the page's place |
| `cover` | text | The cover: a PNG or a JPEG in the vault, as a link (`"[[cover.png]]"`, which Obsidian follows when the picture is renamed) or a path. In the ebook it is the book's cover image |
| `title-page` | checkbox | `false`: no title page is made. Written only when it is off. A note of the book named "Title page" takes the made one's place |
| `contents-page` | text | `always` or `never`. Without it a contents page is made when a chapter has a title. (An ebook's own list of contents, the one a reading app shows, is always there) |
| `book-style` | text | The binder's own book style, by name (`Classic`, `Modern`, or a style of the writer's own: see "Export styles"): what an ebook or paperback export that names no style of its own is set in. Written before exports had styles of their own, and by a style's rename; no longer written when a style is chosen in the window (that is the export's, in `exports`). A name that is no style is read as Classic |
| `manuscript-style` | text | The binder's own manuscript style, likewise. Without it, the one last used in the vault |
| `structure` | text | Which rule gives folders and notes their roles: `chapters and scenes` (folders are chapters, notes are scenes), `parts and chapters` (folders are parts, notes are chapters), `parts, chapters and scenes`, or `every note a chapter`. Without it Binders reads the rule off the binder's shape: no folders, every note a chapter; folders one deep, parts and chapters if every top folder's name starts with "Part", "Book" or "Act", else chapters and scenes; deeper, parts, chapters and scenes. A Longform project is every note a chapter |
| `page-size` | text | The binder's own paperback trim size, by its id in `src/export/pages/geometry.ts` (`a5`, for example): what a paperback export with no page of its own is set on. No longer written by the window (the page chosen there is the export's). An unrecognised id falls back to the default size, 5 × 8 inches |
| `series`, `series-number` | text | The series the book is in and its place in it: under the title on the title page ("The Corran Light, Book Two"; a number from 1 to 99 in words) and, in the ebook, EPUB 3's `belongs-to-collection` with its `group-position` (a whole number only) |
| `publisher` | text | At the foot of the title page, last on the copyright page ("Published by …"), and the ebook's `dc:publisher` |
| `edition` | text | On the copyright page, with the year `published` says ("First edition, 2026") |
| `published` | text | When the book is published: `2026-11-03`, `2026-11` or `2026` (the ebook's `dc:date`; anything else is only on the copyright page, by its year) |
| `description` | text | The ebook's `dc:description`, what a store and a reader's library show |
| `keywords` | list | The ebook's `dc:subject`s (a text with commas is read as the list) |
| `contributors` | list | One person each, as `Role: Name` (`Editor: June Hale`): on the copyright page ("Edited by June Hale") and the ebook's `dc:contributor` with its MARC role for an editor, translator, illustrator, cover designer or narrator. A line that isn't `Role: Name` is passed over |
| `rights` | text | More lines for the copyright page, each as typed, after the copyright line ("All rights reserved.", a disclaimer) |
| `exports` | list of maps | The binder's exports: see below |

Book details writes the publishing properties above as it writes the others: one at a time, only when changed, and
taken out of the note when emptied. On the copyright page they come in groups with a line between them: the
copyright line and `rights`; the edition and the export's ISBN; the contributors; the publisher. A manuscript has no
copyright page and none of them.

**`exports`, the binder's exports** (2026-10-15). A list of maps, in the order the Export window lists them; written
only by the Export window, a style renamed or deleted, and a folder or note renamed or moved (below). Until a binder
has one, its exports are the five kinds, one each, named for them (`Manuscript`, `Ebook`, `Paperback`, `Scrivener
project`, `One note`), and opening or choosing among them writes nothing; the first change made to one writes all
five out, then the change. An entry this Binders can't read (no `name`, a `kind` it doesn't know, not a map) is kept
where it is and passed over; a key it doesn't know is kept in its entry when the entry is changed.

```yaml
exports:
  - name: Critique group      # unique in the binder, compared as text is
    kind: manuscript          # manuscript, ebook, paperback, scrivener, note
    style: Standard manuscript   # optional: a style of the kind's family; without it the binder's own
    file: docx                # optional, a manuscript's: docx or pdf; without it the vault's setting
    paper: a4                 # optional, a manuscript PDF's: letter or a4
    folder: Part Two          # optional: only this folder goes out (its path in the binder)
    numbering: from 1         # optional, with a folder or a filter: chapters numbered from 1
  - name: Kindle
    kind: ebook
    page: 6x9                 # optional, a paperback's trim size; without it the binder's `page-size`
    filter: Mara's chapters   # optional: only the notes a saved filter (`filters`) keeps go out
    isbn: 978-1-7390112-0-4   # optional, an ebook's or a paperback's: on its copyright page and in the ebook
    leave out:                # optional: front and back matter, and the pages Binders makes, this export doesn't take
      - "[[The Lighthouse/Also by (Kobo)]]"
      - copyright page        # also: title page, contents page
```

- **What goes out:** the whole book, unless `folder` or `filter` says otherwise (`folder` first if both). A folder
  or filter that isn't there any more is said in the window and nothing is exported. With part of the book, front
  and back matter don't go, and chapters and parts are numbered as in the whole book unless `numbering: from 1`.
  The selected cards are a choice of the window only, never written.
- **`leave out`:** without it an export takes what its kind takes (a manuscript none, unless the window's old
  "Front and back matter" switch was left on, which Binders still reads from its settings; an ebook and a
  paperback all). With it (even empty) the export takes every page
  and note of front or back matter but those listed. A note is a link, followed as Obsidian follows it from the
  binder note.
- **Renames followed:** a style renamed or deleted is renamed in each entry of its family that named it (as
  `book-style` is). A folder renamed or moved within the binder is renamed in `folder`; a note renamed or moved is
  renamed in `leave out`, unless the link already leads to it (Obsidian's own link updating, when on, got there
  first). Only `exports` is written, and never in a binder of a newer format or a Longform project's note.

**What isn't in any note:**

- The folder exported files go to, "Your name" and the contact details for a manuscript's title page are Binders'
  settings, as is the kind last used, the manuscript style and the manuscript's file and paper that an export
  with none of its own takes (per vault).
- The export last chosen in each binder is kept on the device with the places below (`presets`).
- The places exports are saved "without asking", and what each exported file was when export left it (its size and
  time, to tell a file that has been changed since), are kept on the device, in Obsidian's own local storage for the
  vault: a path on one computer's disk means nothing on another.
- An exported file is not a note and Binders keeps no record of it in the vault. In the vault's `Exports` folder it
  shows in the file explorer only with Obsidian's "Detect all file extensions" on.

## Export styles

A style of the writer's own, or the changes made to a built-in one, is one plain file:
`Export styles/<name>.bookstyle`, in a folder at the top of the vault (its name is the setting "Styles folder").
The file's name is the style's name. Binders keeps the folder out of the file explorer, as it does a binder's
`Snapshots`, while it holds nothing but styles: a note, a picture or a folder of the writer's in it and it is shown. Like a snapshot it is not a note: Obsidian doesn't
index it, so it is in no search, switcher or graph, and Obsidian Sync carries it only with "Sync all other types" on.

```yaml
---
export-style: 1              # the format's version
based-on: Classic            # a built-in style, or another style by name
margins: wide                # only what differs from the style it is based on
scene-break: "⁂"
---
/* optional: CSS, added after Binders' own rules in the ebook (and in the PDF) */
```

- **`export-style`** is the format's version, 1. A file that doesn't say is read as 1. A file with a newer one is
  listed with the styles, saying so, is not used (the style it would change, or Classic, is used as it comes), and
  is **never written**: not by the editor, not by Reset (golden rule 6).
- **`based-on`** names the style whose values this one starts from: a built-in style (Classic, Modern; Standard
  manuscript, Standard manuscript, Courier, Plain, for a typesetter, Short story) or another file's style. It also says the
  family: a style is a book style or a manuscript style by the built-in one at the bottom of what it is based on.
  A file named for a built-in style holds the changes made to that style, over the style as it comes. A style based
  on a built-in one is based on it *as it is changed in this vault*. A missing `based-on`, one that names no style,
  or two styles based on each other fall back to Classic, with a warning.
- **The properties** are the editor's rows. Only a value that differs from the style it is based on is written; a
  row put back to that value has its line taken out.

  | A book style | Values |
  |---|---|
  | `typeface` | `EB Garamond`, `Source Serif 4` |
  | `type-size` | points, 9 to 13 |
  | `line-spacing` | a multiple of the size, 1.2 to 1.6 |
  | `paragraphs` | `indented`, `spaced` |
  | `alignment` | `justified`, `left` |
  | `quotes` | `typeset`, `as typed` |
  | `chapter-heading` | a pattern: `{number}`, `{number:words}`, `{number:roman}`, `{title}`; `/` starts a new line; a line whose `{title}` is empty is dropped. Up to 80 characters |
  | `heading-lettering` | `small capitals`, `capitals`, `italic`, `as typed` |
  | `heading-size` | `small`, `medium`, `large` |
  | `heading-alignment` | `centre`, `left` |
  | `space-above` | hundredths of the page, 0 to 40 |
  | `chapter-opens` | `right-hand page`, `next page` |
  | `first-words` | `small capitals`, `as the rest` |
  | `scene-break` | the mark, up to 12 characters; `""` for space only |
  | `running-heads` | `author and title`, `title`, `none` |
  | `page-numbers` | `foot`, `top outside`, `none` |
  | `margins` | `narrow`, `normal`, `wide` |

  | A manuscript style | Values |
  |---|---|
  | `typeface` | `Times New Roman`, `Courier New`, `Courier Prime`, or any font's name (up to 80 characters): Word names it; the PDF uses it if the computer has it, else Courier or Times |
  | `line-spacing` | `double`, `one and a half`, `single` |
  | `italics` | `italic`, `underlined` |
  | `heading` | `chapter and title` (the default), `title only`, `chapter only`; a chapter with no title is headed by its number under `title only` |
  | `chapter-starts` | `a third of the way down`, `at the top` |
  | `scene-break` | the mark, up to 12 characters |
  | `header` | `Surname / TITLE / page`, `page`, `none` |
  | `title-page` | `true` (a page of its own), `first page` (the short story's: contact details and the count at the top of the first page of the text, the title a quarter of the way down, the story under it; no heading over a story of one chapter), `false` |
  | `first-page-header` | `true` (the default), `false`: the first page of the text has no header; it is still counted |

- **A value Binders can't read** (a word that isn't one of a row's, a number outside its range, a list) falls back
  to the style it is based on, and is listed in the Export window with what there is to look at. The rest of the
  file is used.
- **A property Binders doesn't know, a comment, the order of the lines** are the writer's and are left exactly as
  they are: the file is changed a line at a time, never read and written out again (`src/export/style-file.ts`).
- **The CSS** under the properties is kept, and only here: the editor has no field for it. It is added after
  Binders' own rules in the ebook; a style based on another has that one's CSS before its own. It doesn't reach Word.
- **A file that isn't a style's** (no properties between two lines of `---`, or an `export-style` that is no whole
  number) is listed, saying it can't be read, is not used, and is never written.

**What Binders writes.** These files, and only from the style editor in the Export window (golden rule 3): a row
changed writes that row's line; Reset takes every row's line out of a built-in style's file; a built-in style's file
that then says nothing (no property of the writer's, no CSS) is removed; Duplicate makes a file with `based-on` and
nothing else; Rename renames the file, rewrites `based-on` in the styles based on it, and the `book-style` or
`manuscript-style` of the binder notes that named it, and the `style` of their `exports` of that family; Delete moves the file to the trash (as Obsidian is set to
delete), after the styles based on it have been given what they had from it, so they look as they did. A file
changed, added or deleted by anything else (another program, sync) is read again at once.

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
