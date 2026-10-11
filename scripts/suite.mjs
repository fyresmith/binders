// The e2e suite on GitHub (.github/workflows/e2e.yml), from the terminal.
//   npm run suite               starts the workflow on main's tip, or reports the run already there
//   npm run suite -- --wait     follows it, then prints the verdict: exit 0 if the commit passed, 1 if not
//   npm run suite -- --again    starts a new run even if there is one (a failed one, say, to see if it was a fluke)
//   npm run suite -- --timings  after a finished run, saves the file times it measured as tests/e2e/timings.json
// A push to main starts the suite by itself; this is for asking after it, and for starting it by hand. Needs the gh CLI.
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gh, startSuite, suiteFor, verdictOf, waitForRun } from './suite-lib.mjs';

const flag = (k) => process.argv.includes('--' + k);
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
	if (state === 'running' && !flag('wait')) { say('Follow it with: npm run suite -- --wait'); process.exit(0); }
	let conclusion = state === 'passed' ? 'success' : 'failure';
	if (state === 'running') { const end = await waitForRun(run.databaseId, { poll }); conclusion = end.conclusion; }
	const dir = mkdtempSync(join(tmpdir(), 'binders-suite-'));
	const v = verdictOf(run.databaseId, dir);
	if (v) say('\n' + v.text);
	else say(`\nThe run left no verdict (${conclusion}): see ${run.url}`);
	if (flag('timings')) {
		if (existsSync(join(dir, 'timings.json'))) { writeFileSync('tests/e2e/timings.json', readFileSync(join(dir, 'timings.json'))); say('Saved tests/e2e/timings.json.'); } else say('That run left no timings.');
	}
	process.exit(conclusion === 'success' ? 0 : 1);
} catch (e) { console.error(e.message); process.exit(1); }
