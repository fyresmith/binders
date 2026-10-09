# Paragraphs

Two settings change how paragraphs look in a binder's notes, so that a page of prose reads like a page of a book:
one for writers who start a paragraph with Tab, and one that indents first lines for you.

Both are under **Settings → Binders → Paragraphs**. Neither adds anything to your notes or takes anything away.

## A tab starts a paragraph

Obsidian shows a line that starts with a tab as a block of code: grey, in the code font, with `*stress*` and
`[[links]]` left as you typed them. That is Markdown's rule, and Obsidian has no setting for it. For a writer who
starts a paragraph with Tab it is the wrong answer every time.

With **Start a paragraph with a tab** on (it is on to begin with), a line in a binder's note that starts with a tab,
or with four spaces, is shown as what you meant: a paragraph of your text with its first line indented. Italics,
bold and links work in it, and spell-check is on.

This holds everywhere a binder's note is shown:

- in the note's own tab, in live preview, source mode and reading view;
- in the manuscript;
- in an embed and a hover preview;
- in the Snapshots window;
- in focus mode.

The indent is there from the moment you press Tab on an empty line, before the first letter, and on the new line
Enter gives you at the end of such a paragraph (Obsidian carries the tab on): the cursor waits where the paragraph
will begin.

The note keeps the tab you typed.

## Indent paragraphs

**Indent paragraphs** (off to begin with) sets in the first line of every paragraph that follows another, as a
printed book does, without you typing anything.

The first paragraph of a note starts at the margin. So does a paragraph after a heading, a rule, a list, a quote or
an embedded picture.

On a phone, which has no Tab key, this is the way to an indented page.

## The width of the indent

Both use the same width, so a tab you typed and an indent you didn't look alike, and a paragraph is never indented
twice. The width is 1.5em. A theme or a CSS snippet can change it:

```css
body { --binders-paragraph-indent: 2em; }
```

## What to know about paragraphs that start with a tab

- **It is still code to everything but Binders.** The same note outside a binder, another Markdown app, Obsidian
  Publish or a converter will show the line as a code block. To Markdown that is what the file says. When you
  export, Binders drops the tab and indents the paragraph itself; **One note** has a switch for it. See
  [Export](export.md).
- **Obsidian doesn't track links in it.** Obsidian's index takes the line for code, so a link there isn't among a
  note's backlinks or in the graph, and a `#tag` there isn't in the tag list.
- **Links in it do follow a rename.** When a note or a file is renamed or moved, Binders updates the links to it in
  such paragraphs, as Obsidian does for every other link. This happens only when Obsidian's **Automatically update
  internal links** is on, and only in a binder's notes. A link that could have meant another file of the same name
  is left as it is. This is the one change Binders makes to a note's text that you didn't ask for one by one; see
  [How your files look](files.md#what-binders-writes-and-what-it-never-touches).
- **A real indented code block** in a binder's note is shown as text. Use a fenced block (three backticks) for
  code: those are untouched.
- **Under a list item or inside a quote**, a tabbed line belongs to the list or the quote, as Markdown has it.
- **With Obsidian's Strict line breaks on**, a tabbed line straight under another line of the same paragraph runs on
  with it in reading view, as any line does there.

## Only in binders

Both settings apply to notes in a binder and to nothing else. A note anywhere else in your vault is shown exactly
as Obsidian shows it.

Next: [Focus mode](focus-mode.md)
