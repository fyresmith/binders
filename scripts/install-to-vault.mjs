// Copies the built plugin into a vault and turns it on there. Every build does this by itself (esbuild.config.mjs
// calls `installAll`), for ./test-vault and, if it has been made, ./demo-vault. By hand, for another vault:
//   npm run install-vault -- /path/to/vault
// Never point this at a real vault you care about without a backup.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

const FILES = ['main.js', 'manifest.json', 'styles.css'];
/** The vaults a build installs into, if they're there: the e2e fixture, and the demo vault (`npm run demo-vault`). */
export const VAULTS = ['test-vault', 'demo-vault'];

/** Installs the build into one vault. False (and nothing copied) if there is no build yet. */
export function install(vault) {
	if (!existsSync('main.js')) return false;
	const dest = `${vault}/.obsidian/plugins/binders`;
	mkdirSync(dest, { recursive: true });
	for (const f of FILES) copyFileSync(f, `${dest}/${f}`);
	const enabled = `${vault}/.obsidian/community-plugins.json`;
	let list = [];
	try { list = JSON.parse(readFileSync(enabled, 'utf8')); } catch { /* none yet, or not one we can read: start one */ }
	if (!Array.isArray(list)) list = [];
	if (!list.includes('binders')) { list.push('binders'); writeFileSync(enabled, JSON.stringify(list, null, 2)); }
	return true;
}

/** Installs the build into each of the project's own vaults that exists. Returns the ones it installed into. */
export function installAll() {
	return VAULTS.filter((v) => existsSync(v) && install(v));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (!existsSync('main.js')) { console.error('Run "npm run build" first.'); process.exit(1); }
	const done = process.argv[2] ? (install(process.argv[2]), [process.argv[2]]) : installAll();
	console.log(done.length ? `Installed Binders into ${done.map((v) => `${v}/.obsidian/plugins/binders`).join(' and ')}.` : 'No vault to install into.');
}
