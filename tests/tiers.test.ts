// The suite's two tiers and its quarantine (tests/e2e/tiers-lib.mjs).
// @ts-expect-error a plain script, with no types
import { quarantine, tierOf, tiered, today, unlisted } from './e2e/tiers-lib.mjs';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const throws = (f: () => unknown) => { try { f(); return ''; } catch (e) { return (e as Error).message; } };

// a test's tier: its own, else its file's, else core
{
	eq(tierOf({ name: 'a' }), 'core', 'nothing said: core');
	eq(tierOf({ name: 'a' }, 'look'), 'look', 'its file says look');
	eq(tierOf({ name: 'a', tier: 'core' }, 'look'), 'core', 'its own wins over its file');
	eq(tierOf({ name: 'a', tier: 'look' }), 'look', 'its own');
	ok(/"a": the tier "loook" is not one of core, look/.test(throws(() => tierOf({ name: 'a', tier: 'loook' }))), 'a typo is refused, not taken for look or core');
	ok(!!throws(() => tierOf({ name: 'a' }, 'cosmetic')), 'and a file\'s typo too');
	const fn = () => 1;
	const specs = tiered({ tier: 'look', specs: [{ name: 'x', fn }, { name: 'y', fn, tier: 'core', timeout: 5 }] });
	eq(j(specs.map((s: { name: string; tier: string }) => [s.name, s.tier])), j([['x', 'look'], ['y', 'core']]), 'a module\'s specs, each with its tier');
	eq(specs[0].fn, fn, 'the test itself is kept');
	eq(specs[1].timeout, 5, 'and what else it says');
	eq(tiered({}).length, 0, 'a module with no specs');
	// tiers.json: a listed name is look, unless the test says otherwise; a file's own tier is under both
	const listed = tiered({ specs: [{ name: 'p', fn }, { name: 'q', fn }, { name: 'r', fn, tier: 'core' }] }, ['q', 'r']);
	eq(j(listed.map((s: { tier: string }) => s.tier)), j(['core', 'look', 'core']), 'listed: look; not listed: core; its own word wins');
	eq(tierOf({ name: 'a' }, 'core', true), 'look', 'listed wins over the file');
	// a name listed that no test has: said, so a renamed test is seen to have become core
	const gone = unlisted({ 'a.mjs': ['p', 'renamed'], 'b.mjs': ['x'] }, { 'a.mjs': ['p', 'q'] });
	eq(j(gone), j([{ file: 'a.mjs', name: 'renamed' }]), 'a stale name is found; a file not loaded is not looked at');
	eq(unlisted({}, { 'a.mjs': ['p'] }).length, 0, 'nothing listed');
}

// the quarantine
{
	const entry = (name: string, until: string, more: Record<string, unknown> = {}) => ({ name, file: 'tests/e2e/specs-a.mjs', owner: 'Caleb', until, why: 'the runner\'s font', ...more });
	const q = quarantine([entry('held', '2026-10-20'), entry('today', '2026-10-12'), entry('over', '2026-10-11')], '2026-10-12');
	eq(j([...q.active]), j(['held', 'today']), 'held until its date, and on the day itself');
	eq(j(q.ended.map((e: { name: string }) => e.name)), j(['over']), 'the day after, it holds nothing');
	eq(q.bad.length, 0, 'nothing wrong');
	const bad = quarantine([entry('no owner', '2026-10-20', { owner: '' }), entry('no date', '', {}), { name: 'bare' }, entry('not a date', '20/10/2026'), entry('no such day', '2026-13-45')], '2026-10-12');
	eq(bad.active.size, 0, 'an entry without its owner, date or reason holds nothing');
	ok(/"no owner"\) has no owner/.test(bad.bad[0]), 'no owner is said');
	ok(/has no until/.test(bad.bad[1]), 'no date is said');
	ok(/"bare"\) has no file, owner, until, why/.test(bad.bad[2]), 'everything missing is said');
	ok(/"20\/10\/2026" is not a date/.test(bad.bad[3]) && /"2026-13-45" is not a date/.test(bad.bad[4]), 'a date that is not one');
	ok(/not a list/.test(quarantine({}, '2026-10-12').bad[0]), 'a file that is not a list');
	eq(quarantine([], '2026-10-12').active.size, 0, 'an empty list');
	eq(today(new Date('2026-10-12T23:30:00-05:00')), '2026-10-13', 'today is UTC, as the runners\' clock is');
}

done('tiers');
