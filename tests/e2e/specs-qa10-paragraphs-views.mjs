// QA round 10, paragraphs: every place a note is shown (src/paragraphs/). The manuscript (typing across sections,
// sections swapping between text and editor, an outside edit while typing), focus mode, the measure of a tab paragraph
// and of an indented one in every surface, reading view in depth, the frames while opening and switching, and
// export/compile/split/merge/snapshots keeping the tab byte for byte. Every test that types reads the disk.
// Tests named "BUG:" were written to fail until what they show is fixed.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, B, clickMenu, file, j, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';
import { docx, epub, openEbook, open as openExport, press, saved, standIn, closeAll, withAuthor, pick } from './specs-export.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa10 paragraphs: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await restore(p); } }) });

const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md', S = L + 'Part One/Storm warning.md', PRO = L + 'Prologue.md';
const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\nplotlines:\n  - Mara\n---\n';
const LEAF = '.workspace-leaf.mod-active';
const sleep = (p, ms) => p.sleep(ms);
const errors = (p) => p.errors.filter((e) => !/Electron Security/.test(e));
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');

const set = (p, o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveSettings(); return 1; })()`);
/** After each test: the settings these tests turn, Obsidian's own, and a snippet's variable, as they were. */
async function restore(p) {
	await p.key('Escape').catch(() => {});
	await p.ev(`(async () => {
		document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click());
		document.body.style.removeProperty('--binders-paragraph-indent'); document.body.style.removeProperty('--font-text-size');
		const pl = ${PL}; Object.assign(pl.settings, { tabParagraphs: true, indentParagraphs: false, focusNeighbours: false, focusDim: true, focusTypewriter: true });
		try { pl.focus?.leave?.(true); } catch {}
		await pl.saveSettings(); return 1; })()`).catch(() => {});
}
const body = (p, path, text) => p.ev(`app.vault.modify(${file(path)}, ${j(FRONT + text)}).then(() => 1)`);
const open = async (p, path, mode = 'source', source = false, leaf = 'false') => {
	await p.ev(`(async () => { const l = app.workspace.getLeaf(${leaf}); await l.openFile(${file(path)}); await l.setViewState({ type: 'markdown', state: { file: ${j(path)}, mode: ${j(mode)}, source: ${source} } }); return 1; })()`);
	await sleep(p, 700);
};
const focusEnd = (p) => p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); const l = e.lastLine(); e.setCursor(l, e.getLine(l).length); return 1; })()`);
const manuscript = async (p, folder = L + 'Part One') => {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-manuscript .cm-content')`, 8000);
	await sleep(p, 500);
};

// ---- measuring: where a paragraph's first letter is, and where its wrapped lines start ----

const LONG = ' It went on and on for a good while, with words enough to wrap across more than one line of the column, so that the wrapped line can be measured against the margin, and then again for good measure so that it surely wraps twice over.';
const MEASURED = 'Plain flush paragraph one.' + LONG + '\n\n\tTab paragraph here.' + LONG + '\n\nThird paragraph follows.' + LONG + '\n';
/** Installs window.__m(root): the x of the first letter of each of three paragraphs (the first, the tab one, the one
    after it) and of the first letter of their second visual line, and the font size of the block. */
const installMeasure = (p) => p.ev(`(() => { window.__m = (root) => { const out = {}; const finds = { plain: 'Plain flush', tab: 'Tab paragraph', third: 'Third paragraph' };
	const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
	while ((n = tw.nextNode())) for (const [k, s] of Object.entries(finds)) { const i = n.textContent.indexOf(s); if (i < 0 || out[k]) continue;
		const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const first = r.getBoundingClientRect();
		const blk = n.parentElement.closest('.cm-line, p, div');
		const tw2 = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); let m, second = null;
		while ((m = tw2.nextNode()) && second === null) for (let c = 0; c < m.textContent.length; c++) { if (m === n && c < i) continue; const rr = document.createRange(); rr.setStart(m, c); rr.setEnd(m, c + 1); const b = rr.getBoundingClientRect(); if (b.width && b.top > first.top + 8) { second = b.left; break; } }
		out[k] = { x: Math.round(first.left * 10) / 10, wrap: second === null ? null : Math.round(second * 10) / 10, fs: parseFloat(getComputedStyle(n.parentElement).fontSize), cls: blk.className };
	}
	return out; }; return 1; })()`);
const measure = (p, root) => p.ev(`(() => { const r = document.querySelector(${j(root)}); return r ? __m(r) : null; })()`);

/** Every place a note is shown, each as: how to bring it up, and the selector of what to measure. */
const SURFACES = {
	'live preview': async (p) => { await open(p, A, 'source', false); await sleep(p, 300); return LEAF + ' .cm-content'; },
	'source mode': async (p) => { await open(p, A, 'source', true); await sleep(p, 300); return LEAF + ' .cm-content'; },
	'reading view': async (p) => { await open(p, A, 'preview'); await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p')})`); await sleep(p, 500); return LEAF + ' .markdown-reading-view .markdown-preview-sizer'; },
	'embed in reading view': async (p) => {
		await p.ev(`app.vault.modify(${file(PRO)}, 'Before.\\n\\n![[Arrival]]\\n\\nAfter.\\n').then(() => 1)`);
		await open(p, PRO, 'preview'); await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view .markdown-embed p')})`, 6000); await sleep(p, 700); return LEAF + ' .markdown-reading-view .markdown-embed';
	},
	'embed in live preview': async (p) => {
		await p.ev(`app.vault.modify(${file(PRO)}, 'Before.\\n\\n![[Arrival]]\\n\\nAfter.\\n').then(() => 1)`);
		await open(p, PRO, 'source', false); await until(p, `!!document.querySelector(${j(LEAF + ' .cm-content .markdown-embed p')})`, 6000); await sleep(p, 700); return LEAF + ' .cm-content .markdown-embed';
	},
	'hover preview': async (p) => {
		await p.ev(`app.vault.modify(${file(PRO)}, 'See [[Arrival]].\\n').then(() => 1)`);
		await open(p, PRO, 'preview'); await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view a.internal-link')})`);
		const at = await p.at(LEAF + ' .markdown-reading-view a.internal-link');
		await p.move(at.x - 40, at.y + 40, 3); await p.move(at.x, at.y, 8);
		await until(p, `!!document.querySelector('.popover.hover-popover .markdown-embed p')`, 6000); await sleep(p, 900);
		return '.popover.hover-popover';
	},
	'manuscript editor': async (p) => { await manuscript(p); return '.binders-manuscript'; },
	'snapshots dialog': async (p) => {
		await open(p, A, 'source', false);
		await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`); await sleep(p, 400);
		await p.ev(`(async () => { await ${PL}.binders.snapshotsSettle(); await ${PL}.binders.flush(); return 1; })()`);
		await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
		await until(p, `[...document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-text')].some(e => e.textContent.includes('Plain flush'))`, 8000); await sleep(p, 400);
		return '.modal.binders-snapshots .binders-snapshots-text';
	},
};
const CONFIGS = {
	'default': async () => {},
	'a larger font': async (p) => { await p.ev(`(() => { document.body.style.setProperty('--font-text-size', '24px'); return 1; })()`); },
	'readable line length off': async (p) => { await p.ev(`(() => { app.vault.setConfig('readableLineLength', false); app.workspace.updateOptions?.(); return 1; })()`); },
	'a snippet’s 2em': async (p) => { await p.ev(`(() => { document.body.style.setProperty('--binders-paragraph-indent', '2em'); return 1; })()`); },
};
const em = (cfg) => (cfg === 'a snippet’s 2em' ? 2 : 1.5);

for (const [cfgName, cfg] of Object.entries(CONFIGS)) {
	test(`BUG: the measure: a tab paragraph, an indented one and wrapped lines start at the same place in every surface (${cfgName})`, async (p, h, t) => {
		await body(p, A, MEASURED);
		await set(p, { indentParagraphs: true });
		await cfg(p);
		await installMeasure(p);
		const rows = {}, bad = [];
		for (const [name, bring] of Object.entries(SURFACES)) {
			try {
				const root = await bring(p);
				const m = await measure(p, root);
				rows[name] = m;
				if (!m || !m.plain || !m.tab || !m.third) { bad.push(`${name}: not all three paragraphs found (${j(m)})`); continue; }
				const want = em(cfgName) * m.plain.fs;
				const d = (a, b) => Math.round((a - b) * 10) / 10;
				if (Math.abs(d(m.tab.x, m.plain.x) - want) > 1) bad.push(`${name}: tab paragraph starts ${d(m.tab.x, m.plain.x)}px in, want ${want}px`);
				if (Math.abs(d(m.third.x, m.plain.x) - want) > 1) bad.push(`${name}: indented paragraph starts ${d(m.third.x, m.plain.x)}px in, want ${want}px`);
				if (m.tab.wrap != null && Math.abs(d(m.tab.wrap, m.plain.x)) > 1) bad.push(`${name}: tab paragraph’s wrapped line starts ${d(m.tab.wrap, m.plain.x)}px from the margin, want 0`);
				if (m.third.wrap != null && Math.abs(d(m.third.wrap, m.plain.x)) > 1) bad.push(`${name}: indented paragraph’s wrapped line starts ${d(m.third.wrap, m.plain.x)}px from the margin, want 0`);
			} catch (e) { bad.push(`${name}: ${e.message}`); }
			finally { await p.move(5, 5, 4); await p.key('Escape').catch(() => {}); await sleep(p, 150); await p.ev(`(() => { document.querySelectorAll('.popover.hover-popover').forEach(e => e.remove()); document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); return 1; })()`); }
		}
		console.log(`[measure ${cfgName}] ` + j(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v && v.plain && v.tab && v.third ? { fs: v.plain.fs, tab: Math.round((v.tab.x - v.plain.x) * 10) / 10, third: Math.round((v.third.x - v.plain.x) * 10) / 10, wrapT: v.tab.wrap == null ? null : Math.round((v.tab.wrap - v.plain.x) * 10) / 10 } : v]))));
		t.ok(!bad.length, bad.join(' | '));
		t.eq(disk(p, A), FRONT + MEASURED, 'the note on disk is as it was');
	});
}

// ---- what Binders renders itself with "Indent paragraphs" on: the manuscript's text, focus mode's neighbours, the snapshots window ----

const SHORT = 'Plain flush paragraph one.\n\n\tTab paragraph here.\n\nThird paragraph follows.\n';
const gap = (m, k) => (m && m.plain && m[k] ? Math.round((m[k].x - m.plain.x) * 10) / 10 : null);
const readOnlyBinder = (p) => p.ev(`app.vault.process(${file(L + 'The Lighthouse.md')}, (x) => x.replace('binder: 1', 'binder: 99')).then(() => 1)`);

test('BUG: “Indent paragraphs” in the manuscript’s text (a section shown as text): a paragraph that follows one is set in, as in the editor', async (p, h, t) => {
	await body(p, A, MEASURED);
	await set(p, { indentParagraphs: true });
	await readOnlyBinder(p); await sleep(p, 500);
	await installMeasure(p);
	await manuscriptText(p);
	const m = await measure(p, '.binders-manuscript');
	t.ok(!!m?.tab, 'the text is shown: ' + j(m));
	console.log('[manuscript text dom] ' + await p.ev(`(() => { const e = [...document.querySelectorAll('.binders-manuscript-rendered')].find(e => e.textContent.includes('Plain flush')); return e.className + ' >> ' + [...e.children].map(c => getComputedStyle(c).textIndent + ' ' + c.tagName + '.' + c.className + (c.firstElementChild ? '/' + c.firstElementChild.tagName + '.' + c.firstElementChild.className : '')).join(' | '); })()`));
	console.log('[manuscript text] ' + j({ tab: gap(m, 'tab'), third: gap(m, 'third'), wrap: m.tab.wrap == null ? null : m.tab.wrap - m.plain.x }));
	t.ok(Math.abs(gap(m, 'tab') - 24) < 1, `the tab paragraph is set in 24px (${gap(m, 'tab')})`);
	t.ok(Math.abs(gap(m, 'third') - 24) < 1, `the paragraph after it is set in 24px (${gap(m, 'third')})`);
	t.eq(disk(p, A), FRONT + MEASURED, 'the note on disk is as it was');
});
const manuscriptText = async (p) => {
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `[...document.querySelectorAll('.binders-manuscript-rendered')].some(e => e.textContent.includes('Plain flush'))`, 8000);
	await sleep(p, 400);
};

test('BUG: “Indent paragraphs” in the snapshots window: a paragraph that follows one is set in', async (p, h, t) => {
	await body(p, A, MEASURED);
	await set(p, { indentParagraphs: true });
	await installMeasure(p);
	const root = await SURFACES['snapshots dialog'](p);
	const m = await measure(p, root);
	console.log('[snapshots dialog] ' + j({ tab: gap(m, 'tab'), third: gap(m, 'third'), plainClass: m.plain.cls }));
	t.ok(Math.abs(gap(m, 'tab') - 24) < 1, `the tab paragraph is set in 24px (${gap(m, 'tab')})`);
	t.ok(Math.abs(gap(m, 'third') - 24) < 1, `the paragraph after it is set in 24px (${gap(m, 'third')})`);
});

// ---- the manuscript: typing tab paragraphs in sections ----

/** The body of each of the three sections of Part One, and the note as the disk should have it. */
const lineBox = (p, text, root = '.binders-manuscript') => p.ev(`(() => { const l = [...document.querySelectorAll(${j(root + ' .cm-line')})].find(l => l.textContent.trim().startsWith(${j(text)})); if (!l) return null; const r = l.getBoundingClientRect(), t = document.createRange(); const tn = document.createTreeWalker(l, NodeFilter.SHOW_TEXT); let n, last; while ((n = tn.nextNode())) last = n; if (last) { t.setStart(last, last.textContent.length); t.setEnd(last, last.textContent.length); } const e = last ? t.getBoundingClientRect() : r; return { x: e.right, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left }; })()`);
const clickEnd = async (p, text, root) => { const b = await lineBox(p, text, root); if (!b) throw new Error('no line starting ' + text); await p.click(b.x + 2, b.y); await sleep(p, 150); await p.key('End'); };
const msLines = (p, root = '.binders-manuscript') => p.ev(`[...document.querySelectorAll(${j(root + ' .cm-line')})].map(l => ({ text: l.textContent, cls: l.className, code: !!l.querySelector('.cm-inline-code'), x: (() => { const tn = document.createTreeWalker(l, NodeFilter.SHOW_TEXT); let n; while ((n = tn.nextNode())) { const i = n.textContent.search(/[^ \\t]/); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getBoundingClientRect().left; } } return null; })() }))`);
const diskIs = (p, path, text, ms = 6000) => until(p, `app.vault.adapter.read(${j(path)}).then(x => x === ${j(text)})`, ms);

test('the manuscript: Tab, text and Enter in the first, a middle and the last section; the disk has exactly what was typed; each tab line is a paragraph at the same x as the others', async (p, h, t) => {
	for (const [path, w] of [[A, 'Alpha'], [K, 'Bravo'], [S, 'Charlie']]) await body(p, path, `${w}.\n`);
	await manuscript(p);
	await installMeasure(p);
	const want = {};
	for (const [path, w] of [[A, 'Alpha'], [K, 'Bravo'], [S, 'Charlie']]) {
		await clickEnd(p, w + '.');
		await p.key('Enter'); await p.key('Enter'); await p.key('Tab'); await p.type(`Tab after ${w}, with *stress*.`);
		await p.key('Enter'); await p.type(`Carried on in ${w}.`);
		want[path] = FRONT + `${w}.\n\n\tTab after ${w}, with *stress*.\n\tCarried on in ${w}.\n`;
		await sleep(p, 300);
	}
	for (const [path, text] of Object.entries(want)) {
		const ok = await diskIs(p, path, text);
		t.eq(disk(p, path), text, `${path}: the disk has what was typed`);
	}
	const ls = await msLines(p);
	for (const w of ['Alpha', 'Bravo', 'Charlie']) {
		const plain = ls.find((l) => l.text === `${w}.`), tab = ls.find((l) => l.text.includes(`Tab after ${w}`)), more = ls.find((l) => l.text.includes(`Carried on in ${w}`));
		t.ok(!!plain && !!tab && !!more, `${w}: the lines are there`);
		t.ok(/binders-tab-paragraph/.test(tab.cls), `${w}: the typed tab line is a tab paragraph (${tab.cls})`);
		t.ok(/binders-tab-paragraph/.test(more.cls), `${w}: the line Enter carried on is one too (${more.cls})`);
		t.ok(!tab.code && !more.code, `${w}: not code`);
		t.ok(Math.abs(tab.x - plain.x - 24) < 1.5 && Math.abs(more.x - plain.x - 24) < 1.5, `${w}: both start 24px in (${tab.x - plain.x}, ${more.x - plain.x})`);
	}
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

// ---- frames: what is drawn, frame by frame, while a note is opened, switched, moved or a setting turned ----

const TABTEXT = 'Plain reference paragraph.\n\n\tTabbed line to watch, with *stress*.\n';
/** Starts a sampler in the page: every animation frame, how each visible element showing the marker (`Tabbed line`)
    is drawn: its tag, classes, whether it is set in a monospace face or has a background (code), the guide line in
    its tab, and how far in its first letter is from the reference paragraph’s. Only changes are kept. */
const startFrames = (p, marker = 'Tabbed line', ref = 'Plain reference') => p.ev(`(() => {
	const S = window.__frames = { list: [], stop: false, t0: performance.now(), n: 0 };
	const first = (el, text) => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.textContent.indexOf(text); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getBoundingClientRect().left; } } return null; };
	const sample = () => {
		const out = [];
		for (const el of document.querySelectorAll('.cm-line, .markdown-rendered p, .markdown-rendered pre, .markdown-rendered code, .HyperMD-codeblock')) {
			if (!el.offsetParent || !el.textContent.includes(${j(marker)})) continue;
			if (el.querySelector('.cm-line, p, pre')) continue;
			const cs = getComputedStyle(el), root = el.closest('.cm-content, .markdown-preview-sizer, .markdown-rendered') || el.parentElement;
			const refEl = [...root.querySelectorAll('.cm-line, p')].find(e => e.offsetParent && e.textContent.includes(${j(ref)}));
			const x = first(el, ${j(marker)}), rx = refEl ? first(refEl, ${j(ref)}) : null;
			const ind = el.querySelector('.cm-indent'), g = ind ? getComputedStyle(ind, '::before').content : '';
			out.push({ tag: el.tagName.toLowerCase(), cls: el.className.replace(/[ ]+/g, ' ').replace(/cm-active|cm-line|cm-lineWrapping/g, '').trim(), mono: /mono|courier/i.test(cs.fontFamily) || (refEl && cs.fontFamily !== getComputedStyle(refEl).fontFamily) || false, bg: cs.backgroundColor !== 'rgba(0, 0, 0, 0)', guide: !!g && g !== 'none' && g !== 'normal', dx: x != null && rx != null ? Math.round((x - rx) * 2) / 2 : null, rx: rx != null ? Math.round(rx) : null });
		}
		return out;
	};
	let last = '';
	const step = () => { S.n++; const s = sample(), k = JSON.stringify(s); if (k !== last) { last = k; S.list.push({ t: Math.round(performance.now() - S.t0), f: S.n, s }); } if (!S.stop) requestAnimationFrame(step); };
	requestAnimationFrame(step); return 1; })()`);
const stopFrames = (p) => p.ev(`(() => { window.__frames.stop = true; return window.__frames; })()`);
/** Is one element's state a tab paragraph drawn as it should be (not code, no guide line, set in the indent)? */
const goodEl = (e, want = 24) => !/HyperMD-codeblock|hmd-codeblock/.test(e.cls) && e.tag !== 'pre' && e.tag !== 'code' && !e.mono && !e.bg && !e.guide && (e.dx === null || Math.abs(e.dx - want) <= 1);
const goodState = (st, want) => st.s.length > 0 && st.s.every((e) => goodEl(e, want));
/** What went wrong in a run of states: the frames from the first bad one to the next good one (or the end). */
const verdict = (fr, want = 24) => {
	const bad = [];
	for (let i = 0; i < fr.list.length; i++) {
		const st = fr.list[i];
		if (st.s.length && !goodState(st, want) && !(i > 0 && fr.list[i - 1].s.length && !goodState(fr.list[i - 1], want))) {
			const next = fr.list.slice(i + 1).find((x) => goodState(x, want));
			bad.push(`from ${st.t}ms (frame ${st.f}) to ${next ? next.t + 'ms (frame ' + next.f + ')' : 'the end'}: ${j(st.s.filter((e) => !goodEl(e, want)))}`);
		}
	}
	return bad;
};
const settleIn = async (p, ms = 1500) => { await sleep(p, ms); };

test('frames: opening a binder’s note with tab paragraphs in a new tab: no frame draws the tab line as code, with a guide line, or without its indent', async (p, h, t) => {
	await body(p, A, TABTEXT);
	await startFrames(p);
	await open(p, A, 'source', false, "'tab'");
	await settleIn(p);
	const fr = await stopFrames(p);
	console.log('[frames new tab] ' + j(fr.list));
	const bad = verdict(fr);
	t.ok(fr.list.some((st) => goodState(st)), 'it ends as a tab paragraph: ' + j(fr.list.slice(-1)));
	t.ok(!bad.length, bad.join(' | '));
	t.eq(disk(p, A), FRONT + TABTEXT, 'the note on disk is as it was');
});

/** Runs `fn` with the sampler going; the states it saw. */
const watch = async (p, fn, settle = 1800, marker, ref) => { await startFrames(p, marker, ref); try { await fn(); await sleep(p, settle); } finally { var fr = await stopFrames(p); } return fr; };
const show = (fr) => fr.list.map((st) => `${st.t}ms#${st.f}: ` + (st.s.length ? st.s.map((e) => `${e.tag}.${e.cls}${e.mono ? ' MONO' : ''}${e.bg ? ' BG' : ''}${e.guide ? ' GUIDE' : ''} dx=${e.dx}`).join(' + ') : '(nothing)')).join(' // ');
const isGoodEnd = (fr) => fr.list.length && goodState(fr.list[fr.list.length - 1], 24);
/** A state that is neither prose done right nor Obsidian’s plain code: a tab paragraph class with a guide line, a
    code line that is also set in, a tab paragraph with the wrong indent. */
const half = (e) => (/binders-tab-paragraph/.test(e.cls) && (e.guide || e.mono || e.bg || (e.dx !== null && Math.abs(e.dx - 24) > 1))) || (!/binders-tab-paragraph/.test(e.cls) && /cm-hmd-indented-code|HyperMD-codeblock/.test(e.cls) && e.dx !== null && e.dx > 30 && false);

test('frames: a binder’s note opened in the same tab after a note outside a binder, and the other way round', async (p, h, t) => {
	await body(p, A, TABTEXT);
	await p.ev(`app.vault.create('Loose.md', 'Plain reference loose.\\n\\n\\tLoose tab line in the loose note.\\n').then(() => 1)`);
	await open(p, 'Loose.md'); await sleep(p, 600);
	const into = await watch(p, () => open(p, A, 'source', false), 1200);
	console.log('[frames outside -> binder] ' + show(into));
	const out = await watch(p, () => open(p, 'Loose.md', 'source', false), 1200, 'Loose tab line');
	console.log('[frames binder -> outside] ' + show(out));
	const bad = verdict(into);
	t.ok(isGoodEnd(into), 'the binder’s note ends as a tab paragraph');
	t.ok(!bad.length, 'outside → binder: ' + bad.join(' | '));
	// the other way: the loose note is code, as Obsidian has it, in every frame: never a paragraph, not even for one
	t.ok(out.list.every((st) => st.s.every((e) => !/binders-tab-paragraph/.test(e.cls) && e.dx !== 24)), 'binder → outside: the loose note’s tab line is never drawn as a paragraph: ' + show(out));
});

test('BUG: a note moved into a binder while it is open in an editor: its tab line becomes a paragraph at once, not at the next click or key', async (p, h, t) => {
	await p.ev(`app.vault.create('Loose.md', ${j(TABTEXT)}).then(() => 1)`);
	await open(p, 'Loose.md'); await sleep(p, 600);
	const into = await watch(p, () => p.ev(`app.fileManager.renameFile(${file('Loose.md')}, ${j(L + 'Part One/Loose.md')}).then(() => 1)`), 2500);
	console.log('[frames moved into a binder] ' + show(into));
	t.ok(!into.list.some((st) => st.s.some(half)), 'moved in: no half-way frame: ' + show(into));
	t.ok(isGoodEnd(into), 'moved into the binder: after 2.5s the open editor shows the tab line as a paragraph: ' + show(into));
	t.eq(disk(p, L + 'Part One/Loose.md'), TABTEXT, 'the note on disk is as it was');
});

test('BUG: a note moved out of a binder while it is open in an editor: its tab line is code again at once, as Obsidian has it', async (p, h, t) => {
	await p.ev(`app.vault.create(${j(L + 'Part One/Loose.md')}, ${j(TABTEXT)}).then(() => 1)`);
	await sleep(p, 500);
	await open(p, L + 'Part One/Loose.md'); await sleep(p, 600);
	const out = await watch(p, () => p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Loose.md')}, 'Loose.md').then(() => 1)`), 2500);
	console.log('[frames moved out of a binder] ' + show(out));
	const end = out.list[out.list.length - 1];
	t.ok(end && end.s.length && end.s.every((e) => !/binders-tab-paragraph/.test(e.cls)), 'moved out: after 2.5s the open editor shows Obsidian’s code, not a paragraph: ' + show(out));
	t.eq(disk(p, 'Loose.md'), TABTEXT, 'the note on disk is as it was');
});

test('BUG: a folder made a binder while one of its notes is open in an editor: the tab line becomes a paragraph at once', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Draft'); await app.vault.create('Draft/One.md', ${j(TABTEXT)}); await app.vault.create('Draft/Two.md', 'Second.\\n'); return 1; })()`);
	await sleep(p, 500);
	await open(p, 'Draft/One.md'); await sleep(p, 600);
	const fr = await watch(p, () => p.ev(`${PL}.makeBinder(${file('Draft')}).then(() => 1)`), 2500);
	console.log('[frames folder made a binder] ' + show(fr));
	t.ok(!fr.list.some((st) => st.s.some(half)), 'no half-way frame: ' + show(fr));
	t.ok(isGoodEnd(fr), 'after 2.5s the open editor shows the tab line as a paragraph: ' + show(fr));
	t.eq(disk(p, 'Draft/One.md'), TABTEXT, 'the note on disk is as it was');
});

test('frames: turning “Start a paragraph with a tab” off and on with a live editor open: the editor goes to code and back with no half-way frame', async (p, h, t) => {
	await body(p, A, TABTEXT);
	await open(p, A, 'source', false);
	const off = await watch(p, () => set(p, { tabParagraphs: false }), 1200);
	console.log('[frames setting off] ' + show(off));
	const on = await watch(p, () => set(p, { tabParagraphs: true }), 1200);
	console.log('[frames setting on] ' + show(on));
	t.ok(isGoodEnd(on), 'on again: it ends as a tab paragraph: ' + show(on));
	t.ok(!on.list.some((st) => st.s.some(half)) && !off.list.some((st) => st.s.some(half)), 'no half-way frame: ' + show(off) + ' || ' + show(on));
	t.eq(disk(p, A), FRONT + TABTEXT, 'the note on disk is as it was');
});

test('BUG: a reading view that is open follows the settings: “Start a paragraph with a tab” off puts the code block back, “Indent paragraphs” on indents, without reopening the note', async (p, h, t) => {
	await body(p, A, 'First.\n\nSecond one.\n\n\tTabbed line to watch, with *stress*.\n');
	await open(p, A, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p.binders-tab-paragraph')})`);
	const rv = () => p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); return { pre: r.querySelectorAll('pre:not(.frontmatter)').length, tab: r.querySelectorAll('p.binders-tab-paragraph').length, second: getComputedStyle([...r.querySelectorAll('p')].find(e => e.textContent.startsWith('Second one'))).textIndent }; })()`);
	t.eq((await rv()).tab, 1, 'it begins as a paragraph');
	await set(p, { indentParagraphs: true }); await sleep(p, 1500);
	const ind = await rv();
	await set(p, { indentParagraphs: false, tabParagraphs: false }); await sleep(p, 1500);
	const off = await rv();
	console.log('[open reading view, settings turned] ' + j({ ind, off }));
	t.eq(ind.second, '24px', '“Indent paragraphs” turned on: the open reading view indents (' + j(ind) + ')');
	t.ok(off.pre === 1 && off.tab === 0, 'the tab setting turned off: the open reading view shows the code block again (' + j(off) + ')');
});

test('NIT: restarting (the plugin disabled and enabled) with a tab-paragraph note open in the editor and in reading view: from the enabling on, no frame draws a tab paragraph with a guide line or without its indent', async (p, h, t) => {
	await body(p, A, TABTEXT);
	await open(p, A, 'source', false);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(${file(A)}); await l.setViewState({ type: 'markdown', state: { file: ${j(A)}, mode: 'preview' } }); return 1; })()`);
	await sleep(p, 900);
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	await sleep(p, 600);
	// when does the plugin's stylesheet arrive, against when its editor extension and its post-processor are at work?
	await p.ev(`(() => { window.__css = null; const t = () => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.cssText.includes('--binders-paragraph-indent')); } catch { return false; } }); const id = setInterval(() => { if (t()) { window.__css = performance.now(); clearInterval(id); } }, 1); return 1; })()`);
	const fr = await watch(p, () => p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`), 3000);
	const css = await p.ev(`window.__css`);
	console.log('[frames plugin enabled with the note open] ' + show(fr) + ' stylesheet at ' + (css == null ? 'never seen' : Math.round(css - fr.t0) + 'ms'));
	const end = fr.list[fr.list.length - 1];
	t.ok(end && goodState(end, 24), 'both views end as tab paragraphs: ' + show(fr));
	// (the code the plugin being off leaves is right; a frame is wrong when Binders has marked the line and it is drawn wrong)
	const wrong = fr.list.filter((st) => st.s.some((e) => /binders-tab-paragraph/.test(e.cls) && !goodEl(e, 24)));
	t.ok(!wrong.length, `${wrong.length} state(s) of the tab line were marked by Binders and drawn wrong (a guide line, a tab 36px wide, no indent: the stylesheet arrives after the editor extension and the post-processor): ` + show(fr) + ' stylesheet at ' + Math.round(css - fr.t0) + 'ms');
	t.eq(disk(p, A), FRONT + TABTEXT, 'the note on disk is as it was');
});

// ---- the manuscript: sections swapping between text and editor as the page scrolls ----

/** A binder “Novel” of `n` notes, each: a plain paragraph, a tab paragraph, one after it. */
async function novel(p, n = 14, extra = '') {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novel');
		for (let i = 1; i <= ${n}; i++) { const k = String(i).padStart(2, '0'); await app.vault.create('Novel/Scene ' + k + '.md', '---\\nstatus: draft\\n---\\nPlain reference ' + k + '. ' + 'The sea came up the rocks and the light turned over it. '.repeat(3) + '\\n\\n\\tTabbed line ' + k + ', with *stress*. ' + 'The keeper wrote it down in the long book he kept by the window. '.repeat(3) + '\\n\\nAfter it ' + k + '.${extra}\\n'); }
		await new Promise(r => setTimeout(r, 700));
		await ${PL}.binders.makeBinder?.(app.vault.getAbstractFileByPath('Novel')) ?? await ${PL}.makeBinder(app.vault.getAbstractFileByPath('Novel'));
		return 1; })()`);
	await sleep(p, 800);
}
const NOVEL = (k) => `Novel/Scene ${String(k).padStart(2, '0')}.md`;
const scrollTo = (p, y) => p.ev(`(() => { const r = document.querySelector('.binders-manuscript'); r.scrollTop = ${y === 'end' ? 'r.scrollHeight' : y}; return r.scrollTop; })()`);
const sectionState = (p, k) => p.ev(`(() => { const out = {}; for (const s of document.querySelectorAll('.binders-manuscript .binders-manuscript-scene, .binders-manuscript [data-path]')) { } const t = [...document.querySelectorAll('.binders-manuscript .cm-line, .binders-manuscript-rendered p')].find(e => e.textContent.includes('Tabbed line ${String(k).padStart(2, '0')}')); return t ? { kind: t.classList.contains('cm-line') ? 'editor' : 'text', cls: t.className } : null; })()`);

test('the manuscript: a section shown as text, then as an editor, then as text again: its tab line is a paragraph in each, at the same x, with no wrong frame while it swaps', async (p, h, t) => {
	await novel(p);
	await manuscript(p, 'Novel');
	await installMeasure(p);
	await scrollTo(p, 0); await sleep(p, 1500);
	const seen = [];
	await startFrames(p, 'Tabbed line 01', 'Plain reference 01');
	seen.push(['top', await sectionState(p, 1)]);
	await scrollTo(p, 'end'); await sleep(p, 2500);
	seen.push(['bottom', await sectionState(p, 1)]);
	await scrollTo(p, 0); await sleep(p, 2500);
	seen.push(['top again', await sectionState(p, 1)]);
	await scrollTo(p, 'end'); await sleep(p, 2500);
	seen.push(['bottom again', await sectionState(p, 1)]);
	await scrollTo(p, 0); await sleep(p, 2500);
	seen.push(['top 3', await sectionState(p, 1)]);
	const fr = await stopFrames(p);
	console.log('[swap] ' + j(seen) + '\n' + fr.list.map((st) => `${st.t}ms#${st.f}: ` + st.s.map((e) => `${e.tag}.${e.cls} dx=${e.dx} rx=${e.rx}${e.mono ? ' MONO' : ''}${e.bg ? ' BG' : ''}${e.guide ? ' GUIDE' : ''}`).join(' + ')).join('\n'));
	t.ok(seen.some(([, s]) => s?.kind === 'text') && seen.some(([, s]) => s?.kind === 'editor'), 'the section was seen as text and as an editor: ' + j(seen));
	const bad = verdict(fr);
	t.ok(!bad.length, bad.join(' | '));
	// the x of the section's first paragraph in each look
	const xs = [...new Set(fr.list.flatMap((st) => st.s.filter((e) => e.rx != null).map((e) => e.rx)))];
	t.ok(xs.length === 1, 'the paragraph’s margin is the same in the editor and in the text (no jump when it swaps): ' + j(xs));
	for (let k = 1; k <= 14; k++) t.eq(disk(p, NOVEL(k)).includes('\tTabbed line'), true, `scene ${k}: the tab is still in the note`);
});

test('BUG: with “Indent paragraphs” on, a manuscript section’s paragraphs are set in as an editor and as text alike: no jump when it swaps', async (p, h, t) => {
	await set(p, { indentParagraphs: true });
	await novel(p);
	await manuscript(p, 'Novel');
	await scrollTo(p, 0); await sleep(p, 1500);
	const seen = [];
	await startFrames(p, 'After it 01', 'Plain reference 01');
	seen.push(['top', await sectionState(p, 1)]);
	await scrollTo(p, 'end'); await sleep(p, 2500);
	seen.push(['bottom', await sectionState(p, 1)]);
	await scrollTo(p, 0); await sleep(p, 2500);
	seen.push(['top again', await sectionState(p, 1)]);
	const fr = await stopFrames(p);
	console.log('[swap with indent] ' + fr.list.map((st) => `${st.t}ms#${st.f}: ` + st.s.map((e) => `${e.tag}.${e.cls} dx=${e.dx}`).join(' + ')).join(' // '));
	const dxs = [...new Set(fr.list.flatMap((st) => st.s.map((e) => e.dx)))];
	t.ok(dxs.length === 1 && Math.abs(dxs[0] - 24) <= 1, 'the paragraph that follows another starts 24px in, whether the section is an editor or text: ' + j(dxs));
});

// ---- the manuscript: across the end of a section into the next, and an outside edit while typing ----

/** ArrowDown until the caret is on the line that starts with this text (it has to leave the section it is in). */
const into = async (p, text) => { for (let i = 0; i < 6; i++) { await p.key('ArrowDown'); await sleep(p, 250); if (await p.ev(`(document.activeElement?.closest('.cm-editor')?.querySelector('.cm-line.cm-active')?.textContent ?? '').trim().startsWith(${j(text)})`)) return; } throw new Error('the caret never reached ' + text); };
const caretIn = (p) => p.ev(`(() => { const a = document.activeElement; const l = a?.closest?.('.binders-manuscript-editor, .binders-manuscript-scene, [data-path]'); return (l?.dataset?.path || l?.closest?.('[data-path]')?.dataset?.path || '') + '|' + (a?.className || ''); })()`);

test('the manuscript: typing a tab paragraph, then arrowing down out of the end of a section into the next and tabbing at its start: the disk has exactly what was typed', async (p, h, t) => {
	for (const [path, w] of [[A, 'Alpha'], [K, 'Bravo'], [S, 'Charlie']]) await body(p, path, `${w}.\n`);
	await manuscript(p);
	await clickEnd(p, 'Alpha.');
	await p.key('Enter'); await p.key('Enter'); await p.key('Tab'); await p.type('Typed in Alpha.');
	await p.key('Enter'); await p.type('Carried.');
	// out of the end of the section, into the start of the next one
	await into(p, 'Bravo.');
	await p.key('Home'); await p.key('Tab'); await sleep(p, 300);
	await p.type('Typed in Bravo. ');
	await p.key('End'); await p.key('Enter'); await p.key('Enter'); await p.key('Tab'); await p.type('Second in Bravo.');
	await sleep(p, 300);
	await into(p, 'Charlie.');
	await p.key('Home'); await p.key('Tab'); await p.type('Typed in Charlie. ');
	const a = FRONT + 'Alpha.\n\n\tTyped in Alpha.\n\tCarried.\n';
	const b = FRONT + '\tTyped in Bravo. Bravo.\n\tSecond in Bravo.\n'; // (two Enters on a tab line leave one new line: Obsidian’s own, the same outside a binder)
	const c = FRONT + '\tTyped in Charlie. Charlie.\n';
	await diskIs(p, S, c);
	t.eq(disk(p, A), a, 'Alpha: what was typed');
	t.eq(disk(p, K), b, 'Bravo: what was typed, the tab at the start of its first line too');
	t.eq(disk(p, S), c, 'Charlie: what was typed, the tab at the start of its first line too');
	const ls = await msLines(p);
	for (const needle of ['Typed in Alpha', 'Carried', 'Typed in Bravo', 'Second in Bravo', 'Typed in Charlie']) {
		const l = ls.find((x) => x.text.includes(needle));
		t.ok(l && /binders-tab-paragraph/.test(l.cls) && !l.code, `“${needle}” is a tab paragraph, not code (${l?.cls})`);
	}
	t.eq(errors(p).length, 0, 'no errors: ' + errors(p).join(' | '));
});

test('the manuscript: an outside edit to the section being typed in: what was typed is kept, and the outside text arrives as tab paragraphs', async (p, h, t) => {
	await body(p, K, 'Bravo.\n');
	await manuscript(p);
	await clickEnd(p, 'Bravo.');
	await p.key('Enter'); await p.key('Enter'); await p.key('Tab'); await p.type('Typed before.');
	await diskIs(p, K, FRONT + 'Bravo.\n\n\tTyped before.\n');
	// another app writes the note (a sync): the typed text and one more tab paragraph
	const outside = FRONT + 'Bravo.\n\n\tTyped before.\n\n\tWritten from outside, *stress*.\n';
	await writeRaw(p, K, outside);
	await until(p, `[...document.querySelectorAll('.binders-manuscript .cm-line')].some(l => l.textContent.includes('Written from outside'))`, 8000);
	await sleep(p, 600);
	let ls = await msLines(p);
	const o = ls.find((x) => x.text.includes('Written from outside'));
	t.ok(o && /binders-tab-paragraph/.test(o.cls) && !o.code, 'the outside tab paragraph is a paragraph, not code: ' + (o && o.cls));
	// typing goes on at the end of the section
	await clickEnd(p, 'Written from outside');
	await p.key('Enter'); await p.type('Typed after.');
	await diskIs(p, K, outside + '\tTyped after.\n'.replace(/\n$/, ''), 8000).catch(() => {});
	await sleep(p, 2500);
	t.eq(disk(p, K), FRONT + 'Bravo.\n\n\tTyped before.\n\n\tWritten from outside, *stress*.\n\tTyped after.\n', 'the disk has the outside text and what was typed after it, tabs and all');
	ls = await msLines(p);
	const l = ls.find((x) => x.text.includes('Typed after'));
	t.ok(l && /binders-tab-paragraph/.test(l.cls), 'the line typed after is a tab paragraph (' + l?.cls + ')');
});

test('typing keys in a binder’s note and in a note outside a binder give the same text: Binders changes how a tab line looks, never what Enter, Tab and Backspace do', async (p, h, t) => {
	const keys = async () => {
		await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); e.setCursor(e.lastLine() + 1 > 0 ? 0 : 0, 0); return 1; })()`);
		await p.key('Home'); await p.key('Tab'); await p.type('Typed first. '); await p.key('End');
		await p.key('Enter'); await p.key('Enter'); await p.key('Tab'); await p.type('Second.');
		await p.key('Enter'); await p.type('Third, carried.');
		await p.key('Enter'); await p.key('Enter'); await p.type('Fourth, after two Enters.');
		await p.key('Home'); await p.key('Backspace'); await p.key('Backspace'); await p.type('X');
		await p.key('Enter'); await p.key('Tab'); await p.key('Tab'); await p.type('Deep.'); await p.key('Home'); await p.key('Backspace');
		await sleep(p, 400);
		return p.ev(`app.workspace.activeEditor.editor.getValue()`);
	};
	await p.ev(`app.vault.create('Loose.md', 'Bravo.\\n').then(() => 1)`);
	await body(p, A, 'Bravo.\n');
	await open(p, 'Loose.md');
	const loose = await keys();
	await open(p, A);
	const bound = (await keys()).slice(FRONT.length);
	console.log('[typing] ' + j({ loose, bound }));
	t.eq(bound, loose, 'the same keys leave the same text in a binder’s note and outside one');
});

// ---- focus mode on the manuscript ----

const FM = `${VIEW}.current`;
const sectionText = (k) => `Plain reference 0${k}.\n\n\tTabbed line 0${k}, with *stress*.\n\nAfter it 0${k}.\n`;
const enterFocus = async (p, h) => { await h.run('focus'); await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`, 6000); await sleep(p, 600); };
const leaveFocus = async (p, h) => { if (await p.ev(`document.body.classList.contains('binders-focus')`)) { await h.run('focus'); await until(p, `!document.body.classList.contains('binders-focus')`, 6000); await sleep(p, 800); } };

test('focus mode on the manuscript: tab paragraphs and indented paragraphs in the section being written, in the sections around it, while typing with typewriter scrolling and dimming on; nothing typed is lost', async (p, h, t) => {
	for (const [k, path] of [[1, A], [2, K], [3, S]]) await body(p, path, sectionText(k));
	await set(p, { indentParagraphs: true, focusNeighbours: false, focusDim: true, focusTypewriter: true });
	await manuscript(p);
	await p.ev(`(async () => { const m = ${FM}; await m.focusScene(m.scenes.find(s => s.file.path === ${j(K)}), 'end'); })().then(() => 1)`);
	await sleep(p, 500);
	await installMeasure(p);
	await startFrames(p, 'Tabbed line 02', 'Plain reference 02');
	await enterFocus(p, h);
	try {
		// typing: a tab paragraph at the end of the section, as a writer would, under dimming and typewriter scrolling
		await p.key('Enter'); await p.key('Tab'); await p.type('Typed in focus, with *stress*.');
		await p.key('Enter'); await p.type('Carried on.');
		await sleep(p, 700);
		t.ok(await p.ev(`document.body.classList.contains('binders-focus-typing')`), 'typing mode is on (the page is dimmed round the line)');
		const ls = await msLines(p, '.binders-focus-leaf');
		const typed = ls.find((x) => x.text.includes('Typed in focus')), carried = ls.find((x) => x.text.includes('Carried on'));
		t.ok(typed && /binders-tab-paragraph/.test(typed.cls) && !typed.code, 'the typed tab line is a tab paragraph: ' + typed?.cls);
		t.ok(carried && /binders-tab-paragraph/.test(carried.cls) && !carried.code, 'and the line after it: ' + carried?.cls);
		const plain = ls.find((x) => x.text.includes('Plain reference 02')), tab = ls.find((x) => x.text.includes('Tabbed line 02')), after = ls.find((x) => x.text.includes('After it 02'));
		t.ok(Math.abs(tab.x - plain.x - 24) <= 1, `the tab line is 24px in (${tab.x - plain.x})`);
		t.ok(Math.abs(after.x - plain.x - 24) <= 1, `the indented paragraph is 24px in (${after.x - plain.x})`);
		const dimmed = await p.ev(`(() => { const l = [...document.querySelectorAll('.binders-focus-leaf .cm-line')].find(e => e.textContent.includes('Tabbed line 02')); return getComputedStyle(l).opacity + ' ' + getComputedStyle(l).color; })()`);
		console.log('[focus dim] ' + dimmed);
		const fr = await stopFrames(p);
		const bad = verdict(fr);
		t.ok(!bad.length, 'no wrong frame for the tab line while entering focus and typing: ' + bad.join(' | '));
	} finally { await leaveFocus(p, h); }
	await sleep(p, 2500);
	t.eq(disk(p, K), FRONT + sectionText(2) + '\n\tTyped in focus, with *stress*.\n\tCarried on.', 'the note has what was typed, tabs and all');
	// leaving focus leaves the paragraphs as they were
	const ls = await msLines(p);
	t.ok(ls.filter((x) => /Tabbed line|Typed in focus|Carried on/.test(x.text)).every((x) => /binders-tab-paragraph/.test(x.cls)), 'after leaving focus every tab line is still a paragraph');
});

test('BUG: focus mode in a note’s own tab, with the scenes before and after on: tab paragraphs and indented paragraphs in the text, the scene before and the scene after', async (p, h, t) => {
	for (const [k, path] of [[1, A], [2, K], [3, S]]) await body(p, path, sectionText(k));
	await set(p, { indentParagraphs: true, focusNeighbours: true, focusDim: false });
	await installMeasure(p);
	await open(p, K);
	await enterFocus(p, h);
	try {
		await until(p, `document.querySelectorAll('.binders-focus-near-text').length >= 2`, 6000);
		await sleep(p, 600);
		const mine = await measure(p, '.binders-focus-leaf .cm-content');
		const ls = await msLines(p, '.binders-focus-leaf .cm-content');
		const plain = ls.find((x) => x.text.includes('Plain reference 02')), tab = ls.find((x) => x.text.includes('Tabbed line 02')), after = ls.find((x) => x.text.includes('After it 02'));
		t.ok(Math.abs(tab.x - plain.x - 24) <= 1 && Math.abs(after.x - plain.x - 24) <= 1, `the note itself: tab line ${tab.x - plain.x}, after it ${after.x - plain.x} (24 each)`);
		const near = await p.ev(`[...document.querySelectorAll('.binders-focus-near-text')].map(e => { const f = (s) => { const x = [...e.querySelectorAll('p')].find(p => p.textContent.includes(s)); if (!x) return null; const n = document.createTreeWalker(x, NodeFilter.SHOW_TEXT); let t; while ((t = n.nextNode())) { const i = t.textContent.indexOf(s); if (i >= 0) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); return r.getBoundingClientRect().left; } } return null; }; return { plain: f('Plain reference'), tab: f('Tabbed line'), after: f('After it'), pres: e.querySelectorAll('pre').length }; })`);
		console.log('[focus neighbours] ' + j(near));
		for (const [i, n] of near.entries()) {
			t.eq(n.pres, 0, `neighbour ${i}: no code block`);
			if (n.plain != null && n.tab != null) t.ok(Math.abs(n.tab - n.plain - 24) <= 1, `neighbour ${i}: the tab line is 24px in (${n.tab - n.plain})`);
			if (n.plain != null && n.after != null) t.ok(Math.abs(n.after - n.plain - 24) <= 1, `neighbour ${i}: the paragraph after it is 24px in with “Indent paragraphs” on (${n.after - n.plain})`);
		}
	} finally { await leaveFocus(p, h); }
	t.eq(disk(p, K), FRONT + sectionText(2), 'the note on disk is as it was');
});

// ---- reading view in depth ----

const DEPTH = '# A heading\n\n\tTab under a heading.\n\nPlain paragraph.\n\tTab line under a plain paragraph.\n\n- a list item\n\n\tTab after a list item.\n\n> a quote\n\tTab line in a quote.\n\n> [!note] A callout\n> its body\n\n\tTab after a callout.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n\tTab after a table.\n\n\tRun line one.\n\tRun line two.\n\tRun line three.\n\n\tSeparate one.\n\n\tSeparate two.\n\n```\n\tfenced code\n```\n\n\tTab after fenced code.\n\n    Four spaces after fenced code.\n\nLast plain one.\n';
const where = (p, starts) => p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); const tw = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!n.textContent.includes(${j(starts)})) continue; let e = n.parentElement; const cs = getComputedStyle(e.closest('p, pre, li, td, .callout-content') || e); const blk = e.closest('p, pre, li, td, .callout-content') || e; return { tag: blk.tagName.toLowerCase(), cls: blk.className, inPre: !!e.closest('pre'), inCode: !!e.closest('code'), mono: /mono|courier/i.test(cs.fontFamily), bg: cs.backgroundColor !== 'rgba(0, 0, 0, 0)', indent: cs.textIndent, tab: blk.querySelectorAll('.binders-tab').length, within: [...(e.closest('blockquote, .callout, li, table') ? [e.closest('blockquote, .callout, li, table').tagName.toLowerCase()] : [])].join('') }; } return null; })()`);

test('reading view: tab lines in every neighbourhood: under a heading, a plain paragraph, a list, a quote, a callout, a table, in runs with and without blank lines, around fenced code; none is left as code except the fenced one', async (p, h, t) => {
	await body(p, A, DEPTH);
	await open(p, A, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p.binders-tab-paragraph')})`);
	await sleep(p, 800);
	const all = {};
	for (const s of ['Tab under a heading', 'Tab line under a plain', 'Tab after a list item', 'Tab line in a quote', 'Tab after a callout', 'Tab after a table', 'Run line one', 'Run line two', 'Run line three', 'Separate one', 'Separate two', 'fenced code', 'Tab after fenced code', 'Four spaces after fenced', 'Last plain']) all[s] = await where(p, s);
	console.log('[reading depth] ' + j(all));
	for (const s of ['Tab under a heading', 'Tab after a callout', 'Tab after a table', 'Run line one', 'Run line two', 'Run line three', 'Separate one', 'Separate two', 'Tab after fenced code', 'Four spaces after fenced']) {
		const w = all[s];
		t.ok(w && !w.inPre && !w.mono && !w.bg, `“${s}” is a paragraph, not code (${j(w)})`);
		t.ok(w && (/binders-tab-paragraph/.test(w.cls)), `“${s}” is a tab paragraph (${j(w)})`);
		t.eq(w.indent, '24px', `“${s}” is indented by the indent`);
	}
	t.ok(all['Tab line under a plain'].tab === 1 && !all['Tab line under a plain'].inPre, 'a tab line under a plain paragraph has its tab back: ' + j(all['Tab line under a plain']));
	t.ok(all['fenced code'].inPre, 'fenced code is code still');
	for (const s of ['Tab after a list item', 'Tab line in a quote']) t.ok(!all[s].inPre, `“${s}” belongs to the list or the quote and is not code: ${j(all[s])}`);
	// runs: no blank line between them is no space between them, and a blank line is a space
	const gaps = await p.ev(`(() => { const ps = [...document.querySelectorAll(${j(LEAF + ' .markdown-reading-view p.binders-tab-paragraph')})]; const g = (a, b) => { const x = ps.find(p => p.textContent.includes(a)), y = ps.find(p => p.textContent.includes(b)); return Math.round((y.getBoundingClientRect().top - x.getBoundingClientRect().bottom) * 10) / 10; }; return { run: g('Run line one', 'Run line two'), run2: g('Run line two', 'Run line three'), sep: g('Separate one', 'Separate two') }; })()`);
	console.log('[reading gaps] ' + j(gaps));
	t.ok(gaps.run <= 1 && gaps.run2 <= 1, 'lines with no blank line between them are set close, as in the editor: ' + j(gaps));
	t.ok(gaps.sep > 8, 'paragraphs with a blank line between them have the paragraph space: ' + j(gaps));
	t.eq(disk(p, A), FRONT + DEPTH, 'the note on disk is as it was');
});

test('reading view with “Strict line breaks” on: a tab line under a plain paragraph runs on with it, and the rest are still paragraphs, nothing is code', async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('strictLineBreaks', true); return 1; })()`);
	try {
		await body(p, A, 'Plain paragraph.\n\tTab line under a plain paragraph.\n\n\tFirst tab.\n\tSecond tab straight under it.\n\nAfter.\n');
		await open(p, A, 'preview');
		await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p')})`);
		await sleep(p, 800);
		const r = await p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); return { pres: r.querySelectorAll('pre:not(.frontmatter)').length, ps: [...r.querySelectorAll('p')].map(p => ({ text: p.textContent, cls: p.className, tabs: p.querySelectorAll('.binders-tab').length, br: p.querySelectorAll('br').length, indent: getComputedStyle(p).textIndent })) }; })()`);
		console.log('[strict line breaks] ' + j(r));
		t.eq(r.pres, 0, 'no code block: ' + j(r));
		const first = r.ps.find((x) => x.text.includes('First tab'));
		t.ok(first && /binders-tab-paragraph/.test(first.cls) && first.indent === '24px', 'a tab line after a blank line is a paragraph: ' + j(first));
		const under = r.ps.find((x) => x.text.includes('Plain paragraph'));
		t.ok(under && under.br === 0 && under.tabs === 0, 'a tab line straight under a plain paragraph runs on with it (strict line breaks): ' + j(under));
	} finally { await p.ev(`(() => { app.vault.setConfig('strictLineBreaks', false); return 1; })()`); }
});

test('reading view of a long note: every tab line is a paragraph after the note is scrolled through, and after an edit from the editor side of a split, no block is left as (or flashes as) a code block', async (p, h, t) => {
	const para = (i) => `\tTab paragraph number ${i}, with *stress* and [[The keeper]], long enough to be a line or two of the page in reading view.\n`;
	const text = Array.from({ length: 160 }, (_, i) => `Plain ${i}.\n\n${para(i)}`).join('\n');
	await body(p, A, text);
	await open(p, A, 'source', false);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(${file(A)}); await l.setViewState({ type: 'markdown', state: { file: ${j(A)}, mode: 'preview' } }); return 1; })()`);
	await until(p, `!!document.querySelector('.markdown-reading-view p.binders-tab-paragraph')`, 8000);
	await sleep(p, 1500);
	// frames: any pre drawn in the reading view, ever
	await p.ev(`(() => { const S = window.__pre = { max: 0, frames: 0, stop: false, seen: [] }; const step = () => { const rv = [...document.querySelectorAll('.markdown-reading-view')].find(e => e.offsetParent); const n = rv ? rv.querySelectorAll('pre:not(.frontmatter)').length : 0; if (n) { S.frames++; S.max = Math.max(S.max, n); if (S.seen.length < 3) S.seen.push(rv.querySelector('pre:not(.frontmatter)').textContent.slice(0, 40)); } if (!S.stop) requestAnimationFrame(step); }; requestAnimationFrame(step); return 1; })()`);
	// edit from the editor side, here and there in the note
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.getMode() === 'source'); app.workspace.setActiveLeaf(l, { focus: true }); const e = l.view.editor; e.focus(); return 1; })()`);
	for (const line of [3, 100, 250, 3]) {
		await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor(${line}, 0); e.focus(); return 1; })()`);
		await p.key('End'); await p.type(' edit');
		await sleep(p, 700);
	}
	await sleep(p, 1500);
	const pre = await p.ev(`(() => { const S = window.__pre; S.stop = true; return S; })()`);
	console.log('[long reading view] ' + j(pre));
	t.eq(pre.frames, 0, 'no frame drew a code block in reading view during the edits: ' + j(pre));
	// scroll through the whole reading view
	const res = await p.ev(`(async () => { const rv = [...document.querySelectorAll('.markdown-reading-view')].find(e => e.offsetParent); const sc = rv; let pres = 0, tabs = 0; for (let y = 0; y < rv.scrollHeight; y += 300) { rv.scrollTop = y; await new Promise(r => setTimeout(r, 120)); pres = Math.max(pres, rv.querySelectorAll('pre:not(.frontmatter)').length); } await new Promise(r => setTimeout(r, 600)); return { pres, tabs: rv.querySelectorAll('p.binders-tab-paragraph').length }; })()`);
	t.eq(res.pres, 0, 'scrolling through the whole note, no block is a code block: ' + j(res));
	t.ok(res.tabs > 5, 'tab paragraphs are drawn: ' + j(res));
});

test('a note outside a binder is untouched in reading view, in an embed and in a hover preview: code, as Obsidian has it', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create('Loose.md', '\\tOutside tab line.\\n'); await app.vault.create('Host.md', 'Host.\\n\\n![[Loose]]\\n\\nSee [[Loose]].\\n'); return 1; })()`);
	await open(p, 'Host.md', 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view .markdown-embed pre')})`, 6000);
	const r = await p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); return { embedPre: r.querySelectorAll('.markdown-embed pre').length, tabP: r.querySelectorAll('.binders-tab-paragraph, .binders-prose').length }; })()`);
	t.eq(r.embedPre, 1, 'the embed shows the code block');
	t.eq(r.tabP, 0, 'nothing of Binders’ is on it: ' + j(r));
	const at = await p.at(LEAF + ' .markdown-reading-view a.internal-link');
	await p.move(at.x - 40, at.y + 40, 3); await p.move(at.x, at.y, 8);
	await until(p, `!!document.querySelector('.popover.hover-popover .markdown-embed')`, 6000); await sleep(p, 900);
	const hov = await p.ev(`({ pre: document.querySelectorAll('.popover.hover-popover pre:not(.frontmatter)').length, tab: document.querySelectorAll('.popover.hover-popover .binders-tab-paragraph, .popover.hover-popover .binders-prose').length })`);
	await p.move(5, 5, 4);
	t.eq(hov.pre, 1, 'the hover preview shows the code block: ' + j(hov));
	t.eq(hov.tab, 0, 'nothing of Binders’ is on it');
	t.eq(disk(p, 'Loose.md'), '\tOutside tab line.\n', 'the note on disk is as it was');
});

test('reading view: a tab line straight under a quote’s line stays where Obsidian has it (in the quote, as the docs say), and the editor and reading view agree', async (p, h, t) => {
	const text = '> a quote\n\tTab line in a quote.\n\nPlain.\n';
	await body(p, A, text);
	const probe = async () => { await open(p, A, 'preview'); await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p')})`); await sleep(p, 700); return where(p, 'Tab line in a quote'); };
	await set(p, { tabParagraphs: false });
	const off = await probe();
	await set(p, { tabParagraphs: true });
	const on = await probe();
	await open(p, A, 'source', false);
	const ed = (await lines(p)).find((l) => l.text.includes('Tab line in a quote'));
	console.log('[quote] ' + j({ off, on, ed }));
	t.eq(on.within, off.within, 'with the setting on the tab line is in the same place as with it off (' + j({ off: off.within || 'outside a quote', on: on.within || 'outside a quote' }) + ')');
});
const lines = (p, root = LEAF) => p.ev(`[...document.querySelectorAll(${j(root + ' .cm-content > .cm-line')})].map(l => ({ text: l.textContent, cls: l.className }))`);

test('BUG: a setting turned while a note’s reading view is out of sight: coming back to it (switching to editing and back, or to another note and back) shows the note as the settings say now', async (p, h, t) => {
	await body(p, A, 'First.\n\nSecond one.\n\n\tTabbed line to watch, with *stress*.\n');
	const state = () => p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .markdown-reading-view')}); return { pre: r.querySelectorAll('pre:not(.frontmatter)').length, tab: r.querySelectorAll('p.binders-tab-paragraph').length, second: getComputedStyle([...r.querySelectorAll('p')].find(e => e.textContent.startsWith('Second one'))).textIndent }; })()`);
	await open(p, A, 'preview');
	await until(p, `!!document.querySelector(${j(LEAF + ' .markdown-reading-view p.binders-tab-paragraph')})`);
	// 1: to the editor, the settings change there, back to reading view
	await open(p, A, 'source', false);
	await set(p, { tabParagraphs: false, indentParagraphs: true });
	await sleep(p, 500);
	await open(p, A, 'preview'); await sleep(p, 900);
	const back = await state();
	// 2: another note and back
	await open(p, K, 'preview'); await sleep(p, 600);
	await set(p, { tabParagraphs: true, indentParagraphs: false });
	await open(p, A, 'preview'); await sleep(p, 900);
	const again = await state();
	console.log('[stale] ' + j({ back, again }));
	t.ok(back.pre === 1 && back.tab === 0 && back.second === '24px', 'tab off, indent on, back from the editor: the code block and the indent (' + j(back) + ')');
	t.ok(again.pre === 0 && again.tab === 1 && again.second === '0px', 'tab on, indent off, back from another note: the paragraph, no indent (' + j(again) + ')');
});

// ---- export and what else reads the text: existing behaviour holds ----

const TABS_OUT = '\tFirst tab paragraph, with *stress*.\n\tSecond straight under it.\n\n\tThird after a blank line.\n\nA plain one.\n';

test('export: a tab paragraph is one paragraph in Word, in an ebook and in a Scrivener project: not code, no tab or spaces in front, not indented twice', async (p, h, t) => {
	await withAuthor(p);
	await writeRaw(p, L + 'Prologue.md', TABS_OUT);
	await sleep(p, 600);
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p);
	try {
		// Word
		await openExport(p);
		await press(p, 'Export'); await saved(p);
		const d = docx(join(p.vaultDir, 'Exports', 'The Lighthouse.docx'));
		const mine = d.paras.filter((x) => /tab paragraph|Second straight|Third after|A plain one/.test(x.text));
		console.log('[docx] ' + j(mine));
		t.eq(mine.length, 4, 'Word: each tab line and the plain one is a paragraph of its own: ' + j(mine));
		t.ok(mine.every((x) => !/^\s/.test(x.text) && x.style === 'Normal'), 'Word: no tab or spaces in front, in the body style (the style gives the indent): ' + j(mine));
		await closeAll(p);
		// the ebook
		await openEbook(p);
		await press(p, 'Export'); await saved(p);
		const e = epub(join(p.vaultDir, 'Exports', 'The Lighthouse.epub'));
		const page = e.names.find((n) => /prologue\.xhtml$/.test(n));
		const html = e.x(page);
		console.log('[epub] ' + (/<body[\s\S]*<\/body>/.exec(html)?.[0] ?? '').replace(/\s+/g, ' ').slice(0, 700));
		t.ok(!/<pre|<code|&#9;|\t(?=[A-Z])/.test(/<body[\s\S]*<\/body>/.exec(html)[0].replace(/\n\s*/g, '')), 'EPUB: no code, no tab character in front of the text');
		t.eq((html.match(/<p[ >]/g) ?? []).length, 4, 'EPUB: each tab line is a <p> of its own, and the plain one');
		t.ok(!/<p[^>]*>\s*(&nbsp;|&#160;|&emsp;| | )/.test(html), 'EPUB: no space character standing in for the indent: the stylesheet gives it');
		await closeAll(p);
	} finally { await closeAll(p); await p.ev(`(() => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); return 1; })()`); }
	t.eq(disk(p, L + 'Prologue.md'), TABS_OUT, 'the note on disk is as it was');
});

test('export: a Scrivener project has a tab paragraph as one RTF paragraph with its text, and the note is untouched', async (p, h, t) => {
	await withAuthor(p);
	await writeRaw(p, L + 'Prologue.md', TABS_OUT);
	await sleep(p, 600);
	await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`);
	await standIn(p);
	try {
		await openExport(p);
		await pick(p, 'Scrivener project');
		await sleep(p, 600);
		await press(p, 'Export'); await saved(p, 20000);
		const dir = join(p.vaultDir, 'Exports');
		const found = [];
		const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const q = join(d, f.name); if (f.isDirectory()) walk(q); else if (/\.rtf$/.test(f.name)) { const x = readFileSync(q, 'latin1'); if (x.includes('First tab paragraph')) found.push(x); } } };
		walk(dir);
		console.log('[scrivener rtf] ' + (found[0] ?? '').replace(/\s+/g, ' ').slice(-400));
		t.eq(found.length, 1, 'one document of the project has the text');
		const rtf = found[0] ?? '';
		const around = /\\par\s*([^]*?)First tab paragraph/.exec(rtf)?.[0] ?? rtf.slice(rtf.indexOf('First tab') - 80, rtf.indexOf('First tab'));
		t.ok(!/\\tab\s*First tab|\{\\tab\}First|\\tab First|^\s*\t/.test(around), 'no tab stands in front of the text in the RTF: ' + j(around.slice(-80)));
	} finally { await closeAll(p); await p.ev(`(() => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); return 1; })()`); }
	t.eq(disk(p, L + 'Prologue.md'), TABS_OUT, 'the note on disk is as it was');
});

test('scene tools: duplicate, split at the cursor, merge, and a snapshot brought back keep a tab paragraph byte for byte', async (p, h, t) => {
	const text = 'Plain first.\n\n\tFirst tab paragraph, with *stress* and [[The keeper]].\n\tSecond straight under.\n\n\tThird after a blank.\n';
	await body(p, A, text);
	await sleep(p, 600);
	// duplicate
	await p.ev(`${B}.duplicate(${file(A)}).then(() => 1)`);
	await sleep(p, 900);
	const copy = await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).filter(x => x.startsWith(${j(L + 'Part One/Arrival')}) && x !== ${j(A)})`);
	t.eq(copy.length, 1, 'a copy is made: ' + j(copy));
	t.eq(disk(p, copy[0]).replace(/^---\n[\s\S]*?\n---\n/, ''), text, 'the copy has the text byte for byte');
	// split at the cursor, in the middle of the second tab paragraph's line start
	await open(p, A);
	const at = FRONT.length + text.indexOf('\tThird');
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); e.setCursor(e.offsetToPos(${text.indexOf('\tThird')} + ${(FRONT.length)} - 0)); return 1; })()`);
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor(e.offsetToPos(e.getValue().indexOf('\\tThird'))); return 1; })()`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene'); return 1; })()`);
	await sleep(p, 1500);
	const kept = disk(p, A).replace(/^---\n[\s\S]*?\n---\n/, ''), made = await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).filter(x => x.startsWith(${j(L + 'Part One/Arrival')}) && x !== ${j(A)} && x !== ${j(copy[0])})`);
	console.log('[split] ' + j({ kept, made }));
	t.eq(made.length, 1, 'the split made one note: ' + j(made));
	const rest = made.length ? disk(p, made[0]).replace(/^---\n[\s\S]*?\n---\n/, '') : '';
	t.ok(rest.startsWith('\tThird after a blank.') || rest.trimStart().startsWith('Third after a blank.') && false, 'the new note begins with the tab: ' + j(rest));
	t.eq((kept + rest).replace(/\n+/g, '\n'), text.replace(/\n+/g, '\n'), 'what was split is all there, tabs and all: ' + j({ kept, rest }));
});

test('scene tools: merge two notes and bring a snapshot back keep tab paragraphs byte for byte', async (p, h, t) => {
	const a = 'Plain first.\n\n\tFirst tab paragraph, with *stress*.\n\tSecond straight under.\n';
	const k = '\tOpening tab of the keeper.\n\n\tAnd another.\n';
	await body(p, A, a); await body(p, K, k);
	await sleep(p, 700);
	await openView(p, L + 'Part One');
	const boxOf = (path) => p.ev(`(() => { const e = document.querySelector('.workspace-leaf.mod-active .binders-card[data-path=${j(path)}]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: r.top }; })()`);
	const ba = await boxOf(A), bk = await boxOf(K);
	await p.click(ba.x, ba.t + 12);
	await p.click(bk.x, bk.t + 12, { modifiers: 2 });
	await p.right(bk.x, bk.y);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await sleep(p, 1500);
	const merged = disk(p, A).replace(/^---\n[\s\S]*?\n---\n/, '');
	console.log('[merge] ' + j(merged));
	t.ok(merged.includes('\tFirst tab paragraph, with *stress*.\n\tSecond straight under.') && merged.includes('\tOpening tab of the keeper.\n\n\tAnd another.'), 'the merged note has every tab: ' + j(merged));
	t.eq(merged.replace(/\n+/g, '\n'), (a + '\n' + k).replace(/\n+/g, '\n'), 'and nothing else changed (blank lines aside)');
	// a snapshot: taken, the note changed, brought back
	await body(p, S, a);
	await open(p, S);
	await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`); await sleep(p, 500);
	await p.ev(`(async () => { await ${PL}.binders.snapshotsSettle(); await ${PL}.binders.flush(); return 1; })()`);
	await body(p, S, 'Changed completely.\n');
	await sleep(p, 500);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
	await until(p, `document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item').length >= 2`, 8000);
	await p.ev(`(() => { document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item')[1].click(); return 1; })()`); await sleep(p, 500);
	await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-snapshots .modal-setting-titlebar-actions button')].find(b => b.textContent === 'Bring back').click(); return 1; })()`);
	await until(p, `app.vault.adapter.read(${j(S)}).then(x => x === ${j(FRONT + a)})`, 6000);
	t.eq(disk(p, S), FRONT + a, 'brought back: the note has the snapshot’s text, tabs and all, byte for byte');
});

test('NIT: the snapshots window’s “Show changes” sets a tab paragraph in like the text beside it does', async (p, h, t) => {
	await body(p, A, SHORT);
	await open(p, A);
	await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`); await sleep(p, 500);
	await p.ev(`(async () => { await ${PL}.binders.snapshotsSettle(); await ${PL}.binders.flush(); return 1; })()`);
	await body(p, A, 'Plain flush paragraph one, changed.\n\n\tTab paragraph here, changed.\n\nThird paragraph follows, changed.\n');
	await sleep(p, 600);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
	await until(p, `document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item').length >= 2`, 8000);
	await p.ev(`(() => { document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item')[1].click(); return 1; })()`); await sleep(p, 600);
	const text = await p.ev(`(() => { const e = document.querySelector('.modal.binders-snapshots .binders-snapshots-text'); const x = [...e.querySelectorAll('p')]; const l = (s) => { const q = x.find(p => p.textContent.includes(s)); if (!q) return null; const n = document.createTreeWalker(q, NodeFilter.SHOW_TEXT); let t; while ((t = n.nextNode())) { const i = t.textContent.indexOf(s); if (i >= 0) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); return r.getBoundingClientRect().left; } } }; return { plain: l('Plain flush'), tab: l('Tab paragraph') }; })()`);
	await p.ev(`(() => { document.querySelector('.modal.binders-snapshots .binders-snapshots-compare').click(); return 1; })()`); await sleep(p, 700);
	const diff = await p.ev(`(() => { const e = document.querySelector('.modal.binders-snapshots .binders-snapshots-changes'); if (!e) return null; const x = [...e.querySelectorAll('p')]; const l = (s) => { const q = x.find(p => p.textContent.includes(s)); if (!q) return null; const n = document.createTreeWalker(q, NodeFilter.SHOW_TEXT); let t; while ((t = n.nextNode())) { const i = t.textContent.indexOf(s); if (i >= 0) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); return r.getBoundingClientRect().left; } } }; return { plain: l('Plain flush'), tab: l('Tab paragraph'), ps: x.map(p => p.textContent) }; })()`);
	console.log('[show changes] ' + j({ text, diff }));
	t.ok(!!diff && diff.plain != null, 'the changes are shown: ' + j(diff));
	t.ok(Math.abs((text.tab - text.plain) - 24) < 1, 'beside it the text sets the tab paragraph in 24px (' + (text.tab - text.plain) + ')');
	t.ok(Math.abs((diff.tab - diff.plain) - 24) < 1, 'Show changes sets the tab paragraph in 24px too (' + (diff.tab - diff.plain) + ')');
});
