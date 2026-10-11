// How much slower this machine is than the one the time limits of the speed tests were set on. A limit in milliseconds
// is a statement about a machine: GitHub's two-core runners are several times slower than a developer's, and a CPU
// throttle of x4 in the page comes on top of that. So a test measures, in the same page and the same run, a fixed piece
// of plain work (sorting and adding up numbers, nothing of Binders'), and scales its limits by how much longer it took
// than it does on the reference machine (never below 1: a fast machine gets no more room than the reference). A real
// slowdown of the plugin still shows on any machine, since the work it is compared with does not change.
import { j } from './view-helpers.mjs';

/** The work's time on the reference machine (a 16-thread desktop, quiet), in ms. */
export const REFERENCE_MS = 25;

const WORK = `(() => {
	let best = Infinity;
	for (let r = 0; r < 7; r++) {
		const t = performance.now();
		const xs = Array.from({ length: 150000 }, (_, i) => (i * 7919) % 10007);
		xs.sort((a, b) => a - b);
		let s = 0;
		for (let i = 0; i < xs.length; i++) s += xs[i] % 7;
		if (s < 0) return -1;
		best = Math.min(best, performance.now() - t);
	}
	return best;
})()`;

/** The factor (1 or more) to multiply a time limit by on this machine. Measure it without a CPU throttle on. */
export async function slowness(p) {
	const ms = await p.ev(WORK);
	const f = Math.max(1, ms / REFERENCE_MS);
	console.log(`    machine: the reference work took ${ms.toFixed(1)} ms (${REFERENCE_MS} ms on the reference machine): limits ×${f.toFixed(2)}`);
	return f;
}

export const scaled = (limit, f) => Math.round(limit * f);
export { j };
