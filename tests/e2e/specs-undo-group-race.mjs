// A note moved into a folder at the moment Binders takes that (emptied) folder away: Undo of a group, Ungroup's
// cleanup, Undo of "New folder". Found by the random walk (specs-qa3-scenes.mjs, seed 3): the folder was checked
// empty, then trashed whole, and the trash takes a moment (a real system trash does), so a note that arrived in that
// moment was trashed with it, out of the binder, with no word said. Now the folder is removed with Node's non-recursive
// rmdir, which the disk refuses when anything is in it (src/folder-remove.ts). The tests slow that removal (and the
// trash, which the old code used) to 300 ms and move a note in at 100 ms.
import { B, j, withTidy } from './view-helpers.mjs';

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
		const trash = []; try { const walk = async (d) => { const l = await vault.adapter.list(d); trash.push(...l.files); for (const x of l.folders) await walk(x); }; await walk('.trash'); } catch { /* none */ }
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
