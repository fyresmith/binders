// The e2e suite on GitHub (.github/workflows/e2e.yml), from the terminal.
//   npm run suite               starts the workflow on main's tip, or reports the run already there
//   npm run suite -- --wait     follows it, then prints the verdict: exit 0 if the commit passed, 1 if not
//   npm run suite -- --again    starts a new run even if there is one (a failed one, say, to see if it was a fluke)
//   npm run suite -- --timings  after a finished run, saves the file times it measured as tests/e2e/timings.json
//   npm run suite -- --accept "part of a test's name" "why it can wait"
//                               after a finished run, lists that failing test in tests/e2e/open-findings.json, so it is
//                               reported and doesn't block (one test; --all for every failure the words match). Commit it.
// A push to main starts the suite by itself; this is for asking after it, and for starting it by hand. Needs the gh CLI.
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { accept, gh, startSuite, suiteFor, verdictOf, waitForRun } from './suite-lib.mjs';

const flag = (k) => process.argv.includes('--' + k);
const after = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv.slice(i + 1, i + 3).filter((a) => !a.startsWith('--')) : []; };
const poll = Number(process.env.BINDERS_SUITE_POLL_MS) || 30000;
const say = console.log;
try {
	const sha = gh(['api', 'repos/{owner}/{repo}/commits/main', '--jq', '.sha']);
	let local = '';
	try { local = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
	say(`main on GitHub is ${sha.slice(0, 7)}${local && local !== sha ? ` (this checkout is at ${local.slice(0, 7)}: push first if that is the commit you mean)` : ''}.`);
	let { state, run } = suiteFor(sha);
	if (flag('again') || state === 'none' || state === 'cancelled') {
		say(state === 'none' ? 'No run of the suite for it yet.' : flag('again') ? 'Starting another run.' : 'The last run was cancelled.');
		run = await startSuite(sha, { poll: Math.min(poll, 3000) });
		state = 'running';
	}
	say(`${state === 'running' ? 'Running' : state === 'passed' ? 'Passed' : 'Failed'}: ${run.url}`);
	if (state === 'running' && !flag('wait')) { say(`Follow it with: npm run suite -- --wait${flag('accept') ? ' (--accept needs a finished run)' : ''}`); process.exit(0); }
	let conclusion = state === 'passed' ? 'success' : 'failure';
	if (state === 'running') { const end = await waitForRun(run.databaseId, { poll }); conclusion = end.conclusion; }
	const dir = mkdtempSync(join(tmpdir(), 'binders-suite-'));
	const v = verdictOf(run.databaseId, dir);
	if (v) say('\n' + v.text);
	else say(`\nThe run left no verdict (${conclusion}): see ${run.url}`);
	if (flag('timings')) {
		if (existsSync(join(dir, 'timings.json'))) { writeFileSync('tests/e2e/timings.json', readFileSync(join(dir, 'timings.json'))); say('Saved tests/e2e/timings.json.'); } else say('That run left no timings.');
	}
	if (flag('accept')) {
		const [pattern, why] = after('accept'), OPEN = 'tests/e2e/open-findings.json';
		const open = existsSync(OPEN) ? JSON.parse(readFileSync(OPEN, 'utf8')) : [];
		const a = accept(open, v, pattern, why, { all: flag('all') });
		if (a.error) { console.error('\n' + a.error); process.exit(1); }
		if (!a.added.length) say(`\nAlready listed in ${OPEN}: ${a.matched.join('; ')}`);
		else {
			writeFileSync(OPEN, '[\n' + a.list.map((f) => '\t' + JSON.stringify(f)).join(',\n') + '\n]\n');
			say(`\nListed in ${OPEN}, reported from now on and not blocking:\n${a.added.map((f) => '  ' + f.name).join('\n')}\nCommit it (npm run ship -- "Tests: … is an open finding" --internal).`);
		}
	}
	process.exit(conclusion === 'success' ? 0 : 1);
} catch (e) { console.error(e.message); process.exit(1); }
