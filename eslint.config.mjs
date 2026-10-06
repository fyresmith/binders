import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  { ignores: ["main.js", "node_modules/**", "test-dist/**", "test-vault/**", "*.mjs"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: "./tsconfig.json" } },
    rules: {
      // a setting named inside a sentence keeps its capital: "Show the Exports folder" (the maintainer's exception, 2026-10-06)
      // (and a product's name is a name: "Import from Scrivener")
      "obsidianmd/ui/sentence-case": ["warn", { enforceCamelCaseLower: true, ignoreRegex: ["^Show the Exports folder$"], ignoreWords: ["Scrivener"] }],
    },
  }
);
