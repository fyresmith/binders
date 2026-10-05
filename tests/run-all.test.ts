// The parallel e2e runner's pure parts (tests/e2e/run-all-lib.mjs): sharing files out over jobs, reading run.mjs's output.
import { execFileSync, spawn } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error a plain script, with no types
import { reap } from './e2e/driver.mjs';
// @ts-expect-error a plain script, with no types
import { groups, parser, plural } from './e2e/run-all-lib.mjs';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// sharing out
{
	const files = [['a', 100], ['b', 60], ['c', 50], ['d', 30], ['e', 20], ['f', 10]].map(([file, n]) => ({ file, n, weight: n }));
	const three = groups(files, 3);
	eq(j(three.map((g: { files: string[] }) => g.files)), j([['a'], ['b', 'e', 'f'], ['c', 'd']]), 'heaviest first, each into the lightest group');
	eq(j(three.map((g: { n: number }) => g.n)), j([100, 90, 80]), 'about the same size, heaviest first');
	eq(groups(files, 20).length, 6, 'never more groups than files');
	ok(groups(files, 20).every((g: { files: string[] }) => g.files.length === 1), 'and none empty');
	eq(j(groups(files, 1)[0].files), j(['a', 'b', 'c', 'd', 'e', 'f']), 'one job takes them all');
	// a slow file with few tests is weighed by its time, when that is known
	const timed = groups([{ file: 'slow', n: 2, weight: 500 }, { file: 'x', n: 40, weight: 200 }, { file: 'y', n: 40, weight: 200 }], 2);
	eq(j(timed.map((g: { files: string[] }) => g.files)), j([['slow'], ['x', 'y']]), 'by weight, not by count');
	eq(j(groups(files, 3)), j(groups([...files].reverse(), 3)), 'the same groups whatever order the files come in');
}

// reading results
{
	const got: Record<string, unknown>[] = [];
	const p = parser((r: Record<string, unknown>) => got.push(r));
	const text = [
		'✓ a card opens its note [light]  (412ms)',
		'✗ BUG: the title (it’s long) wraps [dark] ',
		'    the title fits: expected 2, got 3 (1300ms)',
		'○ UX: known [light #2] ',
		'    crashed: Error: x | at y',
		'    a second line of it (88ms)',
		'',
		'1 passed, 1 failed, 1 open findings (tests/e2e/open-findings.json)',
		'',
		'Listed as open, and passing: take them off the list if that\'s for good',
		'  something [light]',
	].join('\n') + '\n';
	// in pieces that cut lines (and a character) in two, as a pipe delivers them
	for (let i = 0; i < text.length; i += 7) p.push(text.slice(i, i + 7));
	p.end();
	eq(got.length, 3, 'three results, and the summary’s lines are none');
	eq(j(got[0]), j({ mark: '✓', name: 'a card opens its note', title: 'a card opens its note [light]', theme: 'light', round: 1, err: '', ms: 412 }), 'a pass');
	eq(j(got[1]), j({ mark: '✗', name: 'BUG: the title (it’s long) wraps', title: 'BUG: the title (it’s long) wraps [dark]', theme: 'dark', round: 1, err: 'the title fits: expected 2, got 3', ms: 1300 }), 'a failure, with its message');
	eq(got[2].name, 'UX: known', 'an open finding');
	eq(got[2].round, 2, 'its round');
	eq(got[2].err, 'crashed: Error: x | at y\n    a second line of it', 'a message of two lines');
	ok(p.finished(), 'run.mjs got to its summary');

	const cut = parser(() => {});
	cut.push('✓ one [light]  (10ms)\n✗ two [light] \n    half a mess');
	cut.end();
	ok(!cut.finished(), 'no summary: the job stopped early');
}

eq(plural(1, 'job'), '1 job', 'one');
eq(plural(2960, 'test'), '2,960 tests', 'many');

// reap (tests/e2e/driver.mjs): ends what a run wrote down that it started, and only that. Stand-ins here: processes
// that do nothing, with the command lines a runner and an Obsidian have.
void (async () => {
	const dir = mkdtempSync(join(tmpdir(), 'binders-reap-test-')), file = join(dir, 'started.jsonl');
	const idle = join(dir, 'idle.mjs'), runner = join(dir, 'run.mjs');
	writeFileSync(idle, 'setInterval(() => {}, 1000);\n');
	writeFileSync(runner, 'setInterval(() => {}, 1000);\n');
	const work = mkdtempSync(join(tmpdir(), 'binders-e2e-')), old = mkdtempSync(join(tmpdir(), 'binders-e2e-')), other = join(dir, 'not-ours');
	mkdirSync(other);
	const obsidian = spawn(process.execPath, [idle, `--user-data-dir=${join(work, 'profile')}`], { detached: true, stdio: 'ignore' });
	const bystander = spawn(process.execPath, [idle], { detached: true, stdio: 'ignore' });
	const run = spawn(process.execPath, [runner], { detached: true, stdio: 'ignore' });
	// as `npm run e2e` starts one: by a path from the folder it is in, which is not how its row names it
	const near = spawn(process.execPath, ['run.mjs'], { cwd: dir, detached: true, stdio: 'ignore' });
	// (a child that has ended stays in the process table, as "Z", until its parent has looked: that is ended too)
	const alive = (pid: number) => { try { return /^[^Z\s]/.test(execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim()); } catch { return false; } };
	try {
		const row = (o: unknown) => appendFileSync(file, JSON.stringify(o) + '\n');
		row({ runner: run.pid, script: runner });
		row({ runner: run.pid, script: runner, pid: obsidian.pid, work });
		row({ runner: near.pid, script: runner });
		row({ runner: 4194000, script: '/nowhere/run.mjs', pid: 4194001, work: old }); // long gone, its folder left behind
		row({ runner: bystander.pid, script: '/nowhere/run.mjs', pid: bystander.pid, work: other }); // ids that are something else now
		row({ runner: process.pid, script: process.argv[1], pid: process.pid, work: other }); // the one that's asking
		appendFileSync(file, 'half a li');
		await new Promise((r) => setTimeout(r, 300));
		ok(alive(obsidian.pid) && alive(run.pid) && alive(near.pid) && alive(bystander.pid), 'all four are running');
		const r = await reap(file);
		eq(j(r), j({ runners: 2, obsidians: 1, folders: 2 }), 'both runners, one Obsidian, and the folders of both rows that had one');
		ok(!alive(run.pid), 'the runner is ended');
		ok(!alive(near.pid), 'and the runner started by a path from its own folder');
		ok(!alive(obsidian.pid), 'its Obsidian is ended');
		ok(alive(bystander.pid), 'a process whose id is in the list but whose command line isn’t what was started is left alone');
		ok(!existsSync(work) && !existsSync(old), 'the throwaway folders are removed, the one left by a run long gone too');
		ok(existsSync(other), 'a folder that isn’t a throwaway one is never removed');
		ok(!existsSync(file), 'the list is removed');
		eq(j(await reap(file)), j({ runners: 0, obsidians: 0, folders: 0 }), 'with no list there is nothing to do');
	} finally {
		for (const p of [obsidian, bystander, run, near]) { try { process.kill(p.pid as number, 'SIGKILL'); } catch { /* ended */ } }
		rmSync(dir, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); rmSync(old, { recursive: true, force: true });
	}
	done('run-all');
})();
