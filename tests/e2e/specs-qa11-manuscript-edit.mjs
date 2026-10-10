// QA round 11, typing in the manuscript: the caret across sections with the arrows, a selection that runs out of a
// section and what copy gives, cut and paste between sections, multi-paragraph paste (plain and HTML) compared with the
// same paste in a normal tab of Obsidian, a paste that starts with a properties block, a very long word, a long
// section left for the corkboard and back, a note renamed on disk while it has unsaved typing, and an image section.
// Oracle: Obsidian's own editor (a normal tab) where there is one; otherwise what the file must say, byte for byte.
// Tests named "qa11 manuscript edit: …" pass; "BUG: …" and "NIT: …" are confirmed findings (they fail until fixed).
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { VIEW, closeMenus, j, openView, withTidy } from './view-helpers.mjs';

export const specs = [];
const NS = 'qa11 manuscript edit: ';
const J = JSON.stringify;
const M = `${VIEW}.current`;
const F = 'Edit';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const errs = (p) => p.errors.filter((e) => !/ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security|clipboard/i.test(e));
const cleanup = (p) => p.ev(`(async () => { for (const f of ['Loose.md', 'pic.png']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x, true); } return 1; })()`).catch(() => {});
const wrap = (fn) => withTidy(async (p, h, t) => {
	p.errors.length = 0;
	try {
		await fn(p, h, t);
		t.eq(J(errs(p)), '[]', 'nothing was logged to the console');
	} finally {
		await closeMenus(p).catch(() => {});
		await p.ev(`(() => { document.querySelectorAll('.modal-close-button').forEach(b => b.click()); return 1; })()`).catch(() => {});
		await cleanup(p);
		// (Electron says its clipboard is deprecated in a page: a warning about the test's own use, not the plugin's)
		for (let i = p.errors.length - 1; i >= 0; i--) if (/clipboard/i.test(p.errors[i])) p.errors.splice(i, 1);
	}
});
const test = (name, fn) => specs.push({ name: NS + name, fn: wrap(fn) });
const nit = (name, fn) => specs.push({ name: 'NIT: ' + NS + name, fn: wrap(fn) });

// ---- the disk and the clipboard ----
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
const onDisk = (p, path) => existsSync(join(p.vaultDir, path));
const fm = (s) => (s.match(/^---\n[\s\S]*?\n---\n/) || [''])[0];
const body = (s) => s.slice(fm(s).length);
const count = (s, sub) => s.split(sub).length - 1;
const clip = (p) => p.ev(`require('electron').clipboard.readText()`);
const setClip = (p, text) => p.ev(`(() => { require('electron').clipboard.writeText(${J(text)}); return 1; })()`);
const setClipHtml = (p, text, html) => p.ev(`(() => { require('electron').clipboard.write({ text: ${J(text)}, html: ${J(html)} }); return 1; })()`);

// ---- the binder and its sections ----
const sc = (path) => `${M}.scenes.find(s => s.file.path === ${J(path)})`;
const N = (name) => `${F}/${name}.md`;

/** A binder "Edit" with these notes (name → whole text), in this order (the names sort the way they are listed). */
async function make(p, notes, open = true) {
	await p.ev(`(async () => {
		await app.vault.createFolder(${J(F)});
		for (const [n, s] of ${J(notes)}) await app.vault.create(${J(F + '/')} + n + '.md', s);
		await new Promise(r => setTimeout(r, 900));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath(${J(F)}));
		return 1; })()`);
	await p.sleep(800);
	if (open) await openMs(p);
}
async function settle(p, ms = 5000) {
	for (let i = 0; i < ms / 50; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; const near = m.scenes.filter(s => m.near.has(s.el)); return (near.length > 0 || m.scenes.length === 0) && near.slice(0, m.liveMax).every(s => m.editable ? (s.live || s.broken) && !s.mounting : s.shown !== null); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(200);
}
async function openMs(p, folder = F) {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
/** Puts the caret in a section and focuses its editor. `pos` is a JS expression over `text` (the whole file) and `start`
    (where the body starts, after the properties). */
const place = (p, path, pos) => p.ev(`(async () => {
	const m = ${M}, s = ${sc(path)};
	s.el.scrollIntoView({ block: 'center' });
	await m.mount(s);
	const cm = s.live.cm, text = cm.state.doc.toString();
	const f = /^---\\n[\\s\\S]*?\\n---\\n/.exec(text), start = f ? f[0].length : 0;
	const at = (${pos});
	cm.focus(); cm.dispatch({ selection: { anchor: at }, scrollIntoView: true });
	return at; })()`);
const END = 'text.length', START = 'start';
/** Who has the caret: the section's file, or null. */
const focused = (p) => p.ev(`(() => { const m = ${M}; const s = m?.scenes?.find(s => s.el.contains(document.activeElement)); return s && document.activeElement.classList.contains('cm-content') ? s.file.path : null; })()`);
/** Caret in the focused section: offset in the file, the line's column, and the selection's ends. */
const caret = (p) => p.ev(`(() => { const m = ${M}; const s = m.scenes.find(s => s.el.contains(document.activeElement)); if (!s?.live?.cm) return null; const cm = s.live.cm, sel = cm.state.selection.main, line = cm.state.doc.lineAt(sel.head); return { path: s.file.path, head: sel.head, anchor: sel.anchor, from: sel.from, to: sel.to, col: sel.head - line.from, len: cm.state.doc.length, x: cm.coordsAtPos(sel.head)?.left ?? null }; })()`);
/** The editor's text of a section, if it is one now. */
const live = (p, path) => p.ev(`${sc(path)}?.live?.cm?.state.doc.toString() ?? null`);
/** Where a needle is in a section's file, as a JS expression for `place`. */
const at = (needle, off = 0) => `text.indexOf(${J(needle)}) + ${off}`;
/** Real keys, as fast as they can be sent: a keydown with its text and a keyup. "\n" is Enter. */
async function keys(p, text) {
	for (const ch of text) {
		const enter = ch === '\n', key = enter ? 'Enter' : ch;
		const code = enter ? 'Enter' : ch === ' ' ? 'Space' : /^[a-z]$/i.test(ch) ? 'Key' + ch.toUpperCase() : /^[0-9]$/.test(ch) ? 'Digit' + ch : undefined;
		const vk = enter ? 13 : /^[a-z0-9 ]$/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : undefined;
		p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: enter ? '\r' : ch });
		await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
	}
	await p.sleep(120);
}
/** Gives a few seconds for the sections' writes to land (a section is written a moment after it's typed in). */
const saved = (p) => p.sleep(2800);
/** Sets the caret and selection of a section (its editor focused), by offsets in its file. */
const select = (p, path, a, b) => p.ev(`(async () => { const m = ${M}, s = ${sc(path)}; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const cm = s.live.cm; cm.focus(); cm.dispatch({ selection: { anchor: ${a}, head: ${b} } }); return 1; })()`);
/** Viewport coordinates of a point in a section's editor. */
const pointAt = (p, path, i) => p.ev(`(() => { const c = ${sc(path)}.live.cm.coordsAtPos(${i}); return c ? { x: c.left + 1, y: (c.top + c.bottom) / 2 } : null; })()`);
const mode = (p, name) => p.ev(`(() => { ${VIEW}.setMode(${J(name)}); return 1; })()`);
/** A normal tab on a note of the vault (not in the binder), made to paste into and read: Obsidian's own editor, the
    control for what a paste should do. Its leaf is returned to close again with `closeTab`. */
const tab = (p, path) => p.ev(`(async () => {
	const l = app.workspace.getLeaf('tab');
	await l.openFile(app.vault.getAbstractFileByPath(${J(path)}));
	await new Promise(r => setTimeout(r, 500));
	const cm = l.view.editor.cm;
	window.__qa11Tab = l;
	cm.focus(); cm.dispatch({ selection: { anchor: cm.state.doc.length } });
	return 1; })()`);
const closeTab = (p) => p.ev(`(() => { try { window.__qa11Tab?.detach(); } catch {} window.__qa11Tab = null; return 1; })()`);

// ---- the paste experiment, shared by the plain and HTML tests ----
const PLAIN = 'Pasted one, first line.\n\n# A heading\n\n\tTabbed line in the paste\n\n---\n\n- item one\n- item two\n\nLast line with *emphasis* and a [[Alpha]] link.\n';
const HTML_TEXT = 'Head\nPara one and a link\nItem a\nItem b\nTwo';
const HTML = '<h2>Head</h2><p>Para <em>one</em> and <a href="https://example.com/x">a link</a></p><ul><li>Item a</li><li>Item b</li></ul><p>Two</p>';

/** The same clipboard pasted at the end of a normal tab's note and at the end of a section: what each adds. Obsidian's
    tab is the control. Returns [tab's addition, section's addition, section after the paste]. */
async function pasteTwice(p, t, clipboard, eol = '\n') {
	await make(p, [['Alpha', '---\nstatus: draft\n---\nAlpha text.' + eol], ['Bravo', 'Bravo start.' + eol], ['Charlie', 'Charlie text.' + eol]], false);
	await p.ev(`(async () => { await app.vault.adapter.write('Loose.md', ${J('Loose start.' + eol)}); return 1; })()`);
	await p.sleep(400);
	await tab(p, 'Loose.md');
	await clipboard();
	await p.sleep(200);
	await p.key('v', 'ctrl');
	await saved(p);
	const looseAfter = disk(p, 'Loose.md');
	await closeTab(p);
	await p.sleep(300);
	await openMs(p);
	await place(p, N('Bravo'), END);
	await clipboard();
	await p.sleep(200);
	await p.key('v', 'ctrl');
	await saved(p);
	const after = disk(p, N('Bravo'));
	return [looseAfter.slice(('Loose start.' + eol).length), after.slice(('Bravo start.' + eol).length), after];
}

// ---- arrows across sections ----

test('ArrowDown from the middle of a section’s last line goes to the next section at the same column', async (p, h, t) => {
	await make(p, [['Alpha', 'Alpha is the first note.\nSecond line of Alpha, the last one'], ['Bravo', 'Bravo is the second note, and its first line is a fair way longer than Alpha’s.\n']]);
	const before = disk(p, N('Alpha'));
	await place(p, N('Alpha'), at('Second', 7));
	const c0 = await caret(p);
	t.eq(c0.col, 7, 'the caret is 7 characters into the last line of Alpha');
	await p.key('ArrowDown');
	await p.sleep(350);
	const c1 = await caret(p);
	t.eq(await focused(p), N('Bravo'), 'ArrowDown on the last line goes into Bravo');
	t.ok(c1 && Math.abs(c1.col - 7) <= 1, 'and keeps its column (7, not ' + (c1 && c1.col) + ')');
	t.ok(c1 && c1.head <= c1.len && c1.x != null && Math.abs(c1.x - c0.x) <= 10, 'at about the same x on screen: ' + (c0.x | 0) + ' then ' + (c1?.x | 0));
	await p.key('ArrowUp');
	await p.sleep(350);
	const c2 = await caret(p);
	t.eq(await focused(p), N('Alpha'), 'ArrowUp on the first line of Bravo goes back into Alpha');
	t.ok(c2 && Math.abs(c2.col - 7) <= 1, 'at its last line, column ' + (c2 && c2.col));
	await p.sleep(2600);
	t.eq(disk(p, N('Alpha')), before, 'moving the caret wrote nothing to Alpha');
	t.eq(disk(p, N('Bravo')), 'Bravo is the second note, and its first line is a fair way longer than Alpha’s.\n', 'nor to Bravo');
});

nit('ArrowRight at a section’s end and ArrowLeft at its start go on into the next and the previous section, as the docs say “Arrow keys … on into the next note and back”', async (p, h, t) => {
	// NIT: the code moves the caret across sections for ArrowUp and ArrowDown only (src/view/manuscript.ts onKey). An
	// existing test (specs-qa2-manuscript.mjs, "hidden properties …") asserts that ArrowRight at a section's end stays in
	// the section. The two disagree; the maintainer should say which is meant.
	await make(p, [['Alpha', 'Alpha end.\n'], ['Bravo', 'Bravo start.\n']]);
	await place(p, N('Alpha'), END);
	await p.key('ArrowRight');
	await p.sleep(300);
	t.eq(await focused(p), N('Bravo'), 'ArrowRight at the end of Alpha goes to Bravo');
	await p.key('ArrowLeft');
	await p.sleep(300);
	t.eq(await focused(p), N('Alpha'), 'ArrowLeft at the start of Bravo goes back to Alpha');
});

test('ArrowDown walks through two empty sections, a picture-only section and on, without sticking; typing lands in the right one', async (p, h, t) => {
	await p.ev(`(async () => { const b = Uint8Array.from(atob(${J(PNG)}), c => c.charCodeAt(0)); await app.vault.createBinary('pic.png', b.buffer); return 1; })()`);
	await make(p, [['Alpha', 'Alpha.\n'], ['Bravo', ''], ['Charlie', ''], ['Delta', '![[pic.png]]\n'], ['Echo', 'Echo text.\n']]);
	const before = Object.fromEntries(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((n) => [n, disk(p, N(n))]));
	await place(p, N('Alpha'), END);
	const seen = [];
	for (let i = 0; i < 8 && (await focused(p)) !== N('Echo'); i++) {
		await p.key('ArrowDown'); await p.sleep(350);
		seen.push((await focused(p))?.split('/').pop() ?? 'none');
	}
	const stops = [...new Set(seen)];
	t.eq(stops.join(' '), 'Bravo.md Charlie.md Delta.md Echo.md', 'each ArrowDown goes on to the next section, after the picture’s own empty line: ' + seen.join(' '));
	await keys(p, 'Z');
	await saved(p);
	t.eq(disk(p, N('Echo')), 'ZEcho text.\n', 'typed at the start of Echo, into Echo');
	for (const n of ['Alpha', 'Bravo', 'Charlie', 'Delta']) t.eq(disk(p, N(n)), before[n], `${n} is as it was`);
});

test('Shift+ArrowDown from a section’s last line selects to its end, and typing over that selection changes only that section', async (p, h, t) => {
	// (Shift+arrows are left to the editor, so a selection stops at the section's end and does not run into the next one.
	// That is a limit, not a loss: the typing must still go to the section the caret is in.)
	await make(p, [['Alpha', 'Alpha one.\nAlpha two.\n'], ['Bravo', 'Bravo one.\n']]);
	const bravo = disk(p, N('Bravo'));
	await place(p, N('Alpha'), at('Alpha two.'));
	await p.key('ArrowDown', 'shift');
	await p.sleep(200);
	const c = await caret(p);
	t.eq(c.path, N('Alpha'), 'the selection is in Alpha');
	t.ok(c.from !== c.to, 'something is selected');
	await keys(p, 'X');
	await saved(p);
	t.eq(disk(p, N('Bravo')), bravo, 'Bravo is untouched');
	t.eq(disk(p, N('Alpha')), 'Alpha one.\nX', 'the selected line was replaced in Alpha, and only there');
});

// ---- selection and copy ----

test('Ctrl+A in a section, then Ctrl+C: the clipboard is that section’s text, and none of its properties', async (p, h, t) => {
	await make(p, [['Alpha', 'Alpha one.\n'], ['Bravo', '---\nstatus: idea\nsynopsis: Bravo synopsis\n---\nB1 first paragraph.\n\nB2 second paragraph.\n\nB3 third.\n'], ['Charlie', 'C1.\n']]);
	const whole = disk(p, N('Bravo')), body1 = body(whole);
	await place(p, N('Bravo'), at('B2'));
	await p.key('a', 'ctrl');
	await p.sleep(150);
	await p.key('c', 'ctrl');
	await p.sleep(250);
	t.eq(await clip(p), body1, 'the clipboard has the body, exactly, with no properties');
	await saved(p);
	t.eq(disk(p, N('Bravo')), whole, 'the copy wrote nothing');
});

test('a drag out of one section’s text into the next, then Ctrl+C: the clipboard has what was in the section, once, and no property', async (p, h, t) => {
	await make(p, [['Alpha', 'Alpha one.\n'], ['Bravo', '---\nstatus: idea\nsynopsis: Bravo synopsis\n---\nB1 first paragraph.\n\nB2 second paragraph, dragged from.\n\nB3 third.\n'], ['Charlie', '---\nstatus: draft\n---\nC1 first.\n\nC2 second.\n']]);
	const before = Object.fromEntries(['Alpha', 'Bravo', 'Charlie'].map((n) => [n, disk(p, N(n))]));
	await settle(p);
	const from = await p.ev(`(() => { const cm = ${sc(N('Bravo'))}.live.cm; const i = cm.state.doc.toString().indexOf('B2'); const c = cm.coordsAtPos(i); return { x: c.left + 1, y: (c.top + c.bottom) / 2 }; })()`);
	const to = await p.ev(`(() => { const cm = ${sc(N('Charlie'))}.live.cm; const c = cm.coordsAtPos(cm.state.doc.toString().indexOf('C2')); return { x: c.left + 1, y: (c.top + c.bottom) / 2 }; })()`);
	await p.drag(from.x, from.y, to.x, to.y, 14);
	await p.sleep(200);
	await p.key('c', 'ctrl');
	await p.sleep(250);
	const got = await clip(p);
	t.ok(got.includes('B2 second paragraph, dragged from.'), 'the text dragged over is on the clipboard: ' + J(got));
	t.eq(count(got, 'B2 second paragraph'), 1, 'once');
	t.ok(!/status:|synopsis:|^---$/m.test(got), 'no property is on the clipboard');
	await saved(p);
	for (const n of ['Alpha', 'Bravo', 'Charlie']) t.eq(disk(p, N(n)), before[n], `${n} is untouched by the copy`);
});

test('cut a paragraph out of one section (Ctrl+X), paste it into the end of another (Ctrl+V), then Ctrl+Z there: each note is what it should be, byte for byte', async (p, h, t) => {
	await make(p, [['Alpha', 'Alpha one.\n'], ['Bravo', 'B1 first.\n\nB2 second paragraph here, to be moved.\n\nB3 third.\n'], ['Charlie', 'C1 first.\n\nC2 second.\n']]);
	const bravo = disk(p, N('Bravo')), charlie = disk(p, N('Charlie'));
	const i = bravo.indexOf('B2'), j2 = bravo.indexOf('\n', i);
	await select(p, N('Bravo'), i, j2);
	await p.key('x', 'ctrl');
	await p.sleep(250);
	t.eq(await clip(p), 'B2 second paragraph here, to be moved.', 'the cut text is on the clipboard');
	await place(p, N('Charlie'), END);
	await p.key('v', 'ctrl');
	await saved(p);
	const bravoNow = disk(p, N('Bravo')), charlieNow = disk(p, N('Charlie'));
	t.eq(bravoNow, bravo.slice(0, i) + bravo.slice(j2), 'Bravo lost exactly the cut text (its line break stays)');
	t.eq(charlieNow, charlie + 'B2 second paragraph here, to be moved.', 'Charlie got it once, at its end');
	await p.key('z', 'ctrl');
	await saved(p);
	t.eq(disk(p, N('Charlie')), charlie, 'Ctrl+Z in Charlie takes the paste back: Charlie is as it was');
	t.eq(disk(p, N('Bravo')), bravoNow, 'and Bravo is not touched by it');
});

// ---- paste, compared with Obsidian's own editor ----

test('a multi-paragraph paste (heading, tab-led line, rule, list, emphasis, link) at the end of a section adds exactly what the same paste adds in a normal tab', async (p, h, t) => {
	const [tabAdded, sectionAdded, after] = await pasteTwice(p, t, () => setClip(p, PLAIN));
	t.ok(tabAdded.includes('# A heading') && tabAdded.includes('- item two'), 'the control (Obsidian’s tab) pasted the whole text: ' + J(tabAdded));
	t.eq(sectionAdded, tabAdded, 'the section adds the same text as the tab');
	t.ok(after.startsWith('Bravo start.\n'), 'the text before the caret is kept');
	await p.key('z', 'ctrl');
	await saved(p);
	t.eq(disk(p, N('Bravo')), 'Bravo start.\n', 'one Ctrl+Z takes the whole paste back');
});

test('an HTML paste (heading, emphasis, link, list) at the end of a section adds exactly what the same paste adds in a normal tab', async (p, h, t) => {
	const [tabAdded, sectionAdded] = await pasteTwice(p, t, () => setClipHtml(p, HTML_TEXT, HTML));
	t.ok(tabAdded.length > 0 && tabAdded !== HTML_TEXT, 'the control converted the HTML: ' + J(tabAdded));
	t.eq(sectionAdded, tabAdded, 'the section adds the same as the tab');
});

test('a paste that starts with a properties block, at the start of a section’s text: the properties stay as they were; the paste is text', async (p, h, t) => {
	await make(p, [['Alpha', '---\nstatus: draft\nsynopsis: Alpha\n---\nAlpha body.\n'], ['Bravo', 'Bravo.\n']]);
	const before = disk(p, N('Alpha'));
	await place(p, N('Alpha'), START);
	await setClip(p, '---\nstatus: finished\nsynopsis: Pasted\n---\nThe pasted body.\n');
	await p.sleep(150);
	await p.key('v', 'ctrl');
	await saved(p);
	const now = disk(p, N('Alpha'));
	t.eq(fm(now), fm(before), 'the properties are the same bytes: status is still draft');
	t.ok(body(now).startsWith('---\nstatus: finished') && body(now).endsWith('Alpha body.\n'), 'the paste is body text, before the old body: ' + J(body(now)));
	await p.key('z', 'ctrl');
	await saved(p);
	t.eq(disk(p, N('Alpha')), before, 'Ctrl+Z gives back the note byte for byte');
});

// ---- long text ----

test('a 30,000-character word with no spaces pasted at the end of a section: the page does not scroll sideways, and typing after it is saved', async (p, h, t) => {
	await make(p, [['Alpha', 'Alpha.\n'], ['Bravo', 'Bravo start.\n'], ['Charlie', 'Charlie.\n']]);
	const word = 'https://example.com/' + 'a'.repeat(30000);
	await place(p, N('Bravo'), END);
	await setClip(p, word + '\n');
	await p.sleep(150);
	await p.key('v', 'ctrl');
	await p.sleep(600);
	const over = await p.ev(`(() => { const r = ${M}.root; return r.scrollWidth - r.clientWidth; })()`);
	t.eq(over <= 1, true, 'the manuscript does not scroll sideways (overflow ' + over + ' px)');
	await keys(p, 'END');
	await saved(p);
	t.ok(disk(p, N('Bravo')).endsWith(word + '\nEND'), 'the word and the typing after it are both saved, once');
	t.eq(count(disk(p, N('Bravo')), 'a'.repeat(30000)), 1, 'the word is there once, whole');
});

test('2,000 lines typed at the end of a long section, then the corkboard and back at once: the typing is kept once, on disk and on screen', async (p, h, t) => {
	const lines = Array.from({ length: 2000 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
	await make(p, [['Alpha', 'Alpha.\n'], ['Bravo', lines], ['Charlie', 'Charlie.\n']]);
	await place(p, N('Bravo'), END);
	await keys(p, 'Q');
	await mode(p, 'corkboard');
	await p.sleep(400);
	await mode(p, 'manuscript');
	await settle(p);
	await saved(p);
	const now = disk(p, N('Bravo'));
	t.eq(now, lines + 'Q', 'Bravo is the 2,000 lines and one Q, nothing doubled');
	t.eq(count(now, 'line 1000\n'), 1, 'a line from the middle is there once');
	const shown = await live(p, N('Bravo'));
	t.ok(shown === null || shown.endsWith('Q'), 'a section on screen shows the Q at its end');
});

// ---- the note changed on disk while it has unsaved typing ----

test('a note renamed on disk (as a sync tool does) while its section has unsaved typing: the typing is in the new name and nothing is written back to the old one', async (p, h, t) => {
	await make(p, [['Alpha', 'Alpha.\n'], ['Bravo', 'Bravo start.\n'], ['Charlie', 'Charlie.\n']]);
	await place(p, N('Bravo'), END);
	await keys(p, 'A');
	await p.ev(`app.vault.adapter.rename(${J(N('Bravo'))}, ${J(F + '/Bravo moved.md')}).then(() => 1)`);
	await p.sleep(100);
	await keys(p, 'B');
	await p.sleep(4000);
	t.ok(onDisk(p, F + '/Bravo moved.md'), 'the renamed note is there');
	t.eq(onDisk(p, N('Bravo')), false, 'and the old name is not written back');
	t.ok(disk(p, F + '/Bravo moved.md').endsWith('AB'), 'the typing (A, then B) is in the renamed note: ' + J(onDisk(p, F + '/Bravo moved.md') ? disk(p, F + '/Bravo moved.md') : null));
});

// ---- images and embeds ----

test('typing after a picture embed, in the section that is only that embed, lands after it on the same line and nowhere else', async (p, h, t) => {
	await p.ev(`(async () => { const b = Uint8Array.from(atob(${J(PNG)}), c => c.charCodeAt(0)); await app.vault.createBinary('pic.png', b.buffer); return 1; })()`);
	await make(p, [['Alpha', 'Alpha text.\n'], ['Bravo', '![[pic.png]]'], ['Charlie', 'Charlie.\n']]);
	const alpha = disk(p, N('Alpha')), charlie = disk(p, N('Charlie'));
	await place(p, N('Bravo'), END);
	await keys(p, 'T');
	await saved(p);
	t.eq(disk(p, N('Bravo')), '![[pic.png]]T', 'the typing is on the embed’s line, after it');
	t.eq(disk(p, N('Alpha')), alpha, 'Alpha is as it was');
	t.eq(disk(p, N('Charlie')), charlie, 'Charlie is as it was');
});

// ---- text dragged from one section into another ----

test('text dragged from one section and dropped at the end of another moves, once: the source loses it, the target gets it, nothing else changes', async (p, h, t) => {
	// (Synthetic drag events with one DataTransfer, as a drag between two editors sends them: the manuscript's own
	// handlers take the text out of the source only when the drop is taken by the other section's editor.)
	await make(p, [['Alpha', 'Alpha one.\n'], ['Bravo', 'B1 first.\n\nB2 drag me.\n\nB3.\n'], ['Charlie', 'C1.\n\nC2.\n']]);
	const before = Object.fromEntries(['Alpha', 'Bravo', 'Charlie'].map((n) => [n, disk(p, N(n))]));
	await select(p, N('Bravo'), before.Bravo.indexOf('B2'), before.Bravo.indexOf('B2') + 'B2 drag me.'.length);
	await settle(p);
	const took = await p.ev(`(() => {
		const b = ${sc(N('Bravo'))}.live.cm, c = ${sc(N('Charlie'))}.live.cm;
		const sel = b.state.selection.main, dt = new DataTransfer();
		dt.setData('text/plain', b.state.sliceDoc(sel.from, sel.to));
		const at = (cm, i) => { const r = cm.coordsAtPos(i); return { x: r.left + 1, y: (r.top + r.bottom) / 2 }; };
		const from = at(b, sel.from), to = at(c, c.state.doc.length);
		const ev = (el, type, p) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: p.x, clientY: p.y }));
		ev(b.contentDOM, 'dragstart', from); ev(c.contentDOM, 'dragenter', to); ev(c.contentDOM, 'dragover', to);
		const dropped = ev(c.contentDOM, 'drop', to); ev(b.contentDOM, 'dragend', from);
		return { text: dt.getData('text/plain'), dropped };
	})()`);
	t.eq(took.text, 'B2 drag me.', 'the selection was dragged');
	await saved(p);
	t.eq(disk(p, N('Bravo')), before.Bravo.replace('B2 drag me.', ''), 'Bravo lost the dragged text, and only it');
	t.eq(disk(p, N('Charlie')), before.Charlie + 'B2 drag me.', 'Charlie got it once, at its end');
	t.eq(disk(p, N('Alpha')), before.Alpha, 'Alpha is as it was');
	t.eq(count(disk(p, N('Bravo')) + disk(p, N('Charlie')), 'B2 drag me.'), 1, 'the text exists once in the binder');
});

// ---- a paste undone after its section has gone back to plain text ----

test('a multi-paragraph paste, its section scrolled far away and back, then Ctrl+Z: the paste goes and nothing else does', async (p, h, t) => {
	const notes = Array.from({ length: 14 }, (_, i) => [`Scene ${String(i + 1).padStart(2, '0')}`, `Scene ${i + 1} first paragraph.\n\nScene ${i + 1} second paragraph.\n`]);
	await make(p, notes);
	const bravo = N('Scene 03'), before = disk(p, bravo), all = Object.fromEntries(notes.map(([n]) => [n, disk(p, N(n))]));
	const text = Array.from({ length: 12 }, (_, i) => `Pasted paragraph ${i + 1}, with a few words to make it a line of its own.`).join('\n\n') + '\n';
	await place(p, bravo, END);
	await setClip(p, text);
	await p.sleep(150);
	await p.key('v', 'ctrl');
	await saved(p);
	t.eq(disk(p, bravo), before + text, 'the paste is in the note, once');
	const wheel = (dy, n) => p.ev(`(async () => { const r = ${M}.root.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`).then(async (at) => { for (let i = 0; i < n; i++) { await p.wheel(at.x, at.y, dy); await p.sleep(20); } });
	await wheel(240, 40);
	await p.sleep(2500);
	t.eq(await live(p, bravo), null, 'the section has gone back to plain text');
	await wheel(-240, 40);
	await p.sleep(800);
	await place(p, bravo, END);
	await p.key('z', 'ctrl');
	await saved(p);
	t.eq(disk(p, bravo), before, 'Ctrl+Z takes the whole paste back, byte for byte');
	for (const [n] of notes) if (N(n) !== bravo) t.eq(disk(p, N(n)), all[n], `${n} is as it was`);
});

test('a multi-paragraph paste into a note whose lines end CRLF adds exactly what the same paste adds in a normal tab, with the same line endings', async (p, h, t) => {
	const LF = 'One, the first.\n\nTwo, a list:\n- three\n- four\n\n## Five\n';
	const [tabAdded, sectionAdded, after] = await pasteTwice(p, t, () => setClip(p, LF), '\r\n');
	t.ok(tabAdded.includes('## Five'), 'the control (Obsidian’s tab) pasted the text: ' + J(tabAdded));
	t.eq(sectionAdded, tabAdded, 'the section adds the same bytes as the tab');
	// (Obsidian's own tab leaves bare LFs here too, as the equality above shows: not checked against the file's CRLF)
});

test('a note deleted on disk while its section has unsaved typing: what happens matches what Obsidian’s own tab does with the same note', async (p, h, t) => {
	// Control: the same note in a normal tab, typed in, deleted on disk, typed in again.
	await p.ev(`(async () => { await app.vault.create('Loose.md', 'Loose start.\\n'); return 1; })()`);
	await p.sleep(400);
	await tab(p, 'Loose.md');
	await keys(p, 'X');
	await p.ev(`app.vault.adapter.remove('Loose.md').then(() => 1)`);
	await keys(p, 'Y');
	await p.sleep(3500);
	const tabExists = onDisk(p, 'Loose.md'), tabText = tabExists ? disk(p, 'Loose.md') : null;
	await closeTab(p);
	await p.sleep(300);
	// The section.
	await make(p, [['Alpha', 'Alpha.\n'], ['Bravo', 'Bravo start.\n'], ['Charlie', 'Charlie.\n']]);
	await place(p, N('Bravo'), END);
	await keys(p, 'X');
	await p.ev(`app.vault.adapter.remove(${J(N('Bravo'))}).then(() => 1)`);
	await keys(p, 'Y');
	await p.sleep(3500);
	const secExists = onDisk(p, N('Bravo')), secText = secExists ? disk(p, N('Bravo')) : null;
	t.eq(secExists, tabExists, 'the file is there (or not) after the typing, as in Obsidian’s tab: tab ' + tabExists + ', section ' + secExists);
	if (tabExists && secExists) t.eq(secText.slice('Bravo start.\n'.length), tabText.slice('Loose start.\n'.length), 'and it holds what the tab holds: ' + J(tabText));
});

test('ArrowDown from the last section of one folder goes into the next folder’s first section; the folder heading between them is no stop', async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder(${J(F)});
		await app.vault.createFolder(${J(F + '/Part One')}); await app.vault.createFolder(${J(F + '/Part Two')});
		await app.vault.create(${J(F + '/Part One/Arrival.md')}, ${J('Arrival.\n')});
		await app.vault.create(${J(F + '/Part Two/Wreck.md')}, ${J('Wreck.\n')});
		await new Promise(r => setTimeout(r, 900));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath(${J(F)}));
		return 1; })()`);
	await p.sleep(800);
	await openMs(p);
	t.eq(await p.ev(`${M}.scenes.length`), 2, 'two sections in the manuscript, one per folder');
	await place(p, F + '/Part One/Arrival.md', END);
	await p.key('ArrowDown');
	await p.sleep(350);
	t.eq(await focused(p), F + '/Part Two/Wreck.md', 'ArrowDown went into Wreck');
	await p.key('ArrowUp');
	await p.sleep(350);
	t.eq(await focused(p), F + '/Part One/Arrival.md', 'and ArrowUp went back into Arrival');
});

test('a picture in a section, clicked and then Backspace: the note comes out as it does when Obsidian’s own tab does the same', async (p, h, t) => {
	const PIC = 'Text before.\n\n![[pic.png]]\n\nText after.\n';
	await p.ev(`(async () => { const b = Uint8Array.from(atob(${J(PNG)}), c => c.charCodeAt(0)); await app.vault.createBinary('pic.png', b.buffer); await app.vault.adapter.write('Loose.md', ${J(PIC)}); return 1; })()`);
	await p.sleep(500);
	// Control: the note in a normal tab.
	await tab(p, 'Loose.md');
	await p.sleep(600);
	const img = (scope) => p.ev(`(() => { const i = ${scope}.querySelector('.cm-content img, img'); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
	const tabImg = await img(`window.__qa11Tab.view.containerEl`);
	t.ok(tabImg, 'the control shows the picture');
	if (tabImg) await p.click(tabImg.x, tabImg.y);
	await p.sleep(200);
	await p.key('Backspace');
	await saved(p);
	const tabText = disk(p, 'Loose.md');
	await closeTab(p);
	await p.sleep(300);
	// The section.
	await make(p, [['Alpha', 'Alpha.\n'], ['Bravo', PIC], ['Charlie', 'Charlie.\n']]);
	await place(p, N('Bravo'), END);
	await p.sleep(400);
	const secImg = await img(`${sc(N('Bravo'))}.el`);
	t.ok(secImg, 'the section shows the picture');
	if (secImg) await p.click(secImg.x, secImg.y);
	await p.sleep(200);
	await p.key('Backspace');
	await saved(p);
	const secText = disk(p, N('Bravo'));
	t.ok(tabText !== PIC, 'the control changed (Backspace took something): ' + J(tabText));
	t.eq(secText, tabText, 'the section’s note ends as the tab’s note does, after the same click and Backspace');
});
