import { zipSync } from 'fflate';
import { readZip, type ZipWording } from '../src/import/source';
import { escapeMarkdown } from '../src/import/markdown';
import { inBinder, safeName } from '../src/import/plan';
import { PARTLIKE, MATTER, NUMBER, UNNUMBERED } from '../src/export/roles';
import { ok, eq, done } from './harness';

/* The plumbing the Scrivener import and the manuscript import share (src/import/source.ts, plan.ts, markdown.ts). */

const enc = new TextEncoder();
const words: ZipWording = { tooBig: 'TOO BIG', split: 'SPLIT', twin: 'TWIN', link: 'LINK', damaged: (p) => `DAMAGED ${p}` };
function says(fn: () => unknown, text: string, label: string) {
	let got = '';
	try { fn(); } catch (e) { got = e instanceof Error ? e.message : String(e); }
	eq(got, text, label);
}

const zip = zipSync({ 'doc/a.txt': enc.encode('alpha'), 'doc/b.bin': new Uint8Array([1, 2, 3]), 'doc/': new Uint8Array(0) });
eq([...readZip(zip, { words }).keys()].sort().join('|'), 'doc/a.txt|doc/b.bin', 'every file is read, a folder is not one');
// a file the filter turns down is not inflated, and a zip with one is not taken for damaged
const wanted = readZip(zip, { words, filter: (name) => name.endsWith('.txt') });
eq([...wanted.keys()].join('|'), 'doc/a.txt', 'a filter chooses what is inflated');
eq(new TextDecoder().decode(wanted.get('doc/a.txt')), 'alpha', 'and what is inflated is as it was');
says(() => readZip(zipSync({ a: enc.encode('x'), A: enc.encode('y') }), { words }), 'TWIN', 'two names that are one on a disk are said in the words given');
says(() => readZip(new Uint8Array(5), { words }), 'This isn’t a zip file, or it has been cut short.', 'not a zip');
says(() => readZip(zipSync({ '../x': enc.encode('x') }), { words }), 'A file in the project has a name that can’t be read safely.', 'a name that climbs out is refused');
const hurt = zipSync({ 'a.txt': enc.encode('writing') }, { level: 0 });
hurt[new DataView(hurt.buffer).getUint16(26, true) + 30] ^= 1;
says(() => readZip(hurt, { words }), 'DAMAGED a.txt', 'a file that fails its check is said in the words given');
eq(readZip(hurt, { words, filter: () => false }).size, 0, 'a filter that wants nothing gets nothing, and a file it turned down is not looked at');

eq(inBinder('A', 'A/b/c.md'), true, 'a path under the binder');
eq(inBinder('A', 'A/../b'), false, 'a path that climbs out');
eq(safeName('What? A "title"'), 'What A title', 'a name a file can have');

eq(escapeMarkdown('# not a heading'), '\\# not a heading', 'escapeMarkdown, from its new place');
ok(PARTLIKE.test('Part one') && !PARTLIKE.test('Partial'), 'the part pattern, exported');
ok(MATTER.test('Dedication') && !MATTER.test('Chapter 1'), 'the matter pattern, exported');
ok(new RegExp(`^${NUMBER}$`, 'i').test('twelve') && new RegExp(`^${NUMBER}$`, 'i').test('XII'), 'the number pattern, exported');
ok(UNNUMBERED.test('Prologue'), 'the unnumbered pattern');
done('import-source');
