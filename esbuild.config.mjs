import esbuild from "esbuild";
import process from "process";
import { readFileSync, watchFile } from "node:fs";
import { builtinModules } from "node:module";
import { installAll } from "./scripts/install-to-vault.mjs";

// (a release ships only main.js, so the notices the typefaces', the patterns' and the libraries' licences ask for go in it)
const notices = readFileSync("THIRD-PARTY-NOTICES.md", "utf8").replaceAll("*/", "* /").trim();
const banner = `/*
Binders: ordered folders, corkboards and manuscripts for Obsidian.
This is a generated file. The source lives at https://github.com/fyresmith/binders

${notices}
*/
`;
const prod = process.argv[2] === "production";

// Every build that succeeds is installed into test-vault and, if it has been made, demo-vault: the one way a vault
// gets the plugin (scripts/install-to-vault.mjs), so neither ever runs an older build than the one just made.
const install = {
  name: "install-to-vaults",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      const into = installAll();
      if (into.length) console.log(`Installed into ${into.join(" and ")}.`);
    });
  },
};

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  format: "cjs",
  // the typefaces the pages are set in travel inside main.js (src/export/pages/fonts.ts)
  loader: { ".woff2": "base64" },
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  plugins: [install],
});

if (prod) { await context.rebuild(); process.exit(0); }
else {
  await context.watch();
  // esbuild watches only what main.js is built from. The stylesheet and the manifest are copied as they are, so
  // they're watched here (by polling, which survives an editor that saves by replacing the file).
  for (const f of ["styles.css", "manifest.json"]) {
    watchFile(f, { interval: 300 }, () => {
      const into = installAll();
      if (into.length) console.log(`${f} changed: installed into ${into.join(" and ")}.`);
    });
  }
}
