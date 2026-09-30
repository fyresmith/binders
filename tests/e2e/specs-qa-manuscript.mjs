// QA: the manuscript and golden rule 2 (never lose writing). Scenarios that try to lose, duplicate, misplace or corrupt
// text. Tests named “BUG: …” fail on purpose until the bug is fixed.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { B as BIND, VIEW, openView, reload } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa-manuscript: ' + name, fn });

const B = 'The Lighthouse';
const ORDER = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((n) => `${B}/${n}.md`);
const ALL = [...ORDER, `${B}/${B}.md`];
const J = JSON.stringify;
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
const snapshot = (p) => Object.fromEntries(ALL.map((f) => [f, disk(p, f)]));
const M = `${VIEW}.current`;
const idx = (path) => `${M}.scenes.findIndex(s => s.file.path === ${J(path)})`;
const text = (p, path) => p.ev(`${M}.scenes[${idx(path)}].live.editor.getValue()`);
const activeIn = (p, path) => p.ev(`${M}.scenes[${idx(path)}].el.contains(document.activeElement)`);
const flushAll = (p) => p.ev(`Promise.all(${M}.scenes.filter(s => s.live).map(s => s.live.flush())).then(() => 1)`);
const clearNotices = (p) => p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const count = (s, sub) => s.split(sub).length - 1;
async function until(p, fn, ms = 5000) { for (let i = 0; i < ms / 100; i++) { if (await fn()) return true; await p.sleep(100); } return fn(); }

async function settle(p, ms = 4000) {
	for (let i = 0; i < ms / 50; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; const near = m.scenes.filter(s => m.near.has(s.el)); return (near.length > 0 || m.scenes.length === 0) && near.slice(0, m.liveMax).every(s => m.editable ? (s.live || s.broken) && !s.mounting : s.shown !== null); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(100);
}
/** Opens the real binder view on a folder, in manuscript mode. */
async function openMs(p, folder = B, newLeaf = false) {
	await openView(p, folder, newLeaf);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
async function focusEnd(p, path) {
	await p.ev(`(async () => { const m = ${M}, s = m.scenes[${idx(path)}]; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(100);
}
/** Types fast: one insertText per character, no pause. */
async function typeFast(p, s) { for (const ch of s) await p.send('Input.insertText', { text: ch }); }

/** How long a person takes to move from one pane to another. */
const PAUSE = 1200; // at 500 ms, Obsidian's own split tabs of one note duplicate text too (not a Binders issue)
const TAIL = (path, before, typed) => before.replace(/\n$/, '') + typed + '\n';

// ---- fast typing, then the section goes away at once ----

for (const [how, js] of [
	['switching to the corkboard', `${VIEW}.setMode('corkboard')`],
	['closing the tab', `app.workspace.getLeavesOfType('binders-view')[0].detach()`],
	['navigating to another folder', `${VIEW}.navigate(app.vault.getAbstractFileByPath('${B}/Part Two'))`],
]) test(`fast typing then ${how} at once: every keystroke saved, once`, async (p, h, t) => {
	await openMs(p);
	const f = ORDER[2], before = disk(p, f), typed = ' ' + 'quick brown fox jumps '.repeat(8).trim();
	await focusEnd(p, f);
	await typeFast(p, typed);
	await p.ev(`(() => { ${js}; return 1; })()`);
	await p.sleep(400);
	t.eq(disk(p, f), TAIL(f, before, typed), 'all typing on disk at once');
	await p.sleep(2600);
	t.eq(disk(p, f), TAIL(f, before, typed), 'no late second write');
});

// ---- two sections, alternately ----

test('typing alternately in two sections, fast: each file gets only its own typing', async (p, h, t) => {
	const before = snapshot(p);
	await openMs(p);
	const [a, b] = [ORDER[0], ORDER[4]];
	let ta = '', tb = '';
	for (let i = 0; i < 8; i++) {
		await focusEnd(p, a); await typeFast(p, ` a${i}`); ta += ` a${i}`;
		await focusEnd(p, b); await typeFast(p, ` b${i}`); tb += ` b${i}`;
	}
	await p.sleep(2600);
	t.eq(disk(p, a), TAIL(a, before[a], ta), 'first section');
	t.eq(disk(p, b), TAIL(b, before[b], tb), 'second section');
	for (const k of ALL) if (k !== a && k !== b) t.eq(disk(p, k), before[k], `${k} untouched`);
});

// ---- typing across save boundaries ----

test('typing in bursts across many saves: no duplicated or lost text', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[1], before = disk(p, f);
	await focusEnd(p, f);
	let typed = '';
	for (let i = 0; i < 4; i++) {
		const w = ` burst${i}` + ' word'.repeat(5);
		await typeFast(p, w); typed += w;
		await p.sleep(1950 + i * 40); // around the moment the debounced save fires
	}
	await p.sleep(2600);
	t.eq(disk(p, f), TAIL(f, before, typed), 'every burst once');
	t.eq(await text(p, f), disk(p, f), 'editor agrees');
});

// ---- outside edits ----

test('an outside edit storm (sync-like adapter writes) while typing: every line and keystroke kept, once', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[3], before = disk(p, f);
	await focusEnd(p, f);
	let typed = '';
	for (let i = 0; i < 8; i++) {
		// sync writes a new line at the end of the file, as another device would
		await p.ev(`(async () => { const s = await app.vault.adapter.read(${J(f)}); await app.vault.adapter.write(${J(f)}, s + 'Synced ${i}.\\n'); return 1; })()`);
		const w = ` t${i}`;
		await typeFast(p, w); typed += w;
		await p.sleep(350);
	}
	await p.sleep(3500);
	const d = disk(p, f);
	for (let i = 0; i < 8; i++) t.eq(count(d, `Synced ${i}.`), 1, `synced line ${i} once in ${J(d)}`);
	t.eq(count(d, typed), 1, 'the typing, in one piece, once: ' + J(d));
	t.ok(d.startsWith(before.split('\n').slice(0, 5).join('\n')), 'frontmatter intact');
	t.eq(await text(p, f), d, 'editor agrees with disk');
	await clearNotices(p);
});

test('the same note typed in a tab and in the manuscript, alternately and fast: both kept, once', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[1];
	await p.ev(`(async () => { const l = window.__tab = app.workspace.getLeaf('split'); await l.openFile(app.vault.getAbstractFileByPath(${J(f)})); return 1; })()`);
	await p.sleep(400);
	for (let i = 0; i < 6; i++) {
		await focusEnd(p, f); await typeFast(p, ` m${i}`); await p.sleep(PAUSE);
		await p.ev(`(() => { const ed = __tab.view.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
		await typeFast(p, ` t${i}`); await p.sleep(PAUSE);
		if (i === 3) await p.sleep(2100);
	}
	await p.sleep(3000);
	const d = disk(p, f);
	t.ok(d.includes(' m0 t0 m1 t1 m2 t2 m3 t3 m4 t4 m5 t5\n'), 'both, in order: ' + J(d.slice(-80)));
	t.eq(count(d, ' m0'), 1, 'once');
	t.eq(await text(p, f), d, 'section agrees');
	t.eq(await p.ev(`__tab.view.editor.getValue()`), d, 'tab agrees');
});

test('two manuscripts of the same binder, typing in each: both kept, once', async (p, h, t) => {
	await openMs(p);
	await openMs(p, B, 'split');
	const leaves = `app.workspace.getLeavesOfType('binders-view')`;
	t.eq(await p.ev(`${leaves}.length`), 2, 'two views');
	const f = ORDER[0], before = disk(p, f);
	const typeIn = async (i, s) => {
		await p.ev(`(async () => { const m = ${leaves}[${i}].view.current, s = m.scenes[0]; await m.mount(s); const ed = s.live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
		await typeFast(p, s);
	};
	for (let i = 0; i < 4; i++) { await typeIn(0, ` x${i}`); await p.sleep(PAUSE); await typeIn(1, ` y${i}`); await p.sleep(PAUSE); }
	await p.sleep(3000);
	t.eq(disk(p, f), TAIL(f, before, ' x0 y0 x1 y1 x2 y2 x3 y3'), 'both kept in order');
	const texts = await p.ev(`${leaves}.map(l => l.view.current.scenes[0].live?.editor.getValue())`);
	t.eq(texts[0], disk(p, f), 'first view agrees'); t.eq(texts[1], disk(p, f), 'second view agrees');
});


// ---- unusual notes ----

/** Makes a binder “Odd” with these notes (name → text), in this order, and opens its manuscript. */
async function oddBinder(p, notes) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Odd');
		for (const [n, s] of ${J(Object.entries(notes))}) await app.vault.adapter.write('Odd/' + n + '.md', s);
		await new Promise(r => setTimeout(r, 600));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Odd'));
		return 1; })()`);
	await p.sleep(800);
	await openMs(p, 'Odd');
}
const dropOdd = (p) => p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); await new Promise(r => setTimeout(r, 300)); const f = app.vault.getAbstractFileByPath('Odd'); if (f) await app.vault.delete(f, true); return 1; })()`);
const oddWith = (notes, fn) => async (p, h, t) => { try { await oddBinder(p, notes); await fn(p, h, t); } finally { await dropOdd(p); } };
const closeView = (p) => p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`).then(() => p.sleep(400));

test('ArrowDown into a note that is only frontmatter (no newline after it), then typing: frontmatter kept', oddWith({
	'1 Before': 'Some text.\n',
	'2 Only props': '---\nstatus: draft\nsynopsis: Only properties.\n---',
}, async (p, h, t) => {
	await focusEnd(p, 'Odd/1 Before.md');
	await p.key('ArrowDown'); await p.key('ArrowDown');
	t.ok(await activeIn(p, 'Odd/2 Only props.md'), 'in the second section');
	await typeFast(p, 'New body');
	await closeView(p);
	const d = disk(p, 'Odd/2 Only props.md');
	t.ok(/^---\nstatus: draft\nsynopsis: Only properties\.\n---\n+New body\n?$/.test(d), 'frontmatter still frontmatter, typing below it: ' + J(d));
	t.eq(await p.ev(`app.metadataCache.getCache('Odd/2 Only props.md')?.frontmatter?.status`), 'draft', 'properties still read as properties');
}));

test('a note that is only frontmatter with a newline, an empty note, and a note without frontmatter: typing lands in the body', oddWith({
	'1 Props nl': '---\nstatus: draft\n---\n',
	'2 Empty': '',
	'3 Plain': 'Just text, no properties.',
}, async (p, h, t) => {
	for (const [f, prefix] of [['Odd/1 Props nl.md', '---\nstatus: draft\n---\n'], ['Odd/2 Empty.md', ''], ['Odd/3 Plain.md', '']]) {
		await p.ev(`(async () => { const m = ${M}; await m.focusScene(m.scenes[${idx(f)}], 'start'); return 1; })()`);
		await p.sleep(100);
		t.ok(await activeIn(p, f), f + ' focused');
		await typeFast(p, 'Hi ');
		await p.sleep(100);
		const cur = await text(p, f);
		t.ok(cur.startsWith(prefix + 'Hi '), `${f}: typed after the properties: ${J(cur)}`);
	}
	await closeView(p);
	t.eq(disk(p, 'Odd/1 Props nl.md'), '---\nstatus: draft\n---\nHi ', 'props note');
	t.eq(disk(p, 'Odd/2 Empty.md'), 'Hi ', 'empty note');
	t.eq(disk(p, 'Odd/3 Plain.md'), 'Hi Just text, no properties.', 'plain note');
}));

test('CRLF line endings: typing changes only what was typed (compared with a normal tab)', oddWith({
	'1 Crlf': '---\r\nstatus: draft\r\n---\r\nLine one\r\nLine two\r\n',
	'2 Crlf tab': '---\r\nstatus: draft\r\n---\r\nLine one\r\nLine two\r\n',
}, async (p, h, t) => {
	await focusEnd(p, 'Odd/1 Crlf.md');
	await typeFast(p, ' typed');
	await closeView(p);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Odd/2 Crlf tab.md')); const ed = l.view.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await typeFast(p, ' typed');
	await p.ev(`app.workspace.getActiveViewOfType(app.workspace.getMostRecentLeaf().view.constructor).save().then(() => 1)`).catch(() => {});
	await p.sleep(2600);
	const ms = disk(p, 'Odd/1 Crlf.md'), tab = disk(p, 'Odd/2 Crlf tab.md');
	console.log('    CRLF manuscript: ' + J(ms) + '  tab: ' + J(tab));
	t.eq(ms, tab, 'the manuscript writes the same bytes a normal tab does');
	t.ok(ms.includes('Line two typed'), 'typing saved');
}));

test('a note starting with a byte-order mark: properties stay hidden and intact', oddWith({
	'1 Bom': '﻿---\nstatus: draft\n---\nBody text.\n',
}, async (p, h, t) => {
	const f = 'Odd/1 Bom.md';
	const shown = await p.ev(`${M}.scenes[0].el.innerText`);
	await focusEnd(p, f);
	await typeFast(p, ' more');
	await closeView(p);
	const d = disk(p, f);
	t.ok(d.replace(/^﻿/, '') === '---\nstatus: draft\n---\nBody text. more\n', 'bytes: ' + J(d));
	t.ok(!/status: draft/.test(shown) && !/^---/m.test(shown), 'frontmatter not shown as text: ' + J(shown.slice(0, 80)));
}));

test('embeds, tables, code blocks and callouts: typing after them changes nothing else', oddWith({
	'1 Rich': '---\nstatus: draft\n---\nIntro ![[Target]] and [[Target|link]].\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n> [!note] Title\n> Inside the callout.\n\n%% a comment %%\n\nLast line.\n',
	'2 Target': 'Embedded text.\n',
}, async (p, h, t) => {
	const f = 'Odd/1 Rich.md', before = disk(p, f);
	await focusEnd(p, f);
	await typeFast(p, ' typed');
	await p.key('Enter'); await typeFast(p, 'Next');
	await closeView(p);
	t.eq(disk(p, f), before.replace('Last line.\n', 'Last line. typed\nNext\n'), 'only the typing changed');
	t.eq(disk(p, 'Odd/2 Target.md'), 'Embedded text.\n', 'the embedded note untouched');
}));

test('BUG (minor): a 1 MB note then a 60 KB paragraph: text exact, but CodeMirror warns “Measure loop restarted” (a normal tab doesn’t)', oddWith({
	'1 Huge': '---\nstatus: draft\n---\n' + ('The tide came in over the stones and went out again. '.repeat(20) + '\n\n').repeat(950),
	'2 Paragraph': 'Word '.repeat(12000).trim() + '\n',
}, async (p, h, t) => {
	for (const f of ['Odd/1 Huge.md', 'Odd/2 Paragraph.md']) {
		const before = disk(p, f);
		await focusEnd(p, f);
		await p.sleep(300);
		if (p.errors.length) console.log('    after focusEnd ' + f + ': ' + J(p.errors));
		await typeFast(p, ' END');
		await p.sleep(300);
		if (p.errors.length) console.log('    after typing ' + f + ': ' + J(p.errors));
		await p.ev(`${M}.scenes[${idx(f)}].live.flush().then(() => 1)`);
		const d = disk(p, f);
		t.eq(d.length, before.length + 4, f + ' length');
		const ls = before.split('\n'); let n = ls.length - 1; while (n > 0 && !ls[n]) n--; ls[n] += ' END';
		if (d !== ls.join('\n')) throw new h.Fail(f + ' differs at ' + [...d].findIndex((c, i) => c !== ls.join('\n')[i]));
	}
}));

test('pasting 200 KB of text into a section, then closing at once', oddWith({ '1 Paste': 'Start.\n' }, async (p, h, t) => {
	const f = 'Odd/1 Paste.md', big = ('Pasted paragraph with some words in it. '.repeat(40) + '\n\n').repeat(120);
	await focusEnd(p, f);
	await p.send('Input.insertText', { text: big });
	await p.sleep(50);
	await closeView(p);
	t.eq(disk(p, f), 'Start.' + big + '\n', 'the whole paste saved');
}));
test('control: 1 MB note in a normal tab', async (p, h, t) => {
	await p.ev(`app.vault.create('Huge control.md', ${J('---\nstatus: draft\n---\n' + ('The tide came in over the stones and went out again. '.repeat(20) + '\n\n').repeat(950))}).then(() => 1)`);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Huge control.md')); const ed = l.view.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); ed.scrollIntoView({from: ed.getCursor(), to: ed.getCursor()}); return 1; })()`);
	await p.sleep(300);
	await typeFast(p, ' END');
	await p.sleep(500);
	console.log('    errors: ' + J(p.errors));
});

// ---- the file being typed in moves ----

test('the note being typed in moves out of the binder, then back, fast: typing kept, once', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[1], before = disk(p, f);
	await focusEnd(p, f); await typeFast(p, ' one');
	await p.ev(`(async () => { const x = app.vault.getAbstractFileByPath(${J(f)}); await app.fileManager.renameFile(x, 'Arrival.md'); await app.fileManager.renameFile(x, ${J(f)}); return 1; })()`);
	await p.sleep(600);
	await focusEnd(p, f); await typeFast(p, ' two');
	await p.sleep(2600);
	t.eq(disk(p, f), TAIL(f, before, ' one two'), 'both bursts, once');
	t.eq(await text(p, f), disk(p, f), 'editor agrees');
});

test('the note being typed in moves into another binder: pending typing saved to it', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Other'); await app.vault.create('Other/Seed.md', 'seed\\n'); await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Other')); return 1; })()`);
	await p.sleep(500);
	try {
		await openMs(p);
		const f = ORDER[3], before = disk(p, f);
		await focusEnd(p, f); await typeFast(p, ' moving away');
		await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${J(f)}), 'Other/Storm warning.md').then(() => 1)`);
		await p.sleep(600);
		t.eq(await p.ev(`${M}.scenes.some(s => s.file.path.startsWith('Other/'))`), false, 'the section left this manuscript');
		t.eq(disk(p, 'Other/Storm warning.md'), TAIL(f, before, ' moving away'), 'typing saved in the moved note');
		await p.sleep(2500);
		t.eq(disk(p, 'Other/Storm warning.md'), TAIL(f, before, ' moving away'), 'no late write');
	} finally { await p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); await new Promise(r => setTimeout(r, 300)); await app.vault.delete(app.vault.getAbstractFileByPath('Other'), true); return 1; })()`); }
});

test('the note being typed in is renamed from the manuscript title while it has unsaved typing', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[0], before = disk(p, f);
	await focusEnd(p, f); await typeFast(p, ' before rename');
	await p.ev(`(async () => { const m = ${M}; m.rename(m.scenes[0]); return 1; })()`);
	await p.key('a', 'ctrl'); await typeFast(p, 'Opening'); await p.key('Enter');
	await p.sleep(600);
	await focusEnd(p, `${B}/Opening.md`); await typeFast(p, ' after');
	await p.sleep(2600);
	t.eq(disk(p, `${B}/Opening.md`), TAIL(f, before, ' before rename after'), 'all typing in the renamed note');
});

// ---- the binder note changes under the manuscript ----

test('the binder note rewritten outside (order changed) while typing: typing kept, section keeps focus', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[2], before = disk(p, f), note = `${B}/${B}.md`;
	await focusEnd(p, f); await typeFast(p, ' a');
	for (let i = 0; i < 4; i++) {
		const s = disk(p, note);
		const swapped = i % 2 ? s.replace('  - Part One/Storm warning\n  - Part One/The keeper\n', '  - Part One/The keeper\n  - Part One/Storm warning\n') : s.replace('  - Part One/The keeper\n  - Part One/Storm warning\n', '  - Part One/Storm warning\n  - Part One/The keeper\n');
		await p.ev(`app.vault.adapter.write(${J(note)}, ${J(swapped)}).then(() => 1)`);
		await p.sleep(250);
		await typeFast(p, ` b${i}`);
	}
	await p.sleep(800);
	t.ok(await activeIn(p, f), 'focus kept');
	await typeFast(p, ' c');
	await p.sleep(2600);
	t.eq(disk(p, f), TAIL(f, before, ' a b0 b1 b2 b3 c'), 'every keystroke');
});

test('the binder becomes a newer format while typing: typing saved, then read only and nothing written', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[2], before = disk(p, f), note = `${B}/${B}.md`;
	await focusEnd(p, f); await typeFast(p, ' last words');
	const bumped = disk(p, note).replace('binder: 1', 'binder: 99');
	await p.ev(`app.vault.adapter.write(${J(note)}, ${J(bumped)}).then(() => 1)`);
	await until(p, () => p.ev(`!!${M}?.root?.classList.contains('is-readonly')`), 4000);
	t.ok(await p.ev(`${M}.root.classList.contains('is-readonly')`), 'read only now');
	t.eq(disk(p, f), TAIL(f, before, ' last words'), 'the typing was saved first');
	const snap = snapshot(p);
	// typing on the page itself (a heading has the click; clicking a body opens its note in a tab, by design)
	await p.ev(`(() => { ${M}.list.querySelector('.binders-manuscript-heading').click(); return 1; })()`);
	await typeFast(p, 'zzz'); await p.key('Enter'); await p.key('Backspace');
	await p.sleep(2600);
	for (const k of ALL) if (k !== note) t.eq(disk(p, k), snap[k], `${k} unchanged while read only`);
	t.eq(disk(p, note), bumped, 'the newer binder note is not rewritten');
	t.eq(await p.ev(`${M}.root.querySelectorAll('[contenteditable=true]').length`), 0, 'nothing editable');
});

test('a read-only (newer format) binder in the real view: clicking and typing write nothing', async (p, h, t) => {
	const note = `${B}/${B}.md`;
	await p.ev(`(async () => { const s = await app.vault.adapter.read(${J(note)}); await app.vault.adapter.write(${J(note)}, s.replace('binder: 1', 'binder: 99')); return 1; })()`);
	await p.sleep(800);
	const snap = snapshot(p);
	await openMs(p);
	console.log('    ' + J(await p.ev(`(() => { const m = ${M}; return { mode: ${VIEW}.mode, n: m?.scenes?.length, ro: ${VIEW}.readOnly, html: ${VIEW}.contentEl.innerText.slice(0, 200) }; })()`)));
	t.eq(await p.ev(`${M}.editable`), false, 'not editable');
	for (let i = 0; i < 2; i++) {
		const at = await p.ev(`(() => { const r = ${M}.list.querySelectorAll('.binders-manuscript-heading')[${i}].getBoundingClientRect(); return { x: r.x + 30, y: r.y + r.height / 2 }; })()`);
		await p.click(at.x, at.y);
		await typeFast(p, 'x'); await p.key('Enter');
	}
	await p.sleep(2600);
	for (const k of ALL) t.eq(disk(p, k), snap[k], `${k} unchanged`);
});

test('fallback (no editable embeds) in the real view: typing anywhere writes nothing', async (p, h, t) => {
	const snap = snapshot(p);
	await p.ev(`(() => { window.__md = app.embedRegistry.embedByExtension.md; app.embedRegistry.embedByExtension.md = undefined; return 1; })()`);
	try {
		await openMs(p);
		t.eq(await p.ev(`${M}.editable`), false, 'read only');
		const at = await p.ev(`(() => { const r = ${M}.root.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 200 }; })()`);
		await p.click(at.x, at.y);
		await typeFast(p, 'typed');
		await p.key('Enter');
		await p.sleep(2600);
		for (const k of ALL) t.eq(disk(p, k), snap[k], `${k} unchanged`);
	} finally { await p.ev(`(() => { app.embedRegistry.embedByExtension.md = window.__md; return 1; })()`); }
});

// ---- undo ----

test('undo after a remount, when the note changed outside while unmounted: no corruption', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[4];
	await focusEnd(p, f); await typeFast(p, ' mine');
	await p.ev(`(async () => { const m = ${M}, s = m.scenes[${idx(f)}]; document.activeElement.blur(); m.unmount(s); await s.saved; return 1; })()`);
	// another app rewrites the start of the note while it isn't mounted
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${J(f)}), s => s.replace(/\\n---\\n/, '\\n---\\nA new first line from outside.\\n')).then(() => 1)`);
	await p.sleep(300);
	await p.ev(`(async () => { const m = ${M}; await m.mount(m.scenes[${idx(f)}]); return 1; })()`);
	const afterOutside = disk(p, f);
	t.eq(await text(p, f), afterOutside, 'mounted with the outside change');
	await focusEnd(p, f);
	await p.key('z', 'ctrl'); await p.sleep(150);
	const u = await text(p, f);
	await flushAll(p);
	console.log('    after undo: ' + J(u));
	t.ok(u.includes('A new first line from outside.'), 'undo never removes the outside text');
	t.ok(!u.includes(' mine') || u === afterOutside, 'undo removes “ mine” (or does nothing)');
	t.ok(/^---\n[\s\S]*?\n---\n/.test(u), 'frontmatter intact');
	t.eq(disk(p, f), u, 'disk agrees');
});

test('undo history beyond 20 files: remounting the 21st-oldest section and pressing undo corrupts nothing', async (p, h, t) => {
	const N = 26;
	await p.ev(`(async () => { await app.vault.createFolder('Many'); for (let i = 0; i < ${N}; i++) await app.vault.create('Many/S' + String(i).padStart(2, '0') + '.md', 'Scene ' + i + ' text.\\n'); await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Many')); return 1; })()`);
	await p.sleep(800);
	try {
		await openMs(p, 'Many');
		for (let i = 0; i < N; i++) {
			const f = `Many/S${String(i).padStart(2, '0')}.md`;
			await focusEnd(p, f); await typeFast(p, ` t${i}`);
			await p.ev(`(async () => { const m = ${M}, s = m.scenes[${idx(f)}]; document.activeElement.blur(); m.unmount(s); await s.saved; return 1; })()`);
		}
		const f0 = 'Many/S00.md';
		await p.ev(`(async () => { const m = ${M}; await m.mount(m.scenes[0]); return 1; })()`);
		await focusEnd(p, f0);
		await p.key('z', 'ctrl'); await p.sleep(150);
		await flushAll(p);
		const d = disk(p, f0);
		t.ok(d === 'Scene 0 text. t0\n' || d === 'Scene 0 text.\n', 'undo does nothing or removes the typing: ' + J(d));
		const f25 = 'Many/S25.md';
		await p.ev(`(async () => { const m = ${M}; await m.mount(m.scenes[25]); return 1; })()`);
		await focusEnd(p, f25); await p.key('z', 'ctrl'); await p.sleep(150); await flushAll(p);
		t.eq(disk(p, f25), 'Scene 25 text.\n', 'a recent section still undoes');
	} finally { await p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); await new Promise(r => setTimeout(r, 300)); await app.vault.delete(app.vault.getAbstractFileByPath('Many'), true); return 1; })()`); }
});

// ---- selection ----

test('Ctrl+A in a section then typing, and a mouse drag across a section boundary then typing: only one note changes', async (p, h, t) => {
	const before = snapshot(p);
	await openMs(p);
	const [a, b] = [ORDER[0], ORDER[1]];
	const ra = await p.ev(`(() => { const r = ${M}.scenes[0].bodyEl.getBoundingClientRect(); return { x: r.x + 60, y: r.y + 10 }; })()`);
	const rb = await p.ev(`(() => { const r = ${M}.scenes[1].bodyEl.getBoundingClientRect(); return { x: r.x + 80, y: r.y + 10 }; })()`);
	await p.drag(ra.x, ra.y, rb.x, rb.y);
	await typeFast(p, 'DRAG');
	await p.key('Backspace'); await p.key('Delete');
	await p.sleep(2600);
	const after = snapshot(p);
	const changed = ALL.filter((k) => after[k] !== before[k]);
	t.ok(changed.length <= 1, 'at most one note changed: ' + J(changed));
	for (const k of changed) t.ok(after[k].startsWith(before[k].match(/^---\n[\s\S]*?\n---\n/)[0]), `${k} frontmatter intact`);
	await focusEnd(p, b);
	await p.key('a', 'ctrl'); await p.key('a', 'ctrl'); await typeFast(p, 'ALL');
	await p.sleep(2600);
	const fmB = before[b].match(/^---\n[\s\S]*?\n---\n/)[0];
	t.eq(disk(p, b), fmB + 'ALL', 'Ctrl+A twice replaces only the body of this note');
	for (const k of ALL) if (k !== b && !changed.includes(k)) t.eq(disk(p, k), before[k], `${k} untouched`);
});

// ---- plugin lifecycle ----

test('disabling the plugin mid-typing in the real view saves the typing; enabling again shows it', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[5], before = disk(p, f);
	await focusEnd(p, f); await typeFast(p, ' mid-typing');
	try {
		await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
		await p.sleep(300);
		t.eq(disk(p, f), TAIL(f, before, ' mid-typing'), 'saved on disable');
	} finally {
		await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
		await p.sleep(800);
	}
	await p.sleep(2500);
	t.eq(disk(p, f), TAIL(f, before, ' mid-typing'), 'no late second write');
});

// ---- a big binder: scroll away with a pending save, come straight back ----

test('300 scenes: type, blur, scroll far away and straight back, type again: nothing lost or doubled', async (p, h, t) => {
	const N = 300;
	const para = 'The sea came up the rocks and the light turned over it. '.repeat(8);
	const body = `---\nstatus: draft\n---\n${para}\n\n${para}\n`;
	await p.ev(`(async () => { await app.vault.createFolder('Big'); for (let i = 0; i < ${N}; i++) await app.vault.create('Big/Scene ' + String(i).padStart(3, '0') + '.md', ${J(body)}); await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Big')); return 1; })()`);
	await p.sleep(1500);
	try {
		await openMs(p, 'Big');
		const f = 'Big/Scene 010.md';
		let typed = '';
		for (let round = 0; round < 4; round++) {
			await focusEnd(p, f); await typeFast(p, ` r${round}`); typed += ` r${round}`;
			await p.ev(`(async () => { document.activeElement.blur(); const m = ${M}; m.scenes[${200 + round * 20}].el.scrollIntoView(); for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r)); return 1; })()`);
			await p.sleep(round % 2 ? 2300 : 300); // sometimes the save lands while away (and it unmounts), sometimes not
			await p.ev(`(async () => { const m = ${M}; m.scenes[5].el.scrollIntoView(); for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r)); return 1; })()`);
			await settle(p);
		}
		await p.sleep(2600);
		t.eq(disk(p, f), body.replace(/\n$/, '') + typed + '\n', 'every round, once');
	} finally { await p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); await new Promise(r => setTimeout(r, 300)); await app.vault.delete(app.vault.getAbstractFileByPath('Big'), true); return 1; })()`); }
});

// ---- more ways in ----

test('IME composition, committed, then switching modes at once: the composed text is saved', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[0], before = disk(p, f);
	await focusEnd(p, f);
	await typeFast(p, ' ');
	for (const part of ['k', 'か', 'かn', 'かな']) await p.send('Input.imeSetComposition', { text: part, selectionStart: part.length, selectionEnd: part.length });
	await p.send('Input.insertText', { text: '仮名' });
	await typeFast(p, ' ok');
	await p.ev(`(() => { ${VIEW}.setMode('plotgrid'); return 1; })()`);
	await p.sleep(400);
	t.eq(disk(p, f), TAIL(f, before, ' 仮名 ok'), 'composed text saved');
});

test('fixed: the same binder in two tabs of one pane: type in one, switch tabs, type in the other: first typing lost, second doubled', async (p, h, t) => {
	await openMs(p);
	await openMs(p, B, 'tab');
	const leaves = `app.workspace.getLeavesOfType('binders-view')`;
	const f = ORDER[0], before = disk(p, f);
	const typeIn = async (i, s) => {
		await p.ev(`(async () => { const l = ${leaves}[${i}]; app.workspace.setActiveLeaf(l, { focus: true }); await new Promise(r => setTimeout(r, 300)); const m = l.view.current, sc = m.scenes[0]; await m.mount(sc); const ed = sc.live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
		await p.sleep(200);
		await typeFast(p, s);
	};
	await typeIn(1, ' one'); await p.sleep(300);
	await typeIn(0, ' two'); await p.sleep(300);
	await typeIn(1, ' three');
	await p.sleep(2800);
	t.eq(disk(p, f), TAIL(f, before, ' one two three'), 'every tab’s typing, once, in order');
});

test('a sync tool replaces the file atomically (temp file renamed over it) while typing: both kept', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[1], abs = join(p.vaultDir, f);
	await focusEnd(p, f); await typeFast(p, ' typing');
	const { renameSync } = await import('fs');
	writeFileSync(abs + '.tmp', disk(p, f).replace(/\n---\n/, '\n---\nFrom sync.\n'));
	renameSync(abs + '.tmp', abs);
	await p.sleep(1500);
	await typeFast(p, ' more');
	await p.sleep(3000);
	const d = disk(p, f);
	t.ok(d.includes('From sync.') && d.includes(' typing more'), 'both: ' + J(d));
	t.eq(count(d, ' typing'), 1, 'typing once');
	t.eq(await text(p, f), d, 'editor agrees');
	await clearNotices(p);
});

// Mobile emulation reloads the app window. Keep last; it restores desktop mode at the end.
test('mobile: fast typing then switching modes, and typing far down with virtualization', async (p, h, t) => {
	await reload(p, true);
	await p.ev(`(() => { window.activeWindow = window; window.activeDocument = document; const l = []; app.workspace.iterateRootLeaves(x => { l.push(x); }); l.forEach(x => x.detach()); return 1; })()`);
	try {
		t.eq(await p.ev(`app.isMobile`), true, 'mobile');
		await openMs(p);
		const f = ORDER[4], before = disk(p, f);
		await focusEnd(p, f); await typeFast(p, ' on the phone');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await p.sleep(400);
		t.eq(disk(p, f), TAIL(f, before, ' on the phone'), 'saved on mode switch');
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
		await settle(p);
		const g = ORDER[6], beforeG = disk(p, g);
		await focusEnd(p, g); await typeFast(p, ' end');
		await p.ev(`(() => { document.activeElement.blur(); const m = ${M}; m.root.scrollTop = 0; return 1; })()`);
		await p.sleep(3000);
		t.eq(disk(p, g), TAIL(g, beforeG, ' end'), 'typing far down saved after scrolling away');
	} finally { await reload(p, false); await p.ev(`(() => { window.activeWindow = window; window.activeDocument = document; return 1; })()`); }
});

test('control: two normal tabs of one note in one pane: type in one, switch tabs, type in the other', async (p, h, t) => {
	const f = ORDER[0], before = disk(p, f);
	await p.ev(`(async () => { window.__t1 = app.workspace.getLeaf('tab'); await __t1.openFile(app.vault.getAbstractFileByPath(${J(f)})); window.__t2 = app.workspace.getLeaf('tab'); await __t2.openFile(app.vault.getAbstractFileByPath(${J(f)})); return 1; })()`);
	await p.sleep(400);
	const typeIn = async (v, s) => {
		await p.ev(`(async () => { app.workspace.setActiveLeaf(${v}, { focus: true }); await new Promise(r => setTimeout(r, 300)); const ed = ${v}.view.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
		await p.sleep(200);
		await typeFast(p, s);
	};
	await typeIn('__t2', ' one'); await p.sleep(300);
	await typeIn('__t1', ' two'); await p.sleep(300);
	await typeIn('__t2', ' three');
	await p.sleep(2800);
	console.log('    control: ' + J(disk(p, f).slice(-40)));
	t.eq(disk(p, f), TAIL(f, before, ' one two three'), 'every tab’s typing, once, in order');
});

test('unsaved typing in a tab, then the note is opened in the manuscript (split) and typed in there within the save delay', async (p, h, t) => {
	const f = ORDER[0], before = disk(p, f);
	await p.ev(`(async () => { window.__t1 = app.workspace.getLeaf('tab'); await __t1.openFile(app.vault.getAbstractFileByPath(${J(f)})); const ed = __t1.view.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(200);
	await typeFast(p, ' in tab');
	await openMs(p, B, 'split');
	await focusEnd(p, f);
	await typeFast(p, ' second');
	await p.sleep(3000);
	t.eq(disk(p, f), TAIL(f, before, ' in tab second'), 'both');
	t.eq(await p.ev(`__t1.view.editor.getValue()`), disk(p, f), 'the tab agrees');
});

test('fixed: a section mounted while another manuscript has unsaved typing in the same note loads the old text; typing there loses the first typing', async (p, h, t) => {
	await openMs(p);
	const f = ORDER[0], before = disk(p, f);
	await focusEnd(p, f); await typeFast(p, ' first');
	// within the 2 s save delay, the same binder opens in a split (or a hidden tab comes back) and mounts the note
	await openMs(p, B, 'split');
	const mounted = await text(p, f);
	await focusEnd(p, f); await typeFast(p, ' second');
	await p.sleep(3000);
	t.eq(disk(p, f).slice(-40), TAIL(f, before, ' first second').slice(-40), `both, once (the new section mounted with ${J(mounted.slice(-20))})`);
});
/** Runs Obsidian's quit handlers (what quitting the app runs before the window closes) and waits for their tasks. */
const quit = (p) => p.ev(`(async () => { const ps = []; const tasks = { add: (fn) => ps.push(Promise.resolve().then(fn)), addPromise: (x) => ps.push(x) }; app.workspace.trigger('quit', tasks); await Promise.all(ps); return ps.length; })()`);

for (const where of ['tab', 'manuscript']) test(`${where === 'tab' ? 'control' : 'fixed'}: typing in a ${where}, then Obsidian quits within the save delay: quit handlers save it`, async (p, h, t) => {
	const g = ORDER[5], before = disk(p, g);
	if (where === 'tab') {
		await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath(${J(g)})); const ed = l.view.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
		await p.sleep(200);
	} else { await openMs(p); await focusEnd(p, g); }
	await typeFast(p, ' last words');
	t.eq(disk(p, g), before, 'not saved yet');
	await quit(p);
	await p.sleep(100);
	t.eq(disk(p, g), TAIL(g, before, ' last words'), 'saved by the quit handlers');
	await p.sleep(2500);
});

