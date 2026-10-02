// Makes the demo vault: binders of every kind and size, to open in Obsidian and try by hand. (test-vault is the small
// fixture the e2e tests count on, and is not for that.)
//   npm run demo-vault                  make or update ./demo-vault
//   npm run demo-vault -- --reset       also put back the generated files that were changed or deleted since
//   npm run demo-vault -- /some/folder  somewhere else
// The same files every time (scripts/demo-vault/build.mjs). Safe to run again: it keeps a list of what it wrote, with
// each file's hash, and writes over a file only if it is still as the generator left it. A file you added or changed
// is never touched, and a generated file you deleted, renamed or moved is not made again. Every build of the plugin
// installs itself into ./demo-vault from then on.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { hash, MANIFEST, plan, reconcile } from './demo-vault/build.mjs';
import { install } from './install-to-vault.mjs';

const args = process.argv.slice(2), reset = args.includes('--reset');
const out = args.find((a) => !a.startsWith('--')) || 'demo-vault';
const t0 = Date.now();
mkdirSync(out, { recursive: true });

// What this disk can hold: two names that differ only in case, and one name written two ways (é as one character,
// and as e with a combining accent). Asked of the disk itself, in the vault's folder: it varies by disk, not by system.
function holds(a, b) {
	const dir = mkdtempSync(join(out, '.probe-'));
	try { writeFileSync(join(dir, a), ''); writeFileSync(join(dir, b), ''); return readdirSync(dir).length === 2; }
	catch { return false; }
	finally { rmSync(dir, { recursive: true, force: true }); }
}
const opts = { caseSensitive: holds('a', 'A'), bothForms: holds('\u00e9', 'e\u0301') };

const files = plan(opts);
const manifestPath = join(out, MANIFEST);
let before = {};
try { before = JSON.parse(readFileSync(manifestPath, 'utf8')).files ?? {}; } catch { /* the first run here */ }
const onDisk = (path) => { try { return hash(readFileSync(join(out, path))); } catch { return null; } };
const next = new Map([...files].map(([path, data]) => [path, hash(data)]));
const { write, remove, kept, gone, files: made } = reconcile(next, before, onDisk, reset);

for (const path of write) {
	const to = join(out, path);
	mkdirSync(dirname(to), { recursive: true });
	writeFileSync(to, files.get(path));
}
for (const path of remove) {
	rmSync(join(out, path), { force: true });
	// and the folders that leaves empty (rmdir refuses one that still has something in it)
	for (let dir = dirname(path); dir !== '.'; dir = dirname(dir)) { try { rmdirSync(join(out, dir)); } catch { break; } }
}
writeFileSync(manifestPath, JSON.stringify({ about: 'Written by scripts/make-demo-vault.mjs: the files it made, with their hashes, so it never writes over one that was changed since.', files: made }, null, '\t') + '\n');

const installed = existsSync('manifest.json') && install(out);
console.log(`${out}: ${files.size} files (${write.length} written, ${remove.length} removed, ${kept.length} kept as changed, ${gone.length} left deleted) in ${Date.now() - t0} ms.`);
const some = (list) => list.slice(0, 20).map((p) => '  ' + p).join('\n') + (list.length > 20 ? `\n  and ${list.length - 20} more` : '');
if (kept.length) console.log(`Kept, since they were changed after they were made:\n${some(kept)}`);
if (gone.length) console.log(`Not made again, since they were deleted, renamed or moved:\n${some(gone)}`);
if (kept.length || gone.length) console.log('"npm run demo-vault -- --reset" puts the generated files back.');
if (!opts.caseSensitive) console.log('This disk can’t hold names that differ only in case: left out of “Odd names”.');
if (!opts.bothForms) console.log('This disk takes é written two ways for one name: left out of “Odd names”.');
console.log(installed ? 'The current build of Binders is installed in it. Open the folder as a vault in Obsidian.' : 'No build to install yet: "npm run build" installs into it.');
