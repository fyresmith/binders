// QA swarm, qa9-smoke: everyday writing on tonight's build (0.45.18). One short scenario per thing a writer does
// every day, driven through the real UI where it can be, and checked on the notes' files on disk. Every test also
// fails if the plugin logged an error while it ran. A test named "BUG: qa9 smoke: …" is a confirmed bug, left failing.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { B, NOTE, PL, VIEW, card, clickMenu, closeMenus, hoverMenu, exists, file, flush, j, menuItems, openView, read, reload, same, split, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md', S = L + 'Part One/Storm warning.md';
const PROLOGUE = L + 'Prologue.md', EPILOGUE = L + 'Epilogue.md';
const DIR = L + 'Snapshots/Part One/Arrival';
const DLG = '.modal.binders-snapshots';
const WIN = '.modal.binders-export';
const NOISE = /YAMLWarning: Unknown directive/;
const BODIES = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];

const test = (name, fn) => specs.push({
	name: 'qa9 smoke: ' + name,
	// the console check: whatever the plugin logged while this test ran (the runner clears the list before each test)
	fn: withTidy(async (p, h, t) => {
		await fn(p, h, t);
		const errs = p.errors.filter((e) => !NOISE.test(e) && /binders|exception/i.test(e));
		t.eq(errs.length, 0, 'no error logged by the plugin: ' + errs.join(' | ').slice(0, 400));
	}),
});

const words = (s) => s.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
const sorted = (xs) => [...xs].sort().join(' ');
const bodyWords = (all, paths) => paths.flatMap((x) => words(split(all[x] ?? '').body));
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`).then(() => p.sleep(500));
const order = (p) => p.ev(`${B}.orderedChildren(${file(L.slice(0, -1))}).map(c => c.path)`);
const at = (p, path) => p.at(card(path));
const mode = (p, m) => p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`).then(() => p.sleep(m === 'manuscript' ? 1500 : 600));
const bodyOf = async (p, path) => split(await read(p, path)).body;

/** A card's menu on the corkboard of a folder. */
async function cardMenu(p, path, folder) {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(500);
	const pt = await until(p, `(() => { const e = document.querySelector(${j(card(path))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 14 }; })()`);
	await p.right(pt.x, pt.y);
	await p.sleep(250);
}
const snapMenu = async (p, title) => { try { await hoverMenu(p, 'Snapshots'); } catch (e) { throw new Error(String(e.message) + ' | items: ' + (await menuItems(p)).join(', ')); } await clickMenu(p, title); };
/** The snapshot files of Arrival, read. */
const snapTexts = async (p, dir = DIR) => {
	const fs = await p.ev(`app.vault.adapter.exists(${j(dir)}).then(ok => ok ? app.vault.adapter.list(${j(dir)}).then(l => l.files) : [])`);
	return Promise.all(fs.map((f) => read(p, f)));
};
/** Every file under a folder, recursively. */
const allFiles = (p, dir) => p.ev(`(async () => { const out = []; const walk = async (d) => { const l = await app.vault.adapter.list(d); out.push(...l.files); for (const f of l.folders) await walk(f); }; if (await app.vault.adapter.exists(${j(dir)})) await walk(${j(dir)}); return out; })()`);
/** A button in the topmost modal, by its text. */
async function modalButton(p, sel, text) {
	const pt = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.textContent.trim().startsWith(${j(text)}) && e.getBoundingClientRect().width).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!pt) throw new Error(`no button “${text}” (${sel}) | buttons: ` + (await p.ev(`[...document.querySelectorAll('.modal button')].map(b => b.textContent.trim()).join(', ')`)) + ' | items: ' + (await p.ev(`document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item').length`)));
	await p.click(pt.x, pt.y);
	await p.sleep(300);
}

// 1. The explorer: binder order, a drag, the order after a reload
test('1 explorer: a binder’s notes show in binder order; a drag reorders them on disk, and the order sticks after a reload', async (p, h, t) => {
	const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
	const topRows = async () => {
		await p.ev(`(() => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); for (const f of ['The Lighthouse']) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`);
		await p.sleep(350);
		const all = await p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith('The Lighthouse/'))`);
		return all.filter((x) => x.split('/').length === 2);
	};
	await openView(p);
	const want = (await order(p)).map((x) => x);
	const shown = await topRows();
	t.eq(shown.join('|'), want.join('|'), 'the explorer lists the binder’s notes in the binder’s order');
	const from = await p.at(`.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="${PROLOGUE}"]`);
	const to = await p.at(`.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="${EPILOGUE}"]`);
	t.ok(from && to, 'both rows are on screen');
	if (from && to) {
		await p.move(from.x, from.y, 2);
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
		await p.move(from.x + 6, from.y + 6, 3, { buttons: 1 });
		const dy = to.y + to.height * 0.3;
		await p.move(to.x, dy, 10, { buttons: 1 });
		await p.sleep(250);
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: dy, button: 'left', clickCount: 1 });
	}
	await p.sleep(600);
	await flush(p);
	const after = await order(p);
	t.ok(after.indexOf(PROLOGUE) > after.indexOf(EPILOGUE) || after.join() !== want.join(), 'the drag moved Prologue: ' + after.join(', '));
	await reload(p);
	await openView(p);
	t.eq((await topRows()).join('|'), after.join('|'), 'after a reload the explorer shows the same order');
	t.eq((await order(p)).join('|'), after.join('|'), 'and the binder agrees with it');
});

// 2. The corkboard: a label, a drag, and Undo of the move
test('2 corkboard: a label set from a card is in its properties; a dragged card moves, and Undo takes the move back', async (p, h, t) => {
	await openView(p);
	await mode(p, 'corkboard');
	const before = await order(p);
	const at0 = await at(p, PROLOGUE);
	await p.right(at0.x, at0.y);
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Blue');
	await p.sleep(400);
	await flush(p);
	t.ok(/label: Blue/.test(split(await read(p, PROLOGUE)).yaml), 'the label is in the note’s properties: ' + split(await read(p, PROLOGUE)).yaml);
	t.ok(split(await read(p, PROLOGUE)).body.length > 0, 'the note’s text is still there');
	const from = await at(p, PROLOGUE), to = await at(p, EPILOGUE);
	await p.drag(from.x, from.y, to.x, to.y, 16);
	await p.sleep(400);
	await flush(p);
	const moved = await order(p);
	t.ok(moved.join() !== before.join(), 'the card moved in the order: ' + moved.join(', '));
	await run(p, 'undo-move');
	await flush(p);
	t.eq((await order(p)).join('|'), before.join('|'), 'Undo puts the order back');
});

// 3. The outliner: a sort, and the Export box off and on
test('3 outliner: a sort by a column sorts (the Export box is not in the default columns, not covered here)', async (p, h, t) => {
	await openView(p);
	await mode(p, 'outliner');
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-outliner-row[data-path="${EPILOGUE}"]')`);
	const head = await p.ev(`(() => { const th = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-th')].find(e => /^Words$/.test(e.textContent.trim())); if (!th) return null; const r = th.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, sort: th.getAttribute('aria-sort') }; })()`);
	t.ok(head, 'a Words column header');
	if (head) {
		await p.click(head.x, head.y);
		await p.sleep(400);
		const sort = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-th')].find(e => /^Words$/.test(e.textContent.trim()))?.getAttribute('aria-sort')`);
		t.ok(sort && sort !== head.sort && sort !== 'none', 'the column is sorted (aria-sort ' + head.sort + ' then ' + sort + ')');
	}
});

// 4. The manuscript: typing in two sections, Undo
test('4 manuscript: typing in two sections lands in each one’s file; Obsidian’s Undo takes back the last typing', async (p, h, t) => {
	await openView(p);
	await mode(p, 'manuscript');
	const endOf = (path) => p.ev(`(() => { const s = ${VIEW}.current.scenes.find(s => s.file.path === ${j(path)}); const ls = s ? [...s.el.querySelectorAll('.cm-line')] : []; if (!ls.length) return null; const r = ls[ls.length - 1].getBoundingClientRect(); return { x: r.right - 3, y: r.top + r.height / 2 }; })()`);
	const beforeA = await read(p, A), beforeK = await read(p, K);
	const ea = await endOf(A);
	t.ok(ea, 'Arrival has a section on the page');
	if (!ea) return;
	await p.click(ea.x, ea.y);
	await p.key('End');
	await p.type(' QA9ARRIVAL.');
	await p.sleep(300);
	const ek = await endOf(K);
	t.ok(ek, 'The keeper has a section on the page');
	if (!ek) return;
	await p.click(ek.x, ek.y);
	await p.key('End');
	await p.type(' QA9KEEPER.');
	await p.sleep(300);
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(K)}).then(s => s.includes('QA9KEEPER'))`, 6000);
	const a1 = await read(p, A), k1 = await read(p, K);
	t.ok(a1.includes('QA9ARRIVAL.') && !a1.includes('QA9KEEPER'), 'Arrival’s file has its own words only');
	t.ok(k1.includes('QA9KEEPER.') && !k1.includes('QA9ARRIVAL'), 'The keeper’s file has its own words only');
	t.ok(a1.replace(' QA9ARRIVAL.', '') === beforeA, 'nothing else in Arrival changed');
	const focusNow = await p.ev(`(() => { const e = document.activeElement; const sc = e?.closest?.('.binders-manuscript-scene, [data-path]'); return (e?.className ?? '') + ' in ' + (sc?.className ?? '') + ' ' + (sc?.dataset?.path ?? '') + ' | editable ' + !!e?.closest?.('.cm-content'); })()`);
	const undone = await p.ev(`(() => app.commands.executeCommandById('editor:undo'))()`);
	await p.sleep(400);
	await flush(p);
	const k2 = await read(p, K);
	t.ok(!k2.includes('QA9KEEPER'), 'Undo (editor:undo, ran: ' + undone + ') took back the typing in The keeper. Focus before undo: ' + focusNow + '. Tail now: ' + JSON.stringify(k2.slice(-160)) + ' | Arrival tail: ' + JSON.stringify((await read(p, A)).slice(-120)));
	t.eq(split(k2).body, split(beforeK).body, 'and the rest of The keeper is as it was');
	t.ok((await read(p, A)).includes('QA9ARRIVAL.'), 'Arrival keeps its typing');
});

// 4b. Control for test 4: the same typing and Undo in an ordinary note, outside the manuscript
test('4b control: typing in an ordinary note and Obsidian’s Undo (ctrl+z) takes it back', async (p, h, t) => {
	await h.open(K);
	const orig = await read(p, K);
	const pt = await until(p, `(() => { const ls = [...document.querySelectorAll('.workspace-leaf.mod-active .cm-line')]; if (!ls.length) return null; const r = ls[ls.length - 1].getBoundingClientRect(); return { x: r.right - 3, y: r.top + r.height / 2 }; })()`);
	t.ok(pt, 'the note is open in an editor');
	if (!pt) return;
	await p.click(pt.x, pt.y);
	await p.key('End');
	await p.type(' QA9CONTROL.');
	await p.sleep(300);
	await flush(p);
	t.ok((await read(p, K)).includes('QA9CONTROL.'), 'the typing is in the file');
	await p.key('z', 'ctrl');
	await p.sleep(400);
	await flush(p);
	t.ok(!(await read(p, K)).includes('QA9CONTROL'), 'Undo took the typing back (file now ends: ' + JSON.stringify((await read(p, K)).slice(-40)) + ')');
});

// 5. Split: no words lost
test('5 split: splitting a note at a line keeps every word of the binder’s notes', async (p, h, t) => {
	const before = await texts(p);
	await h.open(A);
	await p.ev(`(() => { app.workspace.activeEditor.editor.setCursor({ line: 2, ch: 0 }); return 1; })()`);
	await run(p, 'split-scene');
	await flush(p);
	await p.sleep(500);
	const now = await texts(p);
	const mine = (all) => Object.keys(all).filter((k) => k.startsWith(L) && !k.startsWith(L + 'Snapshots') && k !== NOTE);
	const b = bodyWords(before, mine(before)), a = bodyWords(now, mine(now));
	t.ok(mine(now).length > mine(before).length, 'a new note was made. Notes now: ' + mine(now).join(', ') + ' | cursor line text: ' + JSON.stringify(split(now[A]).body.split('\n').slice(0, 4)));
	t.eq(sorted(a), sorted(b), 'the same words, every one of them, across the binder’s notes');
});

// 6. Merge: no words lost
test('6 merge: merging two notes joins their text into the first, and keeps every word', async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	const a = await at(p, A), s = await at(p, S);
	await p.click(a.x, a.t + 12);
	await p.click(s.x, s.t + 12, { modifiers: 2 });
	await p.right(s.x, s.y);
	t.ok((await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`)).includes('Merge 2 notes'), 'the menu offers Merge 2 notes');
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await p.sleep(600);
	await flush(p);
	const now = await texts(p);
	t.eq(sorted(bodyWords(now, [A])), sorted(bodyWords(before, [A, S])), 'Arrival holds the words of both notes. Arrival now: ' + JSON.stringify((now[A] ?? '').slice(0, 400)) + ' | Storm warning exists: ' + (S in now));
	t.ok(!(await exists(p, S)), 'Storm warning is gone from the folder');
});

// 7. Snapshot, change, Show snapshots, Bring back
test('7 snapshot: a snapshot taken, the note changed, then Bring back: the text returns and the replaced text is kept', async (p, h, t) => {
	await cardMenu(p, A, L + 'Part One');
	await hoverMenu(p, 'Snapshots');
	await clickMenu(p, 'Take a snapshot');
	await until(p, `app.vault.adapter.exists(${j(DIR)})`, 4000);
	await p.sleep(400);
	const orig = await read(p, A);
	const body0 = split(orig).body;
	t.eq((await snapTexts(p)).length, 1, 'one snapshot is taken');
	await writeRaw(p, A, '---\nstatus: draft\n---\nQA9 REPLACED. Nothing of the old page is left.\n');
	await flush(p);
	await p.sleep(400);
	await cardMenu(p, A, L + 'Part One');
	await snapMenu(p, 'Show snapshots...');
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length > 0`, 5000);
	await p.ev(`(() => { const its = document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}); its[its.length - 1].click(); return 1; })()`);
	await p.sleep(400);
	await modalButton(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s.includes(${j(body0.trim().slice(0, 40))}))`, 6000);
	await p.sleep(400);
	t.eq(split(await read(p, A)).body.trim(), body0.trim(), 'the text is back, word for word');
	const kept = await snapTexts(p);
	t.ok(kept.some((s) => s.includes('QA9 REPLACED')), 'the replaced text is kept in a snapshot (' + kept.length + ' snapshots)');
});

// 8. Rewrite with a blank page
test('8 rewrite: “Rewrite…” with a blank page empties the note, and the old text is in a snapshot', async (p, h, t) => {
	const before = await texts(p);
	const body0 = split(await read(p, A)).body;
	await cardMenu(p, A, L + 'Part One');
	await snapMenu(p, 'Rewrite...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`, 4000);
	await modalButton(p, '.modal button', 'Start from a blank page');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s.replace(/^---[\\s\\S]*?\\n---\\n?/, '').trim() === '')`, 6000);
	await p.sleep(400);
	t.eq(split(await read(p, A)).body.trim(), '', 'the note is empty');
	const kept = await snapTexts(p);
	t.ok(kept.some((s) => split(s).body.trim() === body0.trim()) || kept.some((s) => s.includes(body0.trim().slice(0, 60))), 'the old text is in a snapshot');
	const after = await texts(p);
	same(t, before, after, { skip: [A] });
});

// 9. Snapshot of the binder; make a binder from it
test('9 binder snapshot: taken, listed, and “Make a binder from this snapshot” makes a second binder with the same notes', async (p, h, t) => {
	await openView(p);
	const b0 = (await allFiles(p, L + 'Snapshots')).length;
	await run(p, 'take-snapshots');
	await until(p, `app.vault.adapter.list(${j(L + 'Snapshots')}).then(() => true).catch(() => false)`, 3000);
	await p.sleep(500);
	t.ok((await allFiles(p, L + 'Snapshots')).length > b0, 'the binder snapshot is written');
	const btn = await p.at('.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="Snapshots"]');
	if (btn) { await p.click(btn.x, btn.y); await p.sleep(250); await clickMenu(p, 'Show snapshots...'); }
	const shown = await until(p, `!!document.querySelector(${j(DLG)})`, 5000);
	t.ok(shown, 'Show snapshots opens its dialog. Modals: ' + await p.ev(`[...document.querySelectorAll('.modal')].map(m => m.className).join(' | ') + ' || notices: ' + [...document.querySelectorAll('.notice')].map(n => n.textContent).join('|')`));
	if (!shown) return;
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length > 0`, 5000);
	const listed = await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length`);
	t.ok(listed >= 1, 'the snapshot is listed: ' + listed);
	const more = await p.at(`${DLG} .modal-setting-titlebar-actions [aria-label="More"]`);
	if (!more) throw new Error('no More button in the snapshot dialog');
	await p.click(more.x, more.y);
	await p.sleep(250);
	await clickMenu(p, 'Make a binder from this snapshot');
	await until(p, `/^Made/.test([...document.querySelectorAll('.notice')].map(n => n.textContent).join('|'))`, 30000);
	await p.sleep(500);
	const mdOf = (dir) => p.ev(`app.vault.getMarkdownFiles().map(f => f.path).filter(x => x.startsWith(${j(dir)})).map(x => x.slice(${j(dir).length}))`);
	const mine = (await mdOf(L)).filter((x) => !x.startsWith('Snapshots/')).sort();
	const newDir = await p.ev(`app.vault.getAllLoadedFiles().filter(f => f.children && f.path.startsWith('The Lighthouse (') && f.parent?.isRoot()).map(f => f.path)[0] ?? null`);
	t.ok(newDir, 'a new binder folder beside it: ' + newDir);
	if (newDir) {
		const theirs = (await mdOf(newDir + '/')).sort();
		t.eq(theirs.join('|'), mine.join('|'), 'with the same notes');
	}
});

// 10. Export as Word, defaults
test('10 export: Word with the defaults writes The Lighthouse.docx to Exports, with the book’s words in order', async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`(() => { const pl = ${PL}; window.__bx ??= { real: pl.exportHost.desktop }; pl.exportHost.desktop = (app) => { const d = window.__bx.real(app); return d && { ...d, pick: async (start) => start }; }; return 1; })()`);
	try {
		await openView(p);
		await run(p, 'export');
		await until(p, `!!document.querySelector('${WIN} .binders-export-paper .binders-export-section, ${WIN} .binders-export-note > *')`, 6000);
		await p.sleep(150);
		const pt = await until(p, `(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === 'Export' && b.getBoundingClientRect().width).pop(); if (!b) return null; b.click(); return true; })()`);
		t.ok(pt, 'the Export button is there and pressed');
		const saved = await until(p, `(document.querySelector('${WIN} .binders-export-status')?.textContent ?? '').startsWith('Saved to')`, 8000);
		t.ok(saved, 'the bar says it was saved');
		const at = join(p.vaultDir, 'Exports', 'The Lighthouse.docx');
		t.ok(existsSync(at), 'the Word file is there');
		if (existsSync(at)) {
			const z = unzipSync(new Uint8Array(readFileSync(at)));
			const xml = strFromU8(z['word/document.xml'] ?? new Uint8Array());
			const un = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
			const paras = [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g)].filter((m) => !/<w:pStyle w:val="(?!Normal")/.test(m[0])).map((m) => [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((x) => un(x[1])).join(''));
			const got = paras.join(' ');
			const want = BODIES.flatMap((n) => words(split(before[`${L}${n}.md`] ?? '').body));
			t.eq(sorted(words(got)), sorted(want), 'the file has the book’s words, every one of them');
		}
	} finally {
		await p.key('Escape');
		await p.sleep(200);
		await p.ev(`(() => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; return 1; })()`);
	}
});

// 11. Focus mode on and off
test('11 focus: focus mode on and off leaves the note’s text untouched', async (p, h, t) => {
	await h.open(A);
	const bytes = await read(p, A);
	await run(p, 'focus');
	await p.sleep(600);
	const on = await p.ev(`document.body.classList.contains('binders-focus')`);
	t.ok(on, 'focus mode is on');
	await p.sleep(300);
	t.eq(await read(p, A), bytes, 'the note is the same while focused');
	await run(p, 'focus');
	await p.sleep(600);
	t.ok(!(await p.ev(`document.body.classList.contains('binders-focus')`)), 'and off again');
	await flush(p);
	t.eq(await read(p, A), bytes, 'the note is the same after focus mode is off');
});

// 12. Settings: every toggle flipped and flipped back
test('12 settings: the Binders tab opens; every toggle flips and flips back, and the page is as it was', async (p, h, t) => {
	const TAB = `app.setting.activeTab.containerEl`;
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `${TAB}.querySelectorAll('.binders-settings-label').length > 0 || ${TAB}.querySelectorAll('input[type="checkbox"]').length > 0`, 5000);
	const state = () => p.ev(`[...${TAB}.querySelectorAll('input[type="checkbox"]')].map(b => (b.closest('.setting-item')?.querySelector('.setting-item-name')?.textContent ?? '?') + '=' + b.checked)`);
	const flip = (i) => p.ev(`(() => { const b = [...${TAB}.querySelectorAll('input[type="checkbox"]')][${i}]; if (!b) return false; b.click(); return true; })()`);
	const start = await state();
	t.ok(start.length > 0, 'the tab has toggles: ' + start.length);
	for (let i = 0; i < start.length; i++) {
		await flip(i);
		await p.sleep(250);
		await flip(i);
		await p.sleep(250);
	}
	t.eq(sorted(await state()), sorted(start), 'every toggle is back where it was');
	await p.key('Escape');
});
