// QA round 6, golden rule 2: never lose writing. Typed text must not go missing, be doubled, land in the wrong note or
// be written back over newer text, and a note's bytes must not change unless the writer typed. Every test compares the
// files on disk byte for byte. Tests named "qa6 writing: …" pass; "BUG: …" are confirmed bugs (they fail until fixed).
import {
	ARRIVAL, EPILOGUE, KEEPER, L, body, LEAF, NOTE, PHONE, PROLOGUE, STORM, bug, count, dialogTap, disk, j, menuTap, onDevice, openMs as openMs0, openView, rect, saveAll,
	sc, settle, snap, sameBut, tap, tapText, test, textAt, titleMenu, until, VIEW, reload,
} from './specs-qa5-manuscript.mjs';

export const specs = [];
const add = (kind, name, fn) => specs.push({ name: `${kind}qa6 writing: ${name}`, fn });
const ok = (name, fn) => add('', name, fn);
const bad = (name, fn) => add('BUG: ', name, fn);
const on = (size, fn) => async (p, h, t) => { const before = snap(p); await onDevice(p, size, () => fn(p, h, t, before)); };
const openMs = async (p, ...a) => { await patchFix(p); return openMs0(p, ...a); };
const throttle = (p, rate) => p.send('Emulation.setCPUThrottlingRate', { rate });
/** Has this section its editor, with the caret in it? */
const caretIn = (path) => `(() => { const s = ${sc(path)}; return !!s?.live?.cm && s.live.cm.hasFocus && document.activeElement === s.live.cm.contentDOM; })()`;
/** A tap just past the end of a section's last line of text. On a phone a section is plain text until it's tapped: the
    tap is on whichever is there, and the caret is waited for (its editor is made by the tap). */
const tapEndOf = async (p, path, wait = 700) => {
	const at = await p.ev(`(() => { const s = ${sc(path)}; const ls = [...s.bodyEl.querySelectorAll('.cm-content > .cm-line, .binders-manuscript-rendered > *')].filter(x => x.textContent.trim()); const r = document.createRange(); r.selectNodeContents(ls.pop()); const b = [...r.getClientRects()].pop(); return { x: b.right + 2, y: (b.top + b.bottom) / 2 }; })()`);
	await tap(p, at.x, at.y, wait);
	if (!(await until(p, caretIn(path), 5000))) throw new Error(`a tap at the end of ${path} put no caret there`);
};
const editorText = (p, path) => p.ev(`${sc(path)}.live?.text ?? null`);

// ---- 1. typing, then at once Delete from the title's menu, under load and with no pauses ----
for (const rate of [1, 8]) for (const how of ['insert', 'keys']) for (const gap of [0]) {
	ok(`phone: typing (${how}), ${gap} ms, then Delete from the title menu, CPU ${rate}x: the trashed note has every key`, on(PHONE, async (p, h, t, before) => {
		const was = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
		await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
		try {
			await openMs(p);
			await tapEndOf(p, KEEPER);
			await throttle(p, rate);
			const text = ' last words';
			if (how === 'insert') await p.type(text); else for (const ch of text) await p.key(ch);
			const typed = await editorText(p, KEEPER);
			t.ok(typed && typed.trimEnd().endsWith('last words'), 'the editor has the keys: ' + JSON.stringify(typed?.slice(-30)));
			await p.sleep(gap);
			await titleMenu(p, KEEPER);
			t.ok(await menuTap(p, 'Delete'), 'Delete');
			await until(p, `!!document.querySelector('.modal .modal-button-container')`);
			await dialogTap(p, 'Delete');
			await until(p, `app.vault.getAbstractFileByPath(${j(KEEPER)}) === null`, 8000);
			await throttle(p, 1);
			await p.sleep(2600);
			const after = snap(p);
			t.ok(!(KEEPER in after), 'not written back');
			const trashed = Object.keys(after).length; void trashed;
			t.eq(disk(p, '.trash/The keeper.md'), before[KEEPER].replace('doorway.', 'doorway. last words'), 'the trashed note has every key');
		} finally {
			await throttle(p, 1);
			await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(was ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`);
		}
	}));
}

// ---- 4. odd files: shown, then typed in, against what Obsidian's own tab does with the same bytes ----
const ODD = {
	'crlf': '---\r\nstatus: draft\r\n---\r\nOne.\r\n\r\nTwo.\r\n',
	'crlf body only': 'One.\r\n\r\nTwo.\r\n',
	'lone cr': 'One.\rTwo.\r',
	'bom': '﻿---\nstatus: draft\n---\nBody text.\n',
	'bom plain': '﻿Body text, no properties.\n',
	'no newline': 'No newline at the end',
	'only props': '---\nstatus: draft\n---',
	'only props nl': '---\nstatus: draft\n---\n',
	'empty props then rule': '---\n---\nFirst.\n\n---\n\nSecond.\n',
	'empty props no rule': '---\n---\nOnly.\n',
	'tabs in props': '---\nstatus: draft\ntags:\n\t- a\n---\nBody.\n',
	'mixed endings': '---\r\nstatus: draft\r\n---\nBody.\r\nMore.\n',
	'whitespace': '   \n\n\t\n',
	'unicode': '---\nstatus: draft\n---\nمرحبا بالعالم\n😀 𝒜 é ‏x\n',
	'rule first': '---\nNot properties?\n\nBody under a rule.\n',
	'props with rule below': '---\nstatus: draft\n---\nUp.\n\n---\n\nDown.\n',
	'empty': '',
	'trailing spaces': 'Line with trailing spaces   \nNext  \n',
	'line separators': 'One\u2028Two\u2029Three\u0085Four\n',
	'control chars': 'a\fb\vc\u0007d\n',
	'nul': 'a\u0000b\n',
	'tabs in body': '\tindented\twith\ttabs\n\t\t- nested\n',
	'long line': 'word '.repeat(40000) + '\n',
	'many blank lines': 'Top.\n' + '\n'.repeat(500) + 'Bottom.\n',
	'hr and yaml look-alikes': 'Text.\n---\nlooks: like yaml\n---\nMore.\n',
};
const oddNames = Object.keys(ODD);
const safe = (n) => n.replace(/[^\w]+/g, '_');
const setupOdd = (p, notes, twin = true) => p.ev(`(async () => {
	const add = async (dir, notes) => { await app.vault.createFolder(dir); for (const [n, s] of notes) await app.vault.adapter.write(dir + '/' + n + '.md', s); };
	await add('Odd', ${j(notes)});
	${twin ? `await add('Twin', ${j(notes)});` : ''}
	await new Promise(r => setTimeout(r, 600));
	await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Odd'));
	return 1; })()`);
const cleanOdd = (p) => p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); await new Promise(r => setTimeout(r, 300)); for (const d of ['Odd', 'Twin']) { const f = app.vault.getAbstractFileByPath(d); if (f) await app.vault.delete(f, true); } return 1; })()`);
const raw = (p, path) => p.ev(`app.vault.adapter.read(${j(path)})`);
const shownOdd = (p) => p.ev(`app.vault.adapter.readBinary ? 1 : 1`);

ok('odd files (CRLF, lone CR, BOM, no final newline, only properties, an empty properties block then a rule, tabs, whitespace, RTL, non-BMP): shown in the manuscript and left alone, they are byte for byte what they were', async (p, h, t) => {
	const notes = Object.entries(ODD).filter(([n]) => n !== 'only props').map(([n, s]) => [safe(n), s]);
	try {
		await setupOdd(p, notes, false);
		const before = {};
		for (const [n] of notes) before[n] = await raw(p, `Odd/${n}.md`);
		await openMs(p, 'Odd');
		// every section gets a caret in turn, with nothing typed: moving through them must not write anything
		for (const [n] of notes) {
			await p.ev(`(async () => { const m = ${VIEW}.current; const s = m.scenes.find(s => s.file.basename === ${j(n)}); if (!s) return 0; s.el.scrollIntoView({ block: 'center' }); await m.focusScene(s, 'start'); return 1; })()`);
			await p.sleep(80);
		}
		await p.sleep(3000);
		const bad = [];
		for (const [n] of notes) { const now = await raw(p, `Odd/${n}.md`); if (now !== before[n]) bad.push(`${n}: ${j(before[n])} became ${j(now)}`); }
		await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`);
		await p.sleep(2600);
		for (const [n] of notes) { const now = await raw(p, `Odd/${n}.md`); if (now !== before[n] && !bad.some((b) => b.startsWith(n + ':'))) bad.push(`${n} (after closing): ${j(before[n])} became ${j(now)}`); }
		t.eq(bad.join('\n      '), '', 'notes rewritten without a key typed');
	} finally { await cleanOdd(p); }
});

ok('odd files: typing at the end of each in the manuscript writes the same bytes as typing there in Obsidian’s own tab', async (p, h, t) => {
	const notes = Object.entries(ODD).filter(([n]) => n !== 'empty').map(([n, s]) => [safe(n), s]);
	try {
		await setupOdd(p, notes);
		await openMs(p, 'Odd');
		const endOf = `const E = ED; E.focus(); let n = E.lastLine(); E.setCursor({ line: n, ch: E.getLine(n).length });`;
		for (const [n] of notes) {
			await p.ev(`(async () => { const m = ${VIEW}.current; const s = m.scenes.find(s => s.file.basename === ${j(n)}); s.el.scrollIntoView({ block: 'center' }); await m.mount(s); ${endOf.replace('ED', 's.live.editor')} return 1; })()`);
			await p.sleep(80);
			for (const ch of 'ZZ') await p.send('Input.insertText', { text: ch });
			await p.ev(`(async () => { const m = ${VIEW}.current; await Promise.all(m.scenes.filter(s => s.live).map(s => s.live.flush())); return 1; })()`);
		}
		await p.sleep(500);
		const bad = [];
		for (const [n] of notes) {
			await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath(${j(`Twin/${n}.md`)})); const ed = l.view.editor; ${endOf.replace('ED', 'ed')} return 1; })()`);
			await p.sleep(80);
			for (const ch of 'ZZ') await p.send('Input.insertText', { text: ch });
			await p.ev(`app.workspace.getMostRecentLeaf().view.save().then(() => 1)`);
			const a = await raw(p, `Odd/${n}.md`), b = await raw(p, `Twin/${n}.md`);
			if (a !== b) bad.push(`${n}: manuscript ${j(a)} vs tab ${j(b)}`);
		}
		t.eq(bad.join('\n      '), '', 'the manuscript and a tab differ on');
	} finally { await cleanOdd(p); }
});

const PROPS = '---\nstatus: draft\n---';
// Obsidian's own editor puts a line break after properties that end the file: a tab does it as soon as the note opens,
// so the manuscript, whose sections are editors, does the same to a note it only shows. Not Binders' doing; noted so a
// change in either is seen.
ok('odd files: a note that is only properties with no line break gets one when shown, as it does when opened in a tab', async (p, h, t) => {
	try {
		await setupOdd(p, [['1 Before', 'Some text.\n'], ['2 Props', PROPS], ['3 After', 'More text.\n']], false);
		await openMs(p, 'Odd');
		await p.sleep(3500);
		t.eq(await raw(p, 'Odd/2 Props.md'), PROPS + '\n', 'on disk');
		t.eq(await raw(p, 'Odd/1 Before.md'), 'Some text.\n', 'its neighbours are left alone');
	} finally { await cleanOdd(p); }
});
ok('odd files: a note that is only properties with no line break, opened in Obsidian’s own tab in a folder that is no binder, is rewritten by Obsidian itself (not by Binders)', async (p, h, t) => {
	try {
		await setupOdd(p, [['2 Props', PROPS]], true);
		await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Twin/2 Props.md')); l.view.editor.focus(); return 1; })()`);
		await p.sleep(3500);
		t.eq(await raw(p, 'Twin/2 Props.md'), PROPS + '\n', 'Obsidian adds the line break');
	} finally { await cleanOdd(p); }
});

/** Picks the "Merge n notes" item of the files menu for these notes (as the explorer shows it) and answers the dialog. */
const mergeNotes = async (p, paths) => {
	await until(p, `!!app.plugins.plugins.binders.binders.binderOf(app.vault.getAbstractFileByPath(${j(paths[0])}))`, 5000);
	await p.ev(`(() => { const items = [], menu = { addItem(cb) { const it = { setSection() { return it; }, setTitle(t) { it.t = t; return it; }, setIcon() { return it; }, onClick(f) { it.f = f; return it; }, setDisabled() { return it; } }; cb(it); items.push(it); return menu; }, addSeparator() { return menu; } }; app.plugins.plugins.binders.filesMenu(menu, ${j(paths)}.map(x => app.vault.getAbstractFileByPath(x))); const it = items.find(i => /^Merge/.test(i.t)); if (!it) return 0; it.f(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal .mod-cta')`, 4000);
	await p.sleep(150);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await p.sleep(1500);
};
// A note that opens with a rule and has another further down: Obsidian's editor and its metadata cache show it as text
// (no properties), but `getFrontMatterInfo`, which Binders cuts notes with, calls everything between the two rules
// properties. A scene break at the top of a note is enough.
const RULED = '---\n\nLost paragraph.\n\n---\n\nKept.\n';
bad('a note that opens with a rule and has another below it: merged into another note, its first paragraph is not dropped', async (p, h, t) => {
	try {
		await setupOdd(p, [['1 A', 'Alpha.\n'], ['2 Rule', RULED]], false);
		const cache = await p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Odd/2 Rule.md'))?.frontmatterPosition ?? null)`);
		t.eq(cache, 'null', 'Obsidian itself finds no properties in it');
		await mergeNotes(p, ['Odd/1 A.md', 'Odd/2 Rule.md']);
		const merged = await raw(p, 'Odd/1 A.md');
		t.ok(merged.includes('Lost paragraph.'), 'the merged note has every paragraph: ' + j(merged));
	} finally { await cleanOdd(p); }
});
bad('a note that opens with a rule and has another below it: exported as one note, its first paragraph is not left out', async (p, h, t) => {
	try {
		await setupOdd(p, [['1 A', 'Alpha.\n'], ['2 Rule', RULED]], false);
		await openMs(p, 'Odd');
		await p.ev(`(app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export'))`);
		await until(p, `!!document.querySelector('.modal.binders-export .binders-export-path')`, 4000);
		await p.sleep(200);
		await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-export button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
		// (the window reads the notes for its preview, then again to export: the note is there when both are done)
		await until(p, `app.vault.adapter.exists('Odd (exported).md')`, 10000);
		await p.sleep(500);
		const out = await raw(p, 'Odd (exported).md').catch(() => '');
		t.ok(out.includes('Alpha.') && out.includes('Kept.'), 'it was exported: ' + j(out));
		t.ok(out.includes('Lost paragraph.'), 'every paragraph is in it: ' + j(out));
	} finally { await cleanOdd(p); await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Odd (exported).md'); if (f) await app.vault.delete(f); return 1; })()`); }
});
bad('a note that opens with a rule and has another below it: in the manuscript the caret can go to its first paragraph, and “Split scene at cursor” there splits it', async (p, h, t) => {
	try {
		await setupOdd(p, [['1 A', 'Alpha.\n'], ['2 Rule', RULED]], false);
		await openMs(p, 'Odd');
		await p.ev(`(async () => { const m = ${VIEW}.current, s = m.scenes[1]; s.el.scrollIntoView({ block: 'center' }); await m.focusScene(s, 'start'); return 1; })()`);
		await p.sleep(200);
		const at = await p.ev(`${VIEW}.current.scenes[1].live.cm.state.selection.main.head`);
		t.ok(at <= RULED.indexOf('Lost'), 'the start of the section is before its first paragraph (offset ' + at + ')');
	} finally { await cleanOdd(p); }
});

// ---- a write that fails (a locked file, a full disk, a sync client holding it) ----
import { chmodSync, readFileSync } from 'fs';
import { join } from 'path';
const lock = (p, path, on) => chmodSync(join(p.vaultDir, path), on ? 0o444 : 0o644);
const notes = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')].map(n => n.textContent)).filter(Boolean); })()`);
const focusEndOf = (p, path) => p.ev(`(async () => { const m = ${VIEW}.current, s = m.scenes.find(s => s.file.path === ${j(path)}); s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const E = s.live.editor; E.focus(); let n = E.lastLine(); while (n > 0 && !E.getLine(n)) n--; E.setCursor({ line: n, ch: E.getLine(n).length }); return 1; })()`);
const typeKeys = async (p, text) => { for (const ch of text) await p.send('Input.insertText', { text: ch }); };


// ---- 3. every way an editor can go, with the last keys not yet written ----
const BASE = (before, text) => before[KEEPER].replace('doorway.', 'doorway.' + text);
const mode = (p, m) => p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`);
/** Writes what the editor of the keeper has, as it is now, without waiting for the save delay. */
const KEEP = KEEPER;
const compose = async (p, word) => { for (let i = 1; i <= word.length; i++) { await p.send('Input.imeSetComposition', { text: word.slice(0, i), selectionStart: i, selectionEnd: i }); await p.sleep(15); } };

const TEARDOWNS = {
	'another mode': (p) => mode(p, 'corkboard'),
	'the view closed': (p) => p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`),
	'the plugin turned off': (p) => p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`),
	'the quit event': (p) => p.ev(`(async () => { const tasks = []; app.workspace.trigger('quit', { addPromise: (x) => tasks.push(x), add: (x) => tasks.push(Promise.resolve().then(x)) }); await Promise.all(tasks); return 1; })()`),
	'a folder opened by its heading (navigated away)': (p) => p.ev(`(() => { const v = ${VIEW}; v.navigate?.(app.vault.getAbstractFileByPath(${j(L + 'Part Two')})); return 1; })()`),
};
for (const [name, tear] of Object.entries(TEARDOWNS)) {
	// IME: on a phone the word being typed is always an open composition
	ok(`a word still being composed (not committed), then ${name} at once: the committed text is saved; what's composed is saved too`, async (p, h, t) => {
		const before = snap(p);
		try {
			await openMs(p);
			await focusEndOf(p, KEEPER);
			await typeKeys(p, ' one');
			await compose(p, ' two');
			const had = await p.ev(`${sc(KEEPER)}.live.text`);
			await tear(p);
			await p.sleep(1500);
			if (name === 'the plugin turned off') await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
			const d = disk(p, KEEPER);
			t.ok(d.includes('doorway. one'), 'the committed text is on disk: ' + j(d.slice(-40)));
			t.eq(d, had.replace(/\r\n/g, '\n'), 'disk is what the editor had (' + j(had.slice(-30)) + ')');
			t.eq(count(d, 'one'), 1, 'once');
		} finally { void before; }
	});
	ok(`typing, Ctrl+Z at once, then ${name}: the undo is what's saved (the typed text isn't written back)`, async (p, h, t) => {
		const before = snap(p);
		await openMs(p);
		await focusEndOf(p, KEEPER);
		await typeKeys(p, ' typed');
		await p.sleep(2600); // saved
		t.eq(disk(p, KEEPER), BASE(before, ' typed'), 'saved');
		await typeKeys(p, ' more');
		await p.key('z', 'ctrl');
		await tear(p);
		await p.sleep(1500);
		if (name === 'the plugin turned off') await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
		t.ok(!disk(p, KEEPER).includes(' more'), 'undone text isn\'t on disk: ' + j(disk(p, KEEPER).slice(-40)));
		t.ok(disk(p, KEEPER).includes(' typed'), 'earlier text kept');
	});
}

// ---- 5. differential: the same typing, outside writes and undo, in the manuscript and in Obsidian's own tab ----
// Obsidian's tab is the bar: whatever it keeps, the manuscript must keep. The same seeded sequence runs on two copies
// of a note, one shown in the manuscript, one in a tab; the files must come out the same.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const BUGGY = new Set([13, 17, 27, 28]);
const FIXTURE = '---\nstatus: draft\nsynopsis: A scene.\n---\nFirst paragraph of the scene, with a few words.\n\nSecond paragraph, a little longer than the first one was.\n\nThird and last paragraph.\n';
const WORDS = ['a', 'bc', 'def', ' ghij', 'k\n', 'lmnop ', 'qr.', '\n\ns', 'tu v'];
function planFor(seed, n = 12) {
	const r = rng(seed), ops = [];
	for (let i = 0; i < n; i++) {
		const k = r(), wait = [0, 0, 60, 300, 700, 2300][Math.floor(r() * 6)];
		if (k < 0.5) ops.push({ op: 'type', at: r(), word: WORDS[Math.floor(r() * WORDS.length)], wait });
		else if (k < 0.62) ops.push({ op: 'undo', wait });
		else if (k < 0.68) ops.push({ op: 'redo', wait });
		else if (k < 0.78) ops.push({ op: 'append', wait, n: i });
		else if (k < 0.86) ops.push({ op: 'prepend', wait, n: i });
		else if (k < 0.92) ops.push({ op: 'prop', wait, n: i });
		else ops.push({ op: 'touch', wait });
	}
	return ops;
}
function planFor2(seed, n = 12) {
	const r = rng(seed), ops = [];
	for (let i = 0; i < n; i++) {
		const k = r(), wait = [0, 60, 200, 700, 1500, 2300][Math.floor(r() * 6)];
		if (k < 0.4) ops.push({ op: 'type', at: r(), word: WORDS[Math.floor(r() * WORDS.length)], wait });
		else if (k < 0.5) ops.push({ op: 'undo', wait });
		else if (k < 0.55) ops.push({ op: 'redo', wait });
		else if (k < 0.7) ops.push({ op: 'mid', wait, n: i });
		else if (k < 0.85) ops.push({ op: 'api', wait, n: i });
		else if (k < 0.93) ops.push({ op: 'append', wait, n: i });
		else ops.push({ op: 'touch', wait });
	}
	return ops;
}
async function runPlan(p, plan, where, path) {
	const E = where === 'ms' ? `${sc(path)}.live.editor` : `app.workspace.getActiveViewOfType(app.workspace.getMostRecentLeaf().view.constructor)?.editor ?? app.workspace.getMostRecentLeaf().view.editor`;
	const focus = () => p.ev(`(() => { ${where === 'tab' ? `app.workspace.setActiveLeaf(window.__tabLeaf, { focus: true });` : ''} ${E.startsWith('app') ? `const E = window.__tabLeaf.view.editor;` : `const E = ${E};`} E.focus(); return 1; })()`);
	const ed = where === 'ms' ? E : 'window.__tabLeaf.view.editor';
	// What an outside write put in the note that its editor hasn't shown yet. A typing step measures where to put the
	// caret from the text the editor has, so it must start from the text the file had when the step was planned: how
	// soon an editor takes an outside write up depends on how busy the machine is, not on what the plan is about (the
	// chaos tests below are the ones that type while a write is on its way). Waits are not failures: if what was
	// written never shows, the plan goes on, and the end of the test says whether the texts agree.
	const owed = [];
	const caughtUp = async () => {
		const t0 = Date.now();
		for (let i = 0; i < 80 && owed.length; i++) {
			const doc = await p.ev(`${ed}.getValue()`);
			for (let k = owed.length - 1; k >= 0; k--) if (doc.includes(owed[k])) owed.splice(k, 1);
			if (owed.length) await p.sleep(50);
		}
		if (process.env.QA6_TRACE && Date.now() - t0 > 100) console.log(`    ${where}: waited ${Date.now() - t0} ms for ${j(owed)}`);
		if (owed.length) console.log(`    ${where}: an outside write never showed in the editor: ${j(owed)}`);
		owed.length = 0;
	};
	for (const o of plan) {
		if (o.op === 'type' || o.op === 'undo' || o.op === 'redo') await caughtUp();
		await focus();
		if (o.op === 'type') {
			await p.ev(`(() => { const E = ${ed}, doc = E.getValue(), start = doc.indexOf('First'), at = start + Math.floor(${o.at} * (doc.length - start)); E.setCursor(E.offsetToPos(at)); return 1; })()`);
			for (const ch of o.word) await p.send('Input.insertText', { text: ch });
		} else if (o.op === 'undo') await p.key('z', 'ctrl');
		else if (o.op === 'redo') await p.key('z', 'ctrl', 'shift');
		else {
			const mark = { append: `External line ${o.n}.`, prepend: `Ext${o.n} First`, prop: `status: s${o.n}`, mid: `PARAGRAPH${o.n}`, api: `k${o.n}: v${o.n}` }[o.op];
			await p.ev(`(async () => { const path = ${j(path)}; const cur = await app.vault.adapter.read(path); let next = cur;
				if ('${o.op}' === 'append') next = cur + 'External line ${o.n}.\\n';
				if ('${o.op}' === 'prepend') next = cur.replace('First', 'Ext${o.n} First');
				if ('${o.op}' === 'prop') next = cur.replace(/status: .*/, 'status: s${o.n}');
				if ('${o.op}' === 'mid') next = cur.replace('paragraph', 'PARAGRAPH${o.n}');
				if ('${o.op}' === 'api') { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), (fm) => { fm['k${o.n}'] = 'v${o.n}'; }); return 1; }
				await app.vault.adapter.write(path, next); return 1; })()`);
			// (only what the file really has now: a replace that found nothing to replace wrote nothing new)
			if (mark && (await raw(p, path)).includes(mark) && !(await p.ev(`${ed}.getValue()`)).includes(mark)) owed.push(mark);
		}
		await p.sleep(o.wait);
	}
}
// seeds 13, 17, 27 and 28 fail on the stale `data` (see the BUG tests of section 9); the others are kept as controls
for (const seed of [11, 12, 13, 14, 15, 16, 17, 27, 28]) {
	(BUGGY.has(seed) ? bad : ok)(`differential: seed ${seed}, typing, outside writes and undo run the same in the manuscript and in a tab`, async (p, h, t) => {
		const plan = planFor(seed);
		try {
			await p.ev(`(async () => { await app.vault.createFolder('Twin'); await app.vault.adapter.write('Twin/T.md', ${j(FIXTURE)}); return 1; })()`);
			await setupOdd(p, [['M', FIXTURE]], false);
			await openMs(p, 'Odd');
			await runPlan(p, plan, 'ms', 'Odd/M.md');
			await p.sleep(2600);
			await p.ev(`(async () => { await Promise.all(${VIEW}.current.scenes.filter(s => s.live).map(s => s.live.flush())); return 1; })()`);
			const msEditor = await p.ev(`${sc('Odd/M.md')}.live.text`);
			await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`);
			await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Twin/T.md')); window.__tabLeaf = l; return 1; })()`);
			await runPlan(p, plan, 'tab', 'Twin/T.md');
			await p.sleep(2600);
			await p.ev(`window.__tabLeaf.view.save().then(() => 1)`);
			const tabEditor = await p.ev(`window.__tabLeaf.view.editor.getValue()`);
			const a = await raw(p, 'Odd/M.md'), b = await raw(p, 'Twin/T.md');
			console.log('    plan', j(plan.map((o) => o.op + (o.word ? ':' + o.word : '') + '@' + o.wait).join(' ')));
			t.eq(msEditor, a, 'the manuscript\'s editor and its file agree');
			t.eq(tabEditor, b, 'the tab\'s editor and its file agree');
			t.eq(a, b, 'manuscript and tab end with the same file');
		} finally { await cleanOdd(p); }
	});
}

// ---- 6. names that need escaping: in the binder note's list, in the manuscript, and where typing lands ----
const HOSTILE = ['true', '123', 'null', '~', '- dash', '#hash', '!bang', 'it\'s', 'say "hi"', 'a: b', '[brackets]', '{braces}', '*star', '&amp', '%pct', '@at', '`tick`', '> gt', '| pipe', '?q', 'é ü 日本 😀', 'a, b', 'x # y', '0x1F', '1e3', 'yes', 'No', '<<', '='];
ok('names that need escaping (YAML words and symbols, quotes, brackets, non-ASCII): a binder made from them lists every note once, in order; reordering keeps that; each note shows and takes its own typing', async (p, h, t) => {
	const names = HOSTILE;
	try {
		const made = await p.ev(`(async () => {
			await app.vault.createFolder('Odd');
			const made = [];
			for (const n of ${j(names)}) { try { await app.vault.create('Odd/' + n + '.md', 'Text of ' + n + '.\\n'); made.push(n); } catch (e) { /* a name this system can't have */ } }
			await new Promise(r => setTimeout(r, 700));
			await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Odd'));
			return made; })()`);
		await p.sleep(800);
		const listed = () => p.ev(`(app.plugins.plugins.binders.binders.scenes(app.vault.getAbstractFileByPath('Odd')) ?? []).map(f => f.basename)`);
		const l1 = await listed();
		t.eq(j([...l1].sort()), j([...made].sort()), 'the binder lists every note, once (' + made.length + ' made)');
		// move one note to the front and one to the back, then read the list again from a fresh read of the binder note
		await p.ev(`(async () => { const b = app.plugins.plugins.binders.binders, f = app.vault.getAbstractFileByPath('Odd'); const s = b.scenes(f); await b.move(s[s.length - 1], f, 0); await b.move(s[1], f, Infinity); await b.flush?.(); return 1; })()`);
		await p.sleep(800);
		const l2 = await listed();
		t.eq(j([...l2].sort()), j([...made].sort()), 'after moves: every note once');
		t.eq(l2[0], l1[l1.length - 1], 'the moved note is first');
		await p.ev(`app.plugins.plugins.binders.binders.refresh?.()`).catch(() => {});
		await p.sleep(400);
		t.eq(j(await listed()), j(l2), 'a fresh read of the binder note gives the same order');
		await openMs(p, 'Odd');
		const titles2 = await p.ev(`${VIEW}.current.scenes.map(s => s.file.basename)`);
		t.eq(j(titles2), j(l2), 'the manuscript shows them in that order');
		// typing in each lands in its own file
		for (const n of l2) {
			await focusEndOf(p, `Odd/${n}.md`);
			await typeKeys(p, ' <' + n.length + '>');
		}
		await p.ev(`(async () => { await Promise.all(${VIEW}.current.scenes.filter(s => s.live).map(s => s.live.flush())); return 1; })()`);
		await p.sleep(300);
		const bad = [];
		for (const n of l2) { const d = await raw(p, `Odd/${n}.md`); if (d !== `Text of ${n}. <${n.length}>\n`) bad.push(n + ': ' + j(d)); }
		t.eq(bad.join(' | '), '', 'each note has its own typing');
		const bn = await raw(p, 'Odd/Odd.md');
		t.eq(count(bn, 'binder: 1'), 1, 'the binder note is intact: ' + j(bn.slice(0, 80)));
	} finally { await cleanOdd(p); }
});

// ---- 7. a binder in a window of its own (a popout): typing, then the window closed ----
ok('a binder moved to a window of its own: typing in the manuscript there, then the window closed at once, is saved', async (p, h, t) => {
	const before = snap(p);
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	const moved = await p.ev(`(async () => { try { const leaf = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.moveLeafToPopout(leaf); window.__pop = leaf; await new Promise(r => setTimeout(r, 1800)); return leaf.view.containerEl.win !== window; } catch (e) { return 'err ' + e.message; } })()`);
	if (moved !== true) { console.log('    no popout window here: ' + moved); return; }
	await p.ev(`(async () => { const v = window.__pop.view, m = v.current; const s = m.scenes.find(s => s.file.path === ${j(KEEPER)}); await m.mount(s); const E = s.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().length - 1)); E.replaceSelection(' POP'); window.__pop.detach(); return 1; })()`);
	await p.sleep(1200);
	t.eq(disk(p, KEEPER), before[KEEPER].replace('doorway.', 'doorway. POP'), 'typed in a popout, the window closed at once: on disk');
	await p.ev(`(() => { delete window.__pop; return 1; })()`);
});
bad('two notes renamed one after the other (Obsidian rewrites the links to each in a note with unsaved typing): both links follow, and the typing stays', async (p, h, t) => {
	const T = '---\nstatus: draft\n---\nSee [[One]] and [[Two]] now.\n\nEnd.\n';
	try {
		await setupOdd(p, [['M', T], ['One', 'One.\n'], ['Two', 'Two.\n']], false);
		await openMs(p, 'Odd');
		await p.ev(`(() => { const E = ${sc('Odd/M.md')}.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().indexOf('End.') + 4)); return 1; })()`);
		await typeKeys(p, ' TYPED');
		await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Odd/One.md'), 'Odd/Uno.md'); await new Promise(r => setTimeout(r, 400)); await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Odd/Two.md'), 'Odd/Dos.md'); return 1; })()`);
		await p.sleep(3500);
		const d = await raw(p, 'Odd/M.md');
		t.ok(d.includes('End. TYPED'), 'the typing stays: ' + j(d));
		t.ok(d.includes('[[Uno]]') && d.includes('[[Dos]]'), 'both links follow their notes: ' + j(d));
	} finally { await cleanOdd(p); }
});

ok('PROBE two renames in a row, state of the embed', async (p, h, t) => {
	if (!process.env.QA6_PROBE3) return;
	const T = '---\nstatus: draft\n---\nSee [[One]] and [[Two]] now.\n\nEnd.\n';
	try {
		await p.ev(`(() => { const f = app.embedRegistry.embedByExtension.md; app.embedRegistry.embedByExtension.md = function (...a) { const e = f.apply(this, a); (window.__embeds ||= []).push(e); return e; }; return 1; })()`);
		await setupOdd(p, [['M', T], ['One', 'One.\n'], ['Two', 'Two.\n']], false);
		await openMs(p, 'Odd');
		const st = (label) => p.ev(`(() => { const e = window.__embeds.filter(e => e.file.path === 'Odd/M.md').pop(); const s = (x) => JSON.stringify((x ?? '').slice(20)); return ${j(label)} + ' dirty=' + e.dirty + '\\n     saved=' + s(e.lastSavedData) + '\\n     data =' + s(e.data) + '\\n     edit =' + s(e.editMode.get()); })()`);
		await p.ev(`(() => { const E = ${sc('Odd/M.md')}.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().indexOf('End.') + 4)); return 1; })()`);
		await typeKeys(p, ' TYPED');
		console.log('    ' + await st('typed'));
		await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Odd/One.md'), 'Odd/Uno.md').then(() => 1)`);
		await p.sleep(400);
		console.log('    ' + await st('after rename 1'));
		await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Odd/Two.md'), 'Odd/Dos.md').then(() => 1)`);
		await p.sleep(700);
		console.log('    ' + await st('after rename 2'));
		await p.sleep(3500);
		console.log('    ' + await st('3.5 s later') + '\n     disk =' + j((await raw(p, 'Odd/M.md')).slice(20)));
	} finally { await cleanOdd(p); }
});


// ---- 8. Obsidian rewrites links in a note that has unsaved typing (a rename elsewhere), as in a tab ----
for (const [name, typedAt] of [['typed at the end', 'end'], ['typed right after the link', 'link']]) {
	ok(`a note being typed in links to another note that is renamed (links updated by Obsidian), ${name}: the manuscript keeps what a tab keeps`, async (p, h, t) => {
		const T = '---\nstatus: draft\n---\nSee [[Target one]] now.\n\nSecond paragraph [[Target one]] ends.\n';
		try {
			await p.ev(`(async () => { await app.vault.createFolder('Twin'); await app.vault.adapter.write('Twin/T.md', ${j(T)}); await app.vault.adapter.write('Twin/Target one.md', 'Target.\\n'); return 1; })()`);
			await setupOdd(p, [['M', T], ['Target one', 'Target.\n']], false);
			const typeAt = (E) => `(() => { const E = ${E}, d = E.getValue(); E.focus(); const at = ${typedAt === 'end' ? 'd.length - 1' : `d.indexOf('[[Target one]]') + 14`}; E.setCursor(E.offsetToPos(at)); return 1; })()`;
			await openMs(p, 'Odd');
			await p.ev(typeAt(`${sc('Odd/M.md')}.live.editor`));
			await typeKeys(p, ' TYPED');
			await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Odd/Target one.md'), 'Odd/Renamed.md').then(() => 1)`);
			await p.sleep(3000);
			await p.ev(`(async () => { await Promise.all(${VIEW}.current.scenes.filter(s => s.live).map(s => s.live.flush())); return 1; })()`);
			await p.sleep(500);
			const a = await raw(p, 'Odd/M.md'), aEditor = await p.ev(`${sc('Odd/M.md')}.live?.text ?? null`);
			await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`);
			await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Twin/T.md')); window.__tabLeaf = l; return 1; })()`);
			await p.ev(typeAt(`window.__tabLeaf.view.editor`));
			await typeKeys(p, ' TYPED');
			await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Twin/Target one.md'), 'Twin/Renamed.md').then(() => 1)`);
			await p.sleep(3000);
			await p.ev(`window.__tabLeaf.view.save().then(() => 1)`);
			await p.sleep(500);
			const b = await raw(p, 'Twin/T.md');
			t.eq(count(a, 'TYPED'), 1, 'the manuscript note has the typing once: ' + j(a));
			t.eq(a.replace(/\[\[(?:\w+\/)?Renamed\]\]/g, '[[L]]'), b.replace(/\[\[(?:\w+\/)?Renamed\]\]/g, '[[L]]'), 'same as in a tab (links aside): ' + j(a) + ' vs ' + j(b));
			t.eq(count(a, 'Renamed]]'), 2, 'both links follow the rename: ' + j(a));
			if (aEditor !== null) t.eq(aEditor, a, 'the editor and the file agree');
		} finally { await cleanOdd(p); }
	});
}

// ---- 9. two outside writes in a row (no key between them) while there is unsaved typing ----
// loadFileInternal merges an outside change into the typing against `embed.data`, which the merge itself leaves at the
// text before it: the next outside change is then merged as if the first had been taken back.
/** QA6_PATCHED=1: the suggested fix of finding 4 applied to the embeds as they're made (not the plugin's code): after an outside change is merged into typing, `data` is the merged text. */
const patchFix = (p) => (process.env.QA6_PATCHED ? p.ev(`(() => { const f = app.embedRegistry.embedByExtension.md; if (f.__fixed) return 1; const g = function (...a) { const e = f.apply(this, a); const orig = e.loadFileInternal; e.loadFileInternal = function (...b) { const r = orig.apply(this, b); if (this.dirty) this.data = this.editMode?.get() ?? this.text; return r; }; return e; }; g.__fixed = true; app.embedRegistry.embedByExtension.md = g; return 1; })()`) : Promise.resolve());
const outside = (p, path, edit) => p.ev(`(async () => { const c = await app.vault.adapter.read(${j(path)}); await app.vault.adapter.write(${j(path)}, (${edit})(c)); return 1; })()`);
bad('two outside changes in a row (a sync client delivering two files’ worth, a script) while there is unsaved typing: the first is not undone by the second', async (p, h, t) => {
	try {
		await setupOdd(p, [['M', FIXTURE]], false);
		await openMs(p, 'Odd');
		await p.ev(`(() => { const E = ${sc('Odd/M.md')}.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().indexOf('First') + 3)); return 1; })()`);
		await typeKeys(p, 'Y');
		await outside(p, 'Odd/M.md', `c => c + 'External line 1.\\n'`);
		await p.sleep(700);
		await outside(p, 'Odd/M.md', `c => c + 'External line 2.\\n'`);
		await p.sleep(700);
		const shown = await p.ev(`${sc('Odd/M.md')}.live.text`);
		t.ok(shown.includes('External line 1.') && shown.includes('External line 2.'), 'the editor has both outside lines: ' + j(shown.slice(-70)));
		await p.sleep(2600);
		const d = await raw(p, 'Odd/M.md');
		t.ok(d.includes('External line 1.\nExternal line 2.\n'), 'the file has both outside lines: ' + j(d.slice(-70)));
		t.ok(d.includes('FirYst'), 'and the typing');
	} finally { await cleanOdd(p); }
});
bad('a status set, then a label set (Binders’ own property writes) while there is unsaved typing in the note: both stay, and the typing', async (p, h, t) => {
	try {
		await setupOdd(p, [['M', FIXTURE]], false);
		await openMs(p, 'Odd');
		await p.ev(`(() => { const E = ${sc('Odd/M.md')}.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().indexOf('First') + 3)); return 1; })()`);
		await typeKeys(p, 'Y');
		await p.ev(`(async () => { const b = app.plugins.plugins.binders.binders, f = app.vault.getAbstractFileByPath('Odd/M.md'); await b.setProps(f, { status: 'Done' }); await new Promise(r => setTimeout(r, 500)); await b.setProps(f, { label: 'Red' }); return 1; })()`);
		await p.sleep(3500);
		const d = await raw(p, 'Odd/M.md');
		t.ok(/status: Done/.test(d), 'the status is kept: ' + j(d.slice(0, 80)));
		t.ok(/label: Red/.test(d), 'the label is kept: ' + j(d.slice(0, 80)));
		t.ok(d.includes('FirYst'), 'the typing is kept');
	} finally { await cleanOdd(p); }
});
// the state of the embed across two outside appends: QA6_PROBE2=1
ok('PROBE two outside appends in a row while there is unsaved typing', async (p, h, t) => {
	if (!process.env.QA6_PROBE2) return;
	try {
		await p.ev(`(() => { const f = app.embedRegistry.embedByExtension.md; app.embedRegistry.embedByExtension.md = function (...a) { const e = f.apply(this, a); (window.__embeds ||= []).push(e); return e; }; return 1; })()`);
		await setupOdd(p, [['M', FIXTURE]], false);
		await openMs(p, 'Odd');
		const st = (label) => p.ev(`(() => { const e = window.__embeds.filter(e => e.file.path === 'Odd/M.md').pop(); const s = (x) => JSON.stringify(x.slice(60)); return ${j(label)} + ' dirty=' + e.dirty + '\\n     saved=' + s(e.lastSavedData ?? '') + '\\n     data =' + s(e.data) + '\\n     text =' + s(e.text) + '\\n     edit =' + s(e.editMode.get()); })()`);
		await p.ev(`(() => { const E = ${sc('Odd/M.md')}.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().indexOf('First') + 3)); return 1; })()`);
		await typeKeys(p, 'Y');
		console.log('    ' + await st('after Y typed'));
		await outside(p, 'Odd/M.md', `c => c + 'External line 9.\\n'`);
		await p.sleep(700);
		console.log('    ' + await st('after external 9'));
		await outside(p, 'Odd/M.md', `c => c + 'External line 10.\\n'`);
		await p.sleep(700);
		console.log('    ' + await st('after external 10'));
	} finally { await cleanOdd(p); }
});
// a plan of the differential tests replayed step by step: QA6_SEED=17 QA6_WHERE=ms|tab
ok('PROBE replay of a differential plan', async (p, h, t) => {
	if (!process.env.QA6_SEED) return;
	const plan = planFor(Number(process.env.QA6_SEED)), where = process.env.QA6_WHERE || 'ms';
	try {
		if (where === 'tab') await p.ev(`(async () => { await app.vault.createFolder('Twin'); await app.vault.adapter.write('Twin/T.md', ${j(FIXTURE)}); const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Twin/T.md')); window.__tabLeaf = l; return 1; })()`);
		else { await setupOdd(p, [['M', FIXTURE]], false); await openMs(p, 'Odd'); }
		const path = where === 'ms' ? 'Odd/M.md' : 'Twin/T.md';
		const ed = where === 'ms' ? `${sc(path)}.live.editor` : 'window.__tabLeaf.view.editor';
		for (let i = 0; i < plan.length; i++) {
			await runPlan(p, [plan[i]], where, path);
			console.log(`    ${i} ${plan[i].op}${plan[i].word ? ':' + j(plan[i].word) : ''}@${plan[i].wait}  editor ${j(await p.ev(`${ed}.getValue().slice(60)`))}\n         disk   ${j((await raw(p, path)).slice(60))}`);
		}
	} finally { await cleanOdd(p); }
});

// ---- 10. Binders' own writes to a binder note and a folder note while their text is being typed in a tab ----
for (const [which, path, folderPath] of [['the binder note', NOTE, 'The Lighthouse']]) {
	ok(`typing in ${which} in a tab, then two reorders in a row from Binders: the order changes, the typing stays once, the rest of the note is as it was`, async (p, h, t) => {
		const before = snap(p);
		await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath(${j(path)})); window.__tabLeaf = l; const E = l.view.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().length)); return 1; })()`);
		await typeKeys(p, '\nNotes on this: TYPED-NOTE\n');
		await p.ev(`(async () => { const b = app.plugins.plugins.binders.binders, f = app.vault.getAbstractFileByPath(${j(folderPath)}); const s = b.scenes(f).length ? b.orderedChildren(f).filter(x => x.extension === 'md') : []; await b.move(s[s.length - 1], f, 0); await new Promise(r => setTimeout(r, 150)); await b.move(s[s.length - 2] ?? s[0], f, 0); return 1; })()`);
		await p.sleep(3500);
		await p.ev(`window.__tabLeaf.view.save().then(() => 1)`);
		await p.sleep(500);
		const d = disk(p, path);
		t.eq(count(d, 'TYPED-NOTE'), 1, 'the typing is there once: ' + j(d.slice(-120)));
		t.ok(/Notes on this: TYPED-NOTE\n*$/.test(d), 'at the end: ' + j(d));
		const was = before[path].replace(/\n$/, '');
		t.ok(d.startsWith('---\n'), 'still starts with its properties');
		t.ok(/\bbinder: 1\b/.test(d) || which !== 'the binder note', 'binder version kept');
		t.ok(d !== before[path], 'the order changed');
		void was;
	});
}

// ---- 11. chaos: the manuscript, tabs and outside writes on one note; every token typed or written must end up once ----
// Controls: "tabs only" is Obsidian's own editors (two splits of one note), the bar for what Binders may lose.
const BUGGY_CHAOS = new Set(['manuscript only 1', 'manuscript only 5', 'manuscript only 6']); // the stale `data` of section 9
const CHAOS_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
// (A tab and the manuscript on one note, like two tabs of one note in Obsidian itself, lose or double some text when both
// are typed in at random with outside writes: the control, two native tabs, did so in 8 of 8 seeds, the manuscript and a
// tab in 5 of 8, doubling nothing. Only the manuscript alone is a fair test.)
const CHAOS = [['manuscript only', ['ms']]];
for (const [setup, editors] of CHAOS) for (const seed of CHAOS_SEEDS) {
	(BUGGY_CHAOS.has(`${setup} ${seed}`) ? bad : ok)(`chaos ${setup} ${seed}: typing, outside writes, at random moments: every token is in the file once, and the editors agree with it`, async (p, h, t) => {
		const r = rng(seed * 7919);
		const T = '---\nstatus: draft\n---\nFirst paragraph of the scene.\n\nSecond paragraph, a little longer.\n\nThird and last paragraph.\n';
		const tokens = [];
		const has = (k) => editors.includes(k);
		try {
			await setupOdd(p, [['M', T]], false);
			if (has('ms')) await openMs(p, 'Odd');
			for (const k of ['tab', 'tab2']) if (has(k)) await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(app.vault.getAbstractFileByPath('Odd/M.md')); window.__${k} = l; return 1; })()`);
			await p.sleep(400);
			const eds = { ms: `${sc('Odd/M.md')}.live.editor`, tab: 'window.__tab.view.editor', tab2: 'window.__tab2.view.editor' };
			const lead = { ms: `app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); const m = ${VIEW}.current; await m.mount(${sc('Odd/M.md')});`, tab: 'app.workspace.setActiveLeaf(window.__tab, { focus: true });', tab2: 'app.workspace.setActiveLeaf(window.__tab2, { focus: true });' };
			for (let i = 0; i < 14; i++) {
				const k = r(), wait = [0, 0, 80, 400, 900, 2300][Math.floor(r() * 6)], tok = ` <${seed}.${i}>`;
				if (k < 0.7) {
					const who = editors[Math.floor(r() * editors.length)];
					await p.ev(`(async () => { ${lead[who]} const E = ${eds[who]}, d = E.getValue(), at = [d.indexOf('First paragraph') + 5, d.indexOf('Second paragraph') + 6, d.indexOf('Third and') + 5][${Math.floor(r() * 3)}]; E.focus(); const lines = d.split('\\n'); let n = 0, ln = 0; for (; ln < lines.length; ln++) { if (n + lines[ln].length >= at) break; n += lines[ln].length + 1; } E.setCursor({ line: ln, ch: lines[ln].length }); return 1; })()`);
					for (const ch of tok) await p.send('Input.insertText', { text: ch });
					tokens.push(tok);
				} else {
					await p.ev(`(async () => { const c = await app.vault.adapter.read('Odd/M.md'); await app.vault.adapter.write('Odd/M.md', c + 'Outside${tok}\\n'); return 1; })()`);
					tokens.push(`Outside${tok}`);
				}
				await p.sleep(wait);
			}
			await p.sleep(2800);
			await p.ev(`(async () => { ${has('ms') ? `await ${VIEW}.current.scenes[0].live.flush();` : ''} ${has('tab') ? 'await window.__tab.view.save();' : ''} ${has('tab2') ? 'await window.__tab2.view.save();' : ''} return 1; })()`);
			await p.sleep(800);
			const d = await raw(p, 'Odd/M.md');
			const missing = tokens.filter((x) => count(d, x) !== 1).map((x) => `${j(x)} x${count(d, x)}`);
			t.eq(missing.join(', '), '', 'tokens not in the file exactly once (file ' + j(d.slice(30)) + ')');
			for (const k of editors) t.eq(await p.ev(`${eds[k]}.getValue()`), d, `${k} agrees with the file`);
		} finally { await cleanOdd(p); }
	});
}

// ---- 12. golden rule 3: setting a status touches the status and nothing else in a note's properties ----
const FANCY = {
	'comment': '---\n# written by hand\nstatus: draft   # first pass\ntags: [a, b]\nfun: yes\n---\nBody.\n',
	'flow and quotes': '---\ntags: [one,  two]\ntitle: \'Single: quoted\'\nalias: "Double \\"quoted\\""\nstatus: draft\nratio: 1.0\nlong: 0123\n---\nBody.\n',
	'block text': '---\nstatus: draft\nnotes: |\n  line one\n  line two\nfolded: >\n  a folded\n  paragraph\n---\nBody.\n',
	'dates and nulls': '---\ndate: 2024-01-05\nwhen: 2024-01-05T10:00:00\nempty:\nnothing: null\nstatus: draft\n---\nBody.\n',
	'indented list': '---\nstatus: draft\ntags:\n    - four-space\n    - indent\n---\nBody.\n',
	'crlf': '---\r\nstatus: draft\r\ntags:\r\n  - a\r\n---\r\nBody.\r\n',
};
bad('setting a status in a note whose properties are hand written (comments, flow lists, quotes, block text, dates, CRLF) changes only the status line', async (p, h, t) => {
	const names = Object.keys(FANCY);
	try {
		await setupOdd(p, names.map((n) => [safe(n), FANCY[n]]), false);
		await p.sleep(500);
		const diffs = [];
		for (const n of names) {
			await p.ev(`(async () => { const b = app.plugins.plugins.binders.binders; await b.setProps(app.vault.getAbstractFileByPath(${j(`Odd/${safe(n)}.md`)}), { status: 'Done' }); return 1; })()`);
			await p.sleep(300);
			const now = await raw(p, `Odd/${safe(n)}.md`);
			const want = FANCY[n].replace(/status: draft/, 'status: Done');
			if (now !== want) diffs.push(`${n}: ${j(now)} instead of ${j(want)}`);
		}
		t.eq(diffs.join('\n      '), '', 'notes whose other properties changed');
	} finally { await cleanOdd(p); }
});

// ---- 13. the app reloaded (Reload app without saving, a plugin update, an update restart) with typing in flight ----
for (const where of ['tab', 'manuscript']) {
	ok(`typing in ${where === 'tab' ? 'a note’s own tab' : 'the manuscript'}, then the app reloaded 100 ms later: what is on disk afterwards (a tab is the bar)`, async (p, h, t) => {
		const before = snap(p);
		if (where === 'tab') await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath(${j(KEEPER)})); window.__tabLeaf = l; const E = l.view.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().length - 1)); return 1; })()`);
		else { await openMs(p); await focusEndOf(p, KEEPER); }
		await typeKeys(p, ' RELOAD');
		await p.sleep(100);
		await reload(p);
		const d = disk(p, KEEPER);
		console.log(`    ${where}: after the reload the note ends ${j(d.slice(-30))}`);
		t.ok(d === before[KEEPER] || d === before[KEEPER].replace('doorway.', 'doorway. RELOAD'), 'the note is whole: either as it was or with every key: ' + j(d.slice(-60)));
	});
}

// (the same for what else is written as a page goes: the binder's order, waiting its moment to be written, and a
// synopsis still in its field. A write begun as the page ends is cut off after the file is emptied.)
ok('a change of order waiting to be written, then the app reloaded: the binder note is whole afterwards, as it was or with the move', async (p, h, t) => {
	const before = snap(p);
	await openView(p);
	const waiting = await p.ev(`(async () => { const b = app.plugins.plugins.binders.binders; void b.moveDown(app.vault.getAbstractFileByPath(${j(PROLOGUE)})); await new Promise(r => setTimeout(r, 30)); return b.waiting(); })()`);
	await reload(p);
	const d = disk(p, NOTE);
	console.log(`    order: ${waiting ? 'a write was waiting' : 'nothing was waiting'}; after the reload the binder note is ${d === before[NOTE] ? 'as it was' : 'changed'} (${d.length} of ${before[NOTE].length} characters)`);
	t.ok(waiting, 'a change of order was waiting to be written when the page went');
	const lines = (x) => x.split('\n').sort().join('\n');
	t.ok(d === before[NOTE] || lines(d) === lines(before[NOTE]), 'the binder note is whole: as it was, or the same lines in the new order: ' + j(d));
	sameBut(t, before, snap(p), { [NOTE]: d });
});
ok('a card’s synopsis being typed, then the app reloaded: the note is whole afterwards, as it was or with the synopsis', async (p, h, t) => {
	const before = snap(p);
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(500);
	const s = await p.at(`.workspace-leaf.mod-active .binders-card[data-path="${EPILOGUE}"] .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' Typed late.');
	await reload(p);
	const d = disk(p, EPILOGUE);
	console.log(`    synopsis: after the reload the note is ${d === before[EPILOGUE] ? 'as it was' : 'changed'} (${d.length} of ${before[EPILOGUE].length} characters)`);
	t.ok(d === before[EPILOGUE] || (count(d, 'Typed late.') === 1 && body(d) === body(before[EPILOGUE]) && d.length > before[EPILOGUE].length), 'the note is whole: as it was, or with the words in its synopsis: ' + j(d));
	sameBut(t, before, snap(p), { [EPILOGUE]: d });
});

// ---- 14. the same on a phone (390 x 844, touch; keys come in as an on-screen keyboard sends them) ----
for (const [name, tear] of Object.entries({ 'another mode': TEARDOWNS['another mode'], 'the view closed': TEARDOWNS['the view closed'], 'the quit event': TEARDOWNS['the quit event'], 'the app in the background': (p) => p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); return 1; })()`) })) {
	ok(`phone: a word still being composed, then ${name} at once: nothing typed is lost or doubled`, on(PHONE, async (p, h, t, before) => {
		await openMs(p);
		await focusEndOf(p, KEEPER);
		await typeKeys(p, ' one');
		await compose(p, ' two');
		const had = await p.ev(`${sc(KEEPER)}.live.text`);
		await tear(p);
		await p.sleep(900);
		const d = disk(p, KEEPER);
		t.ok(d.includes('doorway. one'), 'the committed text is on disk: ' + j(d.slice(-40)));
		t.eq(d, had, 'disk is what the editor had (' + j(had.slice(-30)) + ')');
		t.eq(count(d, 'one'), 1, 'once');
		await p.ev(`(() => { delete document.visibilityState; delete document.hidden; return 1; })()`);
	}));
}
bad('phone: two outside changes in a row while there is unsaved typing: the first is not undone by the second', on(PHONE, async (p, h, t) => {
	await setupOdd(p, [['M', FIXTURE]], false);
	await openMs(p, 'Odd');
	// (a phone's section is plain text until it's tapped: a real tap, between "Fir" and "st", makes it its editor)
	t.eq(await p.ev(`!!${sc('Odd/M.md')}.live`), false, 'before the tap the section is plain text');
	await tapText(p, 'Odd/M.md', 'First', 3);
	t.ok(await until(p, caretIn('Odd/M.md'), 5000), 'the tap makes the section its editor, with the caret in it');
	t.eq(await p.ev(`(() => { const cm = ${sc('Odd/M.md')}.live.cm, h = cm.state.selection.main.head; return cm.state.doc.sliceString(h - 3, h) + '|' + cm.state.doc.sliceString(h, h + 2); })()`), 'Fir|st', 'the caret is where the finger was');
	await typeKeys(p, 'Y');
	t.eq(await p.ev(`[${sc('Odd/M.md')}.live.dirty, ${sc('Odd/M.md')}.live.text.includes('FirYst')].join()`), 'true,true', 'what was typed is in the editor and not saved yet as the first outside change comes');
	await outside(p, 'Odd/M.md', `c => c + 'External line 1.\\n'`);
	await p.sleep(700);
	await outside(p, 'Odd/M.md', `c => c + 'External line 2.\\n'`);
	await p.sleep(3300);
	const d = await raw(p, 'Odd/M.md');
	await cleanOdd(p);
	t.ok(d.includes('External line 1.\nExternal line 2.\n') && d.includes('FirYst'), 'both outside lines and the typing are in the file: ' + j(d.slice(-70)));
}));
ok('phone: odd files (CRLF, lone CR, BOM, only properties, RTL, non-BMP, line separators) typed in at their end by an on-screen keyboard: the same bytes as a tab', on(PHONE, async (p, h, t) => {
	const notes = Object.entries(ODD).filter(([n]) => ['crlf', 'lone cr', 'bom', 'only props nl', 'unicode', 'line separators', 'no newline', 'tabs in props'].includes(n)).map(([n, s]) => [safe(n), s]);
	try {
		await setupOdd(p, notes);
		await openMs(p, 'Odd');
		for (const [n] of notes) {
			await focusEndOf(p, `Odd/${n}.md`);
			for (const ch of 'ZZ') await p.send('Input.insertText', { text: ch });
		}
		await p.ev(`(async () => { await Promise.all(${VIEW}.current.scenes.filter(s => s.live).map(s => s.live.flush())); return 1; })()`);
		await p.sleep(300);
		const bad2 = [];
		for (const [n] of notes) {
			await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath(${j(`Twin/${n}.md`)})); const E = l.view.editor; E.focus(); let n = E.lastLine(); while (n > 0 && !E.getLine(n)) n--; E.setCursor({ line: n, ch: E.getLine(n).length }); return 1; })()`);
			await p.sleep(80);
			for (const ch of 'ZZ') await p.send('Input.insertText', { text: ch });
			await p.ev(`app.workspace.getMostRecentLeaf().view.save().then(() => 1)`);
			const a = await raw(p, `Odd/${n}.md`), b = await raw(p, `Twin/${n}.md`);
			if (a !== b) bad2.push(`${n}: manuscript ${j(a)} vs tab ${j(b)}`);
		}
		t.eq(bad2.join('\n      '), '', 'the manuscript and a tab differ on');
	} finally { await cleanOdd(p); }
}));

// ---- 11b. two manuscripts of one binder (two panes), typed in at random moments: every token once, both agree ----
for (const seed of [1, 2, 3, 4, 5, 6]) {
	ok(`chaos two manuscripts ${seed}: typing in either at random moments: every token is in the file once, and both editors agree with it`, async (p, h, t) => {
		const r = rng(seed * 104729);
		const T = '---\nstatus: draft\n---\nFirst paragraph of the scene.\n\nSecond paragraph, a little longer.\n\nThird and last paragraph.\n';
		const tokens = [];
		try {
			await setupOdd(p, [['M', T], ['N', 'Other.\n']], false);
			await openMs(p, 'Odd');
						await p.ev(`(async () => { const ls = app.workspace.getLeavesOfType('binders-view'); if (ls.length < 2) { const l = app.workspace.getLeaf('split', 'vertical'); await l.setViewState({ type: 'binders-view', state: ls[0].getViewState().state, active: true }); } return 1; })()`);
			await p.sleep(800);
			await p.ev(`(() => { for (const l of app.workspace.getLeavesOfType('binders-view')) l.view.setMode('manuscript'); return 1; })()`);
			await p.sleep(800);
			const views = await p.ev(`app.workspace.getLeavesOfType('binders-view').length`);
			t.eq(views, 2, 'two binder views');
			const E = (i) => `app.workspace.getLeavesOfType('binders-view')[${i}].view.current.scenes.find(s => s.file.path === 'Odd/M.md')`;
			for (let i = 0; i < 14; i++) {
				const wait = [0, 0, 80, 400, 900, 2300][Math.floor(r() * 6)], tok = ` <${seed}.${i}>`, who = Math.floor(r() * 2);
				await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('binders-view')[${who}]; app.workspace.setActiveLeaf(l, { focus: true }); const m = l.view.current, s = ${E(who)}; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor, d = ed.getValue(), at = [d.indexOf('First paragraph') + 5, d.indexOf('Second paragraph') + 6, d.indexOf('Third and') + 5][${Math.floor(r() * 3)}]; ed.focus(); const lines = d.split('\\n'); let n = 0, ln = 0; for (; ln < lines.length; ln++) { if (n + lines[ln].length >= at) break; n += lines[ln].length + 1; } ed.setCursor({ line: ln, ch: lines[ln].length }); return 1; })()`);
				for (const ch of tok) await p.send('Input.insertText', { text: ch });
				tokens.push(tok);
				await p.sleep(wait);
			}
			await p.sleep(2800);
			await p.ev(`(async () => { await Promise.all([${E(0)}, ${E(1)}].map((s) => s.live.flush())); return 1; })()`);
			await p.sleep(800);
			const d = await raw(p, 'Odd/M.md');
			const missing = tokens.filter((x) => count(d, x) !== 1).map((x) => `${j(x)} x${count(d, x)}`);
			t.eq(missing.join(', '), '', 'tokens not in the file exactly once (file ' + j(d.slice(30)) + ')');
			for (const i of [0, 1]) t.eq(await p.ev(`${E(i)}.live.text`), d, `view ${i} agrees with the file`);
		} finally { await cleanOdd(p); }
	});
}

// ---- 1b. the qa5 scenario as written (a tap puts the caret, then keys), the whole of it on a slow CPU ----
for (const rate of [1, 4, 10]) {
	ok(`phone: tap at the end of the keeper, type, Delete from the title menu, CPU ${rate}x for all of it: the editor had the keys before Delete, and the trashed note has them`, on(PHONE, async (p, h, t, before) => {
		const was = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
		await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
		try {
			await openMs(p);
			await throttle(p, rate);
			await tapEndOf(p, KEEPER);
			await p.type(' last words');
			const had = await editorText(p, KEEPER);
			await titleMenu(p, KEEPER);
			t.ok(await menuTap(p, 'Delete'), 'Delete');
			await until(p, `!!document.querySelector('.modal .modal-button-container')`, 8000);
			await p.sleep(300);
			await dialogTap(p, 'Delete');
			await until(p, `app.vault.getAbstractFileByPath(${j(KEEPER)}) === null`, 8000);
			await throttle(p, 1);
			await p.sleep(2600);
			t.ok(had && had.includes('last words'), 'the editor had the keys before the menu (else the keys never reached it): ' + j(had?.slice(-30)));
			t.eq(disk(p, '.trash/The keeper.md'), before[KEEPER].replace('doorway.', 'doorway. last words'), 'the trashed note has every key');
		} finally {
			await throttle(p, 1);
			await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(was ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`);
		}
	}));
}

// Why the qa5 test "typing, then at once Delete from that section's title menu" failed twice in full runs and passes
// alone: when an earlier test left `.trash/The keeper.md` behind, Obsidian trashes the new one as "The keeper 1.md" and
// the test reads the old file, which lacks the last words. A test problem, not a plugin one (the trashed copy is whole).
ok('qa5 delete test, explained: with an older “The keeper.md” already in .trash, the note just deleted is whole under another name', on(PHONE, async (p, h, t, before) => {
	const was = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(async () => { app.vault.setConfig('trashOption', 'local'); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); await app.vault.adapter.mkdir('.trash'); await app.vault.adapter.write('.trash/The keeper.md', 'An older note left in the trash by another test.\\n'); return 1; })()`);
	try {
		await openMs(p);
		await focusEndOf(p, KEEPER);
		await typeKeys(p, ' last words');
		await titleMenu(p, KEEPER);
		t.ok(await menuTap(p, 'Delete'), 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(300);
		await dialogTap(p, 'Delete');
		await until(p, `app.vault.getAbstractFileByPath(${j(KEEPER)}) === null`, 4000);
		await p.sleep(1500);
		const trash = await p.ev(`app.vault.adapter.list('.trash').then(l => l.files)`);
		const whole = [];
		for (const f of trash) if ((await p.ev(`app.vault.adapter.read(${j(f)})`)) === before[KEEPER].replace('doorway.', 'doorway. last words')) whole.push(f);
		console.log('    .trash holds', j(trash), '; the whole note is', j(whole));
		t.eq(whole.length, 1, 'one file in the trash has every key: ' + j(trash));
		t.ok(!whole.includes('.trash/The keeper.md'), 'and it is not the old name, which is why a test reading that one sees the old text');
	} finally {
		await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(was ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`);
	}
}));

// ---- 15. a note saved with a byte-order mark (Notepad, some exporters): Obsidian reads its properties, Binders' cut doesn't ----
const BOMNOTE = '﻿---\nstatus: draft\nsynopsis: A bom scene.\n---\nBom body.\n';
ok('a note that starts with a byte-order mark and has properties: exported as one note, its properties are not part of the text', async (p, h, t) => {
	try {
		await setupOdd(p, [['1 A', 'Alpha.\n'], ['2 Bom', BOMNOTE]], false);
		const cache = await p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Odd/2 Bom.md'))?.frontmatter ?? null)`);
		t.ok(/draft/.test(cache), 'Obsidian reads its properties: ' + cache);
		await openMs(p, 'Odd');
		await p.ev(`(app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export'))`);
		await until(p, `!!document.querySelector('.modal.binders-export .binders-export-path')`, 4000);
		await p.sleep(200);
		await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-export button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
		// (the window reads the notes for its preview, then again to export: the note is there when both are done)
		await until(p, `app.vault.adapter.exists('Odd (exported).md')`, 10000);
		await p.sleep(500);
		const out = await raw(p, 'Odd (exported).md').catch(() => '');
		t.ok(out.includes('Bom body.'), 'it was exported: ' + j(out));
		t.ok(!/status: draft|synopsis: A bom/.test(out), 'the properties are not in the exported text: ' + j(out));
	} finally { await cleanOdd(p); await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Odd (exported).md'); if (f) await app.vault.delete(f); return 1; })()`); }
});
ok('a note that starts with a byte-order mark and has properties: merged into another note, its properties are not pasted into the text', async (p, h, t) => {
	try {
		await setupOdd(p, [['1 A', 'Alpha.\n'], ['2 Bom', BOMNOTE]], false);
		await mergeNotes(p, ['Odd/1 A.md', 'Odd/2 Bom.md']);
		const merged = await raw(p, 'Odd/1 A.md');
		t.ok(merged.includes('Bom body.'), 'merged: ' + j(merged));
		t.ok(!/status: draft/.test(merged), 'the properties of the merged note are not text: ' + j(merged));
	} finally { await cleanOdd(p); }
});

// ---- 16. an outside write while a word is being composed; and on a big note ----
for (const patched of [false]) {
	ok('an outside write arrives while a word is still being composed (not committed), then the word is committed: the outside line, the word and the earlier typing are each in the file once', async (p, h, t) => {
		try {
			await setupOdd(p, [['M', FIXTURE]], false);
			await openMs(p, 'Odd');
			await p.ev(`(() => { const E = ${sc('Odd/M.md')}.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().indexOf('First') + 3)); return 1; })()`);
			await typeKeys(p, 'Y');
			await compose(p, 'wor');
			await outside(p, 'Odd/M.md', `c => c + 'External line 1.\\n'`);
			await p.sleep(600);
			await p.send('Input.insertText', { text: 'word' });
			await p.sleep(300);
			await p.ev(`(async () => { await ${VIEW}.current.scenes[0].live.flush(); return 1; })()`);
			await p.sleep(500);
			const d = await raw(p, 'Odd/M.md'), shown = await p.ev(`${sc('Odd/M.md')}.live.text`);
			t.eq(count(d, 'External line 1.'), 1, 'the outside line once: ' + j(d.slice(-50)));
			t.eq(count(d, 'FirYwordst'), 1, 'the typing and the committed word, in place, once: ' + j(d.slice(40, 110)));
			t.eq(shown, d, 'the editor and the file agree');
		} finally { await cleanOdd(p); }
	});
}
ok('PERF a 600 KB note being typed in, an outside write arrives (one only, see the two-writes tests): the page is not blocked for long while the two are merged, and both are kept', async (p, h, t) => {
	const big = '---\nstatus: draft\n---\n' + Array.from({ length: 6000 }, (_, i) => `Paragraph ${i} of a very long scene, with some words in it to make the lines long enough.`).join('\n\n') + '\n';
	try {
		await setupOdd(p, [['M', big]], false);
		await openMs(p, 'Odd');
		await p.ev(`(() => { const E = ${sc('Odd/M.md')}.live.editor; E.focus(); E.setCursor(E.offsetToPos(E.getValue().indexOf('Paragraph 3000') + 3)); window.__gaps = []; let last = performance.now(); window.__hb = setInterval(() => { const n = performance.now(); window.__gaps.push(n - last); last = n; }, 20); return 1; })()`);
		await typeKeys(p, 'QQ');
		await outside(p, 'Odd/M.md', `c => c + 'External line.\\n'`);
		await p.sleep(2500);
		const gap = await p.ev(`(() => { clearInterval(window.__hb); return Math.round(Math.max(...window.__gaps)); })()`);
		console.log('    longest pause of the page while the two outside writes were merged: ' + gap + ' ms');
		await p.ev(`(async () => { await ${VIEW}.current.scenes[0].live.flush(); return 1; })()`);
		await p.sleep(500);
		const d = await raw(p, 'Odd/M.md');
		t.ok(d.includes('ParQQagraph 3000'), 'the typing is in the note');
		t.ok(d.includes('External line.\n'), 'the first outside line is in the note');
		t.ok(gap < 1500, 'the page stayed responsive: longest pause ' + gap + ' ms');
	} finally { await cleanOdd(p); }
});

// ---- 17. a synopsis typed in a field (the corkboard's card), not yet committed, and then the view goes ----
const SYN_TEARDOWNS = {
	'another mode': (p) => mode(p, 'outliner'),
	'the view closed': TEARDOWNS['the view closed'],
	'the plugin turned off': TEARDOWNS['the plugin turned off'],
	'the quit event': TEARDOWNS['the quit event'],
	'a click on another card': async (p) => { const c = await p.at(`.workspace-leaf.mod-active .binders-card[data-path="${L}Prologue.md"] .binders-card-title`); await p.click(c.x, c.y); },
};
for (const [name, tear] of Object.entries(SYN_TEARDOWNS)) {
	// (Obsidian's quit: `window.onbeforeunload` triggers `quit` and waits for the promises added to it before it closes the
	// window; a field in the view is committed on `pagehide`, when the window is already going)
	(name === 'the quit event' ? bad : ok)(`a card’s synopsis typed and not committed, then ${name}: the words are saved in the note’s properties once, the note’s text is untouched`, async (p, h, t) => {
		const before = snap(p);
		await openView(p);
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await p.sleep(500);
		const syn = `.workspace-leaf.mod-active .binders-card[data-path="${EPILOGUE}"] .binders-card-synopsis`;
		const s = await p.at(syn);
		await p.click(s.x, s.y);
		await p.key('End', 'ctrl');
		await p.type(' Typed late.');
		await tear(p);
		await p.sleep(1200);
		if (name === 'the plugin turned off') await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
		const d = disk(p, EPILOGUE);
		t.eq(count(d, 'Typed late.'), 1, 'the synopsis words are in the note once: ' + j(d.slice(0, 160)));
		t.eq(body(d), body(before[EPILOGUE]), 'the note’s text is as it was');
	});
}

// An empty properties block (`---` straight after `---`) and a rule further down: `parts()` and Obsidian's own
// `getFrontMatterInfo` end the block at offset 8, `bodyStart` reads on to the rule (20), so a caret put "at the start"
// of the section lands after the first paragraph.
bad('a note whose properties are empty and which has a rule further down: the start of its section is where its properties end (8), not after the first paragraph (20)', async (p, h, t) => {
	const T = '---\n---\nFirst.\n\n---\n\nSecond.\n';
	try {
		await setupOdd(p, [['A', T], ['B', 'Plain.\n']], false);
		await openMs(p, 'Odd');
		await p.ev(`(async () => { const m = ${VIEW}.current; await m.focusScene(m.scenes[0], 'start'); return 1; })()`);
		await p.sleep(200);
		const at = await p.ev(`${VIEW}.current.scenes[0].live.cm.state.selection.main.head`);
		t.ok(at <= 8, 'the caret at the start of the section is at ' + at + ' (the properties end at 8)');
		await typeKeys(p, 'ZZ');
		await p.ev(`(async () => { await ${VIEW}.current.scenes[0].live.flush(); return 1; })()`);
		t.ok((await raw(p, 'Odd/A.md')).startsWith('---\n---\nZZFirst.'), 'what is typed at the start goes before the first paragraph: ' + j(await raw(p, 'Odd/A.md')));
	} finally { await cleanOdd(p); }
});

// the same, with outside writes that change the paragraph being typed in, and Obsidian's own property API
const DIFF2 = [101, 102, 103, 104, 105, 106, 107, 108];
for (const seed of DIFF2) {
	ok(`differential 2: seed ${seed}, typing, undo, outside edits of the same paragraph and property writes run the same in the manuscript and in a tab`, async (p, h, t) => {
		const plan = planFor2(seed);
		try {
			await p.ev(`(async () => { await app.vault.createFolder('Twin'); await app.vault.adapter.write('Twin/T.md', ${j(FIXTURE)}); return 1; })()`);
			await setupOdd(p, [['M', FIXTURE]], false);
			await openMs(p, 'Odd');
			await runPlan(p, plan, 'ms', 'Odd/M.md');
			await p.sleep(2600);
			await p.ev(`(async () => { await Promise.all(${VIEW}.current.scenes.filter(s => s.live).map(s => s.live.flush())); return 1; })()`);
			await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`);
			await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Twin/T.md')); window.__tabLeaf = l; return 1; })()`);
			await runPlan(p, plan, 'tab', 'Twin/T.md');
			await p.sleep(2600);
			await p.ev(`window.__tabLeaf.view.save().then(() => 1)`);
			const a = await raw(p, 'Odd/M.md'), b = await raw(p, 'Twin/T.md');
			console.log('    plan', j(plan.map((o) => o.op + (o.word ? ':' + o.word : '') + '@' + o.wait).join(' ')));
			t.eq(a, b, 'manuscript and tab end with the same file');
		} finally { await cleanOdd(p); }
	});
}

// ---- 18. a click on a section that is only drawn (not an editor yet), then keys with no pause ----
for (const [how, rate, gap] of [['mouse', 1, 0], ['mouse', 6, 0], ['mouse', 1, 40], ['touch', 1, 0], ['touch', 6, 0]]) {
	const run = async (p, h, t, before) => {
		const names = Array.from({ length: 16 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);
		try {
			await setupOdd(p, names.map((n, i) => [n, `Line ${i + 1} of the short notes, and a few more words.\n`]), false);
			await openMs(p, 'Odd');
			await p.ev(`(() => { const m = ${VIEW}.current; m.root.scrollTop = m.root.scrollHeight; return 1; })()`);
			await p.sleep(1200);
			await settle(p);
			// a section that is drawn but is not an editor: out of sight (those in sight all are, once the page settles),
			// brought into sight and clicked at once, as after a fast scroll
			const target = await p.ev(`(() => { const m = ${VIEW}.current; const s = [...m.scenes].reverse().find(s => !s.live && s.shown !== null); return s ? s.file.path : null; })()`);
			t.ok(target, 'a section that is only drawn');
			await throttle(p, rate);
			await p.ev(`(() => { const s = ${sc(target)}; s.el.scrollIntoView({ block: 'center' }); window.__wasLive = null; window.addEventListener(${j(how === 'mouse' ? 'mousedown' : 'touchstart')}, () => { window.__wasLive = !!s.live; }, { capture: true, once: true }); return 1; })()`);
			const at = await textAt(p, target, 'short notes', 5);
			if (how === 'mouse') await p.click(at.x, at.y); else { await tap(p, at.x, at.y, 0); }
			const wasLive = await p.ev(`window.__wasLive`);
			await p.sleep(gap);
			await typeKeys(p, 'QRS');
			await throttle(p, 1);
			await p.sleep(2800);
			const all = await Promise.all(names.map((n) => raw(p, `Odd/${n}.md`)));
			// (none of the notes has a capital Q, R or S of its own)
			const typedIn = names.filter((n, i) => /[QRS]/.test(all[i]));
			const mine = await raw(p, target);
			console.log(`    ${how}, CPU ${rate}x, ${gap} ms: ${wasLive ? 'already an editor when clicked' : wasLive === false ? 'only drawn when clicked' : 'the click was not seen'}; typed into ${typedIn.join(', ') || 'no note'}; ${target}: ${j(mine)}`);
			t.eq(all.join('').replace(/[^QRS]/g, ''), 'QRS', 'each key once in the whole binder (' + typedIn.join(', ') + ')');
			t.eq(typedIn.map((n) => `Odd/${n}.md`).join(), target, 'in the section clicked, and no other');
			t.ok(mine.includes('QRS'), 'together, in the order typed: ' + j(mine));
		} finally { await throttle(p, 1); await cleanOdd(p); }
	};
	ok(`a click on a section that is only drawn (${how}, CPU ${rate}x), then ${gap} ms later three keys: they are in that note, once`, how === 'touch' ? on(PHONE, run) : run);
}
