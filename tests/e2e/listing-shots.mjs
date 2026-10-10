// The pictures for Binders' listing in Obsidian's community directory (`screenshots/`): five of a computer
// (1440×900, two pixels to the point) and five of a phone (390×844, three to the point), in Obsidian's own dark theme.
// The book is The Lighthouse, filled out to a novel half written: three parts, twenty scenes, storylines as labels,
// statuses, targets, and enough words in each scene for the counts to be a book's. The opening and the end of the
// scenes a picture reads from are written by hand; what is between them is the demo vault's prose.
//   npm run build && npm run install-vault && node tests/e2e/listing-shots.mjs [outdir] [--only desktop-1-corkboard,…]
// Runs in a throwaway copy of test-vault, like the e2e tests. Look at each picture after remaking them.
import { mkdirSync, writeFileSync } from 'fs';
import { launch } from './driver.mjs';
import { rng } from '../../scripts/demo-vault/core.mjs';
import { text, writer } from '../../scripts/demo-vault/prose.mjs';
import { EN } from '../../scripts/demo-vault/stock/en.mjs';

const args = process.argv.slice(2), flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const only = flag('--only')?.split(',').map((x) => x.trim()) ?? null;
const out = args[0] || 'screenshots';
mkdirSync(out, { recursive: true });
const DESK = { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, PHONE = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
const j = JSON.stringify;
const PL = `app.plugins.plugins.binders`;
const V = `app.workspace.getLeavesOfType('binders-view')[0].view`;
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const L = 'The Lighthouse/';

// ---- the book ----
const LABELS = [['Mara', 'blue'], ['The keeper', 'orange'], ['The island', 'green'], ['The wreck', 'red']];
const world = { person: 3, cast: ['Mara:she', 'Harrow:he'], places: ['on the jetty', 'in the lamp room', 'at the foot of the stair', 'in the kitchen under the tower'], things: ['the log', 'the lamp', 'a coil of rope', 'the brass key'] };
const filler = (seed, words) => text(writer(EN, world, rng('lighthouse ' + seed)).scene({ pov: 'Mara', others: ['Harrow'], words })).split('\n\n').slice(1).join('\n\n').replace(/"(?=\S)/g, '“').replace(/"/g, '”').replace(/'/g, '’');
const ARRIVAL = [
	'The supply boat left Mara on the jetty with two cases and a letter she had not opened.',
	'It did not wait. By the time she had the cases up the steps the boat was a mark on the water, and the sound of its engine came back to her off the rocks a little after the boat itself had gone quiet. She stood and listened to that, because there was nothing else on the island to listen to yet.',
	'The path went up between two walls of piled stone. Someone had limed them once. Thrift grew out of the gaps now, and the wind had laid it all one way, towards the tower.',
	'She had been told a man would meet her. Halfway up she stopped expecting him, and by the top she had decided she would rather he did not.',
	'The tower stood on the highest part of the rock, and the rock was not high. From the top of the path she could see all of the island at once: the jetty, the two walls, a square of turned earth with a fence round it against the wind, and a shed whose door had been tied shut with rope.',
	'She set the cases down. The larger one held her clothes and the smaller one held books, and it was the smaller one that had hurt her hand.',
	'Nothing moved on the rock but the grass. There was a window halfway up the tower, small and deep, and she watched it for as long as it took to be certain that nobody was watching her from it.',
	'“You will find him an exact man,” the secretary of the board had said, in the office with the brown linoleum. “He has kept the light for nineteen years and has not once been late with it.” He had said it as a recommendation. Mara had thought, then, that it was a warning, and had liked the board a little better for giving it.',
	'She had not asked what had become of the last assistant. It had seemed, in that office, an impolite question. It seemed a sensible one now.',
	'The door of the tower was painted green, and the paint was new. That surprised her more than the silence had. A man who would not walk down to the jetty had gone to the trouble, some time this summer, of a second coat.',
];
const ARRIVAL_END = [
	'The letter was in her coat. She knew what it said. It had come from the board a week before she sailed, and it told her in four lines what her duties were and in eleven what they were not.',
	'A gull came down onto the wall beside her, looked at the cases, and left.',
	'There was a bell beside the door, with a chain. She did not ring it. She stood with her back to the tower instead and watched the place where the boat had been, until she was sure she could no longer tell it from the water.',
];
const KEEPER = [
	'He was a smaller man than nineteen years of the light had made him in her mind. He wore a jersey gone thin at the elbows, and he held the door with one hand, as a man holds a gate against a dog.',
	'“You’re the assistant,” he said.',
	'“I am.”',
	'“They said a man.”',
	'“They said a keeper would meet me,” Mara said. “So we have both been told things.”',
	'He looked past her at the cases, and then at the sea, as though the boat might still be called back. Then he took his hand from the door.',
	'“The lamp is lit at sunset,” he said. “Not near it. At it. You’ll learn the rest, but learn that first.”',
];
// name, label, status, words, target, synopsis, the opening
const BOOK = [
	['Prologue', 'The island', 'Done', 640, 0, 'The light, seen from the sea, the winter before.', ['From the sea it was the only thing on that coast a pilot trusted. It turned once in every twelve seconds, and the men who fished under it set their watches by the dark between.']],
	['Part One/', 'Revised', 'Mara comes to the island and learns the rules of the light.'],
	['Part One/Arrival', 'Mara', 'Revised', 2140, 2000, 'The supply boat leaves Mara on the jetty. Nobody comes down to meet her.', ARRIVAL, ARRIVAL_END],
	['Part One/The keeper', 'The keeper', 'Revised', 1870, 2000, 'Harrow at the door: nineteen years of the light, and no wish for an assistant.', KEEPER],
	['Part One/The rules of the light', 'The keeper', 'Revised', 2460, 2500, 'Lit at sunset, not near it. The log, the oil, the stair he will not let her climb.', ['There were eleven rules, and he gave them to her in the order he had learned them.']],
	['Part One/A letter unopened', 'Mara', 'Draft', 1580, 2000, 'What the board wrote, and why Mara has carried it a week without reading it.', ['She put the letter on the shelf above the bed, where she would see it, and did not see it for three days.']],
	['Part One/Storm warning', 'The island', 'Draft', 1320, 2500, 'The glass falls all afternoon. The birds leave the rock before the wind comes.', ['The glass had been falling since noon, and by four the birds had gone.']],
	['Part One/The supply boat', 'The island', 'Draft', 940, 1500, 'The Thursday boat turns back at the bar. No post, no oil, no way off.', ['The boat came as far as the bar and stood there, and then it turned.']],
	['Part Two/', 'Draft', 'The storm, the wreck, and the night the light went out.'],
	['Part Two/The glass falls', 'The island', 'Draft', 1760, 2000, 'The first night of the gale. Harrow sleeps in his boots.', ['He slept in his boots that night, in the chair at the foot of the stair.']],
	['Part Two/The wreck', 'The wreck', 'Draft', 2890, 3000, 'A coaster on the Skerry at two in the morning, burning a flare nobody answers.', ['The flare went up at ten past two, red, and hung over the Skerry longer than it should have.']],
	['Part Two/The lamp room', 'Mara', 'Draft', 1410, 2000, 'Mara climbs to the lamp and finds the log with a page cut out.', ['The stair wound up through the smell of oil and cold iron. At the top the lamp stood dark, and the log lay open beside it.']],
	['Part Two/Lights out', 'The keeper', 'Draft', 2230, 2500, 'Eleven minutes of dark. What Harrow was doing, and what he says he was doing.', ['For eleven minutes there was no light on that coast at all.']],
	['Part Two/Seven men ashore', 'The wreck', 'Draft', 1150, 2500, 'The crew come in over the rocks at first light. One of them has kept count.', ['They came in over the rocks at first light, seven of them, roped together.']],
	['Part Two/What the mate saw', 'The wreck', 'Draft', 1640, 2000, 'The mate swears the light was dark when they struck. The master will not say.', ['The mate had been on deck, and the mate was sure.']],
	['Part Two/The cut page', 'The keeper', 'Idea', 380, 2000, 'Harrow finds Mara with the log. He does not ask what she has read.', ['He did not ask her what she had read. He asked her to put it back.']],
	['Part Two/The dark hour', 'Mara', 'Idea', 0, 2000, 'Mara writes the night down while she still has it right.', []],
	['Part Three/', 'Idea', 'The inquiry, and what the keeper kept.'],
	['Part Three/The inquiry', 'The wreck', 'Idea', 420, 3000, 'Two men from the board come out on the supply boat with questions.', ['They came on the Thursday boat, in town coats, and would not sit down.']],
	['Part Three/What the keeper kept', 'The keeper', 'Idea', 0, 2500, 'The missing page, and why he cut it out.', []],
	['Part Three/The relief', 'Mara', 'Idea', 0, 2000, 'A new keeper is rowed out. Mara decides whether to leave with the boat.', []],
	['Epilogue', 'Mara', 'Idea', 0, 800, 'Years later, the light is automatic and the house is a museum.', []],
];
const count = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
const notes = BOOK.filter((b) => !b[0].endsWith('/')).map(([name, label, status, words, target, synopsis, open, close = []]) => {
	const had = count(open.join(' ')) + count(close.join(' '));
	const body = [...open, ...(words > had + 60 ? [filler(name, words - had)] : []), ...close].join('\n\n');
	return { path: L + name + '.md', text: `---\nstatus: ${status}\nlabel: ${label}\nsynopsis: ${j(synopsis)}\n${target ? `target: ${target}\n` : ''}---\n${body}${body ? '\n' : ''}` };
});
const folders = BOOK.filter((b) => b[0].endsWith('/')).map(([name, status, synopsis]) => ({ name: name.slice(0, -1), status, synopsis }));
const contents = BOOK.map((b) => b[0]);

// ---- the pictures ----
const p = await launch({ theme: 'dark', width: DESK.width, height: DESK.height, hover: true });
const made = [];
const shot = async (name) => {
	if (only && !only.includes(name)) return;
	const r = await p.send('Page.captureScreenshot', { format: 'png' });
	writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64'));
	made.push(name);
};
const until = async (expr, what, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await p.ev(expr).catch(() => false)) return; await p.sleep(100); } throw new Error(`never happened: ${what}`); };
const need = async (sel, what) => { const at = await p.at(sel); if (!at) throw new Error(`${what} isn't on the page (${sel})`); return at; };
const command = (id) => p.ev(`app.commands.executeCommandById(${j('binders:' + id)})`);
const noNotices = () => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
/** The throwaway vault is named "vault"; the pictures show a writer's. Obsidian's status bar is empty but for a mark
    that says there is no sync, which says nothing about Binders. */
const dress = () => p.ev(`(() => { for (const e of document.querySelectorAll('.workspace-drawer *, .workspace-sidedock-vault-profile *')) if (!e.children.length && e.textContent.trim() === 'vault') e.textContent = 'Writing'; document.querySelector('.status-bar')?.hide(); return 1; })()`);
const rest = () => p.move(DESK.width - 300, 22, 2); // the pointer out of the way, over nothing that would light up
const show = async (mode) => { await p.ev(`(() => { ${V}.setMode(${j(mode)}); return 1; })()`); await p.sleep(1500); };
const open = (folder = 'The Lighthouse') => p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${j(folder)}); const leaf = app.workspace.getLeavesOfType('binders-view')[0]; if (leaf) await leaf.view.navigate(f); else await ${PL}.openBinder(f); })().then(() => 1)`);
const unfold = () => p.ev(`(() => { for (const f of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'The Lighthouse/Part Three']) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`);

try {
	await p.send('Emulation.setDeviceMetricsOverride', DESK);
	await p.ev(`(async () => {
		const pl = ${PL}, at = (path) => app.vault.getAbstractFileByPath(path);
		pl.settings.labels = ${j(LABELS.map(([name, color]) => ({ name, color })))};
		pl.settings.authorName = 'E. M. Hale';
		pl.settings.outlinerColumns = [{ id: 'label' }, { id: 'status' }, { id: 'words' }, { id: 'target' }, { id: 'progress' }];
		for (const other of ['Longform demo']) if (at(other)) await app.vault.delete(at(other), true);
		await pl.saveSettings();
		for (const f of ${j(folders)}) {
			if (!at(${j(L)} + f.name)) await app.vault.createFolder(${j(L)} + f.name);
			const note = ${j(L)} + f.name + '/' + f.name + '.md', text = '---\\nsynopsis: ' + f.synopsis + '\\nstatus: ' + f.status + '\\n---\\n';
			if (at(note)) await app.fileManager.processFrontMatter(at(note), (fm) => { fm.synopsis = f.synopsis; fm.status = f.status; }); else await app.vault.create(note, text);
		}
		for (const n of ${j(notes)}) { if (at(n.path)) await app.vault.modify(at(n.path), n.text); else await app.vault.create(n.path, n.text); }
		await app.fileManager.processFrontMatter(at(${j(L + 'The Lighthouse.md')}), (fm) => {
			fm.synopsis = 'A keeper, a newcomer, and the night the light went out.'; fm.target = 80000; fm.contents = ${j(contents)};
		});
		await new Promise(r => setTimeout(r, 800));
		await pl.binders.settled;
	})().then(() => 1)`);
	await p.sleep(800);

	// 1. the corkboard: Part Two's scenes as cards, the whole book in binder order in the file explorer beside it
	await p.ev(`(async () => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); await ${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse')); })().then(() => 1)`);
	await until(`!!document.querySelector('.binders-card[data-path]')`, 'the corkboard drew its cards');
	await open(L + 'Part Two');
	await unfold();
	await until(`!!document.querySelector('.binders-card[data-path=${j(L + 'Part Two/The wreck.md')}]')`, 'Part Two’s board');
	await p.sleep(1200);
	await noNotices();
	await p.ev(`(() => { const v = ${V}; v.setOptions({ ...v.options, cardSize: 'large' }); v.current.applyCardSize(); return 1; })()`);
	await p.sleep(1000);
	const card = await need(`.binders-card[data-path=${j(L + 'Part Two/The wreck.md')}] .binders-card-footer`, 'The wreck’s card');
	await p.click(card.x, card.y);
	await rest();
	await dress();
	await p.sleep(500);
	await shot('desktop-1-corkboard');

	await p.ev(`(() => { const v = ${V}, { cardSize, ...others } = v.options; v.setOptions(others); return 1; })()`);
	// 2. the outliner: the whole book, with its columns
	await open();
	await show('outliner');
	await rest();
	await dress();
	await shot('desktop-2-outliner');

	// 3. the manuscript, the inspector and the contents beside it, the cursor in a scene so both say where it is
	await show('manuscript');
	await p.ev(`(async () => {
		const ws = app.workspace, inspector = ws.getLeavesOfType('binders-inspector')[0], old = ws.getLeavesOfType('binders-contents')[0];
		ws.leftSplit.collapse();
		ws.rightSplit.expand();
		if (inspector && old) { const under = ws.createLeafBySplit(inspector, 'horizontal'); await under.setViewState({ type: 'binders-contents', active: false }); old.detach(); ws.revealLeaf(inspector); }
	})().then(() => 1)`);
	await p.sleep(1500);
	const toArrival = `(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.querySelector('.binders-manuscript-title')?.textContent === 'Arrival'); const head = s?.previousElementSibling?.matches?.('.binders-manuscript-heading') ? s.previousElementSibling : s; head?.scrollIntoView({ block: 'start' }); return s ? 1 : 0; })()`;
	for (let i = 0; i < 4; i++) { await p.ev(toArrival); await p.sleep(700); }
	const line = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.querySelector('.binders-manuscript-title')?.textContent === 'Arrival'); const l = s && [...s.querySelectorAll('.cm-line, p')].filter(e => e.textContent.length > 40)[1]; const r = l?.getBoundingClientRect(); return r ? { x: Math.round(r.left + 220), y: Math.round(r.top + 12) } : null; })()`);
	if (!line) throw new Error('a line of Arrival in the manuscript');
	await p.click(line.x, line.y);
	await p.sleep(1200);
	await rest();
	await dress();
	await shot('desktop-3-manuscript');
	await p.ev(`(() => { app.workspace.rightSplit.collapse(); return 1; })()`);
	await p.sleep(600);

	// 4. the same book by storyline: a line for each label, every scene along them
	await show('corkboard');
	await p.ev(`(() => { ${V}.arrange('label', 'across'); return 1; })()`);
	await until(`!!document.querySelector('.binders-lanes')`, 'the board arranged by label');
	await p.ev(`(() => { ${V}.setOptions({ ...${V}.options, linesFlat: true }); return 1; })()`);
	await p.sleep(1500);
	// (from where Part Two begins: the stretch of the book where every storyline has a scene)
	await p.ev(`(() => { const h = [...document.querySelectorAll('.binders-lanes *')].filter(e => e.textContent.trim() === 'Part Two').pop(); let s = h?.parentElement; while (s && !(/auto|scroll/.test(getComputedStyle(s).overflowX) && s.scrollWidth > s.clientWidth + 4)) s = s.parentElement; if (h && s) s.scrollLeft += h.getBoundingClientRect().left - s.getBoundingClientRect().left - 260; return [!!h, s?.className, s?.scrollLeft].join(' | '); })()`).then((r) => console.log('lanes:', r));
	await p.sleep(800);
	await rest();
	await dress();
	await shot('desktop-4-storylines');
	await p.ev(`(() => { const v = ${V}, { linesFlat, ...others } = v.options; v.setOptions(others); v.arrange('grid'); return 1; })()`);
	await p.sleep(800);

	// 5. export: a paperback, a chapter's last page and the next one's opening as they will print
	const WIN = '.modal.binders-export';
	await command('export');
	await until(`!!document.querySelector('${WIN} [data-binders-key="kind-paperback"]')`, 'the Export window');
	const kind = await need(`${WIN} [data-binders-key="kind-paperback"]`, 'the paperback');
	await p.click(kind.x, kind.y);
	await until(`/pages?\\b/.test(document.querySelector('${WIN}')?.innerText ?? '') && !/Laying out/.test(document.querySelector('${WIN}')?.innerText ?? '')`, 'the paperback’s pages', 60000);
	await p.sleep(1500);
	const spread = await p.ev(`(() => { const d = document.querySelector('${WIN} .binders-export-frame')?.contentDocument; const h = d && [...d.querySelectorAll('h1')].find(e => /keeper/i.test(e.textContent)); const page = h?.closest('.page'); if (!page) return 0; const root = d.scrollingElement; root.scrollTop += page.getBoundingClientRect().top - 24; return 1; })()`);
	if (!spread) throw new Error('the page that opens “The keeper”');
	await p.sleep(1000);
	await rest();
	await shot('desktop-5-export');
	await p.key('Escape');
	await p.sleep(500);

	// ---- a phone ----
	await p.send('Emulation.setDeviceMetricsOverride', PHONE);
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(true), 50); return 1; })()`);
	await p.sleep(1500);
	await until(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer && app.isMobile)`, 'Obsidian came back as a phone', 20000);
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await p.ev(`(async () => { await ${PL}.binders.settled; app.changeTheme('obsidian'); app.workspace.leftSplit?.collapse?.(); app.workspace.rightSplit?.collapse?.(); await ${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse')); ${V}.setMode('corkboard'); })().then(() => 1)`);
	await until(`!!document.querySelector('.binders-card[data-path]')`, 'the corkboard on a phone');

	// 1. the corkboard: Part One's scenes
	await open(L + 'Part One');
	await until(`!!document.querySelector('.binders-card[data-path=${j(L + 'Part One/Arrival.md')}]')`, 'Part One’s board on a phone');
	await p.sleep(1500);
	await noNotices();
	await shot('mobile-1-corkboard');

	// 2. the outliner: the whole book
	await open();
	await show('outliner');
	await noNotices();
	await shot('mobile-2-outliner');

	// 3. the manuscript: the book as one page, a scene being written
	await show('manuscript');
	for (let i = 0; i < 4; i++) { await p.ev(toArrival); await p.sleep(700); }
	await noNotices();
	await shot('mobile-3-manuscript');

	// 4. export: the book as an ebook, as it will read
	await show('corkboard');
	await command('export');
	await until(`!!document.querySelector('.modal.binders-export [data-binders-key="kind-ebook"]')`, 'the Export window on a phone');
	await p.ev(`(() => { document.querySelector('.modal.binders-export [data-binders-key="kind-ebook"]').click(); return 1; })()`);
	await p.sleep(3000);
	await noNotices();
	await shot('mobile-4-export');
	await p.ev(`(() => { app.workspace.activeLeaf; document.querySelector('.modal.binders-export .modal-close-button')?.click(); return 1; })()`);
	await p.key('Escape');
	await p.sleep(800);

	// 5. the file explorer: the book in the order it reads
	await p.ev(`(() => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); return 1; })()`);
	await p.sleep(1200);
	await unfold();
	await p.sleep(800);
	await dress();
	await shot('mobile-5-explorer');
	console.log(`Pictures in ${out}: ${made.join(', ')}.`);
} finally { await p.close(); }
