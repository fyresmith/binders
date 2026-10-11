// The release workflow's gate (.github/workflows/release.yml): the tag may be published only if the e2e suite passed for
// the commit the release was made from, the tag commit's parent (`npm run release` checked the same before it tagged).
// The release commit changes nothing but the version files and the changelog, which is checked here, so that what the
// suite ran is what is released. A release made with --skip-suite has its reason in the commit's message
// ("Skipped the suite: …"); it passes, and the reason is written to the file given, for the release notes.
//   node scripts/release-gate.mjs <tag> [skipped-reason-file]
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { suiteFor } from './suite-lib.mjs';

const [tag, reasonFile] = process.argv.slice(2);
if (!tag) { console.error('Usage: node scripts/release-gate.mjs <tag> [file]'); process.exit(2); }
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const ALLOWED = new Set(['CHANGELOG.md', 'package.json', 'package-lock.json', 'manifest.json', 'versions.json']);
const fail = (m) => { console.error('::error::' + m); process.exit(1); };

const parent = git('rev-parse', `${tag}^{commit}^`);
const stray = git('diff', '--name-only', parent, `${tag}^{commit}`).split('\n').filter((f) => f && !ALLOWED.has(f));
if (stray.length) fail(`The release commit changes more than the version files and the changelog (${stray.join(', ')}): the suite that ran on ${parent.slice(0, 7)} does not cover it.`);
const skipped = /^Skipped the suite: (.+)$/m.exec(git('log', '-1', '--format=%B', `${tag}^{commit}`));
if (skipped) {
	console.log(`::warning::Released without the e2e suite. Reason: ${skipped[1]}`);
	if (reasonFile) writeFileSync(reasonFile, skipped[1] + '\n');
	process.exit(0);
}
const { state, run } = suiteFor(parent);
if (state !== 'passed') fail(`The e2e suite has not passed for ${parent.slice(0, 7)}, the commit this release was made from (${state}${run ? `: ${run.url}` : ''}).`);
console.log(`The e2e suite passed for ${parent.slice(0, 7)}: ${run.url}`);
