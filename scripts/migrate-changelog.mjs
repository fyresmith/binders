// One-time migration to "versions change only at a release" (AGENTS.md, "Versioning"). The coordinator runs it on main
// once, when this work is merged:
//   node scripts/migrate-changelog.mjs --dry-run      says what it would do, writes nothing
//   node scripts/migrate-changelog.mjs                does it
//   node scripts/migrate-changelog.mjs --fold-released   also folds the per-commit sections between older releases under
//                                                     each release's heading (opt-in: `git checkout CHANGELOG.md` undoes it)
// It folds every section above the last release (manifest.json's version) into one "## Unreleased", grouped and in the
// order the commits were made, leaving out the entries that are plainly internal (docs, roadmap, tests, tooling; it
// prints each one it dropped, to check by eye); and sets the version in package.json and package-lock.json back to the
// last release's, so the next release is worked out from there. Released sections stay as they are. Running it again
// changes nothing. --root <folder> works in another checkout (the tests do).
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { foldReleased, migrate } from './changelog-lib.mjs';

const args = process.argv.slice(2), flag = (k) => args.includes('--' + k);
const root = args.includes('--root') ? args[args.indexOf('--root') + 1] : '.';
const at = (f) => join(root, f), dry = flag('dry-run');
const read = (f) => readFileSync(at(f), 'utf8');

const last = JSON.parse(read('manifest.json')).version;
// each version's commit title, to tell a docs commit from a fix: "0.51.9: Roadmap: …" (git, when there is history)
const titles = {};
try {
	for (const line of execFileSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')) {
		const m = /^(\d+\.\d+\.\d+): (.+)$/.exec(line);
		if (m && !(m[1] in titles)) titles[m[1]] = m[2];
	}
} catch { /* no history: the entries' own words decide */ }

const before = read('CHANGELOG.md');
let { text, dropped, folded } = migrate(before, { last, titles });
let tags = [];
if (flag('fold-released')) {
	tags = execFileSync('git', ['tag', '--list'], { cwd: root, encoding: 'utf8' }).split('\n').filter((t) => /^\d+\.\d+\.\d+$/.test(t));
	text = foldReleased(text, tags);
}
console.log(folded.length ? `Folding ${folded.length} sections (${folded[0]} to ${folded[folded.length - 1]}) above ${last} into Unreleased.` : `Nothing above ${last} to fold into Unreleased.`);
if (dropped.length) console.log(`\nLeft out as internal (${dropped.length}); check them:\n${dropped.map((d) => `  ${d.version} ${d.kind}: ${d.text.slice(0, 110)}${d.text.length > 110 ? '…' : ''}\n      (${d.why})`).join('\n')}`);
if (flag('fold-released')) console.log(`\nFolded the sections between the releases ${tags.join(', ')} under each release's heading.`);

const pkg = JSON.parse(read('package.json'));
const lockText = read('package-lock.json'), lock = JSON.parse(lockText);
const versions = [pkg.version, lock.version, lock.packages?.[''].version];
const setBack = versions.some((v) => v !== last);
if (setBack) console.log(`\npackage.json (${pkg.version}) and package-lock.json go back to ${last}, the last release.`);
if (dry) { console.log('\nDry run: nothing written.'); process.exit(0); }
if (text !== before) writeFileSync(at('CHANGELOG.md'), text);
if (setBack) {
	const keep = (file, o) => { const orig = read(file); writeFileSync(at(file), JSON.stringify(o, null, /^\{\n\t/.test(orig) ? '\t' : 2) + '\n'); };
	pkg.version = last; keep('package.json', pkg);
	lock.version = last; if (lock.packages?.['']) lock.packages[''].version = last; keep('package-lock.json', lock);
}
console.log(text === before && !setBack ? 'Already migrated: nothing changed.' : 'Done.');
