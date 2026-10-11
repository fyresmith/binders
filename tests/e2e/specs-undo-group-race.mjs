// A note moved into a folder at the moment Binders takes that (emptied) folder away: Undo of a group, Ungroup's
// cleanup, Undo of "New folder". Found by the random walk (specs-qa3-scenes.mjs, seed 3): the folder was checked
// empty, then trashed whole, and the trash takes a moment (a real system trash does), so a note that arrived in that
// moment was trashed with it, out of the binder, with no word said. Now the folder is removed with Node's non-recursive
// rmdir, which the disk refuses when anything is in it (src/folder-remove.ts). The tests slow that removal (and the
// trash, which the old code used) to 300 ms and move a note in at 100 ms.
import { B, file, j, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo group race: ' + name, fn });

// The page code shared by the tests: slow the removals, run `during` at 100 ms, put everything back, then say where
// the text of “The wreck” is, and what the trash holds.
const RACE = `
	const store = ${B}, vault = app.vault, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	vault.setConfig('trashOption', 'local');
	const find = (n) => vault.getFiles().find((f) => f.basename === n);
	const a = find('Arrival'), b = find('The keeper'), c = find('The wreck'), wreck = await vault.adapter.read(c.path);
	const parentPath = a.parent.path, log = [];
	const slow = async (start, during) => {
		const trashFile = app.fileManager.trashFile.bind(app.fileManager), fsp = window.require('fs').promises, rmdir = fsp.rmdir.bind(fsp);
		app.fileManager.trashFile = async (f) => { if (f.children) await sleep(300); return trashFile(f); };
		fsp.rmdir = async (p) => { await sleep(300); return rmdir(p); };
		try {
			const u = start().catch((e) => log.push('start: ' + e.message));
			await sleep(100);
			const m = during().catch((e) => log.push('during: ' + e.message));
			await Promise.all([u, m]); await store.flush(); await sleep(300);
		} finally { app.fileManager.trashFile = trashFile; fsp.rmdir = rmdir; }
	};
	const report = async () => {
		const texts = []; for (const f of vault.getMarkdownFiles()) texts.push(await vault.adapter.read(f.path));
		const trash = []; try { const walk = async (d) => { const l = await app.vault.adapter.list(d); trash.push(...l.files); for (const x of l.folders) await walk(x); }; await walk('.trash'); } catch { /* none */ }
		return { kept: texts.includes(wreck), where: vault.getMarkdownFiles().filter((f) => f.basename === 'The wreck').map((f) => f.path), trash, log };
	};`;
const says = (r, what) => `the text of “The wreck” is in the vault, ${what} (in: ${j(r.where)}; the trash holds ${j(r.trash)}; ${j(r.log)})`;

test('a note moved into a group while Undo is removing it is not trashed with it', withTidy(async (p, h, t) => {
	const r = await p.ev(`(async () => { ${RACE}
		await store.group([a, b], 'Grp'); await store.flush();
		const g = vault.getAbstractFileByPath(parentPath + '/Grp');
		await slow(() => store.undo('The Lighthouse'), () => store.put([c], g, null));
		return report();
	})()`);
	t.ok(r.kept, says(r, 'after Undo of a group'));
}));

test('a note moved into a folder while Ungroup takes it away is not trashed with it', withTidy(async (p, h, t) => {
	const r = await p.ev(`(async () => { ${RACE}
		const g = await store.group([a, b], 'Grp'); await store.flush();
		await slow(() => store.ungroup(g), () => store.put([c], g, null));
		return report();
	})()`);
	t.ok(r.kept, says(r, 'after Ungroup'));
}));

test('a note moved into a folder made by hand while Undo removes it is not trashed with it', withTidy(async (p, h, t) => {
	const r = await p.ev(`(async () => { ${RACE}
		const g = await store.newFolderByHand(a.parent, 0, 'Fresh'); await store.flush();
		await slow(() => store.undo('The Lighthouse'), () => store.put([c], g, null));
		return report();
	})()`);
	t.ok(r.kept, says(r, 'after Undo of New folder'));
}));

test('a folder with a file Binders does not show in it is not removed by Undo of a group', withTidy(async (p, h, t) => {
	const r = await p.ev(`(async () => { ${RACE}
		await store.group([a, b], 'Grp'); await store.flush();
		const dir = parentPath + '/Grp';
		await vault.adapter.writeBinary(dir + '/picture.png', new Uint8Array([137, 80, 78, 71]).buffer);
		const out = await store.undo('The Lighthouse').catch((e) => 'refused: ' + e.message);
		await store.flush(); await sleep(300);
		return { out, picture: await vault.adapter.exists(dir + '/picture.png'), folder: await vault.adapter.exists(dir), trash: (await vault.adapter.exists('.trash')) ? (await vault.adapter.list('.trash')).files : [] };
	})()`);
	t.ok(r.picture && r.folder, `the folder and its picture are still there (${j(r)})`);
}));

// ---- the other places a folder is taken away once it is believed empty ----

// Slows the removal of a folder to 300 ms (Node's rmdir, and the trash the old code used) and, 100 ms into the first
// one, writes `late` into it, as a drop or a sync client would. Page code; `late` is the file's path in the vault.
const LATE = (late) => `
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), vault = app.vault;
	const trashFile = app.fileManager.trashFile.bind(app.fileManager), fsp = window.require('fs').promises, rmdir = fsp.rmdir.bind(fsp);
	let wrote = null;
	const arrive = () => { wrote ??= (async () => { await sleep(100); await vault.adapter.write(${j(late)}, 'LATE WORDS'); })(); return sleep(300); };
	app.fileManager.trashFile = async (f) => { if (f.children) await arrive(); return trashFile(f); };
	fsp.rmdir = async (p) => { await arrive(); return rmdir(p); };
	const done = async () => { app.fileManager.trashFile = trashFile; fsp.rmdir = rmdir; await wrote; await sleep(300); };`;

const TOP = 'The Lighthouse/Prologue.md', FM = '---\nstatus: draft\nsynopsis: The storm.\naliases: [Gale]\n---\n';
const BODY = '# Storm\n\nIntro text here.\n\n## One\n\nOne words.\n\n## Two\n\nTwo words.\n';
const D = '.modal.binders-split-many';

test('a note written into the folder a split made while Undo takes it away is not trashed with it', withTidy(async (p, h, t) => {
	const orig = await read(p, TOP);
	try {
		await openView(p);
		await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
		await writeRaw(p, TOP, FM + BODY); await p.sleep(500);
		await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(${file(TOP)}, { state: { mode: 'source', source: false } }); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
		await p.sleep(600);
		await p.ev(`app.commands.executeCommandById('binders:split-at-headings')`);
		await until(p, `!!document.querySelector('${D} [data-binders-key="go"]')`, 5000);
		await p.sleep(300);
		await p.ev(`(() => { document.querySelector('${D} [data-binders-key="go"]').click(); return 1; })()`);
		await p.sleep(1500);
		const made = await p.ev(`!!${file('The Lighthouse/Prologue notes')}`);
		const r = await p.ev(`(async () => { app.vault.setConfig('trashOption', 'local'); ${LATE('The Lighthouse/Prologue notes/late.md')}
			let out; try { out = await ${B}.undo(${file('The Lighthouse')}).catch((e) => 'refused: ' + e.message); await ${B}.flush(); } finally { await done(); }
			const texts = []; for (const f of vault.getMarkdownFiles()) texts.push(await vault.adapter.read(f.path));
			return { out, kept: texts.includes('LATE WORDS'), where: vault.getMarkdownFiles().filter((f) => f.basename === 'late').map((f) => f.path) };
		})()`);
		t.ok(made, 'the split made the folder “Prologue notes”');
		t.ok(r.kept, `the words that arrived are in the vault (in: ${j(r.where)}; undo said ${j(r.out)})`);
	} finally { await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`); await writeRaw(p, TOP, orig); }
}));

test('a snapshot arriving in the folder a note’s snapshots just left is not trashed with it', withTidy(async (p, h, t) => {
	const SN = 'The Lighthouse/Snapshots'; // (named again inside the page code)
	const r = await p.ev(`(async () => { const store = ${B}, SN = ${j(SN)};
		app.vault.setConfig('trashOption', 'local');
		for (const d of [SN, SN + '/Part One', SN + '/Part One/Arrival', SN + '/Part Two', SN + '/Part Two/Arrival']) if (!app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d);
		await app.vault.create(SN + '/Part One/Arrival/2026-09-12 09.15.40.snapshot', 'one'); await app.vault.create(SN + '/Part Two/Arrival/2026-09-13 09.15.40.snapshot', 'two');
		${LATE('The Lighthouse/Snapshots/Part One/Arrival/2026-09-14 09.15.40.snapshot')}
		try { await store.move(app.vault.getAbstractFileByPath('The Lighthouse/Part One/Arrival.md'), app.vault.getAbstractFileByPath('The Lighthouse/Part Two'), 0); await store.snapshotsSettle(); await store.flush(); } finally { await done(); }
		const all = []; const walk = async (d) => { const l = await app.vault.adapter.list(d); all.push(...l.files); for (const x of l.folders) await walk(x); };
		await walk(SN); try { await walk('.trash'); } catch { /* none */ }
		return all;
	})()`);
	const late = r.filter((f) => f.endsWith('2026-09-14 09.15.40.snapshot'));
	t.ok(late.length === 1 && !late[0].startsWith('.trash'), `the snapshot that arrived is still in Snapshots (${j(r)})`);
}));

// ---- the way off a computer: no Node, so the folder is listed, then removed ----

test('without Node (a phone): an emptied folder is removed, and one something arrived in is not', withTidy(async (p, h, t) => {
	const r = await p.ev(`(async () => { const store = ${B}, vault = app.vault, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
		const find = (n) => vault.getFiles().find((f) => f.basename === n), a = find('Arrival'), b = find('The keeper'), parent = a.parent.path;
		const out = {}, req = window.require, log = [];
		const noNode = async (fn) => { window.require = undefined; try { return await fn(); } finally { window.require = req; } };
		await store.group([a, b], 'Grp'); await store.flush();
		out.empty = await noNode(() => store.undo('The Lighthouse').catch((e) => 'refused: ' + e.message)); await store.flush(); await sleep(400);
		out.emptyGone = !(await vault.adapter.exists(parent + '/Grp'));
		await store.group([find('Arrival'), find('The keeper')], 'Grp2'); await store.flush();
		// a file arrives just before Binders looks at the disk to remove the folder (the tree has not heard of it yet)
		const list = vault.adapter.list.bind(vault.adapter); let looks = 0;
		vault.adapter.list = async (d) => { if (d === parent + '/Grp2' && ++looks === 1) await vault.adapter.write(d + '/late.md', 'LATE WORDS'); return list(d); };
		try { out.full = await noNode(() => store.undo('The Lighthouse').catch((e) => 'refused: ' + e.message)); await store.flush(); await sleep(400); } finally { vault.adapter.list = list; }
		out.fullStays = await vault.adapter.exists(parent + '/Grp2/late.md'); out.looks = looks; out.late = vault.getFiles().filter((f) => f.basename === 'late').map((f) => f.path); out.log = log; out.dir = (await vault.adapter.exists(parent)) ? (await vault.adapter.list(parent)).folders : null; out.trash = (await vault.adapter.exists('.trash')) ? (await vault.adapter.list('.trash')) : null;
		return out;
	})()`);
	t.ok(r.emptyGone, `the emptied folder is removed (${j(r)})`);
	t.ok(r.fullStays, `the folder something arrived in stays with it (${j(r)})`);
}));
