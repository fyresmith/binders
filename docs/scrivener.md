# Coming from Scrivener

Binders borrows Scrivener's way of working and puts it inside Obsidian, on plain Markdown files. Most of what you
know has the same name. This page maps Scrivener's words to Binders'.

Run **Import from Scrivener...** from the command palette to bring a project in as a new binder.
[Import from Scrivener](import-scrivener.md) says what comes across and what doesn't.

## Scrivener's words, and where each is

| In Scrivener | In Binders | Page |
|---|---|---|
| The project | A **binder**: a folder in your vault | [Getting started](getting-started.md) |
| The Binder (the sidebar) | Obsidian's file explorer, in binder order, and the **Contents** in the sidebar | [The file explorer](file-explorer.md) |
| Draft, or Manuscript | The binder's own notes and folders | |
| Research | Notes and folders in the binder with **Include in export** off | [Export](export.md#leaving-a-note-out) |
| A document | A note | |
| A folder | A folder. Its own synopsis and label are kept in a folder note | [How your files look](files.md) |
| Corkboard | **Corkboard** | [Corkboard](corkboard.md) |
| Arrange by Label | **Arrange** → **By label, across** or **By label, down** | [Corkboard](corkboard.md#arrange-by-label) |
| Outliner | **Outliner** | [Outliner](outliner.md) |
| Scrivenings | **Manuscript** | [Manuscript](manuscript.md) |
| Inspector | **Inspector**, in the right sidebar | [The inspector and the contents](inspector.md) |
| Synopsis | **Synopsis** | |
| Document notes | **Notes**, in the inspector | [Scene notes](scene-notes.md) |
| Label and Status | **Label** and **Status** | [Labels, statuses and targets](labels-statuses-targets.md) |
| Document and project targets | **Target** on a note, a folder or the binder | [Labels, statuses and targets](labels-statuses-targets.md#targets) |
| Session target | **Words to write today**, in focus mode | [Focus mode](focus-mode.md) |
| Snapshots | **Snapshots** | [Snapshots](snapshots.md) |
| Split at Selection | **Split scene at cursor** | [Splitting, merging and grouping](splitting-and-merging.md) |
| Split with Selection as Title | **Split scene with selection as title** | |
| Merge | **Merge 3 notes** | |
| Group, Ungroup | **New folder from selection**, **Ungroup** | |
| Include in Compile | **Include in export** | [Export](export.md) |
| Compile | **Export** | [Export](export.md) |
| Compile formats | **Styles**, with an editor | [Styles](export-styles.md) |
| Section types | **Export as**: part, chapter, scene, front matter, back matter | [Book details and structure](book-details.md) |
| Composition mode | **Focus mode** | [Focus mode](focus-mode.md) |
| Typewriter scrolling | **Typewriter scrolling**, in focus mode | |
| Custom metadata | Any property of a note, as a column in the outliner | [Outliner](outliner.md) |
| Keywords | Obsidian's tags | |
| Document links | Obsidian's links | |

## What is different

- **Your book is plain files.** Each scene is a Markdown note and each folder a folder. There is no project file, and
  any tool that reads text reads your book. See [How your files look](files.md).
- **Plain text, not rich text.** You write Markdown: `*italics*`, `**bold**`. Fonts, spacing and indents are given
  when you [export](export.md), not while you write.
- **One structure rule.** Where Scrivener has section types and section layouts to wire together, Binders reads
  parts, chapters and scenes off the binder's shape and lets you overrule it note by note.
- **Starting a paragraph with Tab works**, and shows as an indented paragraph. See [Paragraphs](paragraphs.md).
- **Splits and tabs are Obsidian's.** To see two things at once, open a note to the right, or a second binder view
  in another tab or pane.

## Not there yet

- **Collections** and saved searches. The **Filter** by label and status is the nearest thing.
- **Find and replace across the manuscript.** Ctrl+F in a binder view, with Replace all behind a review and a snapshot. See [Find and replace](find-and-replace.md).

## Working with someone who uses Scrivener

**Export → Scrivener project** writes the binder as a Scrivener 3 project, with its order, synopses, labels,
statuses, targets, snapshots and notes. Import brings a project back as a new binder; it doesn't merge changes into the one it came from. See
[Scrivener project](export-scrivener.md).

Next: [Getting started](getting-started.md)
