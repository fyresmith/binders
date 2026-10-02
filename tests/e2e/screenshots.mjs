// The README's pictures: The Lighthouse in each mode, arranged by label, the file explorer, the snapshots of a scene,
// focus mode, and a phone. 1280×800 in the light theme, with a mouse that hovers, as a desktop has. Runs in a
// throwaway copy of test-vault, like the e2e tests, and fills the book out a little there first (storylines as labels,
// synopses, a third part), so the pictures show what a book in progress looks like.
//   npm run build && node tests/e2e/screenshots.mjs [outdir]        (default docs/images)
import { mkdirSync, writeFileSync } from 'fs';
import { launch } from './driver.mjs';

const out = process.argv[2] || 'docs/images';
mkdirSync(out, { recursive: true });
const p = await launch({ theme: 'light', width: 1280, height: 800, hover: true });
const j = JSON.stringify;
const PL = `app.plugins.plugins.binders`;
const V = `app.workspace.getLeavesOfType('binders-view')[0].view`;
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const L = 'The Lighthouse/';
const until = async (expr, what, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await p.ev(expr).catch(() => false)) return; await p.sleep(100); } throw new Error(`never happened: ${what}`); };
const need = async (sel, what) => { const at = await p.at(sel); if (!at) throw new Error(`${what} isn't on the page (${sel})`); return at; };
const command = (id) => p.ev(`app.commands.executeCommandById(${j('binders:' + id)})`);
const openNote = (path) => p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(path)})).then(() => 1)`);
const noNotices = () => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);

// The book as the pictures show it. A label is a storyline here, each with its color in the plugin's settings.
const LABELS = [['Mara', 'blue'], ['The keeper', 'orange'], ['The island', 'green'], ['The wreck', 'red']];
const SCENES = {
	'Prologue': { label: 'The island', status: 'Done', synopsis: 'The light, seen from the sea, the winter before.' },
	'Part One/Arrival': { label: 'Mara', status: 'Revised' },
	'Part One/The keeper': { label: 'The keeper', status: 'Revised' },
	'Part One/Storm warning': { label: 'The island', status: 'Draft', target: 1200 },
	'Part Two/The wreck': { label: 'The wreck', status: 'Draft', target: 1500 },
	'Part Two/Lights out': { label: 'The keeper', status: 'Draft' },
	'Epilogue': { label: 'Mara', status: 'Idea' },
};
const NEW = [
	['Part Two/The lamp room', 'Mara', 'Draft', 'Mara climbs to the lamp and finds the log with a page cut out.', 'The stair wound up through the smell of oil and cold iron. At the top the lamp stood dark, and the log lay open beside it.\n\nA page had been cut from it, cleanly, close to the spine.\n'],
	['Part Three/The inquiry', 'The wreck', 'Idea', 'Two men from the board come out on the supply boat with questions.', 'They came on the Thursday boat, in town coats, and would not sit down.\n'],
	['Part Three/What the keeper kept', 'The keeper', 'Idea', 'The missing page, and why he cut it out.', ''],
	['Part Three/The relief', 'Mara', 'Idea', 'A new keeper is rowed out. Mara decides whether to leave with the boat.', ''],
];
// (the scene the snapshots and focus mode show: long enough to look like a page of a book)
const ARRIVAL = [
	'The supply boat left Mara on the jetty with two cases and a letter she had not opened.',
	'It did not wait. By the time she had the cases up the steps the boat was a mark on the water, and the sound of its engine came back to her off the rocks a little after the boat itself had gone quiet. She stood and listened to that, because there was nothing else on the island to listen to yet.',
	'The path went up between two walls of piled stone. Someone had limed them once. Thrift grew out of the gaps now, and the wind had laid it all one way, towards the tower.',
	'She had been told a man would meet her. Halfway up she stopped expecting him, and by the top she had decided she would rather he did not.',
];
const FOLDERS = { 'Part One': ['Mara comes to the island and learns the rules of the light.', 'Revised'], 'Part Two': ['The storm, the wreck, and the night the light went out.', 'Draft'], 'Part Three': ['The inquiry, and what the keeper kept.', 'Idea'] };

try {
	await p.ev(`(async () => {
		const pl = ${PL}, at = (path) => app.vault.getAbstractFileByPath(path);
		const pm = (path, fn) => app.fileManager.processFrontMatter(at(path), fn);
		pl.settings.labels = ${j(LABELS.map(([name, color]) => ({ name, color })))};
		await pl.saveSettings();
		await app.vault.process(at(${j(L + 'Part One/Arrival.md')}), (t) => t.replace(${j(ARRIVAL[0])}, ${j(ARRIVAL.join('\n\n'))}));
		for (const [name, set] of Object.entries(${j(SCENES)})) await pm(${j(L)} + name + '.md', (fm) => { Object.assign(fm, set); });
		await app.vault.createFolder(${j(L)} + 'Part Three');
		for (const [name, label, status, synopsis, text] of ${j(NEW)}) await app.vault.create(${j(L)} + name + '.md', '---\\nstatus: ' + status + '\\nlabel: ' + label + '\\nsynopsis: ' + synopsis + '\\n---\\n' + text);
		for (const [name, [synopsis, status]] of Object.entries(${j(FOLDERS)})) {
			const note = ${j(L)} + name + '/' + name + '.md';
			if (at(note)) await pm(note, (fm) => { fm.synopsis = synopsis; fm.status = status; });
			else await app.vault.create(note, '---\\nsynopsis: ' + synopsis + '\\nstatus: ' + status + '\\n---\\n');
		}
		await pm(${j(L + 'The Lighthouse.md')}, (fm) => {
			fm.synopsis = 'A keeper, a newcomer, and the night the light went out.'; fm.target = 60000;
			// the order a writer would have put them in: the new scenes after the old, the epilogue last
			const c = fm.contents.filter((x) => x !== 'Epilogue');
			c.splice(c.indexOf('Part Two/Lights out'), 0, 'Part Two/The lamp room');
			fm.contents = [...c, 'Part Three/', 'Part Three/The inquiry', 'Part Three/What the keeper kept', 'Part Three/The relief', 'Epilogue'];
		});
		await new Promise(r => setTimeout(r, 600));
		await pl.binders.settled;
	})().then(() => 1)`);
	await p.sleep(600);
	const show = async (mode) => { await p.ev(`(() => { ${V}.setMode(${j(mode)}); return 1; })()`); await p.sleep(1500); };
	const rest = () => p.move(1000, 20, 2); // the pointer out of the way, over nothing that would light up

	// the explorer open beside the binder, in binder order
	await p.ev(`(async () => {
		app.workspace.leftSplit.expand();
		app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]);
		await ${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse'));
		for (const f of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two']) ${EXP}.fileItems[f]?.setCollapsed(false);
	})().then(() => 1)`);
	await until(`!!document.querySelector('.binders-card[data-path]')`, 'the corkboard drew its cards');
	await p.sleep(1200);
	await noNotices();

	// the corkboard: the book's own board, a folder a card that says what's in it; one card selected, as by a click
	const card = await need(`.binders-card[data-path=${j(L + 'Prologue.md')}] .binders-card-footer`, 'the Prologue card');
	await p.click(card.x, card.y);
	await rest();
	await p.sleep(500);
	await p.shot(`${out}/corkboard.png`);
	// the file explorer, close up
	const pane = await p.ev(`(() => { const side = document.querySelector('.workspace-split.mod-left-split').getBoundingClientRect(), rows = [...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self')]; return { width: Math.round(side.right), height: Math.round(Math.max(...rows.map(r => r.getBoundingClientRect().bottom)) + 16) }; })()`);
	const r = await p.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, ...pane, scale: 1 } });
	writeFileSync(`${out}/explorer.png`, Buffer.from(r.result.data, 'base64'));

	// the same cards by label: a line for each storyline, every note of the book along them. The sidebar is folded and
	// the cards are small, so the picture holds most of the book.
	await p.ev(`(() => { app.workspace.leftSplit.collapse(); const v = ${V}; v.arrange('label', 'across'); return 1; })()`);
	await until(`!!document.querySelector('.binders-lanes')`, 'the board arranged by label');
	await p.ev(`(() => { ${V}.setOptions({ ...${V}.options, linesFlat: true, cardSize: 'small' }); return 1; })()`);
	await p.sleep(1500);
	await rest();
	await p.shot(`${out}/arrange-by-label.png`);
	await p.ev(`(() => { const v = ${V}, { cardSize, linesFlat, ...others } = v.options; v.setOptions(others); v.arrange('grid'); app.workspace.leftSplit.expand(); return 1; })()`);
	await p.sleep(800);

	await show('outliner');
	await rest();
	await p.shot(`${out}/outliner.png`);
	await show('manuscript');
	await rest();
	await p.shot(`${out}/manuscript.png`);

	// a scene's snapshots: two taken as it was written, the older one chosen and compared with the note as it is now
	const scene = L + 'Part One/Arrival.md';
	await openNote(scene);
	await p.sleep(800);
	const edit = (fn) => p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(scene)}), ${fn}).then(() => 1)`);
	await command('take-snapshot');
	await p.sleep(1200);
	await edit(`(t) => t.replace('two cases and a letter she had not opened', 'one case and a letter she had read twice').replace('It did not wait. ', '')`);
	await p.sleep(1200);
	await command('take-snapshot');
	await p.sleep(1200);
	await edit(`(t) => t.replace('She had been told a man would meet her.', 'She had been told the keeper would meet her.').trimEnd() + '\\n\\nNobody had come down. The light stood over her, white against a white sky, and its door was shut.\\n'`);
	await p.sleep(800);
	await noNotices();
	await command('show-snapshots');
	await until(`[...document.querySelectorAll('.modal .text-button-label')].some(e => e.textContent === 'Show changes')`, 'the snapshots dialog');
	// the older of the two, and what has changed since
	const older = await p.ev(`(() => { const rows = [...document.querySelectorAll('.modal [role="option"]')]; const r = rows[rows.length - 1]?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, n: rows.length } : null; })()`);
	if (!older || older.n < 3) throw new Error('the dialog lists the note and its two snapshots: ' + j(older));
	await p.click(older.x, older.y);
	await p.sleep(500);
	const changes = await p.ev(`(() => { const b = [...document.querySelectorAll('.modal .text-button-label')].find(e => e.textContent === 'Show changes'); const r = b?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
	if (!changes) throw new Error('the dialog has a “Show changes” button');
	await p.click(changes.x, changes.y);
	await p.sleep(800);
	await rest();
	await p.shot(`${out}/snapshots.png`);
	await p.key('Escape');
	await p.sleep(400);

	// focus mode: the same scene, and nothing else
	await openNote(scene);
	await p.sleep(600);
	await p.ev(`(() => { const e = app.workspace.activeEditor?.editor; if (e) { e.focus(); e.setCursor(e.lastLine() - 2, e.getLine(e.lastLine() - 2).length); } return 1; })()`);
	await command('focus');
	await p.sleep(1800);
	await noNotices();
	await rest();
	await p.shot(`${out}/focus-mode.png`);
	await command('focus');
	await p.sleep(800);

	// a phone
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(true), 50); return 1; })()`);
	await p.sleep(1500);
	await until(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer && app.isMobile)`, 'Obsidian came back as a phone', 20000);
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await p.ev(`(async () => { await ${PL}.binders.settled; app.changeTheme('moonstone'); app.workspace.leftSplit?.collapse?.(); await ${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse')); ${V}.setMode('corkboard'); })().then(() => 1)`);
	await until(`!!document.querySelector('.binders-card[data-path]')`, 'the corkboard on a phone');
	await p.sleep(1500);
	await noNotices();
	await p.shot(`${out}/mobile.png`);
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(false), 50); return 1; })()`);
	await p.sleep(1500);
	console.log(`Pictures in ${out}: corkboard, explorer, arrange-by-label, outliner, manuscript, snapshots, focus-mode, mobile.`);
} finally { await p.close(); }
