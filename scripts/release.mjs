// Makes a release. Run only when the maintainer asks for one, in his own words, in the session (AGENTS.md, "Releases":
// "releases should not be triggered wantonly ... Only if I issue it", 2026-10-10). Never by an agent on its own
// judgment, never after a suite passes by itself, never on a schedule.
//   npm run release                       checks, works out the version, shows the notes, asks, then releases
//   npm run release -- --wait             if the suite for this commit is not finished (or not started), wait for it
//   npm run release -- --yes              no question (the coordinator, acting on the maintainer's explicit request)
//   npm run release -- --as 1.0.0         the version, by hand (1.0.0 is called this way)
//   npm run release -- --breaking         from 1.0.0 on: a breaking change, so a major version (never inferred)
//   npm run release -- --skip-suite "why" an emergency: no suite; a loud warning, and the reason goes in the release
//                                         commit's message and the release's notes
//   --trailer "Key: value"                for the commit, as ship has it
// It refuses unless: on main, the tree clean, main pushed, `npm run check` passing, at least one Unreleased entry, and
// the e2e workflow has succeeded for exactly this commit. Then it turns Unreleased into "## x.y.z (date)", writes the
// version into package.json, package-lock.json, manifest.json and versions.json, commits "Release x.y.z", tags x.y.z
// (no "v") and pushes the commit and the tag together; the tag starts .github/workflows/release.yml.
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline/promises';
import { applyRelease, hasEntries, nextVersion, notesOf, unreleasedOf } from './changelog-lib.mjs';
import { installAll } from './install-to-vault.mjs';
import { startSuite, suiteFor, waitForRun } from './suite-lib.mjs';

const args = process.argv.slice(2);
const flag = (k) => args.includes('--' + k);
function fail(msg) { console.error(msg); process.exit(1); }
const val = (k) => { const i = args.indexOf('--' + k); if (i < 0) return ''; const v = args[i + 1]; if (!v || v.startsWith('--')) fail(k === 'skip-suite' ? '--skip-suite needs the reason, in words: it goes in the release commit and the release notes.' : `--${k} wants a value`); return v; };
const all = (k) => args.flatMap((a, i) => (a === '--' + k ? [args[i + 1]] : []));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const poll = Number(process.env.BINDERS_SUITE_POLL_MS) || 30000;
for (const a of args.filter((x) => x.startsWith('--'))) if (!['wait', 'yes', 'as', 'breaking', 'skip-suite', 'trailer'].includes(a.slice(2))) fail(`Unknown option ${a}`);
const skip = flag('skip-suite') ? val('skip-suite') : null;
if (flag('skip-suite') && !skip.trim()) fail('--skip-suite needs the reason, in words: it goes in the release commit and the release notes.');

// ---- the refusals ----
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Not on main: a release is made from main.');
if (git('status', '--porcelain')) fail('The tree is not clean: commit or put away what is changed first.');
git('fetch', '-q', 'origin', 'main');
const head = git('rev-parse', 'HEAD');
if (git('rev-parse', 'origin/main') !== head) fail('main is not pushed (or origin has more): push it first, so the suite can run on this commit.');
const log = readFileSync('CHANGELOG.md', 'utf8'), entries = unreleasedOf(log);
if (!hasEntries(entries)) fail('There is nothing under "## Unreleased" in CHANGELOG.md to release.');
const last = JSON.parse(readFileSync('manifest.json', 'utf8')).version, pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (pkg !== last) fail(`package.json is at ${pkg} but manifest.json names the last release, ${last}: they have to agree (scripts/migrate-changelog.mjs sets it).`);
let next;
try { next = nextVersion(last, entries, { breaking: flag('breaking'), as: val('as') }); } catch (e) { fail(e.message); }
if (git('tag', '--list', next.version)) fail(`The tag ${next.version} exists already.`);

const check = process.env.BINDERS_RELEASE_CHECK || 'npm run check'; // (the variable is for this script's own tests)
console.log(`Running ${check}…`);
try { execFileSync('sh', ['-c', check], { stdio: 'inherit' }); } catch { fail('The check failed: fix it first.'); }

// ---- the suite ----
if (skip) {
	console.warn(`\n!!! RELEASING WITHOUT THE E2E SUITE !!!\n!!! Reason: ${skip}\n!!! It goes in the release commit and the release notes.\n`);
} else {
	let { state, run } = suiteFor(head);
	if (state === 'cancelled' || (state === 'none' && flag('wait'))) {
		console.log(state === 'none' ? 'No run of the suite for this commit yet: starting one.' : 'The last run was cancelled: starting another.');
		run = await startSuite(head, { poll: Math.min(poll, 3000) });
		state = 'running';
	}
	if (state === 'running' && flag('wait')) {
		console.log(`Waiting for the suite: ${run.url}`);
		state = (await waitForRun(run.databaseId, { poll })).conclusion === 'success' ? 'passed' : 'failed';
	}
	if (state === 'running') fail(`The suite is still running for ${head.slice(0, 7)} (${run.url}). Wait for it, or: npm run release -- --wait`);
	if (state === 'none') fail(`The suite has not run for ${head.slice(0, 7)}. Start it with npm run suite, or: npm run release -- --wait`);
	if (state === 'cancelled') fail(`The suite was cancelled for ${head.slice(0, 7)}.`);
	if (state === 'failed') fail(`The suite failed for ${head.slice(0, 7)}${run ? ` (${run.url})` : ''}. Read it with: npm run suite -- --wait`);
	console.log(`The suite passed for ${head.slice(0, 7)}${run ? `: ${run.url}` : ''}`);
}

// ---- the question ----
const date = new Date().toISOString().slice(0, 10);
const text = applyRelease(log, next.version, date);
console.log(`\nVersion ${last} -> ${next.version}: ${next.kind}, ${next.why}.\n\n${notesOf(text, next.version)}`);
if (!flag('yes')) {
	if (!process.stdin.isTTY) fail("Not a terminal, so nobody to ask. (--yes is for the coordinator acting on the maintainer's explicit request.)");
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(`Release ${next.version}? Only the maintainer calls a release. [y/N] `);
	rl.close();
	if (!/^y(es)?$/i.test(answer.trim())) fail('Not released.');
} else console.log(`Release ${next.version}? Only the maintainer calls a release. (--yes: the maintainer asked for it.)`);

// ---- the release ----
writeFileSync('CHANGELOG.md', text);
// (npm writes package.json and package-lock.json, and runs the "version" script: version-bump.mjs writes manifest.json and versions.json)
execFileSync('npm', ['version', next.version, '--no-git-tag-version'], { stdio: 'ignore' });
installAll(); // the vaults have the manifest as it is now
git('add', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'manifest.json', 'versions.json');
git('commit', '-q', '-m', [`Release ${next.version}`, ...(skip ? ['', `Skipped the suite: ${skip}`] : []), ...(all('trailer').length ? ['', ...all('trailer')] : [])].join('\n'));
git('tag', next.version);
try { git('push', '--atomic', 'origin', 'main', next.version); } catch (e) {
	fail(`Committed and tagged ${next.version} here, but the push failed: ${e.stderr || e.message}\nPush by hand: git push --atomic origin main ${next.version}\nOr undo: git tag -d ${next.version} && git reset --hard HEAD~1`);
}
console.log(`Released ${next.version}: the tag is pushed, and the Release workflow publishes it.`);
