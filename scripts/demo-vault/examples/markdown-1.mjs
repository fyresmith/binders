// "What Markdown becomes", first half: a scene for each row of the table of that name in docs/dev/export.md, in the
// table's order. [name, what should happen to it in an export (the scene's synopsis), the note's text].
export const ROWS_1 = [
	['01 Properties', 'Properties are never exported: the book has only the one sentence under them.', 'This sentence is the whole of the scene. Its note has six properties above it, and none of them is in the book.\n', { tags: ['sample', 'export'], aliases: ['Row one'], 'a-property-of-my-own': 'kept in the note, never in the book', reviewed: true }],
	['02 Paragraphs and line breaks', 'A blank line or a new line starts a paragraph. Two spaces or a backslash at a line’s end is a line break inside one.', 'A paragraph, then a blank line.\n\nA second paragraph.\nA new line with no blank line before it: a third paragraph, not a space.\n\nA line that ends in two spaces  \nbreaks here, inside its paragraph.\n\nA line that ends in a backslash\\\nbreaks here too.\n'],
	['03 Tabs and spaces', 'The tab or the spaces at a paragraph’s start are dropped: these are paragraphs, indented as the style says, and none of them is code.', '\tThis paragraph begins with a tab.\n\tSo does this one, on the next line, with *italics* and a [[A note to embed|link]] in it.\n\n    This one begins with four spaces.\n\nThis one begins at the margin.\n'],
	['04 Italic and bold', 'Italic and bold, however they are typed. A manuscript style may underline the italics. Struck-through text keeps its words.', '*Italic with asterisks*, _italic with underscores_, **bold with asterisks**, __bold with underscores__, ***both at once***, and a word with it*al*ics inside.\n\nA line with ~~words struck through~~ in it.\n'],
	['05 Quotes, dashes and dots', 'Straight quotes are curled, two hyphens are a dash, three full stops an ellipsis (unless the style says “as typed”). Code is left alone.', '"Double quotes," she said, "and \'single ones\' inside them."\n\nIt\'s the dog\'s dinner, the dogs\' dinner, and the \'90s.\n\nA dash -- like that -- and an ellipsis... and in code `"as typed" -- ...` nothing changes.\n'],
	['06 Scene breaks', 'Each of the three rules is a scene break, set as the style sets one. (The join of two scenes is the folder after this note.)', 'Before the first break.\n\n---\n\nAfter three hyphens.\n\n***\n\nAfter three asterisks.\n\n___\n\nAfter three underscores.\n\n* * *\n\nAfter three asterisks with spaces between.\n'],
	['07 A heading inside a note', 'The heading on the first line is the chapter’s title (not printed twice). The others are subheadings.', '# The title, from a level-one heading\n\nText under the title.\n\n## A subheading\n\nText under it.\n\n### A smaller one\n\nText under that.\n\n###### The smallest\n\nAnd the last text.\n'],
	['08 Links to notes', 'A link is its words. In an ebook it is a link when the note is in the book.', 'A link to [[01 Properties]], which is in the book. A link with other words: [[04 Italic and bold|the fourth scene]]. A link to a heading: [[07 A heading inside a note#A subheading]]. A link to a note left out of the book: [[A note to embed]]. A link to nothing: [[A note that does not exist]].\n'],
	['09 Links to the web', 'A link in the ebook and in Word; only its words in print.', 'A link with [its own words](https://example.com/a?b=1&c=2), an address between angle brackets <https://example.org/plain>, and a bare address https://example.com/bare that Obsidian makes a link of.\n'],
	['10 Pictures', 'Each picture that is found is in the book, with its alt text. The one that isn’t found is left out, with a warning.', 'An embedded picture:\n\n![[sample-picture.png]]\n\nThe same, as Markdown, with alt text:\n\n![A grey frame with a red line across it](sample-picture.png)\n\nWith a width:\n\n![[sample-picture.png|120]]\n\nOne that does not exist:\n\n![[no-such-picture.png]]\n\nAnd text after them all.\n'],
	['11 Embedded notes', 'The embedded note’s text is in the book, one level deep: the note that note embeds is not. Anything else embedded is left out, with a warning.', 'Before the embedded note.\n\n![[A note to embed]]\n\nAfter it. Then part of a note, by its heading, which is left out:\n\n![[A note to embed#Its second part]]\n\nAnd a file that isn’t there:\n\n![[missing.pdf]]\n\nThe end.\n'],
];

/** The folder that follows row 6: two scenes in one chapter. */
export const JOIN = [
	['First of two scenes', 'The last line of this scene and the first of the next have a scene break between them.', 'This is the first scene of the chapter. Its note ends here.\n'],
	['Second of two scenes', 'No heading of its own: it goes on with the chapter.', 'This is the second scene. A scene break stands between this line and the one before it, and no rule was typed.\n'],
];

/** What the scenes embed: left out of the book as a folder. */
export const EMBEDDED = {
	'A note to embed': '---\nsynopsis: Not in the book by itself.\n---\nThis is the text of the embedded note, with a footnote of its own.[^1]\n\n## Its second part\n\nThe second part, under a heading.\n\n![[A note embedded in that one]]\n\n[^1]: The embedded note’s footnote.\n',
	'A note embedded in that one': 'Two levels down: this sentence should not be in the book.\n',
};
