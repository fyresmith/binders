// A note moved into a folder at the moment "Undo" takes that folder away (a group, taken back). Found by the random
// walk (specs-qa3-scenes.mjs, seed 3, "the text of ... is nowhere any more"): the folder is checked empty, then
// trashed, and the trash takes a moment (a real system trash does), so a note that arrives in that moment is trashed
// with it, out of the binder, with no word said. It is in the trash, not destroyed. Fails on purpose until fixed.
import { B, j, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo group race: ' + name, fn });

test('BUG: a note moved into a group while Undo is trashing it is not trashed with it', withTidy(async (p, h, t) => {
	const r = await p.ev(`(async () => {
		const store = ${B}, vault = app.vault, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
		vault.setConfig('trashOption', 'local');
		const find = (n) => vault.getFiles().find((f) => f.basename === n);
		const a = find('Arrival'), b = find('The keeper'), c = find('The wreck'), wreck = await vault.adapter.read(c.path);
		const parentPath = a.parent.path; await store.group([a, b], 'Grp'); await store.flush();
		const g = vault.getAbstractFileByPath(parentPath + '/Grp');
		const trashFile = app.fileManager.trashFile.bind(app.fileManager);
		app.fileManager.trashFile = async (f) => { if (f.children) await sleep(300); return trashFile(f); };
		const log = [];
		try {
			const u = store.undo('The Lighthouse').catch((e) => log.push('undo: ' + e.message));
			await sleep(100);
			const m = store.put([c], g, null).catch((e) => log.push('put: ' + e.message));
			await Promise.all([u, m]); await store.flush(); await sleep(300);
		} finally { app.fileManager.trashFile = trashFile; }
		const texts = []; for (const f of vault.getMarkdownFiles()) texts.push(await vault.adapter.read(f.path));
		const trash = []; try { const walk = async (d) => { const l = await vault.adapter.list(d); trash.push(...l.files); for (const x of l.folders) await walk(x); }; await walk('.trash'); } catch { /* none */ }
		return { kept: texts.includes(wreck), where: vault.getMarkdownFiles().filter((f) => f.basename === 'The wreck').map((f) => f.path), trash, log };
	})()`);
	t.ok(r.kept, `the text of “The wreck” is in the vault (in: ${j(r.where)}; the trash holds ${j(r.trash)}; ${j(r.log)})`);
}));
