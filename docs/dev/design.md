# Design: what "native" means here, and how design work is run

Read this instead of researching it again. When a design round learns something that will hold next time, add a line
here; that is what keeps the next round short.

## What has been learned

**Native is judged against Obsidian itself**, not against other plugins and not by using its CSS variables alone.

- **How to check, not guess:** read Obsidian's own style sheet and code (`app.css` and `app.js` inside
  `obsidian.asar` of the installed Obsidian) and screenshot the thing beside Obsidian's own equivalent (a `.base`
  cards view beside the binder view; Outline or Properties beside a sidebar pane). Look at screenshots taken in the
  middle of an interaction (a drag held, 60 ms after a drop), not only at rest: that is where the first version
  looked wrong. Drags follow Obsidian's own reorder ghost (300 ms, `cubic-bezier(0.2, 0, 0, 1)`) and its drop
  indicator.
- **What the maintainer has turned down, in his words "heavily AI generated"** (2026-10-01): rounded cards with a
  colored stripe along the top, grey pill chips for a status, thin accent or progress lines along a card's foot.
  Using Obsidian's variables is not enough: it has to look designed by a person and still native. Don't propose
  those again. For a restyle, build distinct directions and let him choose from screenshots.

- The binder view is modelled on Obsidian's Bases cards view: edge to edge, a 40px bordered toolbar with the view
  switcher on the left, flat cards with a hairline border.
- Cards are Canvas-style: a label is the card's border plus a faint tint (about 7%) of the same color.
- Selection is a ring in the card's own color, grey when it has no label. Never the accent purple.
- Drags follow Obsidian's `drag-reorder-ghost` (300ms, `cubic-bezier(0.2, 0, 0, 1)`); tree insertion follows its
  `drop-indicator`.
- In the file explorer a binder carries Obsidian's own type tag (`nav-file-tag`), not an icon; the folder a view shows
  is the active row.
- The corkboard shows one folder at a time, with a subfolder as one card you go into, as Scrivener does. Where a
  writer would expect Scrivener's behavior, match it. The card is not Scrivener's stack, though (2026-10-02, below).
- A folder's card is a card like a note's: the same size and the same edge in every state. What tells it apart is on
  it: the plain folder glyph (`lucide-folder`; Obsidian's own `folder` is an open folder, fussy at 16px) and the names
  of the first things it holds, each with its label's dot at the row's end, as the file explorer shows them. The names
  are a look inside, not controls. Several cards carried at once are still a pile.
- Something drawn outside a card's box has to be drawn as that card is in every state, or not at all. The pile was two
  hairline shadows under a card whose own border is two pixels with a label and three when selected: one object at two
  weights. (It was shadows because a card has `content-visibility: auto`, which clips whatever a child draws outside
  it; and with shadows only a diagonal offset keeps the card's corner radius.)
- Headless Obsidian has no pointer that hovers: `(hover: hover)` is false, so no test or screenshot sees a hover
  rule, or what one overrides. To look, start it with
  `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`. That is how
  it was found that a folder a drop would go into showed no ring under a real mouse.
- Jank shows mid-interaction, not at rest: a drag held, 60ms after a drop, a field as the keyboard opens.
- Obsidian's own File recovery dialog hangs its closing button 4px above the line its buttons are on, and a
  `clickable-icon` is 26px beside 30px buttons. Borrowing its classes borrows that: in a row of controls, give every
  one of them `--input-height` (on a phone `--touch-size-m`) and put the closing button on the row. A test measures it.
- A dialog has one filled button, the thing it is for ("Bring back"); what's done less often goes in its menu. A
  switch that only changes what's shown is a toolbar's quiet button (`text-icon-button`, `is-active` when on), not a
  form's toggle with a label.
- What changed in prose is shown as prose: the note's paragraphs in its own font, words taken out struck through and
  words put in tinted where they fall. Not two colored rows per paragraph: that is how code is compared.
- A dialog with nothing to list is one of Obsidian's small dialogs (a title, a sentence, its button row), not the big
  layout with an empty list in it.

- A line that starts with a tab is code to Obsidian because its editor's Markdown mode says so, not its stylesheet:
  the whole line is one token, so no CSS brings back emphasis, links or spell-check. The mode can be wrapped for
  chosen editors (`src/paragraphs/language.ts`), and then Obsidian's own live preview does the rest.
- Obsidian hangs the wrapped lines of any line that starts with white space under its indent, by an inline style on
  the line (which no rule beats without `!important`). It leaves alone a line whose white space is tokenised
  `hmd-indented-code`: keep that name on the white space and the wrapped lines stay at the margin.
- In reading view a code block made from tabs and a fenced one with no language are the same elements. Only
  `getSectionInfo` (the source lines) tells them apart, and `MarkdownRenderer.render` doesn't give a post-processor
  that: what Binders renders itself has to be put right in the text it hands over.
- Scratch files go in the worktree's `test-dist/`, not the session's shared scratchpad: other agents clear it.
- Learned designing export (2026-10-05; `.claude/handoff/export-design/DESIGN.md` has the research, so it isn't
  done again):
  - A big dialog with choices and a preview is Obsidian's two-pane dialog (File recovery, our Snapshots): the list
    and `Setting` rows in the sidebar, a bar with one filled button over the pane. What an item was taken for is
    said in the file explorer's own type tag (`nav-file-tag`).
  - Pages shown in a preview are paper, white in both themes, as Obsidian's PDF viewer has them. In an `<iframe>`,
    give the inner page the theme's `color-scheme` and no background on `body` (a body's background becomes the
    whole frame's), or the frame paints an opaque white box; let the dialog scroll, not the frame.
  - Electron has no hyphenation dictionaries (`hyphens: auto` does nothing), embeds variable fonts as Type 3, and
    can't give a chapter's first page its own margins without a page break after the heading. A book's pages are
    laid out by us and only its lines by Chromium; then the preview is the output.
  - An editor of many options is Bases' "Configure view": a back arrow and a title, the name as a field, then
    groups of rows, each a label over a full-width dropdown or a slider with its value at the left. Its classes
    (`bases-toolbar-menu-container-header`, `bases-toolbar-menu-form`, `input-group-*`, `input-row*`) aren't tied to
    a menu and work in a dialog's sidebar. Changes apply as they are made: no Save, as in Obsidian's settings.
  - "Remember this" beside a result is Obsidian's "Don't ask again": a `label.mod-checkbox`, not a toggle.
  - A style whose typeface can be changed can't be named for its typeface.
  - Headless Obsidian can't open a second `BrowserWindow` (Electron crashes); a hidden `<webview>` prints to PDF.
- Learned designing the inspector (2026-10-05):
  - A view in a sidebar is made of what Obsidian's own are made of, by their classes: a note's properties as rows
    (`metadata-container` > `metadata-properties` > `metadata-property`, a key and a value), a list as `tree-item`
    rows (`is-active` is "the one you're on"), a heading over part of a pane in `--nav-heading-color` and
    `--nav-heading-weight` (as "Linked mentions" is), `pane-empty` when there is nothing to show, and
    `nav-header` > `nav-buttons-container` > `nav-action-button` for a pane's own buttons. No box, fill or line of
    our own.
  - In a sidebar Obsidian itself draws a hairline under each property row, and under 250px of width puts a value
    under its key. The rows' container is measured, not the sidebar: padding round it wraps every row in a sidebar
    at its default 300px.
  - On a phone a sidebar view is a page of the right drawer, with Obsidian's own switcher under it. A `nav-header`
    is moved to the foot there, just above that switcher: a view with tabs of its own has two switchers on a phone.
    A drawer that is shut is still in the page, with no size: ask `rightSplit.collapsed`, don't measure it.
  - A long tree in a sidebar is kept and put right, not drawn again, and its rows get `content-visibility: auto`:
    5,000 rows are 90 ms to make once and 12 ms to check against the binder after a change.
  - A sidebar view follows the tab the writer was last in, not the active one (taking the focus itself makes it the
    active one): the last `active-leaf-change` whose leaf isn't in `leftSplit` or `rightSplit`.
  - At a tab's size `table-of-contents` can't be told from `list`, which is Outline's icon.
  - `getRightLeaf(false)` then `setViewState({ type, active: false })` adds a tab to the right sidebar without
    opening it and without changing which tab is in front: how a view comes with another, unasked.

- Learned designing snapshots of a folder and a binder (2026-10-06; the round's page and numbers are with its
  report, and nothing is chosen yet):
  - A book's contents in a dialog are a sidebar's tree (`tree-item` rows), and what is said about a row goes at its
    end as `tree-item-flair`, in plain muted text. What is different about an item is words there ("+48 −7 words",
    "moved to “The mail coach”"), and a name that is gone or new takes the prose comparison's two marks. No tag, no
    chip, no icon per kind of change.
  - What is the same folds to one line that opens ("27 notes the same"), as the prose comparison folds paragraphs.
    A lone folder in which nothing changed, among ones that did, is shut: opened, it is a page of rows that say
    nothing.
  - A dialog's bar holds a switch or two and the one filled button on a desktop; on a phone or tablet, one switch
    and the button, and the rest goes in the menu.
  - A notice sits over the top right of a sidebar dialog for as long as it shows, which is where the dialog's
    buttons are: a click meant for one lands on the notice. (A script has to clear notices first.)
  - Many small files are slow to make through the vault in a big binder: the store looks at each as it arrives
    (0.05 to 0.3 s a file under load). One file for 5,000 notes is written in a tenth of a second; 5,000 files took
    four minutes.
  - A row's second line that needs its file read (how many words a snapshot holds) is filled in as the row comes
    into sight (`IntersectionObserver` on the list), so three hundred rows open at once.

- Learned bringing import up to the Export window's standard (2026-10-06; the pictures before and after are in
  `.claude/handoff/import-polish/`):
  - A dialog that is a relative of one already built is built from that one's classes, not from rules of its own
    that look like them: import's first version had 126 lines of CSS for a grid, a list and a button row, and looked
    like a web form beside Export. On Export's classes it needs a dozen short rules.
  - What made it look worse, in the order it showed: `Setting` rows at their settings-page size, with a rule
    between each and the label over the field; a list of `modal-sidebar-list-item` rows 37px tall with an icon each,
    indented by padding, where Obsidian has a tree; a footer of Cancel and the filled button, where the family has
    one filled button on the bar and the dialog's own close; a browser's `<details>` triangle; everything on one
    white ground.
  - A list that has folders is Obsidian's tree with folders that fold (`nav-folder`, `collapse-icon`,
    `tree-item-children`): the indent, the guide lines and the keys are then Obsidian's.
  - Things to look at are grouped by what is said, not listed per note: "Part one and 11 others". And what is true
    of every file is not said of any: the first version listed "some typography" for every document, since every
    rich text file names a font size.
  - A sidebar that can be long has to be told to scroll (`min-height: 0` on `.modal-content` and the sidebar,
    `overflow-y: auto` on the sidebar): by Obsidian's rules alone it grows, and pushes the dialog's foot out of the
    dialog. Export's sidebar has the same hole when it has many warnings.
  - On a phone a list beside a text is the list, then the text: the same back button steps from text to list to
    choices. The buttons a phone needs go above anything that can be long.
  - A pattern with a lookbehind breaks the whole plugin on iOS before 16.4; the lint rule catches it.

**Rejected, don't propose again:** a colored stripe along the top of a card, pill chips, thin accent or progress
lines, decoration for its own sake, anything on a card that isn't the writer's own (no badges for snapshots and the
like). The maintainer's word for these was "AI generated".

**How the maintainer chooses:** new things are off by default unless he says otherwise; the smallest version first;
a dropdown over a row of switches; no clutter.

## Rounds

**The folder's card (2026-10-02).** The maintainer: "Redesign the subfolder icon so it is better. The card stack looks
hopelessly inconsistent." What was wrong: the cards under the top one were hairlines whatever the top card's border
was; the gaps between the three edges were uneven; the keyboard's ring was on the top card only; the glyph was an open
folder. Two directions were built: A, a true pile (each card under it drawn from the top card's own ring, label line
and face, at equal steps), and B, no pile (the card names what it holds). He chose B: every card on the board is the
same size and has the same edge, and the folder's card says something the pile never did. Given up: Scrivener's
stack, and "Add a synopsis" offering itself on a folder's card with none (its menu's "Edit synopsis" adds one; the
line would have pushed the names down under the pointer).

**Phones, counts and rings (2026-10-02, decided by the maintainer from QA's findings).** No real device is to hand, so
"emulator is king": what the emulated phone and tablet tests measure is the standard.
- On a phone only, a selected folder card (and an outliner row) with no synopsis offers "Add a synopsis", as a note's
  card does. Desktop stays as the folder's card round left it.
- Tap targets on phones and tablets are 44 px, by padding taken back from margins: nothing moves, and nothing changes
  what a tap does. (A card's title row is therefore the card's top 44 px.)
- A phone on its side with the keyboard up: Binders' toolbar steps aside while something is being typed in a short
  view, and the manuscript runs under Obsidian's header as a note does, the cursor kept clear of it.
- Counts (a card's words, a folder card's "3 notes · 51 words", the outliner's totals) are in the theme's muted text,
  as Obsidian's Bases cards are, not its faintest.
- In a light theme a selected card's ring is its label's color mixed 35% toward the text color, so pale labels show.
- Decided 2026-10-05, and built: "Ungroup" takes the emptied folder away, to the trash, and "Undo last move" brings
  it back (a folder whose note has text of its own stays); a folder copied by Obsidian has its folder note renamed
  to match, when the note is plainly the copied folder note; undo right after a split takes the whole split back.
- Still his to decide: the mode button as "Co…" or as its icon alone at 320 px; whether a manuscript section on a
  phone becomes its editor only when tapped; whether a split lets the second half go when the text hasn't changed.

**Paragraphs (2026-10-05).** The maintainer: "the tab does not display a real tab, but makes a quote thingy. For a
writing app that is a big deal." Two directions were built and he took both: A, a line begun with a tab shown as a
paragraph with a first-line indent (on by default), and B, a first-line indent for every paragraph that follows
another with nothing typed (off by default). One measure for both, 1.5em, no setting; binder notes only; four spaces
count as a tab; B keeps the blank line between paragraphs. Given up: Tab typing something that isn't a tab (an em
space), which would put odd characters in the writer's file. Found on the way: Obsidian's index has its own parser
and takes a tab paragraph for code, so a link there, which A shows as a live link, was not kept up on a rename. He
chose to have Binders keep those links up itself, the one exception to "never rewrites note bodies".

**The inspector (2026-10-05).** The maintainer: "Could we do a right hand sidebar tab for table of contents that shows
the whole binder", then "Launch a design agent tasked with building an inspector panel." Two directions were built
from the same two panes: A, two sidebar views (Inspector: what's in hand; Contents: the book and where you are), and
B, one view with both behind two buttons. He chose A: the two can be in sight together or apart and in either
sidebar, a later thing is a view of its own instead of another button, and on a phone B's buttons sat right above
the drawer's own switcher. Taken from Scrivener's Inspector: the synopsis over the notes, label and status always in
sight, "include in export", a note's snapshots, and following the section with the cursor. Left: its five tabs, its
bookmarks, keywords and custom metadata (Obsidian has properties, links and bookmarks), and comparing inside the
panel (the Snapshots dialog does that). Also left out: comments and footnotes as a list, progress bars, reordering
in Contents. Said to him plainly, and still true: beside the corkboard the Inspector repeats the card and beside the
outliner Contents repeats the Title column; they earn their place beside the manuscript and a note in a tab. A role
nobody wrote on a note is shown with "auto" after it: "automatic" didn't fit beside "Front matter" in a sidebar at
its default width.

**The banner and the mark (2026-10-06).** The maintainer showed another plugin's banner (a violet panel, a logo, the
name large, a line of pitch, the app's window running off the edge): "I want a headlining image like this for my
plugin. Official looking." Obsidian's brand guidelines rule out their logo and a name that reads as theirs, so the
name is "Binders" with "for Obsidian" small under it, and the mark is the plugin's own.
- Three grounds were built (the accent violet with the dark app, a charcoal, a paper with the light app); he chose the
  violet, with the sans. Violet is `#6d4fd8`: Obsidian's accent a step deeper, so white type holds on it.
- The first mark, a ring binder from the front, read as a notebook, and he asked for "a much better icon or logo".
  Eight ideas were drawn; he chose "in order": three scenes in a column, the middle one out of line, on its way to
  its place. It says what the plugin does (an order you set by hand), not what it is named after. It is drawn as
  Obsidian's icons are (Lucide's 24 grid, a 2 stroke, round ends), so the same drawing can be an icon: `docs/images/mark.svg`.
  Beside the heavy wordmark and on the tile its stroke is 2.35, or it looks thin.
- Checked against, from memory and not by a trademark search: the marks of Obsidian, Scrivener, Notion, Bear, Ulysses,
  iA Writer, Day One, Evernote, Craft; and Lucide's `rows-3`, `list`, `align-left` and Gantt icons, which share its
  bars and are none of them it. Given up: a picture of a binder. Front on, rings make a notebook; at an angle, a
  megaphone; open from above, a list in a box; a B is the Bold button in an editor.
- `npm run banner` makes the pictures (`scripts/banner/build.mjs`: pages photographed by a headless Chromium, Inter
  shipped beside it); `node scripts/banner/shoot.mjs` takes the screenshot again. What is staged, in a throwaway copy
  of the demo vault: "Low Water at Corran" at the top of the vault with its story bible and nothing else; the book
  without its four one-line pages of front and back matter (cards with a title and nothing on them); the ribbon off
  (Obsidian's own setting) and the sidebar 250 px, so the explorer and two whole cards fit. The shot is placed one CSS
  pixel to one of the app's: a card's synopsis can still be read at the 830 px a README gives the picture.

**Find and replace (2026-10-09).** The maintainer: "ctrl+f inside a binder, search through all notes. ctrl-f inside
manuscript, works across full contiguous manuscript, outliner+corkboard it highlights cards." A designer built the
bar across a binder's notes, in the real plugin, with two forks: where the bar sits, and what "Replace all" asks first.
He chose a bar in the note's column over the manuscript and the full width of the view on the boards, and the review
over a one-sentence confirmation. What the round settled, and why:
- **Obsidian's own bar, by its own classes**, so a theme that restyles one restyles the other; two differences: the
  count says how many notes, and "Match case" stands where Obsidian has "Select all matches".
- **The boards light, they don't switch.** Cards and rows whose note has a match stay as they are, the rest fade; a lit
  card shows the line of its first match where its synopsis was (that is what "lit" means: it is why). The count is on
  the outliner's row, at its end, as a tree's row says things; a card says nothing about itself that isn't the writer's.
  A folder's card is lit for what is in it, and says which of the notes it lists matched (bold), not how many.
- **Replace all is a review**, built from the Snapshots dialog's parts: the notes in binder order, each change where it
  falls in its paragraph, the old struck out and the new underlined, so a link's target is seen not to change. One
  filled button. The review is where "Mara" in "Maramures" is seen, which is why there is no whole-word option and no
  pattern.
- **A link's target is not text to change**, nor a tag after its `#`; a query typed with the marks reaches outside and
  matches as written. (The maintainer: "You should have to f/r [[Mara]]".) Code and comments follow the same rule.
- **Given up:** searching a note's title or synopsis from the bar (a property is not text, and a replace would have
  to say it leaves those alone); a count on a card; a replace one on the boards (a card is not an editor).
- **No generic look.** The bar, the count and the review are Obsidian's own pieces. The no-match tint Obsidian's own
  bar doesn't show (1.13.7: its rule reaches the box, which the field covers) is shown on ours.
- **On a phone** the bar takes its size from Obsidian's mobile rules (44 px high, full width), the way in is the view's
  More options menu, and the review is a sheet.

## How a design round runs: narrow, then build

The quality comes from three things: this page, the designer looking at the real plugin and correcting what it sees,
and the maintainer choosing. A round keeps all three and spends nothing on directions that won't be chosen.

1. **Questions, no pixels.** The designer reads this page and the one view it is changing, and reports: two or three
   directions in a paragraph each, the one it recommends, and the questions only the maintainer can answer, each with
   the default it would pick. The maintainer answers, and says which directions are worth seeing: usually one, two
   where he can't tell from words. Most of a feature's scope is settled here.
2. **The real thing, by eye.** The designer builds those directions in the plugin itself, in its scratch copy, and
   works the way a person does: look at a screenshot, fix what's off, look again, in light and dark, on desktop and
   phone, at rest and mid-interaction. Not a mock-up: a mock-up doesn't show what Obsidian's own layout, themes and
   real notes do to a design, and has to be built again afterwards. Rough is fine where it doesn't show (no tests yet,
   no edge cases); what the maintainer will look at is finished.
3. **The maintainer picks**, from one page (`options.html`) with the screenshots side by side and what each gives up.
4. **Finish once.** The same agent, with what it already built, makes the chosen direction whole: edge cases, tests,
   docs, and a last set of proof shots.

**Looking is not what to save on; looking wastefully is.**

- Crop to what changed (the card, the menu, the row), not the whole window. A full window is for the last check.
- Put states side by side in one picture (resting, hovered, selected, dragged) rather than one picture each.
- Don't shoot again what hasn't changed, and don't shoot every theme and size on every pass: iterate in one, then
  check the others once the design holds.
- Keep the shots the maintainer will see; delete the rest, so the folder shows the design and not its history.

**Where the saving is:**

- Directions: one or two built, not three. The first stage is what makes that safe.
- Obsidian's bundle (`app.js`, `app.css`): look up one thing by searching for it; don't read it through. What it
  taught goes on this page.
- Tests: the agent's own new specs and the specs for the area it touched, once. The whole suite in both themes is run
  once for everyone, unattended, after the last merge.
- The report: what was built, what it gives up, the shots' folder, and the bump, title and CHANGELOG lines.
