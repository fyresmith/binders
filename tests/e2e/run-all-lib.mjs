// The pure parts of run-all.mjs: sharing spec files out over jobs, and reading run.mjs's output. Tested in
// tests/run-all.test.ts.

export const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

/** Shares `{ file, n, weight }` out into at most `count` groups of about the same weight: the heaviest file first,
    each into the lightest group so far. Returns `{ files, n, weight }` per group, heaviest first, none empty. */
export function groups(files, count) {
	const bins = Array.from({ length: Math.min(count, files.length) }, () => ({ files: [], n: 0, weight: 0 }));
	for (const f of [...files].sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file))) {
		const b = bins.reduce((m, c) => (c.weight < m.weight ? c : m));
		b.files.push(f.file); b.n += f.n; b.weight += f.weight;
	}
	return bins.sort((a, b) => b.weight - a.weight);
}

/** Reads run.mjs's output as it comes, in pieces of any size. A result is a line starting with ✓, ✗ or ○, the test's
    name and `[theme]` (`[theme #round]` when repeated); a failure's message follows on the next lines; `(123ms)` ends
    it. `onResult` gets `{ mark, name, title, theme, round, err, ms }`. `finished()` says whether run.mjs got as far as
    its own summary: if not, it stopped early. */
export function parser(onResult) {
	let rest = '', cur = null, finished = false;
	const line = (l) => {
		if (/^\d+ passed, \d+ failed/.test(l)) finished = true;
		const start = /^([✓✗○]) (.*)$/.exec(l);
		if (start) cur = { mark: start[1], lines: [start[2]] };
		else if (cur) cur.lines.push(l);
		else return;
		const done = /\((\d+)ms\)$/.exec(l);
		if (!done) return;
		const text = cur.lines.join('\n').replace(/\s*\(\d+ms\)$/, '');
		const m = /^([\s\S]*?) \[(light|dark)(?: #(\d+))?\] ?(?:\n {4}([\s\S]*))?$/.exec(text);
		if (m) onResult({ mark: cur.mark, name: m[1], title: `${m[1]} [${m[2]}${m[3] ? ' #' + m[3] : ''}]`, theme: m[2], round: Number(m[3] ?? 1), err: m[4] ?? '', ms: Number(done[1]) });
		cur = null;
	};
	return {
		push(chunk) { const parts = (rest + chunk).split('\n'); rest = parts.pop(); parts.forEach(line); },
		end() { if (rest) line(rest); rest = ''; },
		finished: () => finished,
	};
}

/** How long one test may take when nothing says otherwise: ten minutes. The slowest honest test (a phone journey, six
    Obsidians at once) takes a little over two. */
export const LIMIT = 600000;
/** A test's time limit in ms: its own (`{ name, fn, timeout: ms }` in its spec file), else the `--timeout` flag's
    (seconds), else LIMIT. Anything that isn't a number above zero is passed over. */
export function limitOf(spec, flag) {
	const ok = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
	const secs = flag == null || flag === '' ? NaN : Number(flag);
	return ok(spec?.timeout) ? spec.timeout : ok(secs) ? secs * 1000 : LIMIT;
}
export class TimedOut extends Error {}
/** `work`'s own end, or a TimedOut after `ms` if it hasn't ended by then. The work isn't stopped (nothing can stop a
    promise): whoever asked ends what it was waiting on. A late failure of abandoned work is nobody's any more. */
export function withLimit(work, ms, what = 'it') {
	let timer;
	const late = new Promise((_r, reject) => { timer = setTimeout(() => reject(new TimedOut(`${what} did not finish in ${Math.round(ms / 1000)} s`)), ms); });
	work.catch(() => {});
	return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
