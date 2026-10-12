// Shards and the verdict (GitHub Actions: .github/workflows/e2e.yml). Each shard is a run-all.mjs of its own on a
// runner of its own (`--shard 3/10`); one last job reads what every shard left (shard.json) and says whether the commit
// passed (tests/e2e/verdict.mjs). All pure, and tested in tests/run-all.test.ts.
import { groups, plural } from './run-all-lib.mjs';

/** "3/10" is the third of ten: `{ index: 2, count: 10 }` (index from zero). Throws a sentence on anything else. */
export function parseShard(text) {
	const m = /^(\d+)\/(\d+)$/.exec(String(text).trim());
	const index = m ? Number(m[1]) - 1 : -1, count = m ? Number(m[2]) : 0;
	if (!m || count < 1 || index < 0 || index >= count) throw new Error(`--shard wants "3/10": the third of ten (got "${text}")`);
	return { index, count };
}

/** The files of one shard: `groups` of all the files into `count`, whichever one is `index`. Every shard works the same
    split out from the same input, so together they cover each file once. A shard past the last group (more shards
    than files) has none. */
export function shardOf(files, { index, count }) {
	return groups(files, count)[index]?.files ?? [];
}

/** What each file took, one pass of the whole file in one theme, from the shards' results: `{ file: ms }`, merged over
    `before`. A shard that says how many tests each file has (`counts`) is read as its runs' mean times that count (a
    core test runs in one theme, a look test in two); an older shard, as the sum over its themes. */
export function timingsFrom(shards, before = {}) {
	const themes = new Set(shards.flatMap((s) => s.themes ?? [])).size || 1, sum = {}, runs = {}, counts = {};
	for (const s of shards) {
		Object.assign(counts, s.counts ?? {});
		for (const r of s.results ?? []) if (r.file) { sum[r.file] = (sum[r.file] ?? 0) + r.ms; runs[r.file] = (runs[r.file] ?? 0) + 1; }
	}
	const took = { ...before };
	for (const [f, ms] of Object.entries(sum)) took[f] = Math.round(counts[f] ? (ms / runs[f]) * counts[f] : ms / themes);
	return Object.fromEntries(Object.entries(took).sort(([a], [b]) => a.localeCompare(b)));
}

/** One verdict out of every shard's shard.json, by the rules run-all.mjs has for one machine: a failure that is an open
    finding or quarantined doesn't count (its mark is already ○); a failure that passed again alone was the load; one of
    the look tier (`tier` on its result; none is core) is reported as look and doesn't count; only a core one that failed
    alone too (or could not be tried again) is real. A shard that is missing, stopped early, ran other code than it
    started with, or left tests unrun is a problem, and so is a spec file that no shard was given or two were.
    `expected`: the `{ theme, shard }` pairs that should be there; `specFiles`: every spec file there is (leave out for
    a narrowed run, which shares only some). `quarantine`: what tiers-lib's `quarantine` made of the list (`active`,
    `ended`, `bad`); an entry that can't be held is a problem. Returns `{ ok, real, look, load, open, held, fixed,
    ended, problems, passed, ... }`. */
export function verdict(shards, { open = [], expected = [], specFiles = null, quarantine = null } = {}) {
	const held = quarantine?.active ?? new Set(), openNames = new Set([...open, ...held]);
	const real = [], look = [], load = [], still = [], kept = [], fixed = [], problems = [...(quarantine?.bad ?? [])];
	let passed = 0, minutes = 0;
	const id = (s) => `${s.shard ?? 'whole'} ${(s.themes ?? []).join('+')}`;
	const key = (name, theme) => `${theme} ${name}`;
	for (const want of expected) {
		if (!shards.some((s) => s.shard === want.shard && (s.themes ?? []).join('+') === want.theme)) problems.push(`Shard ${want.shard} (${want.theme}) left no results: the job failed before the tests, or was cancelled.`);
	}
	for (const s of shards) {
		minutes = Math.max(minutes, s.minutes ?? 0);
		const results = s.results ?? [];
		const retried = new Map((s.alone ?? []).map((a) => [key(a.name, a.theme), a]));
		for (const r of results) {
			if (r.mark === '✓') { passed++; if (openNames.has(r.name)) fixed.push({ ...r, shard: s.shard }); continue; }
			if (r.mark === '○') { (held.has(r.name) ? kept : still).push({ ...r, shard: s.shard }); continue; }
			const a = retried.get(key(r.name, r.theme)), row = { ...r, shard: s.shard };
			if (a?.alone === 'passed') load.push(row);
			else (r.tier === 'look' ? look : real).push({ ...row, aloneErr: a?.aloneErr && a.aloneErr !== r.err ? a.aloneErr : '', retried: !!a });
		}
		if ((s.total ?? 0) > results.length) problems.push(`Shard ${id(s)}: ${s.total - results.length} of ${s.total} tests did not run${(s.early ?? []).length ? ` (job ${s.early.join(', ')} stopped early)` : ''}.`);
		else if ((s.early ?? []).length) problems.push(`Shard ${id(s)}: job ${s.early.join(', ')} stopped early.`);
		if ((s.shifted ?? []).length) problems.push(`Shard ${id(s)}: the checkout moved during the run (${s.shifted.join(', ')}), so nothing was retried.`);
	}
	if (specFiles) {
		for (const theme of new Set(shards.flatMap((s) => s.themes ?? []))) {
			const seen = new Map(), mine = shards.filter((x) => (x.themes ?? []).includes(theme));
			for (const s of mine) for (const f of s.files ?? []) seen.set(f, (seen.get(f) ?? 0) + 1);
			// (the files a theme has tests for, as its shards worked them out: in the dark theme only those with a look test
			// or a test meant for it; a shard too old to say means every spec file)
			const wanted = mine.find((s) => Array.isArray(s.wanted))?.wanted ?? specFiles;
			const none = wanted.filter((f) => !seen.has(f)), twice = [...seen].filter(([, n]) => n > 1).map(([f]) => f);
			if (none.length) problems.push(`In ${theme}, no shard was given: ${none.join(', ')}.`);
			if (twice.length) problems.push(`In ${theme}, more than one shard was given: ${twice.join(', ')}.`);
		}
	}
	const commits = new Set(shards.map((s) => s.commit).filter(Boolean));
	if (commits.size > 1) problems.push(`The shards ran different commits: ${[...commits].map((c) => c.slice(0, 7)).join(', ')}.`);
	return { ok: !real.length && !problems.length, real, look, load, open: still, held: kept, fixed, ended: quarantine?.ended ?? [], problems, passed, shards: shards.length, minutes, commit: [...commits][0] ?? null };
}

/** The verdict as text to read: Markdown for a job's summary page (`markdown`), plain for a terminal. */
export function describe(v, { markdown = false } = {}) {
	const h = (t) => (markdown ? `### ${t}` : t), code = (t) => (markdown ? '```\n' + t + '\n```' : t.replace(/^/gm, '      ')), bullet = markdown ? '- ' : '  ';
	const lines = [markdown ? `## E2E suite: ${v.ok ? 'passed' : 'failed'}` : `E2E suite: ${v.ok ? 'passed' : 'FAILED'}`, ''];
	const look = v.look ?? [], held = v.held ?? [], ended = v.ended ?? [];
	lines.push(`${plural(v.passed, 'test')} passed, ${plural(v.real.length, 'real failure')}, ${plural(look.length, 'look failure')} (not blocking), ${plural(v.load.length, 'failure')} that passed again alone, ${plural(v.open.length, 'open finding')}, ${plural(held.length, 'quarantined failure')}; ${plural(v.shards, 'shard')}, the slowest ${v.minutes} min${v.commit ? `, at ${v.commit.slice(0, 7)}` : ''}.`);
	const entry = (r, more = '') => `${bullet}${r.name} [${r.theme}]\n${code(`${r.file ?? '?'}${r.shard ? `, shard ${r.shard}` : ''}\n${r.err}${more}`)}`;
	if (v.problems.length) lines.push('', h(`Problems (${v.problems.length})`), ...v.problems.map((p) => bullet + p));
	if (v.real.length) lines.push('', h(`Real failures (${v.real.length})`), ...v.real.map((r) => entry(r, r.aloneErr ? `\nalone: ${r.aloneErr}` : r.retried ? '' : '\n(not tried again alone)')));
	if (look.length) lines.push('', h(`Look, reported and not blocking (${look.length})`), ...look.map((r) => entry(r)));
	if (v.load.length) lines.push('', h(`Failed under load, passed alone (${v.load.length})`), ...v.load.map((r) => entry(r)));
	if (v.open.length) lines.push('', h(`Open findings, failing as listed (${v.open.length})`), ...v.open.map((r) => `${bullet}${r.name} [${r.theme}]`));
	if (held.length) lines.push('', h(`Quarantined, failing until their dates (${held.length})`), ...held.map((r) => `${bullet}${r.name} [${r.theme}]`));
	if (ended.length) lines.push('', h(`Quarantine ended: mend or remove these, they count again (${ended.length})`), ...ended.map((q) => `${bullet}${q.name} (${q.owner}, until ${q.until})`));
	if (v.fixed.length) lines.push('', h('Listed as open or quarantined, and passing: take them off the list if that is for good'), ...v.fixed.map((r) => `${bullet}${r.name} [${r.theme}]`));
	return lines.join('\n') + '\n';
}
