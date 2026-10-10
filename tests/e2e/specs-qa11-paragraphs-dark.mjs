// QA round 11, paragraphs in the DARK theme and on the phone's toolbar (src/paragraphs/). Run with `--theme dark`: every
// test checks the theme first. Covered: a tab on an empty line at once (no guide, no code, in every frame); colours,
// backgrounds and fonts of tab paragraphs against plain ones (editor, reading view, manuscript, snapshots); a fenced
// block and a table beside tab lines; "Indent paragraphs" in the manuscript with tab paragraphs in a row (set in once);
// the command "Start a paragraph with a tab" over math, comments, fences and look-alike prose; paste with tabs in the
// middle; undo and redo; and the phone toolbar's own Indent (what it does, and its double tab). Tests named "BUG: " fail
// until what they show is fixed; "NIT: " is a small one. Every test that types reads the disk.
import { readFileSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, file, j, until, withTidy, openView } from './view-helpers.mjs';
import { ARRIVAL, L, LEAF, PHONE, onDevice, tap } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await restore(p); } }) });

const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\n---\n';
const CMD = 'binders:tab-paragraph';
const CARET = '‸';
const DARK = `document.body.classList.contains('theme-dark')`;
const errors = (p) => p.errors.filter((e) => !/Electron Security/.test(e));
const sleep = (p, ms) => p.sleep(ms);

// ---- settings, notes, the editor ----

const set = (p, o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveSettings(); return 1; })()`);
/** Puts the settings the tests turn back as they were, and closes what they opened. */
async function restore(p) {
	await p.key('Escape').catch(() => {});
	await p.ev(`(async () => {
		document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click());
		const pl = ${PL}; Object.assign(pl.settings, { tabParagraphs: true, indentParagraphs: false });
		await pl.saveSettings(); return 1; })()`).catch(() => {});
}
/** The note's body set to `text` (with the properties in front, as a binder's note has them). */
const setNote = (p, path, text, front = true) => p.ev(`app.vault.modify(${file(path)}, ${j((front ? FRONT : '') + text)}).then(() => 1)`);
const open = async (p, path, mode = 'source', source = false) => {
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); await l.setViewState({ type: 'markdown', state: { file: ${j(path)}, mode: ${j(mode)}, source: ${source} } }); return 1; })()`);
	await sleep(p, 700);
};
const ed = (p, code) => p.ev(`(() => { const e = app.workspace.activeEditor.editor, cm = e.cm; ${code} })()`);
/** The editor's text, all of it (properties included), and the same as the disk has it once Obsidian has written it. */
const doc = (p) => p.ev(`app.workspace.activeEditor.editor.getValue()`);
/** Waits for the disk to hold `want` (Obsidian writes a typed note a moment later), then returns what is there. */
async function onDisk(p, path, want) {
	await p.ev(`(async () => { await app.workspace.activeEditor?.save?.(); await ${PL}.binders.flush(); })().then(() => 1)`);
	await until(p, `app.vault.adapter.read(${j(path)}).then(x => x === ${j(want)})`, 5000);
	return readFileSync(join(p.vaultDir, path), 'utf8');
}
/** A note with the caret where ‸ is (or at the end), opened in the editor, focused. */
async function start(p, text, { mode = 'source', source = false, path = ARRIVAL, front = true } = {}) {
	const at = text.indexOf(CARET), clean = text.replace(CARET, '');
	await p.ev(`(async () => { app.workspace.detachLeavesOfType('markdown'); await new Promise(r => setTimeout(r, 100)); await app.vault.modify(${file(path)}, ${j((front ? FRONT : '') + clean)}); await new Promise(r => setTimeout(r, 100)); return 1; })()`);
	await open(p, path, mode, source);
	const off = (front ? FRONT.length : 0) + (at < 0 ? clean.length : at);
	await ed(p, `e.focus(); cm.dispatch({ selection: { anchor: ${off} } }); return 1;`);
	await sleep(p, 200);
}
/** Keys and text in one string: `<Tab>`, `<Enter>`, `<S-Tab>`, `<Backspace>`; anything else is typed. */
async function keys(p, s) {
	for (const part of s.split(/(<[^>]+>)/).filter(Boolean)) {
		const m = /^<(?:(S|C|A)-)?([^>]+)>$/.exec(part);
		if (m) { await p.key(m[2], ...(m[1] ? [{ S: 'shift', C: 'ctrl', A: 'alt' }[m[1]]] : [])); await sleep(p, 60); } else await p.type(part);
	}
	await sleep(p, 250);
}

// ---- the recorder: every frame, every line that starts with a tab or four spaces ----

/** Installed before the action. On each DOM change and each animation frame it looks at the lines that start with a tab
    (or four spaces): a line with words that is not marked as a tab paragraph, an indentation guide drawn in a tab, a line
    set as code, or words in the monospace font. An empty tab line is looked at too (its guide and its code look). Each
    state is kept once, with when it was seen: `window.__qa11`. */
const RECORD = `(() => {
	if (window.__qa11) window.__qa11.stop();
	const R = window.__qa11 = { bad: [], seen: new Set(), on: true, frames: 0, t0: performance.now() };
	const look = () => {
		const out = [];
		for (const l of document.querySelectorAll('.workspace-leaf .cm-content > .cm-line, .binders-manuscript .cm-content > .cm-line')) {
			const t = l.textContent;
			if (!/^(\\t| {4})/.test(t)) continue;
			const words = /\\S/.test(t), why = [];
			const ind = l.querySelector('.cm-indent');
			if (words && !l.classList.contains('binders-tab-paragraph')) why.push('not marked as a tab paragraph');
			if (ind && !/^(none|normal)$/.test(getComputedStyle(ind, '::before').content)) why.push('indentation guide drawn');
			if (l.querySelector('.cm-inline-code') && !/\`/.test(t)) why.push('set as code');
			if (l.classList.contains('HyperMD-codeblock') && !/^(\\t| {4})/.test(t)) why.push('code block line');
			if (words) for (const s of l.querySelectorAll('span')) if (!s.closest('.cm-indent') && !s.querySelector('.cm-indent') && /mono/i.test(getComputedStyle(s).fontFamily)) { why.push('monospace font'); break; }
			if (why.length) out.push({ text: t.slice(0, 24), why: why.join(', ') });
		}
		return out;
	};
	const snap = (src) => { if (!R.on) return; for (const b of look()) { const k = src + '|' + b.text + '|' + b.why; if (!R.seen.has(k)) { R.seen.add(k); R.bad.push({ src, at: Math.round(performance.now() - R.t0), ...b }); } } };
	const mo = new MutationObserver(() => { snap('dom'); requestAnimationFrame(() => snap('frame')); });
	mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
	let raf; const loop = () => { R.frames++; raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); requestAnimationFrame(() => snap('frame'));
	R.stop = () => { R.on = false; mo.disconnect(); cancelAnimationFrame(raf); };
	return 1; })()`;
const record = (p) => p.ev(RECORD);
const stop = (p) => p.ev(`(() => { window.__qa11.stop(); return { bad: window.__qa11.bad, frames: window.__qa11.frames }; })()`);
const fmt = (bad) => bad.map((b) => `${b.src} @${b.at}ms ${JSON.stringify(b.text)}: ${b.why}`).join(' | ');
/** Nothing drawn in another look, in a frame or in the DOM (for longer than a change). */
function clean(t, r, what) {
	t.ok(r.frames > 5, `${what}: the recorder saw frames (${r.frames})`);
	const frames = r.bad.filter((b) => b.src === 'frame');
	t.ok(!frames.length, `${what}: no frame draws a tab line in another look: ${fmt(frames)}`);
	const dom = r.bad.filter((b) => b.src === 'dom');
	t.ok(!dom.length, `${what}: no DOM state holds a tab line in another look: ${fmt(dom)}`);
}

// ---- how a line looks: its colour, background, font and the tab, in the page ----

/** The line (a `.cm-line` or a `p`) that starts with this text, in the places `sel` names. */
const FIND = `(sel, starts) => { const els = [...document.querySelectorAll(sel)].filter(e => e.textContent.replace(/^\\s+/, '').startsWith(starts)); return els.find(e => e.matches('p, .cm-line')) || els[0] || null; }`;
/** How the words of a line are set: colour, font, size, and any background of the line or its parts (none wanted, but a highlight). */
const LOOKS = `(sel, starts) => {
	const find = ${FIND}; const e = find(sel, starts); if (!e) return null;
	const spans = [...e.querySelectorAll('span, em, strong')].filter(s => /\\S/.test(s.textContent) && !s.closest('.cm-indent') && !s.querySelector('*'));
	const cs = getComputedStyle(spans[0] || e);
	const bgs = [e, ...e.querySelectorAll('*')].map(x => [x.tagName.toLowerCase() + '.' + String(x.getAttribute('class') || '').split(' ').join('.'), getComputedStyle(x).backgroundColor]).filter(([, c]) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
	return { color: cs.color, font: cs.fontFamily, size: cs.fontSize, bgs, cls: String(e.className), pre: !!e.closest('pre') || !!e.querySelector('code, pre') };
}`;
const looks = (p, sel, starts) => p.ev(`(${LOOKS})(${j(sel)}, ${j(starts)})`);
/** Where the first letter of a line stands (x, in pixels), and its font size. */
const LETTER = `(sel, starts) => {
	const find = ${FIND}; const e = find(sel, starts); if (!e) return null;
	const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
	while ((n = w.nextNode())) {
		if (n.parentElement.closest('.cm-indent')) continue;
		const i = n.data.search(/\\S/); if (i < 0) continue;
		const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect();
		if (b.width) return { x: Math.round(b.left * 10) / 10, fs: parseFloat(getComputedStyle(e).fontSize) };
	}
	return null;
}`;
const letter = (p, sel, starts) => p.ev(`(${LETTER})(${j(sel)}, ${j(starts)})`);
const EDITOR = `${LEAF} .cm-content > .cm-line`, READING = `${LEAF} .markdown-rendered p`, MANUSCRIPT = '.binders-manuscript .cm-content > .cm-line, .binders-manuscript p';

/** The editor's line, as the tab on it reads: its class, its tab's width and its guide. */
const tabOf = (p, starts, exact = false) => ed(p, `const l = [...document.querySelectorAll(${j(EDITOR)})].find(l => ${exact ? `l.textContent === ${j(starts)}` : `l.textContent.replace(/^\\s+/, '').startsWith(${j(starts)})`}); if (!l) return null; const i = l.querySelector('.cm-indent'); return { text: l.textContent, cls: l.className, w: i ? Math.round(i.getBoundingClientRect().width * 10) / 10 : null, guide: i ? getComputedStyle(i, '::before').content : null, code: /HyperMD-codeblock/.test(l.className) || !!l.querySelector('.cm-inline-code') };`);
/** The editor's lines (the active tab's): text and class, for a log. */
const dump = (p) => p.ev(`[...document.querySelectorAll(${j(EDITOR)})].map(l => JSON.stringify(l.textContent) + (/binders-tab-paragraph/.test(l.className) ? ' [tab]' : '') + (/HyperMD-codeblock/.test(l.className) ? ' [code]' : '')).join(' | ')`);
/** The caret, by the editor's line (counted from the top of the note, properties included) and column. */
const caretTo = (p, line, ch) => p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor({ line: ${line}, ch: ${ch} }); return JSON.stringify(e.getCursor()); })()`);
const lineIndex = (p, starts) => p.ev(`app.workspace.activeEditor.editor.getValue().split('\\n').findIndex(l => l.replace(/^\\t/, '').startsWith(${j(starts)}))`);

// ---- the phone's toolbar, by touch (as specs-qa10-paragraphs-touch.mjs has it) ----

/** The toolbar Obsidian puts over the keyboard: its Indent and Unindent buttons, by their icons. */
const toolbar = (p) => p.ev(`(() => {
	const list = document.querySelector('.mobile-toolbar-options-list'); if (!list) return null;
	const all = [...document.querySelectorAll('.mobile-toolbar-option')], icon = (e) => (e.querySelector('svg')?.getAttribute('class') || '').replace('svg-icon ', '');
	const find = (n) => { const e = all.find((e) => icon(e) === n); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), index: all.indexOf(e), seen: r.left >= 0 && r.right <= innerWidth }; };
	return { count: all.length, indent: find('lucide-indent'), outdent: find('lucide-outdent'), width: innerWidth, top: Math.round(document.querySelector('.mobile-toolbar').getBoundingClientRect().top) };
})()`);
/** Swipes the toolbar's row of buttons until a button is in sight. */
async function toolbarReach(p, icon) {
	for (let swipes = 0; swipes < 8; swipes++) {
		const t = await toolbar(p), b = t?.[icon];
		if (!b) throw new Error('no ' + icon + ' button in the toolbar: ' + JSON.stringify(t));
		if (b.seen) return { swipes, ...b };
		const y = t.top + 22;
		await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t.width - 30, y }] });
		for (let i = 1; i <= 8; i++) { await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t.width - 30 - (i * (t.width - 90)) / 8, y }] }); await p.sleep(16); }
		await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await p.sleep(600);
	}
	throw new Error(icon + ' button is not reached in 8 swipes');
}
const tapToolbar = async (p, icon) => { const b = await toolbarReach(p, icon); await tap(p, b.x, b.y, 450); return b; };
/** A finger's tap on a line of the phone's editor (by what it starts with), at its start. */
async function tapLine(p, starts) {
	const r = await p.ev(`(() => { const l = [...document.querySelectorAll(${j(EDITOR)})].find(l => l.textContent.replace(/^\\s+/, '').startsWith(${j(starts)})); if (!l) return null; l.scrollIntoView({ block: 'center' }); const b = l.getBoundingClientRect(); return { x: b.left + 50, y: b.top + Math.min(b.height / 2, 14) }; })()`);
	if (!r) throw new Error('no line starts with “' + starts + '”');
	await sleep(p, 150);
	await tap(p, r.x, r.y, 450);
}
/** Where the caret stands on the screen (x of its line's end, from the editor's own measure). */
const caretX = (p) => p.ev(`(() => { const e = app.workspace.activeEditor.editor; const c = e.cm.coordsAtPos(e.posToOffset(e.getCursor())); return c ? Math.round(c.left * 10) / 10 : null; })()`);

// ---- the manuscript ----

const manuscript = async (p, folder = L + 'Part One') => {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-manuscript')`, 8000);
	await sleep(p, 600);
};

// ============================================================================================================
// 1. The desktop, the dark theme: a tab on an empty line
// ============================================================================================================

test('dark: a Tab on an empty line is the paragraph’s indent at once, in every frame: no guide, no code, and the words typed after it have the colour and font of the plain text beside them', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	await start(p, 'Before the gap.\n‸\nAfter the gap.\n');
	await record(p);
	await keys(p, '<Tab>');
	const blank = await tabOf(p, '\t', true);
	t.ok(blank && blank.w !== null, 'the empty line has a tab after Tab: ' + JSON.stringify(blank));
	t.ok(blank && (blank.guide === 'none' || blank.guide === 'normal'), 'no indentation guide in the empty tab (' + (blank && blank.guide) + ')');
	t.ok(blank && !blank.code, 'not set as code');
	await sleep(p, 300);
	t.eq(await doc(p), FRONT + 'Before the gap.\n\t\nAfter the gap.\n', 'the document has one tab on that line');
	await keys(p, 'Typed');
	const typed = await tabOf(p, 'Typed');
	t.ok(typed && /binders-tab-paragraph/.test(typed.cls), 'with a letter the line is a tab paragraph: ' + (typed && typed.cls));
	const plain = await looks(p, EDITOR, 'After the gap'), tab = await looks(p, EDITOR, 'Typed');
	t.ok(plain && tab, 'both lines are there');
	t.eq(tab.color, plain.color, 'the tab paragraph’s text is the colour of the plain text beside it');
	t.eq(tab.font, plain.font, 'and its font is the same');
	t.eq(tab.bgs.length, 0, 'with no background of its own (' + JSON.stringify(tab.bgs) + ')');
	const r = await stop(p);
	clean(t, r, 'the empty tab and typing');
	t.eq(await onDisk(p, ARRIVAL, FRONT + 'Before the gap.\n\tTyped\nAfter the gap.\n'), FRONT + 'Before the gap.\n\tTyped\nAfter the gap.\n', 'the disk has exactly that');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 2. Colours, backgrounds and fonts of tab paragraphs against plain ones, in every surface
// ============================================================================================================

test('dark: a tab paragraph reads as the plain paragraphs beside it, in the editor, in reading view and in the manuscript: the same colour, font and size, with no background of its own', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	const text = 'Plain flush paragraph, in the dark.\n\n\tTab paragraph in the dark, with *emphasis* in it.\n\nPlain again after it.\n';
	await setNote(p, ARRIVAL, text);
	const surfaces = [['the editor', async () => open(p, ARRIVAL, 'source', false), EDITOR], ['reading view', async () => open(p, ARRIVAL, 'preview'), READING]];
	for (const [what, go, sel] of surfaces) {
		await go();
		await until(p, `!!document.querySelector(${j(sel)})`, 4000);
		await sleep(p, 400);
		const plain = await looks(p, sel, 'Plain flush'), tab = await looks(p, sel, 'Tab paragraph'), again = await looks(p, sel, 'Plain again');
		t.ok(plain && tab && again, what + ': the three paragraphs are there');
		if (!(plain && tab && again)) continue;
		if (what === 'the editor') t.ok(/binders-tab-paragraph/.test(tab.cls), what + ': the tab line is a tab paragraph (' + tab.cls + ')');
		t.eq(tab.color, plain.color, what + ': the same colour as a plain paragraph');
		t.eq(tab.font, plain.font, what + ': the same font');
		t.eq(tab.size, plain.size, what + ': the same size');
		t.ok(!tab.pre, what + ': not set as code');
		t.eq(tab.bgs.length, 0, what + ': no background of its own (' + JSON.stringify(tab.bgs) + ')');
		t.eq(again.bgs.length, 0, what + ': the plain paragraph after it has none either');
	}
	await manuscript(p);
	const mPlain = await looks(p, MANUSCRIPT, 'Plain flush'), mTab = await looks(p, MANUSCRIPT, 'Tab paragraph');
	if (mPlain && mTab) {
		t.eq(mTab.color, mPlain.color, 'the manuscript: the same colour as a plain paragraph');
		t.eq(mTab.bgs.length, 0, 'the manuscript: no background (' + JSON.stringify(mTab.bgs) + ')');
		t.ok(!mTab.pre, 'the manuscript: not code');
	} else t.ok(false, 'the manuscript shows the note (' + JSON.stringify([mPlain, mTab]) + ')');
	t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 3. Fenced code beside tab lines: the fence stays code, a tab line in it stays code, the paragraph after is prose
// ============================================================================================================

test('dark: a fenced block next to a tab paragraph: the fence (and a tab-led line inside it) stays code with its background; the tab paragraph after it has none', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	const text = 'Before the block.\n\n```\n\tcode line inside the fence\n```\n\n\tA tab paragraph after the fence.\n';
	await setNote(p, ARRIVAL, text);
	await open(p, ARRIVAL, 'source', false);
	await until(p, `!!document.querySelector(${j(EDITOR)})`, 4000);
	await sleep(p, 500);
	const inside = await ed(p, `return [...document.querySelectorAll('.workspace-leaf .cm-content > .cm-line')].find(l => l.textContent.includes('code line inside')).className;`);
	t.ok(!/binders-tab-paragraph/.test(inside), 'the tab-led line inside the fence is not a paragraph: ' + inside);
	const after = await tabOf(p, 'A tab paragraph');
	t.ok(after && /binders-tab-paragraph/.test(after.cls), 'the tab line after the fence is a tab paragraph: ' + (after && after.cls));
	const plain = await looks(p, EDITOR, 'Before the block'), tab = await looks(p, EDITOR, 'A tab paragraph');
	t.eq(tab.bgs.length, 0, 'the tab paragraph has no background (' + JSON.stringify(tab.bgs) + ')');
	t.eq(tab.color, plain.color, 'and the colour of the plain text');
	await open(p, ARRIVAL, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-rendered pre')})`, 4000);
	await sleep(p, 400);
	const pre = await p.ev(`(() => { const pre = document.querySelector(${j(LEAF + ' .markdown-rendered pre')}); if (!pre) return null; return { text: pre.textContent, bg: getComputedStyle(pre).backgroundColor }; })()`);
	t.ok(pre && /code line inside the fence/.test(pre.text), 'reading view: the fence is a code block with its line in it: ' + JSON.stringify(pre));
	t.ok(pre && pre.bg !== 'rgba(0, 0, 0, 0)' && pre.bg !== 'transparent', 'the code block has its background (' + (pre && pre.bg) + ')');
	const rp = await looks(p, READING, 'A tab paragraph');
	t.ok(rp && rp.bgs.length === 0 && !rp.pre, 'reading view: the tab paragraph has no background and is not code (' + JSON.stringify(rp) + ')');
	const n = await p.ev(`document.querySelectorAll(${j(LEAF + ' .markdown-rendered pre')}).length`);
	t.eq(n, 1, 'reading view: one code block, the fence, and nothing else');
	t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 4. A tab line straight under a table row (no blank line between): the table is still a table
// ============================================================================================================

test('dark: a tab-led line straight under a table row, with no blank line: the table is still a table in reading view, no line is code, and the disk is as typed', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	const text = '| Name | Role |\n| --- | --- |\n| Mara | Keeper |\n\tA tab line under the table row.\n\nAfter the table.\n';
	await setNote(p, ARRIVAL, text);
	await open(p, ARRIVAL, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-rendered table')})`, 4000);
	await sleep(p, 500);
	const rv = await p.ev(`(() => { const tb = document.querySelector(${j(LEAF + ' .markdown-rendered table')}); const rows = tb ? [...tb.querySelectorAll('tr')].map(r => r.textContent) : []; const under = [...document.querySelectorAll(${j(LEAF + ' .markdown-rendered p, ' + LEAF + ' .markdown-rendered td, ' + LEAF + ' .markdown-rendered div')})].filter(e => e.textContent.includes('A tab line under')).map(e => ({ tag: e.tagName, cls: String(e.className), inTable: !!e.closest('table'), code: !!e.closest('pre') })); return { tables: document.querySelectorAll(${j(LEAF + ' .markdown-rendered table')}).length, rows, under, pre: document.querySelectorAll(${j(LEAF + ' .markdown-rendered pre')}).length }; })()`);
	log('reading view under the table:', JSON.stringify(rv));
	t.eq(rv.tables, 1, 'reading view: one table');
	t.ok(rv.rows.length >= 2 && rv.rows.some(r => r.includes('Mara')), 'the table keeps its row with Mara (' + JSON.stringify(rv.rows) + ')');
	t.eq(rv.pre, 0, 'no code block from the tab line');
	t.ok(rv.under.length >= 1 && rv.under.every(u => !u.code), 'the tab line is shown, not as code (' + JSON.stringify(rv.under) + ')');
	await open(p, ARRIVAL, 'source', false);
	await until(p, `!!document.querySelector(${j(EDITOR)})`, 4000);
	await sleep(p, 400);
	const ed1 = await tabOf(p, 'A tab line under');
	t.ok(ed1 && !ed1.code, 'the editor: not set as code (' + JSON.stringify(ed1) + ')');
	t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 5. "Indent paragraphs" in the manuscript: tab paragraphs in a row are set in once, not twice
// ============================================================================================================

test('dark: “Indent paragraphs” with tab paragraphs in a row, in the manuscript and in the editor: each tab paragraph is set in once (1.5em), and the plain one after them is set in by the indent', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	await set(p, { indentParagraphs: true });
	const text = 'Opening paragraph, flush.\n\n\tTab paragraph one, set in once.\n\n\tTab paragraph two, set in once.\n\nPlain after the two tabs.\n';
	await setNote(p, ARRIVAL, text);
	const check = (what, where, sel) => async () => {
		const flush = await letter(p, sel, 'Opening paragraph'), one = await letter(p, sel, 'Tab paragraph one'), two = await letter(p, sel, 'Tab paragraph two'), plain = await letter(p, sel, 'Plain after');
		t.ok(flush && one && two && plain, what + ': the four paragraphs are there ' + JSON.stringify([flush, one, two, plain]));
		if (!(flush && one && two && plain)) return;
		const em1 = flush.fs;
		t.ok(Math.abs(one.x - flush.x - 1.5 * em1) < 1.5, what + ': tab paragraph one is set in 1.5em (' + (one.x - flush.x).toFixed(1) + 'px of ' + (1.5 * em1) + ')');
		t.ok(Math.abs(two.x - flush.x - 1.5 * em1) < 1.5, what + ': tab paragraph two is set in 1.5em, not twice (' + (two.x - flush.x).toFixed(1) + 'px of ' + (1.5 * em1) + ')');
		t.ok(Math.abs(plain.x - flush.x - 1.5 * em1) < 1.5, what + ': the plain paragraph after is set in by the indent (' + (plain.x - flush.x).toFixed(1) + 'px)');
	};
	await open(p, ARRIVAL, 'source', false);
	await until(p, `!!document.querySelector(${j(EDITOR)})`, 4000);
	await sleep(p, 500);
	await check('the editor', 'live', EDITOR)();
	await manuscript(p);
	await until(p, `!!document.querySelector('.binders-manuscript')`, 4000);
	await sleep(p, 400);
	await check('the manuscript', 'manuscript', MANUSCRIPT)();
	await set(p, { indentParagraphs: false });
	t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 6. The Snapshots sheet, in the dark theme
// ============================================================================================================

test('dark: the Snapshots sheet shows a tab paragraph as the plain paragraphs beside it do: the same colour and font, no background, not code', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	const text = 'Plain before, in the snapshot.\n\n\tTab in the snapshot, dark.\n\nPlain after, in the snapshot.\n';
	await setNote(p, ARRIVAL, text);
	await open(p, ARRIVAL);
	await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`);
	await sleep(p, 400);
	await p.ev(`(async () => { await ${PL}.binders.snapshotsSettle(); await ${PL}.binders.flush(); return 1; })()`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
	await until(p, `[...document.querySelectorAll('.modal.binders-snapshots p')].some(e => e.textContent.includes('Tab in the snapshot'))`, 8000);
	await sleep(p, 300);
	const sel = '.modal.binders-snapshots p';
	const plain = await looks(p, sel, 'Plain before'), tab = await looks(p, sel, 'Tab in the snapshot');
	try {
		t.ok(plain && tab, 'the dialog shows the three paragraphs ' + JSON.stringify([plain && plain.cls, tab && tab.cls]));
		if (plain && tab) {
			t.eq(tab.color, plain.color, 'the same colour as the plain paragraph');
			t.eq(tab.font, plain.font, 'the same font');
			t.eq(tab.bgs.length, 0, 'no background of its own (' + JSON.stringify(tab.bgs) + ')');
			t.ok(!tab.pre, 'not code');
		}
	} finally { await p.key('Escape'); await sleep(p, 300); }
	t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'the note on disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 7. A note with no properties, whose first line is a tab line
// ============================================================================================================

test('dark: a note with no properties whose first line is a tab line: the line is a paragraph in the editor and in reading view, and nothing is code', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	const text = '\tThe first line of the note, a tab paragraph.\n\nSecond, plain.\n';
	await setNote(p, ARRIVAL, text, false);
	await open(p, ARRIVAL, 'source', false);
	await until(p, `!!document.querySelector(${j(EDITOR)})`, 4000);
	await sleep(p, 500);
	const first = await tabOf(p, 'The first line');
	t.ok(first && /binders-tab-paragraph/.test(first.cls) && !first.code, 'in the editor it is a tab paragraph (' + (first && first.cls) + ')');
	await open(p, ARRIVAL, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-rendered p')})`, 4000);
	await sleep(p, 400);
	const rv = await looks(p, READING, 'The first line');
	t.ok(rv && !rv.pre && rv.bgs.length === 0, 'in reading view it is a paragraph, not code (' + JSON.stringify(rv) + ')');
	t.eq(await p.ev(`document.querySelectorAll(${j(LEAF + ' .markdown-rendered pre')}).length`), 0, 'no code block at all');
	t.eq(await onDisk(p, ARRIVAL, text), text, 'the note on disk is as it was: no properties added');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 8. The command "Start a paragraph with a tab" over math, comments, fences and prose that looks like markup
// ============================================================================================================

test('BUG: the command “Start a paragraph with a tab” over a selection that holds a $$ math block and a %% comment: the lines inside them get a tab too, and the math and the comment are changed', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	const text = 'Opening line.\n\n$$\nx = y + 1\n$$\n\n%%\nA comment line.\n%%\n\n```\nfenced line\n```\n\nClosing line.\n';
	await start(p, text.replace('Opening', CARET + 'Opening'), { path: ARRIVAL });
	await ed(p, `e.setSelection({ line: 0, ch: 0 }, { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1;`);
	await p.ev(`(() => { app.commands.executeCommandById(${j(CMD)}); return 1; })()`);
	await sleep(p, 400);
	const want = text.replace('Opening line.', '\tOpening line.').replace('Closing line.', '\tClosing line.');
	const got = await doc(p);
	log('after the command:', JSON.stringify(got.slice(FRONT.length)));
	t.eq(got.slice(FRONT.length), want, 'only the two prose lines get a tab: the math, the comment and the fenced line are as they were');
	await p.key('z', 'ctrl');
	await sleep(p, 300);
	t.eq(await doc(p), FRONT + text, 'one step of undo puts the note back');
	t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'and the disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('dark: the command over look-alike prose: “2024”, “-5”, “+1”, “*Emphasis*” take one tab each; a list, a heading, a quote, a rule, a table row and “1986.” (a list) are left as they are; one undo', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	const text = 'Plain.\n\n2024 was a good year.\n\n-5 degrees out there.\n\n+1 for the boat.\n\n*Emphasis* opens it.\n\n1986. was the year.\n\n# Heading\n\n- item\n\n> quote\n\n---\n\n| a | b |\n';
	await start(p, text.replace('Plain.', CARET + 'Plain.'), { path: ARRIVAL });
	await ed(p, `e.setSelection({ line: 0, ch: 0 }, { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1;`);
	await p.ev(`(() => { app.commands.executeCommandById(${j(CMD)}); return 1; })()`);
	await sleep(p, 400);
	const want = text.replace('Plain.', '\tPlain.').replace('2024 was', '\t2024 was').replace('-5 degrees', '\t-5 degrees').replace('+1 for', '\t+1 for').replace('*Emphasis*', '\t*Emphasis*');
	const got = (await doc(p)).slice(FRONT.length);
	t.eq(got, want, 'the four prose lines get one tab each and nothing else changes');
	await p.key('z', 'ctrl');
	await sleep(p, 300);
	t.eq(await doc(p), FRONT + text, 'one step of undo takes all of it back');
	t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'the disk is as it was');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 9. Paste with tabs in the middle of a line, and three tabs at the start of one
// ============================================================================================================

test('dark: paste with tabs: a tab in the middle of a tab paragraph is not drawn as an indent; three tabs at the start of an empty line make a tab paragraph; the disk is what was pasted', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	await start(p, '\tAlpha paragraph.\n\n‸\nClosing.\n');
	await record(p);
	// (a paste at the end of the tab line: its tab in the middle of the words)
	const ai = await lineIndex(p, 'Alpha paragraph');
	await caretTo(p, ai, (await doc(p)).split('\n')[ai].length);
	await paste(p, 'Mid\tline tab.');
	await sleep(p, 300);
	log('after the paste:', await dump(p));
	const mid = await tabOf(p, 'Alpha paragraph');
	t.ok(mid && /binders-tab-paragraph/.test(mid.cls), 'the line is still a tab paragraph (' + (mid && mid.cls) + ')');
	t.eq(await p.ev(`document.querySelectorAll(${j(EDITOR)})[0]?.querySelectorAll('.cm-indent').length`), 1, 'one indent drawn: the tab in the middle is not one');
	t.eq(await doc(p), FRONT + '\tAlpha paragraph.Mid\tline tab.\n\n\nClosing.\n', 'the middle tab is in the text as pasted (' + JSON.stringify((await doc(p)).slice(FRONT.length)) + ')');
	// three tabs at the start of the empty line
	const li = await p.ev(`(() => { const e = app.workspace.activeEditor.editor; for (let i = 0; i <= e.lastLine(); i++) if (e.getLine(i) === '') return i; return -1; })()`);
	await caretTo(p, li, 0);
	await paste(p, '\t\t\tThree tabs at once.');
	await sleep(p, 400);
	const three = (await doc(p)).split('\n')[li];
	log('three tabs line:', JSON.stringify(three), await dump(p));
	t.eq(three, '\t\t\tThree tabs at once.', 'the three tabs arrive as they were');
	const tw = await tabOf(p, 'Three tabs');
	t.ok(tw && /binders-tab-paragraph/.test(tw.cls), 'the line is a tab paragraph (' + (tw && tw.cls) + ')');
	const r = await stop(p);
	clean(t, r, 'paste');
	t.eq(await onDisk(p, ARRIVAL, await doc(p)), await doc(p), 'the disk has what the editor has');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 10. Undo and redo through a tab's coming and going: Backspace, the command, Tab
// ============================================================================================================

test('dark: Backspace takes a tab off, the command puts one on, and undo and redo walk back and forth through both with no look drawn but the paragraph’s, and the disk ends as typed', async (p, h, t) => {
	t.ok(await p.ev(DARK), 'the run is in the dark theme');
	await start(p, '\tAlpha paragraph, dark.\n\nBeta plain.\n‸');
	const orig = await doc(p);
	await record(p);
	// Backspace at the start of the text takes the tab: the line is plain
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor({ line: 4, ch: 1 }); return 1; })()`);
	await p.key('Backspace');
	await sleep(p, 250);
	const s1 = await doc(p);
	t.eq(s1, orig.replace('\tAlpha', 'Alpha'), 'Backspace takes the tab off');
	// the command on the plain line puts one back on it
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor({ line: 6, ch: 3 }); app.commands.executeCommandById(${j(CMD)}); return 1; })()`);
	await sleep(p, 250);
	const s2 = await doc(p);
	t.eq(s2, orig.replace('\tAlpha', 'Alpha').replace('Beta plain.', '\tBeta plain.'), 'the command puts the tab on the line the caret is on');
	// undo twice: back to after Backspace, then to the note as opened; redo twice
	await p.key('z', 'ctrl'); await sleep(p, 250);
	t.eq(await doc(p), s1, 'undo takes the command back');
	await p.key('z', 'ctrl'); await sleep(p, 250);
	t.eq(await doc(p), orig, 'undo takes the Backspace back: the tab is there again');
	await p.key('y', 'ctrl'); await sleep(p, 250);
	t.eq(await doc(p), s1, 'redo brings the Backspace back');
	await p.key('y', 'ctrl'); await sleep(p, 250);
	t.eq(await doc(p), s2, 'and redo the command');
	const r = await stop(p);
	clean(t, r, 'the walk through undo and redo');
	t.eq(await onDisk(p, ARRIVAL, FRONT + s2), FRONT + s2, 'the disk ends as typed');
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ============================================================================================================
// 11. The phone's own toolbar Indent, in the dark theme
// ============================================================================================================

test('BUG: phone (dark): the toolbar’s Indent on a line that is already a tab paragraph makes a second tab; the Tab key does not (the maintainer’s decision, 2026-10-09)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		t.ok(await p.ev(DARK), 'the run is in the dark theme');
		const text = 'One plain paragraph.\n\n\tTwo, already a tab paragraph.\n';
		await setNote(p, ARRIVAL, text);
		await open(p, ARRIVAL);
		const i = await lineIndex(p, 'Two, already');
		await tapLine(p, 'Two, already');
		await caretTo(p, i, 0);
		await tapToolbar(p, 'indent');
		const line = (await doc(p)).split('\n')[i];
		log('after the toolbar Indent:', JSON.stringify(line));
		t.eq(line, '\tTwo, already a tab paragraph.', 'Indent on it keeps one tab (' + JSON.stringify(line.slice(0, 4)) + ')');
		await tapToolbar(p, 'outdent');
		t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'Unindent: the note is as it was');
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
});

test('phone (dark): the toolbar’s Indent on a heading line and on a table row: what it does, written down; no text is lost and the disk is what the editor has', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		t.ok(await p.ev(DARK), 'the run is in the dark theme');
		const text = '# A heading for the phone\n\n| Name | Role |\n| --- | --- |\n| Mara | Keeper |\n\nAfter.\n';
		await setNote(p, ARRIVAL, text);
		await open(p, ARRIVAL);
		const out = {};
		for (const [key, starts] of [['heading', '# A heading'], ['table', '| Mara']]) {
			const i = await lineIndex(p, starts);
			await tapLine(p, starts);
			await caretTo(p, i, 0);
			await tapToolbar(p, 'indent');
			out[key] = (await doc(p)).split('\n')[i];
			await tapToolbar(p, 'outdent');
		}
		log('Indent on the heading:', JSON.stringify(out.heading), 'on the table row:', JSON.stringify(out.table));
		const back = await doc(p);
		t.ok(back.includes('# A heading for the phone') && back.includes('| Mara | Keeper |'), 'after Unindent both lines are as they were');
		t.ok(out.heading.startsWith('\t') && out.heading.indexOf('\t', 1) === -1, 'Indent on the heading adds one tab, and only one (' + JSON.stringify(out.heading) + ')');
		t.ok(out.table.startsWith('\t') && out.table.indexOf('\t', 1) === -1, 'Indent on the table row adds one tab, and only one (' + JSON.stringify(out.table) + ')');
		t.eq(await onDisk(p, ARRIVAL, FRONT + text), FRONT + text, 'the note on disk is as it was');
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
});

test('phone (dark): the toolbar’s Indent on an empty line between two paragraphs, then a letter: the caret stays where the first letter lands, so the letter does not move', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		t.ok(await p.ev(DARK), 'the run is in the dark theme');
		await setNote(p, ARRIVAL, 'One plain paragraph.\n\n\nTwo plain paragraph.\n');
		await open(p, ARRIVAL);
		const i = await p.ev(`(() => { const e = app.workspace.activeEditor.editor; for (let k = 0; k <= e.lastLine(); k++) if (e.getLine(k) === '' && k > 4) return k; return -1; })()`);
		await tapLine(p, 'One plain');
		await caretTo(p, i, 0);
		await tapToolbar(p, 'indent');
		await sleep(p, 300);
		const before = await caretX(p);
		await p.type('W');
		await sleep(p, 300);
		const L = await letter(p, EDITOR, 'W');
		log('caret before the letter', before, 'the letter at', L && L.x);
		t.ok(L && before !== null && Math.abs(L.x - before) < 1.5, 'the letter stands where the caret was (' + before + ' against ' + (L && L.x) + ')');
		t.ok((await doc(p)).split('\n')[i] === '\tW', 'the line is one tab and the letter: ' + JSON.stringify((await doc(p)).split('\n')[i]));
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
});

test('phone (dark): the toolbar’s Indent, a letter typed, then undo and redo: each undo step is a state that was typed, and the disk ends as typed', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		t.ok(await p.ev(DARK), 'the run is in the dark theme');
		const text = 'One plain.\n\nTwo plain.\n';
		await setNote(p, ARRIVAL, text);
		await open(p, ARRIVAL);
		const i = await lineIndex(p, 'Two plain');
		await tapLine(p, 'Two plain');
		await caretTo(p, i, 0);
		await tapToolbar(p, 'indent');
		await sleep(p, 300);
		await p.type('Hi ');
		await sleep(p, 300);
		const final = await doc(p);
		t.eq(final.split('\n')[i], '\tHi Two plain.', 'after Indent and “Hi ”: ' + JSON.stringify(final.split('\n')[i]));
		const states = [];
		for (let k = 0; k < 12; k++) { await p.key('z', 'ctrl'); await sleep(p, 250); const s = await doc(p); states.push(s); if (s === FRONT + text) break; }
		log('undo states:', JSON.stringify(states.map((s) => s.split('\n')[i])));
		t.eq(states[states.length - 1], FRONT + text, 'undo, step by step, reaches the note as it was');
		for (let k = 0; k < states.length; k++) {
			const s = states[k].split('\n')[i];
			t.ok(/^\t?(H|Hi|Hi )?\s?Two plain\.$/.test(s) && s.indexOf('\t', 1) === -1, 'undo step ' + (k + 1) + ' is one that was typed, with one tab at most: ' + JSON.stringify(s));
		}
		for (let k = 0; k < 12 && (await doc(p)) !== final; k++) { await p.key('y', 'ctrl'); await sleep(p, 250); }
		await sleep(p, 300);
		t.eq(await doc(p), final, 'redo gets all of it back');
		t.eq(await onDisk(p, ARRIVAL, final), final, 'and the disk ends as typed');
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
});

// ---- paste helper: text on the clipboard, pasted as a paste is (keeps the tabs) ----
async function paste(p, s) {
	await p.ev(`(() => { const cm = app.workspace.activeEditor.editor.cm; const dt = new DataTransfer(); dt.setData('text/plain', ${j(s)}); cm.contentDOM.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1; })()`);
}
const log = (...a) => { if (process.env.QA11_LOG) console.log('   ', ...a); };
