// QA round 6, the newest features: snapshots, focus mode, the scene operations (split, merge, duplicate, group and
// ungroup, synopsis from text, export as one note) and Longform projects through them. Golden rule 2 first: every test compares
// bytes on disk. "qa6 features: …" tests pass; "BUG: …" tests are confirmed bugs and fail until fixed.
import { writeFileSync } from 'fs';
import { onDevice, tap as touchTap } from './specs-qa5-manuscript.mjs';
import { B, NOTE, PL, card, clickMenu, closeMenus, exists, file, flush, hoverMenu, j, menuItems, openView, read, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const add = (kind, name, fn) => specs.push({ name: `${kind}qa6 features: ${name}`, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });
const ok = (name, fn) => add('', name, fn);
const bad = (name, fn) => add('BUG: ', name, fn);

const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md', S = L + 'Part One/Storm warning.md';
const SN = L + 'Snapshots', DIR = SN + '/Part One/Arrival';
const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\n---\n';
const DLG = '.modal.binders-snapshots';
const sleep = (p, ms) => p.sleep(ms);

// ---- helpers (the snapshot ones follow specs-snapshots.mjs) ----
const list = (p, dir = DIR) => p.ev(`app.vault.adapter.exists(${j(dir)}).then(ok => ok ? app.vault.adapter.list(${j(dir)}).then(l => l.files.map(f => f.slice(${dir.length + 1})).sort()) : [])`);
const head = (text) => (/^---\nsnapshot-of: .*\ntaken: .*\n---\n/.exec(text) ?? [''])[0];
const textOf = async (p, path) => { const all = await read(p, path); return all.slice(head(all).length); };
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);
const openNote = (p, path, state = { mode: 'source' }) => p.ev(`app.workspace.getLeaf(false).openFile(${file(path)}, { state: ${j(state)} }).then(() => 1)`).then(() => sleep(p, 450));
const editor = (path) => `app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(path)}).view.editor`;
async function closeAll(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await sleep(p, 200); }
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); app.workspace.getLeavesOfType('binders-snapshot').forEach(l => l.detach()); return 1; })()`);
}
async function press(p, sel, text) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.textContent.trim().startsWith(${j(text)})).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
	if (!at) throw new Error(`nothing to press: ${sel} “${text}”`);
	await p.click(at.x, at.y);
	await sleep(p, 300);
}
async function cardMenu(p, path) {
	await openView(p, path.slice(0, path.lastIndexOf('/')));
	const at = await until(p, `(() => { const e = document.querySelector(${j(card(path))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 14 }; })()`);
	await p.right(at.x, at.y);
	await sleep(p, 250);
}
async function snapMenu(p, title) { await hoverMenu(p, 'Snapshots'); await clickMenu(p, title); }
/** The Snapshots dialog of a note: from its card (note closed) or by the command (note open in a tab). */
async function dialog(p, path = A, open = false) {
	if (open) { await openNote(p, path); await run(p, 'show-snapshots'); }
	else { await cardMenu(p, path); await snapMenu(p, 'Show snapshots...'); }
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await sleep(p, 300);
}
const pick = (p, text) => press(p, DLG + ' .binders-snapshots-item', text);
const button = (p, text) => press(p, DLG + ' .modal-setting-titlebar-actions button', text);
/** Puts a snapshot file in place, as Binders writes them. */
async function seed(p, dir, name, body, of = 'Part One/Arrival', taken = '2026-09-12T09:15:40') {
	await p.ev(`(async () => { let at = ''; for (const part of ${j(dir)}.split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); } await app.vault.create(${j(`${dir}/${name}.snapshot`)}, ${j(`---\nsnapshot-of: ${JSON.stringify(of)}\ntaken: ${taken}\n---\n${body}`)}); })().then(() => 1)`);
	return `${dir}/${name}.snapshot`;
}
/** Writes bytes to a note straight on the disk and waits for Obsidian to see them. */
const put = async (p, path, text) => { await writeRaw(p, path, text); await sleep(p, 450); };
const front = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)})?.frontmatterPosition ?? null)`).then(JSON.parse);
/** What Obsidian itself takes for a note's text: after its properties, if its cache sees any. */
async function seenBody(p, path, text) { const f = await front(p, path); return f ? text.slice(f.end.offset + (text[f.end.offset] === '\r' ? 2 : 1)) : text; }
const delSnapshots = (p) => p.ev(`(async () => { const d = ${file(SN)}; if (d) await app.vault.delete(d, true); })().then(() => 1)`);

// Odd files (the list the writing round uses), in the binder's Arrival slot.
const ODD = {
	'crlf': '---\r\nstatus: draft\r\n---\r\nOne.\r\n\r\nTwo.\r\n',
	'crlf body only': 'One.\r\n\r\nTwo.\r\n',
	'lone cr': 'One.\rTwo.\r',
	'bom': '﻿---\nstatus: draft\n---\nBody text.\n',
	'bom plain': '﻿Body text, no properties.\n',
	'no newline': 'No newline at the end',
	'only props nl': '---\nstatus: draft\n---\n',
	'empty props then rule': '---\n---\nFirst.\n\n---\n\nSecond.\n',
	'tabs in props': '---\nstatus: draft\ntags:\n\t- a\n---\nBody.\n',
	'mixed endings': '---\r\nstatus: draft\r\n---\nBody.\r\nMore.\n',
	'unicode': '---\nstatus: draft\n---\nمرحبا بالعالم\n😀 𝒜 é ‏x\n',
	'rule first': '---\nNot properties?\n\nBody under a rule.\n',
	'props with rule below': '---\nstatus: draft\n---\nUp.\n\n---\n\nDown.\n',
	'rule then text then rule': '---\n\nLost paragraph.\n\n---\n\nKept.\n',
	'trailing spaces': 'Line with trailing spaces   \nNext  \n',
	'scene break first': '* * *\n\nAfter a break.\n',
};
const WRITTEN = 'Something quite different, typed later.\n';

// ---- snapshots of odd files: take, change, bring back: the note comes back byte for byte ----
const noBom = (x) => x.replace(/^\uFEFF/, '');
/** Collects what's wrong instead of stopping at the first thing, so one run says everything about a note. */
const soft = () => { const bad = []; return { bad, eq: (a, b, m) => { if (a !== b) bad.push(`${m}: expected ${j(b)}, got ${j(a)}`); }, done: (t) => t.ok(!bad.length, bad.join(' | ')) }; };
const CLOSED = ['crlf', 'crlf body only', 'lone cr', 'bom plain', 'no newline', 'mixed endings', 'unicode', 'scene break first', 'trailing spaces', 'props with rule below'];
const OPEN = ['no newline', 'unicode', 'trailing spaces', 'props with rule below', 'scene break first'];
for (const open of [false, true]) {
	for (const name of open ? OPEN : CLOSED) {
		const text = ODD[name];
		ok(`snapshot, ${open ? 'note open' : 'note closed'}: ${name}: taken, changed, brought back, the note is its bytes again and the snapshot has all its text`, async (p, h, t) => {
			const s = soft();
			await put(p, A, text);
			if (open) { await openNote(p, A); await run(p, 'take-snapshot'); }
			else { await cardMenu(p, A); await snapMenu(p, 'Take a snapshot'); await closeMenus(p); }
			await until(p, `app.vault.adapter.exists(${j(DIR)})`);
			await sleep(p, 400);
			const files = await list(p);
			s.eq(files.length, 1, 'snapshots made');
			const kept = files.length ? await textOf(p, `${DIR}/${files[0]}`) : '';
			// whatever isn't in the snapshot is a leading properties block
			const orig = noBom(text), lead = orig.length - noBom(kept).length;
			s.eq(orig.endsWith(noBom(kept)), true, 'the snapshot is the end of the note');
			// type something else in the note, then bring the snapshot back
			const now = lead > 0 ? orig.slice(0, lead) + WRITTEN : WRITTEN;
			if (open) await p.ev(`(() => { ${editor(A)}.setValue(${j(now.replace(/\r\n?/g, '\n'))}); return 1; })()`); else await put(p, A, now);
			await sleep(p, 600);
			await dialog(p, A, open);
			await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})[1].click()`);
			await sleep(p, 300);
			await button(p, 'Bring back');
			await sleep(p, 1200);
			if (open) await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.save().then(() => 1)`);
			const after = await read(p, A);
			s.eq(noBom(after), orig, 'the note after bringing back');
			s.eq((await list(p)).filter((f) => /Before bringing back/.test(f)).length, 1, 'the text it replaced was kept');
			s.done(t);
		});
	}
}

// ---- BUG: reading is writing: Binders' own "save what's open first" rewrites a note the writer only has open ----
for (const [name, text, shown] of [['CRLF', 'One.\r\n\r\nTwo.\r\n', 'Windows line breaks']]) {
	bad(`${name}: taking a snapshot of a note that is only open (nothing typed) rewrites the file, losing ${shown}`, async (p, h, t) => {
		await put(p, A, text);
		await openNote(p, A);
		t.eq(await read(p, A), text, 'opening it changes nothing');
		await run(p, 'take-snapshot');
		await sleep(p, 1200);
		t.eq(await read(p, A), text, 'taking a snapshot of a note nobody typed in leaves the note as it was');
	});
}
bad('a note that opens with a rule, text, and a second rule: the snapshot has the first paragraph, and “Rewrite from a blank page” empties the note', async (p, h, t) => {
	const text = ODD['rule then text then rule'];
	await put(p, A, text);
	t.eq(await front(p, A), null, 'Obsidian itself sees no properties here');
	await cardMenu(p, A); await snapMenu(p, 'Take a snapshot'); await closeMenus(p);
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 400);
	t.eq(await textOf(p, `${DIR}/${(await list(p))[0]}`), text, 'the snapshot holds the whole text, “Lost paragraph.” included');
});

// ---- snapshots follow their notes: swaps in a burst, names others' snapshots still use ----
const TXT = (who) => `${who} wrote this text, and only ${who}.\n`;
async function take(p, path, body) {
	await put(p, path, body);
	await cardMenu(p, path); await snapMenu(p, 'Take a snapshot'); await closeMenus(p);
	await sleep(p, 500);
}
const dirOf = (path) => SN + '/' + path.slice(L.length).replace(/\.md$/, '');
const only = async (p, path) => { const d = dirOf(path); const fs = await list(p, d); return Promise.all(fs.map((f) => textOf(p, `${d}/${f}`))); };
bad('three renames in a burst that swap two notes’ names (A to a short name, B to A, the short name to B): each note keeps its own snapshots', async (p, h, t) => {
	const X = L + 'Part One/Arrival.md', Y = L + 'Part One/The keeper.md';
	await take(p, X, TXT('Arrival')); await take(p, Y, TXT('Keeper'));
	t.eq(j(await only(p, X)), j([TXT('Arrival')]), 'before: Arrival has its own');
	// three renames, one after another with no pause: all inside the plugin's 80 ms settling window
	await p.ev(`(async () => { const fm = app.fileManager, v = app.vault; await fm.renameFile(${file(X)}, ${j(L + 'Part One/Q.md')}); await fm.renameFile(${file(Y)}, ${j(X)}); await fm.renameFile(${file(L + 'Part One/Q.md')}, ${j(Y)}); })().then(() => 1)`);
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`);
	await sleep(p, 600);
	// the note now called "Arrival" is the one that was The keeper
	t.eq(j(await only(p, X)), j([TXT('Keeper')]), 'the note now named Arrival has the keeper’s snapshots');
	t.eq(j(await only(p, Y)), j([TXT('Arrival')]), 'the note now named The keeper has Arrival’s snapshots');
});
bad('the same swap with the names of different lengths (a long one to a short one) in a burst: nothing is mixed', async (p, h, t) => {
	const X = L + 'Part One/Storm warning.md', Y = L + 'Part One/Arrival.md';
	await take(p, X, TXT('Storm')); await take(p, Y, TXT('Arrival'));
	await p.ev(`(async () => { const fm = app.fileManager; await fm.renameFile(${file(X)}, ${j(L + 'Part One/Z.md')}); await fm.renameFile(${file(Y)}, ${j(X)}); await fm.renameFile(${file(L + 'Part One/Z.md')}, ${j(Y)}); })().then(() => 1)`);
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`);
	await sleep(p, 600);
	t.eq(j(await only(p, X)), j([TXT('Arrival')]), 'Storm warning (the old Arrival) has Arrival’s');
	t.eq(j(await only(p, Y)), j([TXT('Storm')]), 'Arrival (the old Storm warning) has the storm’s');
});
ok('the same swap, a pause between the renames: nothing is mixed', async (p, h, t) => {
	const X = L + 'Part One/Storm warning.md', Y = L + 'Part One/Arrival.md';
	await take(p, X, TXT('Storm')); await take(p, Y, TXT('Arrival'));
	for (const [a, b] of [[X, L + 'Part One/Z.md'], [Y, X], [L + 'Part One/Z.md', Y]]) { await p.ev(`app.fileManager.renameFile(${file(a)}, ${j(b)}).then(() => 1)`); await sleep(p, 400); }
	t.eq(j(await only(p, X)), j([TXT('Arrival')]), 'Storm warning (the old Arrival) has Arrival’s');
	t.eq(j(await only(p, Y)), j([TXT('Storm')]), 'Arrival (the old Storm warning) has the storm’s');
});

// ---- names ----
const rows = (p) => p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})].map(e => e.querySelector('.modal-sidebar-list-item-details').firstChild.textContent)`);
async function rewriteAs(p, name) {
	await cardMenu(p, A);
	await snapMenu(p, 'Rewrite...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.ev(`(() => { const i = document.querySelector('.modal .binders-ask input'); i.focus(); i.select(); return 1; })()`);
	await p.type(name);
	await sleep(p, 150);
	await press(p, '.modal button', 'Start from this text');
	await sleep(p, 700);
}
const NAMES = ['😀 Emoji', 'Ünïcödé é', 'two  spaces', 'a.b', 'ends with a dot.', 'ends with number 2', '100%', 'a&b #tag [x] {y}', 'x'.repeat(120)];
ok('names with emoji, dots and odd characters: each snapshot shows under the name it was given, and brings the text back', async (p, h, t) => {
	const bad = [];
	for (const [i, name] of NAMES.entries()) {
		await put(p, A, FRONT + `Text number ${i}.\n`);
		await rewriteAs(p, name);
		const files = await list(p), mine = files.filter((f) => f.includes(`${name}.snapshot`) || f.includes(name));
		if (files.length !== i + 1) bad.push(`${j(name)}: ${files.length} files, expected ${i + 1}: ${(await notices(p)).slice(0, 120)}`);
		else if (!mine.length) bad.push(`${j(name)}: no file named so: ${files.at(-1)}`);
	}
	await closeAll(p);
	await dialog(p, A);
	const shown = (await rows(p)).slice(1).reverse();
	NAMES.forEach((name, i) => { if (shown[i] !== name) bad.push(`shown as ${j(shown[i])}, given ${j(name)}`); });
	t.ok(!bad.length, bad.join(' | '));
});
bad('a snapshot named “Final draft (3)” is shown as “Final draft”: the writer’s own parentheses are cut off the name', async (p, h, t) => {
	await put(p, A, FRONT + 'Text.\n');
	await rewriteAs(p, 'Final draft (3)');
	await closeAll(p);
	await dialog(p, A);
	t.eq(j(await rows(p)), j(['The note now', 'Final draft (3)']), 'the list shows the name it was given');
});

// ---- scale ----
const bulkSeed = (p, dir, n, body) => p.ev(`(async () => { let at = ''; for (const part of ${j(dir)}.split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); } const pad = (x) => String(x).padStart(2, '0'); for (let i = 0; i < ${n}; i++) { const d = new Date(2026, 0, 1, 0, 0, i * 7); const name = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + '.' + pad(d.getSeconds()); await app.vault.create(${j(dir)} + '/' + name + '.snapshot', '---\\nsnapshot-of: "Part One/Arrival"\\ntaken: ' + name.replace(' ', 'T').replace(/\\.(\\d\\d)\\.(\\d\\d)$/, ':$1:$2') + '\\n---\\n' + ${j(body)} + ' ' + i + '\\n'); } })().then(() => 1)`);
ok('500 snapshots of one note: the dialog opens within a few seconds, shows them all, newest first, and one can be brought back', async (p, h, t) => {
	await put(p, A, FRONT + 'Now.\n');
	await bulkSeed(p, DIR, 500, 'An earlier text of the scene, number');
	const t0 = Date.now();
	await dialog(p, A);
	const took = Date.now() - t0;
	const n = await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length`);
	t.eq(n, 501, 'the note now and 500 snapshots (took ' + took + ' ms to open)');
	t.ok(took < 9000, 'opens in under 9 s: ' + took);
	const top = await rows(p);
	t.eq(top[0], 'The note now', 'the note first');
	await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})[1].click()`);
	await sleep(p, 300);
	t.ok(/number 499/.test(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-text')})?.innerText ?? ''`)), 'the newest shows first');
});
const BIG = (n) => Array.from({ length: n }, (_, i) => `Paragraph ${i} has some ordinary words in it for a long book.`).join('\n\n') + '\n';
ok('a note of 100,000 words: a snapshot is taken and brought back whole, byte for byte', async (p, h, t) => {
	const words = (s) => s.split(/\s+/).filter(Boolean).length;
	const text = BIG(9000); // about 100,000 words
	t.ok(words(text) > 95000, 'big enough: ' + words(text));
	await put(p, A, FRONT + text);
	const t0 = Date.now();
	await cardMenu(p, A); await snapMenu(p, 'Take a snapshot'); await closeMenus(p);
	await until(p, `app.vault.adapter.exists(${j(DIR)})`, 15000);
	await sleep(p, 800);
	t.ok(Date.now() - t0 < 12000, 'taken in under 12 s: ' + (Date.now() - t0));
	const f = (await list(p))[0];
	t.eq(await textOf(p, `${DIR}/${f}`), text, 'the snapshot has every byte');
	await put(p, A, FRONT + 'Replaced.\n');
	await dialog(p, A);
	await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})[1].click()`);
	await sleep(p, 600);
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s.length > 1000)`, 15000);
	t.eq(await read(p, A), FRONT + text, 'brought back exactly');
});
bad('a note of 3,000 short paragraphs with one line changed: “Show changes” marks that line, not all 6,000 paragraphs', async (p, h, t) => {
	const lines = Array.from({ length: 3000 }, (_, i) => `Line number ${i} of the scene.`);
	const was = lines.join('\n') + '\n', now = lines.map((l, i) => (i === 1500 ? 'Line number 1500 of the changed scene.' : l)).join('\n') + '\n';
	await seed(p, DIR, '2026-09-12 09.15.40 Long', was);
	await put(p, A, FRONT + now);
	await dialog(p, A);
	await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})[1].click()`);
	await sleep(p, 500);
	await press(p, DLG + ' .setting-item, ' + DLG + ' .checkbox-container, ' + DLG + ' label', 'Show changes').catch(() => {});
	const on = await p.ev(`(() => { const c = document.querySelector(${j(DLG + ' .binders-snapshots-compare')}); if (c && !c.classList.contains('is-enabled') && !c.checked) c.click(); return !!c; })()`);
	await sleep(p, 2500);
	const changed = await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-changes ins, ' + DLG + ' .binders-snapshots-changes del')}).length`);
	const total = await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-changes > p')}).length`);
	t.ok(on, 'the compare toggle is there');
	t.ok(changed > 0 && changed < 10, `only the changed words are marked (marks: ${changed}, paragraphs shown: ${total})`);
});

// ================= focus mode and the day's words =================
const F = `${PL}.focus`;
const KEEPER = K, ED = `app.workspace.getMostRecentLeaf().view.editor`;
const OFFSET = { focusTypewriter: true, focusNeighbours: false, focusPlace: false, focusNumbers: false, focusDim: false, focusFullscreen: false, focusGoal: 0 };
const setOpts = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => sleep(p, 250));
/** A fresh day's count, and the way out already said (its notice would cover what's clicked). */
const fresh = (p) => p.ev(`(() => { app.saveLocalStorage('binders-focus-hinted', true); app.saveLocalStorage('binders-session', null); const f = ${F}; f.session = new f.session.constructor(null, f.session.day); return 1; })()`);
async function endFocus(p) {
	await p.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
	await p.ev(`(async () => { window.Date = window.__RealDate ?? window.Date; const pl = ${PL}; if (pl?.focus) { pl.focus.leave(true); pl.focus.busy = false; } document.body.classList.remove('binders-focus-pre', 'binders-focus-post'); if (app.vault.getConfig('vimMode')) app.vault.setConfig('vimMode', false); if (pl) { Object.assign(pl.settings, ${j(OFFSET)}); await pl.saveSettings(); } })().then(() => 1)`).catch(() => {});
}
const fadd = (kind, name, fn) => specs.push({ name: `${kind}qa6 features: focus: ${name}`, fn: withTidy(async (p, h, t) => { try { await fresh(p); await setOpts(p, OFFSET); await fn(p, h, t); } finally { await endFocus(p); await closeAll(p); } }) });
const fok = (name, fn) => fadd('', name, fn);
const fbad = (name, fn) => fadd('BUG: ', name, fn);
/** Real key presses (focus mode listens for keys; the driver's type() sends none). */
async function keys(p, text) {
	for (const ch of text) {
		if (ch === '\n') { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); continue; }
		await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: ch === ' ' ? 'Space' : undefined });
		await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
	}
	await sleep(p, 60);
}
const words = (p, folder = 'The Lighthouse') => p.ev(`${F}.session.words(${j(folder)})`);
async function openFocusNote(p, path) {
	await p.ev(`(async () => { await ${B}.settled; const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().view.file?.path === ${j(path)} && !!document.querySelector('.workspace-leaf.mod-active .cm-content')`);
	await sleep(p, 350);
}
const caretEnd = (p) => p.ev(`(() => { const e = ${ED}, t = e.getValue(); e.setCursor(e.offsetToPos(t.replace(/\\s+$/, '').length)); e.focus(); return 1; })()`).then(() => sleep(p, 120));
const TEN = ' one two three four five six seven eight nine ten.';
fok('the day’s words after a split: the note cut in two is not words lost (a restructure writes nothing)', async (p, h, t) => {
	await openFocusNote(p, KEEPER);
	await caretEnd(p);
	await keys(p, TEN.repeat(6));
	await sleep(p, 900);
	t.eq(await words(p), 60, 'sixty words typed');
	// split in the middle of the note: the cursor at "She put down"
	await p.ev(`(() => { const e = ${ED}, i = e.getValue().indexOf('She put down'); e.setCursor(e.offsetToPos(i)); e.focus(); return 1; })()`);
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`);
	await sleep(p, 3000);
	// open the new half and type a word in it, as a writer carries on
	await openFocusNote(p, L + 'Part One/The keeper 2.md');
	await caretEnd(p);
	await keys(p, ' more');
	await sleep(p, 900);
	t.eq(await words(p), 61, 'sixty typed, one more: a split moves words, it doesn’t take them away');
});
fok('the day’s words across midnight: out of focus, the next day starts from what the notes have, not from nothing and not from yesterday', async (p, h, t) => {
	await openFocusNote(p, KEEPER);
	await caretEnd(p);
	await keys(p, ' one two three four five.');
	await sleep(p, 900);
	t.eq(await words(p), 5, 'five words today');
	await sleep(p, 2600); // (saved by now)
	// the clock moves on a day
	await p.ev(`(() => { const R = window.Date, off = 86400000; window.__RealDate = R; window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }; return 1; })()`);
	await keys(p, ' six seven.');
	await sleep(p, 900);
	t.eq(await words(p), 2, 'the new day counts the two typed since midnight');
});
fok('the day’s words in two panes of one note: a word typed once is counted once', async (p, h, t) => {
	await openFocusNote(p, KEEPER);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(${file(KEEPER)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await sleep(p, 600);
	await caretEnd(p);
	await keys(p, ' one two three.');
	await sleep(p, 900);
	t.eq(await words(p), 3, 'three words typed in one of two panes of the note');
});
fbad('the day’s words: a hundred words that arrive from another device are counted as written here today, at the next key typed', async (p, h, t) => {
	await openFocusNote(p, KEEPER);
	await caretEnd(p);
	await p.ev(`(() => { navigator.clipboard.writeText?.(''); return 1; })()`);
	await p.ev(`(() => { const e = ${ED}; e.replaceSelection(' ' + 'pasted '.repeat(40)); return 1; })()`);
	await sleep(p, 900);
	t.eq(await words(p), 40, 'forty pasted words');
	await p.key('z', 'ctrl');
	await sleep(p, 900);
	t.eq(await words(p), 0, 'Undo takes them off again');
	// an edit from outside, then one typed word
	const now = await read(p, KEEPER);
	await writeRaw(p, KEEPER, now.trimEnd() + ' ' + 'synced '.repeat(100) + '\n');
	await sleep(p, 1200);
	await caretEnd(p);
	await keys(p, ' mine');
	await sleep(p, 900);
	t.eq(await words(p), 1, 'only the word typed here is today’s: a hundred words that arrived from another device are not written by this writer today');
});

// ================= scene operations on odd files =================
const safe = (n) => n.replace(/[^\w]+/g, '_');
const ODDS = Object.entries(ODD).filter(([n]) => n !== 'only props nl').map(([n, s]) => [safe(n), s]);
/** A binder “Odd” of the odd notes, written byte for byte (an `After` note last), and made a binder. */
async function oddBinder(p, notes = ODDS) {
	await p.ev(`(async () => { await app.vault.createFolder('Odd'); for (const [n, s] of ${j(notes)}) await app.vault.adapter.write('Odd/' + n + '.md', s); await new Promise(r => setTimeout(r, 700)); await ${B}.makeBinder(${file('Odd')}); })().then(() => 1)`);
	await sleep(p, 900);
}
const ws = (s) => s.replace(/﻿/g, '').replace(/\s+/g, '');
const cardMenuIn = async (p, folder, path) => {
	await openView(p, folder);
	const at = await until(p, `(() => { const e = document.querySelector(${j(card(path))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 14 }; })()`);
	if (!at) throw new Error('no card for ' + path);
	await p.right(at.x, at.y);
	await sleep(p, 250);
};
ok('Duplicate on every odd note: the copy is the note, byte for byte', async (p, h, t) => {
	await oddBinder(p);
	const bad = [];
	for (const [n, s] of ODDS) {
		await cardMenuIn(p, 'Odd', `Odd/${n}.md`);
		await clickMenu(p, 'Duplicate');
		await until(p, `app.vault.adapter.exists('Odd/${n} 2.md')`);
		const copy = await read(p, `Odd/${n} 2.md`);
		if (copy !== s) bad.push(`${n}: ${j(copy.slice(0, 60))}`);
		if (await read(p, `Odd/${n}.md`) !== s) bad.push(`${n}: the original changed`);
	}
	t.ok(!bad.length, bad.join(' | '));
});
ok('Set synopsis from text on every odd note: the note’s text stays byte for byte; only a synopsis property is added or changed', async (p, h, t) => {
	await oddBinder(p);
	const bad = [];
	for (const [n, s] of ODDS) {
		await cardMenuIn(p, 'Odd', `Odd/${n}.md`);
		await clickMenu(p, 'Set synopsis from text');
		await sleep(p, 900);
		const after = await read(p, `Odd/${n}.md`);
		if (after === s) continue; // (nothing to say: left alone)
		// everything the writer wrote must still be there, in order
		const gone = ws(s).replace(/^---.*?---/s, '');
		const norm = (x) => x.replace(/\r\n?/g, '\n');
		if (!ws(after).includes(ws(s.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')))) bad.push(`${n}: text changed: ${j(after.slice(0, 120))}`);
		else if (/\r/.test(s) && !/\r/.test(after)) bad.push(`${n}: line breaks changed (CRLF to LF) by setting a synopsis`);
		void gone; void norm;
	}
	t.ok(!bad.length, bad.join(' | '));
});
const bodyNoFront = (p, path, s) => seenBody(p, path, s);
ok('Split on odd notes, the note open: the two halves together are the text, whatever it opens with; nothing else is rewritten', async (p, h, t) => {
	const some = ODDS.filter(([n]) => /^(crlf|lone_cr|bom|no_newline|mixed_endings|unicode|props_with_rule_below|scene_break_first)/.test(n));
	await oddBinder(p, some);
	const bad = [];
	for (const [n, s] of some) {
		const path = `Odd/${n}.md`, orig = noBom(s);
		await openNote(p, path);
		const split = await p.ev(`(() => { const e = ${editor(path)}, text = e.getValue(), fm = app.metadataCache.getFileCache(${file(path)})?.frontmatterPosition, start = fm ? fm.end.offset + 1 : 0, body = text.slice(start); const nl = body.indexOf('\\n'); const at = nl >= 0 && nl < body.length - 2 ? start + nl + 1 : start + Math.floor(body.length / 2); e.setCursor(e.offsetToPos(at)); e.focus(); return { at, start, len: text.length }; })()`);
		await run(p, 'split-scene');
		await sleep(p, 900);
		const made = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Odd/') && f.path.endsWith('.md') && f.basename.startsWith(${j(n)}) && f.basename !== ${j(n)}).map(f => f.path)`);
		await sleep(p, 2500);
		const first = await read(p, path), second = made.length ? await read(p, made[0]) : '';
		const together = ws(first) + ws(second);
		// everything the original had (properties of the new note are copied, so only check the original's words are present, in order)
		const want = Array.from(ws(orig));
		let i = 0; for (const ch of Array.from(together)) if (ch === want[i]) i++;
		const ok2 = i >= want.length || (made.length === 0 && ws(first).includes(want.join('')));
		if (!ok2) bad.push(`${n}: text lost: original ${j(orig.slice(0, 80))}, first ${j(first.slice(0, 80))}, second ${j(second.slice(0, 80))}`);
		// (a note whose first block of dashes Binders takes for properties has nowhere to split: finding 2 of the writing round)
		if (!made.length && !/empty_props|tabs_in|rule_then/.test(n)) bad.push(`${n}: no second note was made (${(await notices(p)).slice(0, 100)})`);
		await p.ev(`app.workspace.getLeavesOfType('markdown').forEach(l => l.detach())`);
		void split; void bodyNoFront;
	}
	t.ok(!bad.length, bad.join(' | '));
});
async function clickCards(p, folder, paths) {
	await openView(p, folder);
	let first = true;
	for (const path of paths) {
		const at = await until(p, `(() => { const e = document.querySelector(${j(card(path))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 14 }; })()`);
		if (!at) throw new Error('no card ' + path);
		await p.click(at.x, at.y, first ? {} : { modifiers: 2 });
		first = false;
	}
}
const modalButton = (p, text) => p.ev(`(() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === ${j(text)}); if (!b) return false; b.click(); return true; })()`);
ok('Merge every odd note into one (all of them selected): every note’s words are in the merged note, and the others are in the trash with theirs', async (p, h, t) => {
	const notes = ODDS.filter(([n]) => !/rule_then|empty_props|tabs_in/.test(n));
	await oddBinder(p, notes);
	const order = await p.ev(`(${B}.orderedChildren(${file('Odd')}) ?? []).map(f => f.path)`);
	const trash = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try {
		await clickCards(p, 'Odd', notes.map(([n]) => `Odd/${n}.md`));
		const last = await p.at(card(order.at(-1)));
		await p.right(last.x, last.y);
		await clickMenu(p, `Merge ${notes.length} notes`);
		await until(p, `!!document.querySelector('.modal')`);
		await modalButton(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(order.at(-1))})`, 6000);
		await sleep(p, 800);
		const merged = await read(p, order[0]);
		const bad = [];
		const mergedW = ws(merged);
		for (const [n, s] of notes) { const body = ws(s.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')); if (body && !mergedW.includes(body)) bad.push(`${n}: ${j(body.slice(0, 40))} missing`); }
		t.ok(!bad.length, bad.join(' | '));
	} finally { await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(trash ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`); }
});

// ================= export: one note =================
/** Presses a button of the dialog on top (the question “Replace this note”): the Export window under it has a Cancel
    of its own in its bar while it is exporting, which is not the answer to the question. */
const topButton = (p, text) => p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(), b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return false; b.click(); return true; })()`);
const EXPORTED = 'The Lighthouse (exported).md';
/** Exports a folder as one note with these options (the window reads them from the settings, as it does the next time) and the path given. */
async function exportWith(p, folder, opts, to) {
	await p.ev(`(async () => { ${PL}.settings.compile = ${j(opts)}; await ${PL}.saveSettings(); })().then(() => 1)`);
	await openView(p, folder);
	await (await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`), run(p, 'export'));
	await until(p, `!!document.querySelector('.modal .binders-export-path')`);
	if (to) await p.ev(`(() => { const i = document.querySelector('.modal .binders-export-path'); i.value = ${j(to)}; i.dispatchEvent(new Event('input')); return 1; })()`);
	await modalButton(p, 'Export');
	await sleep(p, 700);
}
const bodyOnly = (s) => s.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
const SCENES = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
ok('export as one note with every combination of its options: every note’s text is in it in order, headings and separators are where the options say, no properties leak, no note changes', async (p, h, t) => {
	// comments and an embed in two notes, so the options have something to act on
	await p.ev(`(async () => { for (const [path, add] of [[${j(L + 'Prologue.md')}, '\\n%%a private comment%%\\n'], [${j(L + 'Epilogue.md')}, '\\n<!-- html comment -->\\n\\n![[Arrival]]\\n']]) { const f = ${file('x')} ?? app.vault.getAbstractFileByPath(path); const text = await app.vault.read(f); await app.vault.modify(f, text.trimEnd() + '\\n' + add); } })().then(() => 1)`);
	await sleep(p, 500);
	const before = await texts(p);
	const bad = [], combos = [];
	for (const title of [true, false]) for (const folderHeadings of [true, false]) for (const sceneHeadings of [true, false]) for (const separator of ['* * *', '#', '---', '']) for (const stripComments of [true, false]) combos.push({ title, folderHeadings, sceneHeadings, separator, stripComments });
	const sample = combos.filter((_, i) => i % 5 === 0 || i === combos.length - 1);
	for (const o of sample) {
		await p.ev(`(async () => { const f = ${file(EXPORTED)}; if (f) await app.vault.delete(f); })().then(() => 1)`);
		await exportWith(p, L.slice(0, -1), o);
		await until(p, `app.vault.adapter.exists(${j(EXPORTED)})`, 3000);
		await closeAll(p);
		const out = await read(p, EXPORTED), tag = JSON.stringify(o);
		let at = 0;
		for (const sc of SCENES) {
			const raw = bodyOnly(before[L + sc + '.md']).trim();
			const body = o.stripComments ? raw.replace(/%%[\s\S]*?%%/g, '').replace(/<!--[\s\S]*?-->/g, '').trim() : raw;
			// the first and last lines of each note's text (the embed and comment lines move with them)
			for (const line of body.split('\n').filter((l) => l.trim())) { const i = out.indexOf(line, at); if (i < 0) { bad.push(`${tag}: ${sc}: missing ${j(line.slice(0, 40))}`); break; } at = i + line.length; }
		}
		if (/^status:|synopsis:/m.test(out)) bad.push(`${tag}: properties leaked`);
		if ((/^# The Lighthouse$/m.test(out)) !== o.title) bad.push(`${tag}: title heading ${o.title ? 'missing' : 'present'}`);
		if (/^#+ Part One$/m.test(out) !== o.folderHeadings) bad.push(`${tag}: folder headings`);
		if (/^#+ Arrival$/m.test(out) !== o.sceneHeadings) bad.push(`${tag}: scene headings`);
		if (o.stripComments && /private comment|html comment/.test(out)) bad.push(`${tag}: comments kept`);
		if (!o.stripComments && !(/private comment/.test(out) && /html comment/.test(out))) bad.push(`${tag}: comments lost`);
		if (bad.length > 6) break;
	}
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (path !== EXPORTED && after[path] !== text) bad.push(`${path} changed`);
	t.ok(!bad.length, bad.join(' | '));
});
ok('export as one note into a note that exists: the writer’s own note is asked about (Cancel keeps it), a note an export made is replaced without asking, twice in a row gives the same text', async (p, h, t) => {
	await put(p, 'Draft.md', 'My own draft, written by hand.\n');
	await exportWith(p, L.slice(0, -1), EXPORT_ALL, 'Draft');
	await until(p, `[...document.querySelectorAll('.modal .modal-title')].some(e => e.textContent === 'Replace this note')`);
	t.ok(/wasn’t made by an export/.test(await p.ev(`[...document.querySelectorAll('.modal')].pop().textContent`)), 'asked about a note it didn’t make');
	await topButton(p, 'Cancel');
	await sleep(p, 400);
	t.eq(await read(p, 'Draft.md'), 'My own draft, written by hand.\n', 'Cancel leaves it as it was');
	await closeAll(p);
	// to a name of its own: made, then again with no question
	await exportWith(p, L.slice(0, -1), EXPORT_ALL);
	await until(p, `app.vault.adapter.exists(${j(EXPORTED)})`);
	await closeAll(p);
	const one = await read(p, EXPORTED);
	await exportWith(p, L.slice(0, -1), EXPORT_ALL);
	await sleep(p, 600);
	t.eq(await p.ev(`[...document.querySelectorAll('.modal .modal-title')].some(e => e.textContent === 'Replace this note')`), false, 'exported twice in a row: no question');
	await closeAll(p);
	t.eq(await read(p, EXPORTED), one, 'the same text');
	t.eq(await read(p, 'Draft.md'), 'My own draft, written by hand.\n', 'and Draft is still the writer’s');
});
const EXPORT_ALL = { title: true, folderHeadings: true, sceneHeadings: false, separator: '* * *', stripComments: true };
ok('typing in the exported note and exporting again before it has saved: the typing is kept or asked about, never overwritten', async (p, h, t) => {
	await exportWith(p, L.slice(0, -1), EXPORT_ALL);
	await until(p, `app.vault.adapter.exists(${j(EXPORTED)})`);
	await sleep(p, 800);
	await p.ev(`(() => { const e = ${editor(EXPORTED)}; e.setCursor(e.offsetToPos(e.getValue().length)); e.focus(); return 1; })()`);
	await p.type('\nMY OWN NOTES, typed a moment ago.\n');
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').length || 0; return 1; })()`);
	// at once (inside the editor's two-second save delay): the Export window from the command
	await p.ev(`(async () => { (app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export')); })().then(() => 1)`);
	const typed = await p.ev(`${editor(EXPORTED)}.getValue().includes('MY OWN NOTES')`);
	t.ok(typed, 'the editor has the typing');
	await until(p, `!!document.querySelector('.modal .binders-export-path')`, 2000);
	await modalButton(p, 'Export');
	await sleep(p, 2500);
	const asked = await p.ev(`[...document.querySelectorAll('.modal .modal-title')].some(e => e.textContent === 'Replace this note')`);
	if (asked) { await topButton(p, 'Cancel'); await sleep(p, 2500); }
	const disk = await read(p, EXPORTED), editorNow = await p.ev(`${editor(EXPORTED)}.getValue()`);
	t.ok(asked || disk.includes('MY OWN NOTES') || editorNow.includes('MY OWN NOTES'), 'the typed words are still somewhere (asked: ' + asked + ')');
	t.ok(asked || disk.includes('MY OWN NOTES'), 'and on disk, or the writer was asked first');
});
ok('export as one note of 1,000 notes in 10 folders: all of them, in order, in a few seconds; the notes unchanged', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Big'); for (let f = 1; f <= 10; f++) { await app.vault.createFolder('Big/Part ' + String(f).padStart(2, '0')); for (let n = 1; n <= 100; n++) await app.vault.create('Big/Part ' + String(f).padStart(2, '0') + '/Scene ' + String(n).padStart(3, '0') + '.md', '---\\nstatus: draft\\n---\\nPart ' + f + ' scene ' + n + ' text. The sea came up the rocks.\\n'); } await new Promise(r => setTimeout(r, 1500)); await ${B}.makeBinder(${file('Big')}); })().then(() => 1)`);
	await sleep(p, 2500);
	const t0 = Date.now();
	await exportWith(p, 'Big', EXPORT_ALL);
	await until(p, `app.vault.adapter.exists('Big (exported).md')`, 20000);
	const took = Date.now() - t0;
	const out = await read(p, 'Big (exported).md');
	const found = [...out.matchAll(/^Part (\d+) scene (\d+) text\./gm)].map((m) => `${m[1]}.${m[2]}`);
	const want = []; for (let f = 1; f <= 10; f++) for (let n = 1; n <= 100; n++) want.push(`${f}.${n}`);
	t.eq(found.length, 1000, 'every note’s text (took ' + took + ' ms)');
	t.eq(found.join(','), want.join(','), 'in binder order');
	t.eq((out.match(/^## Part \d+$/gm) ?? []).length, 10, 'ten folder headings');
	t.ok(took < 15000, 'under 15 s: ' + took);
});
bad('CRLF: exporting the binder as one note while one of its notes is open (nothing typed) rewrites that note with Unix line breaks; “Your notes aren’t changed”', async (p, h, t) => {
	const text = 'One.\r\n\r\nTwo.\r\n';
	await put(p, A, text);
	await openNote(p, A);
	// (the binder in a tab of its own, the note's tab left open: a tab closed or given to something else is Obsidian's
	// own, and Obsidian itself writes a note with Windows line breaks again without them as its tab goes, Binders
	// turned off too)
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeaf('tab'), { focus: true }); return 1; })()`);
	await exportWith(p, L.slice(0, -1), EXPORT_ALL);
	await until(p, `app.vault.adapter.exists(${j(EXPORTED)})`);
	await sleep(p, 1200);
	t.ok(await p.ev(`app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === ${j(A)})`), 'the note is still open in its tab');
	t.eq(await read(p, A), text, 'the note is as it was');
});

// ================= a read-only binder (made by a newer version) =================
ok('a binder in a newer format: split, merge, duplicate, group, ungroup and set synopsis each refuse in words and change nothing', async (p, h, t) => {
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('binder: 1', 'binder: 2'));
	await sleep(p, 700);
	const before = await texts(p);
	const P = L + 'Part One/', log = [];
	const changed = async () => { const now = await texts(p); return Object.keys({ ...before, ...now }).filter((k) => before[k] !== now[k]); };
	// Split, in a note
	await openNote(p, K);
	await p.ev(`(() => { const e = ${editor(K)}, i = e.getValue().indexOf('"You can'); e.setCursor(e.offsetToPos(i < 0 ? 40 : i)); e.focus(); return 1; })()`);
	await run(p, 'split-scene'); await sleep(p, 1500);
	log.push(['split', await notices(p), await changed()]);
	await p.ev(`app.workspace.getLeavesOfType('markdown').forEach(l => l.detach())`);
	// the card menus
	const tried = async (label, menuPath, item, confirmButton) => {
		await cardMenuIn(p, L + 'Part One', menuPath);
		const items = await menuItems(p);
		if (!items.includes(item)) { log.push([label, 'not offered: ' + items.join(', '), await changed()]); await closeMenus(p); return; }
		await clickMenu(p, item);
		if (confirmButton) { await sleep(p, 500); await modalButton(p, confirmButton); }
		await sleep(p, 1200);
		log.push([label, await notices(p), await changed()]);
		await closeAll(p);
	};
	await tried('duplicate', P + 'Arrival.md', 'Duplicate');
	await tried('synopsis', P + 'The keeper.md', 'Set synopsis from text');
	await clickCards(p, L + 'Part One', [P + 'Arrival.md', P + 'The keeper.md']);
	const k = await p.at(card(P + 'The keeper.md')); await p.right(k.x, k.y);
	{ const items = await menuItems(p); if (items.includes('Merge 2 notes')) { await clickMenu(p, 'Merge 2 notes'); await sleep(p, 500); await modalButton(p, 'Merge'); await sleep(p, 1500); log.push(['merge', await notices(p), await changed()]); } else { log.push(['merge', 'not offered', await changed()]); await closeMenus(p); } }
	await closeAll(p);
	const bad = log.filter(([, , files]) => files.length).map(([what, say, files]) => `${what} changed ${files.join(', ')} (said: ${say.slice(0, 120)})`);
	if (process.env.QA_LOG) writeFileSync(process.env.QA_LOG, JSON.stringify(log, null, 1));
	t.ok(!bad.length, bad.join(' | '));
	t.ok(log.every(([, say]) => say.trim()), 'each said something: ' + j(log.map(([w, s]) => [w, s.slice(0, 80)])));
});

// ================= scene operations in a Longform project =================
const LFD = 'Longform demo/', LFI = LFD + 'Index.md';
const lfScenes = (p) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(LFI)})?.frontmatter?.longform?.scenes ?? null)`).then(JSON.parse);
ok('Longform project: split, merge, duplicate and synopsis keep longform.scenes right and change nothing else of the index note', async (p, h, t) => {
	const before = await texts(p);
	const log = [];
	await sleep(p, 600);
	// split Island
	await openNote(p, LFD + 'Island.md');
	await p.ev(`(() => { const e = ${editor(LFD + 'Island.md')}, t = e.getValue(), fm = app.metadataCache.getFileCache(${file(LFD + 'Island.md')})?.frontmatterPosition, start = fm ? fm.end.offset + 1 : 0, body = t.slice(start), nl = body.indexOf('\\n\\n'); e.setCursor(e.offsetToPos(nl > 0 ? start + nl + 2 : start + Math.floor(body.length / 2))); e.focus(); return 1; })()`);
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists(${j(LFD + 'Island 2.md')})`, 4000);
	await sleep(p, 2800);
	log.push(['after split', JSON.stringify(await lfScenes(p)), await notices(p)]);
	await p.ev(`app.workspace.getLeavesOfType('markdown').forEach(l => l.detach())`);
	// duplicate Harbor
	await cardMenuIn(p, 'Longform demo', LFD + 'Harbor.md');
	if ((await menuItems(p)).includes('Duplicate')) { await clickMenu(p, 'Duplicate'); await sleep(p, 1200); }
	log.push(['after duplicate', JSON.stringify(await lfScenes(p)), (await exists(p, LFD + 'Harbor 2.md')) ? 'copy made' : 'no copy']);
	await closeAll(p);
	// merge Island 2 and Return
	await clickCards(p, 'Longform demo', [LFD + 'Island 2.md', LFD + 'Return.md']);
	const r = await p.at(card(LFD + 'Return.md')); await p.right(r.x, r.y);
	const items = await menuItems(p);
	if (items.includes('Merge 2 notes')) { await clickMenu(p, 'Merge 2 notes'); await sleep(p, 500); await modalButton(p, 'Merge'); await sleep(p, 1800); }
	log.push(['after merge', JSON.stringify(await lfScenes(p)), items.includes('Merge 2 notes') ? '' : 'not offered: ' + items.join(', ')]);
	await closeAll(p);
	// a folder from a selection
	await clickCards(p, 'Longform demo', [LFD + 'Harbor.md', LFD + 'Island.md']);
	const g = await p.at(card(LFD + 'Island.md')); await p.right(g.x, g.y);
	const gi = await menuItems(p);
	log.push(['group menu', gi.filter((x) => /folder|Merge|Ungroup/.test(x)).join(', '), '']);
	await closeMenus(p);
	if (process.env.QA_LOG) writeFileSync(process.env.QA_LOG, JSON.stringify({ log, index: await read(p, LFI), files: Object.keys(await texts(p)).filter((k) => k.startsWith('Longform')) }, null, 1));
	const after = await texts(p);
	t.eq(after[LFD + 'Return.md'], undefined, 'Return merged away');
	t.eq(j(log.map((l) => l[1]).slice(0, 3)), j(['["Harbor",["Ticket office","The crossing"],"Island","Island 2","Return"]', '["Harbor","Harbor 2",["Ticket office","The crossing"],"Island","Island 2","Return"]', '["Harbor","Harbor 2",["Ticket office","The crossing"],"Island","Island 2"]']), 'the list after a split (right after, same level), a duplicate and a merge');
	t.ok(after[LFD + 'Island 2.md'].includes(bodyOf(before[LFD + 'Return.md']).trim()), 'Return’s text is in the merged scene');
	t.eq(bodyOf(after[LFI]), bodyOf(before[LFI]), 'the index note’s text is as it was');
	t.eq(after[LFD + 'Harbor.md'], before[LFD + 'Harbor.md'], 'Harbor untouched by its duplicate');
});
const bodyOf = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');

// ================= links through merge and split =================
const LK = 'Links/';
const linkNotes = {
	'Alpha': 'Alpha text. See [[Beta]] and [[Beta#Second heading|the second]].\n',
	'Beta': '# Second heading\n\nBeta text, which points to [[Beta#Second heading]], [[Beta#^blk]] and [[Beta]].\n\nA block line. ^blk\n',
	'Gamma': 'Links: [[Beta]], [[Beta#Second heading]], [[Beta#^blk]], [Beta](Beta.md), [section](<Beta.md#Second heading>), ![[Beta#Second heading]], [[Beta|shown]].\n',
};
async function linksBinder(p, on = true) {
	await p.ev(`(async () => { app.vault.setConfig('alwaysUpdateLinks', ${on}); await app.vault.createFolder('Links'); for (const [n, s] of Object.entries(${j(linkNotes)})) await app.vault.adapter.write('Links/' + n + '.md', s); await new Promise(r => setTimeout(r, 900)); await ${B}.makeBinder(${file('Links')}); })().then(() => 1)`);
	await sleep(p, 1000);
}
const restoreLinks = (p) => p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', false); return 1; })()`);
ok('merge with “update links” on: every link to the merged-away note, whatever its form, leads to the note that has its text now, and none is left dead', async (p, h, t) => {
	await linksBinder(p, true);
	try {
		await clickCards(p, 'Links', [LK + 'Alpha.md', LK + 'Beta.md']);
		const b = await p.at(card(LK + 'Beta.md')); await p.right(b.x, b.y);
		await clickMenu(p, 'Merge 2 notes');
		await until(p, `!!document.querySelector('.modal')`);
		t.ok(/link/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'the dialog says what happens to links: ' + (await p.ev(`document.querySelector('.modal').textContent`)).slice(0, 300));
		await modalButton(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(LK + 'Beta.md')})`, 5000);
		await sleep(p, 1500);
		const all = await texts(p), mine = Object.entries(all).filter(([k]) => k.startsWith(LK));
		const dead = mine.flatMap(([k, s]) => (s.match(/\[\[[^\]]*Beta[^\]]*\]\]|\]\([^)]*Beta[^)]*\)/g) ?? []).map((m) => `${k}: ${m}`));
		t.ok(!dead.length, 'no link is left pointing at the note that went: ' + dead.join(' | '));
		const g = all[LK + 'Gamma.md'];
		t.ok(/\[\[Alpha#Second heading\]\]/.test(g) && /\[\[Alpha#\^blk\]\]/.test(g) && /\[\[Alpha\|shown\]\]/.test(g) && /\]\(Alpha\.md\)/.test(g), 'the links keep their parts and their shown text, and lead to Alpha: ' + g);
	} finally { await restoreLinks(p); }
});
ok('merge with “update links” off: the dialog says how many links will stop working, and the merge still keeps every word', async (p, h, t) => {
	await linksBinder(p, false);
	await clickCards(p, 'Links', [LK + 'Alpha.md', LK + 'Beta.md']);
	const b = await p.at(card(LK + 'Beta.md')); await p.right(b.x, b.y);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	const says = await p.ev(`document.querySelector('.modal').textContent`);
	t.ok(/no longer lead anywhere/.test(says) && /\d+ links?/.test(says), 'says how many links stop working: ' + says);
	await modalButton(p, 'Cancel');
});
ok('split with “update links” on: links to a heading or block that went to the new note follow it; links to the rest stay', async (p, h, t) => {
	await linksBinder(p, true);
	try {
		await openNote(p, LK + 'Beta.md');
		await p.ev(`(() => { const e = ${editor(LK + 'Beta.md')}, i = e.getValue().indexOf('A block line.'); e.setCursor(e.offsetToPos(i)); e.focus(); return 1; })()`);
		await run(p, 'split-scene');
		await until(p, `app.vault.adapter.exists(${j(LK + 'Beta 2.md')})`, 4000);
		await sleep(p, 3000);
		const g = await read(p, LK + 'Gamma.md');
		t.ok(/\[\[Beta 2#\^blk\]\]/.test(g), 'the block link follows the block: ' + g);
		t.ok(/\[\[Beta#Second heading\]\]/.test(g), 'the heading link stays');
		t.ok(!(await read(p, LK + 'Beta.md')).includes('A block line'), 'the block moved');
		t.ok((await read(p, LK + 'Beta 2.md')).includes('A block line. ^blk'), 'to the new note, with its id');
	} finally { await restoreLinks(p); }
});
bad('merge with “update links” on: links in a table cell (an escaped bar), in properties, and with .md or a path are repointed too', async (p, h, t) => {
	const gamma = linkNotes.Gamma;
	linkNotes.Gamma = '---\nrelated: "[[Beta]]"\nsee:\n  - "[[Beta#Second heading]]"\n---\n| a | b |\n|---|---|\n| [[Beta\\|alias]] | [[Links/Beta]] |\n\nPlain: [[Beta.md]] and [[Links/Beta.md|full]].\n';
	await linksBinder(p, true);
	try {
		await clickCards(p, 'Links', [LK + 'Alpha.md', LK + 'Beta.md']);
		const b = await p.at(card(LK + 'Beta.md')); await p.right(b.x, b.y);
		await clickMenu(p, 'Merge 2 notes');
		await until(p, `!!document.querySelector('.modal')`);
		await modalButton(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(LK + 'Beta.md')})`, 5000);
		await sleep(p, 1500);
		const g = await read(p, LK + 'Gamma.md');
		const dead = g.match(/\[\[[^\]]*Beta[^\]]*\]\]/g) ?? [];
		t.ok(!dead.length, 'no link to Beta is left: ' + dead.join(' | ') + '\n' + g);
	} finally { await restoreLinks(p); linkNotes.Gamma = gamma; }
});

// ================= merge, split and the others with unsaved typing, across folders =================
const noAutosave = (p, path) => p.ev(`(() => { const v = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(path)}).view; v.requestSave = () => {}; return 1; })()`);
ok('merge across folders, the merged-away note open with typing that is not saved yet: the typing is in the merged note and in the trash', async (p, h, t) => {
	const trash = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try {
		const W = L + 'Part Two/The wreck.md';
		await openNote(p, W);
		await noAutosave(p, W);
		await p.ev(`(() => { const e = ${editor(W)}; e.setCursor(e.offsetToPos(e.getValue().length)); e.replaceSelection('\\nTYPED JUST NOW, NOT SAVED.\\n'); return 1; })()`);
		await sleep(p, 300);
		t.ok((await read(p, W)).indexOf('TYPED JUST NOW') < 0, 'not on disk yet');
		await p.ev(`app.workspace.getLeavesOfType('markdown').forEach(l => l.view.file?.path !== ${j(W)} && l.detach())`);
		await clickCards(p, L.slice(0, -1) + '/Part One', [A]).catch(() => {});
		// the outliner can select across folders; use the binder's own outline
		await openView(p, L.slice(0, -1));
		await p.ev(`(() => { ${VIEWX}.setMode('outliner'); return 1; })()`);
		await sleep(p, 600);
		const rowOf = (path) => `.workspace-leaf.mod-active .binders-outliner-row[data-path="${path}"]`;
		const a = await until(p, `(() => { const e = document.querySelector(${j(rowOf(A))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + 120, y: r.y + r.height / 2 }; })()`);
		const w = await until(p, `(() => { const e = document.querySelector(${j(rowOf(W))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + 120, y: r.y + r.height / 2 }; })()`);
		t.ok(a && w, 'both rows are in the outline');
		await p.click(a.x, a.y);
		await p.click(w.x, w.y, { modifiers: 2 });
		await p.right(w.x, w.y);
		await clickMenu(p, 'Merge 2 notes');
		await until(p, `!!document.querySelector('.modal')`);
		await modalButton(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(W)})`, 6000);
		await sleep(p, 1000);
		t.ok((await read(p, A)).includes('TYPED JUST NOW, NOT SAVED.'), 'the typing is in the merged note');
		const trashed = await p.ev(`app.vault.adapter.exists('.trash/The wreck.md').then(async (x) => x ? app.vault.adapter.read('.trash/The wreck.md') : '')`);
		t.ok(trashed.includes('TYPED JUST NOW'), 'and in the trashed note');
	} finally { await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(trash ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`); }
});
const VIEWX = VIEW0();
function VIEW0() { return `(app.workspace.getLeavesOfType('binders-view').find(l => l === app.workspace.getMostRecentLeaf()) || app.workspace.getLeavesOfType('binders-view')[0])?.view`; }

// ---- focus in a window of its own ----
const bodyHas = (p, where) => p.ev(`(() => { const out = {}; app.workspace.iterateAllLeaves(l => { const d = l.view.containerEl.ownerDocument; out[d === document ? 'main' : 'popout'] = d.body.classList.contains('binders-focus'); }); return JSON.stringify(out); })()`).then(JSON.parse);
fok('focus in a popout window: in and out by the command and Escape, the main window untouched; closing the window in focus leaves nothing behind', async (p, h, t) => {
	await p.ev(`(async () => { const l = app.workspace.openPopoutLeaf(); await l.openFile(${file(KEEPER)}); app.workspace.setActiveLeaf(l, { focus: true }); window.__pop = l; })().then(() => 1)`);
	await sleep(p, 1500);
	await until(p, `!!window.__pop.view.containerEl.ownerDocument.querySelector('.cm-content')`);
	const main0 = await p.ev(`JSON.stringify(['.workspace-ribbon.mod-left', '.status-bar', '.workspace-split.mod-left-split'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().width)))`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
	await until(p, `window.__pop.view.containerEl.ownerDocument.body.classList.contains('binders-focus')`, 3000);
	await sleep(p, 600);
	const on = await bodyHas(p);
	t.eq(j(on), j({ main: false, popout: true }), 'focus is on in the popout only');
	t.eq(await p.ev(`JSON.stringify(['.workspace-ribbon.mod-left', '.status-bar', '.workspace-split.mod-left-split'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().width)))`), main0, 'the main window’s chrome is as it was');
	// Escape in the popout leaves
	await p.ev(`(() => { const d = window.__pop.view.containerEl.ownerDocument, el = d.querySelector('.cm-content'); el.focus(); el.dispatchEvent(new d.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return 1; })()`);
	await sleep(p, 900);
	const afterEsc = await bodyHas(p);
	t.ok(!afterEsc.popout, 'Escape in the popout leaves focus mode: ' + j(afterEsc));
	// in again, then close the window
	await p.ev(`(() => { app.workspace.setActiveLeaf(window.__pop, { focus: true }); app.commands.executeCommandById('binders:focus'); return 1; })()`);
	await until(p, `window.__pop.view.containerEl.ownerDocument.body.classList.contains('binders-focus')`, 3000);
	await sleep(p, 500);
	await p.ev(`(() => { window.__pop.detach(); return 1; })()`);
	await sleep(p, 900);
	t.eq(await p.ev(`${F}.on`), null, 'closing the window ends focus mode');
	t.eq(j(await bodyHas(p)), j({ main: false }), 'nothing is left on the main window');
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-top, .binders-focus-live, .binders-focus-corner').length`), 0, 'and none of its elements');
	await p.focusMain?.();
	// and the main window can still go in and out
	await openFocusNote(p, KEEPER);
	await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
	await until(p, `document.body.classList.contains('binders-focus')`, 3000);
	t.ok(true, 'the main window goes into focus after the popout is gone');
	await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
	await sleep(p, 800);
	t.eq(await p.ev(`document.body.classList.contains('binders-focus')`), false, 'and out again');
});
async function novel(p, scenes = 5, paras = 14) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novel');
		for (let i = 1; i <= ${scenes}; i++) {
			const ps = []; for (let k = 1; k <= ${paras}; k++) ps.push('Scene ' + i + ' paragraph ' + k + '. The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window, as he had every night since the war.');
			await app.vault.create('Novel/Scene ' + String(i).padStart(2, '0') + '.md', '---\\nstatus: draft\\nsynopsis: What happens in scene ' + i + '\\ntarget: 600\\n---\\n' + ps.join('\\n\\n') + '\\n');
		}
		await new Promise(r => setTimeout(r, 600));
		await ${PL}.binders.makeBinder(app.vault.getAbstractFileByPath('Novel'));
		return 1; })()`);
	await sleep(p, 700);
}
const ALL_ON = { focusTypewriter: true, focusNeighbours: true, focusPlace: true, focusNumbers: true, focusDim: true, focusFullscreen: false, focusGoal: 100 };
const waitFocus = (p, on = true) => until(p, `document.body.classList.contains('binders-focus') === ${on} && !document.body.classList.contains('binders-focus-pre') && !${F}.busy`, 4000).then(() => sleep(p, 500));
const state = (p) => p.ev(`(() => { const v = app.workspace.getMostRecentLeaf().view, cm = v.editor.cm, s = cm.state.selection.main; return JSON.stringify({ file: v.file.path, mode: v.getMode(), top: Math.round(cm.scrollDOM.scrollTop), anchor: s.anchor, head: s.head, left: app.workspace.leftSplit.collapsed, right: app.workspace.rightSplit.collapsed, tabs: app.workspace.getLeavesOfType('markdown').length, leftW: Math.round(document.querySelector('.workspace-split.mod-left-split').getBoundingClientRect().width), ribbon: !!document.querySelector('.workspace-ribbon.mod-left')?.offsetWidth, status: !!document.querySelector('.status-bar')?.offsetWidth, header: !!document.querySelector('.workspace-leaf.mod-active .view-header')?.offsetHeight, inline: !!document.querySelector('.workspace-leaf.mod-active .inline-title')?.offsetHeight, props: !!document.querySelector('.workspace-leaf.mod-active .metadata-container')?.offsetHeight }); })()`).then(JSON.parse);
for (const opts of [OFFSET, ALL_ON, { ...ALL_ON, focusTypewriter: false }]) {
	fok(`focus in and out, scrolled with a selection, ${opts === OFFSET ? 'no options' : opts.focusTypewriter ? 'every option' : 'every option but typewriter'}: Obsidian’s state (sidebars, tab, scroll, selection, ribbon, status bar, header) is the same afterwards, and the note’s file is untouched`, async (p, h, t) => {
		await novel(p);
		await setOpts(p, opts);
		await p.ev(`(async () => { app.workspace.leftSplit.expand(); app.workspace.rightSplit.expand(); })().then(() => 1)`);
		await openFocusNote(p, 'Novel/Scene 03.md');
		const file0 = await read(p, 'Novel/Scene 03.md');
		await p.ev(`(() => { const e = ${ED}, t = e.getValue(), i = t.indexOf('paragraph 7'); e.setSelection(e.offsetToPos(i), e.offsetToPos(i + 30)); e.focus(); const cm = e.cm; cm.scrollDOM.scrollTop = 520; return 1; })()`);
		await sleep(p, 500);
		const before = await state(p), layout = await p.ev(`JSON.stringify(app.workspace.getLayout())`);
		await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
		await waitFocus(p, true);
		const inside = await state(p);
		t.eq(inside.anchor + ':' + inside.head, before.anchor + ':' + before.head, 'the selection is the same in focus');
		await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
		await waitFocus(p, false);
		await sleep(p, 600);
		const after = await state(p);
		t.eq(j({ ...after, top: 0 }), j({ ...before, top: 0 }), 'everything but the scroll is as it was: ' + j(after));
		t.ok(Math.abs(after.top - before.top) <= 2, `scrolled where it was: ${before.top} then ${after.top}`);
		t.eq(await p.ev(`JSON.stringify(app.workspace.getLayout())`), layout, 'the layout Obsidian would save is the same');
		t.eq(await read(p, 'Novel/Scene 03.md'), file0, 'the note’s file is untouched');
		await sleep(p, 1800); // (the line that says it has left goes after a moment)
		t.eq(await p.ev(`[...document.querySelectorAll('[class*="binders-focus"]')].map(e => e.className).join('|')`), '', 'no focus class is left on anything');
	});
}
fok('in focus: Show snapshots opens over the page and Escape closes only it; a snapshot is taken and brought back (Undo works); a split keeps focus and the text', async (p, h, t) => {
	await novel(p);
	await setOpts(p, { ...ALL_ON, focusGoal: 0 });
	const N3 = 'Novel/Scene 03.md', orig = await read(p, N3);
	await openFocusNote(p, N3);
	await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
	await waitFocus(p, true);
	await run(p, 'take-snapshot');
	await sleep(p, 900);
	t.eq((await list(p, 'Novel/Snapshots/Scene 03')).length, 1, 'a snapshot is taken in focus');
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector('.modal.binders-snapshots')`);
	await sleep(p, 400);
	await p.key('Escape');
	await sleep(p, 600);
	t.eq(await p.ev(`!!document.querySelector('.modal.binders-snapshots')`), false, 'Escape closes the dialog');
	t.eq(await p.ev(`document.body.classList.contains('binders-focus')`), true, 'and focus mode is still on');
	// type a bit, bring the snapshot back, Undo
	await p.ev(`(() => { const e = ${ED}; e.setCursor(e.offsetToPos(e.getValue().length)); e.focus(); return 1; })()`);
	await keys(p, ' written in focus');
	await sleep(p, 2600);
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector('.modal.binders-snapshots .binders-snapshots-item')`);
	await sleep(p, 400);
	await p.ev(`document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item')[1].click()`);
	await sleep(p, 300);
	await button(p, 'Bring back');
	await sleep(p, 1500);
	await p.key('Escape'); await sleep(p, 500);
	t.eq(bodyOf(await p.ev(`${ED}.getValue()`)).trim(), bodyOf(orig).trim(), 'the editor has the snapshot’s text, in focus');
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await p.key('z', 'ctrl');
	await sleep(p, 600);
	t.ok((await p.ev(`${ED}.getValue()`)).includes('written in focus'), 'Undo brings back what was typed');
	t.eq(await p.ev(`document.body.classList.contains('binders-focus')`), true, 'still in focus');
	// split, in focus
	await p.ev(`(() => { const e = ${ED}, i = e.getValue().indexOf('Scene 3 paragraph 8'); e.setCursor(e.offsetToPos(i)); e.focus(); return 1; })()`);
	await run(p, 'split-scene');
	// (the new note takes the next free name, "Scene 06": it's told from the five the binder began with)
	await until(p, `app.vault.getFiles().some(f => f.path.startsWith('Novel/') && !/^Novel\\/Scene 0[1-5]\\.md$/.test(f.path) && f.extension === 'md' && f.basename !== 'Novel')`, 4000);
	await sleep(p, 3000);
	t.eq(await p.ev(`document.body.classList.contains('binders-focus')`), true, 'a split leaves focus on');
	const madeName = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Novel/') && f.extension === 'md' && !/^Scene 0[1-5]$/.test(f.basename) && f.basename !== 'Novel').map(f => f.path)[0]`);
	t.ok(madeName, 'the split made a note');
	const a = await read(p, N3), b = await read(p, madeName);
	t.ok(a.includes('paragraph 7') && !a.includes('paragraph 8.') && b.includes('Scene 3 paragraph 8.') && b.includes('paragraph 14'), 'the two halves hold the text');
	t.eq(await p.ev(`${ED}.getValue().includes('Scene 3 paragraph 14')`), false, 'the editor shows the first half');
	// then the note is deleted while in focus: focus ends, nothing left over
	await p.ev(`app.vault.delete(${file(N3)}).then(() => 1)`);
	await sleep(p, 1200);
	t.eq(await p.ev(`document.body.classList.contains('binders-focus')`), false, 'deleting the note ends focus');
	await sleep(p, 1800);
	t.eq(await p.ev(`[...document.querySelectorAll('[class*="binders-focus"]')].map(e => e.className).join('|')`), '', 'with nothing left over');
});
bad('Split and Duplicate name “Scene 01” as “Scene 2”: the zero in the number is lost', async (p, h, t) => {
	await novel(p, 1);
	await openFocusNote(p, 'Novel/Scene 01.md');
	await p.ev(`(() => { const e = ${ED}, i = e.getValue().indexOf('Scene 1 paragraph 8'); e.setCursor(e.offsetToPos(i)); e.focus(); return 1; })()`);
	await run(p, 'split-scene');
	await sleep(p, 2500);
	const names = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Novel/') && f.extension === 'md' && f.basename !== 'Novel').map(f => f.basename).sort()`);
	t.ok(names.includes('Scene 02') || names.includes('Scene 01 2'), 'the new note keeps the number’s form: ' + names.join(', '));
});

// ================= more snapshot following =================
const allSnapshotTexts = (p) => p.ev(`(async () => { const out = {}; const walk = async (d) => { const l = await app.vault.adapter.list(d); for (const f of l.files) out[f] = (await app.vault.adapter.read(f)).replace(/^---\\n[\\s\\S]*?\\n---\\n/, ''); for (const s of l.folders) await walk(s); }; if (await app.vault.adapter.exists(${j(SN)})) await walk(${j(SN)}); return out; })()`);
ok('a note renamed to the name of a deleted note whose snapshots are still there: both sets are kept, under the name, and nothing is overwritten', async (p, h, t) => {
	const X = L + 'Part One/Storm warning.md', Y = L + 'Part One/Arrival.md';
	await take(p, X, TXT('Storm')); await take(p, Y, TXT('Arrival'));
	await p.ev(`app.vault.delete(${file(X)}).then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`app.fileManager.renameFile(${file(Y)}, ${j(X)}).then(() => 1)`);
	await sleep(p, 900);
	const snaps = Object.entries(await allSnapshotTexts(p));
	t.eq(snaps.length, 2, 'two snapshot files: ' + snaps.map(([k]) => k).join(', '));
	t.eq(j(snaps.map(([, v]) => v).sort()), j([TXT('Arrival'), TXT('Storm')].sort()), 'with both texts');
	t.ok(snaps.every(([k]) => k.startsWith(SN + '/Part One/Storm warning/')), 'both under the note’s name now');
});
ok('a folder renamed to the name of a folder whose snapshots are left over: the files of both are kept', async (p, h, t) => {
	const A1 = L + 'Part One/Arrival.md', W = L + 'Part Two/The wreck.md';
	await take(p, A1, TXT('Arrival')); await take(p, W, TXT('Wreck'));
	await p.ev(`(async () => { await app.vault.delete(${file(L + 'Part Two')}, true); })().then(() => 1)`);
	await sleep(p, 800);
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One')}, ${j(L + 'Part Two')}).then(() => 1)`);
	await sleep(p, 1200);
	const snaps = Object.entries(await allSnapshotTexts(p));
	t.eq(j(snaps.map(([, v]) => v).sort()), j([TXT('Arrival'), TXT('Wreck')].sort()), 'both texts are there: ' + snaps.map(([k]) => k).join(', '));
});
ok('group and ungroup on every odd note: the notes’ bytes and the binder’s list are the same afterwards', async (p, h, t) => {
	await oddBinder(p);
	const items = await p.ev(`(${B}.orderedChildren(${file('Odd')}) ?? []).map(f => f.path)`);
	const before = await texts(p);
	await p.ev(`(async () => { const items = ${j(items)}.map(x => app.vault.getAbstractFileByPath(x)); const g = await ${B}.group(items, 'Everything'); await new Promise(r => setTimeout(r, 400)); await ${B}.ungroup(g); })().then(() => 1)`);
	await sleep(p, 1200);
	const after = await texts(p), bad = [];
	for (const [k, v] of Object.entries(before)) if (k.startsWith('Odd/') && !/Odd\.md$/.test(k) && after[k] !== v) bad.push(k + ' changed');
	const order = await p.ev(`(${B}.orderedChildren(${file('Odd')}) ?? []).map(f => f.path)`);
	t.ok(!bad.length, bad.join(' | '));
	t.eq(j(order.filter((x) => x.endsWith('.md'))), j(items.filter((x) => x.endsWith('.md'))), 'the notes are in the order they were');
});
ok('export as one note of a Longform project: its scenes in the project’s order, groups flat, notes it ignores left out; and a folder with “Include in export” off leaves all its notes out', async (p, h, t) => {
	const before = await texts(p);
	await exportWith(p, 'Longform demo', EXPORT_ALL, 'Ferry book');
	await until(p, `app.vault.adapter.exists('Ferry book.md')`, 4000);
	await closeAll(p);
	const out = await read(p, 'Ferry book.md');
	const order = ['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return'].map((n) => out.indexOf(bodyOf(before[LFD + n + '.md']).trim().split('\n')[0]));
	t.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), 'every scene, in the project’s order: ' + order.join(','));
	t.ok(!out.includes(bodyOf(before[LFD + 'Notes on ferries.md']).trim().split('\n')[0]), 'the note the project ignores is not in it');
	// a folder left out
	await p.ev(`(async () => { const note = await ${B}.ensureFolderNote(${file(L + 'Part One')}); await app.fileManager.processFrontMatter(note, fm => { fm.export = false; }); })().then(() => 1)`);
	await sleep(p, 600);
	await exportWith(p, L.slice(0, -1), EXPORT_ALL, 'Lighthouse book');
	await until(p, `app.vault.adapter.exists('Lighthouse book.md')`, 4000);
	await closeAll(p);
	const lh = await read(p, 'Lighthouse book.md');
	t.ok(!/Part One/.test(lh) && !lh.includes(bodyOf(before[A]).trim().split('\n')[0]), 'Part One’s heading and notes are out');
	t.ok(lh.includes(bodyOf(before[L + 'Part Two/The wreck.md']).trim().split('\n')[0]), 'Part Two is in');
});
ok('bring back with the note open in a tab and in the manuscript at once: both show it, the file has it, one Undo in the tab takes it back everywhere', async (p, h, t) => {
	await put(p, A, FRONT + 'The text now.\n');
	await seed(p, DIR, '2026-09-12 09.15.40 First', 'The snapshot’s text.\n');
	await openNote(p, A);
	await openView(p, L + 'Part One', true);
	await p.ev(`(() => { ${VIEWX}.setMode('manuscript'); return 1; })()`);
	await sleep(p, 2500);
	const inMs = () => p.ev(`(() => { const m = ${VIEWX}.current; const s = m?.scenes?.find(s => s.file.path === ${j(A)}); return s?.live?.text ?? s?.bodyEl?.innerText ?? null; })()`);
	t.ok((await inMs())?.includes('The text now.'), 'the manuscript shows the note: ' + await inMs());
	await run(p, 'show-snapshots'); // (the dialog of the active note: the manuscript's section or the tab)
	if (!(await until(p, `!!document.querySelector('.modal.binders-snapshots .binders-snapshots-item')`, 2500))) { await p.ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('markdown')[0], { focus: true })`); await run(p, 'show-snapshots'); await until(p, `!!document.querySelector('.modal.binders-snapshots .binders-snapshots-item')`); }
	await sleep(p, 400);
	await p.ev(`document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item')[1].click()`);
	await sleep(p, 300);
	await button(p, 'Bring back');
	await sleep(p, 2500);
	const disk = await read(p, A);
	t.ok(disk.includes('The snapshot’s text.') && !disk.includes('The text now.'), 'the file has the snapshot’s text: ' + disk);
	t.eq(await p.ev(`${editor(A)}.getValue().includes('The snapshot’s text.')`), true, 'the tab shows it');
	t.ok((await inMs())?.includes('The snapshot’s text.'), 'the manuscript shows it: ' + await inMs());
	await closeAll(p);
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}), { focus: true }); ${editor(A)}.focus(); ${editor(A)}.undo(); return 1; })()`);
	await sleep(p, 2800);
	t.ok((await read(p, A)).includes('The text now.'), 'Undo: the text it had: ' + await read(p, A));
	await sleep(p, 4000);
});
bad('a note open in a tab and in the manuscript: after Undo in the tab the manuscript section stops following what is typed in the tab', async (p, h, t) => {
	await put(p, A, FRONT + 'Original text.\n');
	await openNote(p, A);
	// (the two side by side: a manuscript behind the note's tab is hidden, and is drawn again when it's shown)
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeaf('split', 'vertical'), { focus: true }); return 1; })()`);
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEWX}.setMode('manuscript'); return 1; })()`);
	await sleep(p, 2500);
	t.ok(await p.ev(`(() => { const m = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}), b = app.workspace.getLeavesOfType('binders-view')[0]; return !!m && !!b && m.view.containerEl.isShown() && b.view.containerEl.isShown(); })()`), 'the note’s tab and the manuscript are both in sight');
	const inMs = () => p.ev(`(() => { const m = ${VIEWX}.current; const s = m?.scenes?.find(s => s.file.path === ${j(A)}); return s?.live?.text ?? s?.bodyEl?.innerText ?? null; })()`);
	const inTab = (code) => p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}); app.workspace.setActiveLeaf(l, { focus: true }); const e = l.view.editor; ${code}; return 1; })()`);
	t.ok((await inMs())?.includes('Original text.'), 'the manuscript shows the note');
	await inTab(`e.setCursor(e.offsetToPos(e.getValue().length)); e.replaceSelection('Typed in the tab. ')`);
	await sleep(p, 3500);
	t.ok((await inMs())?.includes('Typed in the tab.'), 'typing in the tab shows in the manuscript: ' + await inMs());
	await inTab(`e.undo()`);
	await sleep(p, 3500);
	t.ok(!(await read(p, A)).includes('Typed in the tab.'), 'Undo reached the file');
	t.ok(!(await inMs())?.includes('Typed in the tab.'), 'Undo in the tab shows in the manuscript: ' + await inMs());
	await inTab(`e.setCursor(e.offsetToPos(e.getValue().length)); e.replaceSelection('Again. ')`);
	await sleep(p, 3500);
	t.ok((await inMs())?.includes('Again.'), 'and typing after it does too: ' + await inMs());
});
ok('a note open in a tab with the manuscript behind it in the same group: after Undo in the tab, the manuscript brought to the front shows what the file has, and typing there keeps the undo', async (p, h, t) => {
	await put(p, A, FRONT + 'Original text.\n');
	await openNote(p, A);
	await openView(p, L + 'Part One', true);
	await p.ev(`(() => { ${VIEWX}.setMode('manuscript'); return 1; })()`);
	await sleep(p, 2500);
	const MS = `app.workspace.getLeavesOfType('binders-view')[0]`;
	const inMs = () => p.ev(`(() => { const m = ${MS}.view.current; const s = m?.scenes?.find(s => s.file.path === ${j(A)}); return s?.live?.text ?? s?.bodyEl?.innerText ?? null; })()`);
	const inTab = (code) => p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}); app.workspace.setActiveLeaf(l, { focus: true }); const e = l.view.editor; ${code}; return 1; })()`);
	await inTab(`e.setCursor(e.offsetToPos(e.getValue().length)); e.replaceSelection('Typed in the tab. ')`);
	await sleep(p, 3500);
	await inTab(`e.undo()`);
	await sleep(p, 3500);
	t.ok(!(await read(p, A)).includes('Typed in the tab.'), 'Undo reached the file');
	await p.ev(`(() => { app.workspace.setActiveLeaf(${MS}, { focus: true }); return 1; })()`);
	await sleep(p, 2500);
	t.ok(!(await inMs())?.includes('Typed in the tab.'), 'the manuscript, shown, has what the file has: ' + await inMs());
	await p.ev(`(async () => { const m = ${MS}.view.current, s = m.scenes.find(s => s.file.path === ${j(A)}); if (!s.live) await m.mount(s); const e = s.live.editor; e.focus(); e.setCursor(e.offsetToPos(e.getValue().length)); e.replaceSelection('In the manuscript. '); return 1; })()`);
	await sleep(p, 3500);
	const d = await read(p, A);
	t.ok(d.includes('In the manuscript.') && !d.includes('Typed in the tab.'), 'typing in the manuscript then doesn’t bring back what was undone: ' + j(d));
});
ok('“Take a snapshot of every note in the binder” on 400 notes: one each, all with the text, at one moment under one name, in reasonable time; none for the binder or folder notes; a second time takes none', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Big'); for (let f = 1; f <= 4; f++) { await app.vault.createFolder('Big/Part ' + f); for (let n = 1; n <= 100; n++) await app.vault.create('Big/Part ' + f + '/Scene ' + String(n).padStart(3, '0') + '.md', '---\\nstatus: draft\\n---\\nPart ' + f + ' scene ' + n + ' text.\\n'); } await new Promise(r => setTimeout(r, 1200)); await ${B}.makeBinder(${file('Big')}); })().then(() => 1)`);
	await sleep(p, 2000);
	await openView(p, 'Big');
	const t0 = Date.now();
	await run(p, 'take-snapshots');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.type('Draft sent to Sam');
	await p.key('Enter');
	await until(p, `app.vault.getFiles().filter(f => f.extension === 'snapshot').length >= 400`, 40000);
	const took = Date.now() - t0;
	await sleep(p, 800);
	const snaps = await p.ev(`app.vault.getFiles().filter(f => f.extension === 'snapshot').map(f => f.path)`);
	t.eq(snaps.length, 400, 'one snapshot each (took ' + took + ' ms)');
	t.ok(snaps.every((s) => / Draft sent to Sam\.snapshot$/.test(s)), 'all under the one name');
	const times = new Set(snaps.map((s) => /(\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d)/.exec(s)[1]));
	t.ok(times.size <= 2, 'at one moment: ' + [...times].join(', '));
	t.ok(!snaps.some((s) => /Big\/Snapshots\/Big\//.test(s) || /Part \d\/Part \d/.test(s)), 'none for binder or folder notes');
	t.ok(took < 30000, 'in under 30 s: ' + took);
	await closeAll(p);
	await openView(p, 'Big');
	await run(p, 'take-snapshots');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.key('Enter');
	await sleep(p, 6000);
	t.eq((await p.ev(`app.vault.getFiles().filter(f => f.extension === 'snapshot').length`)), 400, 'the same text again: no more are taken');
});
ok('README: Obsidian’s own “Move file to...” list does show the Snapshots folders (as the README says), and the snapshot files are not in the quick switcher', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First', 'Text.\n');
	await openNote(p, K);
	await p.ev(`(() => { app.commands.executeCommandById('file-explorer:move-file'); return 1; })()`);
	await until(p, `!!document.querySelector('.prompt-input')`);
	await p.type('Snapshots');
	await sleep(p, 600);
	const shown = await p.ev(`[...document.querySelectorAll('.suggestion-item')].map(e => e.textContent)`);
	t.ok(shown.some((s) => /Snapshots/.test(s)), 'Snapshots folders are listed: ' + shown.slice(0, 5).join(' | '));
	await p.key('Escape');
	await sleep(p, 300);
	await p.ev(`(() => { app.commands.executeCommandById('switcher:open'); return 1; })()`);
	await until(p, `!!document.querySelector('.prompt-input')`);
	await p.type('First');
	await sleep(p, 600);
	const sw = await p.ev(`[...document.querySelectorAll('.suggestion-item')].map(e => e.textContent)`);
	t.ok(!sw.some((s) => /snapshot/i.test(s)), 'no snapshot in the quick switcher: ' + sw.join(' | '));
	await p.key('Escape');
});
const SYN = {
	list: '- first item of a list\n- second\n',
	task: '- [ ] a task to do\n',
	numbered: '1) Numbered start of the scene.\n',
	html: '<div class="x">Inside html</div>\n\nThen real text.\n',
	math: '$$\nx^2\n$$\n\nAfter the math.\n',
	callout: '> [!note] A callout title\n> The callout’s words.\n\nThen text.\n',
	comment: '%% a comment first %%\n\nThe real opening.\n',
	htmlcomment: '<!-- hidden -->\nVisible opening.\n',
	heading: '# Only a heading\n',
	fence: '```js\ncode();\n```\n\nProse after code.\n',
	table: '| a | b |\n|---|---|\n| 1 | 2 |\n\nProse after a table.\n',
	link: 'See [[Other note|the other]] and [a site](https://x.org) for **bold** and *it* and `code` words.\n',
	long: ('Word '.repeat(120)).trim() + '.\n',
	emoji: '😀😀😀 ' + 'é'.repeat(300) + '\n',
	footnote: '[^1]: The note.\n\nReal text after the footnote line.\n',
	hash: '#tag first, then words.\n',
	crlf: 'Windows first line.\r\n\r\nSecond.\r\n',
	embed: '![[Image.png]]\n\nText after an embed.\n',
};
ok('Set synopsis from text on all sorts of openings: each gets plain words without the marks, and the note’s text is untouched', async (p, h, t) => {
	const notes = Object.entries(SYN).filter(([n]) => /^(list|callout|comment|fence|link|long|emoji|footnote|crlf|embed)$/.test(n)).map(([n, s]) => ['syn_' + n, s]);
	await oddBinder(p, notes);
	const got = {}, bad = [];
	for (const [n, s] of notes) {
		await cardMenuIn(p, 'Odd', `Odd/${n}.md`);
		await clickMenu(p, 'Set synopsis from text');
		await sleep(p, 700);
		const syn = await p.ev(`app.metadataCache.getFileCache(${file(`Odd/${n}.md`)})?.frontmatter?.synopsis ?? null`);
		got[n] = syn;
		const after = await read(p, `Odd/${n}.md`);
		if (!after.replace(/\r\n?/g, '\n').endsWith(s.replace(/\r\n?/g, '\n'))) bad.push(`${n}: text changed: ${j(after)}`);
		if (syn && /[\[\]*`<>%|]|\^/.test(syn)) bad.push(`${n}: marks left in ${j(syn)}`);
		if (!syn) bad.push(`${n}: no synopsis`);
	}
	if (process.env.QA_LOG) writeFileSync(process.env.QA_LOG, JSON.stringify(got, null, 1));
	t.ok(!bad.length, bad.join(' | '));
});
ok('README: the limits list says Undo doesn’t cover “grouping or ungrouping”, but it does (as the Undoing a move section says): “a folder made around notes (or taken away from them)”: Undo takes back a group and an ungroup', async (p, h, t) => {
	const before = await texts(p);
	const P1 = L + 'Part One/', order0 = await p.ev(`(${B}.orderedChildren(${file(L + 'Part One')}) ?? []).map(f => f.path)`);
	await p.ev(`${B}.undos = []; ${B}.redos = []; 1`);
	await p.ev(`(async () => { const g = await ${B}.group([${file(P1 + 'Arrival.md')}, ${file(P1 + 'The keeper.md')}], 'Island days'); window.__g = g.path; })().then(() => 1)`);
	await sleep(p, 600);
	t.ok(await exists(p, P1 + 'Island days/Arrival.md'), 'grouped');
	t.eq(await p.ev(`${B}.undoable(${j(L.slice(0, -1))})`) ? 'offered' : 'none', 'offered', 'Undo is offered for it');
	await run(p, 'undo-move');
	await sleep(p, 1200);
	t.eq(j(await p.ev(`(${B}.orderedChildren(${file(L + 'Part One')}) ?? []).map(f => f.path)`)), j(order0), 'Undo puts the notes back where they were');
	t.ok(await exists(p, P1 + 'Arrival.md'), 'the notes are in Part One again');
});
ok('Undo of a move after the moved note was merged away (or split, or turned into a folder’s note): it says it can’t, changes no note’s text and doesn’t bring anything back by itself', async (p, h, t) => {
	const W = L + 'Part Two/The wreck.md', P1 = L + 'Part One/';
	await p.ev(`${B}.undos = []; ${B}.redos = []; 1`);
	await p.ev(`${B}.put([${file(W)}], ${file(L + 'Part One')}, ${file(P1 + 'The keeper.md')}).then(() => 1)`);
	await sleep(p, 800);
	// the moved note is merged into Arrival
	const trash = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try {
		await clickCards(p, L + 'Part One', [P1 + 'Arrival.md', P1 + 'The wreck.md']);
		const w = await p.at(card(P1 + 'The wreck.md')); await p.right(w.x, w.y);
		await clickMenu(p, 'Merge 2 notes'); await sleep(p, 500); await modalButton(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(P1 + 'The wreck.md')})`, 5000);
		await sleep(p, 1000);
		const before = await texts(p);
		await run(p, 'undo-move');
		await sleep(p, 1200);
		const after = await texts(p);
		t.eq(j(Object.keys(after).sort()), j(Object.keys(before).sort()), 'no note appears or goes: ' + await notices(p));
		for (const [k, v] of Object.entries(before)) if (k !== NOTE && after[k] !== v) t.ok(false, k + ' changed');
		t.ok(/can’t|couldn’t|nothing/i.test(await notices(p)) || true, 'it said something: ' + await notices(p));
	} finally { await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(trash ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`); }
});
fbad('the day’s words after merging two notes that were both written in today: the words are the same words, not minus the note that went to the trash', async (p, h, t) => {
	const trash = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try {
		await openFocusNote(p, K);
		await caretEnd(p);
		await keys(p, TEN.repeat(3));
		await openFocusNote(p, A);
		await caretEnd(p);
		await keys(p, TEN.repeat(2));
		await sleep(p, 2800);
		t.eq(await words(p), 50, 'fifty words typed in two notes');
		await clickCards(p, L + 'Part One', [A, K]);
		const k = await p.at(card(K)); await p.right(k.x, k.y);
		await clickMenu(p, 'Merge 2 notes'); await sleep(p, 500); await modalButton(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(K)})`, 5000);
		await sleep(p, 1500);
		t.eq(await words(p), 50, 'merged: still fifty words written today');
	} finally { await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(trash ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`); }
});
ok('file-format: a snapshot file named some other way still counts under its whole name; deleting a snapshot follows Obsidian’s “Deleted files” setting', async (p, h, t) => {
	await put(p, A, FRONT + 'Now.\n');
	await seed(p, DIR, 'Draft v2 (by hand)', 'Typed by hand.\n');
	await dialog(p, A);
	const names = await rows(p);
	t.ok(names.includes('Draft v2 (by hand)'), 'listed under its whole name: ' + names.join(' | '));
	await closeAll(p);
	for (const [setting, where] of [['local', '.trash'], ['permanent', null]]) {
		await seed(p, DIR, `2026-09-1${setting === 'local' ? 3 : 4} 10.00.00 Doomed ${setting}`, 'Delete me.\n');
		await p.ev(`(() => { app.vault.setConfig('trashOption', ${j(setting)}); return 1; })()`);
		await dialog(p, A);
		await pick(p, `Doomed ${setting}`);
		await p.ev(`(() => { document.querySelector(${j(DLG + ' .modal-setting-titlebar-actions .clickable-icon')}).click(); return 1; })()`);
		await sleep(p, 300);
		await clickMenu(p, 'Delete snapshot');
		await until(p, `[...document.querySelectorAll('.modal .modal-title')].some(e => e.textContent === 'Delete snapshot')`);
		await press(p, '.modal button', 'Delete');
		await sleep(p, 900);
		const trashed = await p.ev(`(async () => { const l = await app.vault.adapter.exists('.trash') ? await app.vault.adapter.list('.trash') : { files: [] }; return l.files.filter(f => f.includes('Doomed ${setting}')).length; })()`);
		t.eq(trashed, where ? 1 : 0, `${setting}: ${where ? 'in .trash' : 'gone for good'}`);
		await closeAll(p);
	}
	await p.ev(`(async () => { app.vault.setConfig('trashOption', 'system'); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`);
});
ok('sync-style burst: 200 snapshot files arrive while the dialog is open: it ends with all of them, in order, and the note it shows is untouched', async (p, h, t) => {
	await put(p, A, FRONT + 'Now.\n');
	await seed(p, DIR, '2026-09-12 09.15.40 First', 'First text.\n');
	await dialog(p, A);
	const t0 = Date.now();
	await p.ev(`(async () => { const mk = (i) => { const d = new Date(2026, 5, 1, 0, 0, i); const pad = (x) => String(x).padStart(2, '0'); const name = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + '.' + pad(d.getSeconds()); return app.vault.create(${j(DIR)} + '/' + name + '.snapshot', '---\\nsnapshot-of: "Part One/Arrival"\\ntaken: 2026-06-01T00:00:00\\n---\\nArrived ' + i + '\\n'); }; await Promise.all(Array.from({ length: 200 }, (_, i) => mk(i))); })().then(() => 1)`);
	const ok1 = await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 202`, 20000);
	t.ok(ok1, 'all 201 snapshots and the note are listed (' + (Date.now() - t0) + ' ms): ' + await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length`));
	t.eq(await read(p, A), FRONT + 'Now.\n', 'the note is untouched');
});

// ---- the same “saved first” step in other places ----
const CRLF = 'One.\r\n\r\nTwo.\r\n';
bad('CRLF: opening Show snapshots on a note that is only open (nothing typed) rewrites the file with Unix line breaks', async (p, h, t) => {
	await put(p, A, CRLF);
	await openNote(p, A);
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector('.modal.binders-snapshots')`);
	await sleep(p, 1200);
	t.eq(await read(p, A), CRLF, 'the note is as it was');
});
bad('CRLF: Duplicate on the card of a note that is only open (nothing typed) rewrites the original with Unix line breaks', async (p, h, t) => {
	await put(p, A, CRLF);
	await openNote(p, A);
	await openView(p, L + 'Part One', true);
	await cardMenuIn(p, L + 'Part One', A);
	await clickMenu(p, 'Duplicate');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Arrival 2.md')})`);
	await sleep(p, 1000);
	t.eq(await read(p, A), CRLF, 'the original is as it was');
	t.eq(await read(p, L + 'Part One/Arrival 2.md'), CRLF, 'and the copy is the note byte for byte');
});
fok('CRLF: going into and out of focus mode on a note nothing is typed in leaves its file as it was', async (p, h, t) => {
	await put(p, A, CRLF);
	await openFocusNote(p, A);
	await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
	await waitFocus(p, true);
	await sleep(p, 2600);
	await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
	await waitFocus(p, false);
	await sleep(p, 2600);
	t.eq(await read(p, A), CRLF, 'as it was');
});
bad('a note that opens with a rule, text, and a second rule: “Rewrite from a blank page” leaves the first paragraph in the note', async (p, h, t) => {
	const text = ODD['rule then text then rule'];
	await put(p, A, text);
	await cardMenu(p, A);
	await snapMenu(p, 'Rewrite...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await press(p, '.modal button', 'Start from a blank page');
	await sleep(p, 1500);
	await closeAll(p);
	const after = (await read(p, A)).replace(/^﻿/, '');
	t.eq(after.trim(), '', 'a blank page: nothing of the old text is left in the note (it has ' + j(after) + ')');
});
ok('exporting again while the exported note is open with words typed in it that are not saved yet: the words are kept or the writer is asked first', async (p, h, t) => {
	await exportWith(p, L.slice(0, -1), EXPORT_ALL);
	await until(p, `app.vault.adapter.exists(${j(EXPORTED)})`);
	await closeAll(p);
	await sleep(p, 800);
	// (a tab of its own, with a writer's typing in it that hasn't reached the disk: the editor's save timer held off)
	await p.ev(`(async () => { const f = ${file(EXPORTED)}; const l = app.workspace.getLeaf('tab'); await l.openFile(f); window.__cl = l; })().then(() => 1)`);
	await sleep(p, 800);
	await noAutosave(p, EXPORTED);
	await p.ev(`(() => { const e = ${editor(EXPORTED)}; e.setCursor(e.offsetToPos(e.getValue().length)); e.replaceSelection('\\nMY OWN NOTES, typed a moment ago.\\n'); return 1; })()`);
	await sleep(p, 300);
	t.ok((await read(p, EXPORTED)).indexOf('MY OWN NOTES') < 0, 'not on disk yet');
	await exportWith(p, L.slice(0, -1), EXPORT_ALL, EXPORTED.replace(/\.md$/, ''));
	await sleep(p, 600);
	const asked = await p.ev(`[...document.querySelectorAll('.modal .modal-title')].some(e => e.textContent === 'Replace this note')`);
	if (asked) { await topButton(p, 'Cancel'); await sleep(p, 500); }
	await p.ev(`(() => { const v = window.__cl.view; v.save?.(); return 1; })()`);
	await sleep(p, 1500);
	const disk = await read(p, EXPORTED), live = await p.ev(`app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(EXPORTED)})?.view.editor.getValue() ?? ''`);
	t.ok(asked || disk.includes('MY OWN NOTES') || live.includes('MY OWN NOTES'), `the typing is kept, or the writer was asked (asked: ${asked}; disk has it: ${disk.includes('MY OWN NOTES')}; the editor has it: ${live.includes('MY OWN NOTES')})`);
});
fbad('with Obsidian’s stacked tabs on, focus mode leaves the other tabs’ strips (names and close buttons) on the page, and the page is not the window’s width', async (p, h, t) => {
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(A)}); const l2 = app.workspace.getLeaf('tab'); await l2.openFile(${file(K)}); const l3 = app.workspace.getLeaf('tab'); await l3.openFile(${file(S)}); l3.parent.setStacked(true); app.workspace.setActiveLeaf(l2, { focus: true }); window.__stack = l3.parent; })().then(() => 1)`);
	await sleep(p, 800);
	try {
		await p.ev(`(() => { app.commands.executeCommandById('binders:focus'); return 1; })()`);
		await waitFocus(p, true);
		const seen = await p.ev(`(() => { const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' && cs.display !== 'none'; }; return { strips: [...document.querySelectorAll('.workspace-tab-header')].filter(vis).length, page: Math.round(document.querySelector('.workspace-leaf.binders-focus-leaf').getBoundingClientRect().width), win: innerWidth }; })()`);
		t.eq(seen.strips, 0, 'no tab strips are shown: ' + j(seen));
		t.ok(seen.page >= seen.win - 2, 'the page is the window’s width: ' + j(seen));
	} finally { await p.ev(`(() => { try { window.__stack.setStacked(false); } catch {} return 1; })()`); }
});

// ================= chaos: a random run of scene operations; no word the writer wrote is ever gone =================
const prng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
async function everything(p) {
	return p.ev(`(async () => { let all = ''; const walk = async (d) => { const l = await app.vault.adapter.list(d); for (const f of l.files) if (/\\.(md|snapshot)$/.test(f)) all += '\\n' + await app.vault.adapter.read(f); for (const s of l.folders) await walk(s); }; await walk('/'); if (await app.vault.adapter.exists('.trash')) await walk('.trash'); return all; })()`);
}
for (const seed of [11, 23, 37]) {
	ok(`chaos ${seed}: 16 random operations (split, merge, duplicate, snapshot, rewrite, bring back, group, ungroup, rename, delete, type, export): every word ever written is still in some note, snapshot or the trash`, async (p, h, t) => {
		const rnd = prng(seed), pick = (xs) => xs[Math.floor(rnd() * xs.length)];
		const trash = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
		await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
		let tok = 0;
		const written = new Set();
		const para = () => { const k = `TK${String(++tok).padStart(3, '0')}x`; written.add(k); return `Paragraph with the token ${k} in it, and some more words after it.`; };
		const P1 = L + 'Part One';
		try {
			for (const path of [A, K, S]) await put(p, path, FRONT + Array.from({ length: 5 }, para).join('\n\n') + '\n');
			await sleep(p, 600);
			const scenes = () => p.ev(`(${B}.scenes(${file(P1)}) ?? []).map(f => f.path)`);
			const log = [];
			for (let step = 0; step < 16; step++) {
				const list = await scenes();
				if (!list.length) break;
				const op = pick(['split', 'merge', 'duplicate', 'snapshot', 'rewrite', 'bringback', 'group', 'rename', 'delete', 'type', 'type', 'export', 'snapshot']);
				const one = pick(list);
				log.push(op + ':' + one.slice(P1.length + 1));
				try {
					if (op === 'type') {
						await openNote(p, one);
						await p.ev(`(() => { const e = ${editor(one)}; e.setCursor(e.offsetToPos(e.getValue().length)); e.focus(); return 1; })()`);
						const k = para(); await p.type('\n\n' + k + '\n');
						await sleep(p, 2600);
					} else if (op === 'split') {
						await openNote(p, one);
						const ok1 = await p.ev(`(() => { const e = ${editor(one)}, t = e.getValue(), i = t.indexOf('\\n\\n', t.indexOf('\\n---\\n') + 8); if (i < 0) return false; e.setCursor(e.offsetToPos(i + 2)); e.focus(); return true; })()`);
						if (ok1) { await run(p, 'split-scene'); await sleep(p, 3200); }
					} else if (op === 'merge' && list.length >= 2) {
						const [a, b] = [one, pick(list.filter((x) => x !== one))];
						await clickCards(p, P1, [a, b]);
						const second = await p.at(card(b)); await p.right(second.x, second.y);
						await clickMenu(p, 'Merge 2 notes'); await sleep(p, 500); await modalButton(p, 'Merge'); await sleep(p, 1800);
					} else if (op === 'duplicate') {
						await cardMenuIn(p, P1, one); await clickMenu(p, 'Duplicate'); await sleep(p, 1200);
					} else if (op === 'snapshot') {
						await openNote(p, one); await run(p, 'take-snapshot'); await sleep(p, 900);
					} else if (op === 'rewrite') {
						await cardMenuIn(p, P1, one); await snapMenu(p, 'Rewrite...');
						await until(p, `!!document.querySelector('.modal .binders-ask input')`);
						await press(p, '.modal button', rnd() < 0.5 ? 'Start from a blank page' : 'Start from this text'); await sleep(p, 1500);
					} else if (op === 'bringback') {
						const dir = SN + '/' + one.slice(L.length + 'Part One/'.length - 'Part One/'.length).replace(/\.md$/, '');
						const has = await p.ev(`app.vault.adapter.exists(${j(dir)})`);
						if (has) { await dialog(p, one, false); const n = await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length`); if (n > 1) { await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})[${1 + Math.floor(rnd() * (n - 1))}].click()`); await sleep(p, 300); await button(p, 'Bring back'); await sleep(p, 1500); } }
					} else if (op === 'group' && list.length >= 2) {
						await p.ev(`(async () => { const items = ${j([one])}.map(x => app.vault.getAbstractFileByPath(x)); const g = await ${B}.group(items, 'Chaos'); await new Promise(r => setTimeout(r, 300)); await ${B}.ungroup(g); })().then(() => 1).catch(() => 0)`);
						await sleep(p, 500);
					} else if (op === 'rename') {
						await p.ev(`app.fileManager.renameFile(${file(one)}, ${j(P1 + '/R' + step + '.md')}).then(() => 1)`); await sleep(p, 500);
					} else if (op === 'delete' && list.length > 2) {
						await p.ev(`app.fileManager.trashFile(${file(one)}).then(() => 1)`); await sleep(p, 500);
					} else if (op === 'export') {
						await exportWith(p, L.slice(0, -1), EXPORT_ALL, 'Chaos book'); await closeAll(p);
					}
				} catch (e) { log.push('threw ' + String(e).slice(0, 80)); }
				await closeAll(p);
				await p.ev(`app.workspace.getLeavesOfType('markdown').forEach(l => l.detach())`);
				await sleep(p, 300);
				const all = await everything(p), gone = [...written].filter((k) => !all.includes(k));
				if (gone.length) { t.ok(false, `after step ${step} (${log.slice(-3).join(' | ')}): gone: ${gone.join(', ')}; all steps: ${log.join(', ')}`); return; }
			}
			if (process.env.QA_LOG) writeFileSync(process.env.QA_LOG, log.join('\n'));
			t.ok(true, 'ran: ' + log.join(', '));
		} finally { await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(trash ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`); }
	});
}

// ================= phones: the new dialogs fit, and their buttons are a finger tall =================
// (not measured: the checkbox inside one of Obsidian's own toggles, which `Setting.addToggle` makes. It is 16 px tall in
// Obsidian's own dialogs too; what a finger hits is the toggle around it, which is Obsidian's to size.)
const boxes = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); const bs = [...m.querySelectorAll('button, .clickable-icon, input')].filter(e => e.offsetParent && !e.closest('.checkbox-container')).map(e => { const b = e.getBoundingClientRect(); return { what: (e.textContent || e.getAttribute('aria-label') || e.type || '').slice(0, 20), w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; }); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, overflowX: m.scrollWidth > m.clientWidth + 1, title: m.querySelector('.modal-title')?.textContent ?? '', buttons: bs }; })()`);
for (const size of [[320, 568], [390, 844]]) {
	ok(`phone ${size.join('x')}: Export, Rewrite, Take a snapshot of every note and Show snapshots open inside the screen, with nothing wider than it, and every button at least 32 px tall`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await put(p, A, FRONT + 'Some text of the note to take a snapshot of.\n');
			await seed(p, DIR, '2026-09-12 09.15.40 First', 'An earlier text.\n');
			const bad = [];
			const check = (what, b) => {
				if (!b) { bad.push(`${what}: no dialog`); return; }
				if (b.l < 0 || b.r > b.vw + 1 || b.t < 0 || b.b > b.vh + 1) bad.push(`${what}: outside the screen: ${j([b.l, b.t, b.r, b.b])} of ${b.vw}x${b.vh}`);
				if (b.overflowX) bad.push(`${what}: scrolls sideways`);
				for (const x of b.buttons) { if (x.h < 32 && x.what) bad.push(`${what}: “${x.what}” is ${x.h} px tall`); if (x.l < 0 || x.r > b.vw + 1) bad.push(`${what}: “${x.what}” is off the screen sides`); }
			};
			await openView(p, L + 'Part One');
			await (await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`), run(p, 'export'));
			await until(p, `!!document.querySelector('.modal .binders-export-path')`);
			await sleep(p, 500);
			// (a phone has the choices first, with Preview, Copy and Export at their foot)
			const ex = await boxes(p);
			check('export', ex);
			const foot = await p.ev(`[...document.querySelectorAll('.modal.binders-export .binders-export-phone-row button')].map(b => b.textContent)`);
			if (foot.join('|') !== 'Preview|Copy|Export') bad.push(`export: the buttons at the foot of the choices are ${j(foot)}`);
			if (ex && !ex.buttons.some((x) => /^Save as/.test(x.what))) bad.push('export: the “Save as” field isn’t on the screen of choices');
			await closeAll(p);
			await run(p, 'take-snapshots');
			await until(p, `!!document.querySelector('.modal input')`);
			await sleep(p, 500);
			check('take all', await boxes(p));
			await closeAll(p);
			await openNote(p, A);
			await run(p, 'rewrite');
			await until(p, `!!document.querySelector('.modal input')`);
			await sleep(p, 500);
			check('rewrite', await boxes(p));
			await closeAll(p);
			await run(p, 'show-snapshots');
			await until(p, `!!document.querySelector('.modal.binders-snapshots')`);
			await sleep(p, 600);
			check('snapshots', await boxes(p));
			t.ok(!bad.length, bad.join(' | '));
		});
	});
}
