// The banner's screenshot: the demo vault's novel, "Low Water at Corran", as a corkboard, with the file explorer open
// beside it in the binder's order. Taken in a headless Obsidian by the e2e driver, in the default dark theme, at three
// device pixels to one. Run it again when the corkboard or the explorer looks different, then `npm run banner`:
//   npm run build && node scripts/banner/shoot.mjs
// It makes a demo vault of its own in test-dist/banner/vault (the driver opens a throwaway copy of that), and stages
// the copy as a writer's vault, not a demo: see below. Nothing of the project's is changed but raw/.
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { launch } from '../../tests/e2e/driver.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'raw');
const vault = 'test-dist/banner/vault';
rmSync(vault, { recursive: true, force: true });
execFileSync(process.execPath, ['scripts/make-demo-vault.mjs', vault], { stdio: 'ignore' }); // (installs the build too)
rmSync(join(vault, 'Stress tests'), { recursive: true, force: true }); // 5,000 notes the picture has no use for
mkdirSync(out, { recursive: true });

// The banner places the shot at one CSS pixel to one of the app's; build.mjs counts on this window and sidebar.
const W = 990, H = 760, SCALE = 3, SIDEBAR = 250;
const BOOK = 'Low Water at Corran';
const j = JSON.stringify;
const p = await launch({ vault, theme: 'dark', width: W, height: H, hover: true });
const PL = `app.plugins.plugins.binders`;
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const until = async (expr, what, ms = 10000) => { for (let i = 0; i < ms / 100; i++) { if (await p.ev(expr).catch(() => false)) return; await p.sleep(100); } throw new Error(`never happened: ${what}`); };
try {
	await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
	// Staged, in the throwaway copy: the novel and its story bible at the top of the vault and nothing else; and the
	// book without its four one-line pages of front and back matter, which are cards with a title and nothing on them
	// (two of them would be the first cards in the picture).
	await p.ev(`(async () => {
		const at = (path) => app.vault.getAbstractFileByPath(path);
		await app.fileManager.renameFile(at('Examples/${BOOK}'), ${j(BOOK)});
		await app.fileManager.renameFile(at('Examples/Corran story bible'), 'Story bible');
		for (const gone of ['Examples', 'README.md']) if (at(gone)) await app.vault.delete(at(gone), true);
		await new Promise(r => setTimeout(r, 1500));
		await ${PL}.binders.settled;
		for (const page of ['Dedication', 'Epigraph', 'Acknowledgements', 'About the author']) await app.vault.delete(at(${j(BOOK + '/')} + page + '.md'), true);
		await new Promise(r => setTimeout(r, 1500));
		await ${PL}.binders.settled;
	})().then(() => 1)`);
	await p.ev(`(async () => {
		app.vault.setConfig('showRibbon', false); // Appearance → Show ribbon: off, so the explorer and two cards have the width
		app.workspace.leftSplit.expand();
		app.workspace.leftSplit.setSize(${SIDEBAR});
		app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]);
		await ${PL}.openBinder(app.vault.getAbstractFileByPath(${j(BOOK)}));
		for (const f of [${j(BOOK)}, ${j(BOOK + '/Part One - Ebb')}, ${j(BOOK + '/Part One - Ebb/The stopped clock')}, ${j(BOOK + '/Part One - Ebb/The mail coach')}]) ${EXP}.fileItems[f]?.setCollapsed(false);
	})().then(() => 1)`);
	await until(`!!document.querySelector('.binders-card[data-path]')`, 'the corkboard drew its cards');
	await p.sleep(1500);
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); document.activeElement?.blur?.(); return 1; })()`);
	await p.move(W - 4, H - 4, 2); // the pointer over nothing that would light up
	await p.sleep(900);
	await p.shot(join(out, 'corkboard-dark.png'));
	// what the picture shows, for whoever takes it again
	const state = await p.ev(`(() => { const v = app.workspace.getLeavesOfType('binders-view')[0].view; return JSON.stringify({ obsidian: navigator.userAgent.match(/obsidian\\/[\\d.]+/i)?.[0], plugin: app.plugins.manifests.binders.version, window: [${W}, ${H}, ${SCALE}], folder: v.folder?.path, mode: v.mode, cards: [...document.querySelectorAll('.binders-card[data-path]')].map(c => c.dataset.path), explorer: Math.round(document.querySelector('.workspace-split.mod-left-split').getBoundingClientRect().right), firstCard: (({ x, y, width, height }) => ({ x, y, width, height }))(document.querySelector('.binders-card[data-path]').getBoundingClientRect()) }, null, '\\t'); })()`);
	writeFileSync(join(out, 'state.json'), state + '\n');
	console.log(`scripts/banner/raw/corkboard-dark.png: ${p.running.obsidian ? 'Obsidian ' + p.running.obsidian : 'Obsidian'}. Look at it, then: npm run banner`);
} finally { await p.close(); }
