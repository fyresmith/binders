// Word counts that agree with the book (src/view/book-words.ts, word-counter.ts; the rule is in docs/dev/plan.md,
// "What a word of the book is"). With "Count words as the exported book does" on, as it is to begin with, every place
// that shows or uses a count says what the export window says; off, what Obsidian's status bar says. Changing the
// setting changes no note and doesn't touch the day's words.
import { PL, VIEW, closeMenus, file, j, openView, texts, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const F = `${PL}.focus`;
const L = 'The Lighthouse/';
const ARRIVAL = L + 'Part One/Arrival.md', PROLOGUE = L + 'Prologue.md';
const VIEWOF = `app.workspace.getMostRecentLeaf().view`, ED = `${VIEWOF}.editor`;
const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
const C = '.workspace-leaf-content[data-type="binders-contents"]';
const O = '.workspace-leaf.mod-active .binders-outliner';
const WIN = '.modal.binders-export';

/** A scene with what a reader of the book never sees: a comment of each kind, a link's hidden part, an address. And
    a code block, which is in the book as typed. 14 words of the book; 29 as Obsidian's status bar counts. */
const BODY = 'She climbed %%check the tide tables%% to [[The keeper|him]] at dusk.<!-- cut this? -->\n\nRead [the log](https://example.com/logs/1907) twice.\n\n```\nlamp oil: 3 gal\n```\n';
const BOOK = 14, BAR = 29;
const NOTE = `---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\ntarget: 20\n---\n${BODY}`;

const set = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(400));
const write = async (p, path, text) => { await p.ev(`app.vault.process(${file(path)}, () => ${j(text)}).then(() => 1)`); await p.sleep(500); };
const cardWords = (path) => `document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="${path}"] .binders-card-words')?.textContent`;
const toolbar = `document.querySelector('.workspace-leaf.mod-active .binders-word-count')?.textContent`;
const cell = (path, col) => `document.querySelector('${O} .binders-outliner-row[data-path="${path}"] [data-col="${col}"]')?.textContent`;
/** What Obsidian's own status bar says a note has. */
async function statusBar(p, path) {
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(path)}).then(() => 1)`);
	await until(p, `(() => { const e = document.querySelector('.status-bar-item.plugin-word-count'); return !!e && /\\d/.test(e.textContent) && app.workspace.getActiveFile()?.path === ${j(path)}; })()`);
	await p.sleep(400);
	const n = parseInt((await p.ev(`document.querySelector('.status-bar-item.plugin-word-count').textContent`)).replace(/,/g, ''), 10);
	await p.ev(`(() => { app.workspace.activeLeaf.detach(); return 1; })()`);
	return n;
}
async function side(p) {
	await p.ev(`(async () => {
		const ws = app.workspace;
		for (const t of ['binders-inspector', 'binders-contents']) ws.detachLeavesOfType(t);
		ws.rightSplit.expand();
		const a = ws.getRightLeaf(false); await a.setViewState({ type: 'binders-contents', active: true });
		const b = ws.getRightLeaf(true); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b);
		const main = ws.getMostRecentLeaf(ws.rootSplit); if (main) ws.setActiveLeaf(main, { focus: true });
	})().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(I)})`);
	await p.sleep(300);
}
async function press(p, text) {
	for (const ch of text) {
		await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: ch === ' ' ? 'Space' : undefined });
		await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
	}
	await p.sleep(60);
}
async function openNote(p, path) {
	await p.ev(`(async () => { await ${PL}.binders.settled; const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `${VIEWOF}.file?.path === ${j(path)} && !!document.querySelector('.workspace-leaf.mod-active .cm-content')`);
	await p.sleep(350);
}
const caretAfter = (p, needle) => p.ev(`(() => { const e = ${ED}, t = e.getValue(), i = t.indexOf(${j(needle)}); if (i < 0) throw new Error('no such text'); e.setCursor(e.offsetToPos(i + ${needle.length})); e.focus(); return 1; })()`).then(() => p.sleep(120));
/** Everywhere a count shows, read once: the card, the toolbar of its folder, the outliner's row and last row, the
    inspector, the contents' foot, focus mode's corner. */
async function everywhere(p, h) {
	const out = {};
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await until(p, `/\\d/.test(${cardWords(ARRIVAL)} ?? '')`);
	await p.sleep(400);
	out.card = await p.ev(cardWords(ARRIVAL));
	out.toolbar = await p.ev(toolbar);
	out.cards = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path] .binders-card-words')].map(e => parseInt(e.textContent.replace(/,/g, ''), 10)).reduce((a, b) => a + b, 0)`);
	// the inspector on that card, and the contents' foot under the whole binder
	await side(p);
	await p.ev(`(() => { const v = ${VIEW}; app.workspace.setActiveLeaf(v.leaf, { focus: true }); v.revealItem(${file(ARRIVAL)}); return 1; })()`);
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === 'Arrival' && /\\d/.test(document.querySelector(${j(I + ' .binders-inspector-detail')})?.textContent ?? '')`, 5000);
	out.inspector = await p.ev(`document.querySelector(${j(I + ' .binders-inspector-detail')}).textContent`);
	await until(p, `/\\d/.test(document.querySelector(${j(C + ' .binders-contents-foot')})?.textContent ?? '')`, 5000);
	out.contents = await p.ev(`document.querySelector(${j(C + ' .binders-contents-foot')}).textContent`);
	await p.ev(`(() => { app.workspace.rightSplit.collapse(); return 1; })()`);
	// the stack of the folder on the binder's board, and the binder's own count
	await openView(p, 'The Lighthouse');
	await until(p, `/\\d/.test(${cardWords('The Lighthouse/Part One')} ?? '')`);
	await p.sleep(300);
	out.stack = await p.ev(cardWords('The Lighthouse/Part One'));
	out.binder = await p.ev(toolbar);
	// the outliner
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'words' }, { id: 'target' }, { id: 'progress' }] } }; v.setMode('outliner'); return 1; })()`);
	await until(p, `/\\d/.test(${cell(ARRIVAL, 'words')} ?? '')`);
	await p.sleep(400);
	out.row = await p.ev(cell(ARRIVAL, 'words'));
	out.progress = await p.ev(cell(ARRIVAL, 'progress'));
	out.folderRow = await p.ev(cell('The Lighthouse/Part One', 'words'));
	out.foot = await p.ev(`[...document.querySelectorAll('${O} .binders-outliner-foot .binders-outliner-cell')].map(c => c.textContent)[1]`);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	// focus mode, in the note's own tab
	await openNote(p, ARRIVAL);
	await h.run('focus');
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	await p.sleep(550);
	await p.move(900, 420); await p.move(940, 450);
	await until(p, `/\\d/.test(document.querySelector('.binders-focus-scene')?.textContent ?? '')`);
	out.focus = await p.ev(`document.querySelector('.binders-focus-scene').textContent`);
	out.focusMet = await p.ev(`document.querySelector('.binders-focus-scene').classList.contains('is-complete')`);
	await h.run('focus');
	await until(p, `!document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre') && !${F}.busy`);
	await p.sleep(300);
	await p.ev(`(() => { app.workspace.getMostRecentLeaf().detach(); return 1; })()`);
	return out;
}
const stop = async (p) => {
	await closeMenus(p).catch(() => {});
	await p.ev(`(async () => { const pl = ${PL}; if (pl?.focus) { pl.focus.leave(true); pl.focus.busy = false; } if (pl) { Object.assign(pl.settings, { bookWords: true, focusNumbers: false, focusDim: true, focusDark: true }); await pl.saveSettings(); } app.workspace.rightSplit.collapse(); })().then(() => 1)`).catch(() => {});
};
const test = (name, fn) => specs.push({ name: 'word counts: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-focus-hinted', true); app.saveLocalStorage('binders-session', null); const f = ${F}; f.session = new f.session.constructor(null, f.session.day); return 1; })()`);
	try { await fn(p, h, t); } finally { await stop(p); }
}) });

test('a card, a stack, the toolbar, the outliner, a target, the inspector, the contents and focus mode count a note with comments, links and code as the book has it; the setting off, as the status bar does', async (p, h, t) => {
	t.eq(await p.ev(`${PL}.settings.bookWords`), true, 'the setting is on to begin with');
	await set(p, { focusNumbers: true, focusDim: false, focusDark: false });
	await write(p, ARRIVAL, NOTE);
	const before = await texts(p);
	const rest = 17 + 16, book = await everywhere(p, h);
	t.eq(book.card, `${BOOK} / 20 words`, 'the card: the book’s words, against the note’s target');
	t.eq(book.toolbar, `${BOOK + rest} words`, 'the toolbar of its folder');
	t.eq(book.cards, BOOK + rest, 'which is the sum of the cards');
	t.eq(book.stack, `3 notes · ${BOOK + rest} words`, 'the folder’s stack');
	t.eq(book.binder, `${21 + BOOK + rest + 17 + 11 + 6} words`, 'the binder’s toolbar');
	t.eq(book.row, String(BOOK), 'the outliner’s Words column');
	t.eq(book.progress, '70%', 'its Progress: 14 of 20');
	t.eq(book.folderRow, String(BOOK + rest), 'the folder’s row');
	t.eq(book.foot, String(21 + BOOK + rest + 17 + 11 + 6), 'the outliner’s last row');
	t.eq(book.inspector, `${BOOK} of 20 words`, 'the inspector');
	t.ok(book.contents.startsWith(`${21 + BOOK + rest + 17 + 11 + 6} `), `the contents’ foot: ${book.contents}`);
	t.eq(book.focus, `${BOOK} / 20 words`, 'focus mode');
	t.eq(book.focusMet, false, 'a target of 20 is not met by 14 words of the book');
	// what the export window says of the same binder
	await openView(p, 'The Lighthouse');
	await h.run('export');
	await until(p, `/^\\d[\\d,]* words/.test(document.querySelector('${WIN} .binders-snapshots-detail')?.textContent ?? '')`, 15000);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent.split(' · ')[0]`), book.binder, 'the export window says the same of the binder as its toolbar');
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); }

	// off: as Obsidian's status bar counts, everywhere
	await set(p, { bookWords: false });
	const bar = await statusBar(p, ARRIVAL);
	t.eq(bar, BAR, 'Obsidian’s status bar counts the comments, the link’s note and the address');
	const off = await everywhere(p, h);
	t.eq(off.card, `${BAR} / 20 words`, 'off: the card says what the status bar says');
	t.eq(off.toolbar, `${BAR + rest} words`, 'the toolbar');
	t.eq(off.stack, `3 notes · ${BAR + rest} words`, 'the stack');
	t.eq(off.row, String(BAR), 'the outliner');
	t.eq(off.progress, '100%', 'its Progress: 29 of 20, shown as done');
	t.eq(off.foot, String(21 + BAR + rest + 17 + 11 + 6), 'the last row');
	t.eq(off.inspector, `${BAR} of 20 words`, 'the inspector');
	t.ok(off.contents.startsWith(`${21 + BAR + rest + 17 + 11 + 6} `), `the contents’ foot: ${off.contents}`);
	t.eq(off.focus, `${BAR} / 20 words`, 'focus mode');
	t.eq(off.focusMet, true, 'and the target is met');
	t.eq(await p.ev(`(async () => JSON.parse(await app.vault.adapter.read(app.vault.configDir + '/plugins/binders/data.json')).bookWords)()`), false, 'the setting is saved');
	// and back on
	await set(p, { bookWords: true });
	await openView(p, 'The Lighthouse/Part One');
	await until(p, `${cardWords(ARRIVAL)} === '${BOOK} / 20 words'`);
	t.eq(await p.ev(cardWords(ARRIVAL)), `${BOOK} / 20 words`, 'on again: the book’s count again');
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) t.eq(after[path], text, `“${path}” is as it was: counting changes no note`);
});

test('the title of a chapter is export’s to set: a level-one heading at the top of a note that opens a chapter isn’t counted with its text', async (p, h, t) => {
	// (in this binder a folder is a part and a note is a chapter)
	await write(p, PROLOGUE, '---\nstatus: draft\n---\n# Before the light\n\nOne two three four five.\n\n# A heading further down\n');
	await openView(p, 'The Lighthouse');
	await until(p, `/\\d/.test(${cardWords(PROLOGUE)} ?? '')`);
	await until(p, `${cardWords(PROLOGUE)} === '9 words'`);
	t.eq(await p.ev(cardWords(PROLOGUE)), '9 words', 'the text and the heading inside it: the first heading is the chapter’s title');
	await h.run('export');
	await until(p, `/^\\d[\\d,]* words/.test(document.querySelector('${WIN} .binders-snapshots-detail')?.textContent ?? '')`, 15000);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent.split(' · ')[0]`), await p.ev(toolbar), 'the export window and the toolbar agree');
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); }
	await set(p, { bookWords: false });
	await until(p, `${cardWords(PROLOGUE)} === '12 words'`);
	t.eq(await p.ev(cardWords(PROLOGUE)), '12 words', 'off: every word in the note, as the status bar counts');
});

test('a note that embeds another has the embedded note’s words where the book has them, and follows an edit to it', async (p, h, t) => {
	await p.ev(`app.vault.create('Aside.md', 'Four words of aside.\\n\\n%%not these%%\\n').then(() => 1)`);
	await p.sleep(400);
	await write(p, PROLOGUE, '---\nstatus: draft\n---\nOne two three.\n\n![[Aside]]\n\n![[Aside#Part]]\n\n![[No such note]]\n');
	await openView(p, 'The Lighthouse');
	await until(p, `${cardWords(PROLOGUE)} === '7 words'`, 6000);
	t.eq(await p.ev(cardWords(PROLOGUE)), '7 words', 'three of its own and the four of the note it embeds whole');
	await p.ev(`app.vault.process(${file('Aside.md')}, (s) => s + 'Two more.\\n').then(() => 1)`);
	await until(p, `${cardWords(PROLOGUE)} === '9 words'`, 6000);
	t.eq(await p.ev(cardWords(PROLOGUE)), '9 words', 'the embedded note edited: counted again');
	await p.ev(`app.vault.delete(${file('Aside.md')}).then(() => 1)`);
});

test('changing the setting in the middle of a day’s writing leaves the day’s words as they were', async (p, h, t) => {
	await write(p, ARRIVAL, NOTE);
	await openNote(p, ARRIVAL);
	await caretAfter(p, 'at dusk.');
	await press(p, ' One two three.');
	await p.sleep(900);
	const day = () => p.ev(`${F}.session.words('The Lighthouse')`);
	t.eq(await day(), 3, 'three words written today');
	t.eq(await p.ev(`${F}.session.now(${j(ARRIVAL)})`), BOOK + 3, 'the note is counted as the book has it');
	await set(p, { bookWords: false });
	await until(p, `${F}.session.now(${j(ARRIVAL)}) === ${BAR + 3}`, 6000);
	t.eq(await p.ev(`${F}.session.now(${j(ARRIVAL)})`), BAR + 3, 'the setting off: the note is counted again, as the status bar counts');
	t.eq(await day(), 3, 'and the day’s words are still three: fifteen weren’t written by a switch');
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await caretAfter(p, 'three.');
	await press(p, ' Four five.');
	await p.sleep(900);
	t.eq(await day(), 5, 'what is written after counts on');
	// a comment typed is a word to the status bar, and none to the book
	await press(p, ' %%six seven%%');
	await p.sleep(900);
	t.eq(await day(), 7, 'off: a comment’s words are words written');
	await set(p, { bookWords: true });
	await until(p, `${F}.session.now(${j(ARRIVAL)}) === ${BOOK + 5}`, 6000);
	t.eq(await day(), 7, 'on again: the day is what it was, though the note is counted by the book’s rule again');
	await press(p, ' Eight.');
	await p.sleep(900);
	t.eq(await day(), 8, 'and writing counts on from there');
	t.eq(await p.ev(`app.loadLocalStorage('binders-session-rule')`), true, 'which way the day is counted is kept with it, on this device');
	await p.sleep(2200);
	t.ok((await p.ev(`app.vault.adapter.read(${j(ARRIVAL)})`)).includes('at dusk. One two three. Four five. %%six seven%% Eight.'), 'everything typed is in the note');
});
