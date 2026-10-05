# Design: what "native" means here, and how design work is run

Read this instead of researching it again. When a design round learns something that will hold next time, add a line
here; that is what keeps the next round short.

## What has been learned

**Native is judged against Obsidian itself**, not against other plugins and not by using its CSS variables alone.

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
  as Obsidian's Bases cards are, not its faintest. The "New note" tile stays faint, like a placeholder.
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
