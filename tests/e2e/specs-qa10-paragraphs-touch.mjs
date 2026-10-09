// QA round 10, paragraphs on a phone and a tablet (src/paragraphs/): Obsidian's mobile mode (app.emulateMobile) with real
// touches over CDP, at phone widths (320, 375, 390, 430 and their sides) and a tablet's (820 × 1180, 1180 × 820). Tests
// named "qa10 paragraphs touch: …". How the phone is emulated, and what that can't do, is in specs-qa5-manuscript.mjs:
// the on-screen keyboard is a shorter viewport and `Input.insertText` (text arrives as `beforeinput`/`input` with no
// keydown); a hardware keyboard is real key events. Every test that types reads the disk afterwards, byte for byte.
// QA10_SHOTS=<dir> saves screenshots; QA10_LOG=1 prints what the tests measure.
import { mkdirSync } from 'fs';
import { PL, VIEW, file, j, until, withTidy } from './view-helpers.mjs';
import { ARRIVAL, KEEPER, L, LEAF, PHONE, SMALL, BIG, TABLET, binder, caret, disk, keyboard, land, metrics, onDevice, openMs, saveAll, settle, sc, M, tap, tapText } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa10 paragraphs touch: ' + name, fn: withTidy(fn) });
const SHOTS = process.env.QA10_SHOTS || '', LOG = !!process.env.QA10_LOG;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const log = (...a) => { if (LOG) console.log('   ', ...a); };

const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\nplotlines:\n  - Mara\n---\n';
const errors = (p) => p.errors.filter((e) => !/Electron Security/.test(e));
const IPHONE_SE = [375, 667];

// ---- notes, settings, the tab of its own ----
const setNote = (p, path, text) => p.ev(`app.vault.modify(${file(path)}, ${j(FRONT + text)}).then(() => 1)`);
const set = (p, o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveSettings(); return 1; })()`);
const font = (p, px) => p.ev(`(() => { app.vault.setConfig('baseFontSize', ${px}); app.updateFontSize?.(); return 1; })()`);
const open = async (p, path, mode = 'source', source = false) => {
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); await l.setViewState({ type: 'markdown', state: { file: ${j(path)}, mode: ${j(mode)}, source: ${source} } }); return 1; })()`);
	await p.sleep(700);
};
/** Obsidian's editor of the active note: its text. */
const doc = (p) => p.ev(`app.workspace.activeEditor.editor.getValue()`);
/** What is on disk (Obsidian writes a typed note after a moment: this asks it to now) and what the editor holds. */
const onDisk = async (p, path) => { await p.ev(`(async () => { await app.workspace.activeEditor?.save?.(); await ${PL}.binders.flush(); })().then(() => 1)`); await p.sleep(2600); return disk(p, path); };

/** A finger's tap on a line of the editor (by what it starts with), at a character of it. Puts the caret there. */
async function tapLine(p, starts, root = LEAF, at = 'start') {
	const r = await p.ev(`(() => { const l = [...document.querySelectorAll(${j(root + ' .cm-content > .cm-line')})].find(l => l.textContent.replace(/^\\s+/, '').startsWith(${j(starts)})); if (!l) return null; l.scrollIntoView({ block: 'center' }); const b = l.getBoundingClientRect(); return { x: ${at === 'end' ? 'b.right - 6' : 'b.left + 50'}, y: b.top + Math.min(b.height / 2, 14) }; })()`);
	if (!r) throw new Error('no line starts with “' + starts + '”');
	await p.sleep(150);
	await tap(p, r.x, r.y, 450);
}
/** Puts the caret in Obsidian's editor by line and column (a finger's tap cannot choose a column to the letter). */
const caretTo = (p, line, ch) => p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor({ line: ${line}, ch: ${ch} }); return JSON.stringify(e.getCursor()); })()`);

/** The line of an editor that starts with this text (tab or not): what it is and where its letters stand. */
const GEOM = `(root, starts) => {
	const l = [...document.querySelectorAll(root + ' .cm-content > .cm-line')].find((l) => l.textContent.replace(/^\\s+/, '').startsWith(starts));
	if (!l) return null;
	const cs = getComputedStyle(l), lb = l.getBoundingClientRect(), left = lb.left + parseFloat(cs.paddingLeft);
	// the rows the text is set in: the leftmost point of each row of the letters (not of the tab's own box)
	const rows = new Map(), w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
	let n, first = null;
	while ((n = w.nextNode())) {
		if (n.parentElement.closest('.cm-indent') || !n.data.trim()) continue;
		const g = document.createRange(); g.selectNodeContents(n);
		for (const r of g.getClientRects()) { if (!r.width) continue; const k = Math.round(r.top / 4); rows.set(k, Math.min(rows.get(k) ?? 1e9, r.left)); if (!first) first = r.left; }
	}
	const ind = [...l.querySelectorAll('.cm-indent')];
	const sc = l.closest('.cm-scroller');
	return { text: l.textContent, cls: l.className, style: l.getAttribute('style') || '', content: Math.round(left * 10) / 10, first: Math.round(first * 10) / 10, rows: [...rows.values()].map((v) => Math.round(v * 10) / 10), tabs: ind.length, tabW: Math.round(ind.reduce((a, e) => a + e.getBoundingClientRect().width, 0) * 10) / 10, guide: ind[0] ? getComputedStyle(ind[0], '::before').content : '', code: !!l.querySelector('.cm-inline-code'), codeLine: /HyperMD-codeblock/.test(l.className), font: getComputedStyle(l.querySelector('span:not(.cm-indent):not(.cm-hmd-indented-code)') || l).fontFamily, fontSize: cs.fontSize, textIndent: cs.textIndent, scrollW: sc.scrollWidth, clientW: sc.clientWidth, docW: document.documentElement.scrollWidth, winW: innerWidth };
}`;
const geom = (p, starts, root = LEAF) => p.ev(`(${GEOM})(${j(root)}, ${j(starts)})`);
const em = (g) => parseFloat(g.fontSize);

/** The editor's lines: text, classes and the tab's width (every line, for the timelines). */
const snapshotLines = `(root) => [...document.querySelectorAll(root + ' .cm-content > .cm-line')].map((l) => { const i = l.querySelector('.cm-indent'); return JSON.stringify(l.textContent) + ' ' + l.className.replace(/\\bcm-line\\b|\\bcm-active\\b/g, '').trim() + (i ? ' tab=' + Math.round(i.getBoundingClientRect().width) + ' guide=' + getComputedStyle(i, '::before').content : '') + (l.querySelector('.cm-inline-code') ? ' CODE' : ''); }).join(' | ')`;
const dump = (p, root = LEAF) => p.ev(`(${snapshotLines})(${j(root)})`);

/** The toolbar Obsidian puts over the keyboard: its Indent and Unindent buttons by their icons (they have no names),
    where they are on the screen, and how far the toolbar has to be moved to bring each into sight. */
const toolbar = (p) => p.ev(`(() => {
	const list = document.querySelector('.mobile-toolbar-options-list'); if (!list) return null;
	const all = [...document.querySelectorAll('.mobile-toolbar-option')], icon = (e) => (e.querySelector('svg')?.getAttribute('class') || '').replace('svg-icon ', '');
	const find = (n) => { const e = all.find((e) => icon(e) === n); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), index: all.indexOf(e), seen: r.left >= 0 && r.right <= innerWidth }; };
	return { count: all.length, indent: find('lucide-indent'), outdent: find('lucide-outdent'), width: innerWidth, scroll: list.scrollLeft, scrollW: list.scrollWidth, top: Math.round(document.querySelector('.mobile-toolbar').getBoundingClientRect().top) };
})()`);
/** Swipes the toolbar's row of buttons with a finger until a button (by icon) is in sight; returns the swipes it took. */
async function toolbarReach(p, icon) {
	let swipes = 0;
	for (; swipes < 8; swipes++) {
		const t = await toolbar(p), b = t?.[icon];
		if (!b) throw new Error('no ' + icon + ' button in the toolbar: ' + j(t));
		if (b.seen) return { swipes, ...b };
		const y = t.top + 22;
		await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t.width - 30, y }] });
		for (let i = 1; i <= 8; i++) { await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t.width - 30 - (i * (t.width - 90)) / 8, y }] }); await p.sleep(16); }
		await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await p.sleep(600);
	}
	throw new Error(icon + ' button is not reached in 8 swipes: ' + j(await toolbar(p)));
}
const tapToolbar = async (p, icon) => { const b = await toolbarReach(p, icon); await tap(p, b.x, b.y, 450); return b; };

// ---------------------------------------------------------------------------------------------------------------
// 1. How a writer on a phone starts a paragraph with a tab
// ---------------------------------------------------------------------------------------------------------------

test('phone: Obsidian’s toolbar “Indent” button puts a tab at the start of a plain line, and the line is a tab paragraph; “Unindent” takes it back; the note on disk has exactly that tab', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		const text = 'First plain paragraph.\n\nSecond plain paragraph, long enough to wrap around the narrow column of a phone, for sure, yes it is.\n';
		await setNote(p, ARRIVAL, text);
		await open(p, ARRIVAL);
		await tapLine(p, 'Second plain');
		await caretTo(p, 8, 0); // (frontmatter is 6 lines + the first paragraph and a blank line: "Second" is line 8)
		t.eq(await p.ev(`app.workspace.activeEditor.editor.getLine(app.workspace.activeEditor.editor.getCursor().line).slice(0, 6)`), 'Second', 'the caret is at the start of the second paragraph');
		const tb = await toolbar(p);
		log('toolbar', j(tb));
		t.ok(!!tb?.indent && !!tb?.outdent, 'Obsidian’s toolbar has Indent and Unindent buttons');
		t.ok(tb.indent.w >= 36 && tb.indent.h >= 36, 'the buttons are finger-sized: ' + j(tb.indent));
		const reach = await tapToolbar(p, 'indent');
		log('Indent reached after swipes', reach.swipes, j(reach));
		t.ok(reach.swipes >= 0, 'Indent was reached after ' + reach.swipes + ' swipe(s) of the toolbar (it is the ' + (reach.index + 1) + 'th of ' + tb.count + ' buttons)');
		t.eq((await doc(p)).split('\n')[8].slice(0, 7), '\tSecond', 'the line now starts with a tab (and only one)');
		await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`, 3000);
		const g = await geom(p, 'Second plain');
		log('after Indent', j(g));
		t.ok(/binders-tab-paragraph/.test(g.cls), 'and the line is a tab paragraph straight away (' + g.cls + ')');
		t.ok(!g.code && !g.codeLine, 'not set as code');
		t.ok(Math.abs(g.tabW - 1.5 * em(g)) < 1.5, 'the tab is the paragraph indent, 1.5em (' + g.tabW + 'px at ' + g.fontSize + ')');
		t.ok(g.guide === 'none' || g.guide === 'normal', 'with no guide line in it (' + g.guide + ')');
		t.ok(g.rows.length >= 2 && g.rows.slice(1).every((x) => Math.abs(x - g.content) < 1.5), 'wrapped lines stand at the margin (' + j(g.rows) + ' from ' + g.content + ')');
		t.eq(await onDisk(p, ARRIVAL), FRONT + '' + text.replace('Second', '\tSecond'), 'the note on disk is the text with that tab, nothing else');
		// Unindent
		await tapToolbar(p, 'outdent');
		t.eq((await doc(p)).split('\n')[8].slice(0, 7), 'Second ', 'Unindent takes the tab off');
		await until(p, `!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`, 3000);
		t.eq(await onDisk(p, ARRIVAL), FRONT + text, 'and the note is as it was');
		t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
	});
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Typing in a tab paragraph on a phone, narrow columns, on-screen keyboard (text as `input` events)
// ---------------------------------------------------------------------------------------------------------------

const LONG = 'The boat left her on the jetty, with the lamp already lit and the keeper nowhere to be seen, so she carried her own bag up the path.';
for (const [label, size] of [['320 × 568', SMALL], ['375 × 667', IPHONE_SE], ['430 × 932', BIG]]) {
	test(`phone ${label}: a tab paragraph is drawn as one (the tab 1.5em, wrapped lines at the margin, no guide line, no sideways scroll); typing at its end, Enter and a letter, Backspace over the tab: the disk is exactly what was typed`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await setNote(p, ARRIVAL, `\t${LONG}\n\nPlain.\n`);
			await open(p, ARRIVAL);
			await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
			let g = await geom(p, 'The boat left');
			log(label, 'at rest', j(g));
			t.ok(/binders-tab-paragraph/.test(g.cls) && !g.code && !g.codeLine, 'the tab line is a tab paragraph, not code: ' + g.cls);
			t.ok(g.guide === 'none' || g.guide === 'normal', 'no guide line in the tab (' + g.guide + ')');
			t.ok(Math.abs(g.first - g.content - 1.5 * em(g)) < 1.5, `the first line is set in by 1.5em: ${g.first - g.content}px of ${1.5 * em(g)}`);
			t.ok(g.rows.length >= 3 && g.rows.slice(1).every((x) => Math.abs(x - g.content) < 1.5), `wrapped lines stand at the margin: ${j(g.rows)} from ${g.content}`);
			t.ok(g.scrollW <= g.clientW && g.docW <= g.winW, `nothing sticks out sideways (${g.scrollW}/${g.clientW}, page ${g.docW}/${g.winW})`);
			t.eq(g.textIndent, '0px', 'wrapped lines are not hung under the tab');
			await shot(p, `rest-${size[0]}`);
			// the keyboard comes up, the end of the paragraph is tapped, and a word is typed as a keyboard does
			await tapLine(p, 'The boat left');
			await keyboard(p, size, true);
			const end = (await doc(p)).split('\n').findIndex((l) => l.startsWith('\tThe boat'));
			await caretTo(p, end, 1 + LONG.length);
			await p.type(' Then she knocked.');
			await p.key('Enter');
			await p.type('S');
			await p.sleep(200);
			log(label, 'after Enter and S:', await dump(p));
			g = await geom(p, 'S');
			t.ok(g && /binders-tab-paragraph/.test(g.cls), 'Enter at the end carries the tab, and with a letter typed the new line is a tab paragraph: ' + g?.cls);
			await p.type('he did not wait for anyone, but walked up the long path to the door of the keeper and rapped on it twice.');
			await p.sleep(200);
			g = await geom(p, 'She did not');
			t.ok(Math.abs(g.first - g.content - 1.5 * em(g)) < 1.5, `the new paragraph is set in by 1.5em: ${g.first - g.content}px`);
			t.ok(g.rows.length >= 2 && g.rows.slice(1).every((x) => Math.abs(x - g.content) < 1.5), `its wrapped lines stand at the margin: ${j(g.rows)}`);
			t.ok(g.scrollW <= g.clientW && g.docW <= g.winW, 'nothing sticks out sideways');
			// the caret stays in sight above the keyboard
			// Backspace at the start of the new paragraph's text takes the tab: the line is a plain one
			const li = (await doc(p)).split('\n').findIndex((l) => l.startsWith('\tShe did'));
			await caretTo(p, li, 1);
			await p.key('Backspace');
			await p.sleep(250);
			t.eq((await doc(p)).split('\n')[li].slice(0, 7), 'She did', 'Backspace over the tab leaves the line without it');
			g = await geom(p, 'She did not');
			t.ok(!/binders-tab-paragraph/.test(g.cls) && g.tabs === 0, 'and the line is plain again: ' + g.cls);
			const want = FRONT + `\t${LONG} Then she knocked.\n\tShe did not wait for anyone, but walked up the long path to the door of the keeper and rapped on it twice.`.replace('\tShe did', 'She did') + '\n\nPlain.\n';
			t.eq(await onDisk(p, ARRIVAL), want.replace(/\n\n\nPlain/, '\n\nPlain'), 'the note on disk is exactly what was typed');
			t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
		});
	});
}
// ---------------------------------------------------------------------------------------------------------------
// 3. A tablet with an external keyboard: Tab key events
// ---------------------------------------------------------------------------------------------------------------

for (const [label, size] of [['820 × 1180', TABLET], ['1180 × 820', land(TABLET)]]) {
	test(`tablet ${label}, an external keyboard: Tab at the start of a plain line, Enter at the end of a tab paragraph and a letter, Backspace over the tab, Shift+Tab; each leaves exactly what was typed on disk`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'Obsidian is in its tablet mode');
			await setNote(p, ARRIVAL, `Plain one.\n\nPlain two, which is long enough to wrap on a tablet column as well as it does elsewhere in a book. ${LONG} ${LONG} ${LONG}\n`);
			await open(p, ARRIVAL);
			await tapLine(p, 'Plain two');
			const n = (await doc(p)).split('\n').findIndex((l) => l.startsWith('Plain two'));
			await caretTo(p, n, 0);
			await p.key('Tab');
			await p.sleep(250);
			t.eq((await doc(p)).split('\n')[n].slice(0, 6), '\tPlain', 'Tab at the start of a plain line puts a tab there');
			let g = await geom(p, 'Plain two');
			log(label, 'after Tab', j(g));
			t.ok(/binders-tab-paragraph/.test(g.cls) && !g.code, 'and it is a tab paragraph at once: ' + g.cls);
			t.ok(Math.abs(g.first - g.content - 1.5 * em(g)) < 1.5, `set in by 1.5em: ${g.first - g.content}px`);
			t.ok(g.rows.length >= 3 && g.rows.slice(1).every((x) => Math.abs(x - g.content) < 1.5), `wrapped lines at the margin: ${j(g.rows)} from ${g.content}`);
			t.ok(g.scrollW <= g.clientW && g.docW <= g.winW, 'nothing sticks out sideways');
			// Enter at the end carries the tab; a letter makes the line a tab paragraph
			const last = n;
			await caretTo(p, last, (await doc(p)).split('\n')[last].length);
			await p.key('Enter');
			await p.type('Next');
			await p.sleep(200);
			log(label, 'after Enter and Next', await dump(p));
			t.eq((await doc(p)).split('\n')[last + 1], '\tNext', 'Enter at the end of a tab paragraph carries the tab');
			t.ok(/binders-tab-paragraph/.test((await geom(p, 'Next')).cls), 'and the new line is a tab paragraph once a letter is typed');
			// Backspace over the tab
			await caretTo(p, last + 1, 1);
			await p.key('Backspace');
			t.eq((await doc(p)).split('\n')[last + 1], 'Next', 'Backspace after the tab takes the tab');
			// Tab in the middle of a line: where Obsidian puts it
			await caretTo(p, last + 1, 2);
			await p.key('Tab');
			log(label, 'Tab mid line:', JSON.stringify((await doc(p)).split('\n')[last + 1]));
			await p.key('z', 'ctrl');
			// Shift+Tab on a tab paragraph
			await caretTo(p, last, 5);
			await p.key('Tab', 'shift');
			await p.sleep(250);
			log(label, 'Shift+Tab:', JSON.stringify((await doc(p)).split('\n')[last].slice(0, 8)));
			t.ok(!(await doc(p)).split('\n')[last].startsWith('\t'), 'Shift+Tab takes the tab off');
			t.ok(!/binders-tab-paragraph/.test((await geom(p, 'Plain two')).cls), 'and the line is plain');
			const d = await doc(p);
			t.eq(await onDisk(p, ARRIVAL), d, 'the disk has what the editor has');
			t.ok(d.includes('Plain two') && d.includes('Next') && d.length > 300, 'and no text was lost');
			t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
		});
	});
}

// ---------------------------------------------------------------------------------------------------------------
// 4. A per-frame sampler: every distinct state a tab line goes through while something happens
// ---------------------------------------------------------------------------------------------------------------

/** Installed before the action, in the page: on every animation frame it records the state of each line that starts with
    a tab (editor lines and rendered paragraphs, and any code block in a note's text) whenever it changes. What it calls
    bad: a tab line drawn as code (a code block, or in the monospace font), with a guide line in its tab, without the
    tab-paragraph class (a line with words in it), and a line whose first letter moves sideways (x changes) from one
    state to the next after it had been drawn right. Every run keeps a timeline, `window.__qs.log`. */
const SAMPLER = `(() => {
	if (window.__qs) window.__qs.stop();
	const q = window.__qs = { log: [], bad: new Set(), frames: 0, t0: performance.now(), on: true, last: new Map(), stop() { this.on = false; } };
	const mono = getComputedStyle(document.body).getPropertyValue('--font-monospace').trim().split(',')[0].trim();
	const firstX = (l) => { const w = document.createTreeWalker(l, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.parentElement.closest('.cm-indent') || !n.data.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); const r = g.getClientRects()[0]; if (r) return Math.round((r.left - l.getBoundingClientRect().left - parseFloat(getComputedStyle(l).paddingLeft)) * 2) / 2; } return null; };
	const note = (key, s) => { if (q.last.get(key) === s) return; q.last.set(key, s); q.log.push(Math.round(performance.now() - q.t0) + 'ms f' + q.frames + ' ' + key + ' ' + s); if (/CODE|GUIDE|UNMARKED/.test(s)) q.bad.add(key + ' ' + s); };
	const tick = () => {
		if (!q.on) return;
		q.frames++;
		for (const l of document.querySelectorAll('.cm-content > .cm-line')) {
			const text = l.textContent;
			if (!/^\\t|^ {4}/.test(text) || !text.trim() || !l.getClientRects().length || l.getBoundingClientRect().bottom < 0 || l.getBoundingClientRect().top > innerHeight) continue;
			const i = l.querySelector('.cm-indent'), body = l.querySelector('span:not(.cm-indent):not(.cm-hmd-indented-code)');
			const font = body ? getComputedStyle(body).fontFamily : '';
			const flags = [];
			if (/HyperMD-codeblock/.test(l.className) || (mono && font.includes(mono))) flags.push('CODE');
			if (i && getComputedStyle(i, '::before').content !== 'none' && getComputedStyle(i, '::before').content !== 'normal') flags.push('GUIDE');
			if (!/binders-tab-paragraph/.test(l.className)) flags.push('UNMARKED');
			note('edit "' + text.trim().slice(0, 14) + '"', (flags.join('+') || 'ok') + ' x=' + firstX(l) + ' tab=' + (i ? Math.round(i.getBoundingClientRect().width) : '-'));
		}
		for (const e of document.querySelectorAll('.markdown-rendered pre:not(.frontmatter), .markdown-rendered p, .binders-manuscript-rendered pre, .binders-manuscript-rendered p')) {
			if (!e.getClientRects().length) continue;
			if (e.matches('pre') && !e.closest('.frontmatter') && !e.querySelector('.language-yaml')) note('pre "' + e.textContent.trim().slice(0, 14) + '"', 'CODE block');
			else if (e.matches('p') && e.classList.contains('binders-tab-paragraph')) note('para "' + e.textContent.trim().slice(0, 14) + '"', 'ok indent=' + getComputedStyle(e).textIndent);
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return 1;
})()`;
const sample = (p) => p.ev(SAMPLER);
const sampled = async (p) => { const r = await p.ev(`(() => { const q = window.__qs; q.stop(); return { frames: q.frames, log: q.log, bad: [...q.bad] }; })()`); log('frames', r.frames, '\n      ' + r.log.join('\n      ')); return r; };

/** One tab paragraph's life while the action runs: no frame has it as code or with a guide line, and its first letter
    stands in one place. */
const calm = (t, r, what) => {
	t.eq(j(r.bad), '[]', `${what}: no frame draws a tab line as code, with a guide line or unmarked (${r.frames} frames)`);
	const xs = new Map();
	for (const l of r.log) { const m = /^\d+ms f\d+ (edit "[^"]*") ok x=([\d.]+)/.exec(l); if (m) (xs.get(m[1]) ?? xs.set(m[1], new Set()).get(m[1])).add(m[2]); }
	t.eq(j([...xs].filter(([, s]) => s.size > 1).map(([k, s]) => k + ' ' + [...s].join('→'))), '[]', `${what}: no tab line moves sideways once it is drawn right`);
};

const TABS = `\tThe boat left *her* on the **jetty**, by [[The keeper|the lamp]]. ${LONG}\n\tIt did not wait for a mispeled word.\n\nPlain paragraph.\n\tA tabbed line under it.\n`;

for (const [label, size] of [['a phone', PHONE], ['a small phone on its side', land(SMALL)], ['a tablet', TABLET]]) {
	test(`${label}: opening a note (live preview, source mode, reading view) in its tab: no frame draws a tab line as code or with a guide line, or moves it sideways`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await setNote(p, ARRIVAL, TABS);
			// (on a screen 320 px tall the properties and the title fill the page, and the tab lines are below the fold, where the
			// sampler, which looks at what is in sight, sees none: the properties are hidden for the test)
			const props = await p.ev(`app.vault.getConfig('propertiesInDocument') ?? 'visible'`);
			if (size[1] < 400) await p.ev(`(() => { app.vault.setConfig('propertiesInDocument', 'hidden'); app.workspace.updateOptions(); return 1; })()`);
			try {
			for (const [what, mode, source] of [['live preview', 'source', false], ['source mode', 'source', true], ['reading view', 'preview', false]]) {
				await open(p, KEEPER); // (another note first, so this one is opened afresh)
				await sample(p);
				await open(p, ARRIVAL, mode, source);
				await p.sleep(900);
				const r = await sampled(p);
				calm(t, r, `${label}, ${what}`);
				t.ok(r.log.some((l) => /ok/.test(l)), `${what}: the tab lines were drawn (${r.log.length} states)`);
			}
			} finally { await p.ev(`(() => { app.vault.setConfig('propertiesInDocument', ${j(props)}); app.workspace.updateOptions(); return 1; })()`); }
			t.eq(await disk(p, ARRIVAL), FRONT + TABS, 'the note on disk is as it was');
		});
	});
}

// ---------------------------------------------------------------------------------------------------------------
// 5. The manuscript on a phone: only the tapped section is an editor
// ---------------------------------------------------------------------------------------------------------------

/** What the manuscript shows of a section: rendered paragraphs or the editor's lines, and whether any is code. */
const section = (p, path) => p.ev(`(() => { const s = ${sc(path)}; const b = s.bodyEl; return { live: !!s.live, pres: [...b.querySelectorAll('pre:not(.frontmatter)')].length, paras: [...b.querySelectorAll('p')].map((e) => ({ text: e.textContent.slice(0, 14), marks: e.querySelectorAll('.binders-tab').length, markW: Math.round(e.querySelector('.binders-tab')?.getBoundingClientRect().width ?? 0) })), lines: [...b.querySelectorAll('.cm-line')].map((l) => ({ text: l.textContent.slice(0, 14), cls: l.className })), scrollW: ${M}.root.scrollWidth, clientW: ${M}.root.clientWidth, docW: document.documentElement.scrollWidth, winW: innerWidth }; })()`);

/** Scrolls the page so a text of a section is in the middle of the screen, then taps it (a finger can't touch what is
    below the fold of a small phone). */
async function tapIn(p, path, needle, off = 0) {
	await p.ev(`(() => { const w = document.createTreeWalker(${sc(path)}.bodyEl, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.data.includes(${j(needle)})) { n.parentElement.scrollIntoView({ block: 'center' }); return 1; } } return 0; })()`);
	await p.sleep(400);
	return tapText(p, path, needle, off);
}
/** Where the first letter of this text stands in a section, left edge in px (rendered or live). */
const xOf = (p, path, needle) => p.ev(`(() => { const w = document.createTreeWalker(${sc(path)}.bodyEl, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.data.indexOf(${j(needle)}); if (i < 0) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const r = g.getClientRects()[0]; return r ? Math.round(r.left * 2) / 2 : null; } return null; })()`);

const ONE = 'Tabs/One.md';
/** Enough text after a note for the manuscript to have a scrollbar of its own on a tablet (without one, a tap that makes the page longer moves it 6 px). */
const FILLER = Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1}, which is only here to make the page long.`).join('\n\n') + '\n';
/** The binder made by `binder(p, 'Tabs', …)` taken away, so another can be made. */
const tidyTabs = async (p) => { await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Tabs'); if (f) await app.vault.delete(f, true); return 1; })()`); await p.sleep(300); };
for (const [label, size] of [['a small phone', SMALL], ['a phone', PHONE], ['a big phone', BIG], ['a phone on its side', land(PHONE)], ['a tablet', TABLET], ['a tablet on its side', land(TABLET)]]) {
	test(`${label}: in the manuscript a section’s tab lines are paragraphs before and after it is tapped; the tap puts the caret by the letter touched; typing, Enter and Backspace leave exactly what was typed; no frame is code or has a guide line`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await binder(p, 'Tabs', { One: TABS, Two: 'A second note.\n', Three: FILLER });
			await sample(p);
			await openMs(p, 'Tabs');
			let s = await section(p, ONE);
			log(label, 'rendered', j(s));
			if (Math.min(...size) < 600) t.ok(!s.live, 'the section is plain text until it is tapped');
			t.eq(s.pres, 0, 'no code block in it');
			if (!s.live) t.ok(s.paras[0].marks >= 2 && s.paras[0].markW === 24, 'its first two tab lines each begin with the indent (the manuscript draws a tab as a mark): ' + j(s.paras));
			const before = {};
			for (const n of ['The boat left', 'It did not']) before[n] = await xOf(p, ONE, n);
			t.ok(s.scrollW <= s.clientW && s.docW <= s.winW, `nothing sticks out sideways (${s.scrollW}/${s.clientW}, ${s.docW}/${s.winW})`);
			await shot(p, `manuscript-rendered-${size[0]}`);
			// a finger on the word “jetty”
			await tapText(p, ONE, 'jetty', 0);
			await until(p, `!!${sc(ONE)}.live`, 4000);
			await p.sleep(400);
			s = await section(p, ONE);
			log(label, 'live', j(s));
			t.ok(s.live && s.lines.some((l) => /binders-tab-paragraph/.test(l.cls)), 'tapped, the section is an editor whose tab lines are tab paragraphs: ' + j(s.lines));
			const after = {};
			for (const n of ['The boat left', 'It did not']) after[n] = await xOf(p, ONE, n);
			log(label, 'x before/after the tap', j(before), j(after));
			t.eq(j(after), j(before), 'no tab line’s first letter moves sideways when the section becomes an editor');
			const c = await caret(p);
			log(label, 'caret', j(c));
			const at = await p.ev(`(() => { const e = ${sc(ONE)}.live.cm; const h = e.state.selection.main.head; const d = e.state.doc.toString(); return d.slice(Math.max(0, h - 8), h) + '|' + d.slice(h, h + 8); })()`);
			t.ok(/on the \|(\*\*)?jetty/.test(at) || /\*\*\|jetty/.test(at), 'the caret is where the finger was, before the word “jetty” (or its bold marks): ' + at);
			await keyboard(p, size, true);
			await p.type('X');
			await p.sleep(300);
			const doc2 = await p.ev(`${sc(ONE)}.live.cm.state.doc.toString()`);
			t.eq(doc2.replace('X', ''), TABS, 'one X was typed, and nothing else changed');
			t.ok(/\*\*X?jetty|jXetty|jeXtty/.test(doc2) || doc2.includes('Xjetty'), 'at the finger: ' + doc2.slice(0, 80));
			await p.key('Backspace');
			// Enter at the end of the second tab paragraph, a word, then Backspace over its tab
			const n2 = (await p.ev(`${sc(ONE)}.live.cm.state.doc.toString()`)).split('\n').findIndex((l) => l.startsWith('\tIt did not'));
			await p.ev(`(() => { const cm = ${sc(ONE)}.live.cm; const ln = cm.state.doc.line(${n2 + 1}); cm.dispatch({ selection: { anchor: ln.to } }); return 1; })()`);
			await p.key('Enter');
			await p.type('Two');
			await p.sleep(300);
			s = await section(p, ONE);
			const two = s.lines.find((l) => l.text.trim().startsWith('Two'));
			t.ok(two && /binders-tab-paragraph/.test(two.cls), 'Enter at the end carries the tab, and the new line is a tab paragraph once it has a letter: ' + j(two));
			await p.ev(`(() => { const cm = ${sc(ONE)}.live.cm; const ln = cm.state.doc.lineAt(cm.state.selection.main.head); cm.dispatch({ selection: { anchor: ln.from + 1 } }); return 1; })()`); // (just after the tab)
			await p.key('Backspace');
			await p.sleep(250);
			t.ok(!(await p.ev(`${sc(ONE)}.live.cm.state.doc.toString()`)).includes('\tTwo'), 'Backspace after the tab takes the tab');
			await saveAll(p);
			const want = TABS.replace('\tIt did not wait for a mispeled word.\n', '\tIt did not wait for a mispeled word.\nTwo\n');
			t.eq(disk(p, ONE), want, 'the note on disk is exactly the text with “Two” on a new line');
			const r = await sampled(p);
			calm(t, r, label);
			t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
		});
	});
}

// A tab line straight under a plain line (no blank line between) carries on that paragraph for Markdown, which drops its
// tab; Binders marks it in reading view (reading view's post-processor) and the editor draws it indented, but the
// manuscript's plain text (everything on a phone until a section is tapped), the snapshot windows and focus mode are
// rendered by Binders itself with `tabsForRender`, which marks only the lines `tabLines` calls tab paragraphs.
test('BUG: a tab line straight under a plain line is indented in the editor and in reading view but flush left in the manuscript’s plain text on a phone, so it jumps when the section is tapped', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await binder(p, 'Tabs', { One: 'Plain line.\n\tA tabbed line under it.\n', Two: 'A second note.\n' });
		await openMs(p, 'Tabs');
		const rendered = await xOf(p, ONE, 'A tabbed line'), margin = await xOf(p, ONE, 'Plain line');
		log('lazy line: rendered x', rendered, 'margin', margin);
		await tapText(p, ONE, 'Plain line', 0);
		await until(p, `!!${sc(ONE)}.live`, 4000);
		await p.sleep(400);
		const live = await xOf(p, ONE, 'A tabbed line');
		log('lazy line: live x', live);
		t.eq(live - margin, 24, 'in the editor the tab line is set in by the indent');
		t.eq(rendered, live, 'and the manuscript’s plain text sets it in the same (' + rendered + ' px before the tap, ' + live + ' after)');
	});
});

// ---------------------------------------------------------------------------------------------------------------
// 6. The indent's width: 1.5em against a narrow column and the phone's larger text sizes
// ---------------------------------------------------------------------------------------------------------------

const URL60 = 'https://example.com/a-very-long-address-that-has-no-place-to-break/at/all/ever';
for (const [label, size] of [['320 × 568', SMALL], ['375 × 667', IPHONE_SE], ['844 × 390', land(PHONE)]]) {
	test(`phone ${label}: at the text sizes a phone offers (16, 20, 24, 30 px) the tab is 1.5em, the first line keeps room for words, a word as long as the column wraps inside it, and nothing scrolls sideways (editor, reading view, manuscript)`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			const text = `\tShort words in a tab paragraph that run on to several lines of the page. ${URL60}\n\n\t${URL60}${URL60}\n`;
			await binder(p, 'Tabs', { One: text, Two: 'A second note.\n' });
			const dbg = [];
			for (const px of [16, 20, 24, 30]) {
				await font(p, px);
				await open(p, ONE, 'source', false);
				await p.sleep(400);
				let g = await geom(p, 'Short words');
				dbg.push([px, g.tabW, g.first - g.content, g.clientW, g.rows.length].join('/'));
				t.ok(Math.abs(g.tabW - 1.5 * em(g)) < 1.5, `${px} px: the tab is 1.5em (${g.tabW} px of ${1.5 * em(g)})`);
				t.ok(Math.abs(g.first - g.content - 1.5 * em(g)) < 1.5, `${px} px: and the first line is set in by that much (${g.first - g.content})`);
				t.ok(g.rows.length >= 2 && g.rows.slice(1).every((x) => Math.abs(x - g.content) < 1.5), `${px} px: wrapped lines at the margin (${j(g.rows)} from ${g.content})`);
				t.ok(g.scrollW <= g.clientW && g.docW <= g.winW, `${px} px editor: nothing sticks out sideways (${g.scrollW}/${g.clientW}, page ${g.docW}/${g.winW})`);
				const q = await geom(p, 'https://example');
				t.ok(q.scrollW <= q.clientW && q.docW <= q.winW, `${px} px editor: a tab line of one long word doesn't scroll sideways either (${q.scrollW}/${q.clientW})`);
				// the column the words have
				const col = g.clientW - 2 * g.content;
				log(label, px + ' px', 'indent', g.tabW, 'column', col, 'share', Math.round((g.tabW / col) * 100) + '%');
				t.ok(g.tabW / col < 0.25, `${px} px: the indent is under a quarter of the column (${g.tabW} of ${col} px)`);
				// reading view
				await open(p, ONE, 'preview');
				await p.sleep(500);
				const r = await p.ev(`(() => { const v = document.querySelector(${j(LEAF + ' .markdown-reading-view .markdown-preview-view')}) || document.querySelector(${j(LEAF + ' .markdown-reading-view')}); const sec = document.querySelector(${j(LEAF + ' .markdown-preview-sizer')}); return { scrollW: v.scrollWidth, clientW: v.clientWidth, docW: document.documentElement.scrollWidth, winW: innerWidth, pres: document.querySelectorAll(${j(LEAF + ' .markdown-reading-view pre:not(.frontmatter)')}).length, indents: [...document.querySelectorAll(${j(LEAF + ' .markdown-reading-view p.binders-tab-paragraph')})].map((e) => getComputedStyle(e).textIndent) }; })()`);
				t.ok(r.scrollW <= r.clientW + 1 && r.docW <= r.winW, `${px} px reading view: nothing sticks out sideways (${j(r)})`);
				t.eq(r.pres, 0, `${px} px reading view: no code block`);
				t.ok(r.indents.length >= 2 && r.indents.every((x) => Math.abs(parseFloat(x) - 1.5 * px) < 1.5), `${px} px reading view: the indent is 1.5em (${j(r.indents)})`);
			}
			log(label, 'px / tab / first-line indent / client / rows:', dbg.join('  '));
			// the manuscript, at the largest size (without the long word: that one is the BUG test below)
			const short = '\tShort words in a tab paragraph that run on to several lines of the page.\n'; await p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${j(ONE)}), ${j(short)}).then(() => 1)`); await openMs(p, 'Tabs');
			const m = await section(p, ONE);
			t.ok(m.scrollW <= m.clientW && m.docW <= m.winW, `manuscript at 30 px: nothing sticks out sideways (${m.scrollW}/${m.clientW}, ${m.docW}/${m.winW})`);
			t.eq(m.pres, 0, 'manuscript: no code block');
			t.ok(m.paras[0].marks >= 1 && Math.abs(m.paras[0].markW - 45) < 1.5, 'manuscript at 30 px: the indent is 1.5em: ' + j(m.paras[0]));
			await tapText(p, ONE, 'Short words', 0);
			await until(p, `!!${sc(ONE)}.live`, 4000);
			await p.sleep(400);
			const lv = await section(p, ONE);
			t.ok(lv.scrollW <= lv.clientW && lv.docW <= lv.winW, `manuscript editor at 30 px: nothing sticks out sideways (${lv.scrollW}/${lv.clientW})`);
			t.eq(disk(p, ONE), short, 'the note on disk is as it was');
		});
	});
}

// Not about tabs (a plain paragraph does the same), found while measuring: the manuscript hides what sticks out
// sideways (`.binders-manuscript { overflow-x: hidden }`), so on a phone a word longer than the column (a web address)
// is cut off at the screen's edge in the plain text of every section, and wraps in the one that is tapped.
test('BUG: the manuscript’s plain text on a phone cuts off a word longer than the column (80 letters, no hyphen) at the edge of the screen; the editor wraps it', async (p, h, t) => {
	await onDevice(p, SMALL, async () => {
		await binder(p, 'Tabs', { One: `Words ${'abcdefghij'.repeat(8)}\n`, Two: 'A second note.\n' });
		await openMs(p, 'Tabs');
		const end = () => p.ev(`(() => { const w = document.createTreeWalker(${sc(ONE)}.bodyEl, NodeFilter.SHOW_TEXT); let n, right = 0; while ((n = w.nextNode())) { if (!n.data.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); for (const r of g.getClientRects()) right = Math.max(right, r.right); } return Math.round(right); })()`);
		const r = await end();
		log('rendered: the right edge of the text', r, 'of', 320);
		t.ok(r <= 320, `the plain text stays inside the screen (its right edge is at ${r} of 320 px)`);
	});
});

// ---------------------------------------------------------------------------------------------------------------
// 7. "Indent paragraphs": the editor, reading view, the manuscript's text and its editor, an embed agree
// ---------------------------------------------------------------------------------------------------------------

/** Where the first letter of this text stands inside a root (a JS expression), left edge in px. */
const xIn = (p, root, needle) => p.ev(`(() => { const r = ${root}; if (!r) return null; const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.parentElement.getClientRects().length) continue; const i = n.data.indexOf(${j(needle)}); if (i < 0) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const q = g.getClientRects()[0]; return q ? Math.round(q.left * 2) / 2 : null; } return null; })()`);
const PAGE = 'First paragraph, flush with the margin.\n\nSecond paragraph follows another, so it is set in.\n\n# A heading\n\nAfter a heading: flush.\n\nFourth paragraph, set in again.\n\n\tFifth, typed with a tab, set in once and not twice.\n\nSixth follows the tabbed one.\n\n> A quote\n\nAfter a quote: flush.\n';
/** What each paragraph's first-letter offset from the margin should be, in the order of NEEDLES. */
const NEEDLES = ['First paragraph', 'Second paragraph', 'After a heading', 'Fourth paragraph', 'Fifth, typed', 'Sixth follows', 'After a quote'];
const EXPECT = (px) => [0, px, 0, px, px, px, 0];
const offsets = async (p, root) => { const xs = []; for (const n of NEEDLES) xs.push(await xIn(p, root, n)); const m = xs[0]; return xs.map((x) => (x == null ? null : Math.round((x - m) * 2) / 2)); };

for (const [label, size] of [['a phone', PHONE], ['a small phone', SMALL], ['a tablet', TABLET]]) {
	test(`${label}: with “Indent paragraphs” on, the editor, reading view, the manuscript’s text and its editor and an embed set in the same paragraphs by the same 1.5em; a tab paragraph is set in once; nothing is written`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await set(p, { indentParagraphs: true });
			await binder(p, 'Tabs', { One: PAGE, Two: `Before.\n\n![[One]]\n\nAfter.\n` });
			const px = 24, want = j(EXPECT(px));
			// the editor
			await open(p, ONE, 'source', false);
			await p.sleep(500);
			t.eq(j(await offsets(p, `document.querySelector(${j(LEAF + ' .cm-content')})`)), want, 'live preview');
			await open(p, ONE, 'source', true);
			await p.sleep(500);
			t.eq(j(await offsets(p, `document.querySelector(${j(LEAF + ' .cm-content')})`)), want, 'source mode');
			// reading view
			await open(p, ONE, 'preview');
			await p.sleep(700);
			t.eq(j(await offsets(p, `document.querySelector(${j(LEAF + ' .markdown-reading-view')})`)), want, 'reading view');
			// an embed of it in another note
			await open(p, 'Tabs/Two.md', 'preview');
			await until(p, `[...document.querySelectorAll(${j(LEAF + ' .markdown-embed-content p')})].some((e) => e.getClientRects().length)`, 6000);
			await p.sleep(700);
			const EMB = `[...document.querySelectorAll(${j(LEAF + ' .markdown-embed-content')})].find((e) => e.getClientRects().length)`;
			t.eq(j(await offsets(p, EMB)), want, 'an embed');
			// the manuscript
			await openMs(p, 'Tabs');
			const man = () => offsets(p, `${sc(ONE)}.bodyEl`);
			if ((await section(p, ONE)).live) t.eq(j(await man()), want, 'the manuscript\u2019s text, an editor already');
			await tapIn(p, ONE, 'Sixth follows', 0);
			await until(p, `!!${sc(ONE)}.live`, 4000);
			await p.sleep(500);
			t.eq(j(await man()), want, 'the manuscript’s editor');
			await shot(p, `indent-${size[0]}`);
			t.eq(disk(p, ONE), PAGE, 'the note is as it was');
		});
	});
}

// The manuscript renders a section's plain text into a div that has `markdown-rendered` and `binders-prose-indent` on
// itself, and the stylesheet's rule for it is `.markdown-rendered .binders-prose-indent > p + p`: a descendant of
// `.markdown-rendered`, which that div is itself. So nothing is set in. On a phone every section is plain text until
// it is tapped.
for (const [label, size] of [['a phone', PHONE], ['a small phone', SMALL]]) {
	test(`BUG: ${label}: with “Indent paragraphs” on, the manuscript’s plain text (every section until it is tapped) sets in no paragraph, and the tapped section jumps`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await set(p, { indentParagraphs: true });
			await binder(p, 'Tabs', { One: PAGE, Two: 'A second note.\n' });
			await openMs(p, 'Tabs');
			const s = await section(p, ONE);
			t.ok(!s.live, 'the section is plain text');
			const want = j(EXPECT(24));
			const rendered = j(await offsets(p, `${sc(ONE)}.bodyEl`));
			log(label, 'rendered', rendered, 'html:', await p.ev(`${sc(ONE)}.bodyEl.querySelector('.binders-manuscript-rendered').className`));
			await tapIn(p, ONE, 'Sixth follows', 0);
			await until(p, `!!${sc(ONE)}.live`, 4000);
			await p.sleep(500);
			t.eq(j(await offsets(p, `${sc(ONE)}.bodyEl`)), want, 'the editor sets in the second, fourth, fifth and sixth paragraphs');
			t.eq(rendered, want, 'and the plain text, before the tap, sets in the same ones');
		});
	});
}

// ---------------------------------------------------------------------------------------------------------------
// 8. The snapshots sheet and focus mode on a phone
// ---------------------------------------------------------------------------------------------------------------

/** Every sideways scroller under a root (a code block's `pre`, or any box whose content is wider than it and lets it scroll). */
const SCROLLERS = (root) => `(() => { const r = ${root}; if (!r) return null; return [...r.querySelectorAll('*')].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX) && e.clientWidth > 0).map((e) => e.tagName.toLowerCase() + '.' + e.className.toString().split(' ').slice(0, 2).join('.') + ' ' + e.scrollWidth + '/' + e.clientWidth); })()`;

/** A snapshot of the note that is open, and its sheet (the window "Show snapshots" opens) showing it. */
async function snapshotSheet(p, path) {
	await open(p, path);
	await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`);
	await p.sleep(1500);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-snapshots .binders-snapshots-item')`, 6000);
	await p.sleep(500);
	const at = await p.ev(`(() => { const e = document.querySelector('.modal.binders-snapshots .binders-snapshots-item'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await tap(p, at.x, at.y, 900);
	await until(p, `document.querySelector('.modal.binders-snapshots .binders-snapshots-text')?.isShown() && document.querySelector('.modal.binders-snapshots .binders-snapshots-text p')`, 4000);
	await p.sleep(300);
}
const SHEET = `document.querySelector('.modal.binders-snapshots .binders-snapshots-text')`;

test('a phone: the Snapshots sheet and focus mode show tab lines as paragraphs, set in by the indent, never as code, with no sideways scroller left behind', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await set(p, { indentParagraphs: false });
		await setNote(p, ARRIVAL, TABS);
		await snapshotSheet(p, ARRIVAL);
		const s = await p.ev(`(() => { const r = ${SHEET}; return { pres: r.querySelectorAll('pre').length, marks: [...r.querySelectorAll('.binders-tab')].map((e) => Math.round(e.getBoundingClientRect().width)), paras: r.querySelectorAll('p').length }; })()`);
		log('sheet', j(s));
		t.eq(s.pres, 0, 'the sheet has no code block');
		t.ok(s.marks.length >= 2 && s.marks.every((w) => w === 24), 'its tab lines begin with the indent: ' + j(s.marks));
		t.eq(j(await p.ev(SCROLLERS(`document.querySelector('.modal.binders-snapshots')`))), '[]', 'and no sideways scroller is on the sheet');
		t.ok(await p.ev(`document.documentElement.scrollWidth <= innerWidth`), 'nor on the page');
		await shot(p, 'sheet-phone');
		await p.key('Escape'); await p.sleep(500);
		await p.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('binders-snapshot')) l.detach(); document.querySelectorAll('.modal-container').forEach((m) => m.remove()); return 1; })()`);
		// focus mode
		await p.ev(`(() => { app.saveLocalStorage('binders-focus-hinted', true); return 1; })()`);
		await binder(p, 'Tabs', { Zero: 'Before.\n', One: TABS, Two: 'After.\n' });
		await openMs(p, 'Tabs');
		await tapIn(p, ONE, 'It did not', 0);
		await until(p, `!!${sc(ONE)}.live`, 4000);
		await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
		await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`, 6000);
		await p.sleep(900);
		await shot(p, 'focus-phone');
		const g = await geom(p, 'The boat left', '.binders-focus-leaf');
		log('focus', j(g));
		t.ok(/binders-tab-paragraph/.test(g.cls) && !g.code && !g.codeLine, 'focus mode: the tab line is a tab paragraph: ' + g.cls);
		t.ok(Math.abs(g.first - g.content - 24) < 1.5 && g.guide === 'none', `set in by 1.5em, no guide line (${g.first - g.content}, ${g.guide})`);
		t.eq(j(await p.ev(SCROLLERS(`document.querySelector('.binders-focus-leaf')`))), '[]', 'and no sideways scroller');
		t.eq(disk(p, ONE), TABS, 'the note is as it was');
	});
});

// "Indent paragraphs" in the Snapshots sheet (a snapshot is rendered into a div that has both `markdown-rendered` and
// `binders-prose-indent` on itself: the same selector problem as the manuscript's plain text).
test('BUG: a phone: with “Indent paragraphs” on, the Snapshots sheet sets in no paragraph (the editor and reading view do)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await set(p, { indentParagraphs: true });
		await setNote(p, ARRIVAL, PAGE);
		await snapshotSheet(p, ARRIVAL);
		const got = j(await offsets(p, SHEET));
		log('sheet offsets', got);
		t.eq(got, j(EXPECT(24)), 'the sheet sets in the same paragraphs as the editor does');
	});
});

// ---------------------------------------------------------------------------------------------------------------
// 9. The keyboard comes up and goes, the phone turns, the settings are switched, with a note open (per frame)
// ---------------------------------------------------------------------------------------------------------------

for (const [label, size] of [['a phone', PHONE], ['a small phone', SMALL], ['a tablet', TABLET]]) {
	test(`${label}: the keyboard coming up and going and the device turning, with a tab note open in its tab and in the manuscript: no frame draws a tab line as code or with a guide line, or moves it sideways; wrapped lines stay at the margin`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await setNote(p, ARRIVAL, TABS);
			await open(p, ARRIVAL);
			await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
			await sample(p);
			await tapLine(p, 'The boat left');
			{ const d = (await doc(p)).split('\n'), n = d.findIndex((l) => l.startsWith('\tIt did not')); await caretTo(p, n, d[n].length); }
			await keyboard(p, size, true);
			await p.sleep(400);
			await keyboard(p, size, false);
			await p.sleep(400);
			await keyboard(p, size, true);
			await p.key('Enter'); await p.type('Typed');
			await keyboard(p, size, false);
			calm(t, await sampled(p), `${label}, the keyboard in a note of its own`);
			// the phone turned (the keyboard up, then down), twice
			const wide = land(size), snap = async (what) => { const g = await geom(p, 'The boat left'); log(what, j({ cls: g.cls, tabW: g.tabW, first: g.first - g.content, rows: g.rows, content: g.content, scroll: g.scrollW + '/' + g.clientW })); return g; };
			await sample(p);
			for (const [what, [w, hh]] of [['turned on its side', wide], ['turned upright', size], ['on its side with the keyboard up', [wide[0], wide[1] - (KB[wide[1]] ?? 180)]], ['upright again', size]]) {
				await metrics(p, w, hh);
				await p.sleep(600);
				const g = await snap(what);
				t.ok(/binders-tab-paragraph/.test(g.cls) && g.guide === 'none', `${what}: still a tab paragraph with no guide line (${g.cls})`);
				t.ok(Math.abs(g.first - g.content - 1.5 * em(g)) < 1.5, `${what}: set in by 1.5em (${g.first - g.content})`);
				t.ok(g.rows.length >= 2 && g.rows.slice(1).every((x) => Math.abs(x - g.content) < 1.5), `${what}: wrapped lines at the margin (${j(g.rows)} from ${g.content})`);
				t.ok(g.scrollW <= g.clientW && g.docW <= g.winW, `${what}: nothing sticks out sideways`);
			}
			calm(t, await sampled(p), `${label}, turning`);
			// the manuscript, a section tapped, the keyboard up and down, the phone turned
			await binder(p, 'Tabs', { One: TABS, Two: 'A second note.\n', Three: FILLER });
			await openMs(p, 'Tabs');
			await sample(p);
			await tapIn(p, ONE, 'It did not', 0);
			await until(p, `!!${sc(ONE)}.live`, 4000);
			await keyboard(p, size, true);
			await metrics(p, wide[0], wide[1] - (KB[wide[1]] ?? 180));
			await p.sleep(500);
			await metrics(p, size[0], size[1]);
			await p.sleep(500);
			const r = await sampled(p);
			calm(t, r, `${label}, the manuscript`);
			const x = await xOf(p, ONE, 'The boat left'), m = await xOf(p, ONE, 'A tabbed');
			t.ok(x - m === 24 || x - m === 0, 'the manuscript still has its tab lines in place (' + x + ', ' + m + ')');
			t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
		});
	});
}
/** How much shorter the page is with the keyboard up, by the page's height (as KEYBOARD in specs-qa5-manuscript.mjs). */
const KB = { 320: 180, 390: 190, 568: 180, 667: 280, 844: 336, 820: 340, 1180: 400 };

test('a phone: switching “Start a paragraph with a tab” and “Indent paragraphs” with a note open (live preview, then reading view, then the manuscript): each switch is complete at once, the tab paragraph is never set in twice, and nothing is written', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await setNote(p, ARRIVAL, TABS);
		await open(p, ARRIVAL);
		await until(p, `!!document.querySelector(${j(LEAF + ' .cm-line.binders-tab-paragraph')})`);
		const st = async () => { const g = await geom(p, 'The boat left'), q = await geom(p, 'Plain paragraph'); return { tab: /binders-tab-paragraph/.test(g.cls), code: g.code || g.codeLine || /monospace|Mono/i.test(g.font), first: g.first - g.content, plain: q.first - q.content, qcls: q.cls }; };
		t.eq(j(await st()), j({ tab: true, code: false, first: 24, plain: 0, qcls: 'cm-line' }), 'to begin with: a tab paragraph, the plain one at the margin');
		await set(p, { indentParagraphs: true });
		await p.sleep(400);
		const a = await st();
		log('indent on', j(a));
		t.ok(a.tab && !a.code && a.first === 24, 'Indent paragraphs on: the tab paragraph is still set in 24 px, not 48 (' + a.first + ')');
		t.ok(a.plain === 24, 'and the plain paragraph that follows a paragraph is set in 24 (' + a.plain + ')');
		await set(p, { tabParagraphs: false });
		await p.sleep(500);
		const b = await st();
		log('tabs off', j(b));
		t.ok(!b.tab && (b.code || b.first !== 24), 'Start a paragraph with a tab off: the line is Obsidian’s again (' + j(b) + ')');
		await set(p, { tabParagraphs: true });
		await p.sleep(500);
		const c = await st();
		t.ok(c.tab && !c.code && c.first === 24 && c.plain === 24, 'and back on: as it was (' + j(c) + ')');
		await set(p, { indentParagraphs: false });
		await p.sleep(400);
		t.eq(j(await st()), j({ tab: true, code: false, first: 24, plain: 0, qcls: 'cm-line' }), 'Indent paragraphs off again: as at the start');
		t.eq(await onDisk(p, ARRIVAL), FRONT + TABS, 'the note on disk is as it was');
		// reading view
		await open(p, ARRIVAL, 'preview');
		await p.sleep(600);
		const rd = () => p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); return { pres: r.querySelectorAll('pre:not(.frontmatter)').length, tabs: r.querySelectorAll('p.binders-tab-paragraph').length }; })()`);
		t.eq(j(await rd()), j({ pres: 0, tabs: 2 }), 'reading view: the tab lines are paragraphs');
		await set(p, { tabParagraphs: false });
		await p.sleep(900);
		log('reading view, tabs off', j(await rd()));
		await set(p, { tabParagraphs: true });
		await p.sleep(1200);
		const after = await rd();
		log('reading view, tabs on again', j(after));
		t.eq(j(after), j({ pres: 0, tabs: 2 }), 'reading view: after switching off and on, the tab lines are paragraphs again (a note open in reading view when the switch is turned does not re-render by itself in Obsidian: the writer reopens it)');
	});
});

// ---------------------------------------------------------------------------------------------------------------
// 10. More of the toolbar's Indent: twice, over several lines, on an empty line
// ---------------------------------------------------------------------------------------------------------------

test('phone: the toolbar’s Indent twice makes two tabs, drawn as two indents; over two selected paragraphs it puts a tab on each (and on the blank line between: Obsidian’s own); Unindent takes them back one at a time and the note is what it was', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		const text = 'One plain paragraph.\n\nTwo plain paragraph.\n\n';
		await setNote(p, ARRIVAL, text);
		await open(p, ARRIVAL);
		await tapLine(p, 'One plain');
		await caretTo(p, 6, 0);
		await tapToolbar(p, 'indent');
		await tapToolbar(p, 'indent');
		t.eq((await doc(p)).split('\n')[6], '\t\tOne plain paragraph.', 'Indent twice: two tabs');
		const g = await geom(p, 'One plain');
		t.ok(/binders-tab-paragraph/.test(g.cls) && g.tabs === 2 && g.tabW === 48 && g.guide === 'none', 'drawn as one paragraph set in by two indents: ' + j({ cls: g.cls, tabs: g.tabs, tabW: g.tabW, guide: g.guide }));
		await tapToolbar(p, 'outdent');
		await tapToolbar(p, 'outdent');
		t.eq(await doc(p), FRONT + text, 'Unindent twice: the note is as it was');
		// two paragraphs selected
		await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setSelection({ line: 6, ch: 0 }, { line: 8, ch: 5 }); return 1; })()`);
		await tapToolbar(p, 'indent');
		const lines3 = (await doc(p)).split('\n').slice(6, 9);
		log('selection:', j(lines3));
		t.ok(lines3[0] === '\tOne plain paragraph.' && lines3[2] === '\tTwo plain paragraph.', 'a tab on each selected paragraph: ' + j(lines3));
		await tapToolbar(p, 'outdent');
		t.eq(await doc(p), FRONT + text, 'Unindent over the same lines: the note is as it was');
		t.eq(await onDisk(p, ARRIVAL), FRONT + text, 'and on disk');
	});
});

// The known one (a line of white space only has no tab-paragraph class until its first letter), by the toolbar's way in.
test('BUG (known, being fixed): phone: the toolbar’s Indent on an empty line draws a guide line in the tab, 36 px wide, until a letter is typed, and the tab changes width then', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await setNote(p, ARRIVAL, 'One plain paragraph.\n\n');
		await open(p, ARRIVAL);
		await tapLine(p, 'One plain');
		await caretTo(p, 8, 0);
		await sample(p);
		await tapToolbar(p, 'indent');
		await p.sleep(300);
		const before = await p.ev(`(() => { const ls = [...document.querySelectorAll(${j(LEAF + ' .cm-content > .cm-line.cm-active')})]; const i = ls[0]?.querySelector('.cm-indent'); return i ? { w: Math.round(i.getBoundingClientRect().width), guide: getComputedStyle(i, '::before').content, cls: ls[0].className } : null; })()`);
		log('empty line after Indent', j(before));
		await p.type('W');
		await p.sleep(300);
		const after = await p.ev(`(() => { const ls = [...document.querySelectorAll(${j(LEAF + ' .cm-content > .cm-line.cm-active')})]; const i = ls[0]?.querySelector('.cm-indent'); return i ? { w: Math.round(i.getBoundingClientRect().width), guide: getComputedStyle(i, '::before').content } : null; })()`);
		t.ok(!!before && (before.guide === 'none' || before.guide === 'normal'), 'right after Indent the tab has no guide line (' + j(before) + ')');
		t.eq(before?.w, after?.w, 'and is as wide as it will be with a letter in the line (' + before?.w + ' → ' + after?.w + ')');
	});
});

// ---------------------------------------------------------------------------------------------------------------
// 11. The switches in Obsidian's settings, by touch, with notes open
// ---------------------------------------------------------------------------------------------------------------

/** Binders' setting by its name, switched by a tap in Obsidian's settings window (the note stays open under it). */
async function tapSetting(p, name) {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `!![...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent === ${j(name)})`, 5000);
	await p.sleep(300);
	const at = await p.ev(`(() => { const e = [...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent === ${j(name)}); e.scrollIntoView({ block: 'center' }); const r = e.querySelector('.checkbox-container').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, on: e.querySelector('.checkbox-container').classList.contains('is-enabled') }; })()`);
	await p.sleep(200);
	const at2 = await p.ev(`(() => { const e = [...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent === ${j(name)}); const r = e.querySelector('.checkbox-container').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await tap(p, at2.x, at2.y, 500);
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	await p.sleep(600);
	return !at.on;
}

// (reading view is drawn when a note is opened and not again when a setting changes: the stale page is what these show)
for (const [what, bug, show] of [
	['live preview', false, async (p) => { await open(p, ARRIVAL); await p.sleep(400); return () => offsets(p, `document.querySelector(${j(LEAF + ' .cm-content')})`); }],
	['reading view', true, async (p) => { await open(p, ARRIVAL, 'preview'); await p.sleep(700); return () => offsets(p, `document.querySelector(${j(LEAF + ' .markdown-reading-view')})`); }],
	['a tapped manuscript section’s editor', false, async (p) => { await binder(p, 'Tabs', { One: PAGE, Two: 'A second note.\n' }); await openMs(p, 'Tabs'); await tapIn(p, ONE, 'Sixth follows', 0); await until(p, `!!${sc(ONE)}.live`, 4000); await p.sleep(400); return () => offsets(p, `${sc(ONE)}.bodyEl`); }],
]) {
	specs.push({ name: `${bug ? 'BUG: ' : ''}qa10 paragraphs touch: phone: “Indent paragraphs” switched on in Obsidian’s settings with ${what} open sets in the paragraphs that follow another at once, and off again leaves nothing behind`, fn: withTidy(async (p, h, t) => {
		await onDevice(p, PHONE, async () => {
			await setNote(p, ARRIVAL, PAGE);
			const read = await show(p);
			const FLAT = j([0, 0, 0, 0, 24, 0, 0]);
			t.eq(j(await read()), FLAT, 'with the switch off only the typed tab is set in');
			t.ok(await tapSetting(p, 'Indent paragraphs'), 'the switch is on after the tap');
			const got = j(await read());
			log(what, 'switched on', got);
			t.eq(got, j(EXPECT(24)), 'switched on, the paragraphs that follow another are set in (without opening the note again)');
			await tapSetting(p, 'Indent paragraphs');
			t.eq(j(await read()), FLAT, 'and switched off again, as it was');
			if (what.startsWith('a tapped')) { await saveAll(p); t.eq(disk(p, ONE), PAGE, 'the note is as it was'); } else t.eq(await onDisk(p, ARRIVAL), FRONT + PAGE, 'the note is as it was');
		});
	}) });
}

// ---------------------------------------------------------------------------------------------------------------
// 12. The first note opened after the app starts, and a long note scrolled by a finger
// ---------------------------------------------------------------------------------------------------------------

const LONG_NOTE = Array.from({ length: 400 }, (_, i) => `\t${i + 1}. ${LONG} ${i % 3 ? '' : LONG}`).join('\n\n') + '\n';
const flingBy = async (p, dir) => {
	const y0 = dir > 0 ? 680 : 200;
	await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: y0 }] });
	for (let i = 1; i <= 10; i++) { await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: y0 - dir * i * 48 }] }); await p.sleep(10); }
	await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await p.sleep(900);
};

test('a phone: the first note opened after Obsidian starts, a long one of tab paragraphs (400): no frame draws a tab line as code, with a guide line, or sideways', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await setNote(p, ARRIVAL, LONG_NOTE);
		// (onDevice has just reloaded Obsidian: nothing has been opened yet)
		await sample(p);
		await open(p, ARRIVAL);
		await p.sleep(1200);
		const r = await sampled(p);
		calm(t, r, 'the first note after the start');
		t.ok(r.log.length >= 3, 'its tab lines were drawn (' + r.log.length + ' states)');
		t.eq(await disk(p, ARRIVAL), FRONT + LONG_NOTE, 'the note on disk is as it was');
	});
});

test('BUG (intermittent): a phone: a long note of tab paragraphs (400) flung by a finger down the page and back draws tab lines without their class and with a guide line, for the frames until the editor has read that far', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await setNote(p, ARRIVAL, LONG_NOTE);
		await open(p, ARRIVAL);
		await p.sleep(1200);
		await sample(p);
		for (const dir of [1, 1, 1, 1, 1, 1, -1, -1, 1, 1, 1]) await flingBy(p, dir);
		const where = await p.ev(`Math.round(document.querySelector(${j(LEAF + ' .cm-scroller')}).scrollTop)`);
		const r = await sampled(p);
		t.ok(where > 3000, 'the flings moved the page far (to ' + where + ' px)');
		calm(t, r, 'a long note flung');
		t.eq(await disk(p, ARRIVAL), FRONT + LONG_NOTE, 'the note on disk is as it was');
	});
});

// Where the page is put in a part of a long note that the editor has not read yet (a note opened again where the
// writer left it, a link to a heading, a search hit): for the frames until it has read that far the tab lines are drawn
// with their guide line and no tab-paragraph class, the tab 36 px wide and the text at the wrong place; one frame in a
// hundred is one too many for a writer who "sees the quote UX briefly".
test('BUG: a phone: a long note put where it was left (scroll restored on opening it again), or jumped into, draws its tab lines without the class and with a guide line for the first frames', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await setNote(p, ARRIVAL, LONG_NOTE);
		await open(p, ARRIVAL);
		await p.sleep(1000);
		// the writer reads on: far down
		await p.ev(`(() => { const s = document.querySelector(${j(LEAF + ' .cm-scroller')}); s.scrollTop = (s.scrollHeight - s.clientHeight) * 0.6; return 1; })()`);
		await p.sleep(1500);
		const top = await p.ev(`Math.round(document.querySelector(${j(LEAF + ' .cm-scroller')}).scrollTop)`);
		// another note, then back to this one (Obsidian puts the page back where it was)
		await open(p, KEEPER);
		await p.sleep(600);
		await sample(p);
		await p.ev(`(() => { app.commands.executeCommandById('app:go-back'); return 1; })()`);
		await p.sleep(1500);
		const r = await sampled(p);
		const now = await p.ev(`Math.round(document.querySelector(${j(LEAF + ' .cm-scroller')}).scrollTop)`);
		log('scroll before', top, 'after reopening', now);
		t.ok(Math.abs(now - top) < 400 || now > 3000, `the page was put back where it was (${top} → ${now})`);
		t.eq(j(r.bad.slice(0, 3)), '[]', `no frame draws a tab line without its class or with a guide line (${r.bad.length} lines bad, of ${r.frames} frames)`);
	});
});

// ---------------------------------------------------------------------------------------------------------------
// 13. Other ways of getting a tab on a phone, and reading view with an embed
// ---------------------------------------------------------------------------------------------------------------

test('phone: four spaces typed at the start of a line on the on-screen keyboard make a tab paragraph once a letter follows (and Backspace takes the spaces one at a time)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await setNote(p, ARRIVAL, 'Plain.\n\n');
		await open(p, ARRIVAL);
		await tapLine(p, 'Plain.');
		await caretTo(p, 8, 0);
		await keyboard(p, PHONE, true);
		for (const c of '    ') await p.send('Input.insertText', { text: c });
		await p.sleep(250);
		log('four spaces:', await dump(p));
		await p.type('Spaced');
		await p.sleep(300);
		const g = await geom(p, 'Spaced');
		log('after letters', j({ cls: g.cls, tabW: g.tabW, first: g.first - g.content, code: g.code, guide: g.guide }));
		t.ok(/binders-tab-paragraph/.test(g.cls) && !g.code && !g.codeLine, 'the line is a tab paragraph: ' + g.cls);
		t.ok(Math.abs(g.first - g.content - 24) < 3 && g.guide !== '"​"', `and set in about 1.5em (${g.first - g.content} px, guide ${g.guide})`);
		t.eq((await doc(p)).split('\n')[8], '    Spaced', 'the spaces are in the note as typed');
		await p.key('Backspace');
		t.eq(await onDisk(p, ARRIVAL), FRONT + 'Plain.\n\n    Space', 'the note on disk is exactly what was typed');
	});
});

test('a phone: reading view and an embed of a note with tab paragraphs and a fenced code block: tab lines are paragraphs, the fenced block is the only code, no sideways scroller, and the page does not scroll sideways', async (p, h, t) => {
	await onDevice(p, SMALL, async () => {
		const note = `\tA tab paragraph that is long enough to wrap around the narrow column of a small phone more than once.\n\n\`\`\`\nA fenced block with a line that is far too long to fit in the narrow column of a small phone\n\`\`\`\n\n\tAnother tab paragraph.\n`;
		await binder(p, 'Tabs', { One: note, Two: 'Before.\n\n![[One]]\n\nAfter.\n' });
		await open(p, ONE, 'preview');
		await p.sleep(800);
		const reading = await p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); return { pres: [...r.querySelectorAll('pre:not(.frontmatter)')].map((e) => e.textContent.trim().slice(0, 8)), tabs: r.querySelectorAll('p.binders-tab-paragraph').length, docW: document.documentElement.scrollWidth, winW: innerWidth }; })()`);
		log('reading', j(reading));
		t.eq(j(reading.pres), j(['A fenced']), 'one code block, the fenced one');
		t.eq(reading.tabs, 2, 'and two tab paragraphs');
		t.ok(reading.docW <= reading.winW, 'the page does not scroll sideways');
		await open(p, 'Tabs/Two.md', 'preview');
		await until(p, `[...document.querySelectorAll(${j(LEAF + ' .markdown-embed-content p')})].some((e) => e.getClientRects().length)`, 6000);
		await p.sleep(700);
		const emb = await p.ev(`(() => { const r = [...document.querySelectorAll(${j(LEAF + ' .markdown-embed-content')})].find((e) => e.getClientRects().length); return { pres: [...r.querySelectorAll('pre:not(.frontmatter)')].map((e) => e.textContent.trim().slice(0, 8)), tabs: r.querySelectorAll('p.binders-tab-paragraph').length, docW: document.documentElement.scrollWidth, winW: innerWidth, scrollers: (${SCROLLERS(`[...document.querySelectorAll(${j(LEAF + ' .markdown-embed-content')})].find((e) => e.getClientRects().length)`)}) }; })()`);
		log('embed', j(emb));
		t.eq(j(emb.pres), j(['A fenced']), 'an embed: one code block, the fenced one');
		t.eq(emb.tabs, 2, 'and two tab paragraphs');
		t.ok(emb.docW <= emb.winW, 'the page does not scroll sideways');
		t.eq(j(emb.scrollers.filter((s) => !/^pre|code/.test(s))), '[]', 'no sideways scroller but the code block’s own: ' + j(emb.scrollers));
	});
});

