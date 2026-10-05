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
