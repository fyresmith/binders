// QA round 6, Binders as a phone app: a whole writing session by thumb, every tap target, large text, landscape with the
// keyboard up, interruptions and speed. Phones are emulated as in specs-qa4-mobile.mjs and specs-qa5-manuscript.mjs
// (whose helpers are used here): the on-screen keyboard is a shorter viewport and `Input.insertText`, a long press never
// sends `contextmenu` so it's dispatched as Obsidian does, the app going to the background is `visibilitychange` and
// `pagehide`, and safe-area insets are 0. Tests named "qa6 phone: …" pass; "BUG: …" are confirmed bugs (they fail now and
// pass once fixed); "UX: …" and "PERF: …" are behaviours that should exist. Every test puts Obsidian back on the desktop.
//
// QA6_SHOTS=<dir> saves screenshots of the steps there.
import { mkdirSync } from 'fs';
import { PL, LEAF, PHONE, SMALL, BIG, land, KEYBOARD, metrics, onDevice, keyboard, tap, hold, swipe, touch, pressAndMove, binder, openMs, settle, tapText, caret, seen, keys, saveAll, snap, rect, sc, M, VIEW, B, j, until, openView, compose, menuTap, titleMenu, dialogTap } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa6 phone: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa6 phone: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa6 phone: ' + name, fn });
const perf = (name, fn) => specs.push({ name: 'PERF: qa6 phone: ' + name, fn });

const SHOTS = process.env.QA6_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const say = (...a) => { if (process.env.QA6_VERBOSE) console.log('      ' + a.map((x) => (typeof x === 'string' ? x : j(x))).join(' ')); };
const on = (size, fn) => async (p, h, t) => { const before = snap(p); await onDevice(p, size, () => fn(p, h, t, before)); };

/** Notes long enough to scroll: `n` notes of `paras` paragraphs. */
const long = (n = 12, paras = 6) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`Scene ${String(i + 1).padStart(2, '0')}`, `---\nstatus: ${i % 2 ? 'draft' : 'idea'}\nsynopsis: Scene ${i + 1}\n---\n` + Array.from({ length: paras }, (_, k) => `Scene ${i + 1} paragraph ${k + 1}. The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window, as he had every night since the war.`).join('\n\n') + '\n']));
const N = (i) => `Novel/Scene ${String(i).padStart(2, '0')}.md`;

// =====================================================================================================================
// Writing with the keyboard up
// =====================================================================================================================

// On a phone on its side the keyboard leaves about 200 px. Obsidian's own header (45 px) and its editing toolbar (44 px)
// take 89 of them, and Binders' toolbar, which never goes away, takes 52 more.
for (const [size, kb] of [[[844, 390], 190], [[667, 375], 180], [[932, 430], 200]]) {
	ux(`on its side (${size.join(' × ')}) with the keyboard up, the page has room for at least three lines of text and the caret is in sight above the editing toolbar`, on(size, async (p, h, t) => {
		await binder(p, 'Novel', long(6, 3));
		await openMs(p, 'Novel');
		await tapText(p, N(1), 'paragraph 1', 3);
		await metrics(p, size[0], size[1] - kb);
		await p.sleep(700);
		await keys(p, '\n\nThe tide went out and the lamp burned on.');
		await p.sleep(300);
		const c = await caret(p);
		const room = await p.ev(`(() => { const r = document.querySelector('${LEAF} .binders-manuscript').getBoundingClientRect(), tb = document.querySelector('.mobile-toolbar')?.getBoundingClientRect(); const bottom = Math.min(innerHeight, tb && tb.height ? tb.top : innerHeight); return Math.round(bottom - r.top); })()`);
		await shot(p, `landscape-keyboard-${size.join('x')}`);
		const line = await p.ev(`parseFloat(getComputedStyle(document.querySelector('${LEAF} .binders-manuscript .cm-line')).lineHeight)`);
		t.ok(room >= 3 * line, `room above the editing toolbar for the text: ${room} px (a line is ${line} px)`);
		t.ok(seen(c), 'the caret is in sight: ' + j(c));
	}));
}

// =====================================================================================================================
// Speed: a binder of a thousand short scenes, at CPU four times slower
// =====================================================================================================================

perf('a flat binder of 1,000 short scenes, CPU four times slower: every mode opens in under 2 s, and swiping through the manuscript is as smooth as through the board (95 of 100 frames under 50 ms)', async (p, h, t) => {
	const N = 1000;
	await p.ev(`(async () => {
		const words = 'the keeper climbed the stair again while the sea kept on at the rocks below and nobody came '.repeat(8);
		await app.vault.createFolder('Saga');
		const names = [], jobs = [];
		for (let n = 1; n <= ${N}; n++) {
			const name = 'Scene ' + String(n).padStart(4, '0'); names.push(name);
			jobs.push(app.vault.create('Saga/' + name + '.md', '---\\nsynopsis: Scene ' + n + ', in which something happens on the island.\\nstatus: ' + ['draft', 'revised', 'done'][n % 3] + '\\n---\\n' + words + '\\n'));
			if (jobs.length >= 50) await Promise.all(jobs.splice(0));
		}
		await Promise.all(jobs);
		await app.vault.create('Saga/Saga.md', '---\\nbinder: 1\\ncontents:\\n' + names.map((c) => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	const ready = `${B}.scenes(app.vault.getAbstractFileByPath('Saga'))?.length === ${N} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`;
	t.ok(await until(p, ready, 90000), 'the big binder is made');
	const timed = (expr) => p.ev(`(async () => { const t = performance.now(); await (${expr}); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); })()`);
	const frames = (ms) => p.ev(`(() => { const fr = window.__qa6f = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); fr.push(n - last); last = n; if (n - t0 < ${ms}) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
	const stats = () => p.ev(`(() => { const f = window.__qa6f.slice(1).sort((a, b) => a - b); return { frames: f.length, median: Math.round(f[f.length >> 1]), p95: Math.round(f[Math.floor(f.length * 0.95)]), worst: Math.round(f[f.length - 1]) }; })()`);
	const swipes = async () => { for (let k = 0; k < 4; k++) { await touch(p, 'touchStart', 200, 650); for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', 200, 650 - i * 35); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(200); } await p.sleep(300); };
	const out = {};
	await onDevice(p, PHONE, async () => {
		t.ok(await until(p, ready, 90000), 'and found again on the phone');
		await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		out.corkboardOpens = await timed(`${PL}.openBinder(app.vault.getAbstractFileByPath('Saga'))`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length >= ${N}`, 60000);
		await p.sleep(1500);
		await frames(2600); await swipes(); out.corkboardScroll = await stats();
		out.outlinerOpens = await timed(`(async () => { ${VIEW}.setMode('outliner'); })()`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-outliner-row').length > 100`, 30000); await p.sleep(1000);
		await frames(2600); await swipes(); out.outlinerScroll = await stats();
		out.manuscriptOpens = await timed(`(async () => { ${VIEW}.setMode('manuscript'); })()`);
		await until(p, `!!document.querySelector('${LEAF} .binders-manuscript .binders-manuscript-rendered')`, 60000); await p.sleep(1500);
		await frames(2800); await swipes(); out.manuscriptScroll = await stats();
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	});
	console.log('    qa6 phone speed, 1,000 scenes (ms, CPU ×4): ' + j(out));
	for (const k of ['corkboardOpens', 'outlinerOpens', 'manuscriptOpens']) t.ok(out[k] < 2000, `${k}: ${out[k]} ms`);
	for (const k of ['corkboardScroll', 'outlinerScroll']) t.ok(out[k].median <= 20, `${k}: ${j(out[k])}`); // (the board's 95th percentile moves with the load of the machine)
	t.ok(out.manuscriptScroll.median <= 20 && out.manuscriptScroll.p95 <= 50, `manuscriptScroll: ${j(out.manuscriptScroll)}`);
});

// =====================================================================================================================
// The folder card on a phone (0.12.17)
// =====================================================================================================================

/** A folder in a binder: made by hand, as files. */
const mk = (p, path, text) => p.ev(`(async () => { const d = ${j(path)}.split('/').slice(0, -1).join('/'); if (d && !app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d); await app.vault.create(${j(path)}, ${j(text)}); return 1; })()`);
const CARD = (path) => `${LEAF} .binders-card[data-path="${path}"]`;

ux('a folder with no synopsis: tapping its card to select it offers a line to write one (a note’s card does; a phone has no hover and the menu’s “Edit synopsis” says nothing on the card)', on(PHONE, async (p, h, t) => {
	await mk(p, 'Book/Subs/A/x.md', 'x');
	await mk(p, 'Book/Subs/B/y.md', 'y');
	await mk(p, 'Book/Nosyn.md', 'words');
	await mk(p, 'Book/Book.md', '---\nbinder: 1\ncontents:\n  - Subs/\n  - Nosyn\n---\n');
	await p.sleep(1200);
	await openView(p, 'Book');
	await p.sleep(600);
	const height = (path) => p.ev(`(() => { const s = document.querySelector(${j(CARD(path) + ' .binders-card-synopsis')}); const r = s?.getBoundingClientRect(); return r ? Math.round(r.height) : -1; })()`);
	for (const path of ['Book/Nosyn.md', 'Book/Subs']) {
		const c = await p.at(CARD(path));
		await tap(p, c.x, c.t + c.h - 14, 600);
		t.ok((await height(path)) >= 20, `${path}: selected, its synopsis line is there to tap: ${await height(path)} px tall`);
	}
	await shot(p, 'folder-card-selected-no-synopsis');
}));

// =====================================================================================================================
// Typing for a long time, by touch: random typing against a model of the text
// =====================================================================================================================

function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const WORDS = ['sea', 'light', 'café', 'naïve', 'the', 'keeper', 'wrote', 'down', 'night', 'stair', 'Mara', 'ocean', 'storm', 'a', 'I', '—', '…', '"quoted"', '(paren)', 'tide.', 'and,'];

/** Random typing with a model of what the note should say: words, dictated sentences, Enter, Backspace, arrows, words
    composed then committed, the app going to the background; with `interruptions`, also the keyboard's window changing
    (turning the phone and back), the drawer opening, a trip to the board and back, a sync-style write to the note's
    properties and to another note, and a long swipe away (each of which loses the caret, which a tap then puts back at
    the end of the text). After `ops` of them the note on disk is the model, character for character. */
async function typeAtRandom(p, t, seed, ops, interruptions) {
	const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
	const text = 'Alpha beta gamma.\n\nSecond paragraph here.\n', path = 'Novel/One.md';
	await binder(p, 'Novel', { One: `---\nstatus: draft\n---\n${text}`, Two: '---\nstatus: draft\n---\nOther scene text.\n' });
	await openMs(p, 'Novel');
	await keyboard(p, PHONE, true);
	await tapText(p, path, 'Second', 0);
	let doc = text, cur = (await caret(p)).head;
	const log = [];
	const ins = (s) => { doc = doc.slice(0, cur) + s + doc.slice(cur); cur += s.length; };
	// Enter in a note: spaces after the caret go, and a line of nothing but spaces before it
	const enter = () => { let from = cur, to = cur; const ls = doc.lastIndexOf('\n', cur - 1) + 1; if (!/\S/.test(doc.slice(ls, cur))) from = ls; while (to < doc.length && /[ \t]/.test(doc[to])) to++; doc = doc.slice(0, from) + '\n' + doc.slice(to); cur = from + 1; };
	const hide = () => p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); return 1; })()`);
	const show = () => p.ev(`(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); return 1; })()`);
	for (let i = 0; i < ops; i++) {
		const r = R();
		let op;
		if (r < 0.35) { const s = pick(WORDS) + ' '; op = 'insert ' + s; await p.send('Input.insertText', { text: s }); ins(s); }
		else if (r < 0.45) { const s = Array.from({ length: 1 + Math.floor(R() * 6) }, () => pick(WORDS)).join(' ') + ' '; op = 'dictate ' + s; await p.send('Input.insertText', { text: s }); ins(s); }
		else if (r < 0.56) { op = 'enter'; await keys(p, '\n'); enter(); }
		else if (r < 0.66) { if (cur > 0) { op = 'backspace'; await p.key('Backspace'); doc = doc.slice(0, cur - 1) + doc.slice(cur); cur--; } else op = 'backspace at the start'; }
		else if (r < 0.72) { op = 'left'; await p.key('ArrowLeft'); if (cur > 0) cur--; }
		else if (r < 0.78) { op = 'right'; await p.key('ArrowRight'); if (cur < doc.length) cur++; }
		else if (r < 0.86) { const w = pick(WORDS).replace(/[^a-zé]/gi, '') || 'word'; op = 'compose ' + w; await compose(p, w, w + ' '); ins(w + ' '); }
		else if (r < 0.89) { op = 'background'; await hide(); await p.sleep(80); await show(); }
		else if (r < 0.93) { op = 'pause'; await p.sleep(Math.floor(R() * 1200)); }
		else if (r < 0.96) { op = 'small swipe'; await swipe(p, 200, 300, 200, 260, 6, 100); }
		else if (interruptions && r < 0.975) {
			const which = pick(['rotate', 'drawer', 'board', 'sync properties', 'sync other note', 'swipe away']);
			op = 'interruption: ' + which;
			if (which === 'rotate') { await metrics(p, 844, 200); await p.sleep(600); await metrics(p, 390, 844 - 336); await p.sleep(600); }
			else if (which === 'drawer') { await p.ev(`(() => { app.workspace.leftSplit.expand(); return 1; })()`); await p.sleep(500); await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`); await p.sleep(500); }
			else if (which === 'board') { await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`); await p.sleep(700); await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`); await settle(p); }
			else if (which === 'sync properties') { await p.ev(`(async () => { const t = await app.vault.adapter.read(${j(path)}); await app.vault.adapter.write(${j(path)}, t.replace(/status: .*/, 'status: sync' + Date.now() % 1000)); return 1; })()`); await p.sleep(1200); }
			else if (which === 'sync other note') { await p.ev(`(async () => { const t = await app.vault.adapter.read('Novel/Two.md'); await app.vault.adapter.write('Novel/Two.md', t + 'sync line\\n'); return 1; })()`); await p.sleep(1200); }
			else { await swipe(p, 200, 600, 200, 150, 10, 300); await swipe(p, 200, 150, 200, 600, 10, 600); }
			let k = await caret(p);
			if (!k) {
				// the keyboard goes with the caret: a tap at the end of the text brings both back
				await keyboard(p, PHONE, false);
				await p.ev(`(() => { ${sc(path)}.el.scrollIntoView({ block: 'center' }); return 1; })()`);
				await p.sleep(500); await settle(p);
				const at = await p.ev(`(() => { const s = ${sc(path)}; const ls = [...s.bodyEl.querySelectorAll('.cm-content > .cm-line, .binders-manuscript-rendered > *')].filter(x => x.textContent.trim()); const r = document.createRange(); r.selectNodeContents(ls.pop()); const b = [...r.getClientRects()].pop(); return { x: b.right + 2, y: (b.top + b.bottom) / 2 }; })()`);
				await tap(p, at.x, at.y, 900);
				await keyboard(p, PHONE, true);
				await p.sleep(300);
				k = await caret(p);
				t.ok(k, `after ${which}, a tap at the end of the text puts the caret back (op ${i})`);
			}
			cur = k.head; // (where the caret is isn't what's being checked: what's typed is)
		}
		else op = 'nothing';
		log.push(op);
		// every few steps: the editor and the model agree (so a difference is found where it began)
		if (i % 5 === 4) {
			const k = await p.ev(`(() => { const s = ${sc(path)}; const t = s.live?.cm.state.doc.toString() ?? null; if (t == null) return null; const st = /^---\\r?\\n(?:[\\s\\S]*?\\r?\\n)?---[ \\t]*(?:\\r?\\n|$)/.exec(t)?.[0].length ?? 0; return { body: t.slice(st), head: s.live.cm.state.selection.main.head - st }; })()`);
			if (k) {
				if (k.body !== doc) { let q = 0; while (q < doc.length && k.body[q] === doc[q]) q++; t.ok(false, `after ${log.slice(-5).join(', ')}: the note differs from what was typed at ${q}: expected ${j(doc.slice(Math.max(0, q - 20), q + 20))}, got ${j(k.body.slice(Math.max(0, q - 20), q + 20))}`); }
				cur = k.head;
			}
		}
	}
	await saveAll(p);
	const body = (await p.ev(`app.vault.adapter.read(${j(path)})`)).replace(/^---\n[\s\S]*?\n---\n/, '');
	t.eq(body, doc, `after ${ops} random keyboard actions, the note on disk is what was typed`);
	if (interruptions) t.ok((await p.ev(`app.vault.adapter.read('Novel/Two.md')`)).startsWith('---\nstatus: draft\n---\nOther scene text.\n'), 'the other note keeps its text');
}

test('typing at random (words, dictated sentences, Enter, Backspace, arrows, composed words, the app in the background): after 250 actions the note on disk is what was typed, character for character', on(PHONE, async (p, h, t) => { await typeAtRandom(p, t, 3, 250, false); }));
test('typing at random with interruptions (turning the phone, the drawer, the board and back, a sync-style write, a long swipe): after 220 actions the note on disk is what was typed', on(PHONE, async (p, h, t) => { await typeAtRandom(p, t, 14, 220, true); }));

// =====================================================================================================================
// Focus mode on a phone
// =====================================================================================================================

ux('focus mode, the first time on a phone: what it says is about the button (a phone has no Esc), and it doesn’t cover the button that leaves', on(PHONE, async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-focus-hinted', null); return 1; })()`);
	await openMs(p, 'The Lighthouse');
	const b = await p.at(`${LEAF} .binders-focus-button`);
	await tap(p, b.x, b.y, 1500);
	t.ok(await p.ev(`document.body.classList.contains('binders-focus')`), 'focus mode is on');
	const said = await p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent)`);
	await shot(p, 'focus-first-time');
	t.ok(!said.some((s) => /\bEsc/.test(s)), 'no notice on a phone tells the writer to press Esc: ' + j(said));
	const x = await p.ev(`(() => { const r = document.querySelector('.binders-focus-leave').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e?.closest('.binders-focus-leave') ? 'the button' : (e?.className ?? '') + ' ' + (e?.textContent ?? '').slice(0, 30); })()`);
	t.eq(x, 'the button', 'a tap on the way out reaches it (what is on top of it for the first five seconds)');
}));

// =====================================================================================================================
// The toolbar that goes while the view is short (0.12.34)
// =====================================================================================================================

bug('a small phone on its side (568 × 320) with no keyboard up has the toolbar (the mode, the way up out of a folder, New): it goes only while the keyboard is up', on([568, 320], async (p, h, t) => {
	await binder(p, 'Novel', long(4, 3));
	await openMs(p, 'Novel');
	const tb = await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'); const b = v.querySelector('.binders-toolbar'); return { short: v.classList.contains('is-short'), height: Math.round(b.getBoundingClientRect().height), viewHeight: v.clientHeight, focus: document.activeElement?.tagName }; })()`);
	await shot(p, 'small-landscape-no-keyboard');
	t.ok(tb.height > 0, `nothing is being typed in, yet the toolbar is hidden (the view is ${tb.viewHeight} px tall, under the 240 px that hides it): ${j(tb)}`);
}));

test('a small phone (320 × 568): with the keyboard up the toolbar goes and the caret stays in sight; the keyboard closing brings the toolbar back; turning the phone on its side and back while it is gone leaves it as the room says; a card’s synopsis typed on the board is in sight', on(SMALL, async (p, h, t) => {
	await binder(p, 'Novel', long(8, 4));
	await openMs(p, 'Novel');
	const state = () => p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'); return { short: v.classList.contains('is-short'), toolbar: Math.round(v.querySelector('.binders-toolbar').getBoundingClientRect().height), height: v.clientHeight }; })()`);
	t.eq((await state()).toolbar, 52, 'the toolbar shows before the keyboard');
	await tapText(p, N(1), 'paragraph 2', 3);
	await keyboard(p, SMALL, true);
	await keys(p, ' typed words here to follow');
	let s = await state();
	t.eq(s.toolbar, 0, 'with the keyboard up the toolbar is gone: ' + j(s));
	t.ok(seen(await caret(p)), 'the caret is in sight: ' + j(await caret(p)));
	await metrics(p, 568, 200); await p.sleep(800);
	t.ok(seen(await caret(p)), 'turned on its side the caret is in sight: ' + j(await caret(p)));
	await metrics(p, 320, 308); await p.sleep(800);
	t.ok(seen(await caret(p)), 'and back, the caret is in sight: ' + j(await caret(p)));
	await p.ev(`document.activeElement.blur()`);
	await keyboard(p, SMALL, false);
	await p.sleep(500);
	s = await state();
	t.eq(s.toolbar, 52, 'the keyboard gone, the toolbar is back: ' + j(s));
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(800);
	await p.ev(`document.querySelector('.binders-card[data-path$="Scene 01.md"]').scrollIntoView({ block: 'start' })`);
	await p.sleep(300);
	const c = await p.at('.binders-card[data-path$="Scene 01.md"]');
	await tap(p, c.x, c.t + c.h - 14, 500);
	const sy = await p.at('.binders-card[data-path$="Scene 01.md"] .binders-card-synopsis');
	await tap(p, sy.x, sy.y, 600);
	await keyboard(p, SMALL, true);
	const f = await p.ev(`(() => { const e = document.querySelector('.binders-edit-field'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), inner: innerHeight, focus: document.activeElement === e }; })()`);
	t.ok(f && f.focus && f.top >= 111 && f.bottom <= f.inner, 'a synopsis field on the board is in sight with the keyboard up: ' + j(f));
}));

// =====================================================================================================================
// Everything reachable by a thumb
// =====================================================================================================================

/** How far (px) a touch lands on an element, measured on the screen: across and down, counting slop that isn't the element's
    own box (a pseudo-element, a bigger holder), so a 32 px button with 6 px of slop each way counts as 44. */
const HIT = `(e) => { const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; const on = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && e.contains(h); }; let l = 0, rr = 0, u = 0, d = 0; while (l < 40 && on(r.left - l - 1, cy)) l++; while (rr < 40 && on(r.right + rr + 1, cy)) rr++; while (u < 40 && on(cx, r.top - u - 1)) u++; while (d < 40 && on(cx, r.bottom + d + 1)) d++; return [Math.round(r.width) + l + rr, Math.round(r.height) + u + d]; }`;

for (const size of [PHONE, SMALL]) {
	ux(`${size.join(' × ')}: the toolbar’s buttons (mode, word count, arrange, filter, New, focus) are a finger wide and tall (44 px, with slop counted) in every mode`, on(size, async (p, h, t) => {
		await openMs(p, 'The Lighthouse');
		const small = [];
		for (const mode of ['corkboard', 'outliner', 'manuscript']) {
			await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
			await p.sleep(mode === 'manuscript' ? 1500 : 700);
			const found = await p.ev(`(() => { const hit = ${HIT}; return [...document.querySelectorAll('${LEAF} .binders-toolbar > *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.matches('button, [role=button], .is-clickable') || e.querySelector('button')); }).map(e => ({ what: (e.getAttribute('aria-label') || e.className).toString().slice(0, 40), hit: hit(e) })); })()`);
			for (const f of found) if (f.hit[0] < 44 || f.hit[1] < 44) small.push(`${mode}: ${f.what} ${f.hit.join(' × ')}`);
		}
		t.eq(j(small), j([]), 'toolbar controls under 44 px (touch area, across × down)');
	}));
}

ux('a phone: a section’s title in the manuscript (a tap renames the note) and a folder’s heading (a tap goes in) are a finger tall', on(PHONE, async (p, h, t) => {
	await openMs(p, 'The Lighthouse');
	const found = await p.ev(`(() => { const hit = ${HIT}; return [...document.querySelectorAll('${LEAF} .binders-manuscript-title, ${LEAF} .binders-manuscript-heading > *')].map(e => ({ what: e.textContent, hit: hit(e) })); })()`);
	const small = found.filter((f) => f.hit[1] < 44).map((f) => `${f.what} ${f.hit.join(' × ')}`);
	t.eq(j(small), j([]), 'titles under 44 px tall to touch');
}));

// =====================================================================================================================
// A whole session by thumb
// =====================================================================================================================

const TOGGLE = { x: 34, y: 81 }; // the drawer's button, top left of a phone's screen

test('a session by thumb: a folder made in the drawer becomes a binder; scenes named on the board; one dragged up; a label, a status and a target by sheets; written in the manuscript with the keyboard up; split in two; focus mode in and out; snapshot; exported as one note; every word typed is in the vault once', on(PHONE, async (p, h, t) => {
	const read = (path) => p.ev(`app.vault.adapter.read(${j(path)}).catch(() => null)`);
	// the drawer: a folder named, then made a binder from its menu
	await tap(p, TOGGLE.x, TOGGLE.y, 700);
	const add = await p.at('.nav-action-button[aria-label="New folder"]');
	t.ok(add, 'the drawer has “New folder”');
	await tap(p, add.x, add.y, 800);
	await p.type('Story');
	await p.key('Enter');
	await p.sleep(900);
	await p.ev(`(() => { const e = document.querySelector('.nav-folder-title[data-path="Story"]'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10, button: 0 })); return 1; })()`);
	await p.sleep(500);
	t.ok(await menuTap(p, 'Make this folder a binder'), 'the folder’s sheet has “Make this folder a binder”');
	await p.sleep(1200);
	const row = await p.at('.nav-folder-title[data-path="Story"]');
	await tap(p, row.x, row.y, 1000);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'a tap on the binder in the drawer opens it');
	t.ok(await p.ev(`app.workspace.leftSplit.collapsed`), 'and the drawer goes');
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
	// five scenes, named in a row: the field for the next one opens after each
	for (const name of ['Opening', 'Storm', 'Keeper', 'Wreck', 'Ending']) {
		const plus = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, plus.x, plus.y, 500);
		t.ok(await menuTap(p, 'New note'), 'New › New note');
		await p.sleep(500);
		await p.type(name);
		await p.key('Enter');
		await p.sleep(500);
		await p.key('Escape');
		await p.sleep(300);
	}
	for (const name of ['Opening', 'Storm', 'Keeper', 'Wreck', 'Ending']) t.ok(await read(`Story/${name}.md`) != null, `“${name}” is a note`);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.replace(/^Story\\/|\\.md$/g, ''))`)), j(['Opening', 'Storm', 'Keeper', 'Wreck', 'Ending']), 'the board shows them in the order they were made');
	// drag Storm above Opening (the board is at its top first: the first card is under the toolbar otherwise)
	await p.ev(`(() => { document.querySelector('${LEAF} .binders-corkboard').scrollTop = 0; return 1; })()`);
	await p.sleep(400);
	const storm = await p.at(`${LEAF} .binders-card[data-path="Story/Storm.md"]`), open = await p.at(`${LEAF} .binders-card[data-path="Story/Opening.md"]`);
	await pressAndMove(p, storm.x, storm.t + storm.h - 14, open.x, open.t + 12, 12);
	await touch(p, 'touchEnd');
	await p.sleep(900);
	await p.ev(`${B}.flush().then(() => 1)`);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.replace(/^Story\\/|\\.md$/g, ''))`)), j(['Storm', 'Opening', 'Keeper', 'Wreck', 'Ending']), 'Storm is first after the drag');
	t.ok(/contents:\n\s+- "?Storm"?\n\s+- "?Opening"?/.test((await read('Story/Story.md')) ?? ''), 'and so it is in the binder note: ' + j((await read('Story/Story.md'))?.slice(0, 120)));
	// a label and a status from the sheets
	const card = await p.at(`${LEAF} .binders-card[data-path="Story/Opening.md"]`);
	await hold(p, card.x, card.t + card.h - 14);
	t.ok(await menuTap(p, 'Set label'), 'the card’s sheet has “Set label”');
	await p.sleep(400);
	t.ok(await menuTap(p, 'Red'), 'with the labels');
	await p.sleep(500);
	await hold(p, card.x, card.t + card.h - 14);
	t.ok(await menuTap(p, 'Set status'), 'and “Set status”');
	await p.sleep(400);
	const statuses = await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
	t.ok(await menuTap(p, statuses.find((s) => /draft/i.test(s)) ?? statuses[1]), 'with the statuses: ' + j(statuses));
	await p.sleep(500);
	await p.ev(`${B}.flush().then(() => 1)`);
	const opening = (await read('Story/Opening.md')) ?? '';
	t.ok(/label: Red/i.test(opening) && /status: .*draft/i.test(opening), 'the note has them: ' + j(opening));
	// a target, by the word count
	const wc = await p.at(`${LEAF} .binders-word-count`);
	await tap(p, wc.x, wc.y, 700);
	await keyboard(p, PHONE, true);
	await p.type('2000');
	await dialogTapByText(p, 'Set target');
	await keyboard(p, PHONE, false);
	await p.sleep(600);
	await p.ev(`${B}.flush().then(() => 1)`);
	t.ok(/target: 2000/.test((await read('Story/Story.md')) ?? ''), 'the binder note has the target');
	// the manuscript, by the mode menu
	const mode = await p.at(`${LEAF} .binders-mode-button`);
	await tap(p, mode.x, mode.y, 500);
	t.ok(await menuTap(p, 'Manuscript'), 'the mode menu has the manuscript');
	await settle(p);
	await tapEndOf(p, 'Story/Storm.md');
	await keyboard(p, PHONE, true);
	const typed = [];
	for (let i = 1; i <= 6; i++) { const para = `Paragraph ${i} of the storm: the sea rose and the light held, and nobody on the island slept at all that night.`; typed.push(para); await keys(p, `${i === 1 ? '' : '\n\n'}${para}`); }
	t.ok(seen(await caret(p)), 'after six paragraphs the caret is in sight: ' + j(await caret(p)));
	// split in the middle of the third paragraph (the command, as from the palette)
	await saveAll(p);
	const at = await p.ev(`(() => { const s = ${sc('Story/Storm.md')}; const doc = s.live.cm.state.doc.toString(); const i = doc.indexOf('Paragraph 4'); s.live.cm.dispatch({ selection: { anchor: i } }); s.live.cm.focus(); return i; })()`);
	await p.sleep(300);
	await p.ev(`app.commands.executeCommandById('binders:split-scene')`);
	await p.sleep(1500);
	await p.ev(`${B}.flush().then(() => 1)`);
	await keyboard(p, PHONE, false);
	await saveAll(p);
	const names = await p.ev(`app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Story/')).map(f => f.basename)`);
	t.ok(names.length === 7, 'the split made one more note: ' + j(names));
	// focus mode in and out
	const fb = await p.at(`${LEAF} .binders-focus-button`);
	if (fb) {
		await tap(p, fb.x, fb.y, 1500);
		t.ok(await p.ev(`document.body.classList.contains('binders-focus')`), 'focus mode is on');
		const leave = await p.at('.binders-focus-leave');
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		await tap(p, leave.x, leave.y, 1500);
		t.ok(!(await p.ev(`document.body.classList.contains('binders-focus')`)), 'and off by its button');
	}
	// a snapshot of the first scene, from its title's menu
	await titleMenu(p, 'Story/Storm.md');
	t.ok(await menuTap(p, 'Snapshots'), 'the title’s menu has Snapshots');
	await p.sleep(400);
	t.ok(await menuTap(p, 'Take a snapshot'), 'with “Take a snapshot”');
	await p.sleep(1200);
	t.ok((await p.ev(`app.vault.getFiles().filter(f => /snapshot/i.test(f.path)).length`)) >= 1, 'a snapshot is a file in the vault');
	// export as one note (Copy would need the clipboard: the note is saved). On a phone, Export is at the foot of the window's choices
	await p.ev(`(app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export'))`);
	await p.sleep(900);
	await dialogTapByText(p, 'Export');
	await p.sleep(1500);
	const exported = await p.ev(`(async () => { const f = app.vault.getMarkdownFiles().find(f => f.path.startsWith('Story') && f.basename.toLowerCase().includes('exported')); return f ? await app.vault.read(f) : null; })()`);
	// every word typed is in the vault, once: in the scene and its split-off half, and in the exported note
	const all = await p.ev(`(async () => { let s = ''; for (const f of app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Story/') && !/snapshot|exported/i.test(f.path))) s += (await app.vault.read(f)).replace(/^---[\\s\\S]*?---\\n/, '') + '\\n'; return s; })()`);
	for (const para of typed) t.eq(all.split(para).length - 1, 1, `“${para.slice(0, 16)}…” is in the notes once`);
	if (exported) for (const para of typed) t.eq(exported.split(para).length - 1, 1, `“${para.slice(0, 16)}…” is in the exported note once`);
	else t.ok(false, 'an exported note was saved: ' + j(await p.ev(`app.vault.getMarkdownFiles().map(f => f.path)`)));
}));

/** Taps the button with this text in the dialog on top. */
const dialogTapByText = (p, text) => dialogTap(p, text);
/** Taps just past the end of a section's text. */
async function tapEndOf(p, path) {
	const at = await p.ev(`(() => { const s = ${sc(path)}; const ls = [...s.bodyEl.querySelectorAll('.cm-content > .cm-line, .binders-manuscript-rendered > *')].filter(x => x.textContent.trim()); if (!ls.length) { const r = s.bodyEl.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 10 }; } const r = document.createRange(); r.selectNodeContents(ls.pop()); const b = [...r.getClientRects()].pop(); return { x: b.right + 2, y: (b.top + b.bottom) / 2 }; })()`);
	await tap(p, at.x, at.y, 900);
}

// =====================================================================================================================
// Interruptions mid-drag, and large text
// =====================================================================================================================

test('a card carried on the board: the system taking the touch away (touchcancel), the phone turned, or the app sent to the background leave nothing on the board and the order on disk as it was', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', long(20, 1));
	await openView(p, 'Novel');
	await p.sleep(600);
	const board = () => p.ev(`({ order: [...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.replace(/.*Scene |\\.md/g, '')).join(), left: document.querySelectorAll('.binders-drag-ghost').length, dragging: !!document.querySelector('${LEAF} .binders-board.is-dragging') })`);
	const order = (await board()).order;
	const hold1 = async (path, steps = 10) => { const c = await p.at(`${LEAF} .binders-card[data-path$="${path}"]`); await touch(p, 'touchStart', c.x, c.t + c.h - 14); await p.sleep(700); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', c.x, c.t + c.h - 14 + i * 20); await p.sleep(20); } };
	// the touch taken away
	await hold1('Scene 02.md');
	t.ok((await board()).dragging, 'a card is being carried');
	await touch(p, 'touchCancel');
	await p.sleep(600);
	let b = await board();
	t.ok(!b.dragging && b.left === 0 && b.order === order, 'touch cancelled: nothing carried, nothing moved: ' + j(b));
	// the phone turned while carried, then let go
	await hold1('Scene 02.md');
	await metrics(p, 844, 390);
	await p.sleep(700);
	await touch(p, 'touchEnd');
	await p.sleep(900);
	await metrics(p, 390, 844);
	await p.sleep(700);
	b = await board();
	t.ok(!b.dragging && b.left === 0, 'turned while carried: nothing is left being carried: ' + j(b));
	await p.ev(`${B}.flush().then(() => 1)`);
	const disk = await p.ev(`app.vault.adapter.read('Novel/Novel.md')`);
	t.ok(!/\n {2}- "?Scene 02"?\n {2}- "?Scene 01"?/.test(disk), 'and the binder note has no half-made order: ' + j(disk.slice(0, 80)));
	// the app in the background while carried
	await hold1('Scene 03.md', 6);
	await p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); return 1; })()`);
	await p.sleep(500);
	await p.ev(`(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); return 1; })()`);
	await touch(p, 'touchEnd');
	await p.sleep(900);
	b = await board();
	t.ok(!b.dragging && b.left === 0, 'sent to the background while carried: nothing is left being carried: ' + j(b));
}));

for (const [size, font] of [[SMALL, 30], [PHONE, 30], [BIG, 30], [[640, 360], 30]]) {
	test(`text at its largest (${font} px) at ${size.join(' × ')}: every mode’s toolbar fits, nothing overlaps, the page doesn’t go sideways`, on(size, async (p, h, t) => {
		await p.ev(`(() => { app.vault.setConfig('baseFontSize', ${font}); app.updateFontSize?.(); return 1; })()`);
		await p.sleep(400);
		await openMs(p, 'The Lighthouse');
		for (const mode of ['corkboard', 'outliner', 'manuscript']) {
			await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
			await p.sleep(mode === 'manuscript' ? 1500 : 700);
			const r = await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'), tb = v.querySelector('.binders-toolbar'); const kids = [...tb.children].filter(e => e.getBoundingClientRect().width > 0); const out = kids.filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className.split(' ').pop()); const overlap = []; for (let i = 1; i < kids.length; i++) if (kids[i].getBoundingClientRect().left < kids[i - 1].getBoundingClientRect().right - 0.5) overlap.push(kids[i - 1].className.split(' ').pop()); return { page: v.scrollWidth - v.clientWidth, out, overlap }; })()`);
			t.ok(r.page <= 0 && !r.out.length && !r.overlap.length, `${mode}: ${j(r)}`);
		}
	}));
}

ux('a phone on its side (568 × 320) with text at its largest (30 px): the toolbar fits the screen (the New button is cut off: 29 px sideways)', on([568, 320], async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('baseFontSize', 30); app.updateFontSize?.(); return 1; })()`);
	await p.sleep(400);
	await openMs(p, 'The Lighthouse');
	for (const mode of ['corkboard', 'manuscript']) {
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await p.sleep(mode === 'manuscript' ? 1500 : 700);
		const r = await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'); const out = [...v.querySelector('.binders-toolbar').children].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className.split(' ').pop()); return { page: v.scrollWidth - v.clientWidth, out }; })()`);
		t.ok(r.page <= 0 && !r.out.length, `${mode}: ${j(r)}`);
	}
}));
