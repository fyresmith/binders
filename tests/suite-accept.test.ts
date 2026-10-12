// "Known, not now" in one step: npm run suite -- --accept (scripts/suite-lib.mjs, accept).
// @ts-expect-error a plain script, with no types
import { accept } from '../scripts/suite-lib.mjs';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
type F = { name: string; file: string; why: string };
const verdict = {
	real: [
		{ name: 'outliner: a phone: rows are 44 px tall', file: 'tests/e2e/specs-outliner.mjs', theme: 'light' },
		{ name: 'outliner: a phone: rows are 44 px tall', file: 'tests/e2e/specs-outliner.mjs', theme: 'dark' },
		{ name: 'journey: 6. a big book', file: 'tests/e2e/specs-qa4-journey.mjs', theme: 'light' },
	],
	look: [{ name: 'qa5 outliner: phone: the title column takes the room', file: 'tests/e2e/specs-qa5-outliner.mjs', theme: 'light' }],
};
const open: F[] = [{ name: 'already', file: 'tests/e2e/specs-a.mjs', why: 'old' }];

let a = accept(open, verdict, 'BIG BOOK', 'a slow runner', { day: '2026-10-12' });
eq(a.error, '', 'one failure matched, in any case');
eq(j(a.added), j([{ name: 'journey: 6. a big book', file: 'tests/e2e/specs-qa4-journey.mjs', why: 'Accepted 2026-10-12: a slow runner' }]), 'it is added with its file, the reason and the day');
eq(j(a.list.map((f: F) => f.name)), j(['already', 'journey: 6. a big book']), 'after what was there');
eq(open.length, 1, 'the list given is not changed in place');

a = accept(open, verdict, 'rows are 44', 'later');
eq(a.added.length, 1, 'a test failing in both themes is one entry');
a = accept(open, verdict, 'outliner', 'later');
ok(!!a.error && /2 failures have "outliner"/.test(a.error) && a.added.length === 0, 'several matched: said, and nothing added');
a = accept(open, verdict, 'outliner', 'later', { all: true });
eq(a.added.length, 2, '--all adds every one, look failures too');
a = accept(open, verdict, 'nothing like it', 'why');
ok(/No failure of that run/.test(a.error), 'nothing matched');
ok(!!accept(open, verdict, 'big book', '').error && !!accept(open, verdict, '', 'why').error, 'a name and a reason are both asked for');
a = accept([{ name: 'journey: 6. a big book', file: 'x', why: 'y' }], verdict, 'big book', 'again');
eq(a.added.length, 0, 'one already listed is not listed twice');
eq(accept(open, null, 'big book', 'why').error, 'No failure of that run has "big book" in its name.', 'no verdict');

done('suite accept');
