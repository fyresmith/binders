// Makes the hyphenation patterns Binders carries (src/export/pages/patterns/*.ts) from TeX's own, the hyph-utf8
// files of github.com/hyphenation/tex-hyphen, each as it stood at one commit. Run it only to add a language or to
// take a newer commit:
//   node scripts/hyphenation-patterns.mjs                 fetches the files and writes the modules
//   node scripts/hyphenation-patterns.mjs --from <folder> reads hyph-*.tex from a folder instead (no network)
//   node scripts/hyphenation-patterns.mjs --check         writes nothing: fails if a module isn't what upstream makes
// Every pattern set has its own copyright and licence, in the head of its file. That head is copied whole into the
// module, in a comment the build keeps in main.js (esbuild keeps a comment that starts with "!"), because the
// licences ask for the notice to go wherever the patterns go. A language is added here only if its licence lets it
// be given out inside an MIT plugin (MIT, BSD, "copying permitted provided the notice is preserved"): never one that
// is LPPL, LGPL or GPL alone. Write a new one into THIRD-PARTY-NOTICES.md too.
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const COMMIT = '5684c0f51c0b81133db2efbe60a408b4155a3ff5'; // tex-hyphen's master, 2026-02-24
const FOLDER = 'hyph-utf8/tex/generic/hyph-utf8/patterns/tex';
const RAW = `https://raw.githubusercontent.com/hyphenation/tex-hyphen/${COMMIT}/${FOLDER}`;

// left and right: the fewest letters a break leaves before and after it. They are Binders' own, and what its pages
// have always been set with: upstream's "typesetting" hyphenmins but for French (upstream 2 and 2; 3 after the break
// is what babel-french sets) and Portuguese (upstream 2 and 3), where Binders is the more careful.
// sha256: of the file at COMMIT, so a file that isn't the one that was read and checked is never built from.
const LANGUAGES = [
	{ tag: 'de', file: 'hyph-de-1996.tex', left: 2, right: 2, sha256: '374ad1ce3263f8a2791ec070ef9b516c532dae64456f3fb656e617e8ae53a9d3' },
	{ tag: 'en-gb', file: 'hyph-en-gb.tex', left: 2, right: 3, sha256: 'e95bb4ab350f620c41c231c4785d7bdb4f91949d3e631b30e08b3ead3c340a52' },
	{ tag: 'en-us', file: 'hyph-en-us.tex', left: 2, right: 3, sha256: 'f4ffcd96c5cbc886bdad23f95dcae8edc3cd3620eae62f7946eceda97c4e68f8' },
	{ tag: 'es', file: 'hyph-es.tex', left: 2, right: 2, sha256: '6a2e5f39a991a23d1cd8a23dbd0f6fe96a9f07561a6695f4f3320f47030e236c' },
	{ tag: 'fr', file: 'hyph-fr.tex', left: 2, right: 3, sha256: '526cad6fe8f52fcd3caa3fcaf667cb1740cfc14bca198680e00dc343a84594de' },
	{ tag: 'it', file: 'hyph-it.tex', left: 2, right: 2, sha256: '6ce56ed6ed2ca7c0688838e366e6595e0429f984f4fc6e96ec045cebb1e76a47' },
	{ tag: 'pt', file: 'hyph-pt.tex', left: 2, right: 4, sha256: 'c110a39e501db372d1d755e1c64464321a2efa7d8e9617f66001000389b941f2' },
];

const args = process.argv.slice(2), check = args.includes('--check');
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'export', 'pages', 'patterns');
const fail = (why) => { console.error(why); process.exit(1); };

async function read(file) {
	if (from) return readFileSync(join(from, file), 'utf8');
	const res = await fetch(`${RAW}/${file}`);
	if (!res.ok) fail(`${file}: ${res.status} from ${RAW}`);
	return await res.text();
}

/** What is between the braces of a TeX command (`\patterns{…}`), as words, with the comments gone. */
function words(tex, command) {
	const at = tex.indexOf(`\\${command}{`);
	if (at < 0) return [];
	const end = tex.indexOf('}', at);
	return tex.slice(at + command.length + 2, end).split(/\s+/).filter((w) => w);
}

/** A pattern file as the module Binders reads (the shape is `Patterns` in pages/hyphenate.ts). */
function module({ tag, file, left, right }, source) {
	const lines = source.split('\n'), first = lines.findIndex((l) => l.startsWith('\\patterns'));
	if (first < 0) fail(`${file}: no \\patterns`);
	// the head, as it is: every line before the patterns (the title, who made them, the licence, their notes)
	const head = lines.slice(0, first).join('\n').trimEnd();
	if (head.includes('*/')) fail(`${file}: its head would end the comment it is copied into`);
	const tex = lines.map((l) => l.replace(/%.*$/, '')).join('\n').normalize('NFC');
	const patterns = words(tex, 'patterns'), exceptions = words(tex, 'hyphenation');
	// under each length, the patterns of that length run together; `_` for TeX's `.`, a word's edge
	const runs = {};
	for (const p of patterns) {
		if (!/^[.\p{L}\p{M}0-9'-]+$/u.test(p) || p.includes('_')) fail(`${file}: a pattern that isn't letters, digits, an apostrophe or a hyphen: ${p}`);
		runs[p.length] = (runs[p.length] ?? '') + p.replace(/\./g, '_');
	}
	for (const w of exceptions) if (!/^[\p{L}\p{M}-]+$/u.test(w)) fail(`${file}: an exception that isn't a word: ${w}`);
	const sizes = Object.keys(runs).map(Number).sort((a, b) => a - b);
	return [
		`/*! Hyphenation patterns (${tag}), from TeX's hyph-utf8: ${file}, unchanged but in how they are packed.`,
		`https://github.com/hyphenation/tex-hyphen/blob/${COMMIT}/${FOLDER}/${file}`,
		'The head of that file follows, as it is.',
		'',
		head,
		'*/',
		'// Made by scripts/hyphenation-patterns.mjs: change that and run it, not this file.',
		`// ${patterns.length} patterns and ${exceptions.length} words broken by hand.`,
		"import type { Patterns } from '../hyphenate';",
		'',
		'const patterns: Patterns = {',
		`\tleftmin: ${left},`,
		`\trightmin: ${right},`,
		'\tpatterns: {',
		...sizes.map((n) => `\t\t${n}: ${JSON.stringify(runs[n])},`),
		'\t},',
		`\texceptions: ${JSON.stringify(exceptions.join(' '))},`,
		'};',
		'export default patterns;',
		'',
	].join('\n');
}

let wrong = 0;
if (!check) mkdirSync(out, { recursive: true });
for (const language of LANGUAGES) {
	const source = await read(language.file), sum = createHash('sha256').update(source).digest('hex');
	if (sum !== language.sha256) fail(`${language.file}: not the file this script was written for (sha256 ${sum})`);
	const made = module(language, source), path = join(out, `${language.tag}.ts`);
	if (check) {
		let have = '';
		try { have = readFileSync(path, 'utf8'); } catch { /* not made yet */ }
		if (have !== made) { wrong++; console.error(`${language.tag}.ts is not what ${language.file} makes`); }
	} else writeFileSync(path, made);
	console.log(`${language.tag}: ${made.length} characters from ${language.file}`);
}
if (wrong) process.exit(1);
