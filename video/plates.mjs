// The film's pictures of the real app. Runs of the manual's screenshot script (tests/e2e/screenshots.mjs), in the
// dark theme at two pixels to the point (a phone's at three), so the camera can go close:
//   the plates: every picture that script takes, in public/plates;
//   the takes: the real app being used, a frame at a time, in public/takes, with where the pointer was for each
//   frame in src/takes.json (takes.mjs says what is done in each).
// That script is run as it is but for the scale and, for the takes, a call to takes.mjs after some of its pictures:
// a copy with those changes is written beside it, run and removed.
//   npm run build && npm run install-vault   (in the project), then   node video/plates.mjs [--takes-only] [--full]
// --full: the take in the listing's book (a novel half written) in place of the manual's small one.
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const theme = process.argv.includes('--theme') ? process.argv[process.argv.indexOf('--theme') + 1] : 'dark';
const original = readFileSync(join(root, 'tests/e2e/screenshots.mjs'), 'utf8');
const launch = /^const p = await launch\(.*\);$/m;
const must = (found, what) => { if (!found) throw new Error(`screenshots.mjs no longer has ${what}, which plates.mjs expects`); };
must(launch.test(original), 'its launch line');
const scaled = original
	.replace(launch, (line) => `${line}\nawait p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });\nconst __takes = await import(${JSON.stringify(pathToFileURL(join(here, 'takes.mjs')).href)});`)
	.replace(/deviceScaleFactor: 1, mobile: true/g, 'deviceScaleFactor: 3, mobile: true')
	.replace(/deviceScaleFactor: 1, mobile: false/g, 'deviceScaleFactor: 2, mobile: false');

const run = (src, args) => {
	const copy = join(root, 'tests/e2e/.plates-run.mjs');
	writeFileSync(copy, src);
	try { return spawnSync(process.execPath, [copy, ...args], { cwd: root, stdio: 'inherit' }).status ?? 1; } finally { rmSync(copy, { force: true }); }
};
/** The script with `code` run after its picture `name`. */
const after = (src, name, code) => {
	const line = `\tawait shot('${name}');\n`;
	must(src.includes(line), `its ${name} picture`);
	return src.replace(line, `${line}\t${code}\n`);
};

let status = 0;
if (!process.argv.includes('--takes-only')) status = run(scaled, [join(here, 'public/plates'), '--theme', theme]);
// (the take changes the book from its first step: it is a run of its own, ended when it is done)
if (!status && process.argv.includes('--full')) {
	// the same evening in the listing's book, a novel half written (tests/e2e/listing-shots.mjs builds it): the take
	// begins once that book is made, before that script's first picture
	const listing = readFileSync(join(root, 'tests/e2e/listing-shots.mjs'), 'utf8'), first = '\t// 1. the corkboard: Part Two';
	must(launch.test(listing) && listing.includes(first), 'listing-shots.mjs: its launch line and its first picture');
	const filmed = listing.replace(launch, (line) => `${line}\nconst __takes = await import(${JSON.stringify(pathToFileURL(join(here, 'takes.mjs')).href)});`).replace(first, `\tawait __takes.session(p, 'full');\n${first}`);
	status = run(filmed, [join(here, 'out/takes-plates'), '--only', 'none']);
} else if (!status) status = run(after(scaled, 'corkboard', 'await __takes.session(p);'), [join(here, 'out/takes-plates'), '--theme', theme, '--only', 'none']);
process.exitCode = status;
