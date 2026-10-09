// Paragraphs in a binder's notes (src/paragraphs/): a line begun with a tab shown as a paragraph, not code ("Start a
// paragraph with a tab", on to begin with), and a first-line indent for a paragraph that follows another ("Indent
// paragraphs", off to begin with). Showing a note either way writes nothing: every test that looks also reads the disk.
// The one thing that writes is a link in a tab paragraph following a rename, and those tests compare the whole note.
import { readFileSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, file, j, openView, read, reload, until, withTidy, writeRaw } from './view-helpers.mjs';

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

// ---- A2: a tab on a line with nothing after it yet ----

/** Watches an editor (an expression for Obsidian's `Editor`) frame by frame, as it is painted: every line that starts
    with a tab (or four spaces) and isn't drawn as a paragraph's indent in some frame is noted, once each. In the notes
    these tests write, every such line is a writer's paragraph. */
const watch = (p, ed) => p.ev(`(() => { const cm = (${ed}).cm, w = window.__tabs = { bad: [], frames: 0, on: true };
	const f = () => { if (!w.on) return; w.frames++;
		for (const ln of cm.contentDOM.querySelectorAll(':scope > .cm-line')) { const text = ln.textContent; if (!/^(\\t| {4})/.test(text)) continue;
			const ind = [...ln.querySelectorAll('.cm-indent')], guide = ind.map(i => getComputedStyle(i, '::before').content), wide = ind.map(i => Math.round(i.getBoundingClientRect().width));
			if (ln.classList.contains('binders-tab-paragraph') && guide.every(g => g === 'none' || g === 'normal') && wide.every(x => x === 24) && !/text-indent/.test(ln.getAttribute('style') || '')) continue;
			const rec = JSON.stringify(text) + ' ' + ln.className + ' [' + (ln.getAttribute('style') || '') + '] indent ' + wide.join(',') + ' guide ' + guide.join(',');
			if (!w.bad.includes(rec)) w.bad.push(rec); }
		requestAnimationFrame(f); };
	f(); return 1; })()`);
const watched = async (p) => { await sleep(p, 120); return p.ev(`(() => { const w = window.__tabs; w.on = false; return { bad: w.bad, frames: w.frames }; })()`); };
/** The line the caret is on in an editor: its classes, its indent as drawn, and where the caret stands (and where the
    place one character back does), from the left edge of the text. */
const caretLine = (p, ed) => p.ev(`(() => { const cm = (${ed}).cm, head = cm.state.selection.main.head, at = cm.domAtPos(head).node, ln = (at.nodeType === 1 ? at : at.parentElement).closest('.cm-line');
	const left = cm.contentDOM.getBoundingClientRect().left + parseFloat(getComputedStyle(cm.contentDOM).paddingLeft || '0'), ind = [...ln.querySelectorAll('.cm-indent')];
	const x = (pos) => Math.round((cm.coordsAtPos(pos, 1) ?? cm.coordsAtPos(pos)).left - left);
	return { text: ln.textContent, cls: ln.className, style: ln.getAttribute('style') || '', wide: ind.map(i => Math.round(i.getBoundingClientRect().width)), guide: ind.map(i => getComputedStyle(i, '::before').content), x: x(head), back: head > cm.state.doc.lineAt(head).from ? x(head - 1) : null }; })()`);
const isIndent = (t, l, what, tabs = 1) => {
	t.ok(/binders-tab-paragraph/.test(l.cls), `${what}: the line is a paragraph’s (${l.cls})`);
	t.eq(j(l.wide), j(Array(tabs).fill(24)), `${what}: the tab is as wide as the paragraph indent`);
	t.ok(l.guide.every((g) => g === 'none' || g === 'normal'), `${what}: no guide line is drawn in it (${l.guide})`);
	t.ok(!/text-indent/.test(l.style), `${what}: the line isn’t hung under the tab (${l.style})`);
	t.eq(l.x, 24 * tabs, `${what}: the caret stands at the indent`);
};
const endOf = (p, ed) => p.ev(`(() => { const e = ${ed}; e.focus(); const l = e.lastLine(); e.setCursor(l, e.getLine(l).length); return 1; })()`);
const OWN = 'app.workspace.activeEditor.editor', SECTION = `${VIEW}.current.scenes.find(s => s.file.path === ${j(A)}).live.editor`;

/** Tab on an empty line, then a letter; Enter at the end of that paragraph, then a letter. */
const tabThenType = async (p, t, ed, what) => {
	await endOf(p, ed);
	await watch(p, ed);
	await p.key('Enter'); await p.key('Tab');
	await sleep(p, 250);
	const empty = await caretLine(p, ed);
	t.eq(empty.text, '\t', `${what}: Tab on an empty line types a tab`);
	isIndent(t, empty, `${what}, a tab and nothing after it`);
	await p.type('W');
	await sleep(p, 250);
	const first = await caretLine(p, ed);
	isIndent(t, { ...first, x: first.back }, `${what}, with its first letter`);
	t.eq(first.back, empty.x, `${what}: the first letter starts where the caret stood (${empty.x}px, then ${first.back}px)`);
	await p.type('ords.'); await p.key('Enter');
	await sleep(p, 250);
	const next = await caretLine(p, ed);
	t.eq(next.text, '\t', `${what}: Enter at the end of the paragraph carries the tab on`);
	isIndent(t, next, `${what}, the line Enter made`);
	await p.type('N');
	await sleep(p, 250);
	const second = await caretLine(p, ed);
	t.eq(second.back, next.x, `${what}: and its first letter starts where the caret stood (${next.x}px, then ${second.back}px)`);
	await p.type('ext.');
	const seen = await watched(p);
	t.ok(seen.frames > 10, `${what}: watched as it was drawn (${seen.frames} frames)`);
	t.eq(seen.bad.join(' | '), '', `${what}: in no frame was a tab drawn as anything but the indent`);
};

for (const source of [false, true]) {
	const what = source ? 'source mode' : 'live preview';
	test(`a tab on an empty line is the paragraph’s indent before a letter is typed, and so is the tab Enter carries on: no guide line, and the caret doesn’t move when the first letter comes (${what})`, async (p, h, t) => {
		await body(p, A, 'First paragraph.');
		await open(p, A, 'source', source);
		await tabThenType(p, t, OWN, what);
		const typed = FRONT + 'First paragraph.\n\tWords.\n\tNext.';
		await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(typed)})`, 6000);
		t.eq(await read(p, A), typed, 'what is on disk is what was typed, tabs and all');
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
}

test('a tab on an empty line is the paragraph’s indent before a letter is typed, in a section of the manuscript', async (p, h, t) => {
	await body(p, A, 'First paragraph.');
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!${VIEW}.current?.scenes?.find(s => s.file.path === ${j(A)})?.live?.cm`, 8000);
	await tabThenType(p, t, SECTION, 'the manuscript');
	const typed = FRONT + 'First paragraph.\n\tWords.\n\tNext.';
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(typed)})`, 6000);
	t.eq(await read(p, A), typed, 'what is on disk is what was typed, tabs and all');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('Tab on a tab, Backspace over a tab, Shift+Tab, Tab with the caret in the middle of a line and Tab on several lines: in no frame is a tab drawn as anything but the indent, and the note is what was typed', async (p, h, t) => {
	await body(p, A, 'First paragraph.\n\n\tSecond, begun with a tab.\n\nThird.');
	await open(p, A);
	await p.ev(`(() => { const e = ${OWN}; e.focus(); e.setCursor(8, e.getLine(8).length); return 1; })()`);
	await watch(p, OWN);
	const text = () => p.ev(`${OWN}.getValue()`), step = () => sleep(p, 200);
	await p.key('Enter'); await step();
	isIndent(t, await caretLine(p, OWN), 'the tab Enter carried on');
	await p.key('Tab'); await step();
	isIndent(t, await caretLine(p, OWN), 'Tab on the line that has its tab already: still one');
	await p.key('Backspace'); await step();
	const gone = await caretLine(p, OWN);
	t.eq(gone.text, '', 'Backspace takes the tab away');
	t.ok(!/binders/.test(gone.cls) && gone.x === 0, `and the empty line is an empty line (${gone.cls}, caret at ${gone.x}px)`);
	await p.key('Tab'); await step();
	isIndent(t, await caretLine(p, OWN), 'Tab on the empty line');
	await p.key('Tab', 'shift'); await step();
	const none = await caretLine(p, OWN);
	t.eq(none.text, '', 'Shift+Tab takes the tab away');
	t.ok(!/binders/.test(none.cls) && none.x === 0, `and the empty line is an empty line (${none.cls}, caret at ${none.x}px)`);
	await p.key('Tab'); await p.type('Fourth.'); await step();
	// the caret in the middle of a line: Obsidian's Tab indents the line
	await p.ev(`(() => { ${OWN}.setCursor(11, 3); return 1; })()`);
	await p.key('Tab'); await step();
	const mid = await caretLine(p, OWN);
	t.eq(mid.text, '\tThird.', 'Tab with the caret in a line of text indents the line');
	t.ok(/binders-tab-paragraph/.test(mid.cls) && j(mid.wide) === '[24]', `which is a tab paragraph at once (${mid.cls}, ${mid.wide})`);
	// several lines at once
	await p.ev(`(() => { ${OWN}.setSelection({ line: 6, ch: 2 }, { line: 11, ch: 3 }); return 1; })()`);
	await p.key('Tab'); await step();
	t.eq(await text(), FRONT + '\tFirst paragraph.\n\t\n\t\tSecond, begun with a tab.\n\t\tFourth.\n\t\n\t\tThird.', 'Tab on a selection of lines indents each, the empty ones too (as Obsidian has it)');
	await p.key('Tab', 'shift'); await step();
	const typed = FRONT + 'First paragraph.\n\n\tSecond, begun with a tab.\n\tFourth.\n\n\tThird.';
	t.eq(await text(), typed, 'and Shift+Tab takes one from each');
	const seen = await watched(p);
	t.eq(seen.bad.join(' | '), '', `in no frame was a tab drawn as anything but the indent (${seen.frames} frames)`);
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(typed)})`, 6000);
	t.eq(await read(p, A), typed, 'what is on disk is what was typed');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('four spaces fill the indent as a tab does, and a tab is the indent with Obsidian’s “Tab indent size” at 8: the caret doesn’t move when the first letter comes, and the line is as tall as any', async (p, h, t) => {
	const was = await p.ev(`[app.vault.getConfig('useTab') ?? true, app.vault.getConfig('tabSize') ?? 4]`);
	const config = (useTab, tabSize) => p.ev(`(() => { app.vault.setConfig('useTab', ${useTab}); app.vault.setConfig('tabSize', ${tabSize}); return 1; })()`);
	const tall = () => p.ev(`[...document.querySelectorAll(${j(LEAF + ' .cm-content > .cm-line')})].filter(l => l.textContent.trim()).map(l => Math.round(l.getBoundingClientRect().height))`);
	try {
		// "Indent using tabs" off: Tab types four spaces
		await config(false, 4);
		await body(p, A, 'First paragraph.');
		await open(p, A);
		await endOf(p, OWN);
		await watch(p, OWN);
		await p.key('Enter'); await p.key('Tab');
		await sleep(p, 250);
		const empty = await caretLine(p, OWN);
		t.eq(empty.text, '    ', 'with “Indent using tabs” off, Tab types four spaces');
		isIndent(t, empty, 'four spaces and nothing after them');
		await p.type('W');
		await sleep(p, 250);
		const first = await caretLine(p, OWN);
		t.eq(first.back, empty.x, `the first letter starts where the caret stood (${empty.x}px, then ${first.back}px)`);
		await p.type('ords.'); await p.key('Enter');
		await sleep(p, 250);
		isIndent(t, await caretLine(p, OWN), 'the spaces Enter carried on');
		await p.type('Next.');
		await sleep(p, 250);
		const heights = await tall();
		t.ok(heights.length === 3 && heights.every((x) => x === heights[0]), `a line begun with spaces is as tall as one that isn’t (${heights})`);
		const seen = await watched(p);
		t.eq(seen.bad.join(' | '), '', `in no frame were the spaces drawn as anything but the indent (${seen.frames} frames)`);
		const typed = FRONT + 'First paragraph.\n    Words.\n    Next.';
		await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(typed)})`, 6000);
		t.eq(await read(p, A), typed, 'what is on disk is what was typed, spaces and all');
		// a tab, with tabs as wide as eight spaces (with two, Obsidian's Tab types two tabs: two indents, as before)
		await config(true, 8);
		await body(p, A, 'First paragraph.');
		await open(p, K); await open(p, A);
		await tabThenType(p, t, OWN, 'a tab eight wide');
	} finally { await config(was[0], was[1]); }
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

/** Every line of white space only in the active editor (the properties' too, where they are lines), as it is drawn. */
const blanks = (p) => p.ev(`(async () => { const cm = app.workspace.activeEditor.editor.cm, out = [];
	for (const top of [0, 1e6, 0]) { cm.scrollDOM.scrollTop = top; await sleep(250);
		for (const ln of cm.contentDOM.querySelectorAll(':scope > .cm-line')) { if (!ln.textContent || ln.textContent.trim()) continue; const n = cm.state.doc.lineAt(cm.posAtDOM(ln)).number, ind = [...ln.querySelectorAll('.cm-indent')];
			out[n] = { n, text: ln.textContent, cls: ln.className.replace(/ ?cm-active/, ''), style: ln.getAttribute('style') || '', kids: [...ln.children].map(c => c.className + ' ' + Math.round(c.getBoundingClientRect().width) + ' ' + getComputedStyle(c, '::before').content).join(', '), wide: ind.map(i => Math.round(i.getBoundingClientRect().width)), guide: ind.map(i => getComputedStyle(i, '::before').content) }; } }
	return out.filter(Boolean); })()`);
// Lines of white space only. Ours (by line number): where a letter typed after the white space would make a tab
// paragraph. Not ours: in the properties, less than a tab, in a fenced block, straight under a quote, and under a list
// item (with a blank line between or without).
const WS_FRONT = '---\nstatus: revised\nlist:\n\t\n  - a\n---\n';
const WS = 'Plain one.\n\n\t\n\nPlain two.\n\t\nPlain three.\n\n# Heading\n\t\n\tTabbed text.\n\t\n\tMore.\n\n    \n\n\t\t\n\n   \n\n```\n\t\n```\n\n> quote\n\t\n> more\n\n- an item\n\t\n- another\n\n\t\n';
const OURS = [9, 12, 16, 18, 21, 23];

test('a line of white space only is drawn as a paragraph’s indent where a letter would make it one, and is left as Obsidian has it in the properties, a list, a quote, a fenced block, with the setting off, and outside a binder', async (p, h, t) => {
	const LOOSE = 'Loose blanks.md';
	await p.ev(`app.vault.modify(${file(A)}, ${j(WS_FRONT + WS)}).then(() => 1)`);
	await p.ev(`app.vault.create(${j(LOOSE)}, ${j(WS_FRONT + WS)}).then(() => 1)`);
	for (const source of [false, true]) {
		const what = source ? 'source mode' : 'live preview';
		// as Obsidian has them: the setting off
		await set(p, { tabParagraphs: false });
		await open(p, A, 'source', source);
		const plain = await blanks(p);
		t.ok(plain.length >= 11 && plain.every((l) => !/binders/.test(l.cls)), `${what}, the setting off: nothing of ours on any of them (${plain.length} lines)`);
		await set(p, { tabParagraphs: true });
		await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
		await sleep(p, 300);
		const got = await blanks(p);
		t.eq(got.length, plain.length, `${what}: the same lines are there`);
		for (const l of got) {
			const was = plain.find((x) => x.n === l.n);
			if (OURS.includes(l.n)) {
				t.ok(/binders-tab-paragraph/.test(l.cls), `${what}, line ${l.n} (${j(l.text)}): a paragraph’s indent (${l.cls})`);
				t.ok(l.wide.length > 0 && l.wide.every((x) => x === 24) && l.guide.every((g) => g === 'none' || g === 'normal') && !/text-indent/.test(l.style), `${what}, line ${l.n}: as wide as the indent, with no guide line: ${j(l)}`);
			} else t.eq(j(l), j(was), `${what}, line ${l.n} (${j(l.text)}): as Obsidian has it`);
		}
		// outside a binder
		await open(p, LOOSE, 'source', source);
		t.eq(j(await blanks(p)), j(plain), `${what}: in a note outside a binder every one is as Obsidian has it`);
	}
	t.eq(await read(p, A), WS_FRONT + WS, 'the note on disk is as it was');
	t.eq(await read(p, LOOSE), WS_FRONT + WS, 'and the one outside a binder');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ---- A3: an editor left alone follows its note into and out of a binder (no click or key to wake it) ----

/** The line that starts with this in any editor, with nothing touched: marked as a paragraph, or set as code. */
const untouched = (p, starts) => p.ev(`(() => { const l = [...document.querySelectorAll('.workspace-leaf .cm-content > .cm-line')].find(l => l.textContent.trimStart().startsWith(${j(starts)})); return l ? { marked: l.classList.contains('binders-tab-paragraph'), code: !!l.querySelector('.cm-inline-code') } : null; })()`);
const becomes = async (p, t, starts, prose, what) => {
	await until(p, `(() => { const l = [...document.querySelectorAll('.workspace-leaf .cm-content > .cm-line')].find(l => l.textContent.trimStart().startsWith(${j(starts)})); return !!l && l.classList.contains('binders-tab-paragraph') === ${prose}; })()`, 4000);
	const s = await untouched(p, starts);
	t.ok(!!s && s.marked === prose && s.code === !prose, `${what}: ${prose ? 'a paragraph' : 'code, as Obsidian has it'}, with nothing touched (${j(s)})`);
};

test('a binder’s note that is open when Obsidian starts shows its tab paragraphs as paragraphs without a click or a key', async (p, h, t) => {
	const text = FRONT + '\tOpen at the start, with *stress*.\n\nPlain.\n';
	await p.ev(`app.vault.modify(${file(A)}, ${j(text)}).then(() => 1)`);
	await open(p, A);
	await p.ev(`(async () => { await app.workspace.saveLayout?.(); app.workspace.requestSaveLayout?.(); return 1; })()`);
	await sleep(p, 2500);
	await reload(p);
	await until(p, `[...document.querySelectorAll('.workspace-leaf .cm-content > .cm-line')].some(l => l.textContent.includes('Open at the start'))`, 10000);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.file?.path).join()`), A, 'the note is open after the restart');
	await p.ev(`${PL}.binders.settled.then(() => 1)`);
	await becomes(p, t, 'Open at the start', true, 'after the restart');
	t.eq(await read(p, A), text, 'the note on disk is as it was');
});

test('a note moved into a binder while it is open becomes paragraphs, and moved out code again, without a click or a key; so does a folder made a binder, and one that stops being one', async (p, h, t) => {
	const text = '\tA line that moves.\n\nPlain.\n';
	await p.ev(`(async () => { await app.vault.create('Moves.md', ${j(text)}); await app.vault.createFolder('Loose folder'); await app.vault.create('Loose folder/Stays.md', ${j('\tA line that stays.\n')}); return 1; })()`);
	await open(p, 'Moves.md');
	await becomes(p, t, 'A line that moves', false, 'outside a binder');
	await p.ev(`app.fileManager.renameFile(${file('Moves.md')}, ${j(L + 'Part One/Moves.md')}).then(() => 1)`);
	await becomes(p, t, 'A line that moves', true, 'moved into the binder');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Moves.md')}, 'Moved out.md').then(() => 1)`);
	await becomes(p, t, 'A line that moves', false, 'moved out again');
	t.eq(await read(p, 'Moved out.md'), text, 'the note is as it was written');
	// a folder made a binder with one of its notes open, and its binder note deleted
	await open(p, 'Loose folder/Stays.md');
	await becomes(p, t, 'A line that stays', false, 'in a folder that is no binder');
	await p.ev(`${PL}.binders.makeBinder(${file('Loose folder')}).then(() => 1)`);
	await becomes(p, t, 'A line that stays', true, 'its folder made a binder');
	await p.ev(`(async () => { const b = ${PL}.binders; await app.vault.delete(b.folderNote(${file('Loose folder')})); return 1; })()`);
	await becomes(p, t, 'A line that stays', false, 'the binder note deleted');
	t.eq(await read(p, 'Loose folder/Stays.md'), '\tA line that stays.\n', 'the note is as it was written');
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

test('“Indent paragraphs”: on the empty line Enter makes after a paragraph the caret waits at the indent, so the first letter doesn’t move it; not after a heading; and Tab there is the same indent, never two', async (p, h, t) => {
	await body(p, A, '## A heading\n\nFirst paragraph.\n\nSecond.');
	await set(p, { indentParagraphs: true });
	await open(p, A);
	await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-indented')})`);
	// every frame: no line is set in twice (the indent and white space of its own), and none by anything but 0 or the indent
	await p.ev(`(() => { const cm = ${OWN}.cm, w = window.__twice = { bad: [], on: true };
		const f = () => { if (!w.on) return; for (const ln of cm.contentDOM.querySelectorAll(':scope > .cm-line')) { const ti = getComputedStyle(ln).textIndent, own = /^\\s/.test(ln.textContent);
			if ((ti === '0px' && !ln.classList.contains('binders-indented')) || (ti === '24px' && !own)) continue; const rec = JSON.stringify(ln.textContent) + ' ' + ln.className + ' ' + ti; if (!w.bad.includes(rec)) w.bad.push(rec); }
			requestAnimationFrame(f); }; f(); return 1; })()`);
	const here = async () => { await sleep(p, 250); const l = await caretLine(p, OWN); return { ...l, indent: await p.ev(`(() => { const cm = ${OWN}.cm, at = cm.domAtPos(cm.state.selection.main.head).node; return getComputedStyle((at.nodeType === 1 ? at : at.parentElement).closest('.cm-line')).textIndent; })()`) }; };
	await endOf(p, OWN);
	await p.key('Enter');
	const empty = await here();
	t.eq(empty.text, '', 'Enter at the end of a paragraph makes an empty line');
	t.eq(empty.x, 24, 'the caret waits at the indent');
	await p.type('T');
	const first = await here();
	t.eq(first.back, 24, 'and the first letter starts there');
	await p.type('hird.'); await p.key('Enter'); await p.key('Enter');
	t.eq((await here()).x, 24, 'after a blank line too');
	await p.type('F');
	t.eq((await here()).back, 24, 'where its first letter starts');
	await p.type('ourth.'); await p.key('Enter');
	// Tab on the empty line: the tab is the indent
	await p.key('Tab');
	const tab = await here();
	t.eq(tab.text, '\t', 'Tab on the empty line types a tab');
	t.eq(tab.x, 24, 'and the caret is where it was: one indent, not two');
	t.eq(tab.indent, '0px', 'the line is set in by its tab alone');
	await p.type('Fifth.');
	t.eq((await here()).indent, '0px', 'and stays so as it is typed in');
	// not after a heading
	await p.ev(`(() => { const e = ${OWN}; e.setCursor(6, e.getLine(6).length); return 1; })()`);
	await p.key('Enter');
	t.eq((await here()).x, 0, 'on the empty line after a heading the caret is at the margin');
	await p.type('U');
	t.eq((await here()).back, 0, 'where a paragraph after a heading starts');
	await sleep(p, 150);
	const seen = await p.ev(`(() => { const w = window.__twice; w.on = false; return w.bad; })()`);
	t.eq(seen.join(' | '), '', 'in no frame was a line set in twice');
	const typed = FRONT + '## A heading\nU\n\nFirst paragraph.\n\nSecond.\nThird.\n\nFourth.\n\tFifth.';
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(typed)})`, 6000);
	t.eq(await read(p, A), typed, 'what is on disk is what was typed: no indent is in the note but the tab');
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

test('a manuscript section shown as text (a binder that can’t be edited) has its tab lines as paragraphs', async (p, h, t) => {
	await body(p, A, RENDERED);
	// (a binder of a newer format is read-only: its sections are rendered, not editors)
	await p.ev(`app.vault.process(${file(L + 'The Lighthouse.md')}, (x) => x.replace('binder: 1', 'binder: 99')).then(() => 1)`);
	await sleep(p, 600);
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `[...document.querySelectorAll('.binders-manuscript-rendered')].some(e => e.textContent.includes('Rendered by Binders'))`, 8000);
	proseThere(t, await shownAsProse(p, '.binders-manuscript-rendered'), 'the manuscript');
	t.eq(await read(p, A), FRONT + RENDERED, 'the note on disk is as it was');
});

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

// "Indent paragraphs" where Binders renders a whole note itself (the class is on the rendered element, not above it)
const FOLLOWS = 'Rendered by Binders, first.\n\nSecond follows.\n\n\tThird, begun with a tab.\n\nFourth follows.\n';
/** How far in each paragraph's first letter is from the first paragraph's, where a note is rendered whole. */
const setIn = (p, sel) => p.ev(`(() => { const e = [...document.querySelectorAll(${j(sel)})].find(x => x.textContent.includes('Rendered by Binders')); if (!e) return null;
	const xs = [...e.querySelectorAll(':scope > p')].map(para => { const w = document.createTreeWalker(para, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.textContent.search(/\\S/); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getBoundingClientRect().left; } } return null; });
	return xs.map(x => Math.round(x - xs[0])); })()`);
const followsThere = async (p, t, sel, where, want = '[0,24,24,24]') => {
	await set(p, { indentParagraphs: true });
	await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].find(x => x.textContent.includes('Rendered by Binders')); return !!e && e.classList.contains('binders-prose-indent'); })()`, 8000);
	t.eq(j(await setIn(p, sel)), want, `${where}, “Indent paragraphs” on: a paragraph that follows one is set in, and one begun with a tab once, not twice`);
};

test('“Indent paragraphs” where Binders shows a note’s text itself: a manuscript section shown as text', async (p, h, t) => {
	await body(p, A, FOLLOWS);
	await set(p, { indentParagraphs: true });
	await p.ev(`app.vault.process(${file(L + 'The Lighthouse.md')}, (x) => x.replace('binder: 1', 'binder: 99')).then(() => 1)`);
	await sleep(p, 600);
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await followsThere(p, t, '.binders-manuscript-rendered', 'the manuscript');
	t.eq(await read(p, A), FRONT + FOLLOWS, 'the note on disk is as it was');
});

test('“Indent paragraphs” where Binders shows a note’s text itself: the snapshots dialog', async (p, h, t) => {
	await body(p, A, FOLLOWS);
	await set(p, { indentParagraphs: true });
	await open(p, A);
	await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`);
	await sleep(p, 400);
	await p.ev(`(async () => { await ${PL}.binders.snapshotsSettle(); await ${PL}.binders.flush(); return 1; })()`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
	try { await followsThere(p, t, '.modal.binders-snapshots .binders-snapshots-text', 'the dialog'); }
	finally { await p.key('Escape'); await sleep(p, 300); }
	t.eq(await read(p, A), FRONT + FOLLOWS, 'the note on disk is as it was');
});

test('“Indent paragraphs” where Binders shows a note’s text itself: focus mode’s scene before', async (p, h, t) => {
	// (the scene before is shown by its last three paragraphs)
	const three = 'Rendered by Binders, first.\n\n\tSecond, begun with a tab.\n\nThird follows.\n';
	await body(p, A, three);
	await set(p, { focusNeighbours: true, indentParagraphs: true });
	await open(p, K);
	await h.run('focus');
	try { await followsThere(p, t, '.binders-focus-near-text', 'the scene before', '[0,24,24]'); }
	finally { await h.run('focus'); await sleep(p, 900); }
	t.eq(await read(p, A), FRONT + three, 'the note on disk is as it was');
});

// ---- a reading view already shown follows the settings and its note's binder, as editors do ----

const shownReading = (p) => p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); if (!r) return null; const second = [...r.querySelectorAll('p')].find(e => e.textContent.startsWith('Second one')); return { pre: r.querySelectorAll('pre:not(.frontmatter)').length, tab: r.querySelectorAll('p.binders-tab-paragraph').length, second: second ? getComputedStyle(second).textIndent : null }; })()`);
const readingIs = async (p, t, want, what) => {
	await until(p, `(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); if (!r) return false; const s = [...r.querySelectorAll('p')].find(e => e.textContent.startsWith('Second one')); return r.querySelectorAll('pre:not(.frontmatter)').length === ${want.pre} && r.querySelectorAll('p.binders-tab-paragraph').length === ${want.tab} && !!s && getComputedStyle(s).textIndent === ${j(want.second)}; })()`, 4000);
	t.eq(j(await shownReading(p)), j(want), what);
};
const READ = 'First.\n\nSecond one.\n\n\tTabbed line to watch, with *stress*.\n';
const toMode = async (p, mode) => { await p.ev(`(async () => { const l = app.workspace.getLeaf(false), s = l.getViewState(); s.state.mode = ${j(mode)}; await l.setViewState(s); return 1; })()`); await sleep(p, 500); };

test('a reading view that is open follows both settings at once, and one out of sight shows them when it comes back; nothing is written', async (p, h, t) => {
	await body(p, A, READ);
	await open(p, A, 'preview');
	await readingIs(p, t, { pre: 0, tab: 1, second: '0px' }, 'to begin with: the tab line a paragraph, nothing set in');
	await set(p, { indentParagraphs: true });
	await readingIs(p, t, { pre: 0, tab: 1, second: '24px' }, '“Indent paragraphs” turned on: set in, without opening the note again');
	await set(p, { indentParagraphs: false, tabParagraphs: false });
	await readingIs(p, t, { pre: 1, tab: 0, second: '0px' }, 'both off: the code block Obsidian makes of the line is back');
	await set(p, { tabParagraphs: true });
	await readingIs(p, t, { pre: 0, tab: 1, second: '0px' }, 'tab paragraphs on again: a paragraph');
	// turned while the note is being edited
	await toMode(p, 'source');
	await set(p, { tabParagraphs: false, indentParagraphs: true });
	await toMode(p, 'preview');
	await readingIs(p, t, { pre: 1, tab: 0, second: '24px' }, 'turned while editing: reading view shows the settings as they are now');
	t.eq(await read(p, A), FRONT + READ, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('a reading view that is open follows its note into a binder and out, and its folder made a binder', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Loose folder'); await app.vault.create('Loose folder/Reads.md', ${j(READ)}); return 1; })()`);
	await open(p, 'Loose folder/Reads.md', 'preview');
	await readingIs(p, t, { pre: 1, tab: 0, second: '0px' }, 'outside a binder: code, as Obsidian has it');
	await p.ev(`app.fileManager.renameFile(${file('Loose folder/Reads.md')}, ${j(L + 'Part One/Reads.md')}).then(() => 1)`);
	await readingIs(p, t, { pre: 0, tab: 1, second: '0px' }, 'moved into a binder: a paragraph');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Reads.md')}, 'Loose folder/Reads.md').then(() => 1)`);
	await readingIs(p, t, { pre: 1, tab: 0, second: '0px' }, 'moved out: code again');
	await p.ev(`${PL}.binders.makeBinder(${file('Loose folder')}).then(() => 1)`);
	await readingIs(p, t, { pre: 0, tab: 1, second: '0px' }, 'its folder made a binder: a paragraph');
	t.eq(await read(p, 'Loose folder/Reads.md'), READ, 'the note is as it was written');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ---- a long note: a tab line is drawn right whether or not the editor has read as far as it ----

/** Records, in every editor: on every change to the page, and in the frame that draws that change (a callback asked
    for from inside the change runs after the editor's own), each line begun with a tab and text that isn't drawn as a
    paragraph: unmarked, a guide line in it, its tab another width, set as code, or its first letter elsewhere than
    at the indent. Lines in sight only. (QA round 10's recorder.) */
const record = (p) => p.ev(`(() => { window.__rec?.stop();
	const R = window.__rec = { bad: [], seen: new Set(), frames: 0, on: true };
	const look = (src) => { if (!R.on) return; for (const l of document.querySelectorAll('.workspace-leaf .cm-content > .cm-line')) { const text = l.textContent; if (!/^\\t\\S/.test(text)) continue;
		// (in sight: the editor keeps the line the caret is on in the page wherever the page is, and draws nothing on it there)
		const box = l.getBoundingClientRect(), port = l.closest('.cm-scroller').getBoundingClientRect(); if (box.bottom <= port.top || box.top >= port.bottom) continue;
		const ind = l.querySelector('.cm-indent'), why = [];
		if (!l.classList.contains('binders-tab-paragraph')) why.push('unmarked');
		if (ind && !/^(none|normal)$/.test(getComputedStyle(ind, '::before').content)) why.push('guide line');
		if (ind && Math.round(ind.getBoundingClientRect().width) !== 24) why.push('tab ' + Math.round(ind.getBoundingClientRect().width) + 'px');
		if (l.querySelector('.cm-inline-code')) why.push('code');
		if (/text-indent: ?-/.test(l.getAttribute('style') || '')) why.push('its wrapped lines hung under the tab');
		const w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT); let n, x = null; while ((n = w.nextNode())) { const i = n.data.search(/\\S/); if (i >= 0) { const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); x = Math.round(g.getBoundingClientRect().left - l.getBoundingClientRect().left); break; } }
		if (x !== null && x !== 24) why.push('first letter at ' + x + 'px');
		const k = src + ' ' + why.join(', '); if (why.length && !R.seen.has(k)) { R.seen.add(k); R.bad.push(src + ': ' + JSON.stringify(text.slice(0, 12)) + ' ' + why.join(', ') + (l.closest('.cm-editor').classList.contains('binders-prose-tabs') ? '' : ' (an editor without its reading yet)')); } } };
	const mo = new MutationObserver(() => { look('dom'); requestAnimationFrame(() => look('frame')); });
	mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
	let raf; const loop = () => { R.frames++; look('frame'); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop);
	R.stop = () => { R.on = false; mo.disconnect(); cancelAnimationFrame(raf); };
	return 1; })()`);
const recorded = async (p) => { await sleep(p, 150); return p.ev(`(() => { const R = window.__rec; R.stop(); return { frames: R.frames, drawn: R.bad.filter(b => b.startsWith('frame')), all: R.bad }; })()`); };
const SENTENCE = 'The lamp had been lit for three nights before anyone thought to ask who had lit it, and by then the boat had gone, and the sea had closed over the place where it had been.';
const longNote = (n) => Array.from({ length: n }, (_, i) => `\t${i + 1}. ${SENTENCE} ${i % 3 ? '' : SENTENCE}`).join('\n\n') + '\n';
const unread = (p) => p.ev(`(() => { const cm = ${OWN}.cm; return [${PL}.paragraphs.readTo(cm), cm.state.doc.length]; })()`);

for (const [count, wide] of [[400, false], [2000, false], [400, true]]) {
	test(`a long note of tab paragraphs (${count}${wide ? ', in source mode' : ''}): put back where it was left, jumped to its end and to its middle, no frame draws a tab line unmarked, with a guide line or anywhere but at the indent, though the editor has not read that far`, async (p, h, t) => {
		const text = FRONT + longNote(count);
		await p.ev(`app.vault.modify(${file(A)}, ${j(text)}).then(() => 1)`);
		await body(p, K, 'Another note.\n');
		await open(p, A, 'source', wide);
		// the writer reads on, goes to another note and comes back: Obsidian puts the page where it was
		await p.ev(`(() => { const s = ${OWN}.cm.scrollDOM; s.scrollTop = (s.scrollHeight - s.clientHeight) * 0.6; return 1; })()`);
		await sleep(p, 1200);
		await p.ev(`app.workspace.getLeaf(false).openFile(${file(K)}).then(() => 1)`);
		await sleep(p, 600);
		await record(p);
		await p.ev(`(() => { app.commands.executeCommandById('app:go-back'); return 1; })()`);
		await sleep(p, 1500);
		const back = await recorded(p);
		t.ok(back.frames > 5, `watched as it was drawn (${back.frames} frames)`);
		t.eq(back.drawn.join(' | '), '', 'put back where it was left: no frame draws a tab line wrong');
		// a fresh editor on the note, and a jump to the end before it has read that far
		await p.ev(`(async () => { app.workspace.detachLeavesOfType('markdown'); await sleep(200); const l = app.workspace.getLeaf(false); await l.openFile(${file(A)}); await l.setViewState({ type: 'markdown', state: { file: ${j(A)}, mode: 'source', source: ${wide} } }); return 1; })()`);
		await sleep(p, 300);
		await record(p);
		const [read0, all] = await unread(p);
		await p.ev(`(() => { const cm = ${OWN}.cm; cm.dispatch({ selection: { anchor: cm.state.doc.length }, scrollIntoView: true }); return 1; })()`);
		await sleep(p, 900);
		await p.ev(`(() => { const cm = ${OWN}.cm; cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight / 2; return 1; })()`);
		await sleep(p, 900);
		const jumped = await recorded(p);
		t.ok(read0 < all, `the jump was made before the editor had read the note (${read0} of ${all} characters)`);
		t.eq(jumped.drawn.join(' | '), '', 'jumped to the end and to the middle: no frame draws a tab line wrong');
		t.eq(await read(p, A), text, 'the note on disk is as it was');
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
}

// ---- a tabbed line straight under a line of text, where Binders renders a note itself ----

test('a tabbed line straight under a line of text is set in where Binders shows a note’s text itself, as the editor and reading view set it, whatever Obsidian’s “Strict line breaks” says; not under a list item', async (p, h, t) => {
	const text = 'Rendered by Binders, plain.\n\tA tabbed line under it.\n\n- an item\n\tthe item’s own text\n';
	await body(p, A, text);
	await p.ev(`app.vault.process(${file(L + 'The Lighthouse.md')}, (x) => x.replace('binder: 1', 'binder: 99')).then(() => 1)`);
	await sleep(p, 600);
	const shown = async () => {
		await p.ev(`(async () => { app.workspace.detachLeavesOfType('binders-view'); await sleep(200); return 1; })()`);
		await openView(p, L + 'Part One');
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
		await until(p, `[...document.querySelectorAll('.binders-manuscript-rendered')].some(e => e.textContent.includes('Rendered by Binders'))`, 8000);
		return p.ev(`(() => { const e = [...document.querySelectorAll('.binders-manuscript-rendered')].find(x => x.textContent.includes('Rendered by Binders'));
			const x = (s) => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.data.indexOf(s); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)]; } } return null; };
			const plain = x('Rendered by'), under = x('A tabbed line');
			return { in: under[0] - plain[0], below: under[1] > plain[1] + 8, marks: e.querySelectorAll('.binders-tab').length, inList: e.querySelectorAll('li .binders-tab').length, pres: e.querySelectorAll('pre').length }; })()`);
	};
	const got = await shown();
	t.ok(got.below, 'the tabbed line is a line of its own');
	t.eq(got.in, 24, 'and is set in by the indent');
	t.eq(got.inList, 0, 'a tabbed line under a list item is the list’s: nothing of ours in it');
	t.eq(got.pres, 0, 'and nothing is code');
	const was = await p.ev(`app.vault.getConfig('strictLineBreaks') ?? false`);
	try {
		await p.ev(`(() => { app.vault.setConfig('strictLineBreaks', true); return 1; })()`);
		const strict = await shown();
		// (the setting is reading view's: what is rendered here has a line for each line either way)
		t.ok(strict.below && strict.in === 24, `with “Strict line breaks” on it is a line of its own still, and set in (${j(strict)})`);
	} finally { await p.ev(`(() => { app.vault.setConfig('strictLineBreaks', ${was}); return 1; })()`); }
	t.eq(await read(p, A), FRONT + text, 'the note on disk is as it was');
});

// ---- no double tab: Tab on a line that is one tab and nothing else does nothing ----

/** Tab, text, Enter, Tab, text: two paragraphs with a tab each; and undo, a step at a time, back to the start. */
const enterTab = async (p, t, ed, what) => {
	const value = () => p.ev(`(${ed}).getValue()`), start = FRONT + 'First paragraph.';
	await endOf(p, ed);
	await p.key('Enter'); await p.key('Tab'); await p.type('One.'); await p.key('Enter'); await p.key('Tab');
	await sleep(p, 200);
	const l = await caretLine(p, ed);
	t.eq(l.text, '\t', `${what}: Enter carried the tab on, and Tab added no second`);
	t.eq(l.x, 24, `${what}: the caret is after the tab`);
	await p.type('Two.');
	// the caret before the tab: Tab puts it after, and adds nothing
	await p.key('Enter'); await p.key('Home'); await p.key('Home');
	await sleep(p, 150);
	await p.key('Tab');
	await sleep(p, 200);
	const home = await caretLine(p, ed);
	t.ok(home.text === '\t' && home.x === 24, `${what}: Tab with the caret before the tab puts it after (${j(home.text)}, ${home.x}px)`);
	await p.type('Three.');
	const typed = start + '\n\tOne.\n\tTwo.\n\tThree.';
	t.eq(await value(), typed, `${what}: a tab each, never two`);
	// a second tab where it is plainly meant: Tab on a line that has text indents it, as Obsidian has it
	await p.key('Tab');
	await sleep(p, 200);
	t.eq(await value(), start + '\n\tOne.\n\tTwo.\n\t\tThree.', `${what}: Tab on a line with text still indents it`);
	await p.key('Tab', 'shift');
	await sleep(p, 200);
	t.eq(await value(), typed, `${what}: and Shift+Tab takes that back`);
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x === ${j(typed)})`, 6000);
	t.eq(await read(p, A), typed, `${what}: on disk, exactly that`);
	const seen = [];
	for (let i = 0; i < 60 && (await value()) !== start; i++) { await p.ev(`(() => { (${ed}).undo(); return 1; })()`); await sleep(p, 30); seen.push(await value()); }
	t.eq(await value(), start, `${what}: undo goes back to the note as it was, a step at a time (${seen.length} steps)`);
	t.ok(seen.every((x) => !/\t\t/.test(x.replace('\t\tThree', ''))) && seen.length > 3, `${what}: and no step on the way has two tabs but the one that was typed`);
};

test('no double tab: Tab, text, Enter, Tab, text gives each paragraph one tab; a second can still be typed on a line with text; undo a step at a time', async (p, h, t) => {
	await body(p, A, 'First paragraph.');
	await open(p, A);
	await enterTab(p, t, OWN, 'a tab of its own');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('no double tab in a section of the manuscript', async (p, h, t) => {
	await body(p, A, 'First paragraph.');
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!${VIEW}.current?.scenes?.find(s => s.file.path === ${j(A)})?.live?.cm`, 8000);
	await enterTab(p, t, SECTION, 'the manuscript');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('no double tab is only that: Tab on a line that is one tab stays Obsidian’s under a list item, in a quote, a fenced block and the properties, on a selection, in a note outside a binder and with the setting off', async (p, h, t) => {
	// what Obsidian does with Tab at the end of each of these lines, with our setting off, is what it must do with it on
	const TEXT = '---\nstatus: revised\nnote: |\n\t\n---\n- an item\n\t\n\n> quote\n\t\n\n```\n\t\n```\n\nPlain.\n\n\t\n\n    \n';
	const LINES = { 'the properties': 3, 'under a list item': 6, 'straight under a quote': 9, 'a fenced block': 12 };
	const press = async (path, line, select = false) => {
		await p.ev(`app.vault.modify(${file(path)}, ${j(TEXT)}).then(() => 1)`);
		await open(p, path, 'source', true);
		// (the text as it began, whatever the key before left in the editor)
		await p.ev(`(() => { const e = ${OWN}; if (e.getValue() !== ${j(TEXT)}) e.setValue(${j(TEXT)}); e.focus(); ${select ? `e.setSelection({ line: ${line}, ch: 0 }, { line: ${line}, ch: 1 })` : `e.setCursor(${line}, 1)`}; return 1; })()`);
		await sleep(p, 150);
		await p.key('Tab');
		await sleep(p, 250);
		return p.ev(`${OWN}.getValue()`);
	};
	await p.ev(`app.vault.create('Loose tabs.md', '').then(() => 1)`);
	for (const [what, line] of Object.entries(LINES)) {
		await set(p, { tabParagraphs: false });
		const plain = await press(A, line);
		await set(p, { tabParagraphs: true });
		t.eq(await press(A, line), plain, `${what}: Tab does what Obsidian does with it`);
	}
	// a writer's own line of one tab (line 17), and of four spaces (19)
	await set(p, { tabParagraphs: false });
	const off = await press(A, 17);
	t.ok(off !== TEXT, 'with the setting off, Tab on a line of one tab is Obsidian’s: it adds one');
	await set(p, { tabParagraphs: true });
	t.eq(await press(A, 17), TEXT, 'with it on: nothing is added');
	t.eq(await press(A, 19), TEXT, 'nor on a line of four spaces');
	t.eq(await press(A, 17, true), off, 'on a selection it is Obsidian’s');
	t.eq(await press('Loose tabs.md', 17), off, 'and in a note outside a binder');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});
