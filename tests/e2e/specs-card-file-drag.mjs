// A card or an outliner row dragged out of the binder view is a file anywhere Obsidian takes one
// (src/view/file-drag.ts): each place that takes it, the refusals, Escape, the view closing, a drop on nothing, typing
// that isn't saved yet, a tablet by touch, and what's left when Obsidian has no drag manager to hand the drag to.
import { B, NOTE, VIEW, contents, flush, j, openView, read, reload, same, texts, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'card file drag: ' + name, fn });

const L = 'The Lighthouse/';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const BV = '.workspace-leaf-content[data-type="binders-view"]';
const X = '.workspace-leaf-content[data-type="file-explorer"]';
/** The pane beside the binder view (a note or a canvas opened with `beside`). */
const R = '.workspace-split.mod-root .workspace-tabs:last-child';
const card = (path) => `${BV} .binders-card[data-path="${L}${path}"]`;
const orow = (path) => `${BV} .binders-outliner-row[data-path="${L}${path}"] .binders-outliner-name`;
const row = (path) => `${X} .tree-item-self[data-path="${path}"]`;
const press = (p, x, y) => p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
const letGo = async (p, x, y, wait = 700) => { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await p.sleep(wait); };
/** Presses at a point and moves to another with the button held: the drag stays open until `letGo`. */
async function hold(p, from, to, steps = 12) {
	await p.focusMain();
	await p.move(from.x, from.y, 2);
	await press(p, from.x, from.y);
	await p.move(to.x, to.y, steps, { buttons: 1 });
	await p.sleep(250);
}
/** A card's point to take it by: its head, clear of the synopsis. */
const grip = async (p, path) => { const a = await p.at(card(path)); if (!a) throw new Error('no card ' + path); return { x: a.x, y: a.t + 14 }; };
/** What a drag shows right now. */
const state = (p) => p.ev(`(() => {
	const d = app.dragManager.draggable, g = document.querySelector('.drag-ghost.binders-file-ghost:not(.is-leaving)'), c = document.querySelector('.binders-drag-ghost'), o = document.querySelector('.binders-outliner-ghost'), a = g?.querySelector('.drag-ghost-action');
	return {
		file: d ? d.type + ':' + (d.file?.path ?? (d.files ?? []).map(f => f.path).join(',')) : null,
		source: d?.source ?? null,
		ghost: g?.isConnected ? g.querySelector('.drag-ghost-self')?.textContent ?? '' : null,
		morph: !!g?.classList.contains('mod-morph'),
		action: a && getComputedStyle(a).display !== 'none' ? a.textContent : '',
		card: c ? (c.classList.contains('is-handed-over') ? 'handed over' : 'card') : null,
		rows: o ? (getComputedStyle(o).display === 'none' ? 'hidden' : 'shown') : null,
		boardLine: !!document.querySelector('.binders-drop-indicator.is-active, .binders-drop-line.is-active'),
		explorerLine: !!document.querySelector('.binders-explorer-drop'),
		into: [...document.querySelectorAll('${X} .is-being-dragged-over')].map(e => e.dataset.path ?? e.className),
		grabbing: document.body.classList.contains('is-grabbing'),
	};
})()`);
/** Anything a drag could leave behind, here or in Obsidian's drag manager. */
const leftovers = (p) => p.ev(`[...document.querySelectorAll('.binders-drag-ghost, .binders-outliner-ghost, .drag-ghost, .binders-drop-indicator, .binders-drop-line, .binders-explorer-drop, .binders-card.is-dragging, .binders-outliner-row.is-dragging, .is-being-dragged-over')].map(e => String(e.className)).concat(document.body.classList.contains('is-grabbing') ? ['body.is-grabbing'] : [], app.dragManager.draggable ? ['dragManager.draggable'] : [], app.dragManager.ghostEl ? ['dragManager.ghostEl'] : [])`);
const clean = async (p, t, what) => t.eq(j(await leftovers(p)), '[]', `${what}: nothing of the drag is left`);
/** Folds every folder in the file explorer but these, so a test finds the rows it expects whatever ran before it. */
async function folds(p, open = []) {
	await p.ev(`(async () => { const leaf = app.workspace.getLeavesOfType('file-explorer')[0]; await app.workspace.revealLeaf(leaf); const want = ${j(open)}; for (const path of Object.keys(leaf.view.fileItems).sort((a, b) => a.length - b.length)) { const it = leaf.view.fileItems[path]; if (it?.file?.children && typeof it.setCollapsed === 'function') await it.setCollapsed(!want.includes(path), false); } })().then(() => 1)`);
	await p.sleep(300);
}
const folded = (p, path) => p.ev(`app.workspace.getLeavesOfType('file-explorer')[0].view.fileItems[${j(path)}].collapsed`);
/** A note or a canvas in a split to the right of the binder view. */
async function beside(p, path, text = '') {
	await p.ev(`(async () => { let f = app.vault.getAbstractFileByPath(${j(path)}); if (!f) f = await app.vault.create(${j(path)}, ${j(text)}); const leaf = app.workspace.getLeaf('split', 'vertical'); await leaf.openFile(f); })().then(() => 1)`);
	await p.sleep(700);
}
const notes = (p) => p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.file?.path)`);
const cardNames = (p) => p.ev(`[...document.querySelectorAll('${BV} .binders-card[data-path]')].map(c => c.dataset.path.slice(${L.length}))`);
const undoable = (p, binder = 'The Lighthouse') => p.ev(`${B}.undoable(${j(binder)})`);
/** Notices showing, read and cleared. */
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); const out = []; for (const d of docs) d.querySelectorAll('.notice').forEach(n => { if (n.textContent) out.push(n.textContent); n.remove(); }); return out; })()`);
const outliner = async (p, folder = 'The Lighthouse') => { await openView(p, folder); await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`); await until(p, `!!document.querySelector('${BV} .binders-outliner-row')`); await p.sleep(250); };
const filesLike = (p, re) => p.ev(`app.vault.getFiles().map(f => f.path).filter(x => ${re}.test(x)).sort()`);

// ---- the hand-off itself ----

test('leaving the view the card becomes Obsidian’s own file drag, and coming back it’s a card again that drops on the board as ever', async (p, h, t) => {
	await openView(p);
	await folds(p, ['The Lighthouse']);
	const a = await grip(p, 'Epilogue.md'), r = await p.at(row(L + 'Prologue.md')), first = await p.at(card('Prologue.md'));
	// held over the board: a card, and nothing of Obsidian's
	await hold(p, a, { x: a.x - 60, y: a.y + 30 });
	let s = await state(p);
	t.eq(j([s.card, s.file, s.ghost]), j(['card', null, null]), 'over the board it’s the board’s own drag');
	// out, over the file explorer
	await p.move(r.x, r.y + 2, 8, { buttons: 1 });
	await p.sleep(250);
	s = await state(p);
	t.eq(s.card, 'handed over', 'outside the view the card in hand is handed over');
	t.eq(s.file, 'file:' + L + 'Epilogue.md', 'Obsidian’s drag manager holds the note, as for a row of the file explorer');
	t.eq(s.source, 'binders', 'and knows where it came from');
	t.eq(s.ghost, 'Epilogue', 'Obsidian’s own drag ghost says its name');
	t.ok(s.morph, 'the ghost is the one the card turned into');
	t.eq(s.boardLine, false, 'no line on the board meanwhile');
	t.ok(s.grabbing, 'the grabbing hand');
	t.eq(await p.ev(`document.querySelectorAll('${BV} .binders-card.is-dragging').length`), 1, 'the card’s slot on the board stays as it was, dimmed');
	await p.sleep(300);
	t.eq(await p.ev(`(() => { const g = document.querySelector('.binders-drag-ghost > .binders-card'); return getComputedStyle(g).opacity; })()`), '0', 'the card itself has shrunk away');
	// back in, before the first card
	await p.move(first.l + 6, first.y, 8, { buttons: 1 });
	await p.sleep(350);
	s = await state(p);
	t.eq(j([s.card, s.file, s.ghost, s.explorerLine]), j(['card', null, null, false]), 'back over the view: a card again, and Obsidian’s drag is over');
	t.eq(await p.ev(`document.querySelectorAll('.drag-ghost').length`), 0, 'Obsidian’s ghost is gone (its fading copy too)');
	t.ok(s.grabbing && s.boardLine, 'the board’s drag goes on: the hand, and a line where it would go');
	await letGo(p, first.l + 6, first.y);
	await flush(p);
	t.eq(j(await contents(p)), j(['Epilogue', ...LIST.slice(0, -1)]), 'let go there, it moves on the board as ever');
	await clean(p, t, 'after the drop');
});

test('the change is quick and keeps to “reduce motion”: the card shrinks into the ghost in Obsidian’s own timing, or at once', async (p, h, t) => {
	await openView(p);
	await folds(p, ['The Lighthouse']);
	const look = () => p.ev(`(() => { const c = document.querySelector('.binders-drag-ghost > .binders-card'), g = document.querySelector('.drag-ghost.binders-file-ghost:not(.is-leaving)'), cs = getComputedStyle(c), gs = g ? getComputedStyle(g) : null; return { card: cs.transitionDuration, cardWhat: cs.transitionProperty, ghost: gs?.animationName ?? null, ghostFor: gs?.animationDuration ?? null, leaving: document.querySelectorAll('.drag-ghost.is-leaving').length }; })()`);
	const a = await grip(p, 'Epilogue.md'), r = await p.at(row(L + 'Prologue.md'));
	await hold(p, a, { x: r.x, y: r.y + 2 });
	let s = await look();
	t.eq(j([s.card, s.ghost, s.ghostFor]), j(['0.3s, 0.3s', 'binders-file-ghost-in', '0.3s']), 'out: the card shrinks and the ghost grows, both in the 300ms Obsidian gives a dragged item');
	t.ok(/transform/.test(s.cardWhat) && /opacity/.test(s.cardWhat), 'by its size and its opacity: ' + s.cardWhat);
	await p.move(a.x, a.y, 8, { buttons: 1 });
	await p.sleep(30);
	s = await look();
	t.eq(s.leaving, 1, 'back: the ghost fades where it was, as it came');
	await p.sleep(650);
	t.eq((await look()).leaving, 0, 'and is gone');
	await letGo(p, a.x, a.y);
	// "reduce motion"
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	try {
		await hold(p, a, { x: r.x, y: r.y + 2 });
		s = await look();
		t.ok(!/transform/.test(s.cardWhat) && s.ghost === 'none', 'reduced motion: nothing shrinks or grows, the one takes the other’s place: ' + j(s));
		t.eq((await state(p)).card, 'handed over', 'and it is still handed over');
		await p.move(a.x, a.y, 8, { buttons: 1 });
		await p.sleep(30);
		t.eq((await look()).leaving, 0, 'nothing fades on the way back');
		await letGo(p, a.x, a.y);
	} finally { await p.send('Emulation.setEmulatedMedia', { features: [] }); }
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	await clean(p, t, 'after both');
});

// ---- the file explorer ----

test('explorer, inside the binder: dropped between two rows of a folder, the card is placed there in binder order, and “Undo last move” takes it back', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await folds(p, ['The Lighthouse', L + 'Part One']);
	const a = await grip(p, 'Epilogue.md'), r = await p.at(row(L + 'Part One/The keeper.md'));
	await hold(p, a, { x: r.x, y: r.t + 3 });
	const s = await state(p);
	t.eq(s.action, 'Move before “The keeper”', 'the ghost says where it would go');
	t.ok(s.explorerLine && !s.boardLine, 'the explorer’s line shows, the board’s doesn’t');
	await letGo(p, r.x, r.t + 3);
	await flush(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Epilogue', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'placed before “The keeper”, in the binder’s list');
	t.eq(j(await filesLike(p, '/Epilogue/')), j([L + 'Part One/Epilogue.md']), 'moved, not copied');
	t.eq(j(await cardNames(p)), j(['Prologue.md', 'Part One', 'Part Two']), 'and off the board, which shows the binder’s own folder');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Epilogue.md']: L + 'Part One/Epilogue.md' } });
	t.eq(await undoable(p), 'Move “Epilogue”', 'the move can be undone');
	await clean(p, t, 'after the drop');
	await p.ev(`${B}.undo('The Lighthouse').then(() => 1)`);
	await p.sleep(600);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'undone: the list is as it was');
	same(t, before, await texts(p), { skip: [NOTE] });
});

test('explorer: a folded folder in the binder springs open under the drag, and the card can then go between its rows', async (p, h, t) => {
	await openView(p);
	await folds(p, ['The Lighthouse']);
	const a = await grip(p, 'Epilogue.md'), r = await p.at(row(L + 'Part One'));
	t.eq(await folded(p, L + 'Part One'), true, 'folded to begin with');
	await hold(p, a, r);
	t.eq((await state(p)).action, 'Move into “Part One”', 'over its middle: into it');
	t.eq(await folded(p, L + 'Part One'), true, 'not at once');
	await p.sleep(1100);
	t.eq(await folded(p, L + 'Part One'), false, 'held there, it opens');
	const k = await p.at(row(L + 'Part One/The keeper.md'));
	await p.move(k.x, k.t + 3, 6, { buttons: 1 });
	await p.sleep(250);
	t.eq((await state(p)).action, 'Move before “The keeper”', 'and its rows take the card');
	await letGo(p, k.x, k.t + 3);
	await flush(p);
	t.eq(j((await contents(p)).slice(1, 6)), j(['Part One/', 'Part One/Arrival', 'Part One/Epilogue', 'Part One/The keeper', 'Part One/Storm warning']), 'placed there');
	await clean(p, t, 'after the drop');
});

test('explorer, a plain folder: Obsidian moves the note there, renames it on a clash and updates links; it leaves the binder and nothing is copied', async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`(async () => { await app.vault.createFolder('Notes'); await app.vault.create('Notes/Epilogue.md', 'another epilogue'); await app.vault.create('Elsewhere.md', 'See [[Notes/Epilogue]] and [[The Lighthouse/Epilogue]].'); })().then(() => 1)`);
	await p.sleep(600);
	await openView(p);
	await folds(p, ['The Lighthouse']);
	const a = await grip(p, 'Epilogue.md'), r = await p.at(row('Notes'));
	await hold(p, a, r);
	const s = await state(p);
	t.eq(s.action, 'Move into “Notes”', 'Obsidian’s own words for it');
	t.eq(s.explorerLine, false, 'not a place in a binder: no line of ours');
	await letGo(p, r.x, r.y, 1200);
	await flush(p);
	t.eq(j(await filesLike(p, '/Epilogue/')), j(['Notes/Epilogue 1.md', 'Notes/Epilogue.md']), 'moved beside the note of the same name, under a new one');
	t.eq(await read(p, 'Notes/Epilogue 1.md'), before[L + 'Epilogue.md'], 'its text is what it was');
	t.eq(await read(p, 'Notes/Epilogue.md'), 'another epilogue', 'the note already there is untouched');
	t.eq(await read(p, 'Elsewhere.md'), 'See [[Notes/Epilogue]] and [[Epilogue 1]].', 'links follow it');
	t.eq(j(await contents(p)), j(LIST.slice(0, -1)), 'it’s out of the binder’s list');
	t.eq(j(await cardNames(p)), j(['Prologue.md', 'Part One', 'Part Two']), 'and off the board');
	same(t, before, await texts(p), { skip: [NOTE, L + 'Epilogue.md'] });
	await clean(p, t, 'after the drop');
});

test('explorer, the empty space under the list: the note goes to the vault’s root', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await folds(p, []);
	const a = await grip(p, 'Prologue.md'), c = await p.at(`${X} .nav-files-container`);
	const to = { x: c.x, y: c.t + c.h - 60 };
	await hold(p, a, to);
	t.ok(/^Move into /.test((await state(p)).action), 'Obsidian’s own: into the vault');
	await letGo(p, to.x, to.y, 1200);
	await flush(p);
	t.eq(j(await filesLike(p, '/Prologue/')), j(['Prologue.md']), 'moved to the root');
	t.eq(await read(p, 'Prologue.md'), before[L + 'Prologue.md'], 'its text is what it was');
	t.eq(j(await contents(p)), j(LIST.slice(1)), 'out of the binder’s list');
	await clean(p, t, 'after the drop');
});

test('explorer, another binder: the card is placed among that binder’s rows, in its order, and can be undone there (a Longform project too)', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Other'); await app.vault.create('Other/One.md', 'one'); await app.vault.create('Other/Two.md', 'two'); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Other')); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(800);
	const before = await texts(p);
	await openView(p, L + 'Part One');
	await folds(p, ['Other', 'Longform demo']);
	let a = await grip(p, 'Part One/Arrival.md'), r = await p.at(row('Other/Two.md'));
	await hold(p, a, { x: r.x, y: r.t + 3 });
	t.eq((await state(p)).action, 'Move before “Two”', 'a place in the other binder');
	await letGo(p, r.x, r.t + 3, 1000);
	await flush(p);
	t.eq(j(await contents(p, 'Other/Other.md')), j(['One', 'Arrival', 'Two']), 'placed there, in the other binder’s list');
	t.eq(j(await contents(p)), j(LIST.filter((x) => x !== 'Part One/Arrival')), 'and out of this one’s');
	t.eq(j(await filesLike(p, '/Arrival/')), j(['Other/Arrival.md']), 'moved, not copied');
	t.eq(await undoable(p, 'Other'), 'Move “Arrival”', 'undoable from the binder it went to');
	// a Longform project: among its scenes
	a = await grip(p, 'Part One/The keeper.md'); r = await p.at(row('Longform demo/Island.md'));
	await hold(p, a, { x: r.x, y: r.t + 3 });
	t.eq((await state(p)).action, 'Move before “Island”', 'a place among the project’s scenes');
	await letGo(p, r.x, r.t + 3, 1000);
	await flush(p);
	t.ok(/- The keeper\n\s+- Island/.test(await read(p, 'Longform demo/Index.md')), 'listed before “Island” in longform.scenes: ' + (await read(p, 'Longform demo/Index.md')).split('---')[1]);
	same(t, before, await texts(p), { skip: [NOTE, 'Other/Other.md', 'Longform demo/Index.md'], moved: { [L + 'Part One/Arrival.md']: 'Other/Arrival.md', [L + 'Part One/The keeper.md']: 'Longform demo/The keeper.md' } });
	await clean(p, t, 'after both');
});

// ---- everything else that takes a note ----

test('a note’s editor takes a card as a link where it’s dropped; the card stays on the board; a stack does nothing there', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await beside(p, 'Scratch.md', 'first line\n\nsecond line\n');
	const ed = await p.at(`${R} .cm-content`), to = { x: ed.l + 60, y: ed.t + 12 };
	await hold(p, await grip(p, 'Prologue.md'), to);
	const s = await state(p);
	t.eq(j([s.card, s.action]), j(['handed over', 'Insert link here']), 'over the text: a link would go in');
	await letGo(p, to.x, to.y);
	const text = await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`);
	t.ok(/^first[^\n]*\[\[Prologue\]\]/.test(text) && text.replace('[[Prologue]]', '') === 'first line\n\nsecond line\n', 'a link to the note, in the line it was dropped on: ' + j(text));
	t.eq(j(await cardNames(p)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'the card is still on the board');
	t.eq(await p.ev(`document.querySelectorAll('${BV} .binders-card.is-dragging').length`), 0, 'and no longer dimmed');
	// a stack
	const st = await p.at(card('Part Two'));
	await hold(p, { x: st.x, y: st.t + 14 }, to);
	t.eq((await state(p)).file, 'folder:' + L + 'Part Two', 'a stack is a folder');
	await letGo(p, to.x, to.y);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`), text, 'a folder dropped on the text changes nothing');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved in the binder');
	same(t, before, await texts(p));
	await clean(p, t, 'after both');
});

test('a canvas takes a card as a file node, and a stack as one node for each note in it (not its folder note)', async (p, h, t) => {
	await p.ev(`${B}.ensureFolderNote(app.vault.getAbstractFileByPath(${j(L + 'Part Two')})).then(() => 1)`);
	await p.sleep(400);
	await openView(p);
	try {
		await beside(p, 'Board.canvas', '{}');
		const nodes = () => p.ev(`app.workspace.getLeavesOfType('canvas')[0].view.canvas.getData().nodes.map(n => n.type + ':' + n.file).sort()`);
		const cv = await p.at(`${R} .canvas-wrapper`);
		await hold(p, await grip(p, 'Prologue.md'), { x: cv.x - 120, y: cv.y - 150 });
		t.eq((await state(p)).card, 'handed over', 'over the canvas it’s a file');
		await letGo(p, cv.x - 120, cv.y - 150);
		t.eq(j(await nodes()), j(['file:' + L + 'Prologue.md']), 'a file node of the note');
		const st = await p.at(card('Part Two'));
		await hold(p, { x: st.x, y: st.t + 14 }, { x: cv.x + 40, y: cv.y + 220 });
		t.eq((await state(p)).file, `files:${L}Part Two/The wreck.md,${L}Part Two/Lights out.md`, 'over a canvas a stack is the notes in it, in order');
		await letGo(p, cv.x + 40, cv.y + 220);
		t.eq(j(await nodes()), j(['file:' + L + 'Part Two/Lights out.md', 'file:' + L + 'Part Two/The wreck.md', 'file:' + L + 'Prologue.md']), 'one node for each note of the stack, and none for the folder’s own note');
		await flush(p);
		t.eq(j(await contents(p)), j(LIST), 'nothing moved in the binder');
		await clean(p, t, 'after both');
	} finally {
		await p.ev(`(async () => { app.workspace.getLeavesOfType('canvas').forEach(l => l.detach()); const f = app.vault.getAbstractFileByPath('Board.canvas'); if (f) await app.vault.delete(f); })().then(() => 1)`);
	}
});

test('a tab takes a card as the note opened in it, the space beside the tabs as a new tab; the binder view’s own header and tab take nothing', async (p, h, t) => {
	await openView(p);
	await beside(p, 'Scratch.md', 'a note');
	const tab = await p.at(`${R} .workspace-tab-header`);
	await hold(p, await grip(p, 'Prologue.md'), tab);
	t.eq((await state(p)).action, 'Open in this tab', 'over a tab');
	await letGo(p, tab.x, tab.y);
	t.eq(j(await notes(p)), j([L + 'Prologue.md']), 'the note opens in that tab');
	const plus = await p.at(`${R} .workspace-tab-header-new-tab`), strip = { x: plus.x + 80, y: plus.y };
	await hold(p, await grip(p, 'Epilogue.md'), strip);
	t.eq((await state(p)).action, 'Open as new tab', 'beside the tabs');
	await letGo(p, strip.x, strip.y);
	t.eq(j((await notes(p)).sort()), j([L + 'Epilogue.md', L + 'Prologue.md']), 'a new tab with the note');
	// its own header, and its own tab: a note dropped there would open in place of the binder
	const center = (pick) => p.ev(`(() => { const e = (${pick})(document.querySelector('${BV}')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	for (const [what, pick] of [['header', `v => v.querySelector('.view-header-title-container')`], ['tab', `v => v.closest('.workspace-tabs').querySelector('.workspace-tab-header.is-active')`]]) {
		const at = await center(pick);
		t.ok(at, `the view’s own ${what} is there`);
		await hold(p, await grip(p, 'Prologue.md'), at);
		const s = await state(p);
		t.eq(j([s.card, s.file, s.ghost]), j(['card', null, null]), `over its own ${what} the card stays a card`);
		await letGo(p, at.x, at.y);
		t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, `let go on its own ${what}: the binder view is still there`);
		t.eq((await notes(p)).length, 2, 'and nothing else opened');
	}
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved in the binder');
	await clean(p, t, 'after all of it');
});

test('the bookmarks take a card as a bookmark of the note (an empty list takes nothing, and nothing breaks)', async (p, h, t) => {
	const items = () => p.ev(`app.internalPlugins.getPluginById('bookmarks').instance.items.map(i => i.type + ':' + i.path)`);
	await openView(p);
	try {
		await p.ev(`app.workspace.revealLeaf(app.workspace.getLeavesOfType('bookmarks')[0]).then(() => 1)`);
		await p.sleep(400);
		const pane = await p.at('.workspace-leaf-content[data-type="bookmarks"]');
		await hold(p, await grip(p, 'Prologue.md'), { x: pane.x, y: pane.t + 120 });
		t.eq((await state(p)).card, 'handed over', 'over the bookmarks it’s a file');
		await letGo(p, pane.x, pane.t + 120);
		t.eq(j(await items()), '[]', 'an empty list of bookmarks takes nothing (Obsidian’s own handler can’t place a drop in one)');
		await p.ev(`(() => { app.internalPlugins.getPluginById('bookmarks').instance.addItem({ type: 'file', ctime: Date.now(), path: ${j(L + 'Part One/Arrival.md')} }); return 1; })()`);
		await p.sleep(400);
		const bm = await p.at('.workspace-leaf-content[data-type="bookmarks"] .tree-item-self');
		await hold(p, await grip(p, 'Prologue.md'), { x: bm.x, y: bm.t + bm.h + 2 });
		await letGo(p, bm.x, bm.t + bm.h + 2);
		t.eq(j((await items()).sort()), j(['file:' + L + 'Part One/Arrival.md', 'file:' + L + 'Prologue.md']), 'a bookmark of the note');
		await flush(p);
		t.eq(j(await contents(p)), j(LIST), 'nothing moved in the binder');
		await clean(p, t, 'after both');
	} finally {
		await p.ev(`(async () => { const b = app.internalPlugins.getPluginById('bookmarks').instance; for (const i of [...b.items]) b.removeItem(i); await app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); })().then(() => 1)`);
	}
});

// ---- refusals, and ways out ----

test('a stack can’t go into itself or a folder inside it, and a name already there is refused: the ghost says why, a notice says it when let go, nothing moves', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + 'Part One/Deep')}); await app.vault.create(${j(L + 'Part One/Deep/Far.md')}, 'far'); await app.vault.create(${j(L + 'Part Two/Epilogue.md')}, 'another'); })().then(() => 1)`);
	await p.sleep(800);
	await flush(p);
	const before = await texts(p), list = j(await contents(p));
	await openView(p);
	await folds(p, ['The Lighthouse', L + 'Part One', L + 'Part One/Deep', L + 'Part Two']);
	await notices(p);
	const stack = async () => { const s = await p.at(card('Part One')); return { x: s.x, y: s.t + 14 }; };
	const tryAt = async (from, sel, why, edge = false) => {
		const r = await p.at(sel), to = { x: r.x, y: edge ? r.t + 3 : r.y };
		await hold(p, from, to);
		const s = await state(p);
		t.eq(s.action, why, 'the ghost says why not');
		t.eq(j([s.explorerLine, s.into]), j([false, []]), 'no line, nothing marked');
		await letGo(p, to.x, to.y);
		t.eq(j(await notices(p)), j([why + '.']), 'let go there, a notice says it');
		await flush(p);
		t.eq(j(await contents(p)), list, 'nothing moved');
		await clean(p, t, why);
	};
	await tryAt(await stack(), row(L + 'Part One'), '“Part One” can’t be moved into itself');
	await tryAt(await stack(), row(L + 'Part One/Arrival.md'), '“Part One” can’t be moved into itself', true);
	await tryAt(await stack(), row(L + 'Part One/Deep/Far.md'), '“Part One” can’t be moved into a folder inside it', true);
	await tryAt(await grip(p, 'Epilogue.md'), row(L + 'Part Two/The wreck.md'), '“Part Two” already has “Epilogue”', true);
	// refused, then brought back to the board: it wasn't let go there, so nothing is said
	const r = await p.at(row(L + 'Part One/Arrival.md')), a = await stack();
	await hold(p, a, { x: r.x, y: r.t + 3 });
	await p.move(a.x, a.y, 8, { buttons: 1 });
	await letGo(p, a.x, a.y);
	t.eq(j(await notices(p)), '[]', 'brought back to the board: no notice');
	same(t, before, await texts(p));
});

test('Escape outside the view ends the drag and Obsidian’s with it; the button let go afterwards does nothing', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await folds(p, ['The Lighthouse']);
	const a = await grip(p, 'Prologue.md'), r = await p.at(row(L + 'Part Two'));
	await hold(p, a, r);
	const s = await state(p);
	t.eq(j([s.card, s.action, s.into]), j(['handed over', 'Move into “Part Two”', [L + 'Part Two']]), 'held over a folder in the explorer');
	await p.key('Escape');
	await p.sleep(300);
	await clean(p, t, 'Escape');
	await letGo(p, r.x, r.y);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	t.eq(j(await cardNames(p)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'the card is where it was');
	same(t, before, await texts(p));
	await clean(p, t, 'after letting go');
});

test('the view closed in the middle of a drag outside it: nothing of the drag is left, and the button let go moves nothing', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await folds(p, ['The Lighthouse']);
	const a = await grip(p, 'Prologue.md'), r = await p.at(row(L + 'Part Two'));
	await hold(p, a, r);
	t.eq((await state(p)).card, 'handed over', 'held over the explorer');
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].detach(); return 1; })()`);
	await p.sleep(300);
	await clean(p, t, 'the view closed');
	await letGo(p, r.x, r.y);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	same(t, before, await texts(p));
	await clean(p, t, 'after letting go');
});

test('let go where nothing takes a note (the ribbon, off the window): the card is back where it was', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	for (const [what, at] of [['the ribbon', await p.at('.workspace-ribbon.mod-left')], ['below the window', { x: 700, y: p.height + 80 }]]) {
		t.ok(at, what + ' is there');
		const a = await grip(p, 'Epilogue.md');
		await hold(p, a, at);
		const s = await state(p);
		t.eq(j([s.card, s.file]), j(['handed over', 'file:' + L + 'Epilogue.md']), `${what}: outside the view it’s a file`);
		await letGo(p, at.x, at.y);
		await flush(p);
		t.eq(j(await contents(p)), j(LIST), `${what}: nothing moved`);
		t.eq(j(await cardNames(p)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), `${what}: the card is where it was`);
		t.eq((await notes(p)).length, 0, `${what}: nothing opened`);
		await clean(p, t, what);
	}
	same(t, before, await texts(p));
});

test('never lose writing: typing not yet saved in the dragged note survives the move through the explorer, and the undo', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await folds(p, ['The Lighthouse']);
	await p.ev(`app.workspace.getLeaf('split', 'vertical').openFile(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')})).then(() => 1)`);
	await p.sleep(700);
	const ed = await p.at(`${R} .cm-content`), r = await p.at(row(L + 'Part Two')), a = await grip(p, 'Epilogue.md');
	await p.click(ed.x, ed.t + ed.h - 20);
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.setCursor(e.lastLine(), e.getLine(e.lastLine()).length); return 1; })()`);
	const TYPED = ' TYPED AND NOT YET SAVED', MORE = ' and more, as the card is carried';
	await p.type(TYPED);
	t.eq(await read(p, L + 'Epilogue.md'), before[L + 'Epilogue.md'], 'typed, and not on disk yet as the card is taken');
	await hold(p, a, r);
	t.eq((await state(p)).action, 'Move into “Part Two”', 'over a folder of the binder');
	// (taking the card puts the focus in the binder view, and Obsidian may save the note then: more goes into its
	// editor while the card is held, so there is text not on disk at the moment it's let go, whatever Obsidian did)
	await p.ev(`(() => { const e = app.workspace.getLeavesOfType('markdown')[0].view.editor; e.replaceRange(${j(MORE)}, { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1; })()`);
	t.ok(!(await read(p, L + 'Epilogue.md')).includes(MORE), 'there is text not on disk as it’s let go');
	await letGo(p, r.x, r.y, 300);
	await until(p, `app.vault.adapter.read(${j(L + 'Part Two/Epilogue.md')}).then(x => x.includes(${j(MORE)}), () => false)`, 6000);
	const want = before[L + 'Epilogue.md'] + TYPED + MORE;
	t.eq(await read(p, L + 'Part Two/Epilogue.md'), want, 'moved, with what was typed, and nothing else changed');
	t.eq(j(await filesLike(p, '/Epilogue/')), j([L + 'Part Two/Epilogue.md']), 'one note, not two');
	t.eq(j(await notes(p)), j([L + 'Part Two/Epilogue.md']), 'the tab follows the note');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`), want, 'and shows the same text');
	await p.ev(`${B}.undo('The Lighthouse').then(() => 1)`);
	await p.sleep(1200);
	await flush(p);
	t.eq(await read(p, L + 'Epilogue.md'), want, 'undone: back where it was, with what was typed');
	t.eq(j(await contents(p)), j(LIST), 'and the list as it was');
	same(t, before, await texts(p), { skip: [L + 'Epilogue.md'] });
	await clean(p, t, 'after it all');
});

// ---- the outliner ----

test('outliner rows do the same: Obsidian’s ghost takes the place of the row’s own (no change to see), the explorer places them in order with an undo, a note’s text takes a link', async (p, h, t) => {
	const before = await texts(p);
	await outliner(p);
	await folds(p, ['The Lighthouse', L + 'Part Two']);
	const a = await p.at(orow('Part One/The keeper.md')), r = await p.at(row(L + 'Part Two/Lights out.md'));
	await hold(p, a, { x: a.x + 30, y: a.y + 60 });
	let s = await state(p);
	t.eq(j([s.rows, s.file]), j(['shown', null]), 'over the outliner: its own drag');
	const own = await p.ev(`(() => { const r = document.querySelector('.binders-outliner-ghost').getBoundingClientRect(); return { dx: Math.round(r.left - ${a.x + 30}), dy: Math.round(r.top - ${a.y + 60}) }; })()`);
	await p.move(r.x, r.t + 3, 8, { buttons: 1 });
	await p.sleep(250);
	s = await state(p);
	t.eq(j([s.rows, s.file, s.ghost, s.morph]), j(['hidden', 'file:' + L + 'Part One/The keeper.md', 'The keeper', false]), 'outside: Obsidian’s ghost, the row’s own put away, and nothing to animate');
	t.eq(s.action, 'Move before “Lights out”', 'the explorer says where');
	const theirs = await p.ev(`(() => { const r = document.querySelector('.drag-ghost.binders-file-ghost').getBoundingClientRect(); return { dx: Math.round(r.left - ${r.x}), dy: Math.round(r.top - ${r.t + 3}) }; })()`);
	// (to the pixel: Obsidian goes by a mouse event's whole pixels, the outliner by the pointer's fractions)
	t.ok(Math.abs(theirs.dx - own.dx) <= 1 && Math.abs(theirs.dy - own.dy) <= 1, 'Obsidian’s ghost sits where the row’s own would, so the one takes the other’s place: ' + j({ own, theirs }));
	// back, and out again
	await p.move(a.x + 30, a.y + 60, 8, { buttons: 1 });
	await p.sleep(200);
	s = await state(p);
	t.eq(j([s.rows, s.file, s.grabbing]), j(['shown', null, true]), 'back over the outliner: its own drag again');
	await p.move(r.x, r.t + 3, 8, { buttons: 1 });
	await p.sleep(250);
	await letGo(p, r.x, r.t + 3);
	await flush(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/The keeper', 'Part Two/Lights out', 'Epilogue']), 'placed before “Lights out”');
	t.eq(await undoable(p), 'Move “The keeper”', 'undoable');
	await clean(p, t, 'after the drop');
	await p.ev(`${B}.undo('The Lighthouse').then(() => 1)`);
	await p.sleep(600);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'undone');
	// a link, and two rows at once
	await beside(p, 'Scratch.md', 'first line\n');
	const ed = await p.at(`${R} .cm-content`), to = { x: ed.l + 60, y: ed.t + 12 };
	await hold(p, await p.at(orow('Prologue.md')), to);
	t.eq((await state(p)).action, 'Insert link here', 'over a note’s text');
	await letGo(p, to.x, to.y);
	t.ok((await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`)).includes('[[Prologue]]'), 'a link to the note');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	same(t, before, await texts(p));
	await clean(p, t, 'after the link');
});

// ---- the corkboard arranged by label ----

test('the corkboard arranged by label does the same: a card carried out of the view is a file (no line or label marked on the board), the explorer places it, and its label is left alone', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), mode: 'corkboard', options: { arrange: 'label' } } }); })().then(() => 1)`);
	await until(p, `!!document.querySelector('${BV} .binders-lanes > .binders-lane')`);
	await p.sleep(350);
	await folds(p, ['The Lighthouse', L + 'Part One']);
	const a = await grip(p, 'Epilogue.md'), r = await p.at(row(L + 'Part One/The keeper.md'));
	await hold(p, a, { x: r.x, y: r.t + 3 });
	let s = await state(p);
	t.eq(j([s.card, s.file, s.ghost, s.morph, s.action]), j(['handed over', 'file:' + L + 'Epilogue.md', 'Epilogue', true, 'Move before “The keeper”']), 'outside the view: a file, Obsidian’s ghost, and the explorer says where');
	t.eq(j([s.boardLine, await p.ev(`document.querySelectorAll('${BV} .is-drop-target, .binders-lane-tag').length`)]), j([false, 0]), 'no line on the board, no label’s line marked, no label named on the card in hand');
	await p.move(a.x, a.y, 8, { buttons: 1 });
	await p.sleep(300);
	s = await state(p);
	t.eq(j([s.card, s.file, s.grabbing]), j(['card', null, true]), 'back over the board: the board’s own drag again');
	await p.move(r.x, r.t + 3, 8, { buttons: 1 });
	await p.sleep(250);
	await letGo(p, r.x, r.t + 3);
	await flush(p);
	t.eq(j((await contents(p)).slice(1, 6)), j(['Part One/', 'Part One/Arrival', 'Part One/Epilogue', 'Part One/The keeper', 'Part One/Storm warning']), 'placed before “The keeper”');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Epilogue.md']: L + 'Part One/Epilogue.md' } });
	t.eq(await undoable(p), 'Move “Epilogue”', 'undoable');
	await clean(p, t, 'after the drop');
});

// ---- touch ----

test('a tablet, by touch, the file explorer pinned beside the view: a card held and dragged onto the explorer is placed there, with no menu opened', async (p, h, t) => {
	const touch = (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	await p.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try {
		t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
		await openView(p);
		// the sidebar, open and pinned beside the panes
		await p.ev(`(async () => { const s = app.workspace.leftSplit; s.expand(); await new Promise(r => setTimeout(r, 400)); if (typeof s.setPinned === 'function') s.setPinned(true); await new Promise(r => setTimeout(r, 500)); await app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); })().then(() => 1)`);
		await p.sleep(600);
		await folds(p, ['The Lighthouse', L + 'Part One']);
		const c = await p.at(card('Epilogue.md')), r = await p.at(row(L + 'Part One/The keeper.md'));
		t.ok(c && r && r.x < c.l, 'the explorer is beside the board: ' + j({ card: c, row: r }));
		const y0 = c.t + c.h - 16;
		await touch('touchStart', c.x, y0);
		await p.sleep(620);
		for (let i = 1; i <= 12; i++) { await touch('touchMove', c.x + (r.x - c.x) * i / 12, y0 + (r.t + 3 - y0) * i / 12); await p.sleep(20); }
		await p.sleep(300);
		const s = await state(p);
		t.eq(j([s.card, s.file, s.action]), j(['handed over', 'file:' + L + 'Epilogue.md', 'Move before “The keeper”']), 'held over a row of the explorer: a file, and the explorer says where');
		t.ok(s.explorerLine, 'with its line');
		await touch('touchEnd');
		await p.sleep(900);
		await flush(p);
		t.eq(j((await contents(p)).slice(1, 6)), j(['Part One/', 'Part One/Arrival', 'Part One/Epilogue', 'Part One/The keeper', 'Part One/Storm warning']), 'placed there');
		t.eq(await undoable(p), 'Move “Epilogue”', 'undoable');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'no menu opened (a long press that moved is a drag)');
		await clean(p, t, 'after the drop');
	} finally {
		await p.ev(`(() => { app.workspace.leftSplit.setPinned?.(false); return 1; })()`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
});

// ---- without Obsidian's drag manager ----

test('where Obsidian has no drag manager to hand the drag to, a card dragged out stays a card and moves nothing, as before', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await folds(p, ['The Lighthouse']);
	// (an own property that hides the method: as if this Obsidian didn't have it)
	await p.ev(`(() => { app.dragManager.dragFile = null; return 1; })()`);
	try {
		const a = await grip(p, 'Prologue.md'), r = await p.at(row(L + 'Part Two'));
		await hold(p, a, r);
		const s = await state(p);
		t.eq(j([s.card, s.file, s.ghost, s.into, s.boardLine]), j(['card', null, null, [], false]), 'outside the view: still the card, nothing handed over, nowhere to drop');
		await letGo(p, r.x, r.y);
		await flush(p);
		t.eq(j(await contents(p)), j(LIST), 'let go over the explorer: nothing moved');
		await clean(p, t, 'after letting go');
		// on the board it still moves
		const e = await grip(p, 'Epilogue.md'), first = await p.at(card('Prologue.md'));
		await hold(p, e, { x: first.l + 6, y: first.y });
		await letGo(p, first.l + 6, first.y);
		await flush(p);
		t.eq(j(await contents(p)), j(['Epilogue', ...LIST.slice(0, -1)]), 'and a drop on the board moves the card as ever');
	} finally { await p.ev(`(() => { delete app.dragManager.dragFile; return typeof app.dragManager.dragFile; })()`); }
	same(t, before, await texts(p), { skip: [NOTE] });
});
