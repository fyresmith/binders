// QA round 11: renames and links, never lose writing. Notes and folders renamed and moved from the views, the explorer and
// the API, with "Automatically update internal links" on and off; links on tab-led lines (src/paragraphs/rename.ts), their
// aliases, headings, block references and embeds; renames while a note is open with unsaved typing; chains A -> B -> A; a
// rename between a move and its undo; snapshots following. Tests named "BUG: " fail on purpose until the bug is fixed.
import { B, NOTE, PL, VIEW, answer, card, file, j, openView, read, until, viewState, withTidy, writeRaw, contents, flush, texts } from './view-helpers.mjs';
import { cmd } from './specs-qa4-explorer.mjs';
import { rows as explorerRows, row, rightClick, pick } from './specs-qa4-explorer.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 links: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md', S = L + 'Part One/Storm warning.md', PRO = L + 'Prologue.md', EPI = L + 'Epilogue.md';
const WRECK = L + 'Part Two/The wreck.md';
const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\nplotlines:\n  - Mara\n---\n';
const sleep = (p, ms) => p.sleep(ms);
const errors = (p) => p.errors.filter((e) => !/Electron Security/.test(e));

const set = (p, o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveSettings(); return 1; })()`);
const put = (p, path, text) => p.ev(`app.vault.modify(${file(path)}, ${j(text)}).then(() => 1)`);
/** Waits until Obsidian's index has read a tab line as code in a note (so a link there is not one to it). */
const indexed = (p, path) => until(p, `(app.metadataCache.getFileCache(${file(path)})?.sections || []).some(s => s.type === 'code')`, 6000);
const settled = async (p) => { await sleep(p, 300); await p.ev(`${PL}.paragraphs.renamesSettled().then(() => 1)`); await sleep(p, 300); await p.ev(`${PL}.paragraphs.renamesSettled().then(() => 1)`); };
const rename = async (p, from, to) => { await p.ev(`app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => 1)`); await settled(p); };
/** Where each link of a text leads, from a note. */
const leads = (p, text, from) => p.ev(`(() => { const out = []; for (const m of ${j(text)}.matchAll(/\\[\\[!?([^\\]|#\\\\]*)/g)) out.push(app.metadataCache.getFirstLinkpathDest(m[1].trim(), ${j(from)})?.path ?? null); return out; })()`);
const undoMove = async (p) => { const ok = await cmd(p, 'undo-move'); await sleep(p, 600); return ok; };
const noHistory = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
const seedSnap = async (p, dir, name, body, of) => {
	await p.ev(`(async () => { let at = ''; for (const part of ${j(dir)}.split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); } await app.vault.create(${j(`${dir}/${name}.snapshot`)}, ${j(`---\nsnapshot-of: ${JSON.stringify(of)}\ntaken: 2026-09-12T09:15:40\n---\n${body}`)}); })().then(() => 1)`);
};
const listDir = (p, dir) => p.ev(`app.vault.adapter.exists(${j(dir)}).then(ok => ok ? app.vault.adapter.list(${j(dir)}).then(l => l.files.map(f => f.slice(${dir.length + 1})).sort()) : [])`);

// ---- 1. every shape of link on a tab line ----

const SHAPES = (k) => [
	`\tBlock [[${k}#^blk|the block]] and heading [[${k}#Past#Deeper|deep]] and bare [[${k}#Past]].`,
	`\tEmbed block ![[${k}#^blk]] and embed heading ![[${k}#Past]] and sized ![[${k}|100]].`,
	`\tSpaces [[${k}]] and an escaped bar in a table way [[${k}\\|shown]].`,
	`\tTwice [[${k}]][[${k}]] and a [[${k}]]'s end.`,
	`\tMarkdown [m](${k.replace(/ /g, '%20')}.md#Past) and angled [m](<${k}.md#^blk>) and web [w](https://example.com/${k.replace(/ /g, '%20')}.md).`,
	`\tNo target change for [[#Own heading]] or [[Storm warning#Past|storm]] or [[Nowhere at all]].`,
].join('\n') + '\n';

test('every shape of link on a tab line follows: block and heading parts, embeds, spaces, an escaped bar, markdown links; web links and other notes untouched; byte for byte', async (p, h, t) => {
	await put(p, A, FRONT + SHAPES('The keeper'));
	await indexed(p, A);
	await sleep(p, 500);
	await rename(p, K, L + 'Part One/The warden.md');
	const got = await read(p, A);
	const want = FRONT + SHAPES('The warden').replace('https://example.com/The%20warden.md', 'https://example.com/The%20keeper.md');
	t.eq(got, want, 'the note, byte for byte, with only the keeper’s name changed');
	// and back, A -> B -> A
	await rename(p, L + 'Part One/The warden.md', K);
	t.eq(await read(p, A), FRONT + SHAPES('The keeper'), 'renamed back: exactly as it began');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('NIT: a link written with spaces inside its brackets keeps them (the target only changes, byte for byte)', async (p, h, t) => {
	await put(p, A, FRONT + '\tSpaced [[ The keeper ]] and [[The keeper ]].\n');
	await indexed(p, A);
	await sleep(p, 500);
	await rename(p, K, L + 'Part One/The warden.md');
	t.eq(await read(p, A), FRONT + '\tSpaced [[ The warden ]] and [[The warden ]].\n', 'the spaces round the target stay');
});

// ---- 2. a tab line that is a list item's continuation (Obsidian reads it as a list paragraph: not ours) ----

test('a tab-led continuation of a list item, and a four-space line under a list: Obsidian updates them, Binders does not do it twice', async (p, h, t) => {
	const text = (k) => `- an item with [[${k}]]\n\n\tthe item’s second paragraph, [[${k}|shown]].\n\n    four spaces and [[${k}]] after a list.\n\nPlain.\n\n\tA real tab paragraph with [[${k}]].\n`;
	await put(p, A, FRONT + text('The keeper'));
	await indexed(p, A);
	await sleep(p, 600);
	await rename(p, K, L + 'Part One/The warden.md');
	const got = await read(p, A);
	t.eq(got, FRONT + text('The warden'), 'every link says the new name once: ' + j(got));
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ---- 3. the rename done through the writer's own tools ----

test('renamed from a card’s title with F2 in the corkboard: a tab link, a plain link and a frontmatter link all follow, nothing else changes', async (p, h, t) => {
	const text = (k) => `Plain [[${k}]].\n\n\tTabbed [[${k}]].\n`;
	const front = (k) => FRONT.replace('plotlines:', `related: "[[${k}]]"\nplotlines:`);
	await put(p, PRO, front('The keeper') + text('The keeper'));
	await indexed(p, PRO);
	await sleep(p, 500);
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await until(p, `!!document.querySelector(${j(card(K))})`, 6000);
	await p.ev(`document.querySelector(${j(card(K))}).focus()`);
	await p.key('F2');
	await sleep(p, 200);
	await p.key('a', 'ctrl');
	await p.type('The warden');
	await p.key('Enter');
	await sleep(p, 500);
	await settled(p);
	t.ok(await p.ev(`!!${file(L + 'Part One/The warden.md')}`), 'the note is renamed');
	t.eq(await read(p, PRO), front('The warden') + text('The warden'), 'the note that links to it, byte for byte');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('renamed from the explorer’s own Rename (context menu, typed name, Enter): the tab link follows', async (p, h, t) => {
	await put(p, PRO, '\tTabbed [[The keeper]] and [[The keeper|him]].\n');
	await indexed(p, PRO);
	await sleep(p, 500);
	await explorerRows(p);
	await rightClick(p, K);
	const titles = await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
	const name = titles.find((x) => /^Rename/.test(x));
	t.ok(!!name, 'the menu has Rename: ' + titles.join(', '));
	await pick(p, name);
	await sleep(p, 200);
	await p.key('a', 'ctrl');
	await p.type('The warden');
	await p.key('Enter');
	await sleep(p, 600);
	await settled(p);
	t.ok(await p.ev(`!!${file(L + 'Part One/The warden.md')}`), 'renamed');
	t.eq(await read(p, PRO), '\tTabbed [[The warden]] and [[The warden|him]].\n', 'the tab link follows');
});

// ---- 4. chains ----

test('A to B to A and A to B to C, fired one after the other without waiting: the tab links come out right and every other byte stays', async (p, h, t) => {
	const text = (k) => `${FRONT}\tTab [[${k}]] and [[${k}#Past|then]].\n\nPlain [[${k}]].\n`;
	await put(p, EPI, text('The keeper'));
	await indexed(p, EPI);
	await sleep(p, 500);
	await p.ev(`(async () => { const fm = app.fileManager; await fm.renameFile(${file(K)}, ${j(L + 'Part One/Mid.md')}); await fm.renameFile(${file('The Lighthouse/Part One/Mid.md')}, ${j(K)}); return 1; })()`);
	await settled(p);
	t.eq(await read(p, EPI), text('The keeper'), 'there and back at once: as it was');
	await p.ev(`(async () => { const fm = app.fileManager; await fm.renameFile(${file(K)}, ${j(L + 'Part One/Mid.md')}); await fm.renameFile(${file(L + 'Part One/Mid.md')}, ${j(L + 'Part Two/Final.md')}); await fm.renameFile(${file(L + 'Part Two/Final.md')}, ${j(L + 'Part One/Last.md')}); return 1; })()`);
	await settled(p);
	t.eq(await read(p, EPI), text('Last'), 'three renames and a move at once: the last name');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('a new note takes the name of the one just renamed away: the tab link goes with the note it named, not the newcomer', async (p, h, t) => {
	await put(p, PRO, '\tThe keeper is [[The keeper]].\n');
	await indexed(p, PRO);
	await sleep(p, 500);
	await p.ev(`(async () => { await app.fileManager.renameFile(${file(K)}, ${j(L + 'Part One/The warden.md')}); await app.vault.create(${j(K)}, 'A new keeper.\\n'); return 1; })()`);
	await settled(p);
	const got = await read(p, PRO);
	// the link meant the old keeper, now the warden; a newcomer of the old name must not keep it
	t.eq(j(await leads(p, got, PRO)), j([L + 'Part One/The warden.md']), 'the link still leads to the note it was written for: ' + j(got));
	t.eq(await read(p, K), 'A new keeper.\n', 'and the newcomer is untouched');
});

// ---- 5. ambiguity after the move ----

test('a note renamed to the name another note has elsewhere: the tab link becomes a path that leads to it, not an ambiguous name', async (p, h, t) => {
	await put(p, PRO, '\tIt is [[The keeper]].\n');
	await indexed(p, PRO);
	await sleep(p, 500);
	await rename(p, K, L + 'Part Two/Lights out 2.md');
	await rename(p, L + 'Part Two/Lights out 2.md', L + 'Part Two/Storm warning.md');
	const got = await read(p, PRO);
	t.eq(j(await leads(p, got, PRO)), j([L + 'Part Two/Storm warning.md']), 'it leads to the note: ' + j(got));
	t.eq(await read(p, S) !== undefined, true, 'the other Storm warning is there');
});

test('the odd names: a case-only rename, parentheses and an ampersand, a percent sign, accents; markdown and wiki links follow and lead there', async (p, h, t) => {
	const text = (k, md) => `${FRONT}\tWiki [[${k}]] and md [m](${md}).\n`;
	await put(p, PRO, text('The keeper', '<The keeper.md>'));
	await indexed(p, PRO);
	await sleep(p, 500);
	const cases = [['The Keeper', 'The%20Keeper.md'], ['Keeper (draft) & 100% sure', 'Keeper%20%28draft%29%20%26%20100%25%20sure.md'], ['Café ünï ✓', 'Caf%C3%A9%20%C3%BCn%C3%AF%20%E2%9C%93.md']];
	let at = K;
	for (const [name] of cases) {
		const to = L + 'Part One/' + name + '.md';
		await rename(p, at, to);
		at = to;
		const got = await read(p, PRO);
		t.eq(j(await leads(p, got, PRO)), j([to]), `“${name}”: the wiki link leads to it: ${j(got)}`);
		const md = /\[m\]\((.*)\)/.exec(got)?.[1] ?? '';
		const dec = await p.ev(`(() => { try { const angled = /^<.*>$/.test(${j(md)}), t = ${j(md)}.replace(/^<|>$/g, ''); return app.metadataCache.getFirstLinkpathDest((angled ? t : decodeURIComponent(t)).replace(/\\.md$/, ''), ${j(PRO)})?.path ?? null; } catch (e) { return 'throws ' + e.message; } })()`);
		t.eq(dec, to, `“${name}”: the markdown link leads to it: ${md}`);
	}
	t.eq((await read(p, PRO)).startsWith(FRONT), true, 'the note’s head is untouched');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('a name that no link can spell (a hash in it): the tab link is left whole, not half-rewritten, and the note still opens its text', async (p, h, t) => {
	const text = '\tLink [[The keeper]] and [m](<The keeper.md>).\n';
	await put(p, PRO, text);
	await indexed(p, PRO);
	await sleep(p, 500);
	await rename(p, K, L + 'Part One/Act #2.md');
	const got = await read(p, PRO);
	t.ok(got === text || /Act/.test(got), 'either left alone or pointed at the new note: ' + j(got));
	t.ok(!/\[\[[^\]]*\n/.test(got) && got.endsWith('.\n') && got.startsWith('\tLink'), 'but never mangled: ' + j(got));
	t.eq(await read(p, L + 'Part One/Act #2.md') !== undefined, true, 'the renamed note is there');
});

// ---- 6. moves ----

test('a folder moved into another folder, a note moved to the binder’s top: path links on tab lines follow from inside and outside, the text of the moved notes is kept', async (p, h, t) => {
	const text = `${FRONT}\tBy path [[The Lighthouse/Part Two/The wreck]], by folder [[Part Two/Lights out|out]], by name [[The wreck]].\n`;
	await put(p, PRO, text);
	await put(p, WRECK, FRONT + '\tFrom the wreck: [[Part One/The keeper]] and [[The Lighthouse/Part One/Storm warning]].\n');
	await indexed(p, PRO); await indexed(p, WRECK);
	await sleep(p, 500);
	await rename(p, L + 'Part Two', L + 'Part One/Part Two');
	const now = await read(p, PRO);
	t.eq(j(await leads(p, now, PRO)), j([L + 'Part One/Part Two/The wreck.md', L + 'Part One/Part Two/Lights out.md', L + 'Part One/Part Two/The wreck.md']), 'the outside note: every link leads into the moved folder: ' + j(now));
	t.ok(now.startsWith(FRONT) && /\|out\]\]/.test(now), 'the alias is kept: ' + j(now));
	const inner = await read(p, L + 'Part One/Part Two/The wreck.md');
	t.eq(j(await leads(p, inner, L + 'Part One/Part Two/The wreck.md')), j([K, S]), 'the moved note’s own links still lead to the keeper and the storm: ' + j(inner));
	t.ok(inner.startsWith(FRONT + '\tFrom the wreck: [['), 'and nothing else of it changed');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('a note moved to a folder outside the binder and back: the tab link is not rewritten into nonsense, and the text is never lost', async (p, h, t) => {
	await p.ev(`app.vault.createFolder('Elsewhere').then(() => 1)`);
	const text = '\tOut [[The keeper]] and [[Part One/The keeper|k]].\n';
	await put(p, PRO, text);
	await indexed(p, PRO);
	await sleep(p, 500);
	const before = await read(p, K);
	await rename(p, K, 'Elsewhere/The keeper.md');
	const out = await read(p, PRO);
	t.eq(j(await leads(p, out, PRO)), j(['Elsewhere/The keeper.md', 'Elsewhere/The keeper.md']), 'links lead to it where it went: ' + j(out));
	await rename(p, 'Elsewhere/The keeper.md', K);
	const back = await read(p, PRO);
	t.eq(j(await leads(p, back, PRO)), j([K, K]), 'and back: ' + j(back));
	t.eq(await read(p, K), before, 'the moved note’s own text is whole');
});

// ---- 7. a rename between a move and its undo ----

test('a move, then the note is renamed, then Undo last move: the note goes back to its place under its new name; nothing is made twice or lost', async (p, h, t) => {
	await noHistory(p);
	const order = () => p.ev(`${B}.orderedChildren(${file(L + 'Part One')}).map(f => f.name)`);
	const before = await order();
	const text = await read(p, K);
	await p.ev(`${B}.put([${file(K)}], ${file(L + 'Part Two')}, ${file(WRECK)}).then(() => 1)`);
	await sleep(p, 500);
	await put(p, PRO, '\tTab [[The keeper]].\n');
	await sleep(p, 300);
	await rename(p, L + 'Part Two/The keeper.md', L + 'Part Two/The warden.md');
	t.ok(await undoMove(p), 'there is a move to undo');
	await settled(p);
	t.eq(await p.ev(`!!${file(L + 'Part One/The warden.md')}`), true, 'back in Part One, under its new name');
	t.eq(await p.ev(`!!${file(L + 'Part One/The keeper.md')} || !!${file(L + 'Part Two/The keeper.md')} || !!${file(L + 'Part Two/The warden.md')}`), false, 'and nowhere else');
	t.eq(await read(p, L + 'Part One/The warden.md'), text, 'text whole');
	t.eq(j(await order()), j(before.map((x) => (x === 'The keeper.md' ? 'The warden.md' : x))), 'in the same place in the order');
	t.eq(await read(p, PRO), '\tTab [[The warden]].\n', 'the tab link says the new name');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('an Undo of a move whose note was renamed and then renamed back: still lands in the right place, and Redo too', async (p, h, t) => {
	await noHistory(p);
	await p.ev(`${B}.put([${file(K)}], ${file(L + 'Part Two')}, null).then(() => 1)`);
	await sleep(p, 500);
	await rename(p, L + 'Part Two/The keeper.md', L + 'Part Two/Temp.md');
	await rename(p, L + 'Part Two/Temp.md', L + 'Part Two/The keeper.md');
	t.ok(await undoMove(p), 'undo');
	t.eq(await p.ev(`!!${file(K)}`), true, 'it is back in Part One');
	t.ok(await cmd(p, 'redo-move'), 'redo is offered');
	await sleep(p, 600);
	t.eq(await p.ev(`!!${file(L + 'Part Two/The keeper.md')}`), true, 'redo moves it to Part Two again');
});

// ---- 8. the binder's own record of the order ----

test('the binder note’s list follows renames to names YAML would misread (true, 1984, null, colon, dash, hash, quotes) and back; the order of the others is kept', async (p, h, t) => {
	const names = ['true', '1984', 'null', 'a, b', '- dash', 'with "quotes"', "it's", 'yes', '~', 'x #y'];
	let at = K;
	for (const n of names) {
		const to = L + 'Part One/' + n + '.md';
		await p.ev(`app.fileManager.renameFile(${file(at)}, ${j(to)}).then(() => 1)`);
		await flush(p);
		await sleep(p, 150);
		at = to;
		const list = await p.ev(`${B}.orderedChildren(${file(L + 'Part One')}).map(f => f.name)`);
		t.eq(j(list), j(['Arrival.md', n + '.md', 'Storm warning.md']), `“${n}”: the store has it in its place`);
		const front = await p.ev(`(async () => { await new Promise(r => setTimeout(r, 100)); const fm = app.metadataCache.getFileCache(${file(L + 'The Lighthouse.md')})?.frontmatter; return fm?.contents ?? null; })()`);
		t.ok(Array.isArray(front) && front.map(String).includes('Part One/' + n), `“${n}”: the binder note’s list parses to the name: ${j(front)}`);
		t.eq(front.length, 9, `“${n}”: still nine entries`);
	}
	await rename(p, at, K);
	t.eq(j(await contents(p, L + 'The Lighthouse.md')).includes('Part One/The keeper'), true, 'back to the keeper');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('the whole binder folder renamed and renamed back: its list, its notes’ text, its view and a tab link by path survive', async (p, h, t) => {
	const text = (d) => `${FRONT}\tBy path [[${d}/Part One/The keeper]] and by name [[The keeper]].\n`;
	const short = `${FRONT}\tBy path [[The keeper]] and by name [[The keeper]].\n`; // (links are written the shortest way, as Obsidian does)
	await put(p, EPI, text('The Lighthouse'));
	await indexed(p, EPI);
	await sleep(p, 500);
	const before = await texts(p);
	const head = await read(p, L + 'The Lighthouse.md');
	await openView(p, 'The Lighthouse');
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse')}, 'Beacon').then(() => 1)`);
	await settled(p); await flush(p); await sleep(p, 500);
	const e = await read(p, 'Beacon/Epilogue.md');
	t.eq(j(await leads(p, e, 'Beacon/Epilogue.md')), j(['Beacon/Part One/The keeper.md', 'Beacon/Part One/The keeper.md']), 'both links lead to the keeper in the renamed binder: ' + j(e));
	t.eq(await read(p, 'Beacon/Beacon.md'), head, 'the binder note was renamed with its folder and is byte for byte the same');
	const after = await texts(p);
	for (const [path, body] of Object.entries(before)) {
		if (!path.startsWith(L) || path === EPI) continue;
		t.eq(after['Beacon/' + path.slice(L.length).replace(/^The Lighthouse\.md$/, 'Beacon.md')], body, `“${path}” is whole`);
	}
	t.eq(await p.ev(`${B}.orderedChildren(${file('Beacon')}).map(f => f.name).join('|')`), 'Prologue.md|Part One|Part Two|Epilogue.md|Beacon.md'.replace('|Beacon.md', ''), 'the order is kept');
	await p.ev(`app.fileManager.renameFile(${file('Beacon')}, 'The Lighthouse').then(() => 1)`);
	await settled(p); await flush(p); await sleep(p, 500);
	t.eq(await read(p, EPI), short, 'renamed back: the links the shortest way, the rest as it began');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ---- 9. unsaved typing ----

test('the note that holds the tab link is a section in the manuscript with unsaved typing; the linked note is renamed; the typing and the link both survive and more typing still saves', async (p, h, t) => {
	await put(p, A, FRONT + '\tTab [[The keeper]].\n');
	await indexed(p, A);
	await sleep(p, 500);
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript .cm-content').length >= 3`, 8000);
	await sleep(p, 600);
	// put the cursor at the end of the Arrival section's text and type
	const ok = await p.ev(`(() => { const ed = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript .cm-content')].find(e => e.textContent.includes('Tab ')); if (!ed) return false; ed.focus(); const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); return true; })()`);
	t.ok(ok, 'found the section');
	await p.type(' First typing.');
	await p.ev(`app.fileManager.renameFile(${file(K)}, ${j(L + 'Part One/The warden.md')}).then(() => 1)`);
	await settled(p);
	await sleep(p, 1500);
	let disk = await read(p, A);
	t.ok(disk.includes('[[The warden]]'), 'the link follows: ' + j(disk));
	t.ok(disk.includes('First typing.'), 'the first typing was saved: ' + j(disk));
	await p.type(' Second typing.');
	await sleep(p, 2500);
	disk = await read(p, A);
	t.ok(disk.includes('First typing.') && disk.includes('Second typing.') && disk.includes('[[The warden]]'), 'and the typing after the rename too, with the link still new: ' + j(disk));
	t.eq((disk.match(/\[\[/g) || []).length, 1, 'one link, not doubled: ' + j(disk));
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('the renamed note itself is open in the manuscript with unsaved typing: the typing lands in the file under its new name, and no file of the old name comes back', async (p, h, t) => {
	await put(p, K, FRONT + 'The keeper climbed the stair.');
	await sleep(p, 500);
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript .cm-content').length >= 3`, 8000);
	await sleep(p, 600);
	const ok = await p.ev(`(() => { const ed = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript .cm-content')].find(e => e.textContent.includes('climbed the stair')); if (!ed) return false; ed.focus(); const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); return true; })()`);
	t.ok(ok, 'found the keeper’s section');
	await p.type(' Unsaved bit.');
	const W = L + 'Part One/The warden.md';
	await p.ev(`app.fileManager.renameFile(${file(K)}, ${j(W)}).then(() => 1)`);
	await sleep(p, 800);
	await p.type(' And more.');
	await sleep(p, 2500);
	const text = await read(p, W);
	t.ok(text.includes('Unsaved bit.') && text.includes('And more.'), 'both bits are in the renamed file: ' + j(text));
	t.eq(await p.ev(`app.vault.adapter.exists(${j(K)})`), false, 'no file of the old name came back');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ---- 10. outside the binder, other binders, switches ----

test('a tab link in a note of another binder follows (it is in a binder); one in a plain folder and in a canvas-like text file does not; plain links are Obsidian’s', async (p, h, t) => {
	const LF = 'Longform demo/Harbor.md';
	const text = (k) => `Plain [[${k}]].\n\n\tTab [[${k}]].\n`;
	const orig = await read(p, LF);
	await put(p, LF, orig.replace(/\s*$/, '\n') + text('The keeper'));
	await p.ev(`(async () => { await app.vault.createFolder('Loose'); await app.vault.create('Loose/Note.md', ${j(text('The keeper'))}); return 1; })()`);
	await indexed(p, LF);
	await sleep(p, 500);
	await rename(p, K, L + 'Part One/The warden.md');
	const got = await read(p, LF);
	t.ok(got.endsWith(text('The warden')), 'the other binder’s note: both links follow: ' + j(got.slice(-80)));
	t.eq(await read(p, 'Loose/Note.md'), 'Plain [[The warden]].\n\n\tTab [[The keeper]].\n', 'the plain folder’s note: Obsidian’s update only, the tab link is left');
});

/** Renames with Obsidian's own question ("Update links?", asked when it is set not to update on its own) answered. */
const renameAsking = async (p, from, to, button) => {
	await p.ev(`(() => { window.__r = app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => { window.__done = true; }); window.__done = false; return 1; })()`);
	const asked = await answer(p, button);
	await until(p, `window.__done === true`, 8000);
	await settled(p);
	return asked;
};
const LINK_TEXT = (k) => `Plain [[${k}]].\n\n\tTab [[${k}]] and [[Part One/${k}|k]].\n`;

test('with “Automatically update internal links” off and “Do not update” answered, no note’s text changes anywhere, in either kind of line', async (p, h, t) => {
	await put(p, PRO, LINK_TEXT('The keeper'));
	await indexed(p, PRO);
	await sleep(p, 500);
	await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', false); return 1; })()`);
	try {
		const before = await texts(p);
		t.ok(await renameAsking(p, K, L + 'Part One/The warden.md', 'Do not update'), 'Obsidian asked');
		await rename(p, L + 'Part Two', L + 'Part Three');
		await rename(p, L + 'Part Three', L + 'Part Two');
		const after = await texts(p);
		const moved = { [K]: L + 'Part One/The warden.md' };
		for (const [path, body] of Object.entries(before)) if (path !== NOTE) t.eq(after[moved[path] ?? path], body, `“${path}” is byte for byte as it was`);
	} finally { await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', true); return 1; })()`); }
});

test('with “Automatically update internal links” off and “Just once” answered, the plain links are updated and so is the tab link', async (p, h, t) => {
	await put(p, PRO, LINK_TEXT('The keeper'));
	await indexed(p, PRO);
	await sleep(p, 500);
	await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', false); return 1; })()`);
	try {
		t.ok(await renameAsking(p, K, L + 'Part One/The warden.md', 'Just once'), 'Obsidian asked');
		await sleep(p, 1000);
		const got = await read(p, PRO);
		t.ok(got.includes('Plain [[The warden]]'), 'Obsidian updated the plain link: ' + j(got));
		t.ok(/\n\tTab \[\[The warden\]\]/.test(got), 'and the tab line’s link follows too, as it does when Obsidian is set to update: ' + j(got));
	} finally { await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', true); return 1; })()`); }
});

test('a note renamed from outside Obsidian (the file system) while a tab link points at it: nothing of the link is rewritten and nothing is lost', async (p, h, t) => {
	const text = '\tTab [[The keeper]].\n';
	await put(p, PRO, text);
	await indexed(p, PRO);
	await sleep(p, 500);
	await p.ev(`app.vault.adapter.rename(${j(K)}, ${j(L + 'Part One/Outside.md')}).then(() => 1)`);
	await sleep(p, 2500);
	const got = await read(p, PRO);
	t.ok(got === text || got === '\tTab [[Outside]].\n', 'either as it was or pointed at the new name, never mangled: ' + j(got));
	t.ok(await p.ev(`!!${file(L + 'Part One/Outside.md')}`), 'the note is there under the new name');
});

// ---- 11. snapshots ----

test('snapshots follow a note through a case-only rename and a chain of renames, and a note renamed to the name of a note already gone that left snapshots: they sit side by side, none overwritten', async (p, h, t) => {
	const SN = L + 'Snapshots/Part One/';
	await seedSnap(p, SN + 'The keeper', '2026-09-12 09.15.40 One', 'Keeper one.\n', 'Part One/The keeper');
	await seedSnap(p, SN + 'Ghost', '2026-09-12 09.15.40 One', 'Ghost one, from a note deleted long ago.\n', 'Part One/Ghost');
	await rename(p, K, L + 'Part One/The Keeper.md');
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`); await sleep(p, 300);
	t.eq(j(await listDir(p, SN + 'The Keeper')), j(['2026-09-12 09.15.40 One.snapshot']), 'case-only rename: the snapshots are under the new name');
	t.eq(j(await listDir(p, SN + 'The keeper')), j([]), 'and not under the old (or the old folder is empty)');
	await rename(p, L + 'Part One/The Keeper.md', L + 'Part One/Ghost.md');
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`); await sleep(p, 300);
	const there = await listDir(p, SN + 'Ghost');
	t.eq(there.length, 2, 'both notes’ snapshots are kept, neither written over: ' + j(there));
	const bodies = [];
	for (const f of there) bodies.push(await read(p, SN + 'Ghost/' + f));
	t.ok(bodies.some((x) => x.includes('Keeper one.')) && bodies.some((x) => x.includes('Ghost one')), 'both texts are whole');
	await rename(p, L + 'Part One/Ghost.md', K);
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`); await sleep(p, 300);
	t.ok((await listDir(p, SN + 'The keeper')).length >= 1, 'back under the keeper after the way home');
});

test('a note with a snapshot, renamed twice at once from two places (the view’s API and the vault): the snapshot ends up with the note', async (p, h, t) => {
	const SN = L + 'Snapshots/Part One/';
	await seedSnap(p, SN + 'Arrival', '2026-09-12 09.15.40 One', 'Arrival one.\n', 'Part One/Arrival');
	await p.ev(`(async () => { await app.fileManager.renameFile(${file(A)}, ${j(L + 'Part One/Landing.md')}); await app.vault.rename(${file(L + 'Part One/Landing.md')}, ${j(L + 'Part Two/Landing.md')}); return 1; })()`);
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`); await sleep(p, 600);
	await flush(p);
	const where = await p.ev(`app.vault.getFiles().filter(f => f.extension === 'snapshot').map(f => f.path)`);
	t.eq(where.length, 1, 'one snapshot: ' + j(where));
	t.ok(/Landing\//.test(where[0] ?? ''), 'in the folder named for the note: ' + j(where));
	t.eq(await p.ev(`!!${file(L + 'Part Two/Landing.md')}`), true, 'the note is where it went');
});
