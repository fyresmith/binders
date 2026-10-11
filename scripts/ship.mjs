// Commits what is staged, with its entry for the CHANGELOG. Every commit goes through here. It does not change the
// version: that happens only at a release (`npm run release`, AGENTS.md).
//   git add <your files>
//   npm run ship -- "Commit title" --added "…" --changed "…" --fixed "…" --removed "…" [--trailer "Key: value"]…
//   npm run ship -- "Commit title" --internal [--trailer …]
// The entries go under "## Unreleased" at the top of CHANGELOG.md, in the order commits are made. --internal is for a
// commit nothing in it is noticed by a writer (docs, tests, tooling, the roadmap, a refactor): no entry. A commit with
// neither an entry nor --internal is refused. The title does not start with a version.
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { addUnreleased } from './changelog-lib.mjs';

const USAGE = 'Usage: npm run ship -- "Commit title" (--added|--changed|--fixed|--removed "…")… | --internal  [--trailer "Key: value"]';
const [title, ...rest] = process.argv.slice(2);
if (!title || title.startsWith('--')) { console.error(USAGE); process.exit(1); }
if (/^v?\d+\.\d+\.\d+\b/.test(title)) { console.error('The title does not start with a version: the version is given at a release.'); process.exit(1); }
const notes = {}, trailers = [];
let internal = false;
for (let i = 0; i < rest.length; i++) {
	const k = rest[i].replace(/^--/, ''), v = rest[i + 1];
	if (k === 'internal') { internal = true; continue; }
	if (!['added', 'changed', 'fixed', 'removed', 'trailer'].includes(k) || !rest[i].startsWith('--')) { console.error(`Unknown option ${rest[i]}\n${USAGE}`); process.exit(1); }
	if (!v) { console.error(`Missing text after ${rest[i]}`); process.exit(1); }
	if (k === 'trailer') trailers.push(v); else (notes[k] ||= []).push(v);
	i++;
}
const entries = Object.keys(notes).length;
if (internal && entries) { console.error('--internal means no entry for the CHANGELOG: drop it, or drop the entries.'); process.exit(1); }
if (!internal && !entries) { console.error('Describe the change for the CHANGELOG with --added, --changed, --fixed or --removed, or say --internal (docs, tests, tooling, the roadmap, a refactor: nothing a writer notices).'); process.exit(1); }
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
if (!git('diff', '--cached', '--name-only')) { console.error('Nothing is staged. Stage your changes with git add first.'); process.exit(1); }

if (entries) {
	writeFileSync('CHANGELOG.md', addUnreleased(readFileSync('CHANGELOG.md', 'utf8'), notes));
	git('add', 'CHANGELOG.md');
}
git('commit', '-q', '-m', title + (trailers.length ? '\n\n' + trailers.join('\n') : ''));
console.log(git('log', '--oneline', '-1'));
