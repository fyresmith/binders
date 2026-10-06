// The example books, in the order the README lists them. Each: its folder, what it is (`about`), what to try in it
// (`tryIt`), and `make(add, rand)`, which adds its files and may return what it counted (words, notes, folders).
import { corran } from './corran.mjs';
import { bible } from './corran-bible.mjs';
import { hives } from './hives.mjs';
import { kettleby } from './kettleby.mjs';
import { weather } from './weather.mjs';
import { press } from './press.mjs';
import { varga } from './varga.mjs';
import { french, german } from './languages.mjs';
import { scripts } from './scripts.mjs';
import { winter } from './winter.mjs';
import { markdown } from './markdown.mjs';

export const EXAMPLES = [
	{
		folder: 'Low Water at Corran', make: corran,
		about: 'A full-length novel, about 93,000 words: three parts of ten chapters, each chapter a folder of scenes (three levels), a prologue and an epilogue, a dedication and an epigraph before, acknowledgements and “About the author” after. Every scene has a synopsis, a point of view (the label, and a `pov` property), a status, a target and some a `notes` property; three scenes are left out of export.',
		tryIt: 'All three views on a real book; the outliner with `pov` and `notes` as columns; arrange by label; Export’s Manuscript with and without front and back matter (it should guess “parts, chapters and scenes”).',
	},
	{
		folder: 'Corran story bible', binder: false, make: bible,
		about: 'Not a binder: the novel’s people, places and timeline, in a folder beside it. The novel’s scenes link to these notes.',
		tryIt: 'Backlinks from a character’s note to the scenes they are in; that none of this is in the binder, its word count or an export.',
	},
	{
		folder: 'Twelve Hives', make: hives,
		about: 'A novella, about 34,000 words, with chapters only: twelve folders named “One” to “Twelve” (a chapter with a number and no title), two or three scenes in each. First person, typed with curly quotes, scene breaks typed `* * *`. The chapter folders are labeled by season.',
		tryIt: 'Export should guess “chapters and scenes” here, where the novel is “parts, chapters and scenes”; chapter headings that are a number alone; curly quotes left as they are.',
	},
	{
		folder: 'Kettleby Junction', make: kettleby,
		about: 'A novel that is one flat list, about 55,000 words: 36 notes named “01 The up distant”, every note a chapter. Typed with a tab at the start of every paragraph, one line after another, as a novelist types or Scrivener exports, with italics, links to notes and links to the web on those lines. Its last two notes are left out of export.',
		tryIt: '“Start a paragraph with a tab” and first-line indents in all three views; renaming “People on the line” (the links on tab-led lines should follow); Export should guess “every note a chapter”, take the number off each title, and drop the tabs.',
	},
	{
		folder: 'Nine Kinds of Weather', make: weather,
		about: 'A collection of short stories, about 12,000 words, each with its own shape: a note with its title as a heading, a folder of three scenes, a note with numbered sections, a paragraph of flash fiction, a folder with a folder inside it, a story in nine fragments, one that is nearly all talk, one with an epigraph and a footnote, and one that is only a card. `structure` is set by hand in the binder note.',
		tryIt: 'The corkboard with folders and notes side by side; the manuscript across stories; Export with `structure: chapters and scenes` (each story a chapter), and its warning for the folder that is too deep.',
	},
	{
		folder: 'The Kitchen Table Press', make: press,
		about: 'A handbook, about 5,500 words: three parts of chapters (folders named “Part …”, notes as chapters), a preface, and front and back matter in folders of those names (a glossary, a bibliography). Inside the notes: headings, footnotes of every kind (numbered, named, typed in place, one in two paragraphs, one marked twice, one never marked), tables, lists and a checklist, quotations, callouts, four drawn figures with captions, links between chapters and to the web.',
		tryIt: 'Export’s Manuscript preview: footnotes at the foot, tables, the figures, callouts as quotations, subheadings; Export should guess “parts and chapters”; the “Figures” folder is left out, and its pictures still appear where chapters embed them.',
	},
	{
		folder: 'The Varga Job', make: varga,
		about: 'A draft in progress, about 11,000 words of a book meant to be 70,000: statuses of every kind (some the writer’s own: “Needs research”, “Cut”, a lower-case “draft”), scenes that are only a synopsis, one that is a single 900-word paragraph, `%%comments%%`, highlights and notes to self in the text, targets missed both ways, “Opening”, “Lena” and “Notes” each in more than one folder, `export-as` on five items where the guess is wrong, a “Cut scenes” folder left out of export, a note the list doesn’t mention, and six snapshots (one of a note that is gone).',
		tryIt: 'The outliner’s Progress, Status and Export columns; the filter by status; the Snapshots dialog on “The door”, and “Snapshots of notes that are gone”; Export’s Contents, to see what each `export-as` did, and that no comment reaches the file.',
	},
	{
		folder: 'Die Uhr von Sankt Veit', make: german,
		about: 'German: three short chapters as a flat list, `language: de` in the binder note. Typed with straight quotes, two hyphens and three full stops.',
		tryIt: 'Export should set „these“ quotes and call the file German. Umlauts and ß in names, the outliner and the exported file.',
	},
	{
		folder: 'Le Bac de minuit', make: french,
		about: 'French: three short chapters as a flat list, `language: fr`. Typed with straight quotes and a space before ? and :.',
		tryIt: 'Export should set « these » quotes, with their no-break spaces. Look at the apostrophes (`qu\'il`, `l\'amarre`) in the exported file.',
	},
	{
		folder: 'Other Alphabets', make: scripts,
		about: 'Twelve short pieces: Hebrew and Arabic (right to left), a line that mixes directions, Chinese, Japanese, Korean, Greek and Russian, emoji, accented names (and é written two ways), every kind of dash, dot and apostrophe, verse with line breaks (two spaces, a backslash, a verse indented by four spaces), and a chapter of letters with addresses and a telegram.',
		tryIt: 'Word counts for text without spaces; right-to-left cards on the corkboard and in the manuscript; the verse’s line breaks and the letters’ addresses in an export; that nothing here turns into boxes or question marks in Word.',
	},
	{
		folder: 'The Cartographer’s Winter', make: winter, opens: 'Index',
		about: 'A Longform project that is a real book, about 12,000 words: fourteen scenes in Longform’s own format (two indented under another), each with a synopsis, a status, a label and a target; a file Longform ignores, a scene its list doesn’t mention, and a snapshot.',
		tryIt: 'Reordering (only `longform.scenes` in `Index` should change); “Convert to binder”; Export, where a Longform project is “every note a chapter”.',
	},
	{
		folder: 'What Markdown becomes', make: markdown,
		about: 'One scene for each row of the table “What Markdown becomes” in `docs/dev/export.md`, in the table’s order, each with a synopsis that says what an export should do with it: properties, paragraphs, tabs, italics, quotes, scene breaks, headings, links, pictures, embedded notes, footnotes, comments, highlights, tags, callouts, quotations, lists, tables, code, math and block ids (and one for HTML, which the table doesn’t decide).',
		tryIt: 'Export it as a Manuscript and as One note, and read the file beside the corkboard: each card says what its page should look like. The window’s list of what is left out or changed should name each of these.',
	},
];
