// Copies the built plugin into a vault (default: ./test-vault) and turns it on there.
//   npm run build && npm run install-vault [-- /path/to/vault]
// Never point this at a real vault you care about without a backup.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const vault = process.argv[2] || 'test-vault';
if (!existsSync('main.js')) { console.error('Run "npm run build" first.'); process.exit(1); }
const dest = `${vault}/.obsidian/plugins/binders`;
mkdirSync(dest, { recursive: true });
for (const f of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(f, `${dest}/${f}`);

const enabled = `${vault}/.obsidian/community-plugins.json`;
const list = existsSync(enabled) ? JSON.parse(readFileSync(enabled, 'utf8')) : [];
if (!list.includes('binders')) { list.push('binders'); writeFileSync(enabled, JSON.stringify(list, null, 2)); }
console.log(`Installed Binders into ${dest}.`);
