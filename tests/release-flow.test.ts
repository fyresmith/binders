// `npm run ship` and `npm run release` end to end, in a throwaway repository with a local bare repository as its remote
// and a stand-in `gh` on the PATH (so nothing touches GitHub): a few ships (one internal, three refused), then a
// release with the suite green, one with it red, running and missing (refused), one with --skip-suite, and the
// release workflow's gate on the tags they made.
import { spawnSync } from 'child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { done, eq, ok } from './harness';

const root = process.cwd(), dir = mkdtempSync(join(tmpdir(), 'binders-release-'));
const remote = join(dir, 'origin.git'), work = join(dir, 'work'), bin = join(dir, 'bin'), state = join(dir, 'gh-state.json'), calls = join(dir, 'gh-calls.log');
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', BINDERS_RELEASE_CHECK: 'true', BINDERS_SUITE_POLL_MS: '20', STUB_STATE: state, STUB_CALLS: calls };
const run = (cmd: string, args: string[], cwd = work) => { const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };
const git = (...a: string[]) => { const r = run('git', a); if (r.code) throw new Error(`git ${a.join(' ')}: ${r.out}`); return r.out.trim(); };
const node = (script: string, ...a: string[]) => run(process.execPath, [join(work, 'scripts', script), ...a]);
const read = (f: string, d = work) => readFileSync(join(d, f), 'utf8');
const suite = (s: string) => writeFileSync(state, JSON.stringify({ suite: s, sha: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: work, encoding: 'utf8' }).stdout.trim() }));

// the stand-in gh: answers `run list` for a commit as the state file says, and the few other calls the scripts make
mkdirSync(bin);
writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('fs'), a = process.argv.slice(2), st = JSON.parse(fs.readFileSync(process.env.STUB_STATE, 'utf8'));
fs.appendFileSync(process.env.STUB_CALLS, a.join(' ') + '\\n');
const arg = (k) => a[a.indexOf(k) + 1];
const run = (status, conclusion, title = 'E2E suite') => ({ databaseId: 7, status, conclusion, displayTitle: title, event: 'push', headSha: arg('--commit'), url: 'https://example.test/run/7', createdAt: new Date().toISOString() });
if (a[0] === 'run' && a[1] === 'list') {
	const s = st.suite, ev = arg('--event');
	if (ev === 'workflow_dispatch') console.log(JSON.stringify(st.dispatched ? [run('completed', 'success')] : []));
	else console.log(JSON.stringify(s === 'green' ? [run('completed', 'success')] : s === 'red' ? [run('completed', 'failure')] : s === 'running' ? [run('in_progress', null)] : s === 'narrowed' ? [run('completed', 'success', 'E2E narrowed x')] : []));
} else if (a[0] === 'workflow' && a[1] === 'run') { st.dispatched = true; fs.writeFileSync(process.env.STUB_STATE, JSON.stringify(st)); }
else if (a[0] === 'api') console.log(st.sha);
else if (a[0] === 'run' && a[1] === 'download') { fs.mkdirSync(arg('-D'), { recursive: true }); fs.writeFileSync(arg('-D') + '/verdict.json', JSON.stringify({ text: 'E2E suite: stub verdict\\n  Real failures (1)\\n' })); }
else if (a[0] === 'run' && a[1] === 'view') console.log(JSON.stringify({ status: 'completed', conclusion: 'success', url: 'https://example.test/run/7' }));
else { console.error('stub gh: not expected: ' + a.join(' ')); process.exit(1); }
`);
chmodSync(join(bin, 'gh'), 0o755);

try {
	// a repository with a first release, its remote, and the scripts under test
	run('git', ['init', '-q', '--bare', '-b', 'main', remote], dir);
	run('git', ['init', '-q', '-b', 'main', work], dir);
	mkdirSync(join(work, 'scripts'));
	for (const f of ['ship.mjs', 'release.mjs', 'release-gate.mjs', 'suite.mjs', 'changelog-lib.mjs', 'suite-lib.mjs', 'install-to-vault.mjs']) copyFileSync(join(root, 'scripts', f), join(work, 'scripts', f));
	copyFileSync(join(root, 'version-bump.mjs'), join(work, 'version-bump.mjs'));
	const pkg = { name: 'x', version: '0.1.0', scripts: { version: 'node version-bump.mjs && git add manifest.json versions.json' } };
	writeFileSync(join(work, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
	writeFileSync(join(work, 'package-lock.json'), JSON.stringify({ name: 'x', version: '0.1.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'x', version: '0.1.0' } } }, null, 2) + '\n');
	writeFileSync(join(work, 'manifest.json'), JSON.stringify({ id: 'x', version: '0.1.0', minAppVersion: '1.0.0' }, null, '\t') + '\n');
	writeFileSync(join(work, 'versions.json'), JSON.stringify({ '0.1.0': '1.0.0' }, null, '\t') + '\n');
	writeFileSync(join(work, 'CHANGELOG.md'), '# Changelog\n\nIntro.\n\n## 0.1.0 (2026-01-01)\n\n### Added\n\n- The first.\n');
	git('add', '.'); git('commit', '-q', '-m', 'Start'); git('remote', 'add', 'origin', remote); git('push', '-q', 'origin', 'main'); git('tag', '0.1.0'); git('push', '-q', 'origin', '0.1.0');
	suite('green');

	// ---- ship ----
	const stage = (name: string) => { writeFileSync(join(work, name), name + '\n'); git('add', name); };
	let r = node('ship.mjs', 'Nothing staged', '--fixed', 'x');
	ok(r.code === 1 && /Nothing is staged/.test(r.out), 'ship: nothing staged is refused');
	stage('a.txt');
	r = node('ship.mjs', 'No entry');
	ok(r.code === 1 && /--internal/.test(r.out), 'ship: neither an entry nor --internal is refused');
	r = node('ship.mjs', 'Both', '--fixed', 'x', '--internal');
	ok(r.code === 1 && /no entry/.test(r.out), 'ship: an entry and --internal together are refused');
	r = node('ship.mjs', '0.2.0: A version in the title', '--fixed', 'x');
	ok(r.code === 1 && /version/.test(r.out), 'ship: a title that starts with a version is refused');
	r = node('ship.mjs', 'patch', 'x', '--fixed', 'y');
	ok(r.code === 1 && /Unknown option/.test(r.out), 'ship: the old first argument is not an option');
	eq(git('log', '--oneline').split('\n').length, 1, 'ship: none of those committed');
	r = node('ship.mjs', 'Fix the thing', '--fixed', 'The thing is fixed.', '--trailer', 'Co-Authored-By: A <a@a>');
	ok(r.code === 0, 'ship: a fix ' + r.out);
	stage('b.txt');
	r = node('ship.mjs', 'Docs: about the thing', '--internal');
	ok(r.code === 0, 'ship: an internal commit ' + r.out);
	eq(git('show', '--stat', '--format=', 'HEAD').includes('CHANGELOG'), false, 'ship: and it leaves the changelog alone');
	stage('c.txt');
	node('ship.mjs', 'A new thing', '--added', 'You can do the new thing.', '--fixed', 'Another fix.');
	eq(read('package.json').includes('"version": "0.1.0"'), true, 'ship: the version is not touched');
	eq(read('manifest.json').includes('0.1.0'), true, 'ship: nor the manifest');
	const log = read('CHANGELOG.md');
	ok(log.startsWith('# Changelog\n\nIntro.\n\n## Unreleased\n\n### Added\n\n- You can do the new thing.\n\n### Fixed\n\n- The thing is fixed.\n- Another fix.\n\n## 0.1.0'), 'ship: entries are under Unreleased, grouped and in order');
	eq(git('log', '--format=%s', '-3'), 'A new thing\nDocs: about the thing\nFix the thing', 'ship: titles carry no version');
	ok(git('log', '-1', '--format=%B', 'HEAD~2').includes('Co-Authored-By: A <a@a>'), 'ship: the trailer is in the message');

	// ---- release: the refusals ----
	r = node('release.mjs', '--yes');
	ok(r.code === 1 && /not pushed/.test(r.out), 'release: main not pushed is refused');
	git('push', '-q', 'origin', 'main');
	writeFileSync(join(work, 'dirty.txt'), 'x');
	r = node('release.mjs', '--yes');
	ok(r.code === 1 && /not clean/.test(r.out), 'release: a dirty tree is refused');
	rmSync(join(work, 'dirty.txt'));
	git('checkout', '-q', '-b', 'other');
	r = node('release.mjs', '--yes');
	ok(r.code === 1 && /Not on main/.test(r.out), 'release: another branch is refused');
	git('checkout', '-q', 'main');
	for (const [s, want] of [['red', /suite failed/], ['running', /still running[^]*--wait/], ['none', /has not run[^]*--wait/], ['narrowed', /has not run/]] as const) {
		suite(s);
		r = node('release.mjs', '--yes');
		ok(r.code === 1 && want.test(r.out), `release: the suite ${s} is refused (${r.out.split('\n').slice(-2)[0]})`);
	}
	eq(git('tag', '--list', '0.2.0'), '', 'release: nothing was tagged');
	suite('green');
	r = node('release.mjs', '--skip-suite');
	ok(r.code === 1 && /reason/.test(r.out), 'release: --skip-suite wants its reason');
	r = node('release.mjs');
	ok(r.code === 1 && /Not a terminal/.test(r.out), 'release: without --yes and without a terminal it will not go ahead');
	ok(/Version 0\.1\.0 -> 0\.2\.0: minor/.test(r.out) && /You can do the new thing\./.test(r.out), 'release: it shows the version and the notes first');
	eq(git('tag', '--list', '0.2.0'), '', 'release: and nothing is tagged');

	// ---- release: green ----
	r = node('release.mjs', '--yes', '--trailer', 'Co-Authored-By: A <a@a>');
	ok(r.code === 0, 'release: with the suite green ' + r.out);
	ok(/Release 0\.2\.0\? Only the maintainer calls a release\./.test(r.out), 'release: the question says who calls a release');
	const head = git('rev-parse', 'HEAD');
	eq(git('log', '-1', '--format=%s'), 'Release 0.2.0', 'release: the commit is "Release 0.2.0"');
	ok(git('log', '-1', '--format=%B').includes('Co-Authored-By: A <a@a>'), 'release: with the trailer');
	eq(git('rev-parse', '0.2.0^{commit}'), head, 'release: tagged without a v');
	eq(run('git', ['rev-parse', '0.2.0^{commit}'], remote).out.trim(), head, 'release: the tag is on the remote with the commit');
	eq(run('git', ['rev-parse', 'main'], remote).out.trim(), head, 'release: and main');
	ok(read('package.json').includes('"version": "0.2.0"') && read('package-lock.json').includes('"version": "0.2.0"'), 'release: package.json and the lock');
	ok(JSON.parse(read('manifest.json')).version === '0.2.0' && JSON.parse(read('versions.json'))['0.2.0'] === '1.0.0', 'release: manifest.json and versions.json');
	ok(/^# Changelog\n\nIntro\.\n\n## 0\.2\.0 \(\d{4}-\d\d-\d\d\)\n\n### Added\n\n- You can do the new thing\.\n\n### Fixed\n\n- The thing is fixed\.\n- Another fix\.\n\n## 0\.1\.0/.test(read('CHANGELOG.md')), 'release: Unreleased became the version');
	eq(git('show', '--stat', '--format=', 'HEAD').split('\n').filter((l) => l.includes('|')).length, 5, 'release: it changes five files');
	r = node('release.mjs', '--yes');
	ok(r.code === 1 && /nothing under/.test(r.out), 'release: nothing new, nothing to release');

	// ---- the gate on that tag ----
	r = node('release-gate.mjs', '0.2.0', join(dir, 'skipped.txt'));
	ok(r.code === 0 && /passed/.test(r.out), 'gate: the suite passed for the parent');
	ok(read('gh-calls.log', dir).includes('--commit ' + git('rev-parse', '0.2.0^')), 'gate: it asked about the commit before the release commit');
	suite('red');
	r = node('release-gate.mjs', '0.2.0', join(dir, 'skipped.txt'));
	ok(r.code === 1 && /has not passed/.test(r.out), 'gate: a red suite stops the release');
	suite('green');

	// ---- release: --skip-suite, with the suite red ----
	stage('d.txt');
	node('ship.mjs', 'Fix another', '--fixed', 'A fix.');
	git('push', '-q', 'origin', 'main');
	suite('red');
	r = node('release.mjs', '--yes', '--skip-suite', 'the server is down');
	ok(r.code === 0 && /RELEASING WITHOUT THE E2E SUITE/.test(r.out) && /the server is down/.test(r.out), 'skip: a loud warning ' + r.out);
	eq(git('log', '-1', '--format=%s'), 'Release 0.2.1', 'skip: only Fixed is a patch');
	ok(git('log', '-1', '--format=%B').includes('Skipped the suite: the server is down'), 'skip: the reason is in the commit message');
	r = node('release-gate.mjs', '0.2.1', join(dir, 'skipped.txt'));
	ok(r.code === 0 && read('skipped.txt', dir).trim() === 'the server is down', 'gate: a skipped release passes, and gives its reason for the notes');

	// ---- release: --wait with no run yet ----
	stage('e.txt');
	node('ship.mjs', 'Add another', '--added', 'Another thing.');
	git('push', '-q', 'origin', 'main');
	suite('none');
	r = node('release.mjs', '--yes', '--wait');
	ok(r.code === 0 && /starting one/.test(r.out) && /Release 0\.3\.0/.test(r.out), '--wait: with no run it starts one and waits ' + r.out);
	ok(/workflow run e2e\.yml/.test(read('gh-calls.log', dir)), '--wait: through gh');

	// ---- the gate refuses a release commit that changes more than the version files ----
	writeFileSync(join(work, 'stray.txt'), 's');
	git('add', 'stray.txt'); git('commit', '-q', '-m', 'Release 0.9.0'); git('tag', '0.9.0');
	r = node('release-gate.mjs', '0.9.0');
	ok(r.code === 1 && /more than the version files/.test(r.out), 'gate: a release commit with other changes in it is refused');

	// ---- the migration script, on a copy of the real changelog ----
	const mig = join(dir, 'mig');
	mkdirSync(mig);
	for (const f of ['CHANGELOG.md', 'manifest.json', 'package.json', 'package-lock.json']) copyFileSync(join(root, f), join(mig, f));
	const was = read('CHANGELOG.md', mig), last = JSON.parse(read('manifest.json', mig)).version;
	const script = join(root, 'scripts', 'migrate-changelog.mjs');
	r = run(process.execPath, [script, '--dry-run', '--root', mig], dir);
	ok(r.code === 0 && /Dry run/.test(r.out) && read('CHANGELOG.md', mig) === was, 'migrate: a dry run writes nothing ' + r.out.slice(0, 200));
	r = run(process.execPath, [script, '--root', mig], dir);
	ok(r.code === 0, 'migrate: it runs ' + r.out);
	eq(JSON.parse(read('package.json', mig)).version, last, 'migrate: package.json is at the last release');
	eq(JSON.parse(read('package-lock.json', mig)).packages[''].version, last, 'migrate: and the lock');
	const migrated = read('CHANGELOG.md', mig);
	r = run(process.execPath, [script, '--root', mig], dir);
	ok(/Already migrated/.test(r.out) && read('CHANGELOG.md', mig) === migrated, 'migrate: again, it changes nothing');

	// ---- npm run suite ----
	suite('green');
	r = node('suite.mjs');
	ok(r.code === 0 && /Passed: https/.test(r.out), 'suite: a passed run is reported');
	suite('red');
	r = node('suite.mjs', '--wait');
	ok(r.code === 1 && /stub verdict/.test(r.out), 'suite --wait: a failed run prints its verdict and exits 1');
	suite('none');
	r = node('suite.mjs');
	ok(r.code === 0 && /No run of the suite/.test(r.out) && /Started the e2e workflow/.test(r.out) && /--wait/.test(r.out), 'suite: with no run it starts one and says how to follow it ' + r.out);
	suite('running');
	r = node('suite.mjs', '--wait');
	ok(r.code === 0 && /Running: https/.test(r.out) && /stub verdict/.test(r.out), 'suite --wait: follows a run to its end ' + r.out);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
done('release flow');
