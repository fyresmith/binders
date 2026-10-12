// One verdict out of the shards of a GitHub Actions run (.github/workflows/e2e.yml): reads every `shard.json` under a
// folder (each shard's artifact unpacked into a folder of its own), applies run-all.mjs's rules to them together
// (shard-lib.mjs, `verdict`) and says so.
//   node tests/e2e/verdict.mjs shards --shards light:16,dark:4 --themes light,dark   (a whole run: every spec file must
//                                                                                    be covered, in each theme those it has tests for)
//   node tests/e2e/verdict.mjs shards --shards 1 --themes light --narrowed   (a run of some tests: files aren't checked)
//   --summary file   appends the Markdown (the job summary: $GITHUB_STEP_SUMMARY)     --json file   verdict.json
//   --timings file   writes the times of the files this run took, to commit as tests/e2e/timings.json
// Exits 1 unless the commit passed: no real failure (of the core tier) and no problem. Look failures and quarantined
// tests are reported apart (tiers-lib.mjs).
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, timingsFrom, verdict } from './shard-lib.mjs';
import { quarantine, today } from './tiers-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = process.argv[2];
if (!dir || dir.startsWith('--')) { console.error('Usage: node tests/e2e/verdict.mjs <folder of shard artifacts> --shards N --themes light,dark [--narrowed] [--summary file] [--json file] [--timings file]'); process.exit(2); }

const found = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'shard.json') found.push(p); } };
if (existsSync(dir)) walk(dir);
const shards = found.sort().map((p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }).filter(Boolean);

// (--shards 10: as many in each theme; --shards light:16,dark:4: so many in each, as the workflow has them)
const themes = arg('themes', 'light').split(','), given = arg('shards', '1');
const countOf = (theme) => { const m = new RegExp(`(?:^|,)${theme}:(\\d+)`).exec(given); return Number(m ? m[1] : /^\d+$/.test(given) ? given : 1); };
const expected = themes.flatMap((theme) => Array.from({ length: countOf(theme) }, (_, i) => ({ theme, shard: `${i + 1}/${countOf(theme)}` })));
const narrowed = process.argv.includes('--narrowed');
const specFiles = narrowed ? null : readdirSync('tests/e2e').filter((f) => /^specs.*\.mjs$/.test(f)).map((f) => 'tests/e2e/' + f);
const open = existsSync('tests/e2e/open-findings.json') ? JSON.parse(readFileSync('tests/e2e/open-findings.json', 'utf8')).map((f) => f.name) : [];

const QUARANTINE = 'tests/e2e/quarantine.json';
const held = quarantine(existsSync(QUARANTINE) ? JSON.parse(readFileSync(QUARANTINE, 'utf8')) : [], today());
const v = verdict(shards, { open, expected, specFiles, quarantine: held });
console.log(describe(v));
if (arg('summary', '')) appendFileSync(arg('summary'), describe(v, { markdown: true }));
if (arg('json', '')) writeFileSync(arg('json'), JSON.stringify({ ...v, text: describe(v) }, null, '\t'));
// (whole runs only: a narrowed run knows the time of the files it ran, not of the rest)
if (arg('timings', '') && !narrowed && !v.problems.length) {
	const before = existsSync('tests/e2e/timings.json') ? JSON.parse(readFileSync('tests/e2e/timings.json', 'utf8')) : {};
	writeFileSync(arg('timings'), JSON.stringify(timingsFrom(shards, before), null, '\t') + '\n');
}
process.exit(v.ok ? 0 : 1);
