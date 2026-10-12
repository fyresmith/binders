// Asking GitHub about the e2e workflow (.github/workflows/e2e.yml) with the gh CLI: used by `npm run suite`,
// `npm run release` and the release workflow's gate (scripts/release-gate.mjs). The pure parts are tested in
// tests/release.test.ts; the rest is tested against a stand-in `gh` on the PATH.
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

export const WORKFLOW = 'e2e.yml';
/** A run counts for a release only if it is titled so: the workflow's run-name for a whole run (a narrowed one has
    another). */
export const WHOLE = 'E2E suite';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs gh with these arguments and returns its output; throws what gh said if it fails. */
export function gh(args, opts = {}) {
	try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim(); } catch (e) {
		if (e.code === 'ENOENT') throw new Error('The gh CLI is needed for this (https://cli.github.com), and signed in: gh auth login.');
		throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${(e.stderr || e.message).toString().trim()}`);
	}
}

/** What the runs of the workflow for one commit add up to: `{ state, run }`. `state`: passed (one whole run succeeded),
    running (one is still going), failed, cancelled, or none. Narrowed runs by hand are no run of the suite. */
export function suiteState(runs) {
	const whole = runs.filter((r) => r.displayTitle === WHOLE).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
	const won = whole.find((r) => r.status === 'completed' && r.conclusion === 'success');
	if (won) return { state: 'passed', run: won };
	const going = whole.find((r) => r.status !== 'completed');
	if (going) return { state: 'running', run: going };
	const last = whole[0];
	if (!last) return { state: 'none', run: null };
	return { state: last.conclusion === 'cancelled' ? 'cancelled' : 'failed', run: last };
}

export const RUN_FIELDS = 'databaseId,status,conclusion,displayTitle,event,headSha,url,createdAt';
/** The suite's state for a commit, asked of GitHub. */
export function suiteFor(sha) {
	return suiteState(JSON.parse(gh(['run', 'list', '--workflow', WORKFLOW, '--commit', sha, '--json', RUN_FIELDS, '--limit', '30']) || '[]'));
}

/** Starts the workflow on main by hand and waits (a minute at most) for the run to show. Returns the run. */
export async function startSuite(sha, { poll = 3000, log = console.log } = {}) {
	const since = new Date(Date.now() - 5000).toISOString();
	gh(['workflow', 'run', WORKFLOW, '--ref', 'main']);
	log('Started the e2e workflow on main.');
	for (let i = 0; i < 20; i++) {
		await sleep(poll);
		const run = JSON.parse(gh(['run', 'list', '--workflow', WORKFLOW, '--commit', sha, '--event', 'workflow_dispatch', '--json', RUN_FIELDS, '--limit', '10']) || '[]').find((r) => r.displayTitle === WHOLE && String(r.createdAt) >= since);
		if (run) return run;
	}
	throw new Error('The workflow was started, but its run did not show up: look at the Actions tab.');
}

/** Follows a run until it ends, saying where it is every few minutes. Returns `{ conclusion, url }`. */
export async function waitForRun(id, { poll = 30000, every = 4, log = console.log } = {}) {
	for (let n = 0; ; n++) {
		const run = JSON.parse(gh(['run', 'view', String(id), '--json', 'status,conclusion,url']));
		if (run.status === 'completed') return run;
		if (n % every === 0) log(`  still running: ${run.url}`);
		await sleep(poll);
	}
}

/** The verdict a finished run left (verdict.json in its `suite-verdict` artifact), or null if it left none. */
export function verdictOf(id, dir) {
	try {
		gh(['run', 'download', String(id), '-n', 'suite-verdict', '-D', dir]);
		return JSON.parse(readFileSync(`${dir}/verdict.json`, 'utf8'));
	} catch { return null; }
}

/** "Known, not now" in one step (`npm run suite -- --accept`): the failures of a verdict (`real` and `look`) whose
    name has `pattern` in it (any case), added to the open findings `open` (`[{ name, file, why }]`) with `why` and
    the day. One test only, unless `all`: a pattern that matches several says them and adds nothing, so a word too short
    can't wave a dozen tests through. Returns `{ list, added, matched, error }`; `list` is `open` with the new ones. */
export function accept(open, verdict, pattern, why, { all = false, day = new Date().toISOString().slice(0, 10) } = {}) {
	const out = { list: open, added: [], matched: [], error: '' };
	if (!pattern?.trim() || !why?.trim()) { out.error = 'Say which test and why: npm run suite -- --accept "<part of its name>" "<why it can wait>"'; return out; }
	const failed = [...(verdict?.real ?? []), ...(verdict?.look ?? [])], p = pattern.toLowerCase();
	const byName = new Map();
	for (const r of failed) if (r.name.toLowerCase().includes(p) && !byName.has(r.name)) byName.set(r.name, r.file ?? '');
	out.matched = [...byName.keys()];
	if (!byName.size) { out.error = `No failure of that run has "${pattern}" in its name.`; return out; }
	if (byName.size > 1 && !all) { out.error = `${byName.size} failures have "${pattern}" in their names; say more of one, or --all for every one:\n${out.matched.map((n) => '  ' + n).join('\n')}`; return out; }
	const have = new Set(open.map((f) => f.name));
	for (const [name, file] of byName) if (!have.has(name)) out.added.push({ name, file, why: `Accepted ${day}: ${why.trim()}` });
	out.list = [...open, ...out.added];
	return out;
}
