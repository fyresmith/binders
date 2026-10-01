// Performance on a big binder: 1,000 scenes in 10 parts, made in the throwaway vault copy. Measures opening each mode,
// expanding it in the file explorer, a reorder and its write, and typing in the manuscript, and fails only past generous
// limits (a guard against slowdowns, not a benchmark). The numbers are printed, for docs and reports.
// The corkboard shows one folder at a time: the binder's board is ten stacks, a part's a hundred cards; a second, flat
// binder of 1,000 notes keeps the guard on a board of a thousand cards.
import { B, PL, VIEW, j, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'perf: ' + name, fn });

const SAGA = 'Saga', PARTS = 10, PER = 100;
const HEAP = 'Heap', HEAP_NOTES = 1000;
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
/** Limits in ms: several times what a desktop takes, so a slow test machine passes and a real slowdown doesn't. */
const LIMIT = { open: 1500, interaction: 250, write: 3000, keystroke: 120 };

/** Makes the big binder: scenes with properties and a few hundred words each, then its binder note. */
export async function makeSaga(p) {
	await p.ev(`(async () => {
		const words = 'the keeper climbed the stair again while the sea kept on at the rocks below and nobody came '.repeat(25);
		const lines = ['Mara', 'Ines', 'The light'], statuses = ['draft', 'revised', 'done'], labels = ['red', 'blue', 'green', ''];
		await app.vault.createFolder(${j(SAGA)});
		const contents = [];
		for (let a = 1; a <= ${PARTS}; a++) {
			const part = 'Part ' + String(a).padStart(2, '0');
			await app.vault.createFolder(${j(SAGA)} + '/' + part);
			contents.push(part + '/');
			for (let i = 1; i <= ${PER}; i++) {
				const n = (a - 1) * ${PER} + i, name = 'Scene ' + String(n).padStart(4, '0');
				const fm = ['synopsis: Scene ' + n + ', in which something happens on the island and the light goes out again.', 'status: ' + statuses[n % 3], labels[n % 4] ? 'label: ' + labels[n % 4] : '', 'plotlines:', '  - ' + lines[n % 3]].filter(Boolean).join('\\n');
				await app.vault.create(${j(SAGA)} + '/' + part + '/' + name + '.md', '---\\n' + fm + '\\n---\\n' + words + '\\n');
				contents.push(part + '/' + name);
			}
		}
		await app.vault.create(${j(SAGA + '/' + SAGA + '.md')}, '---\\nbinder: 1\\nplotlines:\\n  - Mara\\n  - Ines\\n  - The light\\ncontents:\\n' + contents.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	t0ok(await until(p, `${B}.scenes(app.vault.getAbstractFileByPath(${j(SAGA)}) ?? app.vault.getRoot())?.length === ${PARTS * PER} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`, 60000), 'the big binder is made');
}
const t0ok = (c, m) => { if (!c) throw new Error(m); };

/** Runs `expr` (a promise) in the page and returns how long it took until the frame after it was painted, in ms. */
const timed = (p, expr) => p.ev(`(async () => { const t = performance.now(); await (${expr}); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); })()`);

/** Starts recording long tasks and event durations (Chromium's Event Timing), for interactions driven from outside. */
const record = (p) => p.ev(`(() => { window.__perf = { long: [], events: [] }; window.__po?.disconnect(); window.__po = new PerformanceObserver((l) => { for (const e of l.getEntries()) (e.entryType === 'longtask' ? window.__perf.long : window.__perf.events).push({ name: e.name, d: Math.round(e.duration) }); }); window.__po.observe({ type: 'longtask', buffered: false }); window.__po.observe({ type: 'event', durationThreshold: 16, buffered: false }); return 1; })()`);
const recorded = async (p) => { await p.sleep(300); return p.ev(`(() => { window.__po?.disconnect(); const r = window.__perf; r.events = r.events.filter(e => /^(key|click|pointer(down|up)|mouse(down|up)|input|beforeinput)/.test(e.name)); return { longest: Math.max(0, ...r.long.map(e => e.d)), slowestEvent: Math.max(0, ...r.events.map(e => e.d)), events: r.events.slice(0, 5) }; })()`); };

test('a 1,000-scene binder: every mode opens, and interactions stay quick', withTidy(async (p, h, t) => {
	const out = {};
	await makeSaga(p);
	const saga = `app.vault.getAbstractFileByPath(${j(SAGA)})`;

	// ---- corkboard: the binder's board (a stack for each part), a part's board (100 cards), a flat folder's (1,000) ----
	out.corkboardOpen = await timed(p, `${PL}.openBinder(${saga})`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]')`);
	const t0 = Date.now();
	await until(p, `/\\d/.test(document.querySelector('.workspace-leaf.mod-active .binders-word-count')?.textContent ?? '')`, 20000);
	out.corkboardWordCounts = Date.now() - t0;
	out.corkboardStacks = await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-stack[data-path]').length`);
	// each stack adds up the hundred notes in it
	await until(p, `[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-stack .binders-card-words')].every(e => /^100 notes · [\\d,]+ words$/.test(e.textContent))`, 20000);
	out.stackCounts = await p.ev(`[...new Set([...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-stack .binders-card-words')].map(e => e.textContent))]`);
	// into a part: a hundred cards
	out.partOpen = await timed(p, `${PL}.openBinder(app.vault.getAbstractFileByPath(${j(SAGA + '/Part 01')}))`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === ${PER}`);
	out.partCards = await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length`);
	// select a card, arrow through a few, as a person would
	const first = await p.at(`.workspace-leaf.mod-active .binders-card[data-path]`);
	await record(p);
	await p.click(first.x, first.y);
	for (let i = 0; i < 5; i++) await p.key('ArrowRight');
	await p.key('ArrowDown');
	out.corkboardKeys = await recorded(p);
	// a reorder from the keyboard (Alt+Right), until the card shows in its new place, and its write to the binder note
	const reorder = `(async () => {
		const sel = '.workspace-leaf.mod-active .binders-card[data-path]', first = () => document.querySelector(sel).dataset.path;
		const was = first(), t = performance.now();
		document.querySelector(sel).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
		while (first() === was && performance.now() - t < 5000) await new Promise(r => requestAnimationFrame(r));
		return Math.round(performance.now() - t);
	})()`;
	out.corkboardReorder = await p.ev(reorder);
	out.reorderWrite = await timed(p, `${B}.flush()`);
	t.eq(await p.ev(`(${B}.orderedChildren(app.vault.getAbstractFileByPath(${j(SAGA + '/Part 01')})) ?? []).slice(0, 2).map(f => f.basename).join()`), 'Scene 0002,Scene 0001', 'the reorder was made');
	// a folder with no folders in it: a thousand cards on one board
	await p.ev(`(async () => {
		await app.vault.createFolder(${j(HEAP)});
		const names = [];
		for (let n = 1; n <= ${HEAP_NOTES}; n++) { const name = 'Card ' + String(n).padStart(4, '0'); names.push(name); await app.vault.create(${j(HEAP)} + '/' + name + '.md', '---\\nsynopsis: Card ' + n + ' of the heap.\\nstatus: ' + ['draft', 'revised', 'done'][n % 3] + '\\n---\\nA few words for card ' + n + '.\\n'); }
		await app.vault.create(${j(HEAP + '/' + HEAP + '.md')}, '---\\nbinder: 1\\ncontents:\\n' + names.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	t0ok(await until(p, `${B}.scenes(app.vault.getAbstractFileByPath(${j(HEAP)}) ?? app.vault.getRoot())?.length === ${HEAP_NOTES} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(HEAP + '/')})).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`, 60000), 'the flat binder is made');
	out.heapOpen = await timed(p, `${PL}.openBinder(app.vault.getAbstractFileByPath(${j(HEAP)}))`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]')?.dataset.path.startsWith(${j(HEAP + '/')})`);
	out.heapCards = await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length`);
	out.heapReorder = await p.ev(reorder);
	await p.ev(`${B}.flush().then(() => 1)`);
	// back to the big binder for the other modes
	await p.ev(`${PL}.openBinder(${saga}).then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === ${j(SAGA)}`);

	// ---- outliner ----
	out.outlinerOpen = await timed(p, `Promise.resolve(${VIEW}.setMode('outliner'))`);
	out.outlinerRows = await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-row').length`);
	// folding a folder of 50 rows, until it's painted
	out.outlinerFold = await timed(p, `(async () => { document.querySelector('.workspace-leaf.mod-active .binders-outliner-row.is-folder .binders-outliner-chevron').click(); })()`);
	const row = await p.at(`.workspace-leaf.mod-active .binders-outliner-row:nth-child(3) .binders-outliner-name`);
	await p.click(row.x, row.y);
	await record(p);
	for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowUp']) await p.key(k);
	out.outlinerKeys = await recorded(p);

	// ---- manuscript ----
	out.manuscriptOpen = await timed(p, `Promise.resolve(${VIEW}.setMode('manuscript'))`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-manuscript .cm-editor')`, 10000);
	await p.sleep(1500);
	const at = await p.ev(`(() => { const e = document.querySelector('.workspace-leaf.mod-active .binders-manuscript .cm-content'); e.focus(); const r = e.getBoundingClientRect(); return { x: r.x + 40, y: r.y + 10 }; })()`);
	await p.click(at.x, at.y);
	await record(p);
	for (const ch of 'Typing in a big binder') await p.key(ch === ' ' ? ' ' : ch);
	await p.sleep(600); // the word count follows
	out.manuscriptTyping = await recorded(p);
	await p.key('z', 'ctrl'); await p.sleep(100);

	// ---- the file explorer ----
	await p.ev(`(() => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); ${EXP}.fileItems[${j(SAGA)}].setCollapsed(true); ${EXP}.fileItems[${j(SAGA + '/Part 01')}]?.setCollapsed(true); return 1; })()`);
	await p.sleep(300);
	out.explorerExpandBinder = await timed(p, `${EXP}.fileItems[${j(SAGA)}].setCollapsed(false)`);
	out.explorerExpandPart = await timed(p, `${EXP}.fileItems[${j(SAGA + '/Part 01')}].setCollapsed(false)`);
	out.explorerOrder = await p.ev(`[...document.querySelectorAll('.nav-file-title[data-path^="Saga/Part 01/"]')].slice(0, 3).map(e => e.dataset.path.split('/').pop())`);

	console.log('    perf ' + j(out));
	t.eq(out.corkboardStacks, PARTS, `the binder’s board: a stack for each part (${out.corkboardStacks})`);
	t.eq(j(out.stackCounts), j(['100 notes · 45,000 words']), 'each counting its hundred notes');
	t.eq(out.partCards, PER, `a part’s board: every card drawn (${out.partCards})`);
	t.eq(out.heapCards, HEAP_NOTES, `a folder of a thousand notes: every card drawn (${out.heapCards})`);
	t.ok(out.outlinerRows >= PARTS * PER, `every row drawn (${out.outlinerRows})`);
	for (const k of ['corkboardOpen', 'partOpen', 'heapOpen', 'outlinerOpen', 'manuscriptOpen', 'explorerExpandBinder', 'explorerExpandPart']) t.ok(out[k] < LIMIT.open, `${k}: ${out[k]} ms (limit ${LIMIT.open})`);
	t.ok(out.corkboardReorder < LIMIT.interaction, `a reorder shows in ${out.corkboardReorder} ms (limit ${LIMIT.interaction})`);
	// (every card of the one grid is measured before and after, for the glide: some 150 ms on a desktop, so twice the limit)
	t.ok(out.heapReorder < LIMIT.interaction * 2, `and among a thousand cards in ${out.heapReorder} ms (limit ${LIMIT.interaction * 2})`);
	t.ok(out.outlinerFold < LIMIT.interaction, `folding a folder in the outliner shows in ${out.outlinerFold} ms (limit ${LIMIT.interaction})`);
	t.ok(out.reorderWrite < LIMIT.write, `its write takes ${out.reorderWrite} ms (limit ${LIMIT.write})`);
	for (const k of ['corkboardKeys', 'outlinerKeys']) t.ok(out[k].slowestEvent < LIMIT.interaction, `${k}: slowest event ${out[k].slowestEvent} ms (limit ${LIMIT.interaction})`);
	t.ok(out.manuscriptTyping.slowestEvent < LIMIT.keystroke, `typing: slowest keystroke ${out.manuscriptTyping.slowestEvent} ms (limit ${LIMIT.keystroke})`);
	t.ok(out.manuscriptTyping.longest < LIMIT.interaction, `typing: longest task ${out.manuscriptTyping.longest} ms (limit ${LIMIT.interaction})`);
}));
