import { readFileSync } from 'fs';
import { done, eq, ok } from './harness';

/* The stylesheet's rules are all closed. One brace lost where two blocks were joined (the timeline's last rule and
   the progress window's first, 2026-10-10) nests every rule after it under the one left open: nothing reports it,
   and everything below simply has no styles. */

const css = readFileSync('styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
let depth = 0, deepest = 0, openedAt = 0, line = 1, bad = 0;
for (const ch of css) {
	if (ch === '\n') line++;
	else if (ch === '{') { if (depth === 0) openedAt = line; depth++; deepest = Math.max(deepest, depth); } else if (ch === '}') { depth--; if (depth < 0) { bad = bad || line; depth = 0; } }
}
eq(depth, 0, `every rule is closed (the one opened at line ${openedAt} is not)`);
eq(bad, 0, 'no brace closes a rule that isn’t open');
ok(deepest <= 3, `rules nest no deeper than a rule in two at-rules (${deepest} deep)`);

done('styles');
