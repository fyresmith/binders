// A binder's Snapshots folder is not an item. What can a writer do with it through Binders' own surfaces (the folder
// is never listed, in a view or in the file explorer), and what happens when Obsidian's own "Move file to..." puts a
// note into it. These pin today's behaviour; none of it loses writing.
import { B, cards, contents, flush, j, openView, texts, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'snapshots folder: ' + name, fn });
const S = 'The Lighthouse/Snapshots';
const SNAP = `${S}/Part One/Arrival/2026-09-12 09.15.40.snapshot`;
const SNAP_TEXT = '---\nsnapshot-of: "Part One/Arrival"\ntaken: 2026-09-12T09:15:40\n---\nOld words.\n';
const seed = (p) => p.ev(`(async () => { for (const d of ['${S}', '${S}/Part One', '${S}/Part One/Arrival']) if (!app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d); await app.vault.create(${j(SNAP)}, ${j(SNAP_TEXT)}); })().then(() => 1)`);
const gone = (p) => p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('${S}'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);

test('the Snapshots folder is no item: not in the order, not a card, and the store does not move it', withTidy(async (p, h, t) => {
	await seed(p); await p.sleep(400);
	try {
		const names = await p.ev(`(${B}.orderedChildren(app.vault.getAbstractFileByPath('The Lighthouse')) || []).map(f => f.name)`);
		t.ok(!names.includes('Snapshots'), `not among the binder's items (${j(names)})`);
		t.ok(await p.ev(`${B}.isSnapshotsFolder(app.vault.getAbstractFileByPath('${S}'))`), 'the store knows it as the snapshots folder');
		await openView(p);
		t.ok(!(await cards(p)).some((c) => c.includes('/Snapshots')), 'no card for it, or for anything in it');
		const before = await contents(p);
		await p.ev(`${B}.moveUp(app.vault.getAbstractFileByPath('${S}')).catch(() => false)`);
		await flush(p); await p.sleep(300);
		t.eq(j(await contents(p)), j(before), 'asked to step, the list is as it was');
		t.eq(await p.ev(`app.vault.adapter.read(${j(SNAP)})`), SNAP_TEXT, 'and the snapshot is as it was');
	} finally { await gone(p); }
}));

test('Obsidian’s “Move file to...” can put a note into Snapshots: nothing is lost, the folder becomes an ordinary one of the writer’s, and the snapshot stays', withTidy(async (p, h, t) => {
	await seed(p); await p.sleep(400);
	try {
		const before = await texts(p);
		await h.open('The Lighthouse/Prologue.md');
		await p.ev(`app.commands.executeCommandById('file-explorer:move-file')`);
		await p.sleep(500);
		await p.type('Snapshots'); await p.sleep(500);
		await p.key('Enter'); await p.sleep(900);
		await flush(p); await p.sleep(500);
		t.eq(j(await p.ev(`app.vault.getFiles().filter(f => f.basename === 'Prologue').map(f => f.path)`)), j([`${S}/Prologue.md`]), 'the note went in (Obsidian’s own dialog does not ask Binders)');
		t.ok(Object.values(await texts(p)).includes(before['The Lighthouse/Prologue.md']), 'its text is there');
		t.eq(await p.ev(`app.vault.adapter.read(${j(SNAP)})`), SNAP_TEXT, 'the snapshot is untouched');
		t.ok(!(await p.ev(`${B}.isSnapshotsFolder(app.vault.getAbstractFileByPath('${S}'))`)), 'a Snapshots folder with a note in it is the writer’s own folder (its documented rule)');
		t.ok((await contents(p)).includes('Snapshots/Prologue'), 'and the note is listed in the binder, in it');
	} finally { await gone(p); }
}));
