// The suite on GitHub Actions: sharing the spec files out over shards, and merging every shard's results into one
// verdict (tests/e2e/shard-lib.mjs).
// @ts-expect-error a plain script, with no types
import { describe, parseShard, shardOf, timingsFrom, verdict } from './e2e/shard-lib.mjs';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
type F = { file: string; n: number; weight: number };

// the split: deterministic, and every file in exactly one shard
{
	const files: F[] = Array.from({ length: 105 }, (_, i) => ({ file: `tests/e2e/specs-${i}.mjs`, n: 3 + (i % 7), weight: (i % 13 === 0 ? 400000 : 20000) + i * 997 }));
	for (const count of [1, 2, 7, 10, 20, 105, 150]) {
		const seen = new Map<string, number>();
		for (let index = 0; index < count; index++) for (const f of shardOf(files, { index, count })) seen.set(f, (seen.get(f) ?? 0) + 1);
		eq(seen.size, files.length, `${count} shards: every file is in a shard`);
		ok([...seen.values()].every((n) => n === 1), `${count} shards: and in only one`);
	}
	eq(j(shardOf(files, { index: 3, count: 10 })), j(shardOf([...files].reverse(), { index: 3, count: 10 })), 'the same shard whatever order the files are found in');
	// balanced: the heaviest shard is near the mean
	const weight = (list: string[]) => list.reduce((a, f) => a + (files.find((x) => x.file === f) as F).weight, 0);
	const sums = Array.from({ length: 10 }, (_, index) => weight(shardOf(files, { index, count: 10 })));
	const mean = sums.reduce((a, b) => a + b, 0) / 10;
	ok(Math.max(...sums) < mean * 1.15, `balanced by weight: heaviest ${Math.max(...sums)} against a mean of ${Math.round(mean)}`);
	eq(shardOf(files.slice(0, 3), { index: 5, count: 10 }).length, 0, 'more shards than files: the last have nothing');
	eq(j(parseShard('3/10')), j({ index: 2, count: 10 }), 'parsing a shard');
	for (const bad of ['0/10', '11/10', '3', 'a/b', '3/0', '']) {
		let said = '';
		try { parseShard(bad); } catch (e) { said = (e as Error).message; }
		ok(/--shard wants/.test(said), `"${bad}" is refused`);
	}
}

// the verdict
{
	type R = { name: string; theme: string; mark: string; err: string; ms: number; file: string; tier?: string };
	const r = (name: string, mark: string, file = 'tests/e2e/specs-a.mjs', theme = 'light', err = ''): R => ({ name, theme, mark, err, ms: 1000, file });
	const shard = (n: number, theme: string, results: R[], extra: Record<string, unknown> = {}) => ({ commit: 'abc1234567', shard: `${n}/2`, themes: [theme], files: [...new Set(results.map((x) => x.file))], total: results.length, minutes: 5, early: [], shifted: [], results, alone: [], ...extra });
	const expected = [{ theme: 'light', shard: '1/2' }, { theme: 'light', shard: '2/2' }];
	const green = [shard(1, 'light', [r('a', '✓'), r('b', '✓')]), shard(2, 'light', [r('c', '✓', 'tests/e2e/specs-b.mjs')])];
	const specFiles = ['tests/e2e/specs-a.mjs', 'tests/e2e/specs-b.mjs'];

	let v = verdict(green, { expected, specFiles });
	ok(v.ok && v.passed === 3, 'every shard green: passed');

	// an open finding that fails doesn't count; one that passes is said
	v = verdict([shard(1, 'light', [r('known', '○', 'tests/e2e/specs-a.mjs', 'light', 'x'), r('fixed', '✓')]), green[1]], { expected, specFiles, open: ['known', 'fixed'] });
	ok(v.ok, 'an open finding does not fail the run');
	eq(v.open.length, 1, 'and is listed');
	eq(j(v.fixed.map((x: R) => x.name)), j(['fixed']), 'an open finding that passes is said');

	// failed under load, passed alone: not real; failed alone too: real; not retried: real
	const alone = [{ name: 'load', theme: 'light', file: 'tests/e2e/specs-a.mjs', alone: 'passed', aloneErr: '' }, { name: 'real', theme: 'light', file: 'tests/e2e/specs-a.mjs', alone: 'failed', aloneErr: 'still wrong' }];
	v = verdict([shard(1, 'light', [r('load', '✗', 'tests/e2e/specs-a.mjs', 'light', 'slow'), r('real', '✗', 'tests/e2e/specs-a.mjs', 'light', 'wrong'), r('never', '✗', 'tests/e2e/specs-a.mjs', 'light', 'wrong too')], { alone }), green[1]], { expected, specFiles });
	ok(!v.ok, 'a real failure fails the run');
	eq(j(v.load.map((x: R) => x.name)), j(['load']), 'passed alone: the load');
	eq(j(v.real.map((x: R) => x.name)), j(['real', 'never']), 'failed alone too, or not tried again: real');
	eq(v.real[0].aloneErr, 'still wrong', 'its message when alone');
	ok(/Real failures \(2\)/.test(describe(v)) && /Failed under load, passed alone \(1\)/.test(describe(v)), 'the text sorts them');
	ok(/^## E2E suite: failed/.test(describe(v, { markdown: true })), 'and the Markdown says it');
	ok(/not tried again alone/.test(describe(v)), 'one never retried says so');
	// the same name in the other theme is another test
	v = verdict([shard(1, 'light', [r('x', '✗')], { alone: [{ name: 'x', theme: 'dark', file: 'tests/e2e/specs-a.mjs', alone: 'passed', aloneErr: '' }] })], {});
	eq(v.real.length, 1, 'passing alone in dark does not excuse light');

	// problems
	v = verdict([green[0]], { expected, specFiles });
	ok(!v.ok && v.problems.some((p: string) => /Shard 2\/2 \(light\) left no results/.test(p)), 'a missing shard');
	ok(v.problems.some((p: string) => /no shard was given: tests\/e2e\/specs-b\.mjs/.test(p)), 'and the file nobody ran');
	v = verdict([green[0], { ...green[1], files: ['tests/e2e/specs-a.mjs', 'tests/e2e/specs-b.mjs'] }], { expected, specFiles });
	ok(v.problems.some((p: string) => /more than one shard was given: tests\/e2e\/specs-a\.mjs/.test(p)), 'a file given twice');
	v = verdict([shard(1, 'light', [r('a', '✓')], { total: 4, early: [2] }), green[1]], { expected, specFiles });
	ok(v.problems.some((p: string) => /3 of 4 tests did not run \(job 2 stopped early\)/.test(p)), 'tests that did not run');
	v = verdict([shard(1, 'light', [r('a', '✓')], { shifted: ['main.js'] }), green[1]], { expected, specFiles });
	ok(v.problems.some((p: string) => /checkout moved/.test(p)), 'a moved checkout');
	v = verdict([green[0], { ...green[1], commit: 'ffff000' }], { expected, specFiles });
	ok(v.problems.some((p: string) => /different commits/.test(p)), 'shards of different commits');
	v = verdict(green, { expected: [...expected, { theme: 'dark', shard: '1/2' }], specFiles });
	ok(!v.ok, 'a theme that never ran is a problem');
	// a theme covers the files its shards worked out it has tests for (the dark theme: only those with look tests)
	const darkShard = { ...shard(1, 'dark', [r('d', '✓', 'tests/e2e/specs-a.mjs', 'dark')]), shard: '1/1', wanted: ['tests/e2e/specs-a.mjs'] };
	v = verdict([...green, darkShard], { expected: [...expected, { theme: 'dark', shard: '1/1' }], specFiles });
	ok(v.ok, 'the dark theme is not asked for a file it has no test for');
	v = verdict([...green, { ...darkShard, wanted: specFiles }], { expected: [...expected, { theme: 'dark', shard: '1/1' }], specFiles });
	ok(v.problems.some((p: string) => /In dark, no shard was given: tests\/e2e\/specs-b\.mjs/.test(p)), 'but is for one it has');
	// a narrowed run checks no files
	v = verdict([green[0]], { expected: [expected[0]], specFiles: null });
	ok(v.ok, 'a narrowed run');

	// the look tier: reported, never blocking; an older shard's result with no tier is core
	const lookRow = { ...r('pixels', '✗', 'tests/e2e/specs-a.mjs', 'light', '43 px'), tier: 'look' };
	v = verdict([shard(1, 'light', [lookRow, r('a', '✓')]), green[1]], { expected, specFiles });
	ok(v.ok, 'a look failure does not fail the run');
	eq(j(v.look.map((x: R) => x.name)), j(['pixels']), 'it is listed as look');
	ok(/1 look failure \(not blocking\)/.test(describe(v)) && /Look, reported and not blocking \(1\)/.test(describe(v)), 'and said apart');
	v = verdict([shard(1, 'light', [{ ...r('core', '✗'), tier: 'core' }, r('untiered', '✗')]), green[1]], { expected, specFiles });
	eq(v.real.length, 2, 'a core failure, and one with no tier, are real');
	const lookAlone = [{ name: 'pixels', theme: 'light', file: 'tests/e2e/specs-a.mjs', alone: 'passed', aloneErr: '' }];
	v = verdict([shard(1, 'light', [lookRow], { alone: lookAlone }), green[1]], { expected, specFiles });
	ok(v.ok && v.load.length === 1 && !v.look.length, 'a look failure that passed alone was the load');

	// the quarantine: held until its date, then it counts again
	const held = { active: new Set(['flaky']), ended: [{ name: 'over', owner: 'Caleb', until: '2026-10-01' }], bad: [] };
	v = verdict([shard(1, 'light', [r('flaky', '○', 'tests/e2e/specs-a.mjs', 'light', 'font'), r('known', '○')]), green[1]], { expected, specFiles, open: ['known'], quarantine: held });
	ok(v.ok, 'a quarantined failure does not fail the run');
	eq(j(v.held.map((x: R) => x.name)), j(['flaky']), 'it is listed as quarantined');
	eq(j(v.open.map((x: R) => x.name)), j(['known']), 'apart from the open findings');
	ok(/Quarantine ended: mend or remove these/.test(describe(v)) && /over \(Caleb, until 2026-10-01\)/.test(describe(v)), 'an ended entry is said, with its owner');
	v = verdict([shard(1, 'light', [r('flaky', '✓')]), green[1]], { expected, specFiles, quarantine: held });
	eq(j(v.fixed.map((x: R) => x.name)), j(['flaky']), 'a quarantined test that passes is said');
	v = verdict(green, { expected, specFiles, quarantine: { active: new Set(), ended: [], bad: ['Quarantine entry 1 has no owner.'] } });
	ok(!v.ok && v.problems.includes('Quarantine entry 1 has no owner.'), 'an entry that cannot be held is a problem');
}

// timings
{
	const a = { themes: ['light'], results: [{ file: 'f1', ms: 1000 }, { file: 'f1', ms: 500 }, { file: 'f2', ms: 700 }] };
	const b = { themes: ['dark'], results: [{ file: 'f1', ms: 1700 }] };
	eq(j(timingsFrom([a, b], { f0: 5, f2: 1 })), j({ f0: 5, f1: 1600, f2: 350 }), 'the mean of the themes, over what was there before, sorted');
	// a shard that says how many tests each file has: the mean of its runs, times that (a core test runs in one theme)
	const c = { themes: ['light'], counts: { f1: 4 }, results: [{ file: 'f1', ms: 1000 }, { file: 'f1', ms: 3000 }] };
	const d = { themes: ['dark'], counts: { f1: 4 }, results: [{ file: 'f1', ms: 2000 }] };
	eq(j(timingsFrom([c, d])), j({ f1: 8000 }), 'three runs of a file of four tests, 2 s each: 8 s a pass');
}

done('shards');
