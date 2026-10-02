// The whole e2e suite, split over several Obsidians at once (run.mjs runs each share; see there and driver.mjs).
//   npm run e2e:all -- --jobs 6 --theme both     six Obsidians, light then dark in each
//   npm run e2e:all -- --retry-alone             afterwards, run each failure again by itself: a real one fails alone too
//   npm run e2e:all -- --out dir                 where the logs go (default test-dist/e2e-all)
//   npm run e2e:all -- --hover                   a mouse that hovers (BINDERS_HOVER=1 for every job)
//   --grep, --repeat and --specs are passed on to run.mjs.
//   npm run e2e:all -- --reap                    end what an earlier run left behind (after a kill -9, say), and stop
// One log per job (job-1.log …), failure screenshots in shots/, and at the end one summary of them all (also in
// summary.txt). It fails (exit 1) only for failures that aren't listed in open-findings.json; with --retry-alone, only
// for those that fail alone too. Ctrl-C stops every job and closes every Obsidian.
import { spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { reap, record } from './driver.mjs';
import { groups, parser, plural } from './run-all-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const jobs = Math.max(1, Number(arg('jobs', '4')) || 1);
const theme = arg('theme', 'light'), themes = theme === 'both' ? ['light', 'dark'] : [theme];
const grep = arg('grep', ''), repeat = Number(arg('repeat', '1')), out = arg('out', 'test-dist/e2e-all');
const OPEN = 'tests/e2e/open-findings.json', TIMES = join(out, 'timings.json');
mkdirSync(join(out, 'shots'), { recursive: true });

// Every job writes down the Obsidians it starts in one file (driver.mjs), and this runner itself is there too: what
// `--reap` ends, and nothing else. `--reap --shots dir` does the same for a run made with run.mjs alone.
const STARTED = join(arg('shots', join(out, 'shots')), 'started.jsonl');
if (flag('reap')) {
	const r = await reap(STARTED);
	console.log(r.runners + r.obsidians + r.folders ? `Ended ${plural(r.runners, 'runner')} and ${plural(r.obsidians, 'Obsidian')}, and removed ${plural(r.folders, 'throwaway folder')} (${STARTED}).` : `Nothing left behind (${STARTED}).`);
	process.exit(0);
}
record({}, STARTED);

// What there is to run: every spec file's tests, counted by importing it (as run.mjs does), not by reading its text
const files = arg('specs', '') ? arg('specs').split(',') : readdirSync('tests/e2e').filter((f) => /^specs.*\.mjs$/.test(f)).map((f) => 'tests/e2e/' + f);
const re = grep ? new RegExp(grep, 'i') : null, fileOf = new Map(), counted = [];
for (const f of files) {
	let specs;
	try { specs = (await import(pathToFileURL(f).href)).specs; } catch (e) { console.error(`${f} doesn't load: ${e.message}`); process.exit(2); }
	const names = specs.map((s) => s.name).filter((n) => !re || re.test(n));
	for (const n of names) if (!fileOf.has(n)) fileOf.set(n, f);
	if (names.length) counted.push({ file: f, n: names.length });
}
if (!counted.length) { console.error('No tests to run.'); process.exit(2); }
// How long each file took last time, when there is a last time (and the whole file runs): a truer weight than its count
const times = !grep && existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, 'utf8')) : {};
const known = counted.filter((c) => times[c.file]), per = known.length ? known.reduce((a, c) => a + times[c.file], 0) / known.reduce((a, c) => a + c.n, 0) : 1;
const bins = groups(counted.map((c) => ({ ...c, weight: times[c.file] ?? c.n * per })), jobs);
const total = counted.reduce((a, c) => a + c.n, 0) * themes.length * repeat;
const open = new Set(existsSync(OPEN) ? JSON.parse(readFileSync(OPEN, 'utf8')).map((f) => f.name) : []);

const t0 = Date.now(), mins = () => Math.max(1, Math.round((Date.now() - t0) / 60000));
const running = new Set(), results = [], ended = [], alone = [];
let stopping = false;
/** One run.mjs: its output goes to a log and is read for results as it comes. Resolves with how it ended. */
function run(args, log, onResult) {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, ['tests/e2e/run.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BINDERS_E2E_STARTED: STARTED, ...(flag('hover') ? { BINDERS_HOVER: '1' } : {}) } });
		const file = createWriteStream(log), read = parser(onResult);
		running.add(child);
		child.stdout.on('data', (d) => { file.write(d); read.push(d.toString()); });
		child.stderr.on('data', (d) => file.write(d));
		child.on('close', (code, signal) => { running.delete(child); read.end(); file.end(); resolve({ code, signal, finished: read.finished() }); });
	});
}
// Ctrl-C (or a kill): each job closes its Obsidian when told to stop (driver.mjs), so tell them and wait for that
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, async () => {
	if (stopping) return;
	stopping = true;
	console.log(`\nStopping ${plural(running.size, 'job')} and closing every Obsidian…`);
	for (const c of running) c.kill('SIGTERM');
	for (let i = 0; i < 100 && running.size; i++) await new Promise((r) => setTimeout(r, 100));
	for (const c of running) c.kill('SIGKILL');
	report();
	process.exit(130);
});

console.log(`${plural(total, 'test')} in ${plural(counted.length, 'file')}, over ${plural(bins.length, 'job')}${themes.length > 1 ? ', light then dark' : ''}. Logs in ${out}.`);
bins.forEach((b, i) => console.log(`  job ${i + 1}: ${plural(b.n, 'test')}${themes.length * repeat > 1 ? ' a pass' : ''}  ${b.files.map((f) => f.replace(/^tests\/e2e\/specs-?|\.mjs$/g, '') || 'specs').join(' ')}`));
const tick = setInterval(() => console.log(`  ${mins()} min: ${results.length} of ${total} done, ${results.filter((r) => r.mark === '✗').length} failed`), 120000);
await Promise.all(bins.map(async (b, i) => {
	const r = await run(['--theme', theme, '--specs', b.files.join(','), '--shots', join(out, 'shots'), ...(grep ? ['--grep', grep] : []), ...(repeat > 1 ? ['--repeat', String(repeat)] : [])], join(out, `job-${i + 1}.log`), (res) => {
		results.push({ ...res, job: i + 1, file: fileOf.get(res.name) });
		if (res.mark === '✗') console.log(`✗ ${res.title}  (job ${i + 1})\n    ${res.err}`);
	});
	ended[i] = r;
	if (!stopping) console.log(`  job ${i + 1} ${r.finished ? 'done' : `stopped early (${r.signal ?? 'exit ' + r.code}): see ${join(out, `job-${i + 1}.log`)}`} after ${mins()} min`);
}));
clearInterval(tick);
if (stopping) await new Promise(() => {}); // the handler above reports and exits, once every job has ended

// each failure again, by itself, with nothing else running: what fails only under load passes here
if (flag('retry-alone') && !stopping) {
	const failed = results.filter((r) => r.mark === '✗');
	if (failed.length) console.log(`\nRunning ${plural(failed.length, 'failure')} again, one at a time…`);
	for (const [i, f] of failed.entries()) {
		if (stopping) break;
		const again = [];
		// (run.mjs matches names as a pattern: this one is the whole name, and nothing else)
		await run(['--theme', f.theme, '--specs', f.file, '--grep', '^' + f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', '--shots', join(out, 'shots-alone')], join(out, `alone-${i + 1}.log`), (res) => again.push(res));
		const bad = again.find((r) => r.mark !== '✓');
		alone.push({ ...f, alone: again.length && !bad ? 'passed' : 'failed', aloneErr: bad?.err ?? (again.length ? '' : 'it did not run: see ' + join(out, `alone-${i + 1}.log`)) });
		console.log(`  ${again.length && !bad ? 'passed alone (load)' : 'fails alone too'}: ${f.title}`);
	}
}
process.exit(report());

/** Prints and saves the summary of every job; returns the exit code. */
function report() {
	const passed = results.filter((r) => r.mark === '✓'), failed = results.filter((r) => r.mark === '✗'), still = results.filter((r) => r.mark === '○');
	const fixed = passed.filter((r) => open.has(r.name)), early = ended.map((r, i) => (r && !r.finished ? i + 1 : 0)).filter(Boolean);
	const lines = [`\n${passed.length} passed, ${failed.length} failed${still.length ? `, ${plural(still.length, 'open finding')} (${OPEN})` : ''}, in ${mins()} min over ${plural(bins.length, 'job')}`];
	if (results.length < total) lines.push(`${plural(total - results.length, 'test')} didn't run${stopping ? ': stopped' : early.length ? `: job ${early.join(', ')} stopped early (see ${early.length > 1 ? 'their logs' : 'its log'})` : ''}`);
	const entry = (r, more = '') => `  ${r.title}\n      ${r.file ?? '?'}, job ${r.job}${more}\n      ${r.err}`;
	if (alone.length) {
		const real = alone.filter((r) => r.alone === 'failed'), load = alone.filter((r) => r.alone === 'passed');
		if (real.length) lines.push(`\nFails alone too (${real.length})`, ...real.map((r) => entry(r, r.aloneErr && r.aloneErr !== r.err ? `\n      alone: ${r.aloneErr}` : '')));
		if (load.length) lines.push(`\nPassed alone (load) (${load.length})`, ...load.map((r) => entry(r)));
	} else if (failed.length) lines.push(`\nFailed (${failed.length})`, ...failed.map((r) => entry(r)));
	if (fixed.length) lines.push(`\nListed as open, and passing: take them off the list if that's for good`, ...fixed.map((r) => '  ' + r.title));
	const text = lines.join('\n');
	console.log(text);
	writeFileSync(join(out, 'summary.txt'), text.trimStart() + '\n');
	writeFileSync(join(out, 'results.json'), JSON.stringify(results.map(({ name, theme, round, mark, err, ms, job, file }) => ({ name, theme, round, mark, err, ms, job, file })), null, '\t'));
	// what each file took, for balancing the next run (a pass of one theme; only from whole, finished runs)
	if (!grep && !stopping && !early.length) {
		const took = { ...times };
		for (const c of counted) took[c.file] = Math.round(results.filter((r) => r.file === c.file).reduce((a, r) => a + r.ms, 0) / (themes.length * repeat));
		writeFileSync(TIMES, JSON.stringify(took, null, '\t'));
	}
	const real = alone.length ? alone.filter((r) => r.alone === 'failed').length : failed.length;
	return real || early.length || (stopping ? 1 : 0) ? 1 : 0;
}
