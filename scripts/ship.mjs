// Bumps the version, adds a CHANGELOG entry and commits what is staged, in one step. Every commit ships through here.
//   git add <your files>
//   npm run ship -- <patch|minor|major> "Commit title" --added "…" --changed "…" --fixed "…" --removed "…" [--trailer "Key: value"]…
// patch: fixes and small refinements. minor: new features or behaviour. major: breaking changes (file format, removed
// features, settings that no longer work). See AGENTS.md.
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { installAll } from './install-to-vault.mjs';

const [bump, title, ...rest] = process.argv.slice(2);
if (!['patch', 'minor', 'major'].includes(bump) || !title) {
	console.error('Usage: npm run ship -- <patch|minor|major> "Commit title" --added "…" [--changed|--fixed|--removed "…"] [--trailer "Key: value"]');
	process.exit(1);
}
const SECTIONS = { added: 'Added', changed: 'Changed', fixed: 'Fixed', removed: 'Removed' };
const notes = {}, trailers = [];
for (let i = 0; i < rest.length; i += 2) {
	const k = rest[i].replace(/^--/, ''), v = rest[i + 1];
	if (!v) { console.error(`Missing text after ${rest[i]}`); process.exit(1); }
	if (k === 'trailer') trailers.push(v);
	else if (SECTIONS[k]) (notes[k] ||= []).push(v);
	else { console.error(`Unknown option ${rest[i]}`); process.exit(1); }
}
if (!Object.keys(notes).length) { console.error('Describe the change for the CHANGELOG with --added, --changed, --fixed or --removed.'); process.exit(1); }
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
if (!git('diff', '--cached', '--name-only')) { console.error('Nothing is staged. Stage your changes with git add first.'); process.exit(1); }

execFileSync('npm', ['version', bump, '--no-git-tag-version'], { stdio: 'ignore' });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
installAll(); // the vaults say the new version too (the manifest is copied as it is)
const date = new Date().toISOString().slice(0, 10);
const entry = `## ${version} (${date})\n\n` + Object.entries(SECTIONS).filter(([k]) => notes[k]).map(([k, h]) => `### ${h}\n\n${notes[k].map((n) => `- ${n}`).join('\n')}\n`).join('\n') + '\n';
const log = readFileSync('CHANGELOG.md', 'utf8'), at = log.indexOf('\n## ');
writeFileSync('CHANGELOG.md', at < 0 ? log.trimEnd() + '\n\n' + entry : log.slice(0, at + 1) + entry + log.slice(at + 1));
git('add', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'manifest.json', 'versions.json');
git('commit', '-q', '-m', `${version}: ${title}` + (trailers.length ? '\n\n' + trailers.join('\n') : ''));
console.log(git('log', '--oneline', '-1'));
