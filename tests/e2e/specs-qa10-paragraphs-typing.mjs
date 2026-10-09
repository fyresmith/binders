// QA round 10, paragraphs: a writer typing in a binder's note in a tab of its own, on a computer (src/paragraphs/).
// Two things are judged in every scenario: (a) the text in the editor and on disk is what a writer would expect, and
// (b) what is drawn never passes through another look. For (b) a recorder is installed before the first keystroke:
// it watches every editor's lines that start with a tab (or four spaces) and have text, once per DOM change ('dom':
// what the page held at the end of a change, which may never have been drawn) and once per animation frame ('frame':
// what a paint shows: sampled after the editor's own frame callbacks), and keeps every state in which such a line is not the paragraph look (not marked
// as a tab paragraph, the indentation guide drawn in it, or set as code). Lines with only white space in them are
// left out: that is a known issue being fixed (the new line after Tab or Enter has no class until its first letter).
// Tests named "BUG:" fail until the finding they show is fixed.
import { j, file, until, read, withTidy, PL, B } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa10 paragraphs typing: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md';
const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\n---\n';
const LEAF = '.workspace-leaf.mod-active';
const errors = (p) => p.errors.filter((e) => !/Electron Security/.test(e));

// ---- helpers ----

const set = (p, o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveSettings(); return 1; })()`);
const cfg = (p, o) => p.ev(`(() => { for (const [k, v] of Object.entries(${j(o)})) app.vault.setConfig(k, v); app.workspace.updateOptions(); return 1; })()`);
const ed = (p, code) => p.ev(`(() => { const e = app.workspace.activeEditor.editor, cm = e.cm; ${code} })()`);
const value = async (p) => (await p.ev(`app.workspace.activeEditor.editor.getValue()`)).slice(FRONT.length);
const disk = async (p, path = A) => (await read(p, path)).slice(FRONT.length);
const sleep = (p, ms) => p.sleep(ms);
const CARET = '‸';

/** The note's body set to `text` (a ‸ marks where the caret goes; none: the end), opened in a fresh tab, focused. */
async function start(p, text, { mode = 'source', source = false, path = A, front = true } = {}) {
	const at = text.indexOf(CARET), clean = text.replace(CARET, '');
	await p.ev(`(async () => { app.workspace.detachLeavesOfType('markdown'); await new Promise(r => setTimeout(r, 100)); await app.vault.adapter.write(${j(path)}, ${j((front ? FRONT : '') + clean)}); await new Promise(r => setTimeout(r, 100)); return 1; })()`);
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); await l.setViewState({ type: 'markdown', state: { file: ${j(path)}, mode: ${j(mode)}, source: ${j(source)} } }); return 1; })()`);
	await sleep(p, 700);
	const off = (front ? FRONT.length : 0) + (at < 0 ? clean.length : at);
	await ed(p, `e.focus(); cm.dispatch({ selection: { anchor: ${off} } }); return 1;`);
	await sleep(p, 200);
}

/** Keys and text in one string: `<Tab>`, `<Enter>`, `<S-Tab>`, `<C-z>`, `<Home>`, anything else is typed. */
async function keys(p, s) {
	for (const part of s.split(/(<[^>]+>)/).filter(Boolean)) {
		const m = /^<(?:(S|C|A)-)?([^>]+)>$/.exec(part);
		if (m) { await p.key(m[2], ...(m[1] ? [{ S: 'shift', C: 'ctrl', A: 'alt' }[m[1]]] : [])); await sleep(p, 60); } else await p.type(part);
	}
	await sleep(p, 250);
}

/** The recorder (see the top of the file). Returns what was seen when stopped: the states in which a tab line with
    text was not the paragraph look. */
const RECORD = `(() => {
	if (window.__qa10) window.__qa10.stop();
	const R = window.__qa10 = { bad: [], seen: new Set(), on: true, frames: 0, t0: performance.now() };
	const look = () => {
		const out = [];
		for (const l of document.querySelectorAll('.workspace-leaf .cm-content > .cm-line')) {
			const t = l.textContent;
			if (!/^(\\t| {4})\\s*\\S/.test(t)) continue;
			const inl = !!l.querySelector('.cm-inline-code') || /[\`$]/.test(t);
			const ind = l.querySelector('.cm-indent'), why = [];
			if (!l.classList.contains('binders-tab-paragraph')) why.push('not marked as a tab paragraph');
			if (ind && !/^(none|normal)$/.test(getComputedStyle(ind, '::before').content)) why.push('indentation guide drawn');
			if (!inl && l.querySelector('.cm-inline-code')) why.push('set as code');
			// (the text's own font: not the four spaces of an indent, which are set in the monospace font on purpose to fill the indent)
			if (!inl) for (const s of l.querySelectorAll('span')) if (!s.closest('.cm-indent') && !s.querySelector('.cm-indent') && /mono/i.test(getComputedStyle(s).fontFamily)) { why.push('monospace font'); break; }
			// (a hang is flagged when it shifts the first line: a negative text-indent with no padding to match; Obsidian's hang of a line
			// it has not read yet, which leaves the first line where it was and the wrapped lines under the tab, is not)
			{ const st = l.getAttribute('style') || '', ti = /text-indent: ?(-?[\d.]+)px/.exec(st), pad = /padding-inline-start: ?([\d.]+)px/.exec(st); if (ti && (!pad || Math.abs(parseFloat(ti[1]) + parseFloat(pad[1])) > 1)) why.push('hanging indent (' + st + ')'); }
			if (why.length) out.push({ text: t.slice(0, 24), why: why.join(', ') });
		}
		return out;
	};
	const snap = (src) => { if (!R.on) return; for (const b of look()) { const k = src + '|' + b.text + '|' + b.why; if (!R.seen.has(k)) { R.seen.add(k); R.bad.push({ src, at: Math.round(performance.now() - R.t0), ...b }); } } };
	// A frame is sampled by a callback asked for from inside the DOM change, so it runs after the editor's own (asked for
	// by the change itself): what it sees is what that frame paints, not a state the editor repairs a moment later.
	const mo = new MutationObserver(() => { snap('dom'); requestAnimationFrame(() => snap('frame')); });
	mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
	let raf; const loop = () => { R.frames++; raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); requestAnimationFrame(() => snap('frame'));
	R.stop = () => { R.on = false; mo.disconnect(); cancelAnimationFrame(raf); };
	return 1; })()`;
const record = (p) => p.ev(RECORD);
const stop = (p) => p.ev(`(() => { window.__qa10.stop(); return { bad: window.__qa10.bad, frames: window.__qa10.frames }; })()`);
const fmt = (bad) => bad.map((b) => `${b.src} @${b.at}ms ${JSON.stringify(b.text)}: ${b.why}`).join(' | ');
/** The rule for every timeline: nothing drawn (frames) in another look; the DOM may be said, but must not be wrong long. */
function clean(t, r, what) {
	t.ok(r.frames > 5, `${what}: the recorder saw frames (${r.frames})`);
	const frames = r.bad.filter((b) => b.src === 'frame');
	t.ok(!frames.length, `${what}: no frame draws a tab line in another look: ${fmt(frames)}`);
	const dom = r.bad.filter((b) => b.src === 'dom');
	t.ok(!dom.length, `${what}: no DOM state holds a tab line in another look: ${fmt(dom)}`);
}

/** The editor's lines under the active tab: text, whether marked, the tab's width, the guide, a hung indent. */
const lines = (p) => p.ev(`[...document.querySelectorAll(${j(LEAF + ' .cm-content > .cm-line')})].map(l => { const ind = l.querySelector('.cm-indent'); return { text: l.textContent, tab: l.classList.contains('binders-tab-paragraph'), cls: l.className, w: ind ? Math.round(ind.getBoundingClientRect().width * 10) / 10 : null, guide: ind ? getComputedStyle(ind, '::before').content : null, style: l.getAttribute('style') || '', code: !!l.querySelector('.cm-inline-code') }; })`);
const lineOf = async (p, starts) => (await lines(p)).find((l) => l.text.trimStart().startsWith(starts));
/** The x of the first character of each row a line is wrapped into. */
const rows = (p, starts) => ed(p, `const doc = cm.state.doc; let n = null; for (let i = 1; i <= doc.lines; i++) if (doc.line(i).text.trimStart().startsWith(${j(starts)})) { n = doc.line(i); break; } if (!n) return null; const out = []; let last = -1; for (let pos = n.from; pos <= n.to; pos++) { const c = cm.coordsAtPos(pos); if (!c) continue; if (Math.abs(c.top - last) > 4) { out.push([pos - n.from, Math.round(c.left)]); last = c.top; } } return out;`);

const LONG = 'The lamp had been lit for three nights before anyone thought to ask who had lit it, and by then the boat had gone, and the sea had closed over the place where it had been, and Mara stood on the jetty with her bag and her borrowed coat, watching the light turn.';
const marked = (t, l, what) => { t.ok(!!l, `${what}: the line is there`); if (l) { t.ok(l.tab, `${what}: marked as a tab paragraph (${l.cls})`); t.ok(!l.code, `${what}: not set as code`); t.ok(!/text-indent/.test(l.style), `${what}: not hung (${l.style})`); } };

// ---- A: typing a page ----

for (const [name, source] of [['live preview', false], ['source mode', true]]) {
	test(`a page typed the way a novelist does, in ${name}: the text is what was typed, wrapped lines stand at the margin, no look but the paragraph's on the way`, async (p, h, t) => {
		await start(p, '', { source });
		await record(p);
		await keys(p, '# Chapter one<Enter><Enter>');
		await keys(p, '<Tab>' + LONG + '<Enter>');
		await keys(p, 'The next paragraph carries its tab from the line above.<Enter><Enter><Enter>');
		await keys(p, 'A plain paragraph at the margin.<Enter><Enter>');
		await keys(p, '<Tab>"Is anyone here?" she called.<Enter>"Yes," said the keeper.<Enter><Enter><Enter>');
		await keys(p, '***<Enter><Enter>## Part two<Enter><Enter>');
		await keys(p, '<Tab>Back again with a tab.');
		const r = await stop(p);
		const want = '# Chapter one\n\n\t' + LONG + '\n\tThe next paragraph carries its tab from the line above.\n\nA plain paragraph at the margin.\n\n\t"Is anyone here?" she called.\n\t"Yes," said the keeper.\n\n***\n\n## Part two\n\n\tBack again with a tab.';
		t.eq(await value(p), want, 'the editor holds what was typed (Enter carries the tab; a third Enter makes the blank line)');
		await until(p, `app.vault.adapter.read(${j(A)}).then(x => x.endsWith('Back again with a tab.'))`, 6000);
		t.eq(await disk(p), want, 'and so does the disk');
		clean(t, r, name);
		marked(t, await lineOf(p, 'The lamp had'), 'the long paragraph');
		marked(t, await lineOf(p, 'Back again'), 'the last paragraph');
		const plain = await rows(p, 'A plain paragraph'), long = await rows(p, 'The lamp had');
		t.ok(long.length >= 3, `the paragraph wraps (${long.length} rows)`);
		t.ok(long.slice(1).every(([, x]) => x === plain[0][1]), `wrapped rows stand at the margin (${j(long)} against ${plain[0][1]})`);
		const first = await lineOf(p, 'The lamp had');
		t.ok(Math.abs(first.w - 24) < 1.5, `the tab is the paragraph indent, 1.5em (${first.w}px)`);
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
}

test('Enter then Tab makes no second tab in a binder’s note (the maintainer’s decision, 2026-10-09); in a loose note it is Obsidian’s, two tabs', async (p, h, t) => {
	await start(p, '');
	await keys(p, '<Tab>One.<Enter><Tab>Two.');
	t.eq(await value(p), '\tOne.\n\tTwo.', 'one tab on each line: Obsidian carries the tab on Enter, and Tab adds no second');
	const l = await lineOf(p, 'Two.');
	marked(t, l, 'the second line');
	const x = await ed(p, `const d = cm.state.doc.line(cm.state.doc.lines); return [Math.round(cm.coordsAtPos(d.from).left), Math.round(cm.coordsAtPos(d.from + 1).left)];`);
	t.ok(Math.abs(x[1] - x[0] - 24) < 2, `which is one indent (the text starts ${x[1] - x[0]}px in; one tab paragraph's indent is 24)`);
	// the same in a note outside a binder: this is Obsidian's, not Binders'
	await p.ev(`app.vault.create('Loose.md', '').then(() => 1)`);
	await start(p, '', { path: 'Loose.md', front: false });
	await keys(p, '<Tab>One.<Enter><Tab>Two.');
	t.eq(await ed(p, `return e.getValue()`), '\tOne.\n\t\tTwo.', 'a loose note gets the two tabs (Obsidian’s)');
});

// ---- B: Enter, Backspace, Delete, Tab ----

test('Enter in the middle of a tab paragraph, twice, on an empty tabbed line and before the tab', async (p, h, t) => {
	await start(p, '\tFirst tab paragraph.\n\n\tSecond ‸tab paragraph.\n');
	await record(p); await keys(p, '<Enter>');
	t.eq(await value(p), '\tFirst tab paragraph.\n\n\tSecond \n\ttab paragraph.\n', 'Enter splits it, the new line keeps the tab (and the space stays where it was)');
	marked(t, await lineOf(p, 'tab paragraph.'), 'the second half');
	clean(t, await stop(p), 'Enter in the middle');
	// Enter on a line with only the tab: the tab goes, as Obsidian clears an empty bullet: this is a blank line, not a new one
	await start(p, '\tOne tab para.‸\n');
	await keys(p, '<Enter>'); t.eq(await value(p), '\tOne tab para.\n\t\n', 'Enter at the end: a new tabbed line');
	await keys(p, '<Enter>'); t.eq(await value(p), '\tOne tab para.\n\n', 'Enter on it: the tab goes, the caret is on an empty line (as in Obsidian’s list)');
	await keys(p, '<Enter>'); t.eq(await value(p), '\tOne tab para.\n\n\n', 'Enter again: a third line, so a blank line takes three Enters after a tab paragraph');
	await start(p, '‸\tSecond tab paragraph.\n');
	await keys(p, '<Enter>');
	t.eq(await value(p), '\n\tSecond tab paragraph.\n', 'Enter before the tab pushes the whole paragraph down, tab and all');
	marked(t, await lineOf(p, 'Second tab'), 'the paragraph pushed down');
});

test('Backspace at the start of the text takes the tab, then the line break; Delete at the end of the line before joins; Shift+Tab takes the tab', async (p, h, t) => {
	await start(p, 'Plain.\n\n\t‸Second tab paragraph.\n');
	await record(p); await keys(p, '<Backspace>');
	t.eq(await value(p), 'Plain.\n\nSecond tab paragraph.\n', 'Backspace takes the tab');
	await keys(p, '<Backspace>'); t.eq(await value(p), 'Plain.\nSecond tab paragraph.\n', 'again: the blank line');
	clean(t, await stop(p), 'Backspace');
	await start(p, 'Plain end‸\n\tSecond tab paragraph.\n');
	await record(p); await keys(p, '<Delete>');
	t.eq(await value(p), 'Plain end\tSecond tab paragraph.\n', 'Delete at the end of the line before: the lines join, the tab stays where it was typed');
	await stop(p);
	await start(p, '\t‸Second tab paragraph.\n');
	await record(p); await keys(p, '<S-Tab>');
	t.eq(await value(p), 'Second tab paragraph.\n', 'Shift+Tab takes the tab');
	clean(t, await stop(p), 'Shift+Tab');
	await start(p, '\t\tTwo tabs.‸\n'); await keys(p, '<S-Tab>');
	t.eq(await value(p), '\tTwo tabs.\n', 'Shift+Tab takes one of two tabs');
});

test('Tab goes to the start of the line wherever the caret is (Obsidian does the same in any note); Tab twice is still a paragraph', async (p, h, t) => {
	for (const [text, want] of [['Plain para‸ graph.\n', '\tPlain para graph.\n'], ['Plain paragraph.‸\n', '\tPlain paragraph.\n'], ['‸Plain paragraph.\n', '\tPlain paragraph.\n'], ['\tSecond ‸tab paragraph.\n', '\t\tSecond tab paragraph.\n']]) {
		await start(p, text); await record(p); await keys(p, '<Tab>');
		t.eq(await value(p), want, `Tab with the caret in ${j(text)}`);
		clean(t, await stop(p), 'Tab ' + j(text));
		marked(t, await lineOf(p, text.replace(CARET, '').trim().slice(0, 6)), 'the line after Tab');
	}
	await start(p, '‸Plain paragraph.\n'); await record(p); await keys(p, '<Tab><Tab>');
	t.eq(await value(p), '\t\tPlain paragraph.\n', 'Tab twice: two tabs');
	const l = await lineOf(p, 'Plain paragraph'); marked(t, l, 'two tabs'); t.ok(Math.abs(l.w - 24) < 1.5 || Math.abs(l.w - 48) < 1.5, `drawn one or two indents wide (${l.w}px)`);
	clean(t, await stop(p), 'Tab twice');
	await p.ev(`app.vault.create('Loose.md', '').then(() => 1)`);
	await start(p, 'Plain para‸ graph.\n', { path: 'Loose.md', front: false });
	await keys(p, '<Tab>'); t.eq(await ed(p, `return e.getValue()`), '\tPlain para graph.\n', 'in a loose note Tab does the same (Obsidian’s)');
});

test('Tab on a selection across paragraphs indents every line it touches, blank ones too (Obsidian’s), and Shift+Tab undoes it exactly', async (p, h, t) => {
	const T3 = 'One first.\n\nTwo second.\n\nThree third.\n';
	await start(p, T3);
	await ed(p, `cm.dispatch({ selection: { anchor: ${FRONT.length + 3}, head: ${FRONT.length + T3.length - 3} } }); return 1;`);
	await record(p); await keys(p, '<Tab>');
	const tabbed = await value(p);
	t.ok(/^\tOne first\.\n/.test(tabbed) && /\n\tTwo second\.\n/.test(tabbed) && /\n\tThree third\.\n$/.test(tabbed), 'each paragraph has its tab: ' + j(tabbed));
	clean(t, await stop(p), 'Tab on a selection');
	await keys(p, '<S-Tab>');
	t.eq(await value(p), T3, 'Shift+Tab gives the note back as it was, with nothing left on the blank lines');
});

// ---- C: the caret ----

test('the caret is where it looks: clicks in and beside the tab, Home, End, the arrows, Shift+Home, double and triple click', async (p, h, t) => {
	await start(p, 'Plain one.\n\n\tHello wide world of words.\n\n    Four spaces line.\n\nEnd.\n');
	const r = await p.ev(`(() => { const l = [...document.querySelectorAll(${j(LEAF + ' .cm-content > .cm-line')})].find(l => l.textContent.startsWith('\\tHello')); const b = l.getBoundingClientRect(), i = l.querySelector('.cm-indent').getBoundingClientRect(); return { il: i.left, iw: i.width, y: b.top + b.height / 2 }; })()`);
	const at = () => ed(p, `const s = cm.state.selection.main; const c = (x) => Math.round(cm.coordsAtPos(x).left); return { a: s.anchor - ${FRONT.length}, h: s.head - ${FRONT.length}, hx: c(s.head) };`);
	// (line 3 starts at 12; the tab is column 0 to 1 and is 24px wide)
	for (const [dx, col] of [[1, 12], [6, 12], [14, 13], [20, 13], [23, 13]]) {
		await p.click(r.il + dx, r.y); const s = await at();
		t.eq(s.h, col, `a click ${dx}px into the tab puts the caret at ${col - 12 ? 'after' : 'before'} it`);
		t.ok(Math.abs(s.hx - (r.il + (col === 12 ? 0 : 24))) <= 1, `and draws it there (x ${s.hx})`);
	}
	await p.click(r.il + 200, r.y);
	await p.key('Home'); t.eq((await at()).h, 13, 'Home goes to the start of the text, after the tab');
	await p.key('Home'); t.eq((await at()).h, 12, 'Home again goes before the tab');
	await p.key('End'); t.eq((await at()).h, 39, 'End goes to the end of the line');
	await p.key('Home'); await p.key('Home'); await p.key('ArrowRight'); t.eq((await at()).h, 13, 'Right from before the tab steps over it');
	await p.key('ArrowLeft'); t.eq((await at()).h, 12, 'Left steps back before it');
	await p.key('ArrowLeft'); t.eq((await at()).h, 11, 'and then up to the end of the line above');
	await p.click(r.il + 200, r.y); await p.key('Home', 'shift');
	let s = await at(); t.ok(s.a > s.h && s.h === 13, 'Shift+Home selects to the start of the text ' + j(s));
	await p.key('Home', 'shift'); s = await at(); t.eq(s.h, 12, 'and again to before the tab');
	const w = await ed(p, `const d = cm.state.doc.lineAt(${FRONT.length} + 20); const c = cm.coordsAtPos(d.from + 8); return { x: c.left + 2, y: (c.top + c.bottom) / 2 };`);
	await p.dbl(w.x, w.y);
	t.eq(await ed(p, `return e.getSelection()`), 'wide', 'a double click selects the word');
	for (const clickCount of [1, 2, 3]) { await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: w.x, y: w.y, button: 'left', clickCount }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: w.x, y: w.y, button: 'left', clickCount }); }
	await sleep(p, 200);
	t.eq(await ed(p, `return e.getSelection()`), '\tHello wide world of words.', 'a triple click selects the line, its tab with it');
	t.eq(await disk(p), 'Plain one.\n\n\tHello wide world of words.\n\n    Four spaces line.\n\nEnd.\n', 'nothing was written');
});

// ---- D: paste, cut, drag ----

const paste = (p, text) => p.ev(`(() => { const cm = app.workspace.activeEditor.editor.cm; const dt = new DataTransfer(); dt.setData('text/plain', ${j(text)}); cm.contentDOM.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1; })()`);

test('paste of tab paragraphs, of four-space paragraphs, a cut and a paste of a tab paragraph, and a dragged selection', async (p, h, t) => {
	await start(p, 'Before.\n\n‸');
	await record(p);
	await paste(p, '\tOne first.\n\n\tTwo second.\n\tThree third.\n');
	await sleep(p, 300);
	t.eq(await value(p), 'Before.\n\n\tOne first.\n\n\tTwo second.\n\tThree third.\n', 'pasted tab paragraphs arrive as they were');
	for (const s of ['One first', 'Two second', 'Three third']) marked(t, await lineOf(p, s), 'pasted ' + s);
	clean(t, await stop(p), 'paste');
	await start(p, 'Before.\n\n‸'); await record(p);
	await paste(p, '    One first.\n\n    Two second.\n'); await sleep(p, 300);
	t.eq(await value(p), 'Before.\n\n    One first.\n\n    Two second.\n', 'four-space paragraphs arrive as they were');
	marked(t, await lineOf(p, 'One first'), 'pasted four spaces'); marked(t, await lineOf(p, 'Two second'), 'pasted four spaces, the next');
	clean(t, await stop(p), 'paste of four spaces');
	// cut a whole tab paragraph (tab and all) and paste it into an empty line
	await start(p, '\tOne first.\n\nPlain two.\n\n‸End.\n');
	await record(p);
	await p.ev(`(() => { const cm = app.workspace.activeEditor.editor.cm; cm.dispatch({ selection: { anchor: ${FRONT.length}, head: ${FRONT.length + 11} } }); const dt = new DataTransfer(); cm.contentDOM.dispatchEvent(new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true })); window.__clip = dt.getData('text/plain'); return 1; })()`);
	t.eq(await p.ev(`window.__clip`), '\tOne first.', 'the cut puts the paragraph with its tab on the clipboard');
	const mid = await value(p);
	await ed(p, `const l = cm.state.doc.line(cm.state.doc.lines); cm.dispatch({ selection: { anchor: l.from } }); return 1;`);
	await paste(p, '\tOne first.\n'); await sleep(p, 300);
	t.eq(await value(p), mid + '\tOne first.\n', 'pasted at the start of the last line');
	clean(t, await stop(p), 'cut and paste');
	// drag a word out of a tab paragraph with the mouse
	await start(p, '\tAlpha beta gamma.\n\nPlain delta.\n');
	const pos = await ed(p, `const a = ${FRONT.length} + 1, b = a + 5; cm.dispatch({ selection: { anchor: a, head: b } }); const c = cm.coordsAtPos(a + 2), d = cm.coordsAtPos(${FRONT.length} + 28); return { from: { x: c.left, y: (c.top + c.bottom) / 2 }, to: { x: d.left, y: (d.top + d.bottom) / 2 } };`);
	await record(p);
	await p.drag(pos.from.x, pos.from.y, pos.to.x, pos.to.y, 20); await sleep(p, 300);
	t.eq(await value(p), '\t beta gamma.\n\nPlain deAlphalta.\n', 'a dragged word moves where it is dropped, and the tab stays');
	clean(t, await stop(p), 'drag');
	marked(t, await lineOf(p, 'beta'), 'the paragraph it left');
});

// ---- E: undo and redo ----

test('undo and redo a step at a time through typing, Enter, Tab and Shift+Tab: every state is one that was typed, and nothing is drawn in another look', async (p, h, t) => {
	await start(p, 'First.\n\n‸');
	const states = [await value(p)];
	await record(p);
	for (const s of ['<Tab>', 'The lamp *burned*.', '<Enter>', '<Tab>', '"Hello," she said.', '<Enter><Enter>', 'Plain line.', '<Enter><Enter>', '<Tab>Last.', '<Home><Home><S-Tab>', '<End><Enter>']) { await keys(p, s); states.push(await value(p)); }
	const final = await value(p);
	const undo = []; let prev = final;
	for (let i = 0; i < 40; i++) { await p.key('z', 'ctrl'); await sleep(p, 120); const v = await value(p); if (v === prev) break; undo.push(v); prev = v; }
	t.ok(undo.length >= 5, `undo takes several steps (${undo.length})`);
	t.eq(prev, 'First.\n\n', 'undo goes back to the note as it was opened');
	t.ok(undo.every((v) => states.includes(v) || states.some((s) => s.startsWith(v)) || final.startsWith(v)), 'every undone state is one that was typed (or a prefix of one): ' + j(undo.filter((v) => !(states.includes(v) || states.some((s) => s.startsWith(v)) || final.startsWith(v)))));
	const redo = []; prev = await value(p);
	for (let i = 0; i < 40; i++) { await p.key('y', 'ctrl'); await sleep(p, 120); const v = await value(p); if (v === prev) break; redo.push(v); prev = v; }
	t.eq(prev, final, 'redo goes forward to all of it');
	t.eq(redo.length, undo.length, 'in as many steps');
	clean(t, await stop(p), 'undo and redo');
	await until(p, `app.vault.adapter.read(${j(A)}).then(x => x.endsWith(${j(final)}))`, 6000);
	t.eq(await disk(p), final, 'the disk has the final text');
});

// ---- F: Obsidian's own settings ----

test('with “Indent using tabs” off (Tab types spaces), tab size 2 and 8, “Strict line breaks”, “Auto pair brackets” and “Smart indent lists” off, the page is still paragraphs and the tab is 1.5em', async (p, h, t) => {
	const was = await p.ev(`({ useTab: app.vault.getConfig('useTab'), tabSize: app.vault.getConfig('tabSize'), strictLineBreaks: app.vault.getConfig('strictLineBreaks'), autoPairBrackets: app.vault.getConfig('autoPairBrackets'), smartIndentList: app.vault.getConfig('smartIndentList') })`);
	try {
		for (const [name, c, tab] of [['spaces, size 4', { useTab: false, tabSize: 4 }, '    '], ['spaces, size 2', { useTab: false, tabSize: 2 }, '    '], ['tabs, size 8', { useTab: true, tabSize: 8 }, '\t'], ['strict line breaks', { useTab: true, tabSize: 4, strictLineBreaks: true }, '\t'], ['no smart indent', { strictLineBreaks: false, smartIndentList: false }, '\t'], ['no auto pair', { smartIndentList: true, autoPairBrackets: false }, '\t']]) {
			await cfg(p, c);
			await start(p, 'First.\n\n‸');
			await record(p);
			await keys(p, '<Tab>One first.<Enter>Two second.<Enter><Enter><Enter><Tab>Three.');
			const want = `First.\n\n${tab}One first.\n${tab}Two second.\n\n${tab}Three.`;
			// (with smart indent off Obsidian carries the tab on every Enter: its own, so only the end is held to)
			if (name === 'no smart indent') t.ok((await value(p)).endsWith('Three.'), name + ': what was typed'); else t.eq(await value(p), want, name + ': what was typed');
			for (const s of ['One first', 'Two second', 'Three']) { const l = await lineOf(p, s); marked(t, l, `${name}: ${s}`); t.ok(Math.abs(l.w - 24) < 1.5, `${name}: ${s} is one indent wide (${l.w}px)`); }
			clean(t, await stop(p), name);
		}
	} finally { await cfg(p, was); }
	// two or three spaces are not a tab: they are what they are (Markdown's rule), set as ordinary text
	await start(p, '  Two spaces.\n\n   Three spaces.\n\nPlain.\n');
	const two = await lineOf(p, 'Two spaces'), three = await lineOf(p, 'Three spaces');
	t.ok(!two.tab && !three.tab && !two.code && !three.code, 'two and three spaces at the start are neither marked nor code');
	// right to left
	await cfg(p, { rightToLeft: true });
	try { await start(p, 'First.\n\n‸'); await record(p); await keys(p, '<Tab>One first.<Enter>Two second.'); marked(t, await lineOf(p, 'One first'), 'right to left'); clean(t, await stop(p), 'right to left'); } finally { await cfg(p, { rightToLeft: false }); }
});

// ---- G: what starts a tab paragraph ----

test('markup at the start of a tab paragraph: emphasis, a link, a quotation mark, a dash, a tag, “1. ”, “- ”, “> ”, a rule, a comment, a footnote: all prose, none a list, a quote or a rule', async (p, h, t) => {
	const cases = ['*Emphasis* first, then **bold**.', '[[The keeper]] came first.', '"Quoted," she said.', '—and then silence.', '#tag at the start.', '1. Not a list.', '2) Neither.', '- not a bullet.', '> not a quote.', '***', '---', '%%a comment%% then text', '[^1] footnote at the start', '# not a heading'];
	for (const text of cases) {
		await start(p, 'Before.\n\n‸');
		await record(p);
		await keys(p, '<Tab>' + text);
		const l = (await lines(p)).find((x) => / cm-active/.test(' ' + x.cls) && /^\t/.test(x.text));
		marked(t, l, JSON.stringify(text));
		if (l) t.ok(!/HyperMD-(list|quote|header)|\bhr\b/.test(l.cls), `${JSON.stringify(text)} is not a list, a quote, a heading or a rule (${l.cls})`);
		clean(t, await stop(p), JSON.stringify(text));
		t.ok((await value(p)).startsWith('Before.\n\n\t'), `${JSON.stringify(text)}: the tab is in the note`);
	}
});

test('a tab paragraph under a plain paragraph, a heading, a quote, a fenced block, a table, a rule, the properties and a callout is a paragraph; under a list item, or in a quote, it is the list’s or the quote’s', async (p, h, t) => {
	const prose = { 'a plain paragraph': 'Plain paragraph.\n\tTabbed under.\n', 'a heading': '# Heading\n\tTabbed under.\n', 'a heading and a blank line': '# Heading\n\n\tTabbed under.\n', 'a quote and a blank line': '> quote\n\n\tTabbed under.\n', 'a fenced block': '```\ncode\n```\n\tTabbed under.\n', 'a table and a blank line': '| a | b |\n|---|---|\n| 1 | 2 |\n\n\tTabbed under.\n', 'a rule': '---\n\tTabbed under.\n', 'a callout and a blank line': '> [!note] Title\n> body\n\n\tTabbed under.\n' };
	for (const [name, text] of Object.entries(prose)) { await start(p, text); marked(t, await lineOf(p, 'Tabbed under'), 'under ' + name); }
	await start(p, '\tTab right after the properties.\n'); marked(t, await lineOf(p, 'Tab right after'), 'under the properties');
	for (const [name, text] of Object.entries({ 'a list item': '- item\n\tTabbed under.\n', 'a list item and a blank line': '- item\n\n\tTabbed under.\n', 'a numbered item': '1. item\n\n\tTabbed under.\n', 'a quote, no blank line': '> quote\n\tTabbed under.\n', 'a fence, inside it': '```\n\tinside\n```\n' })) {
		await start(p, text);
		const l = await lineOf(p, name.includes('fence') ? 'inside' : 'Tabbed under');
		t.ok(l && !l.tab, `${name}: not a tab paragraph, as Markdown has it (${l && l.cls})`);
	}
});

// ---- H: both settings, and a long note ----

test('with “Indent paragraphs” on as well, typing a paragraph with a tab after one without, and the other way, never indents a line twice, and no line passes through another indent', async (p, h, t) => {
	await set(p, { indentParagraphs: true, tabParagraphs: true });
	try {
		await start(p, '‸');
		await p.ev(`(() => { const R = window.__ind = { per: new Map() }; const doc = () => document; const snap = () => { for (const l of document.querySelectorAll('.workspace-leaf.mod-active .cm-content > .cm-line')) { const t = l.textContent; if (!t.trim()) continue; const ind = l.querySelector('.cm-indent'); const eff = Math.max(0, parseFloat(getComputedStyle(l).textIndent) || 0) + (ind ? ind.getBoundingClientRect().width : 0); const k = t.trim().slice(0, 10); if (!R.per.has(k)) R.per.set(k, new Set()); R.per.get(k).add(Math.round(eff)); } }; new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); const loop = () => { snap(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); return 1; })()`);
		await record(p);
		await keys(p, '<Tab>One with a tab.<Enter><Enter><Enter>Plain after a tab paragraph.<Enter><Enter><Tab>Tab again.<Enter><Enter><Enter>Plain again.');
		const r = await stop(p);
		t.eq(await value(p), '\tOne with a tab.\n\nPlain after a tab paragraph.\n\n\tTab again.\n\nPlain again.', 'the text');
		const eff = await p.ev(`[...window.__ind.per.entries()].map(([k, v]) => [k, [...v]])`);
		const bad = eff.filter(([k, v]) => v.some((w) => w !== 24 && w !== 0));
		t.ok(!bad.length, 'no line is ever set in by anything but one indent (24px): ' + j(bad));
		const changed = eff.filter(([k, v]) => v.length > 1 && !(v.length === 2 && v.includes(0)));
		t.ok(!changed.length, 'and none passes through two different indents (a line may start at 0 while its own text is typed): ' + j(changed));
		const plain = (await lines(p)).find((l) => l.text.startsWith('Plain after'));
		t.ok(/binders-indented/.test(plain.cls), 'the plain paragraph after a tab paragraph is the one “Indent paragraphs” sets in');
		const tabbed = await lineOf(p, 'One with a tab');
		t.ok(!/binders-indented/.test(tabbed.cls), 'a tab paragraph is not also marked for the indent');
		clean(t, r, 'both settings on');
	} finally { await set(p, { indentParagraphs: false, tabParagraphs: true }); }
});

test('BUG: qa10 paragraphs typing: a note of 2,000 tab paragraphs: after jumping to the end, to the middle and scrolling fast no frame draws a tab line as code; typing at the end and in the middle stays marked', async (p, h, t) => {
	let text = '';
	for (let i = 1; i <= 2000; i++) text += `\tParagraph number ${i}, with *some emphasis* and a [[The keeper|link]], long enough to be a sentence or two of prose in a novel.\n\n`;
	await start(p, text);
	await sleep(p, 1200);
	await record(p);
	await ed(p, `cm.dispatch({ selection: { anchor: cm.state.doc.length }, scrollIntoView: true }); return 1;`); await sleep(p, 600);
	await ed(p, `cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight / 2; return 1;`); await sleep(p, 600);
	for (let i = 0; i < 30; i++) { await p.wheel(900, 500, -3000); await sleep(p, 16); }
	for (let i = 0; i < 40; i++) { await p.wheel(900, 500, 4000); await sleep(p, 16); }
	for (let i = 0; i < 8; i++) { await ed(p, `cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight * ${(i * 0.37) % 1}; return 1;`); await sleep(p, 120); }
	await sleep(p, 500);
	const scrolled = await stop(p);
	t.eq(scrolled.bad.filter((b) => b.src === 'frame').length, 0, 'no frame while scrolling draws a tab line in another look: ' + fmt(scrolled.bad.filter((b) => b.src === 'frame').slice(0, 3)));
	await ed(p, `cm.dispatch({ selection: { anchor: cm.state.doc.length } }); cm.focus(); return 1;`);
	await record(p); await keys(p, '<Enter><Tab>Typed at the end.<Enter>Next.');
	clean(t, await stop(p), 'typing at the end');
	await ed(p, `const l = cm.state.doc.line(1000); cm.dispatch({ selection: { anchor: l.to }, scrollIntoView: true }); cm.focus(); return 1;`); await sleep(p, 400);
	await record(p); await keys(p, '<Enter><Enter><Tab>Typed in the middle.<Enter><Enter>Plain.');
	clean(t, await stop(p), 'typing in the middle');
	marked(t, await lineOf(p, 'Typed in the middle'), 'the paragraph typed in the middle');
});

// ---- I: opening, switching, panes, windows ----

test('opening a note that has tab paragraphs, switching between two such notes in one tab, back and forward, and the three modes: no frame draws a tab line as code', async (p, h, t) => {
	await p.ev(`app.vault.adapter.write(${j(A)}, ${j(FRONT + '\tFirst tab paragraph, *italic*.\n\n\tSecond tab paragraph.\n\nPlain.\n\n    Four spaces.\n')}).then(() => 1)`);
	await p.ev(`app.vault.adapter.write(${j(K)}, ${j(FRONT + '\tKeeper tab paragraph.\n\n\tAnother.\n')}).then(() => 1)`);
	await sleep(p, 500);
	await p.ev(`app.workspace.detachLeavesOfType('markdown'); 1`);
	await record(p);
	for (let i = 0; i < 12; i++) { await p.ev(`app.workspace.getLeaf(false).openFile(${file(i % 2 ? K : A)}).then(() => 1)`); await sleep(p, 250); }
	await p.ev(`app.workspace.getLeaf(false).history.back(); 1`); await sleep(p, 400);
	await p.ev(`app.workspace.getLeaf(false).history.forward(); 1`); await sleep(p, 400);
	for (const [mode, source] of [['source', true], ['preview', false], ['source', false]]) { await p.ev(`(async () => { await app.workspace.getLeaf(false).setViewState({ type: 'markdown', state: { file: ${j(A)}, mode: ${j(mode)}, source: ${j(source)} } }); return 1; })()`); await sleep(p, 500); }
	const r = await stop(p);
	const frames = r.bad.filter((b) => b.src === 'frame');
	t.eq(frames.length, 0, 'no frame draws a tab line in another look: ' + fmt(frames));
	// (the DOM may hold a tab line unmarked for the part of a task between creating an editor and its reading of the note: not asserted, never drawn)
});

test('the same note in two panes, and in a popout window: typing in one marks the lines in both', async (p, h, t) => {
	await start(p, 'First.\n\n\tOne tab para.\n\n‸');
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(${file(A)}); return 1; })()`);
	await sleep(p, 900);
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf-content[data-type="markdown"] .cm-content').length`), 2, 'two editors');
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown')[0]; app.workspace.setActiveLeaf(l, { focus: true }); const cm = l.view.editor.cm; cm.dispatch({ selection: { anchor: cm.state.doc.length } }); cm.focus(); return 1; })()`);
	await sleep(p, 300);
	await record(p); await keys(p, '<Tab>Typed in the left pane.<Enter>Second line.');
	clean(t, await stop(p), 'two panes, typing in the first');
	await sleep(p, 2500); // (Obsidian saves after a pause and the other pane takes the file as saved: typing at once is the writer's race, not ours)
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown')[1]; app.workspace.setActiveLeaf(l, { focus: true }); const cm = l.view.editor.cm; cm.dispatch({ selection: { anchor: cm.state.doc.length } }); cm.focus(); return 1; })()`);
	await record(p); await keys(p, '<Enter>Typed in the right pane.');
	clean(t, await stop(p), 'two panes, typing in the second');
	const both = await p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="markdown"] .cm-content')].map(c => [...c.querySelectorAll('.cm-line')].filter(l => /^\\t\\S/.test(l.textContent)).map(l => l.classList.contains('binders-tab-paragraph')))`);
	t.ok(both.every((pane) => pane.length === 4 && pane.every(Boolean)), 'both panes show their four tab lines as paragraphs: ' + j(both));
	await sleep(p, 2200);
	t.eq(await disk(p), 'First.\n\n\tOne tab para.\n\n\tTyped in the left pane.\n\tSecond line.\n\tTyped in the right pane.', 'the disk has all of it, once');
	const pop = await p.ev(`(async () => { const l = app.workspace.openPopoutLeaf(); await l.openFile(${file(A)}); await new Promise(r => setTimeout(r, 800)); const d = l.view.containerEl.ownerDocument; return { other: d !== document, lines: [...d.querySelectorAll('.cm-content > .cm-line')].filter(x => /^\\t\\S/.test(x.textContent)).map(x => x.classList.contains('binders-tab-paragraph')) }; })()`);
	t.ok(pop.other, 'a popout window is another document');
	t.ok(pop.lines.length === 4 && pop.lines.every(Boolean), 'and its tab lines are paragraphs: ' + j(pop));
});

test('a note outside any binder is untouched while typing: tab lines are code as Obsidian has them', async (p, h, t) => {
	await p.ev(`app.vault.create('Loose.md', '').then(() => 1)`);
	await start(p, '', { path: 'Loose.md', front: false });
	await keys(p, 'Before.<Enter><Enter><Tab>A tab outside a binder, *plain*.');
	t.eq(await ed(p, `return e.getValue()`), 'Before.\n\n\tA tab outside a binder, *plain*.', 'the text');
	const l = (await lines(p)).find((x) => x.text.includes('A tab outside'));
	t.ok(!l.tab && l.code, 'set as code, as Obsidian has it: ' + j(l));
	t.ok(!(await p.ev(`document.querySelector(${j(LEAF + ' .cm-editor')}).classList.contains('binders-prose')`)), 'the editor isn’t marked');
});

// ---- J: findings ----

test('BUG: qa10 paragraphs typing: a binder’s note that is open when Obsidian starts shows its tab paragraphs as code until the first click or key', async (p, h, t) => {
	await start(p, '\tA tab paragraph, with *stress*.\n\nPlain.\n');
	await sleep(p, 3000);
	await p.ev(`(async () => { app.workspace.requestSaveLayout?.(); return 1; })()`);
	await sleep(p, 1500);
	await p.ev(`(() => { setTimeout(() => location.reload(), 50); return 1; })()`);
	await sleep(p, 6000);
	await p.focusMain();
	await until(p, `!!document.querySelector('.cm-content .cm-line')`, 10000);
	const state = () => p.ev(`(() => { const ed = app.workspace.activeEditor; const l = [...document.querySelectorAll('.cm-content > .cm-line')].find(l => /tab paragraph/.test(l.textContent)); return { file: ed?.file?.path, inBinder: !!(ed?.file && app.plugins.plugins.binders?.binders?.binderOf(ed.file)), marked: !!l?.classList.contains('binders-tab-paragraph'), code: !!l?.querySelector('.cm-inline-code') }; })()`);
	await sleep(p, 3000);
	const before = await state();
	t.eq(before.file, A, 'the note is open after the restart');
	t.ok(before.inBinder, 'and is in its binder');
	t.ok(before.marked && !before.code, `its tab line is a paragraph with nothing touched, not code (marked ${before.marked}, code ${before.code})`);
	// (what happens on the first click: it is fixed then, which shows the cause)
	await p.click(700, 420); await sleep(p, 400);
	const after = await state();
	t.ok(after.marked && !after.code, `after a click it is (marked ${after.marked}, code ${after.code})`);
	await p.ev(`(async () => { await ${B}.ready; return 1; })()`);
});

test('BUG: qa10 paragraphs typing: a note moved into a binder while it is open keeps showing its tab lines as code, and one moved out keeps showing them as paragraphs, until the next click or key', async (p, h, t) => {
	await p.ev(`app.vault.create('Loose2.md', '\\tA tab line.\\n\\nPlain.\\n').then(() => 1)`);
	await start(p, '\tA tab line.\n\nPlain.\n', { path: 'Loose2.md', front: false });
	const st = () => p.ev(`(() => { const l = [...document.querySelectorAll(${j(LEAF + ' .cm-content > .cm-line')})].find(l => /A tab line/.test(l.textContent)); return { marked: l.classList.contains('binders-tab-paragraph'), code: !!l.querySelector('.cm-inline-code') }; })()`);
	let s = await st(); t.ok(!s.marked && s.code, 'outside a binder it is code');
	await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Loose2.md'), ${j(L + 'Part One/Loose2.md')}); return 1; })()`);
	await sleep(p, 1500);
	s = await st(); t.ok(s.marked && !s.code, `moved into the binder, with nothing touched: a paragraph (marked ${s.marked}, code ${s.code})`);
	await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/Loose2.md')}), 'Loose3.md'); return 1; })()`);
	await sleep(p, 1500);
	s = await st(); t.ok(!s.marked && s.code, `moved out again, with nothing touched: code (marked ${s.marked}, code ${s.code})`);
});
