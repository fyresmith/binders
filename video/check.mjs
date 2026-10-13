// The cut, read back: every thing done, when the hand leaves for it, arrives and presses, and how much time it had
// to spare; then every place a hand could not keep up. Run after changing a time in src/direction.mjs.
//   node check.mjs
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { direct } from './src/direction.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const film = direct(JSON.parse(readFileSync(join(here, 'src/takes.json'), 'utf8')));
const f = (n) => n.toFixed(2).padStart(6);
for (const legs of [film.deskLegs, film.phoneLegs]) for (const l of legs) {
	if (l.hidden) { console.log(`${f(l.from)}  keys          to ${f(l.till - 0.25)}  ${l.c.a}`); continue; }
	console.log(`${f(l.c.at)}  leaves ${f(l.leave)}  arrives ${f(l.arrive)}  ${Math.round(l.d).toString().padStart(4)} px in ${f(l.arrive - l.leave)} s  ${l.c.a}${l.c.to ? `  (released ${l.c.to})` : ''}`);
}
console.log(film.warnings.length ? `\n${film.warnings.length} too fast for a hand:\n  ${film.warnings.join('\n  ')}` : '\nEvery move has the time it needs.');
console.log(`${film.sounds.length} sounds.`);
