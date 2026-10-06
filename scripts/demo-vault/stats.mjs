// What each example book came to, for the README and for whoever changes the generator:
//   node scripts/demo-vault/stats.mjs            a line a book
//   node scripts/demo-vault/stats.mjs repeats    how often the commonest sentences come round in each
import { SEED, rng } from './core.mjs';
import { EXAMPLES } from './examples/index.mjs';

for (const s of EXAMPLES) {
	const files = new Map(), t0 = Date.now();
	const tally = s.make((path, data) => files.set(path, data), rng(`${SEED}:${s.folder}`), {}, `Examples/${s.folder}`) ?? {};
	console.log(`${s.folder}: ${files.size} files, ${tally.notes ?? '-'} notes, ${tally.folders ?? '-'} folders, ${tally.words ?? '-'} words to export, ${Date.now() - t0} ms`);
	if (process.argv[2] !== 'repeats') continue;
	const seen = new Map();
	for (const d of files.values()) if (typeof d === 'string') for (const m of d.replace(/^---\n[\s\S]*?\n---\n/, '').match(/[^.?!\n]{25,}[.?!]/g) ?? []) seen.set(m.trim(), (seen.get(m.trim()) ?? 0) + 1);
	const top = [...seen].sort((a, b) => b[1] - a[1]);
	console.log(`  ${seen.size} different sentences; the commonest: ${top.slice(0, 3).map(([t, n]) => `${n}× “${t.slice(0, 50)}”`).join(', ')}`);
}
