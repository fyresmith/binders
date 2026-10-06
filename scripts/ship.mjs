// Bumps the version, adds a CHANGELOG entry and commits what is staged, in one step. Every commit ships through here.
//   git add <your files>
//   npm run ship -- <patch|minor|major> "Commit title" --added "…" --changed "…" --fixed "…" --removed "…" [--trailer "Key: value"]…
// With --release the commit is the one to tag: manifest.json and versions.json are given the new version too. Without
// it they stay at the last release's, because Obsidian and BRAT read manifest.json on main and look for a published
// release of exactly that version: a manifest ahead of the releases breaks installing.
// patch: fixes and small refinements. minor: new features or behaviour. major: breaking changes (file format, removed
// features, settings that no longer work). See AGENTS.md.
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { installAll } from './install-to-vault.mjs';

const args = process.argv.slice(2), release = args.includes('--release');
const [bump, title, ...rest] = args.filter((a) => a !== '--release');
if (!['patch', 'minor', 'major'].includes(bump) || !title) {
	console.error('Usage: npm run ship -- <patch|minor|major> "Commit title" --added "…" [--changed|--fixed|--removed "…"] [--trailer "Key: value"] [--release]');
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

// (npm's "version" script is what writes the manifest and versions.json: it runs for a release only)
execFileSync('npm', ['version', bump, '--no-git-tag-version', ...(release ? [] : ['--ignore-scripts'])], { stdio: 'ignore' });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
installAll(); // the vaults have the manifest as it is now
const date = new Date().toISOString().slice(0, 10);
const entry = `## ${version} (${date})\n\n` + Object.entries(SECTIONS).filter(([k]) => notes[k]).map(([k, h]) => `### ${h}\n\n${notes[k].map((n) => `- ${n}`).join('\n')}\n`).join('\n') + '\n';
const log = readFileSync('CHANGELOG.md', 'utf8'), at = log.indexOf('\n## ');
writeFileSync('CHANGELOG.md', at < 0 ? log.trimEnd() + '\n\n' + entry : log.slice(0, at + 1) + entry + log.slice(at + 1));
git('add', 'CHANGELOG.md', 'package.json', 'package-lock.json', ...(release ? ['manifest.json', 'versions.json'] : []));
git('commit', '-q', '-m', `${version}: ${title}` + (trailers.length ? '\n\n' + trailers.join('\n') : ''));
console.log(git('log', '--oneline', '-1'));
if (release) console.log(`Release commit: tag it ${version} (no "v") and push the tag; the workflow publishes the release.`);
