## Export step 5 ("overruling and owning"): built, on branch `worktree-agent-ae2c1e23a3752e959`

Six commits, rebased on local `main` at 0.33.4 (c68bce0). `npm run check` passes on the tip. Worktree is clean.

### Commits, in order

| Hash | Bump | Title | CHANGELOG |
|---|---|---|---|
| `a643abf` | minor (a new option inside Export) | Export: a second book style, Modern | **Added:** A second book style, Modern: Source Serif, a large plain numeral at the left (a chapter's title under it), scene breaks as space. |
| `8110b4a` | patch (nothing a writer sees until the next commit) | Export styles are files in a hidden folder | (none for users; or fold into the next) |
| `1eacfce` | minor (the editor becomes usable here) | A style editor in the Export window | **Added:** "Edit this style" beside the Style dropdown turns the Export window's sidebar into a style editor; the preview follows every change, and changes are kept as you make them. **Added:** Built-in styles can be changed and reset; Duplicate makes a style of your own, which can be renamed, deleted, shared as a file and added from one. **Added:** Styles are plain files in "Export styles" at the top of the vault, kept out of the file explorer (the folder's name is a setting). **Changed:** A manuscript's style is now kept with its binder. |
| `5a092a7` | minor | "Export as" from Contents, a note's menu and the outliner | **Added:** "Export as" (Automatic, Part, Chapter, Scene, Front matter, Back matter, Leave out) in a card's and a row's menu, as an outliner column, and on each row of Contents in the Export window. **Changed:** Contents lists the pages Binders makes, and says a role it worked out more quietly than one you set. |
| `742d43f` | minor | Export again | **Added:** "Export again" (a command, and in the binder view's menu once a binder has been exported) repeats the last export to the same place with no window; it asks only before replacing a file that has changed since. **Added:** "Show where exports go" in the Export window's menu. |
| `fbe5772` | patch | Docs: export step 5 as built | (none) |

`8110b4a` and `1eacfce` are split so the edits to `src/view/export.ts` are apart from the new modules, as asked; `8110b4a` compiles and lints alone but does nothing visible. They could ship as one.

### Verified, and how

- `npm run check` on the final tip: passes (build, lint with no warnings, all unit tests, EPUBCheck 35 of 35).
- Unit: new `tests/export-styles.test.ts` (87 assertions: rows, read, write a line at a time, merge over `based-on`, loops, missing base, newer refused, broken file, standalone), additions to `export-style.test.ts` (Modern) and `export-model.test.ts` (said roles in Contents).
- e2e, one Obsidian at a time, pristine vault copy, **both themes, after the final rebase: 86 passed, 0 failed**:
  - `specs-export-styles.mjs` (new): 14 tests.
  - `specs-export-as.mjs` (new): 3 tests.
  - `specs-export-again.mjs` (new): 4 tests.
  - `specs-export.mjs` (existing): 22 tests.
- `specs-inspector.mjs` and `specs-outliner.mjs` with `--grep "role|columns|export switch"`: 9 tests, both themes, 18 passed. This was run after the first rebase (0.32.7), not after the second.
- Word for word with a changed style: EPUB (8 rows changed, EPUBCheck passes) and .docx (7 rows changed) both equal the notes' words.
- A newer `export-style` file is byte-for-byte untouched after an attempted set and reset.

### Not tested

- No wider runs. The item menu gained "Export as", and the outliner gained a built-in column `role`. 53 places in other specs mention "Include in export"; the ones I read check inclusion, not whole lists, but I did not run them. Phone menu sheets are one item taller.
- The editor's nine page-only rows (typeface, size, line spacing, lines, space above, opens on, along the top, page numbers, margins): written, validated and unit-tested, but never shown in e2e, because no kind with pages exists on this branch.
- The real system file chooser for "Add a style from a file" (the test hands the field a file), the real share sheet, a real phone, macOS and Windows.
- Tablet layout of the editor (phone and desktop only).
- Custom CSS in the PDF (step 3's side).
- The settings row was tested for presence, order and refusing a path; the folder rename was tested through `styles.moveTo`, not by typing in the row.

### For the coordinator: merging with `export-step-3`

- `BookStyle`'s shape is unchanged. New exports in `style.ts`: `MODERN`, `TYPEFACES`. `bookStyle(name)` still returns built-ins only; the vault's resolved style is `plugin.styles.book(name)`.
- Signatures changed in `src/export/export.ts`: `ebook(plugin, book, style)` and `readBook(..., asBook, asTyped)`. `FILES` in `src/view/export.ts` is now exported.
- The preview call is still in one place, `preview()` in `src/view/export.ts`. To put the editor on Paperback: `editorHost(kind)` already passes `pages: kind !== 'ebook'`; widen its `kind` type and the `file` getter, and pass `plugin.styles.book(name)` to step 3's `drawPages(el, book, style, {size, progress})`.
- `export-again.ts` opens the window for any kind other than manuscript, ebook, Scrivener and one note, so Paperback needs a branch there.
- I did not touch `src/view/export-preview.ts`. Contents moved to `src/view/export-contents.ts`; `drawOutline` and `roleName` in `export-preview.ts` are now unused and can be deleted after the merge.
- What the preview drawing doesn't set is done from my side: `dress()` puts `data-heading-size` on the scroll element; `runningHead()` adds the manuscript's header line after `drawManuscript`.
- CSS is inserted mid-file in `styles.css` (before the "Where the file went" comment), not at the end, to avoid an end-of-file conflict.
- `specs-export.mjs` gained one `export { … }` line near the top and one changed expectation (`Classic,Modern=Classic`).

### Screenshots

In `/tmp/claude-1000/-home-calebsmith-Projects-binder/9233dfcf-0304-4e57-9f50-1f65d5cceed6/scratchpad/export-step-5/`, each as `-light.png` and `-dark.png`:

- `editor-ebook-opened`, `editor-ebook-changed` (a built-in with 8 changes and Reset)
- `editor-manuscript-opened`
- `editor-own-style`, `editor-own-style-menu` (a writer's own style, with its menu)
- `editor-phone-opened`, `editor-phone-changed`, `editor-phone-preview`
- `editor-fallback-look` (without Bases' classes)

No screenshot of the editor from a kind with pages (none exists here).

### Decided while building

Written in full in `docs/dev/export.md`, "Decided while building (step 5)". In short:

1. Modern's heading is `{number} / {title}`, not the sample's `{number}`: the same look when there is no title, and no title is lost.
2. A style's family (book or manuscript) comes from the built-in style at the bottom of its `based-on`.
3. A style based on a built-in is based on it as changed in this vault.
4. Newer and broken files are never written and their rows are disabled; a file with one bad value is editable and the bad line is left until its row is set.
5. Delete (to trash) first makes dependent styles stand alone so they look the same; Rename follows into dependents and into binder notes' `book-style` / `manuscript-style`.
6. A shared copy stands on a built-in style; an unchanged built-in has nothing to send; adding never replaces (it takes "Classic 2").
7. The styles folder is shown if it holds notes; changing the setting renames the folder.
8. The manuscript's style is per binder (`manuscript-style`), falling back to the vault's last.
9. The manuscript preview shows the running head once over the first text page.
10. The line-spacing slider steps by 0.01 (0.02 can't land on Modern's 1.45).
11. Contents: made pages listed first; a row opens its note; the role is the "Export as" button.
12. "Export as" from the menus puts a left-out item back in; the inspector's row does not (it keeps its own box).
13. Export again with nothing exported opens the window; it goes to the last place without ticking "save without asking".
14. Custom CSS reaches the EPUB, not the window's preview.

**One wording differs from the approved design, for you to decide:** the design's "Show the Exports folder" is "Show where exports go". The lint rule for sentence case rejects the capital, and disabling that rule is itself forbidden by the lint config.

### Design against the window: what is left

Built in this step: Edit this style (row and menu), Contents made pages and role menus, "Show where exports go", settings order with Styles folder last, `manuscript-style` per binder, style warnings listed with the rest (their line opens the editor).

Not built:
- Paperback kind, manuscript "File" (Word or PDF), "Page" row, `page-size`, exact pages, "PDF, made on a computer" on a phone: step 3.
- Contents' highlight of the row whose pages are in view: needs the pages.
- The bar's "1 chapter · 3 scenes" for the ebook: it says words and chapters, as step 2 left it.
- A visible mark on a changed row in the editor: the row has class `is-changed` but no styling; the design's mock had none either.
- Tablet pass, and a QA round: step 6.

### For the manual

**Styles.** A style is how the book is set. Classic and Modern are book styles (ebook); Standard manuscript, Standard manuscript, Courier and Plain, for a typesetter are manuscript styles (Word). Choose one in the Export window's Style row; the choice is kept with the binder.

**Editing a style.** Press the sliders button beside Style, or "Edit this style" in the "…" menu. The sidebar becomes the editor and the preview follows each change. There is no Save. The back arrow returns to the choices.
- Ebook rows: Paragraphs (first line indented, or space between); Quotes and dashes (curly, or as typed); Heading (Chapter One, Chapter 1, One, 1, I, with its title, its title only, or "Your own..."); Lettering; Heading size; Placed (middle or left); First words; Mark (the scene break, or space only).
- "Your own" heading uses `{number}`, `{number:words}`, `{number:roman}`, `{title}`; `/` starts a new line; a line whose title is empty is dropped.
- Manuscript rows: Typeface, Line spacing, Italics, A chapter starts, Scene break, Along the top, Title page.
- A built-in style says "Built in · N changes" with Reset. Styles belong to the vault: a change shows in every binder that uses the style.
- The ⋮ menu: Duplicate (makes your own style, renamed by typing over its name); Reset to the original; Save a copy to share (Share this style on a phone); Add a style from a file; Show the style's file (computer); Delete (to the trash; binders using it fall back to the style it was based on).

**Where styles are kept.** One file per style, `Export styles/Name.bookstyle`, at the top of the vault, hidden from the file explorer unless you keep notes there. The folder's name is in Settings → Export → Styles folder. To sync styles with Obsidian Sync, turn on "Sync all other types". CSS written under the properties in the file is added to the ebook; the editor has no field for it. Limits: a file from a newer Binders is listed but not used or changed; a file that can't be read says so and the base style is used.

**Export as.** Binders works out each item's part in the book from the binder's shape. To overrule it: right-click a card or row → Export as; or the outliner's "Export as" column; or the inspector; or, in the Export window, Contents → click the role at the end of a row. Choices: Automatic (says what that comes to), Part, Chapter, Scene (notes only), Front matter, Back matter, Leave out. A role Binders worked out is shown fainter than one you set. Clicking a row's name in Contents opens the note.

**Export again.** The command "Export again", or the binder view's menu after a first export: the same kind to the same place, no window, using the style and details as they are now. It asks only if the file there has changed since the last export. On a phone the file goes to the Exports folder and the share sheet. With nothing exported yet it opens the Export window. The memory is per device.

**Show where exports go**, in the Export window's "…" menu, opens the Exports folder in the file manager (computer; after the first export).