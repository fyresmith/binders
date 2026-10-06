// Bundles each tests/*.test.ts for Node (with a stand-in for the "obsidian" module) and runs it.
import esbuild from 'esbuild';
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';

//   npm test                all of them
//   npm test -- lanes view  only the files whose name has one of these words in it
const only = process.argv.slice(2);
const files = readdirSync('tests').filter((f) => f.endsWith('.test.ts') && (!only.length || only.some((w) => f.includes(w))));
if (!files.length) { console.error(`No test file matches ${only.join(', ')}.`); process.exit(1); }
let failed = 0;
for (const f of files) {
	const out = `test-dist/${f.replace(/\.ts$/, '.cjs')}`;
	await esbuild.build({ entryPoints: [`tests/${f}`], bundle: true, platform: 'node', format: 'cjs', outfile: out, alias: { obsidian: './tests/obsidian-stub.ts' }, loader: { '.woff2': 'base64' }, logLevel: 'error' });
	const r = spawnSync(process.execPath, [out], { stdio: 'inherit' });
	if (r.status !== 0) failed++;
}
if (failed) { console.error(`\n${failed} test file(s) failed`); process.exit(1); }
console.log('\nAll tests passed');
