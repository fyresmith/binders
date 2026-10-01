// The README's screenshots: The Lighthouse in each mode, and the file explorer, at 1280×800 in the light theme, plus a
// phone. Runs in a throwaway copy of test-vault, like the e2e tests.
//   npm run build && npm run install-vault && node tests/e2e/screenshots.mjs [outdir]
import { mkdirSync, writeFileSync } from 'fs';
import { launch } from './driver.mjs';

const out = process.argv[2] || 'docs/images';
mkdirSync(out, { recursive: true });
const p = await launch({ theme: 'light', width: 1280, height: 800 });
const V = `app.workspace.getLeavesOfType('binders-view')[0].view`;
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
try {
	// a little more to see: a synopsis for the book and for Part One, labels on a few scenes
	await p.ev(`(async () => {
		const pm = (path, fn) => app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), fn);
		await pm('The Lighthouse/The Lighthouse.md', (fm) => { fm.synopsis = 'A keeper, a newcomer, and the night the light went out.'; fm.target = 50000; fm.plotlineColors = { Mara: 'blue', "The keeper's secret": 'orange' }; });
		await app.vault.create('The Lighthouse/Part One/Part One.md', '---\\nsynopsis: Mara comes to the island and learns the rules of the light.\\nstatus: revised\\n---\\n');
		await app.vault.create('The Lighthouse/Part Two/Part Two.md', '---\\nsynopsis: The storm, the wreck, and what the keeper kept.\\nstatus: draft\\n---\\n');
		for (const [f, l] of [['Prologue', 'purple'], ['Part One/Arrival', 'blue'], ['Part One/Storm warning', 'orange'], ['Part Two/The wreck', 'red'], ['Epilogue', 'purple']]) await pm('The Lighthouse/' + f + '.md', (fm) => { fm.label = l; });
		await app.plugins.plugins.binders.binders.settled;
	})().then(() => 1)`);
	await p.sleep(500);
	const show = async (mode) => {
		await p.ev(`(() => { ${V}.setMode(${JSON.stringify(mode)}); return 1; })()`);
		await p.sleep(1500);
	};
	// the explorer open beside the binder, in binder order
	await p.ev(`(async () => {
		app.workspace.leftSplit.expand();
		app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]);
		await app.plugins.plugins.binders.openBinder(app.vault.getAbstractFileByPath('The Lighthouse'));
		for (const f of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two']) ${EXP}.fileItems[f]?.setCollapsed(false);
	})().then(() => 1)`);
	await p.sleep(1500);
	// a selected card, clicked as a person would
	const card = await p.at('.binders-card[data-path="The Lighthouse/Part One/The keeper.md"] .binders-card-footer');
	await p.click(card.x, card.y);
	await p.move(1000, 760, 2);
	await p.sleep(400);
	await p.shot(`${out}/corkboard.png`);
	// the file explorer, close up
	const r = await p.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 720, height: 420, scale: 1 } });
	writeFileSync(`${out}/explorer.png`, Buffer.from(r.result.data, 'base64'));
	await show('plotgrid');
	await p.shot(`${out}/plotgrid.png`);
	await show('manuscript');
	await p.shot(`${out}/manuscript.png`);
	// a phone
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(true), 50); return 1; })()`);
	await p.sleep(1500);
	for (let i = 0; i < 80 && !(await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer && app.isMobile)`).catch(() => false)); i++) await p.sleep(250);
	await p.ev(`(async () => { await app.plugins.plugins.binders.binders.settled; app.changeTheme('moonstone'); app.workspace.leftSplit?.collapse?.(); await app.plugins.plugins.binders.openBinder(app.vault.getAbstractFileByPath('The Lighthouse')); ${V}.setMode('corkboard'); })().then(() => 1)`);
	await p.sleep(1500);
	await p.shot(`${out}/mobile.png`);
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(false), 50); return 1; })()`);
	await p.sleep(1500);
	console.log(`Screenshots in ${out}.`);
} finally { await p.close(); }
