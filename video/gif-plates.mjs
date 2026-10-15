// The listing GIF's take: listing-shots.mjs builds the listing's book, then gif-takes.mjs is run in it.
import { spawnSync } from 'child_process';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const launch = /^const p = await launch\(.*\);$/m, first = '\t// 1. the corkboard: Part Two';
const listing = readFileSync(join(root, 'tests/e2e/listing-shots.mjs'), 'utf8');
if (!launch.test(listing) || !listing.includes(first)) throw new Error('listing-shots.mjs changed');
const src = listing.replace(launch, (line) => `${line}\nconst __takes = await import(${JSON.stringify(pathToFileURL(join(here, 'gif-takes.mjs')).href)});`).replace(first, `\tawait __takes.session(p, 'full');\n${first}`);
const copy = join(root, 'tests/e2e/.gif-plates-run.mjs');
writeFileSync(copy, src);
try { process.exitCode = spawnSync(process.execPath, [copy, join(here, 'out/gif-plates'), '--only', 'none'], { cwd: root, stdio: 'inherit' }).status ?? 1; } finally { rmSync(copy, { force: true }); }
