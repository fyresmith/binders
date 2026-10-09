// Find and replace across a binder (src/find/, src/view/find-bar.ts, src/view/find-review.ts, src/focus/find.ts).
// Golden rules 2 and 3 live here: every test that replaces compares whole files before and after (frontmatter included),
// and the ones that look only compare that nothing was written at all. Tests named "find and replace: …".
// FIND_SHOTS=<dir> saves a screenshot at the end of the tests that take one.
import { mkdirSync } from 'fs';
import { B, PL, VIEW, file, j, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';
import { ARRIVAL, KEEPER, LEAF, PHONE, STORM, TABLET, binder, disk, menuTap, onDevice, openMs, saveAll, settle, snap, tap, M } from './specs-qa5-manuscript.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'find and replace: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });
const SHOTS = process.env.FIND_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };

// ---- helpers ----
const BAR = `${VIEW}.findBar`;
const BARSEL = `${LEAF} .binders-view .binders-find`;
async function closeAll(p) {
	await p.ev(`(() => { try { ${BAR}?.close(); } catch {} document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); return 1; })()`).catch(() => {});
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
}
const noNotices = (p) => p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
/** The bar open on the view in front (as Obsidian's find command opens it), with this query (and replacement). */
async function ask(p, q, by = null, { match = false } = {}) {
	await p.ev(`(async () => {
		const v = ${VIEW};
		if (!v.findBar) v.showSearch(${by != null}); else if (${by != null}) v.findBar.setReplacing(true);
		const b = v.findBar;
		if (b.options.matchCase !== ${match}) b.options = { matchCase: ${match} };
		b.input.value = ${j(q)};
		${by != null ? `b.by.value = ${j(by)};` : ''}
		await b.search();
	})().then(() => 1)`);
	await p.sleep(250);
}
const countText = (p) => p.ev(`document.querySelector(${j(BARSEL + ' .document-search-count')})?.textContent ?? null`);
const doneText = (p) => p.ev(`(() => { const e = document.querySelector(${j(BARSEL + ' .binders-find-done')}); return e && e.style.display !== 'none' ? e.textContent : null; })()`);
const found = (p) => p.ev(`(() => { const b = ${BAR}; return b ? b.found.map(f => [f.source.file?.path ?? f.source.id, f.hits.length]) : null; })()`);
/** Replace all as a person does: the button, then the review's button (or closing the review). */
async function replaceAll(p, go = true, between = null) {
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(200);
	if (between) await between();
	if (go) await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); return 1; })()`);
	else { await p.key('Escape'); await p.sleep(300); }
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(300);
}
const reviewText = (p) => p.ev(`document.querySelector('.modal.binders-find-review')?.textContent ?? null`);
/** The folder snapshots a binder has, newest first. */
const snapshots = (p, folder) => p.ev(`${PL}.snapshotsApi.list(${file(folder)}).map(s => ({ title: s.title, auto: s.auto, name: s.file.name }))`);
/** The whole vault on disk but for the snapshots folders. */
const vault = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => !/(^|\/)Snapshots\//.test(k)));
/** Every file in `before` is still byte for byte what it was, but for the ones in `changes` (path → whole new text). */
function onlyThese(t, before, after, changes = {}) {
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (k in changes) t.eq(after[k], changes[k], `“${k}” is exactly what the replace should have made it`);
		else t.eq(after[k], before[k], `“${k}” is untouched, byte for byte`);
	}
}
const front = (s) => (/^---\n[\s\S]*?\n---\n/.exec(s) ?? [''])[0];
const notesIn = (p, folder) => p.ev(`${B}.scenes(${file(folder)}).map(f => f.path)`);

/** A binder of two notes with everything a replace must leave alone, in the first. */
const MIXED = [
	'---\nstatus: draft\nsynopsis: Mara in the synopsis.\nlabel: Mara\nplotlines:\n  - Mara\n---\n',
	'Mara came. mara waved. MARA! A Maramures rug.\n\n',
	'A link [[Mara]], a link with words [[Mara|Mara herself]], a heading link [[Mara#Storm]], and an embed ![[Mara]].\n',
	'A Markdown link [what Mara kept](Mara.md), a tag #Mara, and a path tag #Mara/sub.\n',
	'Code `Mara` inline, and a comment %% Mara %% and <!-- Mara -->.\n\n```\nMara in a fence\n```\n\n',
	'\tA tab-led paragraph with Mara in it.\n',
].join('');
const TWO = '---\nstatus: idea\nsynopsis: Mara again.\n---\nOnly Mara here, and Mara there.\n';
async function mixed(p, name = 'Find', extra = {}) {
	await binder(p, name, { '1 One': MIXED, '2 Two': TWO, ...extra });
	await openView(p, name);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
/** The body of MIXED as it should be after `Mara` → `Maren` (all the places a query reaches). */
const MIXED_MAREN = MIXED.replace('Mara came. mara waved. MARA! A Maramures rug.', 'Maren came. Maren waved. Maren! A Marenmures rug.')
	.replace('with words [[Mara|Mara herself]]', 'with words [[Mara|Maren herself]]')
	.replace('[what Mara kept](Mara.md)', '[what Maren kept](Mara.md)')
	.replace('\tA tab-led paragraph with Mara in it.', '\tA tab-led paragraph with Maren in it.');

// =====================================================================================================================
// Finding: where the bar opens, what it looks through, how it counts
// =====================================================================================================================

test('Ctrl+F in the manuscript opens one bar in the note’s column and looks through every note in binder order: its count says matches and notes, the properties are not looked through, and Escape gives the caret back to its section', async (p, h, t) => {
	await openMs(p);
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === ${j(ARRIVAL)}); s.live.cm.focus(); return 1; })()`);
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector(${j(BARSEL)}) && document.querySelectorAll('.document-search-container').length === 1`), 'one bar, the view’s own, not one inside a section');
	t.ok(await p.ev(`document.activeElement === ${BAR}.input`), 'with the keyboard in it');
	t.ok(!(await p.ev(`document.querySelector(${j(BARSEL)}).classList.contains('is-wide')`)), 'in the note’s column over the manuscript');
	await p.type('Mara');
	await p.sleep(500);
	// Arrival has "Mara" in its text once; every synopsis and plotline that says it is a property
	t.eq(await countText(p), '1 / 1 in 1 note', 'it counts the text only, with the notes it is in');
	await p.type('x');
	await p.sleep(500);
	t.eq(await countText(p), '0 / 0', 'no match is counted as none');
	t.ok(await p.ev(`document.querySelector(${j(BARSEL + ' input')}).classList.contains('mod-no-match')`), 'and the field says so');
	const tint = await p.ev(`getComputedStyle(document.querySelector(${j(BARSEL + ' input')})).backgroundColor`);
	const plain = await p.ev(`(() => { const i = document.querySelector(${j(BARSEL + ' .document-replace-input')}); return getComputedStyle(i).backgroundColor; })()`);
	t.ok(tint !== plain, 'the tint can be seen (it is not the field’s own color: ' + tint + ' against ' + plain + ')');
	await p.key('Backspace');
	await p.sleep(400);
	await p.key('Escape');
	await p.sleep(300);
	t.ok(!(await p.ev(`!!document.querySelector(${j(BARSEL)})`)), 'Escape closes it');
	t.eq(await p.ev(`document.activeElement?.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'Arrival', 'and the caret is back, in the section of the match');
});

test('stepping goes across notes in binder order and wraps; a match is brought into sight and selected in its section; the count follows', async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara');
	t.eq(await countText(p), '1 / 12 in 2 notes'.replace('12', await p.ev(`${BAR}.found.reduce((n, f) => n + f.hits.length, 0)`).then(String)), 'the first match, of all in two notes');
	const order = (await found(p)).map(([f]) => f);
	t.eq(j(order), j(['Find/1 One.md', 'Find/2 Two.md']), 'the notes with a match, in binder order');
	const total = await p.ev(`${BAR}.found.reduce((n, f) => n + f.hits.length, 0)`);
	for (let i = 0; i < total; i++) await p.ev(`(${BAR}.step(1), 1)`);
	t.eq(await countText(p), `1 / ${total} in 2 notes`, 'stepping past the last wraps to the first');
	await p.ev(`(${BAR}.step(-1), 1)`);
	t.eq((await countText(p)).split(' ')[0], String(total), 'and back from the first goes to the last');
	await p.sleep(400);
	const sel = await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === 'Find/2 Two.md'); const cm = s.live?.cm; if (!cm) return null; const r = cm.state.selection.main; return cm.state.sliceDoc(r.from, r.to); })()`);
	t.eq(sel, 'Mara', 'the match is selected in its section’s editor');
	await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
});

test('no match is found across the join of two notes, and none in a note’s title or properties', async (p, h, t) => {
	await binder(p, 'Join', { '1 A': '---\nsynopsis: Maraud\n---\nA word ends in Ma', '2 B': '---\nsynopsis: Mara\n---\nra begins the next. Title is B.\n' });
	await openView(p, 'Join');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await ask(p, 'Mara');
	t.eq(await countText(p), '0 / 0', 'Ma at the end of one note and ra at the start of the next is not Mara');
	await ask(p, 'Join');
	t.eq(await countText(p), '0 / 0', 'nor is the binder’s name, which is the page’s title');
	await ask(p, 'draft');
	t.eq(await countText(p), '0 / 0', 'nor is a property’s value');
});

test('Match case: with it on, only the match as typed; with it off, any case', async (p, h, t) => {
	await mixed(p);
	await ask(p, 'mara');
	const loose = await p.ev(`${BAR}.found.reduce((n, f) => n + f.hits.length, 0)`);
	await ask(p, 'mara', null, { match: true });
	t.eq(await p.ev(`${BAR}.found.reduce((n, f) => n + f.hits.length, 0)`), 1, 'only the one typed in lower case');
	t.ok(loose > 1, 'against ' + loose + ' with any case');
	const btn = `${BARSEL} button[aria-label^="Match case"]`;
	await p.ev(`document.querySelector(${j(btn)}).click()`);
	await p.sleep(400);
	t.eq(await p.ev(`${BAR}.found.reduce((n, f) => n + f.hits.length, 0)`), loose, 'the button turns it off again');
	t.eq(await p.ev(`document.querySelector(${j(btn)}).getAttribute('aria-pressed')`), 'false', 'and says so');
});

test('what a query does not reach: a link’s target, a tag, an embed, code, a comment and the properties are no match; a link’s shown words, a Markdown link’s words and a tab-led line are', async (p, h, t) => {
	await mixed(p);
	const hits = async (q) => { await ask(p, q); return p.ev(`${BAR}.found.map(f => f.source.file.basename + ':' + f.hits.length).join(',')`); };
	// MIXED, in its first note: prose (3 in the first line, Maramures too), the link's shown words, the Markdown link's words, the tab-led line
	t.eq(await hits('Mara'), '1 One:7,2 Two:2', 'Mara: 4 in the first paragraph (Maramures counts), the link’s words, the Markdown link’s words, the tab-led line; the second note has two');
	t.eq(await hits('[[Mara'), '1 One:4', 'typed with its brackets, links are found as written (the plain, the aliased, the heading link and the embed)');
	t.eq(await hits('#Mara'), '1 One:2', 'typed with its #, the tags (the plain and the path)');
	t.eq(await hits('`Mara`'), '1 One:1', 'typed with its backticks, the inline code');
	t.eq(await hits('%% Mara'), '1 One:1', 'typed with its comment mark, the comment');
	t.eq(await hits('Mara in a fence'), '', 'a fenced block is not looked through');
	t.eq(await hits('```\nMara'), '', 'a query is one line: it cannot be typed across lines');
	t.eq(await hits('synopsis'), '', 'a property’s name');
	t.eq(await hits('in the synopsis'), '', 'a property’s value');
});

test('Obsidian’s own search commands open Binders’ bar wherever a binder view is in front (the manuscript, the corkboard, the outliner); the palette has both commands, with no default key', async (p, h, t) => {
	await mixed(p);
	for (const mode of ['corkboard', 'outliner', 'manuscript']) {
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await p.sleep(900);
		await p.ev(`(() => { ${VIEW}.findBar?.close(); document.activeElement?.blur?.(); return 1; })()`);
		await p.ev(`(() => { app.commands.executeCommandById('editor:open-search'); return 1; })()`);
		await p.sleep(350);
		t.ok(await p.ev(`!!${BAR}`), `“Search current file” opens it in the ${mode}`);
		t.eq(await p.ev(`!!document.querySelector(${j(BARSEL + '.mod-replace-mode')})`), false, 'without the replace row');
		t.eq(await p.ev(`document.querySelector(${j(BARSEL)}).classList.contains('is-wide')`), mode !== 'manuscript', mode === 'manuscript' ? 'in the note’s column' : 'the width of the view');
		await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
		// (Obsidian's own replace command needs an editor to be the active one: in the manuscript with the caret in a section
		// it is; on a board the palette's own command does the same)
		if (mode === 'manuscript') await p.ev(`(() => { ${M}.scenes.find(s => s.live)?.live.cm.focus(); app.commands.executeCommandById('editor:open-search-replace'); return 1; })()`);
		else await p.ev(`(() => { app.commands.executeCommandById('binders:find-replace'); return 1; })()`);
		await p.sleep(350);
		t.ok(await p.ev(`!!document.querySelector(${j(BARSEL + '.mod-replace-mode')})`), `search and replace opens it with the replace row in the ${mode}`);
		await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
	}
	for (const [id, name] of [['find', 'Find in binder'], ['find-replace', 'Find and replace in binder']]) {
		const c = await p.ev(`(() => { const c = app.commands.commands['binders:${id}']; return c ? { name: c.name, hotkeys: c.hotkeys ?? null, can: c.checkCallback(true) } : null; })()`);
		t.eq(c?.name.replace(/^Binders: /, ''), name, `the command “${name}” is in the palette`);
		t.ok(!c?.hotkeys?.length, 'with no default hotkey');
		t.ok(c?.can === true, 'offered while a binder view is in front');
	}
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`);
	await p.sleep(200);
	t.ok(await p.ev(`app.commands.commands['binders:find'].checkCallback(true) === false`), 'and not offered when there is none');
	t.eq(await p.ev(`typeof app.commands.commands['binders:find'].icon`), 'string', 'with an icon');
});

test('the view’s menu has Find in binder and Find and replace in binder (the way in on a phone)', async (p, h, t) => {
	await mixed(p);
	await p.ev(`(() => { document.querySelector('${LEAF} .view-action[aria-label="More options"]').click(); return 1; })()`);
	await p.sleep(300);
	const items = await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
	await p.key('Escape');
	t.ok(items.includes('Find in binder') && items.includes('Find and replace in binder'), 'both: ' + items.join(' | '));
});

test('in a subfolder the search is that subfolder’s; a note in its own tab keeps Obsidian’s own bar', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await ask(p, 'the');
	const inFolder = (await found(p)).map(([f]) => f);
	t.ok(inFolder.length > 0 && inFolder.every((f) => f.startsWith('The Lighthouse/Part One/')), 'only notes of Part One: ' + inFolder.join(', '));
	await p.ev(`(() => { ${BAR}.close(); app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`);
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(ARRIVAL)}).then(() => 1)`);
	await p.sleep(800);
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector('${LEAF} .document-search-container') && !document.querySelector('${LEAF} .binders-find')`), 'a note in its own tab has Obsidian’s bar, not ours');
	await p.key('Escape');
});

// =====================================================================================================================
// The boards
// =====================================================================================================================

test('on the corkboard: a card whose note has a match is lit and shows the matching line where the synopsis was, the rest step back; a folder’s card is lit and says which of the notes it lists matched; the title and synopsis are not looked through; no count on a card', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(900);
	await ask(p, 'jetty');
	const cardOf = (path) => `${LEAF} .binders-card[data-path="${path}"]`;
	t.ok(await p.ev(`document.querySelector(${j(BARSEL)}).classList.contains('is-wide')`), 'the bar is the width of the view');
	t.eq(await countText(p), '1 in 1 note', 'it says how many, and in how many notes (not a position)');
	await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
	await ask(p, 'Mara');
	await p.sleep(500);
	// Arrival (in Part One) has "Mara" once in its text; the cards of the top level: Part One is a folder card
	const lit = await p.ev(`[...document.querySelectorAll(${j(LEAF + ' .binders-card.is-find-hit')})].map(c => c.dataset.path)`);
	const faded = await p.ev(`[...document.querySelectorAll(${j(LEAF + ' .binders-card.is-find-miss')})].map(c => c.dataset.path)`);
	t.eq(j(lit), j(['The Lighthouse/Part One']), 'only the folder with the match is lit');
	t.ok(faded.includes('The Lighthouse/Prologue.md') && faded.includes('The Lighthouse/Epilogue.md'), 'the notes without one step back (the Epilogue has Mara in its synopsis, which is not looked through)');
	t.ok(!(await p.ev(`!!document.querySelector(${j(cardOf('The Lighthouse/Part One') + ' .binders-find-flair')})`)), 'no count on a card');
	const listed = await p.ev(`[...document.querySelectorAll(${j(cardOf('The Lighthouse/Part One') + ' .binders-card-held-item')})].map(i => i.querySelector('.binders-card-held-name').textContent + ':' + (i.classList.contains('is-find-hit') ? 'hit' : i.classList.contains('is-find-miss') ? 'miss' : '-'))`);
	t.eq(j(listed), j(['Arrival:hit', 'The keeper:miss', 'Storm warning:miss']), 'the folder’s card says which of the notes it lists matched');
	// in the folder: the card of the note shows the matching line
	await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
	await p.ev(`(async () => { await ${PL}.openBinder(${file('The Lighthouse/Part One')}, false); })().then(() => 1)`);
	await p.sleep(900);
	await ask(p, 'jetty');
	await p.sleep(400);
	t.ok(await p.ev(`document.querySelector(${j(cardOf('The Lighthouse/Part One/Arrival.md'))}).classList.contains('is-find-hit')`), 'the note’s card is lit');
	t.eq(await p.ev(`document.querySelector(${j(cardOf('The Lighthouse/Part One/Arrival.md') + ' .binders-find-excerpt')})?.textContent.includes('left Mara on the jetty')`), true, 'and shows the line of the match');
	t.eq(await p.ev(`getComputedStyle(document.querySelector(${j(cardOf('The Lighthouse/Part One/Arrival.md') + ' .binders-card-synopsis')})).display`), 'none', 'where the synopsis was');
	t.eq(await p.ev(`document.querySelector(${j(cardOf('The Lighthouse/Part One/Arrival.md') + ' .search-result-file-matched-text')})?.textContent`), 'jetty', 'with the match marked');
	await ask(p, 'The keeper refuses');
	t.eq(await countText(p), '0', 'a synopsis is not looked through (a card’s title and synopsis are properties and a name)');
	t.eq(await p.ev(`document.querySelectorAll(${j(LEAF + ' .binders-card.is-find-hit')}).length`), 0, 'and no card is lit');
	await shot(p, 'corkboard');
	await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
	t.eq(await p.ev(`document.querySelectorAll(${j(LEAF + ' .is-find-hit, ' + LEAF + ' .is-find-miss, ' + LEAF + ' .binders-find-excerpt')}).length`), 0, 'closing the bar puts every card back');
});

test('in the outliner: a row with a match is lit and says how many at its end, a folder’s row adds up what is in it, the rest step back; Next and Previous go to the next lit row, and a row in a folded folder is unfolded', async (p, h, t) => {
	await mixed(p, 'Find', {});
	await binder(p, 'Out', { '1 Plain': 'No match.\n' });
	await p.ev(`(async () => { await app.vault.createFolder('Out/Deep'); await app.vault.create('Out/Deep/Hit.md', 'The needle is here, and here is a needle.\\n'); await app.vault.create('Out/Deep/Out.md', '---\\nbinder: 1\\n---\\n'); })().then(() => 1)`).catch(() => {});
	await p.ev(`(async () => { const c = app.vault.getAbstractFileByPath('Out/Out.md'); await app.vault.modify(c, '---\\nbinder: 1\\ncontents:\\n  - 1 Plain\\n  - Deep/\\n  - Deep/Hit\\n---\\n'); })().then(() => 1)`);
	await p.sleep(800);
	await openView(p, 'Out');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(900);
	await ask(p, 'needle');
	await p.sleep(400);
	const row = (path) => `${LEAF} .binders-outliner-row[data-path="${path}"]`;
	t.eq(await p.ev(`document.querySelector(${j(row('Out/Deep/Hit.md') + ' .binders-find-flair')})?.textContent`), '2', 'the row says how many matches, at its end');
	t.eq(await p.ev(`document.querySelector(${j(row('Out/Deep') + ' .binders-find-flair')})?.textContent`), '2', 'a folder’s row adds up what is in it');
	t.ok(await p.ev(`document.querySelector(${j(row('Out/1 Plain.md'))}).classList.contains('is-find-miss')`), 'a row without a match steps back');
	t.eq(await countText(p), '2 in 1 note', 'the bar counts matches and notes (not a position)');
	// fold the folder, step: it unfolds
	await p.ev(`(() => { ${VIEW}.current.setCollapsed(['Out/Deep']); return 1; })()`);
	await p.sleep(300);
	await p.ev(`(() => { ${BAR}.step(1); return 1; })()`);
	await p.sleep(500);
	t.ok(await p.ev(`!!document.querySelector(${j(row('Out/Deep/Hit.md'))})`), 'stepping onto a note in a folded folder unfolds it');
	t.ok(await p.ev(`document.querySelector(${j(row('Out/Deep/Hit.md'))}).classList.contains('is-selected') || document.querySelector(${j(row('Out/Deep/Hit.md'))}).getAttribute('aria-selected') === 'true'`), 'and selects the row');
	await shot(p, 'outliner');
});

test('the outliner marks only the rows in sight (and a screen either side), and marks the rest as they come into sight', async (p, h, t) => {
	const BIG = Number(process.env.FIND_BIG || 1500);
	await make(p, 'Big', `Array.from({ length: ${BIG} }, (_, i) => ({ path: 'N' + String(i).padStart(4, '0') + '.md', text: 'Note ' + i + ' has a needle in it.\\n' }))`, { timeout: 180000 });
	await openView(p, 'Big');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `document.querySelectorAll(${j(LEAF + ' .binders-outliner-row')}).length > 100`, 30000);
	await p.sleep(1000);
	const t0 = Date.now();
	const took = await p.ev(`(async () => { const v = ${VIEW}; v.showSearch(false); const b = v.findBar; b.input.value = 'needle'; const t0 = performance.now(); await b.search(); const t1 = performance.now(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return [Math.round(t1 - t0), Math.round(performance.now() - t0), Math.round(b.took)]; })()`);
	await p.sleep(600);
	const rows = await p.ev(`document.querySelectorAll(${j(LEAF + ' .binders-outliner-row')}).length`);
	const marked = () => p.ev(`document.querySelectorAll(${j(LEAF + ' .binders-outliner-row.is-find-hit')}).length`);
	const m = await marked();
	t.ok(rows >= 1000, 'the outliner has its rows (' + rows + ')');
	t.ok(m > 10 && m < 200, 'only the rows in sight are marked: ' + m + ' of ' + rows);
	t.eq(await countText(p), `${BIG.toLocaleString()} in ${BIG.toLocaleString()} notes`, 'the count is of all of them');
	await p.ev(`(() => { const r = ${VIEW}.current.root; r.scrollTop = r.scrollHeight * 0.6; return 1; })()`);
	await p.sleep(700);
	const far = await p.ev(`(() => { const r = ${VIEW}.current.root, b = r.getBoundingClientRect(); const rows = [...r.querySelectorAll('.binders-outliner-row')].filter(e => { const x = e.getBoundingClientRect(); return x.bottom > b.top && x.top < b.bottom; }); return [rows.length, rows.filter(e => e.classList.contains('is-find-hit')).length]; })()`);
	t.ok(far[0] > 5 && far[0] === far[1], 'rows scrolled into sight are marked: ' + j(far));
	console.log(`    outliner ${BIG} notes: the search and marking ${took[0]} ms, to the next frame ${took[1]} ms (the search itself ${took[2]} ms); ${m} rows marked`);
	void t0;
});

// =====================================================================================================================
// Replace one
// =====================================================================================================================

test('Replace one changes that match and no other byte of any note; the next match is the one the writer is on; Undo in the editor takes it back', async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	t.ok(await p.ev(`document.querySelector(${j(BARSEL)}).classList.contains('mod-replace-mode')`), 'the replace row is there');
	await p.ev(`(${BAR}.step(1), 1)`); // the second match (mara, lower case)
	await p.sleep(300);
	await p.ev(`(() => { ${BAR}.by.focus(); return 1; })()`);
	await p.key('Enter');
	await p.sleep(800);
	await saveAll(p);
	const now = vault(p);
	const one = MIXED.replace('mara waved', 'Maren waved');
	onlyThese(t, before, now, { 'Find/1 One.md': one });
	t.ok(front(now['Find/1 One.md']) === front(MIXED), 'the properties are the same, byte for byte');
	t.eq(await countText(p), '2 / 13 in 2 notes'.replace('13', String(await p.ev(`${BAR}.found.reduce((n, f) => n + f.hits.length, 0)`))), 'the count went down by one and the writer is on the next match');
	// Undo in the section's own editor
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === 'Find/1 One.md'); s.live.cm.focus(); return 1; })()`);
	await p.key('z', 'ctrl');
	await p.sleep(500);
	await saveAll(p);
	await p.sleep(2200);
	t.eq(disk(p, 'Find/1 One.md'), MIXED, 'Ctrl+Z in the section takes it back, byte for byte');
});

test('Replace one with a replacement that holds the query steps on past it, never again into it; and replaces with nothing', async (p, h, t) => {
	await binder(p, 'Hold', { '1 A': 'Mara met Mara.\n', '2 B': 'Nothing.\n' });
	await openView(p, 'Hold');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await ask(p, 'Mara', 'Mara Smith');
	await p.ev(`(() => { ${BAR}.by.focus(); return 1; })()`);
	await p.key('Enter');
	await p.sleep(700);
	await p.key('Enter');
	await p.sleep(700);
	await saveAll(p);
	t.eq(disk(p, 'Hold/1 A.md'), 'Mara Smith met Mara Smith.\n', 'each Mara once: the second step went past the first replacement');
	await ask(p, ' Smith', '');
	await p.ev(`(() => { ${BAR}.by.focus(); return 1; })()`);
	await p.key('Enter');
	await p.sleep(700);
	await saveAll(p);
	t.eq(disk(p, 'Hold/1 A.md'), 'Mara met Mara Smith.\n', 'replacing with nothing takes the match out');
});

// =====================================================================================================================
// Replace all
// =====================================================================================================================

test('Replace all shows every change in context first; closing that changes nothing; confirming changes only the matches, leaves every other byte of every note (properties included) and says “Replaced N in M notes” with Undo', async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await noNotices(p);
	await replaceAll(p, false);
	t.eq(await p.ev(`!!document.querySelector('.modal.binders-find-review')`), false, 'the review closed');
	onlyThese(t, before, vault(p));
	t.eq((await snapshots(p, 'Find')).length, 0, 'closing the review took no snapshot either');
	// open it again and look
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	const text = await reviewText(p);
	t.ok(/Replace “Mara” with “Maren”/.test(text), 'it names what becomes what');
	t.ok(/10 places in 2 notes/.test(text) || /\d+ places in 2 notes/.test(text), 'and how many places in how many notes: ' + (/\d+ places? in \d+ notes?/.exec(text)?.[0]));
	t.ok(/1 One/.test(text) && /2 Two/.test(text), 'with the notes by name');
	t.ok(/A snapshot of the binder is taken first/.test(text), 'and says a snapshot comes first');
	t.eq(await p.ev(`[...document.querySelectorAll('.modal.binders-find-review del')].some(e => e.textContent === 'Mara')`), true, 'each change is shown where it falls, the old struck out');
	t.eq(await p.ev(`document.querySelector('.modal.binders-find-review .binders-snapshots-changes').textContent.includes('[[Mara]]')`), true, 'with a link as it is written, its target not changed');
	await shot(p, 'review');
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(500);
	await saveAll(p);
	onlyThese(t, before, vault(p), { 'Find/1 One.md': MIXED_MAREN, 'Find/2 Two.md': TWO.replaceAll('Mara here', 'Maren here').replace('and Mara there', 'and Maren there') });
	t.ok(/^Replaced \d+ in 2 notes\.Undo$/.test(await doneText(p) ?? ''), 'the bar says what was done, with Undo: ' + (await doneText(p)));
	const s = await snapshots(p, 'Find');
	t.eq(s.length, 1, 'one snapshot was taken');
	t.ok(s[0].auto && /Before replacing “Mara” with “Maren”/.test(s[0].title) && /\.auto\.binder-snapshot$/.test(s[0].name), 'an automatic one, named for the replace: ' + s[0].name);
	await shot(p, 'done');
});

test('the snapshot taken before Replace all holds the text as it was, and bringing it back restores every note; the bar’s Undo does the same', async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	t.ok(disk(p, 'Find/1 One.md') !== before['Find/1 One.md'], 'it replaced');
	// Undo
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')}).click()`);
	await p.sleep(900);
	await saveAll(p);
	onlyThese(t, before, vault(p));
	t.ok(/^Put back in 2 notes\.$/.test(await doneText(p) ?? ''), 'Undo says what it did: ' + (await doneText(p)));
	// the snapshot too
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	t.ok(disk(p, 'Find/1 One.md') !== before['Find/1 One.md'], 'replaced again');
	const r = await p.ev(`(async () => { const s = ${PL}.snapshotsApi.list(${file('Find')}).find(x => x.auto && /Before replacing/.test(x.title)); const r = await ${PL}.snapshotsApi.back(s, ${file('Find')}, 'text'); return JSON.stringify(r.texts ?? r); })()`);
	await p.sleep(600);
	await saveAll(p);
	onlyThese(t, before, vault(p));
	t.ok(!!r, 'bringing the snapshot back gave every note its text: ' + r);
});

test('after Replace all, Ctrl+Z in a note’s section takes that note’s replace back, as one step, with the text it had', async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	t.eq(disk(p, 'Find/1 One.md'), MIXED_MAREN, 'replaced');
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === 'Find/1 One.md'); s.live.cm.focus(); return 1; })()`);
	await p.key('z', 'ctrl');
	await p.sleep(600);
	await saveAll(p);
	await p.sleep(2200);
	t.eq(disk(p, 'Find/1 One.md'), MIXED, 'one Ctrl+Z and the note is as it was, byte for byte');
	t.ok(disk(p, 'Find/2 Two.md').includes('Maren'), 'the other note is as replaced (its own undo is its own)');
});

test('a note changed on disk between the review and the replace is left as it is, and counted; the others are replaced', async (p, h, t) => {
	await mixed(p);
	// the second note is changed from outside while the review is open
	await ask(p, 'Mara', 'Maren');
	const outside = '---\nstatus: idea\nsynopsis: Mara again.\n---\nOnly Mara here, and Mara there. And typed from outside: Mara.\n';
	await replaceAll(p, true, async () => { await writeRaw(p, 'Find/2 Two.md', outside); await p.sleep(300); });
	await p.sleep(400);
	await saveAll(p);
	t.eq(disk(p, 'Find/2 Two.md'), outside, 'the note changed meanwhile is exactly what it was changed to');
	t.eq(disk(p, 'Find/1 One.md'), MIXED_MAREN, 'the other is replaced');
	t.ok(/1 note was changed meanwhile, and left as it is/.test(await doneText(p) ?? ''), 'the bar says so: ' + (await doneText(p)));
});

test('a note open in a tab of its own with typing not yet saved: the typing is kept and its matches are replaced too', async (p, h, t) => {
	await mixed(p);
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file('Find/2 Two.md')}).then(() => 1)`);
	await p.sleep(900);
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor({ line: e.lineCount() - 1, ch: 0 }); e.replaceRange('Typed Mara, not yet saved.\\n', { line: e.lineCount() - 1, ch: 0 }); return 1; })()`);
	// back to the binder view
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(300);
	await ask(p, 'Mara', 'Maren');
	const n = await p.ev(`${BAR}.found.find(f => f.source.file.path === 'Find/2 Two.md')?.hits.length`);
	t.eq(n, 3, 'the unsaved typing is looked through (three: two saved, one typed)');
	await replaceAll(p);
	await p.sleep(400);
	await p.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('markdown')) await l.view.save?.(); })().then(() => 1)`);
	await p.sleep(2200);
	t.eq(disk(p, 'Find/2 Two.md'), '---\nstatus: idea\nsynopsis: Mara again.\n---\nOnly Maren here, and Maren there.\nTyped Maren, not yet saved.\n'.replace('Typed Maren, not yet saved.\n', '') + 'Typed Maren, not yet saved.\n', 'all three replaced, the typed line in its place');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === 'Find/2 Two.md').view.editor.getValue().includes('Typed Maren, not yet saved.')`), true, 'and the tab shows it');
});

test('a note deleted while the review is open is not made again and the others are replaced; typing since the search stops Replace one (nothing is replaced over it, nothing lost)', async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p, true, async () => { await p.ev(`app.vault.delete(${file('Find/2 Two.md')}).then(() => 1)`); await p.sleep(400); });
	await p.sleep(1500);
	await saveAll(p);
	t.eq(disk(p, 'Find/1 One.md'), MIXED_MAREN, 'the other is replaced');
	t.ok(!(await p.ev(`app.vault.adapter.exists('Find/2 Two.md')`)), 'the deleted note is not written back');
	t.ok(/left as it is/.test(await doneText(p) ?? ''), 'the bar counts it: ' + (await doneText(p)));
	// replace one over typing
	await p.ev(`(async () => { const f = ${file('Find/2 Two.md')}; if (!f) await app.vault.create('Find/2 Two.md', ${j(TWO)}); })().then(() => 1)`);
	await p.sleep(500);
	await ask(p, 'Maren', 'Marena');
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === 'Find/1 One.md'); const cm = s.live.cm; cm.dispatch({ changes: { from: cm.state.doc.length, insert: 'Typed just now.\\n' } }); return 1; })()`);
	await p.ev(`(async () => { await ${BAR}.replaceOne(); })().then(() => 1)`);
	await p.sleep(300);
	await saveAll(p);
	await p.sleep(2200);
	t.eq(disk(p, 'Find/1 One.md'), MIXED_MAREN + 'Typed just now.\n', 'nothing was replaced over the typing, and the typing is on disk');
});

test('Undo after further typing leaves the note typed in, puts the others back, and says how many were left', async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	// typing in the second note since
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === 'Find/2 Two.md'); const cm = s.live.cm; cm.dispatch({ changes: { from: cm.state.doc.length, insert: 'Typed since.\\n' } }); return 1; })()`);
	await p.sleep(300);
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')}).click()`);
	await p.sleep(1000);
	await saveAll(p);
	await p.sleep(2200);
	t.eq(disk(p, 'Find/1 One.md'), before['Find/1 One.md'], 'the untouched note is put back');
	const two = disk(p, 'Find/2 Two.md');
	t.ok(two.includes('Typed since.') && two.includes('Only Maren here'), 'the note typed in is left as it is, with what was typed: ' + JSON.stringify(two));
	t.ok(/Put back in 1 note\. 1 note was changed since, and left as it is\./.test(await doneText(p) ?? ''), 'and the bar says so: ' + (await doneText(p)));
});

test('replacing with nothing removes the matches, says Removed, and Undo puts them back; a replacement that holds the query is made once (no second pass)', async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', '');
	await replaceAll(p);
	await saveAll(p);
	t.ok(/^Removed \d+ in 2 notes\./.test(await doneText(p) ?? ''), 'says Removed: ' + (await doneText(p)));
	t.eq(disk(p, 'Find/2 Two.md'), '---\nstatus: idea\nsynopsis: Mara again.\n---\nOnly  here, and  there.\n', 'the second note, with the matches taken out and its properties as they were');
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')}).click()`);
	await p.sleep(900);
	await saveAll(p);
	onlyThese(t, before, vault(p));
	await ask(p, 'Mara', 'Mara Mara');
	await replaceAll(p);
	await saveAll(p);
	t.eq(disk(p, 'Find/2 Two.md'), '---\nstatus: idea\nsynopsis: Mara again.\n---\nOnly Mara Mara here, and Mara Mara there.\n', 'a replacement that holds the query is put in once');
});

test('Replace all: link targets, tags, embeds, code, comments and properties are not touched unless the query is written to match them', async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	const one = disk(p, 'Find/1 One.md');
	t.eq(one, MIXED_MAREN, 'the first note is the plain matches changed and nothing else');
	for (const kept of ['[[Mara]]', '[[Mara|Maren herself]]', '[[Mara#Storm]]', '![[Mara]]', '(Mara.md)', '#Mara,', '#Mara/sub', '`Mara`', '%% Mara %%', '<!-- Mara -->', '```\nMara in a fence\n```', 'synopsis: Mara in the synopsis.', 'label: Mara', '  - Mara']) t.ok(one.includes(kept), `“${kept}” is as it was`);
	// and written to match them, they are
	await ask(p, '[[Mara', '[[Maren');
	await replaceAll(p);
	await saveAll(p);
	t.eq(disk(p, 'Find/1 One.md'), MIXED_MAREN.replace('[[Mara]]', '[[Maren]]').replace('[[Mara|', '[[Maren|').replace('[[Mara#Storm]]', '[[Maren#Storm]]').replace('![[Mara]]', '![[Maren]]'), 'typed with its brackets, the links change: the plain, the aliased, the heading link and the embed');
	await ask(p, '#Mara', '#Maren');
	await replaceAll(p);
	await saveAll(p);
	t.ok(disk(p, 'Find/1 One.md').includes('a tag #Maren, and a path tag #Maren/sub.'), 'typed with its #, the tags change');
	await ask(p, '`Mara`', '`Maren`');
	await replaceAll(p);
	await saveAll(p);
	t.ok(disk(p, 'Find/1 One.md').includes('Code `Maren` inline'), 'typed with its backticks, the code changes');
	await ask(p, '%% Mara', '%% Maren');
	await replaceAll(p);
	await saveAll(p);
	t.ok(disk(p, 'Find/1 One.md').includes('%% Maren %%'), 'typed with its comment mark, the comment changes');
	const now = disk(p, 'Find/1 One.md');
	t.eq(front(now), front(MIXED), 'through all of it the properties are the same, byte for byte');
	t.ok(now.includes('```\nMara in a fence\n```') && now.includes('<!-- Mara -->'), 'and the fence and the HTML comment were never reached');
	void before;
});

test('a note with CRLF line breaks and a byte-order mark, not open anywhere, keeps both through a replace all, and the front matter and the line breaks are not touched', async (p, h, t) => {
	await binder(p, 'Odd', { '1 Plain': 'Mara.\n' });
	const crlf = '---\r\nstatus: draft\r\nsynopsis: Mara\r\n---\r\nMara walked.\r\nMara ran.\r\n';
	const bom = '﻿---\nstatus: draft\n---\nMara has a mark before her.\n';
	await p.ev(`(async () => { await app.vault.adapter.write('Odd/2 Crlf.md', ${j(crlf)}); await app.vault.adapter.write('Odd/3 Bom.md', ${j(bom)}); const c = app.vault.getAbstractFileByPath('Odd/Odd.md'); await app.vault.modify(c, '---\\nbinder: 1\\ncontents:\\n  - 1 Plain\\n  - 2 Crlf\\n  - 3 Bom\\n---\\n'); })().then(() => 1)`);
	await p.sleep(800);
	await openView(p, 'Odd');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(900);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	t.eq(await p.ev(`${BAR}.found.map(f => f.source.file.basename + ':' + f.hits.length).join(',')`), '1 Plain:1,2 Crlf:2,3 Bom:1', 'found, the properties not looked through');
	await replaceAll(p);
	await p.sleep(400);
	onlyThese(t, before, vault(p), { 'Odd/1 Plain.md': 'Maren.\n', 'Odd/2 Crlf.md': crlf.replace('Mara walked', 'Maren walked').replace('Mara ran', 'Maren ran'), 'Odd/3 Bom.md': bom.replace('Mara has', 'Maren has') });
});

test('a replacement that would turn the start of a note into properties is not made (the note keeps its text, and the bar counts it as left)', async (p, h, t) => {
	// "---\nfoo\n---" is a rule, a line and a rule: text. "foo: 1" in place of "foo" would make it the note's properties.
	await binder(p, 'Opens', { '1 A': '---\nfoo\n---\nMara and the rest.\n', '2 B': 'Also foo.\n' });
	await openView(p, 'Opens');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(900);
	const before = vault(p);
	await ask(p, 'foo', 'foo: 1');
	t.eq(await p.ev(`${BAR}.found.map(f => f.source.file.basename + ':' + f.hits.length).join(',')`), '1 A:1,2 B:1', 'both are found');
	await replaceAll(p);
	await p.sleep(300);
	const now = vault(p);
	t.eq(now['Opens/1 A.md'], before['Opens/1 A.md'], 'the note that would have become properties is left as it was');
	t.eq(now['Opens/2 B.md'], 'Also foo: 1.\n', 'the other, where it is only text, is replaced');
	t.ok(/1 note was left as it is: the replacement would have turned the start of it into properties/.test(await doneText(p) ?? ''), 'and the bar says why one was left: ' + (await doneText(p)));
});

test('a binder in a newer format cannot be replaced in: the bar says so, no replace row, nothing is written (the binder note included)', async (p, h, t) => {
	await mixed(p, 'Newer');
	await writeRaw(p, 'Newer/Newer.md', '---\nbinder: 99\ncontents:\n  - 1 One\n  - 2 Two\n---\nA newer binder.\n');
	await p.sleep(900);
	await p.ev(`(async () => { await ${B}.flush?.(); })().then(() => 1)`);
	const before = vault(p);
	await openView(p, 'Newer');
	await ask(p, 'Mara', 'Maren');
	t.ok(!(await p.ev(`document.querySelector(${j(BARSEL)}).classList.contains('mod-replace-mode')`)), 'no replace row');
	t.ok(/Nothing can be replaced here/.test(await doneText(p) ?? ''), 'it says why: ' + (await doneText(p)));
	await p.ev(`(async () => { await ${BAR}.replaceAll(); })().then(() => 1)`);
	t.eq(await p.ev(`!!document.querySelector('.modal.binders-find-review')`), false, 'Replace all does nothing even when asked by key');
	await p.sleep(400);
	onlyThese(t, before, vault(p));
});

test('a Longform binder: found and replaced in its scenes only; the index note, ignored notes and every property stay byte for byte; the snapshot is taken', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Harbor.md'), (x) => x + '\\nMara met the ferry at the harbor.\\n'); await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Return.md'), (x) => x + '\\nMara came back.\\n'); await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Notes on ferries.md'), (x) => x + '\\nMara is in an ignored note.\\n'); await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Index.md'), (x) => x + '\\nMara in the index.\\n'); })().then(() => 1)`);
	await p.sleep(900);
	await openView(p, 'Longform demo');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(900);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	t.eq(await p.ev(`${BAR}.found.map(f => f.source.file.basename).join(',')`), 'Harbor,Return', 'the scenes with a match; not the index, not an ignored note');
	await replaceAll(p);
	await p.sleep(400);
	const now = vault(p);
	onlyThese(t, before, now, { 'Longform demo/Harbor.md': before['Longform demo/Harbor.md'].replace('Mara met', 'Maren met'), 'Longform demo/Return.md': before['Longform demo/Return.md'].replace('Mara came', 'Maren came') });
	const s = await snapshots(p, 'Longform demo');
	t.ok(s.length === 1 && s[0].auto, 'a snapshot of the project was taken first');
});

test('Replace all in a binder view of a subfolder takes a snapshot of that folder, changes only its notes, and the review says folder', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part Two');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(800);
	const before = vault(p);
	await ask(p, 'the', 'THE');
	const n = await p.ev(`${BAR}.found.map(f => f.source.file.path)`);
	t.ok(n.length > 0 && n.every((f) => f.startsWith('The Lighthouse/Part Two/')), 'only its notes are in the plan: ' + n.join(', '));
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	t.ok(/A snapshot of the folder is taken first/.test(await reviewText(p)), 'the review says folder');
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(500);
	const now = vault(p);
	for (const [k, v] of Object.entries(before)) if (!n.includes(k)) t.eq(now[k], v, `“${k}” is untouched`);
	t.eq((await snapshots(p, 'The Lighthouse/Part Two')).filter((s) => s.auto).length, 1, 'a snapshot of the folder');
});

// =====================================================================================================================
// Focus mode
// =====================================================================================================================

async function focusWithNeighbours(p, path) {
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.focusShowNear = true; await pl.saveSettings(); })().then(() => 1)`).catch(() => {});
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(path)}).then(() => 1)`);
	await p.sleep(900);
}

test('focus mode with the scenes before and after showing: Binders’ bar looks through the shown excerpt of the scene before, the note and the shown excerpt of the scene after; replace works in the note only, with the note’s own snapshot', async (p, h, t) => {
	const settingName = 'focusNeighbours';
	t.ok(settingName.length > 0, 'the setting is there: ' + settingName);
	const key = settingName.split(',')[0];
	await p.ev(`(async () => { const pl = ${PL}; pl.settings[${j(key)}] = true; await pl.saveSettings(); })().then(() => 1)`);
	await p.ev(`(async () => { const f = ${file(KEEPER)}; await app.vault.process(f, (x) => x + '\\nThe keeper said Mara once.\\n'); const a = ${file(ARRIVAL)}; await app.vault.process(a, (x) => x + '\\nMara at the end of Arrival.\\n'); const s = ${file(STORM)}; await app.vault.process(s, (x) => x + '\\nMara in the storm.\\n'); })().then(() => 1)`);
	await p.sleep(600);
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(KEEPER)}).then(() => 1)`);
	await p.sleep(900);
	await p.ev(`(async () => { await ${PL}.focus.toggle(); })().then(() => 1)`);
	await p.sleep(1200);
	const near = await p.ev(`document.querySelectorAll('.binders-focus-near').length`);
	t.ok(near >= 1, 'the neighbours show: ' + near);
	const before = vault(p);
	await p.ev(`(() => { app.workspace.activeEditor.editor.focus(); return 1; })()`);
	await p.key('f', 'ctrl');
	await p.sleep(500);
	t.ok(await p.ev(`!!document.querySelector('.binders-find-in-note')`), 'Binders’ bar is in the note’s tab');
	await p.type('Mara');
	await p.sleep(600);
	const parts = await p.ev(`(() => { const v = app.workspace.getLeavesOfType('markdown')[0].view; const b = v.bindersFind(); return b.found.map(f => f.source.id + ':' + f.hits.length); })()`);
	t.ok(parts.some((x) => x.startsWith(KEEPER)) && parts.some((x) => x.startsWith('before') || x.startsWith('after')), 'it looked through the note and a neighbour: ' + parts.join(', '));
	await p.ev(`(() => { const b = app.workspace.getLeavesOfType('markdown')[0].view.bindersFind(); b.setReplacing(true); b.by.value = 'Maren'; return 1; })()`);
	await p.sleep(200);
	await p.ev(`(() => { window.__all = app.workspace.getLeavesOfType('markdown')[0].view.bindersFind().replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	t.ok(/A snapshot of the note is taken first/.test(await reviewText(p)), 'the review says the note’s snapshot is taken');
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(600);
	await p.ev(`(async () => { await app.workspace.getLeavesOfType('markdown')[0].view.save(); })().then(() => 1)`);
	await p.sleep(2200);
	const now = vault(p);
	const changed = Object.keys(now).filter((k) => now[k] !== before[k]);
	t.eq(j(changed), j([KEEPER]), 'only the note itself changed; the neighbours did not');
	t.ok(now[KEEPER].includes('The keeper said Maren once.'), 'its match is replaced');
	t.eq(await p.ev(`${PL}.snapshotsApi.list(${file('The Lighthouse')}).filter(s => s.auto).length`), 0, 'no snapshot of the whole folder was taken');
	const noteSnaps = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('The Lighthouse/Snapshots/Part One/The keeper/')).map(f => f.name)`);
	t.eq(noteSnaps.length, 1, 'the note’s own snapshot was: ' + noteSnaps.join(', '));
	t.ok(/Before replacing/.test(noteSnaps[0] ?? ''), 'named for the replace');
});

test('a note in its own tab with the scenes before and after not showing keeps Obsidian’s own bar', async (p, h, t) => {
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(KEEPER)}).then(() => 1)`);
	await p.sleep(800);
	await p.ev(`(() => { app.workspace.activeEditor.editor.focus(); return 1; })()`);
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.ok(await p.ev(`!document.querySelector('.binders-find-in-note') && !!document.querySelector('.document-search-container')`), 'Obsidian’s own');
	await p.key('Escape');
});

// =====================================================================================================================
// Where there are no browser highlights
// =====================================================================================================================

test('drawn text without CSS highlights (iOS before 17.2): each match is a mark in the page, taken off again before the next is drawn and when the bar closes, and the note’s text is never changed', async (p, h, t) => {
	await p.ev(`(() => { window.__hl = Object.getOwnPropertyDescriptor(CSS, 'highlights'); Object.defineProperty(CSS, 'highlights', { value: undefined, configurable: true }); return 1; })()`);
	try {
		const notes = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`S${String(i + 1).padStart(2, '0')}`, `Note ${i + 1} has a needle in it, and a second needle, #needle and \`needle\`.\n`]));
		await binder(p, 'Many', notes);
		const before = vault(p);
		await openView(p, 'Many');
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
		await settle(p);
		await ask(p, 'needle');
		await p.sleep(900);
		const drawn = await p.ev(`${M}.scenes.filter(s => !s.live && s.shown !== null).length`);
		t.ok(drawn > 3, 'there are sections drawn as text (' + drawn + ')');
		const marks = () => p.ev(`document.querySelectorAll(${j(LEAF + ' .binders-manuscript-rendered mark.binders-find-mark')}).length`);
		const n = await marks();
		// two real matches in each drawn section; a tag and code are not matches
		t.eq(n, drawn * 2, 'two marks in each drawn section (the tag and the code are not matches)');
		t.eq(await p.ev(`[...document.querySelectorAll(${j(LEAF + ' .binders-manuscript-rendered mark.binders-find-mark')})].every(m => m.textContent === 'needle')`), true, 'each is the word');
		t.eq(await p.ev(`getComputedStyle(document.querySelector(${j(LEAF + ' .binders-manuscript-rendered mark.binders-find-mark')})).backgroundColor !== 'rgba(0, 0, 0, 0)'`), true, 'and can be seen');
		await ask(p, 'second needle');
		await p.sleep(700);
		t.eq(await marks(), drawn, 'the next search takes the old marks off before it draws its own: one in each drawn section');
		await shot(p, 'no-highlights');
		await ask(p, 'zzz');
		await p.sleep(500);
		t.eq(await marks(), 0, 'a search with no match leaves none');
		await ask(p, 'needle');
		await p.sleep(600);
		await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
		await p.sleep(300);
		t.eq(await marks(), 0, 'closing the bar takes them off');
		t.eq(await p.ev(`document.querySelectorAll(${j(LEAF + ' .binders-manuscript-rendered mark')}).length`), 0, 'and nothing of ours is left in the page');
		await saveAll(p);
		onlyThese(t, before, vault(p));
	} finally {
		await p.ev(`(() => { Object.defineProperty(CSS, 'highlights', window.__hl); return 1; })()`).catch(() => {});
	}
});

test('drawn text with CSS highlights: the page is not changed (no marks), the matches are in the highlight registry', async (p, h, t) => {
	const notes = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`S${String(i + 1).padStart(2, '0')}`, `Note ${i + 1} has a needle in it.\n`]));
	await binder(p, 'Many', notes);
	await openView(p, 'Many');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await ask(p, 'needle');
	await p.sleep(900);
	t.eq(await p.ev(`document.querySelectorAll('mark.binders-find-mark').length`), 0, 'no marks in the page');
	t.ok((await p.ev(`CSS.highlights.get('binders-find')?.size ?? 0`)) > 3, 'but the matches are highlighted');
	await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
	await p.sleep(300);
	t.eq(await p.ev(`CSS.highlights.get('binders-find')?.size ?? 0`), 0, 'and gone when the bar closes');
});

// =====================================================================================================================
// A phone and a tablet
// =====================================================================================================================

const on = (size, fn) => async (p, h, t) => { await onDevice(p, size, () => fn(p, h, t)); };
const tapSel = async (p, sel) => { const at = await p.at(sel); if (!at) throw new Error('nothing to tap: ' + sel); await tap(p, at.x, at.y, 500); };
const rectOf = (p, sel) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; })()`);

test('phone: the view’s menu opens the bar, the bar’s buttons are finger-sized and all in the window, Next steps, Replace all by touch opens the review and the replace is made, Undo by touch puts it back, and the close button closes it', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await p.ev(`(() => { app.commands.executeCommandById('binders:find-replace'); return 1; })()`);
	await p.sleep(500);
	t.ok(await p.ev(`!!${BAR}`), 'the command opened it');
	await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
	await p.ev(`(() => { ${BAR}?.close(); return 1; })()`);
	await tapSel(p, `${LEAF} .view-header .view-actions .view-action:last-child, ${LEAF} .view-header .clickable-icon[aria-label="More options"]`);
	t.ok(await menuTap(p, 'Find and replace in binder'), 'the view’s menu has Find and replace in binder, and it was tapped');
	await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector(${j(BARSEL + '.mod-replace-mode')})`), 'the bar opened with its replace row');
	await ask(p, 'Mara', 'Maren');
	const w = await p.ev('innerWidth');
	for (const sel of ['button[aria-label^="Previous"]', 'button[aria-label^="Next"]', 'button[aria-label^="Match case"]', '.document-search-close-button', 'button[aria-label^="Replace"]', 'button[aria-label^="Replace all..."]']) {
		const r = await rectOf(p, `${BARSEL} ${sel}`);
		t.ok(!!r && r.l >= 0 && r.r <= w, `${sel} is in the window: ${j(r)}`);
		t.ok(!!r && r.w >= 28 && r.h >= 28, `${sel} can be touched: ${r?.w}×${r?.h}`);
	}
	t.ok(await p.ev(`document.documentElement.scrollWidth <= innerWidth`), 'the page does not scroll sideways');
	await shot(p, 'phone-bar');
	await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
	t.eq((await countText(p)).split(' ')[0], '2', 'Next by touch steps');
	await tapSel(p, `${BARSEL} button[aria-label^="Replace all..."]`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(400);
	const cta = await rectOf(p, '.modal.binders-find-review button.mod-cta');
	t.ok(!!cta && cta.r <= w && cta.l >= 0 && cta.h >= 28, 'the review’s button is in the window and can be touched: ' + j(cta));
	await shot(p, 'phone-review');
	await tapSel(p, '.modal.binders-find-review button.mod-cta');
	await p.sleep(1000);
	await saveAll(p);
	const now = vault(p);
	t.eq(now['Find/1 One.md'], MIXED_MAREN, 'the replace was made, and only the matches');
	t.eq(front(now['Find/1 One.md']), front(MIXED), 'properties untouched');
	await shot(p, 'phone-done');
	await tapSel(p, `${BARSEL} .binders-find-undo`);
	await p.sleep(900);
	await saveAll(p);
	onlyThese(t, before, vault(p));
	await tapSel(p, `${BARSEL} .document-search-close-button`);
	t.ok(!(await p.ev(`!!${BAR}`)), 'the close button closes the bar');
}));

test('phone: on the corkboard and the outliner the bar is the width of the view, lights what matches, and a tap on Next selects the next lit card', on(PHONE, async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	for (const mode of ['corkboard', 'outliner']) {
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await p.sleep(900);
		await ask(p, 'the');
		const bar = await rectOf(p, BARSEL), view = await rectOf(p, `${LEAF} .binders-view`);
		t.ok(bar && view && bar.l <= view.l + 8 && bar.r >= view.r - 8, `the bar is the width of the view in the ${mode}: ${j(bar)} in ${j(view)}`);
		t.ok((await p.ev(`document.querySelectorAll(${j(LEAF + ' .is-find-hit')}).length`)) > 0, 'something is lit');
		await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
		await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
	}
}));

test('tablet: the bar over the manuscript is in the note’s column and the review dialog fits; Replace all by touch works', on(TABLET, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara', 'Maren');
	const bar = await rectOf(p, `${BARSEL} .document-search`), w = await p.ev('innerWidth');
	t.ok(bar.r <= w && bar.l >= 0, 'the bar is in the window: ' + j(bar));
	t.ok(bar.w < w - 100, 'and is the note’s column, not the whole width: ' + bar.w + ' of ' + w);
	await tapSel(p, `${BARSEL} button[aria-label^="Replace all..."]`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(400);
	const m = await rectOf(p, '.modal.binders-find-review');
	t.ok(m && m.l >= 0 && m.r <= w, 'the review fits the window: ' + j(m));
	await shot(p, 'tablet-review');
	await tapSel(p, '.modal.binders-find-review button.mod-cta');
	await p.sleep(1000);
	await saveAll(p);
	t.eq(disk(p, 'Find/1 One.md'), MIXED_MAREN, 'replaced by touch');
}));
