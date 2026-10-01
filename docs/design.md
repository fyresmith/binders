# Design: what "native" means here, and how design work is run

Read this instead of researching it again. When a design round learns something that will hold next time, add a line
here; that is what keeps the next round short.

## What has been learned

**Native is judged against Obsidian itself**, not against other plugins and not by using its CSS variables alone.

- The binder view is modelled on Obsidian's Bases cards view: edge to edge, a 40px bordered toolbar with the view
  switcher on the left, flat cards with a hairline border.
- Cards are Canvas-style: a label is the card's border plus a faint tint (about 7%) of the same color. A stack's pile
  takes the label's color too.
- Selection is a ring in the card's own color, grey when it has no label. Never the accent purple.
- Drags follow Obsidian's `drag-reorder-ghost` (300ms, `cubic-bezier(0.2, 0, 0, 1)`); tree insertion follows its
  `drop-indicator`.
- In the file explorer a binder carries Obsidian's own type tag (`nav-file-tag`), not an icon; the folder a view shows
  is the active row.
- The corkboard shows one folder at a time, with subfolders as stacks you go into, as Scrivener does. Where a writer
  would expect Scrivener's behavior, match it.
- Jank shows mid-interaction, not at rest: a drag held, 60ms after a drop, a field as the keyboard opens.

**Rejected, don't propose again:** a colored stripe along the top of a card, pill chips, thin accent or progress
lines, decoration for its own sake, anything on a card that isn't the writer's own (no badges for snapshots and the
like). The maintainer's word for these was "AI generated".

**How the maintainer chooses:** new things are off by default unless he says otherwise; the smallest version first;
a dropdown over a row of switches; no clutter.

## How a design round runs: narrow, then build

The quality comes from two things: this page, and the maintainer choosing between real options. Everything else in a
round is cost. So a round spends nothing on directions that won't be chosen.

1. **Questions, no pixels.** The designer reads this page and the one view it is changing, and reports: two or three
   directions in a paragraph each, the one it recommends, and the questions only the maintainer can answer, each with
   the default it would pick. The maintainer answers. Most of a feature's scope is settled here.
2. **One sheet.** The directions still standing, drawn on a single page (`options.html` in the scratch folder): static
   mock-ups made with Obsidian's own stylesheet and the plugin's `styles.css`, light beside dark, desktop beside
   phone. No plugin code, no build, no test run. Only where the ticket *is* an interaction (a drag, an animation) is
   that one interaction prototyped for real.
3. **The maintainer picks** from the sheet.
4. **Build once.** The same agent builds the chosen design in its scratch copy, with tests, and ends with a set of
   proof shots of the real thing: at most eight, at least one of them mid-interaction. If the real thing differs from
   the sheet, it says where.

**Budgets** (a round that needs more says so in its memo first):

- Screenshots the agent looks at: four of the sheet, eight of the build. Put states side by side on one page and
  take one picture, not one picture per state.
- Obsidian's bundle (`app.js`, `app.css`): look up one thing by searching for it; don't read it through.
- Tests: the agent's own new specs and the specs for the area it touched, once. The whole suite in both themes is run
  once for everyone, unattended, after the last merge.
- The report: what was built, what it gives up, where it differs from the sheet, the proof shots' folder, and the
  bump, title and CHANGELOG lines.
