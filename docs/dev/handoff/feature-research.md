# Binders: what writers want that it doesn't have yet

Checked 2026-10-05. Read-only: nothing in the repository was changed.

How to read the evidence marks:
- **[V]** read from a primary source today (the plugin's repository, the community directory's own JSON files, the GitHub issue trackers via `gh`, the L&L forum's JSON, Obsidian forum pages, a vendor's feature page).
- **[R]** recalled from my own knowledge, not re-read today. Treat as a lead, not a fact. This covers most of Scrivener 3's, Ulysses' and Plottr's detailed feature sets, since their pages gave only summaries or returned 404.
- **[S]** from a web-search summary only (blog posts, forums I did not open).
- Download counts come from `community-plugin-stats.json` in `obsidianmd/obsidian-releases`, fetched 2026-10-05 [V]. They are cumulative, not monthly.

Method note: the Obsidian forum's search endpoint rate-limited me (HTTP 429) partway, and Reddit could not be queried. Demand evidence for the Obsidian side is therefore mostly issue trackers (Longform, StoryLine, the word-count plugins) and the Scrivener wishlist, which are countable, rather than forum or subreddit threads, which are not.

---

## 1. Ranked shortlist

Ranked by: a repeated writing task, evidence of demand, fit with his philosophy, small cost. Eleven items; items 1 to 5 are the ones I would argue for.

| # | Feature | Verdict | One line why |
|---|---|---|---|
| 1 | **A word count that agrees with the book** (leave out `%%` comments, `<!-- -->`, optionally link targets and code; same rule as Export's count) | **Build before 1.0** (small) | `countWords` counts everything but properties, so a scene with notes in `%%` shows more words than Export will print. The single most repeated complaint in every word-count plugin's tracker. |
| 2 | **Find and replace across the manuscript** (already planned) | **Build before 1.0** (agree; medium) | Scrivener's Project Search, Dabble and Word all have it; Obsidian's core search has no replace. Keep his "replace all is one undo step, says how many notes first". |
| 3 | **Test the manuscript's editors against the plugins writers already run** (Harper, LanguageTool, Typewriter Mode, Smart Typography, Linter, Better Word Count) | **Build before 1.0** (a QA task, not a feature; small) | These sum to millions of downloads. Binders' embedded editors are an undocumented internal; one broken grammar checker in the manuscript would read as "not native". |
| 4 | **Two-device order and sync resilience check** | **Build before 1.0** (a QA task; small to medium) | Longform's most-discussed open bug is its index going stale or malformed across sync and mobile/desktop (issue 212, 64 comments; 278; 135). Binders stores order in a note too. |
| 5 | **Deadline-aware targets: "words a day to finish by date", with days off** | **Build after 1.0** (small) | Scrivener's Project Targets, Ulysses' deadlines, Dabble's goals; wishlist "Writing Time Tracking" has 34 likes. Two properties on the binder note; no new store. |
| 6 | **Saved filters, then collections** (already on his list) | **Build after 1.0** (agree) | The strongest recurring theme across StoryLine requests, Scrivener's Collections and saved searches, Novelcrafter's matrix. His design is right; see section 2 for two additions. |
| 7 | **Split a long note at every scene break or heading; import a Word or Markdown manuscript into a binder** | **Build after 1.0** (medium; reuse Scrivener import's splitter) | Most writers arrive with one long file. Scrivener has "Import and Split"; no Obsidian plugin does it as a binder. |
| 8 | **New scenes from a template** (default status, label, body) | **Build after 1.0** (small) | StoryLine's scene-template issues, Scrivener's document templates. Use Obsidian's core Templates file; no template system of his own. |
| 9 | **Revision queue** (already on his list) | **Build after 1.0, smaller than planned** | Keep it, but write the checkboxes in the syntax Tasks (4.4M downloads) already queries, so a writer can use either. |
| 10 | **Word comments from `%%` notes on export** | **Build after 1.0 only if asked** (small to medium) | Editors work in Word; Scrivener can pass annotations through. Weak evidence, [R]. |
| 11 | **Pre-export check** (unresolved CriticMarkup marks, empty scenes, scenes below a chosen status, broken links) | **Build after 1.0 only if asked** (small) | Extends the "what can't be exported is counted first" list he already designed. |

Everything else I looked at is "leave to another plugin" or "don't build" (sections 2 and 5). The common finding: Binders already has the features that are rare in the Obsidian ecosystem (a real binder, outliner, scrivenings, snapshots, a Scrivener round trip). What is missing is mostly small trust and polish items, not new surfaces.

---

## 2. Full findings by theme

### 2.1 Structure and navigation

**Already covered, so no recommendation:** order in the file explorer, binder view, outliner columns for any property, Contents pane, folders as chapters, breadcrumb, Longform read/convert.

**Saved filters and collections (on his roadmap).** I agree with the verdict and the order. Evidence it is the right next surface:
- StoryLine's tracker: "Chapter filter in Manuscript" (#299), a Navigator "for quick scene search and filtering" is one of its ten views [V: repo README, issues].
- Scrivener's Collections, saved searches and Binder filtering [R; the features page lists "Collections (smart lists)" [V]].
- Longform #169 "Selecting which scenes to include in the compile" (4 reactions) [V]; he already has Include in export.
Two additions to his spec, both small:
1. A filtered manuscript (scrivenings of just the matching scenes) is the thing StoryLine users ask for (#299), so make sure "all three views" explicitly includes the editable manuscript, as he wrote.
2. Keep a filter's definition in the binder note as readable properties, as he said. No query language. Do not let it grow toward Bases; Obsidian's Bases already does arbitrary queries (his own benchmark).

**Folder as chapter, nested scenes.** Longform's most-commented *closed* feature thread is "Indenting scenes (sub-scenes)" (#11, 38 comments), with open follow-ups: "Reordering scenes with children also moves children" (#161), "Collapse all nested scenes" (#200), "Handle folders in scene files" (#125) [V]. Binders' folders already answer all four. This is a selling point for the README, not a gap.

**Split at every break; import a long note.** A writer's draft often starts as one note or one Word file. Binders has *Split scene at cursor* (one cut at a time) and a planned Scrivener import. Scrivener has "Split at Selection", "Split with selection as title" (Binders copies these) and "Import and Split" [R]. Obsidian's core Note Composer extracts a selection or a heading into a new note, one at a time [R]. See shortlist 7. Cost: medium, because Word reading needs an OOXML reader; he already wrote a Word *writer*, and the Scrivener importer needs an RTF reader, so a Word reader is the third reader, not the first. A single Markdown file split at headings or `* * *` lines is small and can ship with Scrivener import. Risk: the "never rewrite notes" rule is not touched, since it creates new notes. Verdict: after 1.0 (Markdown split could ride with Scrivener import before 1.0).

**Don't build:** Waypoint-style generated MOCs (134,840 downloads) and Folder Notes (461,202) [V] are structure plugins for people who have no binder. Binders' folder notes are its own, hidden by default. Waypoint is exactly the "another plugin he could simply recommend". Notebook Navigator (1,041,459) replaces the explorer; he has already accepted the incompatibility.

### 2.2 Planning and plotting

He dropped the plot grid; the outliner with property columns replaced it. I judge the rest strictly.

| Candidate | Who has it | Verdict |
|---|---|---|
| Timeline of story dates | StoryLine Timeline; Radial Timeline (8,205 downloads, source-available, non-commercial licence [V]); Aprils Automatic Timelines (63,740); Timelines Revamped (21,767); Chronos (59,058); Plottr; Novelcrafter | **Leave to another plugin.** A date is an outliner column and sort already. Obsidian's own Bases has a timeline view community plugin (xjiaxiang's, 5,144). |
| Plotlines / subway map | StoryLine; Plottr; Dabble plot grid | **Don't build.** He rejected the grid. Label lanes in "Arrange by label" are his answer. |
| Beat-sheet templates (Save the Cat, Hero's Journey) | StoryLine (nine templates), Inkswell (seven), Novelcrafter, Plottr | **Don't build.** A template of empty scenes is a note with headings; fits "New scenes from a template" (shortlist 8), not a feature of its own. |
| Setup and payoff tracking | StoryLine | **Don't build.** A property (`pays-off: [[Scene]]`) and a link do it; Obsidian's backlinks show the pair. |
| Character presence per scene, POV | yWriter, Manuskript, StoryLine, Novelcrafter's "characters per scene" and appearance heatmap | **Leave to Obsidian.** Any property is an outliner column, and a list property filters (his saved-filters spec names `characters` contains Alice). |
| Index-card canvas | Canvas; Excalidraw (8,353,437 downloads); StoryLine's freeform corkboard | **Leave to Canvas and Excalidraw.** His corkboard orders; it does not scatter. |
| Gingko-style nested cards | Lineage (24,648 downloads, 264 stars, last push 2025-11 [V]) | **Don't build.** Different editing model. |
| Kanban of scenes by status | Kanban (2.7M); several Bases board views (kanban-bases-view 38,569; base-board 26,823) | **Leave to Bases and Kanban.** Arrange by status is on his own "after 1.0" list; I'd keep it low. If built, reuse "Arrange by label" (a lane is a property value). |

### 2.3 Drafting and focus

**Binders already has:** focus mode, typewriter scrolling (last line only), paragraph dimming, scenes before and after, place and synopsis, word counts, daily goal, fullscreen option, charcoal page.

| Candidate | Who has it | Verdict |
|---|---|---|
| Sentence focus, line highlight, Hemingway (no-backspace) mode | Typewriter Mode (106,462 downloads), cm-typewriter-scroll (115,616), Focus Active Sentence (7,701), Hemingway Mode and digital paper (5,469), Dangerous Mode (14,268) [V] | **Leave to those plugins.** Test that they work in a Binders note and in focus. A "dim to the sentence" option is a one-line setting if ever asked; not now. |
| Dialogue focus (dim everything but dialogue) | Dialogue Mode plugin (3,985); Scrivener's "Dialogue focus" [R]; iA Writer's parts-of-speech highlight [V: "colors adjectives, nouns, verbs, adverbs", Style Check "clichés, fillers, clutter"] | **Leave to another plugin**, same reason. |
| Composition mode with backdrop image | Scrivener [R]; Composition Mode plugin (3,160, "paginated paper-like layout") | **Don't build.** His focus mode is charcoal and the vault's own type, on purpose. |
| Page view, margins, paper layout | Scrivener "Page view" [V]; Composition Mode | **Don't build.** He says Obsidian is minimal and styling happens at export; his planned live page preview in Export already covers "what will this look like". |
| Split editor, Quick Reference, copyholder | Scrivener [R] | **Leave to Obsidian.** Panes, hover preview, popout windows and the Contents pane do it. Scrivener's own wishlist asks for a third pane; Obsidian already has unlimited panes. |
| Grammar, spelling | LanguageTool (319,566 + 48,364), Harper (121,578), Antidote (12,466), Proofreader (3,884), Write Good (4,328), Long Sentence Highlighter (886) | **Leave to another plugin.** Do not build. Compat testing is shortlist 3. |
| Smart typography while typing | Smart Typography (171,971), Typographer (31) | **Leave to Smart Typography.** Export already typesets quotes; confirm in README that typing is the other plugin's job. Quotes set at export make the typing-time conversion optional. |
| Text-to-speech / read aloud | TTS (48,011), Edge TTS (33,913), Aloud TTS (19,326); Dabble "Read to Me" [V]; Word, Google Docs [R] | **Leave to another plugin.** |
| Name generator | Fantasy Name Generator (tiny); Scrivener's [R] | **Don't build.** |
| Dictionary, thesaurus | Dictionary (229,123), WordNet (29,738), WordCraft | **Leave to those.** |

### 2.4 Goals, statistics and habits

**Binders has:** targets per note, folder and binder; progress in cards and outliner; a day goal in focus mode (kept per device, not in notes); word counts.

What is missing relative to Scrivener [R: Project Targets with deadline and writing days, Session Targets; Writing History; Project Statistics], Ulysses [V summary: "Deadline and daily goal monitoring"] and Dabble [V: daily word count goals]:

1. **Deadline and writing days.** A binder note gets `deadline: 2026-12-01` (and optionally days off). The toolbar and focus mode show "1,240 a day to finish by 1 December". No new store; the day's count already exists. Evidence: Easy Writing Goal (128 downloads, brand new, "Scrivener-style writing goals… deadline + writing days to auto-calculate daily targets" [S]); Writing Goals (34,093; its tracker has 23 open issues, the plugin was last pushed 2024-08 [V]); Longform sessions; Scrivener wishlist "Writing Time Tracking", 34 likes [V]. Verdict: **after 1.0, small.**
2. **History, streaks, heatmaps.** Keep the Rhythm (35,773; stores a JSON file in its plugin data; can filter by file path [V]), Daily Stats (25,606), YourPulse (5,211), Word Sprint (23,500, timed sprints, CSV [V]). **Leave to those.** A history store is exactly what his "plain files, no second database" rule resists, and the day count is deliberately per-device. If asked for later, the smallest honest form is to say in the README "use Keep the Rhythm with a path filter on the binder's folder".
3. **Sprint timers.** Word Sprint, Pomodoro Timer (60,198), Writing Studio. **Leave to another plugin.**
4. **Project statistics** (words per chapter, pacing, dialogue share, repeated-word "echo finder", readability). StoryLine's Stats view (goals, sprint timer, pacing analysis, plot hole detection [V: README]) and its echo finder and prose analysis (users report they show only ten chapters of 42 [V: forum thread, page 6]); Scrivener Project Statistics [R]; Readability Score (9,782); Word Frequency (2,739). **Don't build.** The outliner's words column and totals row already show per-chapter size. Charts: Bases Charts plugins (bases-charts 26,989) can chart outliner-like data.
5. **Word-count semantics (shortlist 1).** I read `src/view/words.ts`: it deliberately matches Obsidian's status bar and strips only properties. So `%%a long aside%%`, `<!-- -->`, code and link targets count. Meanwhile README line 374 says Export leaves comments out, so a scene's card can show more words than the exported book. Demand: Novel Word Count #45 "Word count excluding frontmatter, comments, and markdown links" (15 comments) and #74 "ignore words in code blocks" (10); Better Word Count #50 and #28 (exclude front matter and tags, 15 and 10 comments), #82 "counts comments although the option says not to" (12); Writing Goals #3 "ignore html comments" (13); StoryLine #78 "ignore %% comments %%" [V, all]. Novel Word Count (199,714 downloads) exposes exactly these as settings ("Exclude comments", "Exclude code blocks", "Exclude non-visible link portions" [V]). Native-feel cost: one setting, "Count words as the exported book does", default on, with the same reader Export already has (`src/export`'s Markdown reader) so the numbers cannot drift apart. Risk: card and inspector counts then differ from Obsidian's status bar; explain it in the setting. If he prefers agreement with the status bar, at least make Export's title-page count and the card count the same number. Targets written before the change shift a little; that is a y-bump (a change in behavior).

### 2.5 Revision, comments and collaboration

| Candidate | Who has it | Verdict |
|---|---|---|
| Inline comments and annotations | Scrivener "Comments and annotations" [V list]; Word; Dabble Comments, Sticky Notes [V]; Binders already exports `%%comment%%` as Scrivener annotations | **Done at the text level.** |
| Comments as a list / sidebar | Sidebar Highlights (38,974), Enhanced Annotations (18,432), Better Footnote (6,230), Document Comments (5,205), Tandem Comments (2,609) [V] | **Leave to another plugin.** He already decided: "comments and footnotes as a list" is left out on purpose (plan.md). StoryLine users ask for the same ("Highlights and comments inspector panel", #121) [V]. Keep the decision. |
| Track changes / suggestion mode | Fevol's CriticMarkup (258 stars, 453 commits, repo warns "do not use in your main vault" [V]); Track Changes (2,454); Inkling (not in directory); Word [R] | **Leave to those; don't build.** Fevol's plugin and Binders must not fight over the same text, and its own author calls it unsafe. Binders' rule is never to rewrite text except via editor/command, so it would at best *display* marks, which Fevol does. |
| Word comments on export | Scrivener's compile can pass annotations through as Word comments [R, unverified today] | Shortlist 10. Binders' Word writer is already "real Word styles"; a `%%note%%` becoming a Word comment, off by default, is small to medium. Evidence is thin; wait for a request. |
| Revision mode colours (who changed what) | Scrivener "Revision mode" [R]; Word; Ulysses' revision mode [R] | **Don't build.** Snapshots with compare/restore are his answer; he already excluded this on grounds of "second history system". |
| Real-time collaboration, co-authoring | Dabble co-authoring [V]; Peerdraft (19,439 downloads [V]); Google Docs | **Don't build.** Not plain files, not his product. |
| Share to beta readers / editors | Dabble "Share to Web", "Beta Reader Workflow" [V]; Vellum ARC EPUB+MOBI [V] | The EPUB and Word exports already serve this. **Don't build.** |
| Revision queue (his item 2) | StoryLine "per-scene sidebar task management" (#122, 9 comments) [V]; Inkswell "unified to-dos" [V]; Obsidian Tasks (4,356,883) [V] | **Agree: after 1.0.** One argument against his current spec: capture and next/previous are the value; the list itself is what Tasks already does. Write the checkbox lines in Tasks syntax so a writer's existing Tasks queries work, and ship only capture and navigation. |
| Merge recovery (his item 3) | None | Agree with his own ordering and risk language. No evidence from outside either way. |

### 2.6 Reference material and story bibles

He has decided: no research browser, no story-bible system; use links, backlinks, Properties and panes. The evidence I found supports that:

- The StoryLine codex is the plugin's most requested area: of its 276 issues, about 40 are Codex requests (templates #193, individual and series codex #244, subcategories #260, aliases #209, directional relations #201, nicknames #169) [V]. This is a *large and still growing* surface to maintain, and each codex item is a vault note with a form on top, i.e. what Obsidian's Properties, Templates and links already are.
- Novelcrafter's Codex, Plottr's series bible, Bibisco, Manuskript and Storyteller Suite (19,745 downloads), Character Sheets (9,012), Chinese Novel Assistant, World Builder (2,557) and Relations (16,555) all exist as plugins or apps [V].
- Verdict: **don't build; leave to another plugin** (Dataview 5.09M, Bases, Templater 5.8M, Excalidraw, or StoryLine for people who want a codex). If he ever acts on his "small scene-to-reference navigation action" idea, the least invasive form is a Contents-pane section that lists the links *in the current scene* (Obsidian's Outgoing links core pane already does this).
- **Auto-linking mentions of codex names** (StoryLine, Novelcrafter's mention timeline, Obsidian's "Auto Link" plugins) is the one codex feature people value. Leave to another plugin; it rewrites note text, which breaks his rule 3.
- **Series.** StoryLine users ask for series codex (#244, #93, #203) and Longform users for multiple drafts. A series is several binders in one vault, linked. **Don't build.** "Nested binders" is already marked "later" in plan.md; evidence for it is not in Longform's tracker (it models projects as flat).
- **Bookmarks, keywords, custom metadata, project notes, Scrivener's document bookmarks tab:** all explicitly left to Obsidian (design.md). Scrivener's wishlist shows "Feature request: Every hyperlinking feature in Obsidian" with 36 likes and 17 replies, and "Save Scrivener packages as simple folder structures" with 33 likes [V: L&L forum JSON]. That is evidence that the maintainer's plain-files-plus-links bet is what Scrivener's own users want.

### 2.7 Versioning and safety

**Binders has:** per-scene snapshots with compare/restore, snapshot of every note under one name, snapshots of gone notes, undo of moves, atomic Scrivener export, refuse-newer-format. Folder/binder snapshots "as browsable versions" are being designed.

- **Whole-project drafts and branching:** he deferred them. The evidence agrees: Longform's "Refactor: Projects and Drafts 2.0" (#35) has 14 comments and is still open after four years; its drafts feature is the one it never settled [V]. Keep deferring.
- **Automatic snapshots on a timer, and pruning:** on his own "After 1.0" list. Obsidian's core File recovery and Edit History (22,894 downloads), Time Machine (13,469), Save History (3,345) and Version History Diff (53,729) do timed history [V]; Obsidian Git (3.2M). **Leave to those**, and document in the README that File recovery covers the time dimension while snapshots mark a decision. Inkswell also ships "daily data.json backups (7-day retention)" and "conflicts" folders [V]; its author reached for that because sync conflicts hit his index.
- **Sync safety (shortlist 4).** The failure writers report most often for the plugin closest to Binders is a stale or malformed order list after sync, desktop-to-mobile: Longform #212 (open since 2023, 64 comments), #278 "Index Error between Mobile & Desktop: All Scenes Out Of Order", #135, #147 "All my Longform projects disappeared" [V]. This is a test to write, not a feature: two devices reorder and add notes while offline, then sync (Obsidian Sync, iCloud, Syncthing); the binder note's order list must keep every note, and any note missing from the list must show at the end, not vanish. If Binders already does this (the file-format doc may), the test is cheap and the claim goes in the README as a selling point.
- **Undo breadth:** "Undo last move" is not announced to screen readers (README known limitation). One ARIA live-region line fixes it; small; before 1.0.

### 2.8 Formatting and export

He has this designed to the point where I have little to add; I only check the design against the competition.

- **Scrivener compile pain is real and well documented.** L&L forum thread "Why is the Compile process so impossibly complicated" ([forum](https://www.literatureandlatte.com/forum/viewtopic.php?t=54041)) and the guides that say the chain is "assign a type, then a layout, then a format" [S]. His "few decisions, good defaults" matches the complaint. Ulysses' strongest point is the same ("on-the-fly style switching", live preview [V]).
- **Vellum** (Mac only, $199.99 ebooks, $249.99 with print [V]) is the reference for taste: pre-designed styles, drop caps, ornaments, widow handling, 24 trim sizes, large print, box sets, ARC support, accessible EPUB output [V]. He already lists drop capitals, large print, PDF/X as after-1.0. **Box sets** (several binders in one ebook) and **ARC/reader copies** are the only ones not on his list. Don't build now; they are the "book series" case and sit squarely in Vellum and Atticus's territory.
- **Pandoc, Enhanced Export (458,920), Better Export PDF (348,566), Advanced PDF Export (18,982):** the incumbents he is replacing. His design needs none of them, and the "Pandoc plugin" crowd is exactly who benefits. Longform's trackers show the demand: "Compile step: export via Pandoc" (#142), "Convert to ePub and/or DOCX" (#304), "Insert frontmatter" (#41), "Prepend title based on indent level" (#126), "Renumber footnotes" (#44), "Delete headers" (#57), "Expand wikilink note content" (#121), "Remove tasks" (#183) [V]. Check that the Export design covers each of these as defaults: titles from folder depth (yes, roles), footnotes (yes, real footnotes), task lines (unclear; see below), wikilink expansion (not mentioned; this is a transclusion question, "![[note]]" in a scene).
- **Embeds and transclusion in export.** I did not see in `docs/export.md`'s table whether `![[note]]` (an embedded note) is expanded in the book. Longform #121 asks for it. Worth one line in the "what can't be exported" list if it is not already there. Not verified.
- **Task lines (`- [ ]`) in export.** Longform #183 "Remove tasks". Same: one line.
- **Plain-text/HTML, Fountain, Kindle** are listed as waiting or deferred. Fountain: Fountain editor (18,627) and Fountain (10,634) plugins exist; Highland and Final Draft are screenwriting tools. **Leave to those**, and he already deferred it.
- **Docx import of comments and tracked changes** (round trip with an editor) is the one export-adjacent item no Obsidian tool does well. Large and risky (it would insert marks into notes). **Don't build.**

### 2.9 Import and interoperability

- **Scrivener import** (planned): StoryLine already imports Scrivener 2 and 3 projects, which its author calls "experimental" "due to varied project setups" [V: forum thread, README]. A Scrivener forum thread in Obsidian's own forum shows how the do-it-yourself route goes (`.rtf` per hex-named folder, Pandoc, parse the `.scrivx`) [V]. This supports doing it, and doing it well (his tests with real projects are the differentiator). No change to the roadmap.
- **Word and Google Docs import** (shortlist 7): after 1.0.
- **Longform integration:** keep. Longform's own maintainer posted "Looking for a new maintainer" on 2026-02-24 and says "I no longer use Longform myself" and "I reinstalled Scrivener" (#327, 10 reactions); last push 2025-12-02 [V]. Longform has 189,329 downloads and is effectively unmaintained: a **migration path from Longform to Binders is therefore a strong positioning**, and the existing "Convert to binder" command is the right thing. A README line to that effect is cheap. Also an open feature there, "scrivenings mode" (#131, 5 reactions, with the reporter naming Make.md's Flow view), is what Binders' manuscript already does.
- **Inkswell** is "compatible with Longform plugin format" [V]; so is Binders. The Longform format is thus a small shared standard.
- **EPUB import** (EPUB Importer, 45,281 downloads) and **Zotero** (575k): leave to those.
- **Citations.** Scrivener's wishlist item "Zotero integration" has 88 likes and 42 replies, its biggest [V]. Nonfiction writers will bring `[@citekey]` into Binders. Make sure Export says what it does with a citekey (it will print it as typed unless told otherwise), in the "what can't be exported" list. Don't build citation formatting.

### 2.10 Mobile and sync

- StoryLine's mobile pain is documented: the iPad cursor jumping to the first line while typing (#215), cards missing on first load, truncated controls on iPad, formatting options off screen while editing (#278), a required Obsidian version newer than the iOS app store version [V]. Binders' phone tests are emulated only; his "emulator is king" stance is stated. The StoryLine list is a free checklist of real-device failures to reproduce in the emulator: (a) cursor and scroll position after any metadata edit, (b) first open of a view from cold, (c) drag with a touch while the editor is focused, (d) software keyboard covering a toolbar. Test these four before 1.0.
- StoryLine's PDF export is desktop-only; same decision as his.
- Obsidian Sync and `.snapshot` files: already documented.

### 2.11 Accessibility

- Not much evidence of demand in the plugin trackers; the real accessibility surface is Obsidian's. Novelcrafter lists "dyslexia-friendly options" [V]; Obsidian's font settings cover that.
- Binders-specific: the "Undo last move isn't announced" limitation (above) is the one concrete item. Keyboard operation of all three views is already described as thorough in the README.
- **Don't build** reduced-motion toggles, high contrast, or dyslexia fonts; inherit Obsidian's.

---

## 3. Everything surveyed

"Lacks" means: has something Binders does not have today (not a recommendation). Downloads are from the directory JSON on 2026-10-05 [V] unless stated; "maint." is the date of the last push on GitHub [V] where I fetched it.

### Obsidian plugins

| Plugin | Downloads, maint. | What it offers a long-form writer | What it has that Binders lacks |
|---|---|---|---|
| Longform | 189,329; last push 2025-12-02; maintainer asked for a successor 2026-02 | Index-note project, nestable scenes, drafts, workflow compile (Markdown), sessions and word goals | Multiple drafts per project; compile steps (Pandoc hook, strip headings); session goals with options. Open issue 131 wants scrivenings, which Binders has. |
| StoryLine | 43,312; pushed 2026-10-04; 297 stars; v1.8.4; free, MIT | Corkboard, board, plot grid, timeline, plotlines (subway map), manuscript, characters, locations, navigator, stats | Codex and series codex; plotlines and setup/payoff; beat-sheet templates; plot grid; timeline; character relationship maps; stats with sprint timer, pacing and echo finder; DOCX/PDF/HTML/CSV export; Scrivener import; daily/weekly/monthly goals; per-scene research sidebar; view snapshots. |
| Inkswell | 4,120; pushed 2026-10-05 | Plan, write, revise, publish; codex; beat sheets; Longform-compatible | Streaks, heatmap, deadline calculator, writing prompts, audit toolkit, launch planner, backups of its data. Almost certainly assistant-assisted code: unverified. |
| Writing Studio | 3,048 | "Writing Binder", sprints, WordPress publishing, DOCX/PDF/EPUB | Sprint timer, typography mode, WordPress. It is a rival "binder". Desktop only. |
| Novel Word Count | 199,714; 2026-08-03 | Word, page, character, reading time, % of goal in the explorer, for folders too | Per-file counts shown in the file explorer; page and reading-time counts; `word-goal` property; exclusions for comments/code/links. |
| Better Word Count | 619,389 | Status-bar count of selection, characters, sentences | Selection counts; templated status bar. Many open issues about comments and front matter. |
| Writing Goals | 34,093; last push 2024-08-14 (stale) | Word goals on notes and folders, daily, sprint, dashboard | Sprint goals; recursive folder goal; dashboard of every goal. |
| Easy Writing Goal | 128 | "Scrivener-style" project target, session target with deadline and writing days, heatmap history [S, from search summary] | Deadline-driven daily targets and history. |
| Keep the Rhythm / Daily Stats / YourPulse | 35,773 / 25,606 / 5,211 | Daily word count, streaks, heatmaps | History, streaks, multi-device merge of counts. |
| Word Sprint | 23,500 | Timed sprints, WPM, idle nudges | Timer and stats export. |
| Typewriter Mode | 106,462 | Typewriter scroll, line highlight, paragraph dimming, sentence focus, Hemingway mode | Sentence focus; no-edit-backwards mode. |
| cm-typewriter-scroll, Focus Mode, ProZen, Stille, Zen, Typezen | 115,616 / 74,838 / 37,872 / 32,570 / 15,929 / 32 | Simple scroll and chrome hiding | Nothing Binders' focus mode lacks, except section-at-a-time (Stille). |
| Pandoc Plugin, Enhanced Export, Better Export PDF, Advanced PDF Export, DOCX Exporter, To Word | 558,671 / 458,920 / 348,566 / 18,982 / 17,254 / 10,123 | One note out through Pandoc or the browser | Any Pandoc format, LaTeX, custom templates and filters. Binders needs none of them. |
| Advanced Merger | 23,956 | Merge a folder of notes for export | Subsumed by "One note". |
| Folder Notes, Waypoint | 461,202 / 134,840 | Folder notes; generated tables of contents | Generated MOCs. |
| Custom Sort, Flexplorer, Explorer Sort, Sortable Explorer | 215,973 / 94,767 / 2,288 / 2,664 | Manual or rule-based order in the explorer | Rule-based sorting config (Custom Sort); Binders has manual order plus outliner sort. |
| Notebook Navigator | 1,041,459 | Replaces the explorer | Incompatible by decision. |
| Smart Typography | 171,971 | Curly quotes and dashes as you type | Typing-time conversion. |
| Linter | 1,178,216 | Format notes on save | Rules for blank lines, headings. Check it doesn't reflow tab-led paragraphs: unverified. |
| LanguageTool (two), Harper, Antidote | 319,566 and 48,364 / 121,578 / 12,466 | Grammar and spelling | All grammar. |
| Version History Diff, Edit History, Time Machine, Save History, Obsidian Git | 53,729 / 22,894 / 13,469 / 3,345 / 3,246,361 | Timed history, diffs | Timed history of every note. |
| Commentator, Projects | **not found in the directory's JSON by id** on 2026-10-05; Commentator's author's current plugin is Fevol's CriticMarkup (repo, 258 stars, beta) | Suggestion mode, comments; project dashboards | Track-changes UI. Projects: could not verify whether it is withdrawn. |
| Sidebar Highlights, Enhanced Annotations, Document Comments, Tandem Comments, Track Changes | 38,974 / 18,432 / 5,205 / 2,609 / 2,454 | Comments and highlights lists, CriticMarkup review panel | Sidebar lists of comments. |
| Templater, QuickAdd | 5,813,999 / 2,194,066 | Scene templates, capture | Scripted templates. |
| Dataview, Bases views (kanban, board, timeline, charts) | 5,087,920 / 38,569 / 26,823 / 26,989 / … | Queries for character and scene tracking | Arbitrary queries and charts. |
| Excalidraw, Canvas2Document | 8,353,437 / 17,427 | Visual plotting; turn a canvas into a linear document | Freeform plotting. |
| Fountain Editor, Fountain | 18,627 / 10,634 | Screenplay syntax and index cards | Fountain support. |
| Radial Timeline | 8,205; pushed 2026-10-06; source-available, non-commercial licence | Radial view of scenes by subplot; Pandoc | Radial/subplot visual, revision stages. |
| Lineage | 24,648; 2025-11 | Gingko-style card writing | Tree-of-cards editing. |
| Book Smith, Colophon Writer, Visual Card Writer, Web Novel Assistant, Chinese Novel Assistant | 7,268 / 2,178 / 2,314 / 16,852 / 5,308 | Smaller long-form suites | Mostly a subset of the above. |
| Storyteller Suite, Character Sheets, World Builder, Relations | 19,745 / 9,012 / 2,557 / 16,555 | Characters, locations, factions | Codex forms. |
| Timelines (Aprils 63,740; Revamped 21,767; Chronos 59,058; Markwhen 45,916) | | Date timelines | Date visualisation. |
| Headings in Explorer, Dialogue Mode | 1,854 / 3,985 | Scene headings in explorer; dim non-dialogue | Both. Their forum thread has 8 likes [V]. |
| TTS plugins, Dictionary, WordNet | 48,011+33,913+19,326 / 229,123 / 29,738 | Read aloud, lookup | All of it. |
| Peerdraft | 19,439 | Real-time collaboration | Live co-writing. |
| Obsidian core: Search, File recovery, Templates, Note Composer, Workspaces, Outline, Bases | | | Core search has no replace; Binders' find-and-replace fills it. |

### Applications

| Application | What it offers | What it has that Binders lacks | Source |
|---|---|---|---|
| Scrivener 3 | Binder, corkboard, outliner, scrivenings, inspector, snapshots, collections, targets, compile | **Compare** all listed in the features page [V]: Comments and annotations; footnotes; Collections; Writing History; Quick Reference and split editor; composition mode; templates; Dropbox sync; iOS app; Final Draft export. **Recalled [R]:** project and session targets with deadlines; keywords; custom metadata fields; bookmarks tab; revision mode colours; name generator; linguistic and dialogue focus; copyholders; scriptwriting mode; text-to-speech; project templates; saved searches; backups; import of Word/PDF/Final Draft/web pages. Of these, the ones worth building are deadline targets (shortlist 5), collections (6), find/replace (2) and import-and-split (7). | features page [V] + memory [R] |
| Ulysses | Sheets and groups, goals with deadlines, filters, keywords, attachments, notes, export styles with preview, publishing (WordPress, Ghost, Medium, Micro.blog), grammar check | Publishing to blogs; grammar check; live-preview styles; goals per sheet *with deadline*. Subscription and proprietary-format complaints are the main "why I left" theme [S]: [Why I left Ulysses](https://www.brycewray.com/posts/2019/04/why-left-ulysses/). | home page summary [V]; details [R] |
| iA Writer | Focus by sentence/paragraph, syntax highlight by part of speech, style check, authorship, content blocks, templates | Part-of-speech highlight; authorship marking (typed vs pasted text) — for AI provenance, not long-form | features summary [V] |
| Dabble | Plot grid, story notes, goals (daily), focus, thesaurus, dictation, co-authoring, comments, find and replace, share to web, beta reader and editor workflows, "Read to me" | Co-authoring, dictation, share-to-web, plot grid | features page [V] |
| Novelcrafter | Grid, matrix, codex with progressions and mention timeline, series, AI tools, revision history, heatmap of appearances, team sharing | Codex; matrix; AI | features page [V] |
| Vellum | Book styles, drop caps, 24 trim sizes, box sets, large print, ARC, EPUB 3 accessible, Mac only | Everything typographic beyond his export; box sets; large print | vendor page [V] |
| Atticus, Reedsy Studio, LivingWriter, Storyist, Plottr | Cross-platform formatting; collaboration with editors; story planning | Unchecked in detail: I did not fetch these pages. Plottr's timeline and series templates and Atticus's cross-platform formatter are [R]. | [R] |
| novelWriter | Plain-text project of many small files, tags and references between files, statistics, build | Closest in philosophy; tags/references and a "build" step. Free GPL, v2026.2 patch 1 | home page [V] |
| Manuskript, Bibisco, yWriter | Scene metadata, characters, storylines, goals | Character-presence per scene; summary levels (Manuskript) | [R] |
| Final Draft, Highland | Screenplay format, beat boards | Out of scope (Fountain deferred) | [R] |
| Word, Google Docs | Track changes, comments, navigation pane, word count by selection, read aloud | Track changes and comment threads (shortlist: no); selection word count (Better Word Count) | [R] |

---

## 4. Things I checked and left out, and why

- **Plot grid, plotlines, subway map, beat-sheet engine, setup/payoff, relationship maps.** He dropped the grid; the outliner with property columns is his answer. Each of these is a view that duplicates Bases, Canvas or StoryLine.
- **Codex, character sheets, worldbuilding, series bible.** Decided: no. The StoryLine tracker shows the maintenance cost this carries (about 40 of its 276 issues).
- **Writing history, streaks, sprints, heatmaps.** Four dedicated plugins with 5,000 to 36,000 downloads each; a history store is a second database. Day count stays device-local.
- **Project statistics charts, pacing, echo finder, readability, prose analysis.** Statistical features that StoryLine's own users report as unfinished (ten of 42 chapters). Not his product.
- **Comments sidebar and track changes.** Decided against as a list; CriticMarkup plugins exist; Fevol's plugin is self-described beta.
- **Composition mode, backdrops, page view, themes per project.** Contradicts "minimal styling in Obsidian, formatting at export".
- **Split editor, copyholder, quick reference.** Obsidian's panes.
- **Dictation, read aloud, grammar, thesaurus, name generator.** Other plugins or the OS.
- **Real-time co-writing and sharing links.** Not plain files; not his product.
- **AI features** (Novelcrafter, Smart Composer, Nova, AI Revisionist and many more in the directory's "writing" tag). Not requested by his agenda, and the tag's list suggests the AI plugins are the crowded part of the market, not the long-form structure part.
- **Revision-mode colours.** Snapshots with compare do the job; a second change history is what he refused for whole-project drafts.
- **Whole-project drafts and branching.** He deferred it. Longform's issue 35 is the cautionary tale.
- **WordPress / Ghost / Medium publishing** (Ulysses, Writing Studio). Obsidian Publish and the plugin directory already have several; not a manuscript feature.
- **Waypoint, Folder Notes, custom explorer sorting.** Replaced by his own binder order. Notebook Navigator is incompatible by decision.
- **Obsidian's "Daily notes" and journaling plugins.** Irrelevant to a manuscript.

### What I could not verify

- Whether Fevol's Commentator (the older name for its CriticMarkup work) and "Projects" are withdrawn: neither id appears in the directory's current JSON; both may be renamed.
- Any download counts for plugins not yet in the directory JSON (Inkling, Orthography).
- Scrivener 3, Ulysses, Atticus, Plottr, Reedsy, Storyist, LivingWriter, yWriter, Bibisco, Manuskript, Highland and Final Draft detail pages: summaries or 404s only; the claims are [R].
- Reddit threads and the Obsidian forum's top "writers" requests: not reached (rate-limited, no Reddit access). The Obsidian forum numbers I did get: the StoryLine plugin thread has 155 posts and 26 likes; "Increasingly Atomic Folders: A Workflow" 33 likes; "Two new novel-writing plugins" 8 likes; "For Writers: overall and session target wordcounts" has 20 posts and 3 likes [V, via forum search JSON; the last one I could not open and only know the counts].
- Whether `docs/export.md` already says what `![[embeds]]`, task lines and `[@citekeys]` do in an export (I read the design's headings and its waits-until-after-1.0 list, not every table).
- Whether Linter's rules interfere with tab-led paragraphs; unverified.

### Sources most worth re-reading
- Longform tracker: https://github.com/kevboh/longform/issues (327 "Looking for a new maintainer", 131 scrivenings, 212 index/sync, 11 sub-scenes, 169 select scenes in compile, 35 drafts)
- StoryLine tracker and README: https://github.com/pixerojan/obsidian-storyline ; forum thread https://forum.obsidian.md/t/plugin-storyline-obsidian-plugin-for-writers/111494
- Novel Word Count issues 45, 74, 70, 96: https://github.com/isaaclyman/novel-word-count-obsidian/issues
- Better Word Count issues 50, 82, 28: https://github.com/lukeleppan/better-word-count/issues
- Writing Goals issue 3: https://github.com/lynchjames/obsidian-writing-goals/issues/3
- Scrivener wishlist (likes counted from the forum's JSON): https://forum.literatureandlatte.com/c/scrivener/wish-list/50
- Scrivener compile complaints: https://www.literatureandlatte.com/forum/viewtopic.php?t=54041
- Easy Writing Goal: https://github.com/Creative781/easy-writing-goal
- CriticMarkup for Obsidian: https://github.com/Fevol/obsidian-criticmarkup
- Directory data: https://github.com/obsidianmd/obsidian-releases (community-plugins.json, community-plugin-stats.json)
- Vellum https://vellum.pub/ ; Novelcrafter https://novelcrafter.com/features ; Dabble https://www.dabblewriter.com/features ; iA Writer https://ia.net/writer ; Ulysses https://ulysses.app/
