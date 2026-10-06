// The manual's and the README's pictures: The Lighthouse in each mode, arranged by label, the file explorer, the
// inspector and the contents, the snapshots of a scene and of the binder, focus mode, the Export window (an ebook, a
// paperback's pages, the style editor), a phone, and the import dialog. 1280×800, with a mouse that hovers, as a
// desktop has. Runs in a throwaway copy of test-vault, like the e2e tests, and fills the book out a little there
// first (storylines as labels, synopses, a third part), so the pictures show what a book in progress looks like.
//   npm run build && node tests/e2e/screenshots.mjs [outdir] [--theme dark] [--only corkboard,outliner]
// The manual's pictures are the light theme's, named for what they show (`corkboard.png`). `--theme dark` makes the
// same pictures in Obsidian's own dark theme, named `corkboard-dark.png`: the README shows those. `--only` keeps
// the ones named and makes the rest without saving them (each scene leaves the vault as the next expects it).
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { launch } from './driver.mjs';

const args = process.argv.slice(2), flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const theme = flag('--theme') === 'dark' ? 'dark' : 'light', only = flag('--only')?.split(',').map((x) => x.trim()) ?? null;
const out = args[0] || 'docs/images', suffix = theme === 'dark' ? '-dark' : '';
mkdirSync(out, { recursive: true });
const p = await launch({ theme, width: 1280, height: 800, hover: true });
const made = [];
/** Keeps the picture, if it is one of those asked for. `clip`: a part of the window. */
const shot = async (name, clip) => {
	if (only && !only.includes(name)) return;
	const r = await p.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
	writeFileSync(`${out}/${name}${suffix}.png`, Buffer.from(r.result.data, 'base64'));
	made.push(name);
};
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
	'The tower stood on the highest part of the rock, and the rock was not high. From the top of the path she could see all of the island at once: the jetty, the two walls, a square of turned earth with a fence round it against the wind, and a shed whose door had been tied shut with rope. Beyond that there was only the sea, which went on in every direction without anything in it.',
	'She set the cases down. The larger one held her clothes and the smaller one held books, and it was the smaller one that had hurt her hand.',
	'"You will find him an exact man," the secretary of the board had said, in the office with the brown linoleum. "He has kept the light for nineteen years and has not once been late with it." He had said it as a recommendation. Mara had thought, then, that it was an odd thing to praise a man for. Now, looking at the lime on the walls and the rope on the shed door, she thought it might be the only thing there was.',
	'The letter was in her coat. She knew what it said. It had come from the board a week before she sailed, and it told her in four lines what her duties were and in eleven what they were not.',
	'A gull came down onto the wall beside her, looked at the cases, and left.',
	'There was a bell beside the door, with a chain. She did not ring it. She stood with her back to the tower instead and watched the place where the boat had been, until she was sure she could no longer tell it from the water.',
];
// (and the scenes either side of it, so a page of the exported book has a chapter's end and the next one's opening)
const MORE = {
	'Prologue': ['From the sea it was the only thing on that coast a pilot trusted. It turned once in every twelve seconds, and the men who fished under it set their watches by the dark between.'],
	'Part One/The keeper': [
		'He was a smaller man than nineteen years of the light had made him in her mind. He wore a jersey gone thin at the elbows, and he held the door with one hand, as a man holds a gate against a dog.',
		'"You\'re the assistant," he said.',
		'"I am."',
		'"They said a man."',
		'"They said a keeper would meet me," Mara said. "So we have both been told things."',
		'He looked past her at the cases, and then at the sea, as though the boat might still be called back. Then he took his hand from the door.',
		'"The lamp is lit at sunset," he said. "Not near it. At it. You\'ll learn the rest, but learn that first."',
	],
};
const FOLDERS = { 'Part One': ['Mara comes to the island and learns the rules of the light.', 'Revised'], 'Part Two': ['The storm, the wreck, and the night the light went out.', 'Draft'], 'Part Three': ['The inquiry, and what the keeper kept.', 'Idea'] };

try {
	await p.ev(`(async () => {
		const pl = ${PL}, at = (path) => app.vault.getAbstractFileByPath(path);
		const pm = (path, fn) => app.fileManager.processFrontMatter(at(path), fn);
		pl.settings.labels = ${j(LABELS.map(([name, color]) => ({ name, color })))};
		pl.settings.authorName = 'E. M. Hale';
		// (the test vault's other binder is a fixture, not a book a writer would have beside this one)
		if (at('Longform demo')) await app.vault.delete(at('Longform demo'), true);
		await pl.saveSettings();
		await app.vault.process(at(${j(L + 'Part One/Arrival.md')}), (t) => t.replace(${j(ARRIVAL[0])}, ${j(ARRIVAL.join('\n\n'))}));
		for (const [name, more] of Object.entries(${j(MORE)})) await app.vault.process(at(${j(L)} + name + '.md'), (t) => t.trimEnd() + '\\n\\n' + more.join('\\n\\n') + '\\n');
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
	await shot('corkboard');
	// the file explorer, close up
	const pane = await p.ev(`(() => { const side = document.querySelector('.workspace-split.mod-left-split').getBoundingClientRect(), rows = [...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self')]; return { width: Math.round(side.right), height: Math.round(Math.max(...rows.map(r => r.getBoundingClientRect().bottom)) + 16) }; })()`);
	await shot('explorer', { x: 0, y: 0, ...pane });

	// the same cards by label: a line for each storyline, every note of the book along them. The sidebar is folded and
	// the cards are small, so the picture holds most of the book.
	await p.ev(`(() => { app.workspace.leftSplit.collapse(); const v = ${V}; v.arrange('label', 'across'); return 1; })()`);
	await until(`!!document.querySelector('.binders-lanes')`, 'the board arranged by label');
	await p.ev(`(() => { ${V}.setOptions({ ...${V}.options, linesFlat: true, cardSize: 'small' }); return 1; })()`);
	await p.sleep(1500);
	await rest();
	await shot('arrange-by-label');
	await p.ev(`(() => { const v = ${V}, { cardSize, linesFlat, ...others } = v.options; v.setOptions(others); v.arrange('grid'); app.workspace.leftSplit.expand(); return 1; })()`);
	await p.sleep(800);

	await show('outliner');
	await rest();
	await shot('outliner');
	await show('manuscript');
	await rest();
	await shot('manuscript');

	// the inspector and the contents beside the manuscript: one over the other in the right sidebar, the file explorer
	// folded away, the cursor in a scene so both say where it is
	await p.ev(`(async () => {
		const ws = app.workspace, inspector = ws.getLeavesOfType('binders-inspector')[0], old = ws.getLeavesOfType('binders-contents')[0];
		ws.leftSplit.collapse();
		ws.rightSplit.expand();
		if (inspector && old) { const under = ws.createLeafBySplit(inspector, 'horizontal'); await under.setViewState({ type: 'binders-contents', active: false }); old.detach(); ws.revealLeaf(inspector); }
	})().then(() => 1)`);
	await p.sleep(1200);
	const line = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.querySelector('.binders-manuscript-title')?.textContent === 'Arrival'); const l = s && [...s.querySelectorAll('.cm-line, p')].find(e => e.textContent.length > 40); const r = l?.getBoundingClientRect(); return r ? { x: r.x + 60, y: r.y + 10 } : null; })()`);
	if (!line) throw new Error('a line of Arrival in the manuscript');
	await p.click(line.x, line.y);
	await p.sleep(900);
	await rest();
	await shot('inspector');
	await p.ev(`(() => { app.workspace.rightSplit.collapse(); app.workspace.leftSplit.expand(); return 1; })()`);
	await p.sleep(600);

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
	await shot('snapshots');
	await p.key('Escape');
	await p.sleep(400);

	// focus mode: the same scene, and nothing else
	await openNote(scene);
	await p.sleep(600);
	await p.ev(`(() => { const e = app.workspace.activeEditor?.editor; if (e) { let n = e.lastLine(); while (n > 0 && !e.getLine(n).trim()) n--; e.focus(); e.setCursor(n, e.getLine(n).length); } return 1; })()`);
	await command('focus');
	await p.sleep(1800);
	await noNotices();
	await rest();
	await p.sleep(300);
	// (a few words typed, as a writer in it would be: the other paragraphs step back while the keys go)
	for (const ch of ' She knocked anyway.') await p.key(ch);
	await p.sleep(700);
	await shot('focus-mode');
	await command('focus');
	await p.sleep(800);

	// the binder's snapshots: one taken, then a morning's changes (a scene rewritten, one moved, one renamed, one
	// begun, a status), and the dialog saying what is different now
	const WIN = '.modal.binders-export';
	await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse')); ${V}.setMode('corkboard'); })().then(() => 1)`);
	await p.sleep(800);
	await command('take-snapshots');
	await p.sleep(1500);
	await p.ev(`(async () => {
		const at = (path) => app.vault.getAbstractFileByPath(path), store = ${PL}.binders;
		await app.vault.process(at(${j(L + 'Part Two/The lamp room.md')}), (t) => t.trimEnd() + '\\n\\nShe held the log to the window. The page before it had been written hard enough to mark the next: a date, and three words she could not make out.\\n');
		await app.fileManager.renameFile(at(${j(L + 'Part Two/Lights out.md')}), ${j(L + 'Part Two/The dark hour.md')});
		await app.fileManager.processFrontMatter(at(${j(L + 'Part One/Storm warning.md')}), (fm) => { fm.status = 'Revised'; });
		await app.vault.create(${j(L + 'Part Three/The log.md')}, '---\\nstatus: Idea\\nlabel: The keeper\\n---\\nThe board asked for the log, and were given it.\\n');
		await new Promise(r => setTimeout(r, 800));
		await store.settled;
	})().then(() => 1)`);
	await p.sleep(800);
	await noNotices();
	await command('show-binder-snapshots');
	await until(`[...document.querySelectorAll('.modal .text-button-label')].some(e => e.textContent === 'Show changes')`, 'the binder’s snapshots dialog');
	const taken = await p.ev(`(() => { const rows = [...document.querySelectorAll('.modal [role="option"]')]; const r = rows[rows.length - 1]?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, n: rows.length } : null; })()`);
	if (!taken || taken.n < 2) throw new Error('the dialog lists the binder and its snapshot: ' + j(taken));
	await p.click(taken.x, taken.y);
	await p.sleep(1200);
	await rest();
	await shot('binder-snapshots');
	await p.key('Escape');
	await p.sleep(400);

	// the Export window: an ebook with its preview; a paperback, with the pages as they will print; the style editor
	const kind = async (id) => { const at = await need(`${WIN} [data-binders-key="kind-${id}"]`, `the kind “${id}”`); await p.click(at.x, at.y); await p.sleep(600); };
	await command('export');
	await until(`!!document.querySelector('${WIN} [data-binders-key="kind-ebook"]')`, 'the Export window');
	await kind('ebook');
	await until(`!!document.querySelector('${WIN} .binders-export-paper.mod-ebook h1, ${WIN} .binders-export-paper.mod-ebook p')`, 'the ebook’s preview');
	await p.ev(`(() => { const h = [...document.querySelectorAll('${WIN} .binders-export-paper.mod-ebook h1, ${WIN} .binders-export-paper.mod-ebook h2')].find(e => /Arrival/.test(e.textContent)); const box = document.querySelector('${WIN} .binders-export-preview'); if (h) { let s = h.parentElement; while (s && s.scrollHeight <= s.clientHeight + 4) s = s.parentElement; (s ?? box).scrollTop += h.getBoundingClientRect().top - (s ?? box).getBoundingClientRect().top - 90; } return 1; })()`);
	await p.sleep(1200);
	await rest();
	await shot('export');
	await kind('paperback');
	await until(`/pages?\\b/.test(document.querySelector('${WIN}')?.innerText ?? '') && !/Laying out/.test(document.querySelector('${WIN}')?.innerText ?? '')`, 'the paperback’s pages', 30000);
	// a chapter's last page and the next chapter's opening, side by side
	const spread = () => p.ev(`(() => { const d = document.querySelector('${WIN} .binders-export-frame')?.contentDocument; const h = d && [...d.querySelectorAll('h1')].find(e => /keeper/i.test(e.textContent)); const page = h?.closest('.page'); if (!page) return 0; const root = d.scrollingElement; root.scrollTop += page.getBoundingClientRect().top - 14; return 1; })()`);
	await p.sleep(1500);
	if (!(await spread())) throw new Error('the page that opens “The keeper”');
	await p.sleep(600);
	await rest();
	await shot('export-paperback');
	const editStyle = await need(`${WIN} [data-binders-key="edit-style"]`, '“Edit this style”');
	await p.click(editStyle.x, editStyle.y);
	await until(`!!document.querySelector('${WIN} .binders-style-editor .input-row')`, 'the style editor');
	await p.sleep(2500);
	// the rows that shape a chapter's opening, beside one
	await p.ev(`(() => { const g = [...document.querySelectorAll('${WIN} .binders-style-editor .input-group-header')].find(e => e.textContent === 'Chapters'); const form = document.querySelector('${WIN} .binders-style-form'); if (g && form) form.scrollTop += g.getBoundingClientRect().top - form.getBoundingClientRect().top - 12; return 1; })()`);
	await spread();
	await p.sleep(800);
	await rest();
	await shot('export-styles');
	await p.key('Escape');
	await p.sleep(400);
	await p.key('Escape');
	await p.sleep(400);

	// a phone
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(true), 50); return 1; })()`);
	await p.sleep(1500);
	await until(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer && app.isMobile)`, 'Obsidian came back as a phone', 20000);
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await p.ev(`(async () => { await ${PL}.binders.settled; app.changeTheme(${j(theme === 'dark' ? 'obsidian' : 'moonstone')}); app.workspace.leftSplit?.collapse?.(); await ${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse')); ${V}.setMode('corkboard'); })().then(() => 1)`);
	await until(`!!document.querySelector('.binders-card[data-path]')`, 'the corkboard on a phone');
	await p.sleep(1500);
	await noNotices();
	await shot('mobile');
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(false), 50); return 1; })()`);
	await p.sleep(1500);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
	await until(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer && !app.isMobile)`, 'Obsidian came back as a computer', 20000);
	await p.ev(`(async () => { await ${PL}.binders.settled; app.changeTheme(${j(theme === 'dark' ? 'obsidian' : 'moonstone')}); })().then(() => 1)`);
	await p.sleep(800);

	// importing from Scrivener: the book as a Scrivener project (Binders' own export of it, zipped into the vault and
	// taken out of it), chosen as a writer chooses a backup, in a vault that doesn't have the book yet
	await p.ev(`(async () => {
		const pl = ${PL};
		pl.exportHost.desktop = () => null;
		await pl.openBinder(app.vault.getAbstractFileByPath('The Lighthouse'));
		app.commands.executeCommandById('binders:export');
	})().then(() => 1)`);
	await until(`!!document.querySelector('${WIN} [data-binders-key="kind-scrivener"]')`, 'the Export window, for the project');
	await kind('scrivener');
	await p.sleep(1500);
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
	const zips = () => { const found = []; const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const at = join(dir, e.name); if (e.isDirectory()) walk(at); else if (e.name.endsWith('.zip')) found.push(at); } }; walk(p.vaultDir); return found; };
	for (let i = 0; i < 100 && !zips().length; i++) await p.sleep(200);
	if (!zips().length) throw new Error('the project, zipped into the vault: ' + await p.ev(`document.querySelector('${WIN}')?.innerText.slice(0, 400)`));
	await p.sleep(1000);
	const backup = resolve('test-dist/screenshots/The Lighthouse.zip');
	mkdirSync(resolve('test-dist/screenshots'), { recursive: true });
	copyFileSync(zips()[0], backup);
	await p.key('Escape');
	await p.sleep(400);
	// (and has none of its labels: a vault the book is new to)
	await p.ev(`(async () => { const pl = ${PL}, f = app.vault.getAbstractFileByPath('The Lighthouse'); app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); await app.vault.delete(f, true); pl.settings.labels = []; await pl.saveSettings(); await new Promise(r => setTimeout(r, 800)); })().then(() => 1)`);
	await noNotices();
	const IMP = '.modal.binders-import';
	await p.ev(`(() => { ${PL}.importHost.desktop = () => null; app.commands.executeCommandById('binders:import-scrivener'); return 1; })()`);
	await until(`[...document.querySelectorAll('.modal button')].some(b => b.textContent === 'Choose a zipped backup...')`, 'the import dialog');
	await p.send('Page.setInterceptFileChooserDialog', { enabled: true });
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Choose a zipped backup...').click(); return 1; })()`);
	const doc = await p.send('DOM.getDocument');
	const input = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '.modal input[type="file"]' });
	await p.send('DOM.setFileInputFiles', { nodeId: input.result.nodeId, files: [backup] });
	await p.send('Page.setInterceptFileChooserDialog', { enabled: false });
	await until(`!!document.querySelector('.modal [data-binders-key="name"]')`, 'the binder as it will be', 20000);
	await p.sleep(1200);
	// a scene of it, as it will read
	await p.ev(`(() => { [...document.querySelectorAll('.modal [role="treeitem"][aria-selected]')].find(r => r.querySelector('.tree-item-inner').textContent === 'Arrival')?.click(); return 1; })()`);
	await p.sleep(1000);
	await rest();
	await shot('import');
	await p.key('Escape');
	await p.sleep(300);
	console.log(`Pictures in ${out}${suffix ? `, named “…${suffix}.png”` : ''}: ${made.join(', ')}.`);
} finally { await p.close(); }
