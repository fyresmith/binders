# Contributing to Binders

Thank you for helping. Binders is an Obsidian plugin for writing long books, and the one rule above all others is
that it never loses a writer's words.

## Reporting a problem

Open an [issue](https://github.com/fyresmith/binders/issues) with:

- what you did, step by step, and what you expected;
- what happened instead, with a screenshot if it shows something;
- your Binders and Obsidian versions, and whether it was on a computer, a phone or a tablet.

If a note's text was lost or changed, say so in the title: those come first.

## Changing the code

1. Read [AGENTS.md](AGENTS.md). It is the contract everyone works to, people and AI agents alike: never touch a real
   vault, never lose writing, plain files, a native look, and how commits and versions work.
2. Set up with Node 22 and npm: `npm install`, then `npm run build`. [Development](docs/dev/development.md) covers the
   two vaults, the tests and the release workflow; [Architecture](docs/dev/architecture.md) is the map of the code.
3. Work on a branch. A bug fix starts with a failing test; new behavior gets unit tests for pure logic and end-to-end
   tests (`npm run e2e`) for anything a writer sees or any change to their notes.
4. `npm run check` (build, lint, unit tests) must pass. Open a pull request that says what changed for writers, in
   one plain sentence.

UI text is in sentence case, in plain words. Styles use Obsidian's own CSS variables and components, so Binders looks
like part of Obsidian in every theme.

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
