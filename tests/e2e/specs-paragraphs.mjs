// Paragraphs in a binder's notes (src/paragraphs/): a line begun with a tab shown as a paragraph, not code ("Start a
// paragraph with a tab", on to begin with), and a first-line indent for a paragraph that follows another ("Indent
// paragraphs", off to begin with). Showing a note either way writes nothing: every test that looks also reads the disk.
// The one thing that writes is a link in a tab paragraph following a rename, and those tests compare the whole note.
import { readFileSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, file, j, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'paragraphs: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md', S = L + 'Part One/Storm warning.md', PRO = L + 'Prologue.md';
const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\nplotlines:\n  - Mara\n---\n';
const LEAF = '.workspace-leaf.mod-active';
const sleep = (p, ms) => p.sleep(ms);

const set = (p, o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveSettings(); return 1; })()`);
const body = (p, path, text) => p.ev(`app.vault.modify(${file(path)}, ${j(FRONT + text)}).then(() => 1)`);
const open = async (p, path, mode = 'source', source = false) => {
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); await l.setViewState({ type: 'markdown', state: { file: ${j(path)}, mode: ${j(mode)}, source: ${source} } }); return 1; })()`);
	await sleep(p, 700);
};
/** The editor's lines under a root: their text, classes, inline style and what is in them. */
const lines = (p, root = LEAF) => p.ev(`[...document.querySelectorAll(${j(root + ' .cm-content > .cm-line')})].map(l => ({ text: l.textContent, cls: l.className, style: l.getAttribute('style') || '', code: !!l.querySelector('.cm-inline-code'), em: !!l.querySelector('.cm-em:not(.cm-formatting)'), strong: !!l.querySelector('.cm-strong:not(.cm-formatting)'), link: !!l.querySelector('.cm-hmd-internal-link'), nospell: [...l.querySelectorAll('[spellcheck="false"]')].some(e => e.textContent.trim().length > l.textContent.trim().length / 2), font: getComputedStyle(l.querySelector('span:not(.cm-indent):not(.cm-hmd-indented-code)') || l).fontFamily, indent: getComputedStyle(l).textIndent, tab: l.querySelector('.cm-indent')?.getBoundingClientRect().width ?? 0, guide: l.querySelector('.cm-indent') ? getComputedStyle(l.querySelector('.cm-indent'), '::before').content : '' }))`);
const line = async (p, starts, root = LEAF) => (await lines(p, root)).find((l) => l.text.trimStart().startsWith(starts));
const isProse = (t, l, what) => { t.ok(!!l, `${what}: the line is there`); t.ok(/binders-tab-paragraph/.test(l.cls), `${what}: marked as a tab paragraph (${l.cls})`); t.ok(!l.code, `${what}: not set as code`); t.ok(!l.nospell, `${what}: spell-check is on`); t.ok(!/text-indent/.test(l.style), `${what}: wrapped lines aren’t hung under the tab (${l.style})`); };
const isCode = (t, l, what) => { t.ok(!!l, `${what}: the line is there`); t.ok(!/binders-tab-paragraph/.test(l.cls), `${what}: not marked (${l.cls})`); t.ok(l.code, `${what}: set as code, as Obsidian has it`); };
const errors = (p) => p.errors.filter((e) => !/Electron Security/.test(e));

const TABS = '\tThe boat left *her* on the **jetty**, by [[The keeper|the lamp]].\n\tIt did not wait for a mispeled word.\n\nPlain paragraph.\n\tA tabbed line under it.\n\n```\n\tfenced\n```\n\n- an item\n\n\tthe item’s second paragraph\n';

// ---- A: a tab starts a paragraph ----

test('a line begun with a tab is a paragraph in live preview and in source mode: body font, emphasis and a link read, spell-check on, wrapped lines at the margin; the note on disk keeps its tabs', async (p, h, t) => {
	await body(p, A, TABS);
	for (const source of [false, true]) {
		const what = source ? 'source mode' : 'live preview';
		await open(p, A, 'source', source);
		await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
		const first = await line(p, 'The boat left'), second = await line(p, 'It did not wait'), plain = await line(p, 'Plain paragraph');
		isProse(t, first, what); isProse(t, second, `${what}, the line after`);
		t.ok(first.em && first.strong && first.link, `${what}: emphasis, bold and the link are read (${j(first)})`);
		t.eq(first.font, plain.font, `${what}: in the font of the text`);
		t.ok(Math.abs(first.tab - 24) < 1.5, `${what}: the tab is the paragraph indent, 1.5em (${first.tab}px)`);
		t.ok(first.guide === 'none' || first.guide === 'normal', `${what}: no indentation guide drawn in it (${first.guide})`);
		// what was never code, and what still is
		const lazy = await line(p, 'A tabbed line under it'), fenced = await line(p, 'fenced'), item = await line(p, 'the item');
		t.ok(!lazy.code, `${what}: a tabbed line that carries on a paragraph is prose, as it was`);
		t.ok(/HyperMD-codeblock/.test(fenced.cls), `${what}: a fenced block is code still`);
		t.ok(!/binders-tab-paragraph/.test(item.cls), `${what}: under a list item the indent is the list’s (${item.cls})`);
	}
	t.eq(await read(p, A), FRONT + TABS, 'the note on disk is as it was written, tabs and all');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('four spaces at the start of a line are a tab', async (p, h, t) => {
	await body(p, A, '    Four spaces and *stress*.\n');
	await open(p, A);
	await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
	const l = await line(p, 'Four spaces');
	isProse(t, l, 'four spaces'); t.ok(l.em, 'emphasis is read');
	t.eq(await read(p, A), FRONT + '    Four spaces and *stress*.\n', 'the spaces are still in the note');
});

test('in the manuscript a section’s tab lines are paragraphs', async (p, h, t) => {
	await body(p, A, TABS);
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-manuscript .cm-line.binders-tab-paragraph')`, 8000);
	const first = await line(p, 'The boat left', '.binders-manuscript');
	isProse(t, first, 'the manuscript'); t.ok(first.em && first.link, 'emphasis and the link are read');
	t.eq(await read(p, A), FRONT + TABS, 'the note on disk is as it was');
});

const reading = (p, root = LEAF + ' .markdown-reading-view') => p.ev(`(() => { const r = document.querySelector(${j(root)}); if (!r) return null; const ps = [...r.querySelectorAll('p')].map(e => ({ text: e.textContent, tab: e.classList.contains('binders-tab-paragraph'), indent: getComputedStyle(e).textIndent, em: !!e.querySelector('em'), link: !!e.querySelector('a.internal-link'), mark: e.querySelectorAll('.binders-tab').length, font: getComputedStyle(e).fontFamily })); return { ps, pres: [...r.querySelectorAll('pre:not(.frontmatter)')].map(e => e.textContent) }; })()`);

test('reading view shows the paragraphs, not a code block: emphasis and the link are there, a fenced block is code still, and a tabbed line inside a paragraph has its tab', async (p, h, t) => {
	await body(p, A, TABS);
	await open(p, A, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p.binders-tab-paragraph')})`);
	const r = await reading(p);
	const first = r.ps.find((x) => x.text.startsWith('The boat left')), second = r.ps.find((x) => x.text.startsWith('It did not wait')), plain = r.ps.find((x) => x.text.startsWith('Plain paragraph'));
	t.ok(first?.tab && second?.tab, 'each tab line is a paragraph of its own');
	t.ok(first.em && first.link, 'with its emphasis and its link');
	t.eq(first.indent, '24px', 'indented by the paragraph indent');
	t.eq(first.font, plain.font, 'in the font of the text');
	t.eq(plain.mark, 1, 'the tabbed line under a plain one has its tab back');
	t.eq(r.pres.length, 1, 'one code block is left: ' + j(r.pres));
	t.ok(/fenced/.test(r.pres[0]), 'the fenced one');
	t.eq(await read(p, A), FRONT + TABS, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('a note embedded in another shows its tab lines as paragraphs', async (p, h, t) => {
	await body(p, A, '\tEmbedded with *stress*.\n');
	await p.ev(`app.vault.modify(${file(PRO)}, 'Before.\\n\\n![[Arrival]]\\n\\nAfter.\\n').then(() => 1)`);
	await open(p, PRO, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-embed p.binders-tab-paragraph')})`, 6000);
	const r = await reading(p);
	t.ok(r.ps.some((x) => x.tab && x.em && x.text.startsWith('Embedded')), 'the embedded paragraph, with its emphasis: ' + j(r.ps));
	t.eq(r.pres.length, 0, 'no code block');
});

test('a note outside a binder is untouched: its tab lines are code in the editor and in reading view', async (p, h, t) => {
	await p.ev(`app.vault.create('Loose.md', '\\tA tab outside a binder, *plain*.\\n').then(() => 1)`);
	await open(p, 'Loose.md');
	isCode(t, await line(p, 'A tab outside'), 'the editor');
	t.ok(!(await p.ev(`document.querySelector(${j(LEAF + ' .cm-editor')}).classList.contains('binders-prose')`)), 'the editor isn’t marked');
	await open(p, 'Loose.md', 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view pre')})`);
	const r = await reading(p);
	t.eq(r.pres.length, 1, 'reading view has its code block');
	// and the same tab of the app shows a binder's note as prose again, and the loose one as code again
	await body(p, A, '\tIn a binder.\n');
	await open(p, A);
	await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
	isProse(t, await line(p, 'In a binder'), 'a binder’s note opened in the same tab');
	await open(p, 'Loose.md');
	await until(p, `!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
	isCode(t, await line(p, 'A tab outside'), 'the loose note opened in it again');
});

test('the switch turns open editors over at once, both ways, and writes nothing', async (p, h, t) => {
	await body(p, A, TABS);
	await open(p, A);
	await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
	await set(p, { tabParagraphs: false });
	await until(p, `!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
	isCode(t, await line(p, 'The boat left'), 'switched off');
	await set(p, { tabParagraphs: true });
	await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
	isProse(t, await line(p, 'The boat left'), 'switched on again');
	t.eq(await read(p, A), FRONT + TABS, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('where Obsidian’s Markdown mode isn’t the one known, tab lines stay code and nothing breaks (the fallback)', async (p, h, t) => {
	await body(p, A, TABS);
	await set(p, { tabParagraphs: false });
	await open(p, A);
	// the editor's own language, with the state its mode starts from changed under it
	await p.ev(`(() => { const pl = ${PL}, lang = pl.paragraphs.languageOf(app.workspace.activeEditor.editor.cm); window.__lang = lang; window.__start = lang.streamParser.startState; lang.streamParser.startState = function (u) { const s = window.__start.call(this, u); const o = {}; for (const k of Object.keys(s)) o[k === 'indentation' ? 'indent' : k] = s[k]; return o; }; pl.paragraphs.forget(lang); return 1; })()`);
	try {
		await set(p, { tabParagraphs: true });
		await sleep(p, 600);
		isCode(t, await line(p, 'The boat left'), 'with a mode whose state has other fields');
		await p.key('End'); await p.type(' typed');
		await sleep(p, 300);
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	} finally {
		await p.ev(`(() => { window.__lang.streamParser.startState = window.__start; ${PL}.paragraphs.forget(window.__lang); delete window.__lang; delete window.__start; return 1; })()`);
	}
	await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
	isProse(t, await line(p, 'It did not wait'), 'with the mode as it was again');
});

test('typing, Enter, Tab, undo and an edit from outside leave exactly what was typed on disk, tabs included', async (p, h, t) => {
	await body(p, A, 'First paragraph.\n');
	await open(p, A);
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); const l = e.lastLine(); e.setCursor(l, e.getLine(l).length); return 1; })()`);
	await p.key('Enter'); await p.key('Tab'); await p.type('Typed after a tab, with *stress*.');
	await p.key('Enter'); await p.type('The line after Enter.');
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x.endsWith('The line after Enter.'))`, 6000);
	const typed = FRONT + 'First paragraph.\n\n\tTyped after a tab, with *stress*.\n\tThe line after Enter.';
	t.eq(await read(p, A), typed, 'what was typed, with the tab Tab put there and the tab Enter carried on');
	isProse(t, await line(p, 'Typed after a tab'), 'the typed line'); isProse(t, await line(p, 'The line after Enter'), 'the line after Enter');
	// Tab at the start of a line that has text
	await p.key('Enter'); await p.type('Tabbed afterwards.'); await p.key('Home'); await p.key('Home'); await p.key('Tab');
	await sleep(p, 300);
	const now = await p.ev(`app.workspace.activeEditor.editor.getValue()`);
	// undo, a step at a time, back to the text as it was opened: nothing but what was typed is taken away
	for (let i = 0; i < 40 && (await p.ev(`app.workspace.activeEditor.editor.getValue()`)) !== FRONT + 'First paragraph.\n'; i++) { await p.ev(`(() => { app.workspace.activeEditor.editor.undo(); return 1; })()`); await sleep(p, 30); }
	t.eq(await p.ev(`app.workspace.activeEditor.editor.getValue()`), FRONT + 'First paragraph.\n', 'undo goes back to the note as it was opened');
	for (let i = 0; i < 40 && (await p.ev(`app.workspace.activeEditor.editor.getValue()`)) !== now; i++) { await p.ev(`(() => { app.workspace.activeEditor.editor.redo(); return 1; })()`); await sleep(p, 30); }
	t.eq(await p.ev(`app.workspace.activeEditor.editor.getValue()`), now, 'and redo forward to all of it');
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(now)})`, 6000);
	t.eq(await read(p, A), now, 'which is what is on disk');
	// written from outside (a sync, another app): the editor takes it, and shows its tab line as a paragraph
	const outside = now + '\n\n\tWritten from outside.\n';
	await writeRaw(p, A, outside);
	await until(p, `app.workspace.activeEditor.editor.getValue() === ${j(outside)}`, 6000);
	await until(p, `[...document.querySelectorAll(${j(LEAF + ' .cm-line.binders-tab-paragraph')})].some(l => l.textContent.includes('Written from outside'))`);
	await sleep(p, 2500);
	t.eq(await read(p, A), outside, 'and the note on disk is byte for byte what was written from outside');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ---- B: indent paragraphs ----

const PLAIN = 'First of the scene.\n\nSecond, which follows one.\n\nThird.\n\n## A heading\n\nAfter a heading.\n\nFollows it.\n\n---\n\nAfter a rule.\n\n- an item\n\nAfter a list.\n\n![[The keeper]]\n\nAfter an embed.\n\n\tBegun with a tab.\n\nAfter a tab paragraph.\n';
const WANT = { 'First of the scene': false, 'Second, which': true, Third: true, 'After a heading': false, 'Follows it': true, 'After a rule': false, 'After a list': false, 'After an embed': false, 'Begun with a tab': false, 'After a tab paragraph': true };

test('“Indent paragraphs” is off to begin with: no line is indented', async (p, h, t) => {
	await body(p, A, PLAIN);
	await open(p, A);
	await sleep(p, 500);
	t.eq(await p.ev(`document.querySelectorAll(${j(LEAF + ' .cm-line.binders-indented')}).length`), 0, 'in the editor');
	await open(p, A, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p')})`);
	const r = await reading(p);
	t.ok(r.ps.filter((x) => !x.tab).every((x) => x.indent === '0px'), 'in reading view: ' + j(r.ps.map((x) => x.indent)));
});

test('“Indent paragraphs”: in the editor a paragraph that follows a paragraph is set in; the first one, and one after a heading, a rule, a list or an embed, is not; nothing is written', async (p, h, t) => {
	await body(p, A, PLAIN);
	await set(p, { indentParagraphs: true });
	for (const source of [false, true]) {
		await open(p, A, 'source', source);
		await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-indented')})`);
		for (const [starts, want] of Object.entries(WANT)) {
			const l = await line(p, starts);
			t.ok(!!l, `${starts}: the line is there`);
			t.eq(/binders-indented/.test(l.cls), want, `${source ? 'source mode' : 'live preview'}: “${starts}” ${want ? 'is' : 'is not'} indented`);
			if (want) t.eq(l.indent, '24px', `“${starts}”: by the paragraph indent`);
		}
	}
	// typed: a new paragraph after one is indented as soon as it is there
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); const l = e.lastLine(); e.setCursor(l, e.getLine(l).length); return 1; })()`);
	await p.key('Enter'); await p.type('Typed now.');
	await until(p, `[...document.querySelectorAll(${j(LEAF + ' .cm-line.binders-indented')})].some(l => l.textContent === 'Typed now.')`);
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x.endsWith('Typed now.'))`, 6000);
	t.eq(await read(p, A), FRONT + PLAIN + '\nTyped now.', 'the note on disk has what was typed and nothing else');
	await set(p, { indentParagraphs: false });
	await until(p, `!document.querySelector(${j(LEAF + ' .cm-line.binders-indented')})`);
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('“Indent paragraphs” in reading view: the same paragraphs are set in, and one begun with a tab isn’t set in twice', async (p, h, t) => {
	await body(p, A, PLAIN);
	await set(p, { indentParagraphs: true });
	await open(p, A, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p.binders-tab-paragraph')})`);
	await sleep(p, 400);
	const r = await reading(p);
	for (const [starts, want] of Object.entries(WANT)) {
		const x = r.ps.find((e) => e.text.startsWith(starts));
		t.ok(!!x, `${starts}: the paragraph is there`);
		// (the one begun with a tab has its own indent, the same measure)
		t.eq(x.indent, want || starts === 'Begun with a tab' ? '24px' : '0px', `“${starts}” ${want ? 'is' : 'is not'} indented`);
	}
	t.eq(await read(p, A), FRONT + PLAIN, 'the note on disk is as it was');
});

test('“Indent paragraphs” in the manuscript: each scene starts flush, and a paragraph that follows one is set in', async (p, h, t) => {
	await body(p, A, 'First of the scene.\n\nSecond.\n');
	await set(p, { indentParagraphs: true });
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-manuscript .cm-line.binders-indented')`, 8000);
	const all = await lines(p, '.binders-manuscript');
	t.ok(!/binders-indented/.test(all.find((l) => l.text.startsWith('First of the scene')).cls), 'the scene’s first paragraph is flush');
	t.ok(/binders-indented/.test(all.find((l) => l.text === 'Second.').cls), 'the second is set in');
	const firsts = await p.ev(`[...document.querySelectorAll('.binders-manuscript .cm-content')].map(c => [...c.querySelectorAll(':scope > .cm-line')].find(l => l.textContent.trim())?.className ?? '')`);
	t.ok(firsts.length > 0 && firsts.every((c) => !/binders-indented/.test(c)), 'every scene that is an editor starts flush: ' + j(firsts));
	const shown = await p.ev(`[...document.querySelectorAll('.binders-manuscript-rendered > p:first-child')].map(e => getComputedStyle(e).textIndent)`);
	t.ok(shown.every((x) => x === '0px'), 'and every scene that is shown as text: ' + j(shown));
	t.eq(await read(p, A), FRONT + 'First of the scene.\n\nSecond.\n', 'the note on disk is as it was');
});

// ---- links in tab paragraphs follow a rename ----

const settled = async (p) => { await sleep(p, 300); await p.ev(`${PL}.paragraphs.renamesSettled().then(() => 1)`); await sleep(p, 300); await p.ev(`${PL}.paragraphs.renamesSettled().then(() => 1)`); };
const rename = async (p, from, to) => { await p.ev(`app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => 1)`); await settled(p); };
const W = L + 'Part One/The warden.md';
const LINKS = (k) => `Plain [[${k}]].\n\n\tTab [[${k}]], [[${k}|him]], [[${k}#Past|then]], ![[${k}]] and [md](<${k}.md>).\n\tIn backticks \`[[The keeper]]\`, and [[Storm warning]].\n\n\`\`\`\n\t[[The keeper]]\n\`\`\`\n\nPlain again.\n\tUnder it [[${k}]].\n`;

test('a link in a tab paragraph follows a rename: only the note it names changes, in every kind of link; code and every other byte stay; a tabbed line under a plain one, which Obsidian updates itself, isn’t done twice', async (p, h, t) => {
	await body(p, A, LINKS('The keeper'));
	await sleep(p, 800);
	t.ok(!(await p.ev(`(app.metadataCache.getFileCache(${file(A)}).links || []).some(l => l.position.start.line === 8)`)), 'Obsidian’s index has no link on the tab line: without Binders it would be left');
	await rename(p, K, W);
	t.eq(await read(p, A), FRONT + LINKS('The warden'), 'the note, byte for byte');
	// and back
	await rename(p, W, K);
	t.eq(await read(p, A), FRONT + LINKS('The keeper'), 'renamed back: as it began');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('links in tab paragraphs are left alone with the setting off, with Obsidian’s “Automatically update internal links” off, and in a note outside a binder', async (p, h, t) => {
	const text = '\tTab [[The keeper]].\n';
	await body(p, A, text);
	await p.ev(`app.vault.create('Loose.md', ${j(text)}).then(() => 1)`);
	await sleep(p, 800);
	await set(p, { tabParagraphs: false });
	await rename(p, K, W);
	t.eq(await read(p, A), FRONT + text, 'with “Start a paragraph with a tab” off: as it was');
	await rename(p, W, K);
	await set(p, { tabParagraphs: true });
	await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', false); return 1; })()`);
	try {
		await rename(p, K, W);
		t.eq(await read(p, A), FRONT + text, 'with Obsidian set not to update links: as it was');
		await rename(p, W, K);
	} finally { await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', true); return 1; })()`); }
	await rename(p, K, W);
	t.eq(await read(p, A), FRONT + '\tTab [[The warden]].\n', 'with both on, the binder’s note follows');
	t.eq(await read(p, 'Loose.md'), text, 'and the note outside a binder is as it was');
});

test('a link that could have meant another note of the same name is left as it is', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Elsewhere'); await app.vault.create('Elsewhere/The keeper.md', 'Another keeper.\\n'); return 1; })()`);
	const text = '\tBy name [[The keeper]]; by its folder [[Part One/The keeper]].\n';
	await body(p, A, text);
	await sleep(p, 800);
	await rename(p, K, W);
	const now = await read(p, A);
	t.ok(now.includes('By name [[The keeper]];'), 'the bare name, which two notes had, is left: ' + j(now));
	t.ok(!now.includes('[[Part One/The keeper]]'), 'the link by folder and name, which only one had, follows: ' + j(now));
	t.eq(now.replace(/by its folder \[\[[^\]]*\]\]/, 'by its folder [[Part One/The keeper]]'), FRONT + text, 'and nothing else in the note changed');
});

test('a folder renamed, a note moved, and two renames in a row: the links come out right', async (p, h, t) => {
	const text = (k, s) => `\tTo [[${k}]] and [[${s}]].\n`;
	await body(p, PRO, text('The keeper', 'Storm warning'));
	await sleep(p, 800);
	// two renames, the second before the first has been followed
	await p.ev(`(async () => { await app.fileManager.renameFile(${file(K)}, ${j(W)}); await app.fileManager.renameFile(${file(W)}, ${j(L + 'Part One/The watchman.md')}); return 1; })()`);
	await settled(p);
	t.eq(await read(p, PRO), FRONT + text('The watchman', 'Storm warning'), 'two renames in a row: the link has the last name');
	// the folder both notes are in, renamed (a rename for each file in it); links by name still lead there
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One')}, ${j(L + 'Book One')}).then(() => 1)`);
	await settled(p);
	const after = await read(p, PRO);
	t.ok(after.endsWith(text('The watchman', 'Storm warning')), 'a folder renamed: links by name are as they were, and still lead to the notes: ' + j(after));
	t.eq(await p.ev(`app.metadataCache.getFirstLinkpathDest('The watchman', ${j(PRO)})?.path`), L + 'Book One/The watchman.md', 'the name leads to the moved note');
	// a link by path does change with the folder
	await p.ev(`app.vault.modify(${file(PRO)}, ${j('\tBy path [[The Lighthouse/Book One/The watchman]] and [[Book One/Storm warning|storm]].\n')}).then(() => 1)`);
	await sleep(p, 800);
	await p.ev(`app.fileManager.renameFile(${file(L + 'Book One')}, ${j(L + 'Part One')}).then(() => 1)`);
	await settled(p);
	const moved = await read(p, PRO);
	t.eq(await p.ev(`(() => { const out = []; for (const m of ${j(moved)}.matchAll(/\\[\\[([^\\]|]*)/g)) out.push(app.metadataCache.getFirstLinkpathDest(m[1], ${j(PRO)})?.path ?? null); return out.join(', '); })()`), `${L}Part One/The watchman.md, ${L}Part One/Storm warning.md`, 'links by path lead to the notes in the renamed folder: ' + j(moved));
	t.ok(moved.includes('|storm]]'), 'the shown text is kept');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('a folder of notes renamed at once: every link by path into it follows, from notes inside it and outside, links by name stay, and each note is as it was but for those', async (p, h, t) => {
	// six notes in a folder, and links to them from a note outside the folder and from one of the six
	const names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + 'Part Three')}); for (const n of ${j(names)}) await app.vault.create(${j(L + 'Part Three/')} + n + '.md', '\\tScene ' + n + '.\\n'); return 1; })()`);
	const links = (dir) => names.map((n) => `\tBy path [[The Lighthouse/${dir}/${n}]], by folder [[${dir}/${n}|${n}]], by name [[${n}]].\n`).join('\n') + '\nPlain [[The keeper]] line.\n';
	// (a link is written again the way the vault writes links, the shortest that leads there, as Obsidian does it)
	const after = names.map((n) => `\tBy path [[${n}]], by folder [[${n}|${n}]], by name [[${n}]].\n`).join('\n') + '\nPlain [[The keeper]] line.\n';
	await body(p, A, links('Part Three'));
	await p.ev(`app.vault.modify(${file(L + 'Part Three/One.md')}, ${j(links('Part Three'))}).then(() => 1)`);
	await until(p, `(app.metadataCache.getFileCache(${file(L + 'Part Three/One.md')})?.sections || []).some(s => s.type === 'code')`, 6000);
	await sleep(p, 600);
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part Three')}, ${j(L + 'Part Four')}).then(() => 1)`);
	await settled(p);
	t.eq(await read(p, A), FRONT + after, 'the note outside the folder: every link by path leads into the renamed folder, and nothing else changed');
	t.eq(await read(p, L + 'Part Four/One.md'), after, 'a note that moved with the folder: its links too');
	t.eq(await read(p, L + 'Part Four/Two.md'), '\tScene Two.\n', 'a note with no links is as it was');
	const dead = await p.ev(`(() => { const out = []; for (const m of ${j(after)}.matchAll(/\\[\\[([^\\]|]*)/g)) if (!app.metadataCache.getFirstLinkpathDest(m[1], ${j(A)})) out.push(m[1]); return out; })()`);
	t.eq(dead.length, 0, 'every link leads to a note: ' + j(dead));
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('a note open with unsaved typing keeps the typing, the link follows, and undo still takes the typing back', async (p, h, t) => {
	const text = '\tTab [[The keeper]].\n';
	await body(p, A, text);
	await open(p, A);
	await sleep(p, 600);
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); const l = e.lastLine(); e.setCursor(l, e.getLine(l).length); return 1; })()`);
	await p.type('Just typed.');
	// renamed at once, before the editor has saved
	await rename(p, K, W);
	const want = FRONT + '\tTab [[The warden]].\nJust typed.';
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(want)})`, 8000);
	t.eq(await read(p, A), want, 'on disk: the typing and the new name');
	await until(p, `app.workspace.activeEditor.editor.getValue() === ${j(want)}`, 6000);
	t.eq(await p.ev(`app.workspace.activeEditor.editor.getValue()`), want, 'and in the editor');
	// undo: the typing goes; nothing else is lost
	for (let i = 0; i < 20 && (await p.ev(`app.workspace.activeEditor.editor.getValue()`)).includes('Just typed.'); i++) { await p.ev(`(() => { app.workspace.activeEditor.editor.undo(); return 1; })()`); await sleep(p, 40); }
	const undone = await p.ev(`app.workspace.activeEditor.editor.getValue()`);
	t.ok(!undone.includes('Just typed.'), 'undo takes the typing back: ' + j(undone));
	t.ok(undone.startsWith(FRONT + '\tTab [['), 'and the rest of the note is there: ' + j(undone));
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('Windows line endings, a byte-order mark and no last line break are kept when a link follows a rename; and what was written from outside a moment before is kept', async (p, h, t) => {
	const raw = (k) => `\uFEFF---\r\nstatus: draft\r\n---\r\n\tTab [[${k}]] and [[${k}|shown]].\r\n\r\n\tLast line [[${k}#Part]]`;
	await writeRaw(p, A, raw('The keeper'));
	await until(p, `(app.metadataCache.getFileCache(${file(A)})?.sections || []).some(s => s.type === 'code')`, 6000);
	// (an outside write, then the rename straight after it)
	await writeRaw(p, PRO, '\tOutside [[The keeper]].\n\nWritten a moment ago.\n');
	await until(p, `(app.metadataCache.getFileCache(${file(PRO)})?.sections || []).some(s => s.type === 'code')`, 6000);
	await rename(p, K, W);
	const bytes = (s) => [...Buffer.from(s, 'utf8')].join(',');
	t.eq([...readFileSync(join(p.vaultDir, A))].join(','), bytes(raw('The warden')), 'byte for byte, but for the note the links name: ' + j(await read(p, A)));
	t.eq(await read(p, PRO), '\tOutside [[The warden]].\n\nWritten a moment ago.\n', 'the note written from outside has all of it, and the new name');
});

// ---- what Binders renders itself: the manuscript's sections that aren't editors, the snapshots dialog, focus mode ----

const shownAsProse = (p, sel) => p.ev(`(() => { const e = [...document.querySelectorAll(${j(sel)})].find(x => x.textContent.includes('Rendered by Binders')); if (!e) return null; return { tabs: e.querySelectorAll('.binders-tab').length, pres: e.querySelectorAll('pre').length, em: !!e.querySelector('em'), tabWidth: e.querySelector('.binders-tab')?.getBoundingClientRect().width ?? 0, fenced: [...e.querySelectorAll('pre')].map(x => x.querySelector('code')?.textContent.trim()).join('|') }; })()`);
const RENDERED = '\tRendered by Binders, with *stress*.\n\tAnd a second line.\n\n```\n\tfenced\n```\n';
const proseThere = (t, got, where) => {
	t.ok(!!got, `${where}: the text is shown`);
	t.eq(got.tabs, 2, `${where}: both tab lines have their indent`);
	t.ok(got.em, `${where}: emphasis is read`);
	t.eq(got.fenced, 'fenced', `${where}: the only code block is the fenced one`);
	t.ok(Math.abs(got.tabWidth - 24) < 1.5, `${where}: the indent is the paragraph indent (${got.tabWidth}px)`);
};

test('the snapshots dialog shows a note’s tab lines as paragraphs', async (p, h, t) => {
	await body(p, A, RENDERED);
	await open(p, A);
	// (with a snapshot to show: a note with none gets a small dialog with no text in it)
	await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`);
	await sleep(p, 400);
	await p.ev(`(async () => { await ${PL}.binders.snapshotsSettle(); await ${PL}.binders.flush(); return 1; })()`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
	await until(p, `[...document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-text')].some(e => e.textContent.includes('Rendered by Binders'))`, 8000);
	try { proseThere(t, await shownAsProse(p, '.modal.binders-snapshots .binders-snapshots-text'), 'the dialog'); }
	finally { await p.key('Escape'); await sleep(p, 300); }
	t.eq(await read(p, A), FRONT + RENDERED, 'the note on disk is as it was');
});

test('focus mode’s scene before shows its tab lines as paragraphs', async (p, h, t) => {
	await body(p, A, RENDERED);
	await set(p, { focusNeighbours: true });
	await open(p, K);
	await h.run('focus');
	try {
		await until(p, `[...document.querySelectorAll('.binders-focus-near-text')].some(e => e.textContent.includes('Rendered by Binders'))`, 8000);
		proseThere(t, await shownAsProse(p, '.binders-focus-near-text'), 'the scene before');
	} finally { await h.run('focus'); await sleep(p, 900); }
	t.eq(await read(p, A), FRONT + RENDERED, 'the note on disk is as it was');
});
