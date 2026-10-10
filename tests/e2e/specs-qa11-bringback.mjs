// QA round 11: "Bring back..." on a snapshot of a folder or binder, adversarial, after 0.46.21 to 0.48.3. Folders renamed and moved
// between siblings, notes swapped, deleted and made since, links, a bringing back cut short, and the snapshot Replace all takes.
// Golden rule 2 first: every line that was in a note is afterwards in a note or a snapshot; nothing is deleted.
//   QA11_SAY=1 prints what the checks measured. Run through .claude/qa/e2e-slot.sh --specs tests/e2e/specs-qa11-bringback.mjs
import { B, PL, VIEW, file, j, openView, until, withTidy } from './view-helpers.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];
const test = (name, fn, timeout = 300000) => specs.push({ name: 'qa11 bringback: ' + name, timeout, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });
const sleep = (p, ms) => p.sleep(ms);
const SAY = !!process.env.QA11_SAY;
const say = (...a) => { if (SAY) console.log('    ', ...a); };

async function closeAll(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`).catch(() => 0)); i++) { await p.key('Escape'); await sleep(p, 200); }
	await p.ev(`(() => { try { app.vault.setConfig('alwaysUpdateLinks', false); } catch {} document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
}
const settle = (p) => p.ev(`(async () => { await new Promise(r => setTimeout(r, 300)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`).then(() => sleep(p, 300));
/** Every file that holds writing, by path (notes, snapshots, plans), as text. */
const everything = (p) => p.ev(`(async () => { const o = {}; const a = app.vault.adapter; const walk = async (d) => { const l = await a.list(d); for (const f of l.files) if (/\\.(md|binder-snapshot|snapshot|binder-journal)$/.test(f)) o[f] = await a.read(f); for (const x of l.folders) if (!x.startsWith('.obsidian')) await walk(x); }; await walk('/'); return o; })()`);
const notesOf = (all) => Object.fromEntries(Object.entries(all).filter(([k]) => k.endsWith('.md') && !/(^|\/)Snapshots\//.test(k)));
const folders = (p, root) => p.ev(`(async () => { const out = []; const a = app.vault.adapter; const walk = async (d) => { const l = await a.list(d); for (const x of l.folders) { if (/(^|\\/)Snapshots$/.test(x)) continue; out.push(x); await walk(x); } }; await walk(${j(root)}); return out.sort(); })()`);
const lines = (text) => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
const plain = (l) => l.trim().replace(/\[\[[^\]\n|]*(\|[^\]\n]*)?\]\]/g, '[[$1]]').replace(/\]\([^)\n]*\)/g, ']()');
function lost(before, after) {
	const have = new Set();
	for (const v of Object.values(after)) for (const l of v.split(/\r?\n/)) have.add(plain(l));
	const out = [];
	for (const [k, v] of Object.entries(notesOf(before))) for (const l of lines(v)) if (!have.has(plain(l))) out.push(k + ': ' + l.slice(0, 60));
	return out;
}
async function snap(p, folder, title) { await p.ev(`${PL}.snapshotsApi.takeFolder(${file(folder)}, ${j(title)}).then(() => 1)`); await sleep(p, 300); return title; }
const backAs = (p, title, folder, scope = 'all', since = 'stay') => p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(folder)}).find(x => x.title === ${j(title)}); if (!s) return { ok: false, error: 'no snapshot ' + ${j(title)} }; const r = await ${PL}.snapshotsApi.back(s, ${file(folder)}, ${j(scope)}, ${j(since)}); return { ok: true, texts: r.texts, moved: r.moved, files: r.files, again: r.again, placed: r.placed, gathered: r.gathered, into: r.into, left: r.left, ordered: r.ordered, orderLeft: r.orderLeft }; } catch (e) { return { ok: false, error: e.message }; } })()`);
/** Runs page code (async function body) and settles. */
const work = async (p, body) => { const r = await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x), fm = app.fileManager, v = app.vault; ${body}; await new Promise(r => setTimeout(r, 500)); await ${B}.snapshotsSettle(); await ${B}.flush(); return 1; })()`); await sleep(p, 500); return r; };
const setLinks = (p, on) => p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', ${on}); return 1; })()`);
const exists = (p, path) => p.ev(`app.vault.adapter.exists(${j(path)})`);
const journal = (p, snaps) => p.ev(`app.vault.adapter.exists(${j(snaps + '/Bringing back.binder-journal')}).then(ok => ok ? app.vault.adapter.read(${j(snaps + '/Bringing back.binder-journal')}).then(JSON.parse) : null)`);
/** Rule 2 and "never deletes": nothing of the snapshot or of mid lost; every note of mid is still a file, or its exact text is in another. */
function invariants(t, before, mid, after) {
	const l1 = lost(before, after), l2 = lost(mid, after);
	t.eq(l1.length, 0, 'every line of the snapshot is in a note or a snapshot: ' + j(l1.slice(0, 4)));
	t.eq(l2.length, 0, 'every line written since is in a note or a snapshot: ' + j(l2.slice(0, 4)));
	const na = notesOf(after), texts = new Set(Object.values(na));
	const gone = Object.keys(notesOf(mid)).filter((k) => !(k in na) && !texts.has(mid[k]));
	t.eq(gone.length, 0, 'no note was deleted (each is still a file, or moved with its text): ' + j(gone.slice(0, 4)));
}
const S = (n, extra = '') => `${n} one.\\n\\n${n} two.\\n\\n${n} three.${extra}\\n`;

// =====================================================================================================================
// 1. Folders moved, renamed
const TREE = `[
	{ path: 'Part A/Chapter 1/Scene a1.md', text: ${j('---\nsynopsis: First scene\nlabel: Red\n---\n')} + 'A1 one.\\n\\nA1 two.\\n' },
	{ path: 'Part A/Chapter 1/Scene a2.md', text: 'A2 one.\\n\\nA2 two.\\n' },
	{ path: 'Part A/Chapter 1/Sub/Deep.md', text: 'Deep one.\\n\\nDeep two.\\n' },
	{ path: 'Part A/Chapter 2/Scene a3.md', text: 'A3 one.\\n\\nA3 two.\\n' },
	{ path: 'Part B/Scene b1.md', text: 'B1 one.\\n\\nB1 two.\\n' },
	{ path: 'Part B/Chapter 3/Scene b2.md', text: 'B2 one.\\n\\nB2 two.\\n' }
]`;
const dump = async (p, root) => { const all = await everything(p); return Object.keys(notesOf(all)).filter((k) => k.startsWith(root + '/')).sort(); };

for (const [label, body, want] of [
	['a folder moved to a sibling folder', `await fm.renameFile(f('Fold/Part A/Chapter 1'), 'Fold/Part B/Chapter 1');`, 'Fold/Part A/Chapter 1'],
	['a folder renamed', `await fm.renameFile(f('Fold/Part A/Chapter 1'), 'Fold/Part A/Chapter One');`, 'Fold/Part A/Chapter 1'],
	['a folder renamed and moved at once', `await fm.renameFile(f('Fold/Part A/Chapter 1'), 'Fold/Part B/Renamed chapter');`, 'Fold/Part A/Chapter 1'],
	['a folder moved to the top of the binder', `await fm.renameFile(f('Fold/Part A/Chapter 1'), 'Fold/Chapter 1');`, 'Fold/Part A/Chapter 1'],
	['a folder moved out of the binder', `await v.createFolder('Elsewhere'); await fm.renameFile(f('Fold/Part A/Chapter 1'), 'Elsewhere/Chapter 1');`, 'Fold/Part A/Chapter 1'],
	['a part (folder of folders) moved into its sibling', `await fm.renameFile(f('Fold/Part A'), 'Fold/Part B/Part A');`, 'Fold/Part A/Chapter 1'],
	['a folder with a case-only rename', `await fm.renameFile(f('Fold/Part A/Chapter 1'), 'Fold/Part A/chapter 1');`, 'Fold/Part A/Chapter 1'],
]) for (const links of [false, true]) test(`${links && !/ moved out/.test(label) && label !== 'a folder renamed' ? '' : ''}${label}, links ${links ? 'on' : 'off'}: its notes come back to it with their bytes; no empty folder made while the full one stays; nothing lost or deleted`, async (p, h, t) => {
	await setLinks(p, links);
	await make(p, 'Fold', TREE);
	await p.ev(`app.vault.adapter.write('Fold/Part B/Scene b1.md', 'B1 one, links to [[Scene a1]] and [[Deep]] and [[Scene a3]].\\n\\nB1 two.\\n').then(() => 1)`);
	await sleep(p, 500);
	await snap(p, 'Fold', 'Tree draft');
	const before = await everything(p);
	await work(p, body);
	const mid = await everything(p);
	say(label, 'mid files', j(await dump(p, 'Fold')), 'folders', j(await folders(p, 'Fold')));
	const r = await backAs(p, 'Tree draft', 'Fold');
	await settle(p);
	say('result', j(r));
	const after = await everything(p);
	const nowF = await folders(p, 'Fold');
	say('after files', j(await dump(p, 'Fold')), 'folders', j(nowF));
	t.ok(r.ok, 'it ran: ' + j(r));
	invariants(t, before, mid, after);
	const na = notesOf(after), nb = notesOf(before);
	for (const k of ['Fold/Part A/Chapter 1/Scene a1.md', 'Fold/Part A/Chapter 1/Scene a2.md', 'Fold/Part A/Chapter 1/Sub/Deep.md']) {
		t.ok(k in na, `${k} is back where the snapshot has it: ${j(Object.keys(na).filter((x) => /a1|a2|Deep/.test(x)))}`);
		if (!links) t.eq(na[k], nb[k], `${k} is as it was, byte for byte`);
	}
	// the relative of the gap: a folder made again, empty, while the real one with the notes is somewhere else
	const emptyFolders = [];
	for (const d of nowF) if (!Object.keys(na).some((k) => k.startsWith(d + '/'))) emptyFolders.push(d);
	say('empty folders', j(emptyFolders));
	const strays = Object.keys(na).filter((k) => /Scene a1|Scene a2|Deep/.test(k) && !k.startsWith('Fold/Part A/Chapter 1/'));
	t.eq(strays.length, 0, 'no note of the folder is left in the place it was moved to: ' + j(strays));
	if (!want.includes('Part A/Chapter 1')) return;
	t.ok(!emptyFolders.includes('Fold/Part A/Chapter 1'), 'the folder is not an empty one made again: ' + j(emptyFolders));
	t.eq(j(emptyFolders.filter((d) => !/^Fold\/(Part A\/Chapter 1|Part B\/Chapter 1|Part B\/Renamed chapter|Part A\/Chapter One|Part A\/chapter 1|Chapter 1)(\/Sub)?$|^Fold\/Part B\/Part A(\/|$)/.test(d))), '[]', 'no other empty folder appears: ' + j(emptyFolders));
}, 300000);

// =====================================================================================================================
// 2. Notes: swapped between sibling folders, same name in two folders, deleted and made since, renamed and edited
test('two notes with the same name in sibling folders swap places: both come back to their own folder with their own text', async (p, h, t) => {
	await make(p, 'Swap', `[
		{ path: 'One/Note.md', text: 'ONE-NOTE first.\\n\\nONE-NOTE second.\\n' },
		{ path: 'Two/Note.md', text: 'TWO-NOTE first.\\n\\nTWO-NOTE second.\\n' },
		{ path: 'One/Other.md', text: 'Other.\\n' }
	]`);
	await snap(p, 'Swap', 'Swap draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Swap/One/Note.md'), 'Swap/Note one.md'); await fm.renameFile(f('Swap/Two/Note.md'), 'Swap/One/Note.md'); await fm.renameFile(f('Swap/Note one.md'), 'Swap/Two/Note.md');`);
	const mid = await everything(p);
	const r = await backAs(p, 'Swap draft', 'Swap');
	await settle(p);
	const after = await everything(p);
	say('swap result', j(r));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.eq(after['Swap/One/Note.md'], before['Swap/One/Note.md'], 'One/Note.md has its own text');
	t.eq(after['Swap/Two/Note.md'], before['Swap/Two/Note.md'], 'Two/Note.md has its own text');
	invariants(t, before, mid, after);
});

test('notes deleted since, a folder deleted with notes in it, and a note made since in the old place: made again under a free name, the new one stays, nothing over-written', async (p, h, t) => {
	await make(p, 'Gone', `[
		{ path: 'Keep.md', text: 'Keep text.\\n' },
		{ path: 'Doomed/Inside one.md', text: 'Inside one text.\\n\\nSecond.\\n' },
		{ path: 'Doomed/Inside two.md', text: 'Inside two text.\\n' },
		{ path: 'Lone.md', text: 'Lone original text.\\n' }
	]`);
	await snap(p, 'Gone', 'Gone draft');
	const before = await everything(p);
	await work(p, `await v.delete(f('Gone/Doomed'), true); await v.delete(f('Gone/Lone.md')); await v.create('Gone/Lone.md', 'A DIFFERENT NOTE made since in the old place.\\n'); await v.createFolder('Gone/Doomed'); await v.create('Gone/Doomed/Inside one.md', 'A DIFFERENT inside one.\\n');`);
	const mid = await everything(p);
	const r = await backAs(p, 'Gone draft', 'Gone');
	await settle(p);
	const after = await everything(p);
	say('gone result', j(r), j(Object.keys(notesOf(after)).filter((k) => k.startsWith('Gone/'))));
	t.ok(r.ok, 'it ran: ' + j(r));
	invariants(t, before, mid, after);
	t.ok(Object.values(notesOf(after)).includes(before['Gone/Doomed/Inside two.md']), 'the note of the deleted folder is made again');
	t.ok(Object.values(notesOf(after)).includes(before['Gone/Lone.md']), 'the original Lone is made again, even though a note stands in its place');
	t.ok(Object.values(notesOf(after)).some((v) => v.includes('A DIFFERENT NOTE')), 'the note made since stays');
	t.ok(Object.values(notesOf(after)).some((v) => v.includes('A DIFFERENT inside one')), 'the other note made since stays');
	t.ok(Object.values(notesOf(after)).includes(before['Gone/Doomed/Inside one.md']), 'inside one, as the snapshot has it, is there too (not over a file that is there)');
});

test('a note renamed and rewritten since, and its link elsewhere (links on): the snapshot’s text is back under the old name; the rewrite is kept in the snapshot taken first', async (p, h, t) => {
	await setLinks(p, true);
	await make(p, 'Ren', `[
		{ path: 'Scene.md', text: 'Scene original paragraph.\\n\\nSecond original.\\n' },
		{ path: 'Pointer.md', text: 'See [[Scene]] and [[Scene|that scene]] and [s](Scene.md).\\n' }
	]`);
	await snap(p, 'Ren', 'Ren draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Ren/Scene.md'), 'Ren/Scene renamed.md'); await v.process(f('Ren/Scene renamed.md'), (t) => t + '\\nREWRITTEN-SINCE line.\\n');`);
	const mid = await everything(p);
	say('pointer mid', j(mid['Ren/Pointer.md']));
	const r = await backAs(p, 'Ren draft', 'Ren');
	await settle(p);
	const after = await everything(p);
	say('pointer after', j(after['Ren/Pointer.md']));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.eq(after['Ren/Scene.md'], before['Ren/Scene.md'], 'Scene.md is the snapshot’s, byte for byte');
	t.ok(Object.entries(after).some(([k, v]) => /Before bringing back/.test(k) && v.includes('REWRITTEN-SINCE')), 'the rewrite is in the snapshot taken first');
	t.eq(after['Ren/Pointer.md'], before['Ren/Pointer.md'], 'the note that linked to it reads as it did');
	invariants(t, before, mid, after);
});

// =====================================================================================================================
// 3. Scopes and order
test('text only, after notes were renamed and moved: the text is back in the notes where they are now; nothing renamed or moved', async (p, h, t) => {
	await make(p, 'Txt', `[
		{ path: 'A/One.md', text: 'One original.\\n\\nOne second.\\n' },
		{ path: 'B/Two.md', text: 'Two original.\\n\\nTwo second.\\n' }
	]`);
	await snap(p, 'Txt', 'Txt draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Txt/A/One.md'), 'Txt/B/One moved.md'); await v.process(f('Txt/B/One moved.md'), (t) => t.replace('original', 'CHANGED')); await v.process(f('Txt/B/Two.md'), (t) => t.replace('original', 'CHANGED'));`);
	const mid = await everything(p);
	const r = await backAs(p, 'Txt draft', 'Txt', 'text');
	await settle(p);
	const after = await everything(p);
	say('text result', j(r), j(Object.keys(notesOf(after)).filter((k) => k.startsWith('Txt/'))));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.ok('Txt/B/One moved.md' in after && !('Txt/A/One.md' in notesOf(after)), 'text only moves nothing');
	t.eq(after['Txt/B/Two.md'], before['Txt/B/Two.md'], 'Two has its text back');
	t.ok(!(after['Txt/B/One moved.md'] ?? '').includes('CHANGED'), 'the renamed and moved note has its snapshot text back: ' + j(after['Txt/B/One moved.md']));
	invariants(t, before, mid, after);
});

test('order only, after a nested folder was reordered and a note moved in: the order is the snapshot’s; no text or name changes', async (p, h, t) => {
	await make(p, 'Ord', `[
		{ path: 'Ch/A.md', text: 'A text.\\n' }, { path: 'Ch/B.md', text: 'B text.\\n' }, { path: 'Ch/C.md', text: 'C text.\\n' }, { path: 'Top.md', text: 'Top text.\\n' }
	]`);
	await snap(p, 'Ord', 'Ord draft');
	const before = await everything(p);
	await work(p, `await ${B}.reorder(f('Ord/Ch'), [f('Ord/Ch/C.md'), f('Ord/Ch/A.md'), f('Ord/Ch/B.md')]); await ${B}.flush(); await v.process(f('Ord/Top.md'), (t) => t + '\\nEDITED-SINCE.\\n'); await fm.renameFile(f('Ord/Ch/B.md'), 'Ord/B renamed.md');`);
	const mid = await everything(p);
	const r = await backAs(p, 'Ord draft', 'Ord', 'order');
	await settle(p);
	const after = await everything(p);
	say('order result', j(r), j(after['Ord/Ch/Ch.md']), j(after['Ord/Ord.md']));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.eq(after['Ord/Top.md'], mid['Ord/Top.md'], 'order only: the text of Top is untouched');
	t.ok('Ord/B renamed.md' in after, 'order only: the renamed note is not renamed back');
	invariants(t, before, mid, after);
});

test('bringing back twice: the second time has nothing to bring back or changes no note, and takes no second copy of the same state', async (p, h, t) => {
	await make(p, 'Twice', TREE);
	await snap(p, 'Twice', 'Twice draft');
	await work(p, `await fm.renameFile(f('Twice/Part A/Chapter 1'), 'Twice/Part B/Chapter 1'); await v.process(f('Twice/Part B/Scene b1.md'), (t) => t + '\\nSINCE.\\n');`);
	const r1 = await backAs(p, 'Twice draft', 'Twice');
	await settle(p);
	const one = await everything(p);
	const n1 = await p.ev(`${PL}.snapshotsApi.list(${file('Twice')}).length`);
	const r2 = await backAs(p, 'Twice draft', 'Twice');
	await settle(p);
	const two = await everything(p);
	const n2 = await p.ev(`${PL}.snapshotsApi.list(${file('Twice')}).length`);
	say('twice', j(r1), j(r2), n1, n2);
	t.ok(r1.ok && r2.ok, 'both ran: ' + j([r1, r2]));
	const changed = Object.keys(notesOf(two)).filter((k) => notesOf(two)[k] !== notesOf(one)[k]);
	t.eq(changed.length, 0, 'the second bringing back changes no note: ' + j(changed));
	t.eq(j(Object.keys(notesOf(two)).sort()), j(Object.keys(notesOf(one)).sort()), 'and no note appears or goes');
	t.eq(n2, n1, 'and takes no second snapshot of a state already kept: ' + n1 + ' → ' + n2);
});

// =====================================================================================================================
// 4. Not the whole binder: a subfolder's snapshot, with notes moved out of it and into it
test('a snapshot of a chapter folder: a note moved out of it into a sibling chapter is not pulled back; one moved into it stays; its own text comes back', async (p, h, t) => {
	await make(p, 'Sub', TREE);
	await snap(p, 'Sub/Part A', 'Part A draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Sub/Part A/Chapter 2/Scene a3.md'), 'Sub/Part B/Scene a3.md'); await fm.renameFile(f('Sub/Part B/Scene b1.md'), 'Sub/Part A/Scene b1.md'); await v.process(f('Sub/Part A/Chapter 1/Scene a2.md'), (t) => t.replace('A2 one', 'A2 CHANGED'));`);
	const mid = await everything(p);
	const r = await backAs(p, 'Part A draft', 'Sub/Part A');
	await settle(p);
	const after = await everything(p);
	say('sub result', j(r), j(Object.keys(notesOf(after)).filter((k) => k.startsWith('Sub/'))));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.eq(after['Sub/Part A/Chapter 1/Scene a2.md'], before['Sub/Part A/Chapter 1/Scene a2.md'], 'the changed note has its text back');
	t.ok('Sub/Part A/Scene b1.md' in after, 'the note moved into the folder stays in it');
	const outside = Object.keys(notesOf(after)).filter((k) => k.startsWith('Sub/Part B/'));
	t.ok(outside.includes('Sub/Part B/Scene a3.md'), 'a note outside the folder is not pulled back into it (it is outside the snapshot’s reach): ' + j(outside));
	t.eq(after['Sub/Part B/Scene a3.md'], mid['Sub/Part B/Scene a3.md'], 'and is not written');
	invariants(t, before, mid, after);
});

// =====================================================================================================================
// 5. Since: gather
test('“gather what is new since” with a folder moved and notes made since: the new notes go to one folder, the folder is back, nothing lost', async (p, h, t) => {
	await make(p, 'Gath', TREE);
	await snap(p, 'Gath', 'Gath draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Gath/Part A/Chapter 1'), 'Gath/Part B/Chapter 1'); await v.create('Gath/Part A/Fresh one.md', 'Fresh one text.\\n'); await v.createFolder('Gath/New folder'); await v.create('Gath/New folder/Fresh two.md', 'Fresh two text.\\n');`);
	const mid = await everything(p);
	const r = await backAs(p, 'Gath draft', 'Gath', 'all', 'gather');
	await settle(p);
	const after = await everything(p);
	say('gather result', j(r), j(Object.keys(notesOf(after)).filter((k) => k.startsWith('Gath/'))), j(await folders(p, 'Gath')));
	t.ok(r.ok, 'it ran: ' + j(r));
	invariants(t, before, mid, after);
	const strays = Object.keys(notesOf(after)).filter((k) => /Scene a1|Scene a2|Deep/.test(k) && !k.startsWith('Gath/Part A/Chapter 1/'));
	t.eq(strays.length, 0, 'the moved folder’s notes are back in it: ' + j(strays));
	const fresh = Object.keys(notesOf(after)).filter((k) => /Fresh/.test(k));
	t.ok(fresh.length === 2 && fresh.every((k) => k.startsWith('Gath/Since ')), 'both new notes are in the one gathering folder: ' + j(fresh));
});

// =====================================================================================================================
// 6. Replace all, and bringing back its snapshot
const rcrlf = 'Crlf line one\\r\\nthe cat sat\\r\\n\\r\\nCrlf cat again.\\r\\n';
test('Replace all through the find bar, then bring back “Before replacing …”: every note byte for byte (frontmatter, CRLF, no final newline), and links', async (p, h, t) => {
	await make(p, 'Rep', `[
		{ path: 'Ch/One.md', text: ${j('---\nsynopsis: A cat story\nlabel: Blue\ntags: [cat]\n---\n')} + 'The cat sat.\\n\\nCats everywhere, a cat.\\n' },
		{ path: 'Ch/Two.md', text: '${rcrlf}' },
		{ path: 'Three.md', text: 'No final newline, a cat' },
		{ path: 'Four.md', text: 'Unrelated, with [[One]] link and a CAT in caps.\\n' }
	]`);
	const before = await everything(p);
	await openView(p, 'Rep');
	await p.ev(`(async () => { const v = ${VIEW}; if (!v.findBar) v.showSearch(true); else v.findBar.setReplacing(true); const b = v.findBar; b.options = { matchCase: false }; b.input.value = 'cat'; b.by.value = 'dog'; await b.search(); })().then(() => 1)`);
	await sleep(p, 400);
	await p.ev(`(() => { window.__all = ${VIEW}.findBar.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 8000);
	await sleep(p, 200);
	await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); return 1; })()`);
	await p.ev(`window.__all.then(() => 1)`);
	await settle(p);
	const mid = await everything(p);
	const snaps = await p.ev(`${PL}.snapshotsApi.list(${file('Rep')}).map(s => s.title)`);
	say('snaps', j(snaps), 'changed', j(Object.keys(notesOf(mid)).filter((k) => mid[k] !== before[k])));
	t.ok(Object.keys(notesOf(mid)).some((k) => mid[k] !== before[k]), 'the replace changed something');
	const title = snaps.find((s) => /^Before replacing/.test(s));
	t.ok(!!title, 'the snapshot “Before replacing …” exists: ' + j(snaps));
	const r = await backAs(p, title, 'Rep');
	await settle(p);
	const after = await everything(p);
	say('rep result', j(r));
	t.ok(r.ok, 'it ran: ' + j(r));
	for (const k of Object.keys(notesOf(before))) if (!/Rep\/Rep\.md$/.test(k)) t.eq(after[k], before[k], `${k} is as before the replace, byte for byte`);
	invariants(t, before, mid, after);
});

test('Replace all, then a note renamed and one moved, then bring back the replace’s snapshot: text and names, nothing lost', async (p, h, t) => {
	await make(p, 'Rep2', `[
		{ path: 'Ch/One.md', text: 'The cat sat.\\n\\nSecond cat.\\n' },
		{ path: 'Two.md', text: 'Another cat.\\n' }
	]`);
	const before = await everything(p);
	await openView(p, 'Rep2');
	await p.ev(`(async () => { const v = ${VIEW}; if (!v.findBar) v.showSearch(true); else v.findBar.setReplacing(true); const b = v.findBar; b.options = { matchCase: false }; b.input.value = 'cat'; b.by.value = 'dog'; await b.search(); })().then(() => 1)`);
	await sleep(p, 400);
	await p.ev(`(() => { window.__all = ${VIEW}.findBar.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 8000);
	await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); return 1; })()`);
	await p.ev(`window.__all.then(() => 1)`);
	await settle(p);
	await work(p, `await fm.renameFile(f('Rep2/Ch/One.md'), 'Rep2/One now.md'); await fm.renameFile(f('Rep2/Two.md'), 'Rep2/Ch/Two moved.md'); await v.process(f('Rep2/Ch/Two moved.md'), (t) => t + '\\nWritten after the replace.\\n');`);
	const mid = await everything(p);
	const title = (await p.ev(`${PL}.snapshotsApi.list(${file('Rep2')}).map(s => s.title)`)).find((s) => /^Before replacing/.test(s));
	const r = await backAs(p, title, 'Rep2');
	await settle(p);
	const after = await everything(p);
	say('rep2', j(r), j(Object.keys(notesOf(after)).filter((k) => k.startsWith('Rep2/'))));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.eq(after['Rep2/Ch/One.md'], before['Rep2/Ch/One.md'], 'One is back under its name with the pre-replace text');
	t.eq(after['Rep2/Two.md'], before['Rep2/Two.md'], 'Two is back under its name with the pre-replace text');
	invariants(t, before, mid, after);
});

// =====================================================================================================================
// 7. The plan file and a bringing back cut short
test('a bringing back with a folder moved, cut short after its plan is written: the next load offers Finish / Put it back / Leave; “Finish” completes it with nothing lost', async (p, h, t) => {
	const items = `Array.from({ length: 60 }, (_, i) => ({ path: 'Part ' + (i % 3) + '/Ch ' + (i % 2) + '/Scene ' + String(i).padStart(3, '0') + '.md', text: 'Scene ' + i + ' first.\\n\\nScene ' + i + ' second.\\n' }))`;
	await make(p, 'Cut2', items);
	await snap(p, 'Cut2', 'Cut draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Cut2/Part 0/Ch 0'), 'Cut2/Part 1/Ch 0 moved'); await fm.renameFile(f('Cut2/Part 2/Ch 1'), 'Cut2/Ch 1 top');`);
	const mid = await everything(p);
	await p.ev(`(() => { window.__back = (async () => { const s = ${PL}.snapshotsApi.list(${file('Cut2')}).find(x => x.title === 'Cut draft'); try { await ${PL}.snapshotsApi.back(s, ${file('Cut2')}, 'all', 'stay'); } catch (e) { window.__err = e.message; } })(); return 1; })()`);
	let cut = false;
	for (let i = 0; i < 4000 && !cut; i++) {
		const st = await p.ev(`(async () => { const a = app.vault.adapter, jp = 'Cut2/Snapshots/Bringing back.binder-journal'; if (!(await a.exists(jp))) return null; const jr = JSON.parse(await a.read(jp)); if (jr.finished) return 'done'; return app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Cut2/Part 1/Ch 0 moved/')).length; })()`);
		if (st === 'done') break;
		if (typeof st === 'number' && st < 20) cut = true;
	}
	say('cut?', cut);
	if (!cut) throw new Error('could not cut it short (it finished first)');
	await p.ev(`(() => { setTimeout(() => location.reload(), 0); return 1; })()`).catch(() => {});
	await sleep(p, 1500);
	for (let i = 0; i < 80; i++) { if (await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.binders)`).catch(() => false)) break; await sleep(p, 250); }
	await p.ev(`app.plugins.plugins.binders.binders.ready.then(() => 1)`);
	p.errors.length = 0;
	await p.focusMain?.();
	await sleep(p, 1500);
	const jr = await journal(p, 'Cut2/Snapshots');
	t.ok(jr && !jr.finished, 'the plan file is there and not finished');
	const modal = await until(p, `document.querySelector('.modal.binders-folder-snapshots-interrupted')?.innerText ?? null`, 10000);
	say('modal', j(modal));
	t.ok(!!modal && /Finish/.test(modal) && /Put it back as it was/.test(modal) && /Leave it as it is/.test(modal), 'the three ways are offered: ' + j(modal));
	if (!modal) return;
	await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-folder-snapshots-interrupted button')].find(b => b.textContent === 'Finish').click(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-folder-snapshots-back .binders-folder-snapshots-plan')`, 30000);
	await sleep(p, 500);
	await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-folder-snapshots-back .modal-button-container button')].find(b => b.textContent === 'Bring back').click(); return 1; })()`);
	await until(p, `!document.querySelector('.modal.binders-folder-snapshots-back')`, 90000);
	await settle(p);
	const after = await everything(p);
	invariants(t, before, mid, after);
	const strays = Object.keys(notesOf(after)).filter((k) => /^Cut2\/(Part 1\/Ch 0 moved|Ch 1 top)\//.test(k));
	t.eq(strays.length, 0, 'finishing: no note is left in the folders they were moved to: ' + j(strays.slice(0, 3)));
	const wrong = Object.keys(notesOf(before)).filter((k) => !/Cut2\/Cut2\.md$/.test(k) && after[k] !== before[k]);
	t.eq(wrong.length, 0, 'every note of the snapshot is as it was: ' + j(wrong.slice(0, 3)));
	const jr2 = await journal(p, 'Cut2/Snapshots');
	t.ok(jr2 && !!jr2.finished, 'the plan is marked finished');
}, 500000);

test('a plan file left by a bringing back, then the writer edits a note by hand and chooses “Put it back as it was”: the hand edit is not lost', async (p, h, t) => {
	await make(p, 'Put', `[
		{ path: 'A/One.md', text: 'One original.\\n\\nOne second.\\n' },
		{ path: 'B/Two.md', text: 'Two original.\\n\\nTwo second.\\n' }
	]`);
	await snap(p, 'Put', 'Put draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Put/A/One.md'), 'Put/B/One moved.md');`);
	const mid = await everything(p);
	// the plan file as a cut-short bringing back leaves it: take a real one from a run, then put it back unfinished
	await backAs(p, 'Put draft', 'Put');
	await settle(p);
	const jp = 'Put/Snapshots/Bringing back.binder-journal';
	const jr = await journal(p, 'Put/Snapshots');
	say('journal', j(jr).slice(0, 400));
	t.ok(jr && jr.finished > 0, 'a finished bringing back leaves its plan marked finished');
	// make it look unfinished, the snapshot-taken-first (before) still being there
	await work(p, `const x = JSON.parse(await v.adapter.read(${j(jp)})); x.finished = 0; await v.adapter.write(${j(jp)}, JSON.stringify(x));`);
	await p.ev(`${PL}.snapshotsApi.interrupted().then(() => 1)`);
	const modal = await until(p, `document.querySelector('.modal.binders-folder-snapshots-interrupted')?.innerText ?? null`, 10000);
	say('modal', j(modal));
	t.ok(!!modal, 'the question is asked for a plan left unfinished');
	if (!modal) return;
	await work(p, `await v.adapter.write('Put/B/Two.md', (await v.adapter.read('Put/B/Two.md')) + '\\nHAND-EDIT-BETWEEN.\\n');`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-folder-snapshots-interrupted button')].find(b => b.textContent === 'Put it back as it was').click(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-folder-snapshots-back .binders-folder-snapshots-plan')`, 30000);
	await sleep(p, 500);
	await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-folder-snapshots-back .modal-button-container button')].find(b => b.textContent === 'Bring back').click(); return 1; })()`);
	await until(p, `!document.querySelector('.modal.binders-folder-snapshots-back')`, 60000);
	await settle(p);
	const after = await everything(p);
	t.ok(Object.values(after).some((v) => v.includes('HAND-EDIT-BETWEEN')), 'the hand edit is on disk somewhere (a note or a snapshot)');
	invariants(t, before, { ...mid, 'Put/B/Two.md': mid['Put/B/Two.md'] + '\nHAND-EDIT-BETWEEN.\n' }, after);
});

// =====================================================================================================================
// 8. Refusals
test('a binder note from a newer format: bringing back is refused and writes nothing', async (p, h, t) => {
	await make(p, 'New', `[ { path: 'A.md', text: 'A original.\\n' }, { path: 'B.md', text: 'B original.\\n' } ]`);
	await snap(p, 'New', 'New draft');
	await work(p, `await v.process(f('New/A.md'), (t) => t + '\\nCHANGED.\\n'); await v.adapter.write('New/New.md', '---\\nbinder: 99\\ncontents:\\n  - B\\n  - A\\n---\\n');`);
	const mid = await everything(p);
	const r = await backAs(p, 'New draft', 'New');
	await settle(p);
	const after = await everything(p);
	say('newer', j(r));
	const changed = Object.keys(notesOf(after)).filter((k) => after[k] !== mid[k]);
	t.eq(changed.length, 0, 'no note was written in a binder of a newer format: ' + j(changed));
	t.eq(after['New/New.md'], mid['New/New.md'], 'the newer binder note is byte for byte as it was');
});

test('a folder’s own note (synopsis, label) in a renamed folder: synopsis and label are back after the folder is renamed and its note is edited', async (p, h, t) => {
	await make(p, 'Own', `[
		{ path: 'Ch/Ch.md', text: ${j('---\nsynopsis: The chapter synopsis\nlabel: Green\n---\n')} + 'Chapter note body.\\n' },
		{ path: 'Ch/S1.md', text: 'S1 text.\\n' }
	]`);
	await sleep(p, 600);
	await snap(p, 'Own', 'Own draft');
	const before = await everything(p);
	await work(p, `await fm.renameFile(f('Own/Ch'), 'Own/Chapter renamed'); await fm.processFrontMatter(f('Own/Chapter renamed/Chapter renamed.md'), (m) => { m.synopsis = 'CHANGED synopsis'; m.label = 'Red'; });`);
	const mid = await everything(p);
	say('own mid', j(Object.keys(notesOf(mid)).filter((k) => k.startsWith('Own/'))));
	const r = await backAs(p, 'Own draft', 'Own');
	await settle(p);
	const after = await everything(p);
	say('own result', j(r), j(Object.keys(notesOf(after)).filter((k) => k.startsWith('Own/'))), j(after['Own/Ch/Ch.md']));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.eq(after['Own/Ch/Ch.md'], before['Own/Ch/Ch.md'], 'the folder’s note is back under its name with its synopsis and label, byte for byte');
	t.eq(after['Own/Ch/S1.md'], before['Own/Ch/S1.md'], 'the scene is back in the folder');
	invariants(t, before, mid, after);
});
