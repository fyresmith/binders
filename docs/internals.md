# Obsidian internals Binders relies on

Undocumented APIs can change in any Obsidian update. Each one is wrapped in a single function with a feature check and
a fallback, and has an e2e test. Keep this list current.

| Internal | Where | Used for | Fallback | Test |
|---|---|---|---|---|
| File explorer view's child sorting (`getSortedFolderItems`, patched with `monkey-around`) | `src/explorer.ts` (0.3) | Binder order in the explorer | Alphabetical, with a one-time notice | `specs-explorer.mjs` |
| Editable Markdown embeds (as used by Canvas) | `src/view/manuscript.ts` (0.6) | The editable manuscript | Read-only rendered manuscript | `specs-manuscript.mjs` |

None are used yet (0.1).
