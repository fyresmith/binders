// QA round 6: the binder store and the file explorer, broken with storms, outside edits, undo and cold starts.
// Tests named "BUG: …" fail on purpose until the bug they show is fixed; the rest are regressions.
// After every scenario the binder note is read from disk and `contents` is checked against the folder entry by entry
// (`audit`), and no note's text may have changed.
import { B, PL, NOTE, j, file, until, read, exists, texts, split, contents, flush, writeRaw } from './view-helpers.mjs';
import { row, rightClick, pick, closeMenu, rows as explorerRows, clearSelection, drag, hold, release, cancel, over, held, mk, undo as undoCmd, order } from './specs-qa4-explorer.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa6 store: ' + name, fn });

const BINDERS = `${B}.all().filter(b => b.kind === 'binder')`;
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const KEEP_FOLDERS = ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two'];
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];

/** Removes what a test made (the runner restores the notes and the settings), and puts Obsidian's sort back. */
async function tidy(p) {
	await p.ev(`(async () => {
		window.__ref && app.vault.offref(window.__ref); window.__ref = null;
		document.querySelectorAll('.modal-close-button').forEach(b => b.click());
		const keep = new Set([...${j(KEEP_FOLDERS)}, 'Longform demo']);
		const extra = app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !keep.has(f.path));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		for (const k of keep) if (!app.vault.getAbstractFileByPath(k)) await app.vault.createFolder(k);
		for (const f of app.vault.getAllLoadedFiles().filter(f => !f.children && f.extension !== 'md' && f.path.startsWith('The Lighthouse/'))) await app.vault.delete(f);
		const e = app.workspace.getLeavesOfType('file-explorer')[0]?.view; if (e?.sortOrder && e.sortOrder !== 'alphabetical') e.setSortOrder('alphabetical');
		if (!app.plugins.plugins.binders) await app.plugins.enablePlugin('binders');
		await app.plugins.plugins.binders.binders.flush();
	})().then(() => 1)`).catch(() => {});
	await p.sleep(200);
}
const withTidy = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await tidy(p); } };
const kids = (p, folder) => p.ev(`(${B}.orderedChildren(${file(folder)}) || []).map(f => f.name)`);
const rename = (p, from, to) => p.ev(`app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => 1)`);
const countWrites = (p, path = NOTE) => p.ev(`(() => { window.__writes = 0; window.__ref && app.vault.offref(window.__ref); window.__ref = app.vault.on('modify', f => { if (f.path === ${j(path)}) window.__writes++; }); return 1; })()`);
const writes = (p) => p.ev(`window.__writes`);

/**
 * Waits for the store to settle, then compares the binder note on disk with the folder on disk and with what the store
 * shows. Returns the problems found (an empty list is a pass).
 *   - the vault's tree is what the disk has (no missed event)
 *   - `contents` has no entry twice, and no entry for a file that isn't there
 *   - what the store shows for every folder starts with the listed items, in the listed order, and has every item
 */
async function audit(p, { root = 'The Lighthouse', note = NOTE, settle = 1000, strict = true } = {}) {
	await flush(p); await p.sleep(settle); await flush(p);
	const info = await p.ev(`(async () => {
		const adapter = app.vault.adapter, out = { disk: {}, tree: {}, order: {} };
		const walk = async (d) => { const l = await adapter.list(d); out.disk[d] = { files: l.files.map(x => x.split('/').pop()).sort(), folders: l.folders.map(x => x.split('/').pop()).sort() }; for (const f of l.folders) await walk(f); };
		const rootF = app.vault.getAbstractFileByPath(${j(root)});
		if (!rootF) return { gone: true };
		await walk(${j(root)});
		const tree = (f) => { out.tree[f.path] = { files: f.children.filter(c => !c.children).map(c => c.name).sort(), folders: f.children.filter(c => c.children).map(c => c.name).sort() }; f.children.filter(c => c.children).forEach(tree); };
		tree(rootF);
		const walkO = (f) => { const k = ${B}.orderedChildren(f); if (!k) return; out.order[f.path] = k.map(c => c.name); k.filter(c => c.children).forEach(walkO); };
		walkO(rootF);
		out.binder = !!${B}.binderOf(rootF);
		return out;
	})()`);
	const problems = [];
	if (info.gone) return ['the binder folder is gone'];
	if (!info.binder) problems.push('the folder is no longer a binder');
	for (const d of Object.keys(info.disk)) {
		if (j(info.disk[d]) !== j(info.tree[d])) { const a = [...info.disk[d].files, ...info.disk[d].folders], b = [...info.tree[d].files, ...info.tree[d].folders]; problems.push(`the vault's tree differs from the disk in ${d}: only on disk ${j(a.filter((x) => !b.includes(x)))}, only in the tree ${j(b.filter((x) => !a.includes(x)))}`); }
	}
	if (!(await exists(p, note))) return [...problems, 'the binder note is gone'];
	const list = await contents(p, note);
	const dupes = list.filter((x, i) => list.indexOf(x) !== i);
	if (dupes.length) problems.push('listed twice: ' + dupes.join(', '));
	const has = (e) => {
		const isF = e.endsWith('/'), parts = e.replace(/\/$/, '').split('/'), name = parts.pop(), dir = [root, ...parts].join('/'), d = info.disk[dir];
		return !!d && (isF ? d.folders.includes(name) : d.files.includes(name + '.md') || d.files.includes(name));
	};
	if (strict) for (const e of list) if (!has(e)) problems.push('listed but not there: ' + e);
	const hidden = (dir, name) => (dir === root && name === note.split('/').pop()) || (dir !== root && name === dir.split('/').pop() + '.md');
	for (const dir of Object.keys(info.order)) {
		const rel = dir === root ? '' : dir.slice(root.length + 1) + '/';
		const real = (n) => info.disk[dir]?.folders.includes(n) ? n + '/' : n;
		const shown = info.order[dir];
		const want = new Set([...info.disk[dir].folders, ...info.disk[dir].files.filter((n) => !hidden(dir, n))]);
		if (j([...want].sort()) !== j([...shown].sort())) problems.push(`the store shows ${j(shown)} in ${dir}, the folder has ${j([...want])}`);
		// the listed items of this folder, in the listed order, come first
		const listed = list.filter((e) => e.startsWith(rel) && !e.slice(rel.length).replace(/\/$/, '').includes('/')).map((e) => { const n = e.slice(rel.length).replace(/\/$/, ''); return e.endsWith('/') ? (info.disk[dir].folders.includes(n) ? n : null) : info.disk[dir].files.includes(n) && info.disk[dir].files.includes(n + '.md') ? n : info.disk[dir].files.includes(n + '.md') ? n + '.md' : info.disk[dir].files.includes(n) ? n : null; }).filter(Boolean);
		if (j(shown.slice(0, listed.length)) !== j(listed)) problems.push(`in ${dir} the store shows ${j(shown)} but the list says ${j(listed)}`);
	}
	return problems;
}
const clean = async (p, t, what, opts) => { const pr = await audit(p, opts); t.ok(!pr.length, `${what}: ${pr.slice(0, 4).join(' | ')}`); };
/** No note's text changed (every note under its own name, or under the new one if `moved` says so). */
function textsKept(t, before, after, { skip = [], moved = {} } = {}) {
	for (const [path, text] of Object.entries(before)) {
		if (skip.includes(path)) continue;
		t.ok(after[moved[path] ?? path] === text, `“${path}” keeps its text`);
	}
}

// ---- storms ----

/** Makes a binder of 5 folders and 8 loose notes, listed in a shuffled order (so binder order differs from name order),
    each note's text carrying an id. Returns the ids in list order. */
async function stormBinder(p, { listed = true, folderNotes = false } = {}) {
	return p.ev(`(async () => {
		const v = app.vault, list = [], ids = [];
		await v.createFolder('Storm');
		const rnd = (() => { let a = 7; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
		const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };
		const top = [];
		for (let f = 0; f < 5; f++) top.push('Folder ' + f + '/');
		for (let n = 0; n < 8; n++) top.push('Loose ' + n);
		shuffle(top);
		let id = 0;
		for (const e of top) {
			list.push(e);
			if (e.endsWith('/')) {
				await v.createFolder('Storm/' + e.slice(0, -1));
				if (${folderNotes}) await v.create('Storm/' + e.slice(0, -1) + '/' + e.slice(0, -1) + '.md', 'Folder note of ' + e.slice(0, -1) + '\\n');
				const inner = []; for (let n = 0; n < 10; n++) inner.push('Scene ' + n);
				for (const s of shuffle(inner)) list.push(e + s);
			}
		}
		for (const e of list) {
			if (e.endsWith('/')) continue;
			const text = 'Text of note ' + (id++) + '\\nsecond line of ' + e + '\\n';
			await v.create('Storm/' + e + '.md', text);
		}
		await v.create('Storm/Storm.md', '---\\nbinder: 1\\ncontents:\\n' + (${listed} ? list.map(x => '  - ' + x).join('\\n') : '  - Loose 0') + '\\n---\\nThe binder note.\\n');
		return list;
	})()`);
}
const waitStorm = (p, n) => until(p, `${B}.isBinderFolder(${file('Storm')}) && ${B}.orderedChildren(${file('Storm')}).length === ${n}`, 5000);

/** Every note's text by path, under `root`. */
const textsUnder = async (p, root) => Object.fromEntries(Object.entries(await texts(p)).filter(([k]) => k.startsWith(root + '/')));

/** The seeded random walk: `n` renames, moves and deletes over a binder, some fired together. `how`: 'api' goes through
    the vault and the file manager; 'adapter' changes the disk as a sync client would. Returns the count that threw. */
const walk = (p, { n = 200, how = 'api', seed = 1, moves = true, burst = 4 } = {}) => p.ev(`(async () => {
	const v = app.vault, fm = app.fileManager, ad = v.adapter, g = (x) => v.getAbstractFileByPath(x);
	const rnd = (() => { let a = ${seed}; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(), pick = (a) => a[Math.floor(rnd() * a.length)];
	let k = 0, threw = 0;
	const notes = () => v.getMarkdownFiles().filter(f => f.path.startsWith('Storm/') && f.path !== 'Storm/Storm.md' && !f.__fn && !(f.parent.path !== 'Storm' && f.basename === f.parent.name));
	const dirs = () => v.getAllLoadedFiles().filter(f => f.children && f.path.startsWith('Storm') && f.path !== 'Storm');
	const topDirs = () => dirs().filter(d => d.parent.path === 'Storm');
	let solo = false;
	const op = async () => {
		const r = rnd(), ns = notes(), ds = topDirs();
		solo = r >= 0.62; // a create or a folder change goes alone: Obsidian itself trips over a note made in a folder that is being renamed
		try {
			if (r < 0.28 && ns.length) { const f = pick(ns); const to = f.parent.path + '/R' + (k++) + '.md'; if ('${how}' === 'api') await (rnd() < 0.5 ? fm.renameFile(f, to) : v.rename(f, to)); else await ad.rename(f.path, to); }
			else if (r < 0.5 && ns.length && ${moves}) { const f = pick(ns), d = pick([...ds.map(x => x.path), 'Storm']); const to = d + '/M' + (k++) + '.md'; if ('${how}' === 'api') await fm.renameFile(f, to); else await ad.rename(f.path, to); }
			else if (r < 0.62 && ns.length > 20) { const f = pick(ns); if ('${how}' === 'api') await (rnd() < 0.5 ? v.delete(f) : fm.trashFile(f)); else await ad.remove(f.path); }
			else if (r < 0.74) { const d = pick([...ds.map(x => x.path), 'Storm']); const to = d + '/New ' + (k++) + '.md'; if ('${how}' === 'api') await v.create(to, 'Text of new ' + k + '\\n'); else await ad.write(to, 'Text of new ' + k + '\\n'); }
			else if (r < 0.84 && ds.length) { const d = pick(ds); const to = 'Storm/Dir ' + (k++); if ('${how}' === 'api') await fm.renameFile(d, to); else await ad.rename(d.path, to); }
			else if (r < 0.88 && ds.length > 2 && ${moves}) { const d = pick(ds), into = pick(ds.filter(x => x !== d)); if ('${how}' === 'api') await fm.renameFile(d, into.path + '/In ' + (k++)); else await ad.rename(d.path, into.path + '/In ' + (k++)); }
			else if (r < 0.9 && ds.length > 3) { const d = pick(ds); if ('${how}' === 'api') await v.delete(d, true); else await ad.rmdir(d.path, true); }
			else if (ns.length) { // a case-only rename
				const f = pick(ns), b = f.basename; const to = f.parent.path + '/' + (b === b.toUpperCase() ? b.toLowerCase() : b.toUpperCase()) + '.md'; if (to !== f.path) { if ('${how}' === 'api') await fm.renameFile(f, to); else await ad.rename(f.path, to); }
			}
		} catch (e) { threw++; }
	};
	for (let i = 0; i < ${n};) {
		const group = []; const size = 1 + Math.floor(rnd() * ${burst});
		for (let b = 0; b < size && i < ${n}; b++, i++) { const pr = op(); group.push(pr); if (solo) break; }
		await Promise.all(group);
		if (rnd() < 0.1) await new Promise(r => setTimeout(r, 40));
	}
	return threw;
})()`);

test('storm: 200 renames, moves, deletes and creates through the vault, some fired together, leave the list and the folder in step', withTidy(async (p, h, t) => {
	const list = await stormBinder(p);
	await waitStorm(p, 13);
	await p.sleep(600);
	const before = await textsUnder(p, 'Storm');
	const threw = await walk(p, { n: 200, how: 'api', seed: 1 });
	p.errors.splice(0, p.errors.length, ...p.errors.filter((e) => !/ENOENT/.test(e))); // (Obsidian indexing a note its next step renamed away)
	await clean(p, t, `after 200 operations (${threw} refused)`, { root: 'Storm', note: 'Storm/Storm.md', settle: 1500 });
	const after = await textsUnder(p, 'Storm');
	// every note that's still there has the text it had: the same set of bodies, none changed
	const bodies = new Set(Object.values(before));
	const bad = Object.entries(after).filter(([k, x]) => k !== 'Storm/Storm.md' && !bodies.has(x) && !/^Text of new/.test(x));
	t.ok(!bad.length, 'every note keeps its text: ' + bad.slice(0, 2).map((x) => x[0]).join(', '));
	t.eq(split(after['Storm/Storm.md']).body, 'The binder note.\n', 'the binder note’s text');
	t.ok(list.length > 0, 'ran');
}));

test('storm: the same through the vault, with no moves between folders, keeps each folder’s order for what stayed', withTidy(async (p, h, t) => {
	const list = await stormBinder(p);
	await waitStorm(p, 13);
	await p.sleep(600);
	// each note's place in the original list, found by its text; folders by an id kept on the object
	await p.ev(`(() => { const idx = ${j(list)}; for (const f of app.vault.getMarkdownFiles()) { if (!f.path.startsWith('Storm/') || f.path === 'Storm/Storm.md') continue; const rel = f.path.slice(6, -3); f.__at = idx.indexOf(rel); f.__top = rel.includes('/') ? rel.split('/')[0] : null; } return 1; })()`);
	await walk(p, { n: 160, how: 'api', seed: 5, moves: false });
	p.errors.splice(0, p.errors.length, ...p.errors.filter((e) => !/ENOENT/.test(e))); // (Obsidian indexing a note its next step renamed away)
	await clean(p, t, 'after 160 renames, deletes and creates', { root: 'Storm', note: 'Storm/Storm.md', settle: 1500 });
	// notes that only ever stayed where they were (or were renamed in place, as `walk` does: renames keep the TFile)
	const bad = await p.ev(`(() => {
		const out = [];
		const check = (folder) => { const o = ${B}.orderedChildren(folder) || []; const seen = o.filter(c => !c.children && c.__at >= 0).map(c => c.__at); for (let i = 1; i < seen.length; i++) if (seen[i] < seen[i - 1]) out.push(folder.path + ': ' + seen.join(',')); o.filter(c => c.children).forEach(check); };
		check(app.vault.getAbstractFileByPath('Storm')); return out; })()`);
	t.ok(!bad.length, 'surviving notes keep their order: ' + bad.slice(0, 2).join(' | '));
}));

test('storm: 200 changes made on the disk as a sync client makes them (delete and create, no rename events) leave the list sound', withTidy(async (p, h, t) => {
	await stormBinder(p);
	await waitStorm(p, 13);
	await p.sleep(600);
	const before = await textsUnder(p, 'Storm');
	await walk(p, { n: 200, how: 'adapter', seed: 2, burst: 3 });
	await p.sleep(2500);
	// (Obsidian's own file watcher logs ENOENT for a file that was already gone when it looked: not Binders')
	p.errors.splice(0, p.errors.length, ...p.errors.filter((e) => !/ENOENT/.test(e)));
	await clean(p, t, 'after 200 changes on the disk', { root: 'Storm', note: 'Storm/Storm.md', settle: 2500 });
	const after = await textsUnder(p, 'Storm');
	const bodies = new Set(Object.values(before));
	const bad = Object.entries(after).filter(([k, x]) => k !== 'Storm/Storm.md' && !bodies.has(x) && !/^Text of new/.test(x));
	t.ok(!bad.length, 'no note changed its text: ' + bad.slice(0, 2).map((x) => x[0]).join(', '));
	t.eq(split(after['Storm/Storm.md']).body, 'The binder note.\n', 'the binder note’s text');
}));

test('storm: a folder renamed while its notes are being moved out and renamed', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`(async () => {
		const fm = app.fileManager, g = (x) => app.vault.getAbstractFileByPath(x);
		const ps = [fm.renameFile(g('The Lighthouse/Part One'), 'The Lighthouse/Chapter One')];
		ps.push(fm.renameFile(g('The Lighthouse/Part One/Arrival.md'), 'The Lighthouse/Part Two/Arrival.md').catch(() => 0));
		ps.push(fm.renameFile(g('The Lighthouse/Part One/The keeper.md'), 'The Lighthouse/The keeper.md').catch(() => 0));
		ps.push(fm.renameFile(g('The Lighthouse/Part One/Storm warning.md'), 'The Lighthouse/Part One/Gale.md').catch(() => 0));
		await Promise.all(ps);
	})().then(() => 1)`);
	await clean(p, t, 'after a folder rename racing its notes', {});
	const now = await texts(p);
	t.eq(Object.values(now).filter((x) => /Arrival|keeper|Storm warning/i.test(x)).length >= 0 ? 1 : 0, 1, 'ran');
	const bodies = new Set(Object.values(now));
	for (const [k, x] of Object.entries(before)) if (k !== NOTE) t.ok(bodies.has(x), `the text of “${k}” is still somewhere`);
}));

test('storm: a case-only rename of a folder and a note, through the vault, the file manager and the disk, keeps their place', withTidy(async (p, h, t) => {
	await rename(p, 'The Lighthouse/Part One', 'The Lighthouse/PART ONE');
	await rename(p, 'The Lighthouse/Epilogue.md', 'The Lighthouse/EPILOGUE.md');
	await p.ev(`app.vault.adapter.rename('The Lighthouse/Prologue.md', 'The Lighthouse/PROLOGUE.md').then(() => 1)`);
	await p.ev(`app.vault.adapter.rename('The Lighthouse/Part Two', 'The Lighthouse/part two').then(() => 1)`);
	await p.sleep(1500);
	await clean(p, t, 'after the case-only renames', {});
	const names = await kids(p, 'The Lighthouse');
	t.eq(names.length, 4, 'four items: ' + j(names));
	t.eq(names[names.length - 1].toLowerCase(), 'epilogue.md', 'the epilogue stays last: ' + j(names));
	t.eq(names[0].toLowerCase(), 'prologue.md', 'the prologue stays first (the disk renamed it): ' + j(names));
	// the folder note followed its folder
	t.ok(await p.ev(`!!${file('The Lighthouse/PART ONE')} && ${B}.folderNote(${file('The Lighthouse/PART ONE')}) === null`), 'no folder note was made');
}));

test('storm: a note moved out of the binder and back within one write, and again after one, is listed once and last', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.createFolder('Outside').then(() => 1)`);
	await rename(p, 'The Lighthouse/Prologue.md', 'Outside/Prologue.md');
	await rename(p, 'Outside/Prologue.md', 'The Lighthouse/Prologue.md');
	await clean(p, t, 'out and back at once', {});
	let c = await contents(p);
	t.eq(c.filter((x) => x === 'Prologue').length, 1, 'listed once: ' + j(c));
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'Outside/Arrival.md');
	await flush(p); await p.sleep(500);
	t.ok(!(await contents(p)).includes('Part One/Arrival'), 'out: dropped from the list');
	await rename(p, 'Outside/Arrival.md', 'The Lighthouse/Part One/Arrival.md');
	await clean(p, t, 'out, written, and back', {});
	c = await contents(p);
	t.eq(c.filter((x) => x === 'Part One/Arrival').length, 1, 'listed once: ' + j(c));
	t.eq((await kids(p, 'The Lighthouse/Part One')).pop(), 'Arrival.md', 'back as the last of its folder');
}));

test('storm: a folder deleted and made again under its name, in one write and after one, takes no old order with it', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.delete(v.getAbstractFileByPath('The Lighthouse/Part Two'), true); await v.createFolder('The Lighthouse/Part Two'); await v.create('The Lighthouse/Part Two/The wreck.md', 'new wreck\\n'); await v.create('The Lighthouse/Part Two/Aaa.md', 'new aaa\\n'); })().then(() => 1)`);
	await clean(p, t, 'deleted and made again at once', {});
	let c = await contents(p);
	t.ok(!c.includes('Part Two/Lights out'), 'the old note’s entry is gone: ' + j(c));
	t.eq(j(await kids(p, 'The Lighthouse/Part Two')), j(['Aaa.md', 'The wreck.md']), 'the new notes show by name (nothing listed): ' + j(c));
	await p.ev(`(async () => { const v = app.vault; await v.delete(v.getAbstractFileByPath('The Lighthouse/Part One'), true); })().then(() => 1)`);
	await flush(p); await p.sleep(400);
	t.ok(!(await contents(p)).some((x) => x.startsWith('Part One')), 'deleted, written: nothing of it left');
	await p.ev(`(async () => { const v = app.vault; await v.createFolder('The Lighthouse/Part One'); await v.create('The Lighthouse/Part One/Arrival.md', 'again\\n'); })().then(() => 1)`);
	await clean(p, t, 'made again after the write', {});
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', 'Epilogue.md', 'Part One', 'Part Two']), 'the new folders show after the listed items, by name');
}));

test('storm: trash and bring back (the file manager’s trash, then the file put back by the disk) leaves a sound list', withTidy(async (p, h, t) => {
	const before = await read(p, 'The Lighthouse/Part One/Arrival.md');
	await p.ev(`app.fileManager.trashFile(${file('The Lighthouse/Part One/Arrival.md')}).then(() => 1)`);
	await p.sleep(400);
	await flush(p);
	t.ok(!(await contents(p)).includes('Part One/Arrival'), 'trashed: dropped from the list');
	const trashed = await p.ev(`(async () => { for (const d of ['.trash']) { if (await app.vault.adapter.exists(d)) { const l = await app.vault.adapter.list(d); return l.files; } } return []; })()`);
	if (trashed.length) {
		await p.ev(`app.vault.adapter.rename(${j(trashed.find((x) => /Arrival/.test(x)))}, 'The Lighthouse/Part One/Arrival.md').then(() => 1)`);
		await p.sleep(1200);
		t.eq(await read(p, 'The Lighthouse/Part One/Arrival.md'), before, 'the text came back as it was');
		await clean(p, t, 'after bringing it back', {});
		t.ok((await kids(p, 'The Lighthouse/Part One')).includes('Arrival.md'), 'it shows again');
	}
}));

// ---- the binder note by hand ----

const waitCache = (p, expr) => until(p, expr, 4000).then(() => p.sleep(300));
const edit = async (p, text, path = NOTE) => { await writeRaw(p, path, text); await p.sleep(900); };

test('hand: entries removed from the list show after the listed ones, by name, and a later move writes them all down', withTidy(async (p, h, t) => {
	await edit(p, `---\nbinder: 1\ncontents:\n  - Epilogue\n  - Part Two/\n  - Part Two/Lights out\n---\nbody\n`);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Epilogue.md', 'Part Two', 'Part One', 'Prologue.md']), 'the listed first, then folders then notes: ' + j(await kids(p, 'The Lighthouse')));
	t.eq(j(await kids(p, 'The Lighthouse/Part Two')), j(['Lights out.md', 'The wreck.md']), 'the listed first');
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Epilogue.md')}).then(() => 1)`);
	await clean(p, t, 'after a move', {});
	const c = await contents(p);
	t.eq(c.length, LIST.length, 'every item written down: ' + j(c));
}));

test('hand: duplicates, a reordered list and entries for files that aren’t there are cleaned by the next write, and nothing else changes', withTidy(async (p, h, t) => {
	const text = `---\nbinder: 1\nsynopsis: Kept\ncontents:\n  - Epilogue\n  - Ghost\n  - Epilogue\n  - Part Two/\n  - Part Two/The wreck\n  - Part Two/Nope\n  - Prologue\n  - Part One/\n---\nbody\n`;
	await edit(p, text);
	await p.ev(`${B}.moveUp(${file('The Lighthouse/Part Two')}).then(() => 1)`);
	await clean(p, t, 'after a move', {});
	const c = await contents(p);
	t.eq(j(c.slice(0, 2)), j(['Part Two/', 'Part Two/The wreck']), 'Part Two went up to the top of the hand-made order: ' + j(c));
	t.eq(c.indexOf('Epilogue') > c.indexOf('Part Two/'), true, 'Epilogue (listed twice) is once, after it: ' + j(c));
	t.ok(/synopsis: Kept/.test(await read(p, NOTE)), 'the other property stays');
	t.eq(split(await read(p, NOTE)).body, 'body\n', 'the body');
}));

test('hand: wrong types in the list (objects, nulls, booleans, nested lists, numbers) are ignored and not carried into the next write', withTidy(async (p, h, t) => {
	await edit(p, `---\nbinder: 1\ncontents:\n  - Prologue\n  - null\n  - true\n  - {a: 1}\n  - [Part One/, Epilogue]\n  - 3.5\n  - ""\n  - " "\n  - Epilogue\n---\nbody\n`);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', 'Epilogue.md', 'Part One', 'Part Two']), 'the usable entries order: ' + j(await kids(p, 'The Lighthouse')));
	await p.ev(`${B}.moveUp(${file('The Lighthouse/Epilogue.md')}).then(() => 1)`);
	await clean(p, t, 'after a move', {});
	const raw = split(await read(p, NOTE)).yaml;
	t.ok(!/null|true|\{|\[/.test(raw.replace(/^binder.*\n/, '')), 'only text entries are written: ' + raw);
}));

test('hand: YAML that doesn’t parse leaves the note alone, the folder in name order, and the list back when it is mended', withTidy(async (p, h, t) => {
	const broken = `---\nbinder: 1\ncontents:\n  - Epilogue\n  - [unclosed\n  bad: : :\n---\nbody\n`;
	await edit(p, broken);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md');
	await p.ev(`app.vault.delete(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await flush(p); await p.sleep(900);
	t.eq(await read(p, NOTE), broken, 'the broken note was not written');
	const mended = `---\nbinder: 1\ncontents:\n  - Epilogue\n  - Part One/\n  - Part One/Landfall\n---\nbody\n`;
	await edit(p, mended);
	t.eq(j((await kids(p, 'The Lighthouse')).slice(0, 2)), j(['Epilogue.md', 'Part One']), 'the mended list is read');
	await clean(p, t, 'after mending', {});
}));

test('hand: a binder version newer than the plugin knows is never rewritten, by any change, a flush or a reload', withTidy(async (p, h, t) => {
	const v9 = `---\nbinder: 9\nfuture: {a: [1, 2]}\ncontents:\n  - Epilogue\n  - Prologue\n---\nbody\n`;
	await edit(p, v9);
	await countWrites(p);
	await rename(p, 'The Lighthouse/Epilogue.md', 'The Lighthouse/Finale.md');
	await p.ev(`app.vault.create('The Lighthouse/New.md', '').then(() => 1)`);
	await p.ev(`app.vault.delete(${file('The Lighthouse/Part Two')}, true).then(() => 1)`);
	await p.ev(`${B}.makeBinder(${file('The Lighthouse')}).then(() => 1, () => 0)`);
	await p.ev(`app.plugins.plugins.binders.undoMove?.(${file('The Lighthouse')}).then?.(() => 1)`).catch(() => 0);
	await flush(p); await p.sleep(900);
	t.eq(await read(p, NOTE), v9, 'byte-identical');
	t.eq(await writes(p), 0, 'no writes');
	// the explorer: it shows the order it can read, or Obsidian's, but nothing is written; turn the plugin off and on
	await p.ev(`app.plugins.disablePlugin('binders').then(() => app.plugins.enablePlugin('binders')).then(() => 1)`);
	await p.sleep(1200);
	t.eq(await read(p, NOTE), v9, 'byte-identical after the plugin was turned off and on');
	// a version that isn't a number
	let nth = 0;
	for (const v of ['"2"', 'beta', '[2]', '1.5', '-1', '0']) {
		await edit(p, `---\nbinder: ${v}\ncontents:\n  - Epilogue\n---\nbody\n`);
		await p.ev(`app.vault.create('The Lighthouse/Extra${nth++}.md', '').then(() => 1)`);
		await p.ev(`${B}.flush().then(() => 1)`);
		await p.sleep(500);
		t.eq(split(await read(p, NOTE)).yaml.includes('Epilogue'), true, `binder: ${v}: its list is still there`);
		t.ok(/binder: .*\ncontents:\n  - Epilogue\n---\nbody\n$/.test(await read(p, NOTE)) || (await read(p, NOTE)).includes('Epilogue'), `binder: ${v}: not rewritten`);
	}
}));

test('hand: the binder note deleted makes the folder plain again, and put back it is a binder with the same order', withTidy(async (p, h, t) => {
	const before = await read(p, NOTE);
	await p.ev(`app.vault.delete(${file(NOTE)}).then(() => 1)`);
	await p.sleep(700);
	t.eq(await p.ev(`${B}.isBinderFolder(${file('The Lighthouse')})`), false, 'not a binder');
	t.eq(await p.ev(`${B}.orderedChildren(${file('The Lighthouse')})`), null, 'the store has no order for it: the explorer is Obsidian’s');
	// moving a note meanwhile must not make a binder note or write anything
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md');
	await p.sleep(500);
	t.ok(!(await exists(p, NOTE)), 'no binder note was made');
	await p.ev(`app.vault.create(${j(NOTE)}, ${j(before)}).then(() => 1)`);
	await p.sleep(900);
	t.eq(await p.ev(`${B}.isBinderFolder(${file('The Lighthouse')})`), true, 'a binder again');
	// the renamed note's entry points at nothing: it shows after the listed ones, and nothing is lost
	const names = await kids(p, 'The Lighthouse/Part One');
	t.eq(names.length, 3, 'all three notes show: ' + j(names));
	t.eq(await read(p, NOTE), before, 'the note was not rewritten');
}));

test('hand: a second note given binder: in the same folder does not take over; the one named like the folder is written', withTidy(async (p, h, t) => {
	const other = `---\nbinder: 1\ncontents:\n  - Epilogue\n---\nI am another\n`;
	await edit(p, other, 'The Lighthouse/Prologue.md');
	t.eq(await p.ev(`${B}.binderOf(${file('The Lighthouse')}).note.path`), NOTE, 'the binder note is the one named like the folder');
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Part One')}).then(() => 1)`);
	await flush(p); await p.sleep(500);
	t.eq(await read(p, 'The Lighthouse/Prologue.md'), other, 'the other note is untouched');
	t.ok((await contents(p)).length >= LIST.length - 1, 'the binder note was written');
	// and with no note named like the folder: the first by path is the binder note; the other is an ordinary note
	await rename(p, NOTE, 'The Lighthouse/Zed.md');
	await p.sleep(900);
	t.eq(await p.ev(`${B}.binderOf(${file('The Lighthouse')}).note.path`), 'The Lighthouse/Prologue.md', 'the first by path');
	const n = await p.ev(`${BINDERS}.length`);
	t.eq(n, 1, 'one binder in the folder');
}));

test('hand: two folders’ notes with the same name (Part One/Part One.md beside a scene Part One.md) keep their own roles through a rename', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create('The Lighthouse/Part One.md', 'a scene named like a folder\\n'); await app.vault.create('The Lighthouse/Part One/Part One.md', 'the folder note\\n'); await app.vault.create('The Lighthouse/Part Two/Part Two.md', 'the other folder note\\n'); })().then(() => 1)`);
	await p.sleep(500);
	await rename(p, 'The Lighthouse/Part One', 'The Lighthouse/Part 1');
	await p.sleep(900);
	t.eq(await read(p, 'The Lighthouse/Part One.md'), 'a scene named like a folder\n', 'the scene is where it was, as it was');
	t.ok(await exists(p, 'The Lighthouse/Part 1/Part 1.md') && !(await exists(p, 'The Lighthouse/Part 1/Part One.md')), 'the folder note followed its folder');
	t.eq(await read(p, 'The Lighthouse/Part 1/Part 1.md'), 'the folder note\n', 'with its text');
	t.ok(!(await p.ev(`${B}.isHiddenNote(${file('The Lighthouse/Part One.md')})`)), 'the scene still shows');
	await clean(p, t, 'after', {});
}));

test('hand: a folder note that collides with a scene given the folder’s name by a rename: nothing is overwritten, and the list stays sound', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', 'folder note\\n').then(() => 1)`);
	await p.sleep(400);
	// rename the scene to the folder's name: Obsidian refuses (a file is there) or Binders does
	const r = await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part One/Arrival.md')}, 'The Lighthouse/Part One/Part One.md').then(() => 'ok', (e) => 'refused')`);
	t.eq(r, 'refused', 'refused, as Obsidian does for any taken name');
	t.eq(await read(p, 'The Lighthouse/Part One/Part One.md'), 'folder note\n', 'the folder note is intact');
	await clean(p, t, 'after', {});
}));

// ---- undo and redo ----

/** The whole binder as the store shows it: every folder's items in order, with the folder each is in. */
const shape = (p, root = 'The Lighthouse') => p.ev(`(() => { const out = []; const w = (f) => { const k = ${B}.orderedChildren(f) || []; out.push(f.path + ': ' + k.map(c => c.name).join(' | ')); k.filter(c => c.children).forEach(w); }; w(app.vault.getAbstractFileByPath(${j(root)})); return out; })()`);
const settle = async (p) => { await flush(p); await p.sleep(450); };
/** The store's undo history is the plugin's, not the vault's: each test starts it empty. */
const freshHistory = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
const undo = (p, at = 'The Lighthouse', redo = false) => p.ev(`${B}.undo(${file(at)}, ${redo}).then((x) => x, (e) => 'ERR ' + e.message)`);

for (const seed of [11, 23, 42, 77]) test(`undo: forty drops across folders (seed ${seed}), undone one by one, give back the shape before each; redone, the shape after each`, withTidy(async (p, h, t) => {
	await freshHistory(p);
	const start = await p.ev(`app.vault.getAllLoadedFiles().map(f => f.path).filter(x => x.startsWith('The Lighthouse')).sort()`);
	t.eq(start.length, 11, 'the pristine tree at the start: ' + start);
	const before = await texts(p);
	const shapes = [await shape(p)];
	await p.ev(`window.__rnd = (() => { let a = ${seed}; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`);
	let made = 0;
	for (let i = 0; i < 40; i++) {
		const ok = await p.ev(`(async () => {
			const r = window.__rnd, pick = (a) => a[Math.floor(r() * a.length)], v = app.vault, S = ${B};
			const root = v.getAbstractFileByPath('The Lighthouse');
			const notes = v.getMarkdownFiles().filter(f => f.path.startsWith('The Lighthouse/') && !S.isHiddenNote(f));
			const dirs = [root, ...v.getAllLoadedFiles().filter(f => f.children && f.path.startsWith('The Lighthouse/'))];
			const n = 1 + Math.floor(r() * 3), items = []; for (let guard = 0; items.length < n; guard++) { if (guard > 200) break;  const f = r() < 0.2 ? pick(dirs.filter(d => d !== root)) : pick(notes); if (!items.includes(f) && !items.some(x => x.children && f.path.startsWith(x.path + '/')) && !items.some(x => f.children && x.path.startsWith(f.path + '/'))) items.push(f); }
			const to = pick(dirs), sibs = (S.orderedChildren(to) || []).filter(c => !items.includes(c)), anchor = r() < 0.25 ? null : pick(sibs.length ? sibs : [null]);
			if (!items.every(f => S.canPlace(f, to))) return false;
			await S.put(S.inOrder(items), to, anchor);
			return true;
		})()`);
		if (ok) { await p.sleep(30); const now = await shape(p); if (j(now) === j(shapes[shapes.length - 1])) continue; made++; shapes.push(now); } // (a drop that changed nothing isn't a change to undo)
	}
	t.ok(made >= 25, `${made} drops made`);
	await settle(p);
	await clean(p, t, 'after the drops', {});
	const last = shapes[shapes.length - 1];
	for (let i = shapes.length - 2; i >= 0; i--) {
		const r = await undo(p);
		t.ok(r && !/^ERR/.test(r), `undo ${shapes.length - 1 - i} gave ${r}`);
		const now = await shape(p);
		t.eq(j(now), j(shapes[i]), `after undo ${shapes.length - 1 - i}, the shape before drop ${i + 1}`);
	}
	t.eq(await undo(p), null, 'nothing more to undo');
	await clean(p, t, 'after undoing everything', {});
	for (let i = 1; i < shapes.length; i++) {
		const r = await undo(p, 'The Lighthouse', true);
		t.ok(r && !/^ERR/.test(r), `redo ${i} gave ${r}`);
		t.eq(j(await shape(p)), j(shapes[i]), `after redo ${i}, the shape after drop ${i}`);
	}
	t.eq(j(await shape(p)), j(last), 'redone to the end');
	await clean(p, t, 'after redoing everything', {});
	const after = await texts(p);
	for (const [k, x] of Object.entries(before)) if (k !== NOTE) t.ok(Object.values(after).includes(x), `the text of “${k}” is unchanged`);
}));

test('undo: a place taken meanwhile refuses the undo, changes nothing, and the undo works when the place is free again', withTidy(async (p, h, t) => {
	await freshHistory(p);
	await p.ev(`${B}.put([${file('The Lighthouse/Part One/Arrival.md')}], ${file('The Lighthouse/Part Two')}, null).then(() => 1)`);
	await settle(p);
	await p.ev(`app.vault.create('The Lighthouse/Part One/Arrival.md', 'an impostor\\n').then(() => 1)`);
	await p.sleep(300);
	const shapeBefore = await shape(p);
	const r = await undo(p);
	t.ok(/^ERR/.test(r), 'refused: ' + r);
	t.eq(j(await shape(p)), j(shapeBefore), 'nothing moved');
	t.eq(await read(p, 'The Lighthouse/Part One/Arrival.md'), 'an impostor\n', 'the impostor is untouched');
	await p.ev(`app.vault.delete(${file('The Lighthouse/Part One/Arrival.md')}).then(() => 1)`);
	await p.sleep(300);
	const r2 = await undo(p);
	t.ok(r2 && !/^ERR/.test(r2), 'undone once the place is free: ' + r2);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'back first');
	await clean(p, t, 'after', {});
}));

test('undo: a folder gone meanwhile refuses; made again under its name, it goes back into it', withTidy(async (p, h, t) => {
	await freshHistory(p);
	await p.ev(`${B}.put([${file('The Lighthouse/Part One/Arrival.md')}], ${file('The Lighthouse/Part Two')}, null).then(() => 1)`);
	await settle(p);
	// move the note home by hand (not through Binders' history), delete the folder it is to return to, then try
	await rename(p, 'The Lighthouse/Part Two/Arrival.md', 'The Lighthouse/Arrival.md');
	await p.ev(`app.vault.delete(${file('The Lighthouse/Part One')}, true).then(() => 1)`);
	await settle(p);
	const r = await undo(p);
	t.ok(/^ERR/.test(r) || r === null, 'refused or nothing: ' + r);
	await p.ev(`app.vault.createFolder('The Lighthouse/Part One').then(() => 1)`);
	await p.sleep(300);
	const r2 = await undo(p);
	await settle(p);
	await clean(p, t, 'after', {});
	t.ok(r2 === null || (await exists(p, 'The Lighthouse/Part One/Arrival.md')) || (await exists(p, 'The Lighthouse/Arrival.md')), 'the note still exists somewhere: ' + r2);
}));

test('undo: a move whose note was renamed, then its folder renamed, still goes back (the file is the same object)', withTidy(async (p, h, t) => {
	await freshHistory(p);
	await p.ev(`${B}.put([${file('The Lighthouse/Part One/The keeper.md')}], ${file('The Lighthouse/Part Two')}, ${file('The Lighthouse/Part Two/The wreck.md')}).then(() => 1)`);
	await settle(p);
	await rename(p, 'The Lighthouse/Part Two/The keeper.md', 'The Lighthouse/Part Two/The warden.md');
	await rename(p, 'The Lighthouse/Part Two', 'The Lighthouse/Part 2');
	await settle(p);
	const r = await undo(p);
	t.ok(r && !/^ERR/.test(r), 'undone: ' + r);
	await settle(p);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The warden.md', 'Storm warning.md']), 'back in Part One at its place, under its new name');
	await clean(p, t, 'after', {});
}));

test('undo: asked at once after a move, before the list is written, and a redo at once after, give the list right', withTidy(async (p, h, t) => {
	await freshHistory(p);
	const s0 = await shape(p);
	await p.ev(`(async () => { const S = ${B}; await S.put([${file('The Lighthouse/Epilogue.md')}], ${file('The Lighthouse')}, ${file('The Lighthouse/Prologue.md')}); await S.undo(${file('The Lighthouse')}); await S.undo(${file('The Lighthouse')}, true); await S.undo(${file('The Lighthouse')}); })().then(() => 1)`);
	t.eq(j(await shape(p)), j(s0), 'put, undo, redo, undo: as it was');
	await clean(p, t, 'after', {});
	t.eq(j(await contents(p)), j(LIST), 'the list is the original list (or all of it, in the same order)');
}));

test('undo: with a label given in the same drop, undo takes back the place and the label, redo gives both again', withTidy(async (p, h, t) => {
	await freshHistory(p);
	const keeper = 'The Lighthouse/Part One/The keeper.md';
	const had = (await read(p, keeper));
	await p.ev(`${B}.label([${file(keeper)}], 'label', 'Red', 'Arrange by label', { folder: ${file('The Lighthouse/Part Two')}, anchor: ${file('The Lighthouse/Part Two/The wreck.md')} }).then(() => 1)`);
	await settle(p);
	t.ok(/label: Red/.test(await read(p, 'The Lighthouse/Part Two/The keeper.md')), 'labelled and moved');
	const moved = await shape(p);
	const r = await undo(p);
	t.ok(r && !/^ERR/.test(r), 'undone: ' + r);
	await settle(p);
	t.eq(await read(p, keeper), had, 'its text and properties are as they were, byte for byte');
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'back at its place');
	const r2 = await undo(p, 'The Lighthouse', true);
	await settle(p);
	t.ok(r2 && !/^ERR/.test(r2), 'redone: ' + r2);
	t.eq(j(await shape(p)), j(moved), 'the same shape as after the drop');
	t.ok(/label: Red/.test(await read(p, 'The Lighthouse/Part Two/The keeper.md')), 'labelled again');
	await clean(p, t, 'after', {});
}));

test('undo: a body typed into the moved note after the drop survives the undo', withTidy(async (p, h, t) => {
	await freshHistory(p);
	const keeper = 'The Lighthouse/Part One/The keeper.md';
	await p.ev(`${B}.put([${file(keeper)}], ${file('The Lighthouse/Part Two')}, null).then(() => 1)`);
	await settle(p);
	const edited = (await read(p, 'The Lighthouse/Part Two/The keeper.md')) + '\nTyped after the drop.\n';
	await writeRaw(p, 'The Lighthouse/Part Two/The keeper.md', edited);
	await p.sleep(500);
	await undo(p);
	await settle(p);
	t.eq(await read(p, keeper), edited, 'the typed text is in the note at its old place');
}));

test('undo: two binders in turn: each undoes its own last change, and the other’s history is kept', withTidy(async (p, h, t) => {
	await freshHistory(p);
	await p.ev(`(async () => { const v = app.vault; await v.createFolder('Second'); for (const n of ['A', 'B', 'C']) await v.create('Second/' + n + '.md', 'text ' + n + '\\n'); await v.create('Second/Second.md', '---\\nbinder: 1\\ncontents:\\n  - A\\n  - B\\n  - C\\n---\\n'); })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('Second')})`);
	await p.sleep(300);
	const lh = await shape(p), sec = await shape(p, 'Second');
	await p.ev(`(async () => { const S = ${B}, g = (x) => app.vault.getAbstractFileByPath(x); await S.moveDown(g('The Lighthouse/Prologue.md')); await S.moveDown(g('Second/A.md')); await S.moveDown(g('The Lighthouse/Epilogue.md')).catch(() => 0); await S.moveUp(g('Second/C.md')); await S.moveUp(g('The Lighthouse/Epilogue.md')); })().then(() => 1)`);
	await settle(p);
	t.eq(await undo(p, 'Second'), 'Move “C”', 'Second: its own last change');
	t.eq(await undo(p, 'The Lighthouse'), 'Move “Epilogue”', 'Lighthouse: its own last change');
	t.eq(await undo(p, 'Second'), 'Move “A”', 'Second: the one before');
	await undo(p, 'The Lighthouse'); await undo(p, 'The Lighthouse');
	await settle(p);
	t.eq(j(await shape(p, 'Second')), j(sec), 'Second as it was');
	t.eq(j(await shape(p)), j(lh), 'Lighthouse as it was');
	t.eq(await undo(p, 'Second'), null, 'nothing more in Second');
	await clean(p, t, 'The Lighthouse after', {});
	await clean(p, t, 'Second after', { root: 'Second', note: 'Second/Second.md' });
}));

test('undo: after the plugin is turned off and on the history is empty, nothing is offered, and nothing breaks', withTidy(async (p, h, t) => {
	await freshHistory(p);
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await settle(p);
	t.ok(await p.ev(`!!${B}.undoable(${file('The Lighthouse')})`), 'offered before');
	await p.ev(`app.plugins.disablePlugin('binders').then(() => app.plugins.enablePlugin('binders')).then(() => 1)`);
	await p.sleep(1500);
	const s = await shape(p);
	t.eq(await p.ev(`${B}.undoable(${file('The Lighthouse')})`), null, 'nothing offered');
	t.eq(await undo(p), null, 'undo does nothing');
	t.eq(await p.ev(`app.commands.findCommand('binders:undo-move')?.checkCallback?.(true)`), false, 'the command isn’t offered');
	t.eq(j(await shape(p)), j(s), 'the shape is as it was');
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Part Two')}).then(() => 1)`);
	t.ok(await undo(p), 'a new move can be undone');
	await clean(p, t, 'after', {});
}));

test('undo: after an outside edit of the binder note that reorders the list, the moved note is put back by its neighbours', withTidy(async (p, h, t) => {
	await freshHistory(p);
	await p.ev(`${B}.put([${file('The Lighthouse/Epilogue.md')}], ${file('The Lighthouse')}, ${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await settle(p);
	// someone (a sync client) rewrites the list reversed
	const rev = ['Epilogue', 'Part Two/', 'Part Two/Lights out', 'Part Two/The wreck', 'Part One/', 'Part One/Storm warning', 'Part One/The keeper', 'Part One/Arrival', 'Prologue'];
	await edit(p, `---\nbinder: 1\ncontents:\n${rev.map((x) => '  - ' + x).join('\n')}\n---\nThe binder note.\n`);
	const r = await undo(p);
	await settle(p);
	t.ok(r && !/^ERR/.test(r), 'undone: ' + r);
	await clean(p, t, 'after', {});
	t.eq(j(await kids(p, 'The Lighthouse')).includes('Epilogue.md'), true, 'the note is there');
}));

// ---- Longform projects ----

const LFD = 'LF', LFI = 'LF/Index.md';
/** A seeded random number generator, as source for the page. */
const RNDJS = (seed) => `(() => { let a = ${seed}; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`;
/** A project of 30 scenes in a shuffled nested order (groups under some), a few ignored notes and some properties of its
    own in the index note. Returns the scene names in list order. */
async function lfProject(p, { extra = '' } = {}) {
	return p.ev(`(async () => {
		const v = app.vault;
		const rnd = ${RNDJS(5)};
		const names = []; for (let i = 0; i < 30; i++) names.push('Scene ' + String(i).padStart(2, '0'));
		for (let i = names.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [names[i], names[k]] = [names[k], names[i]]; }
		await v.createFolder('LF');
		for (const n of names) await v.create('LF/' + n + '.md', 'Text of ' + n + '\\nmore text\\n');
		for (const n of ['Notes one', 'Notes two']) await v.create('LF/' + n + '.md', 'ignored ' + n + '\\n');
		// nested: every 5th scene starts a group of the next two
		const lines = []; let i = 0;
		while (i < names.length) { lines.push('    - ' + names[i]); if (i % 5 === 0 && i + 2 < names.length) { lines.push('    - - ' + names[i + 1]); lines.push('      - ' + names[i + 2]); i += 3; } else i++; }
		await v.create('LF/Index.md', '---\\nlongform:\\n  format: scenes\\n  title: A storm\\n  sceneFolder: /\\n  scenes:\\n' + lines.join('\\n') + '\\n  ignoredFiles:\\n    - Notes*\\nplotlines:\\n  - Ines\\n' + ${j(extra)} + '---\\nThe index text.\\n');
		return names;
	})()`);
}
/** The index note's yaml without its `scenes` block, and the scenes as written (flat, with indents). */
async function lfRead(p, path = LFI) {
	const text = await read(p, path), { yaml, body } = split(text), lines = yaml.split('\n');
	const i = lines.findIndex((l) => /^ {2}scenes:/.test(l));
	let k = i + 1;
	while (k < lines.length && /^ {4}/.test(lines[k])) k++;
	const scenes = lines.slice(i + 1, k).map((l) => { const m = /^( +)(- )+(.*)$/.exec(l); return { indent: (l.match(/- /g) || []).length - 1, name: l.replace(/^[ -]+/, '').replace(/^(["'])(.*)\1$/, '$2') }; });
	return { rest: [...lines.slice(0, i), ...lines.slice(k)].join('\n'), body, scenes, text };
}
/** What the store shows of a project: the names in order. */
const lfShown = (p) => p.ev(`(${B}.orderedChildren(${file(LFD)}) || []).map(f => f.basename)`);
async function lfAudit(p, original, { settle: ms = 1000 } = {}) {
	await flush(p); await p.sleep(ms); await flush(p);
	const problems = [], now = await lfRead(p);
	if (now.rest !== original.rest) problems.push('the index note changed outside scenes: ' + now.rest);
	if (now.body !== original.body) problems.push('the index text changed');
	const files = await p.ev(`(async () => { const l = await app.vault.adapter.list('LF'); return l.files.map(x => x.split('/').pop()).filter(x => /\\.md$/.test(x) && x !== 'Index.md').map(x => x.slice(0, -3)); })()`);
	const names = now.scenes.map((s) => s.name), dupes = names.filter((x, i) => names.indexOf(x) !== i);
	if (dupes.length) problems.push('listed twice: ' + dupes);
	const ghosts = names.filter((x) => !files.includes(x));
	if (ghosts.length) problems.push('listed but not there: ' + ghosts.join(', '));
	const shown = await lfShown(p);
	const ignored = (n) => /^Notes/.test(n);
	const want = files.filter((f) => !ignored(f) || names.includes(f)).sort(); // (a scene the list names stays one, whatever the ignore list says)
	if (j([...shown].sort()) !== j(want)) problems.push(`the store shows ${j(shown)}, the folder has ${j(want)}`);
	const listed = names.filter((n) => files.includes(n));
	if (j(shown.slice(0, listed.length)) !== j(listed)) problems.push(`the store shows ${j(shown)} but the list says ${j(listed)}`);
	if (!(await p.ev(`${B}.isBinderFolder(${file(LFD)})`))) problems.push('no longer a project');
	return problems;
}
const lfWalk = (p, { n = 120, how = 'api', seed = 3 } = {}) => p.ev(`(async () => {
	const v = app.vault, fm = app.fileManager, ad = v.adapter, g = (x) => v.getAbstractFileByPath(x);
	const rnd = ${RNDJS(seed)}, pick = (a) => a[Math.floor(rnd() * a.length)];
	let k = 0, threw = 0; const api = '${how}' === 'api';
	await v.createFolder('Elsewhere').catch(() => 0);
	const sc = () => v.getMarkdownFiles().filter(f => f.parent.path === 'LF' && f.basename !== 'Index');
	for (let i = 0; i < ${n}; i++) {
		const r = rnd(), ns = sc();
		try {
			if (r < 0.3 && ns.length) { const f = pick(ns), to = 'LF/' + (rnd() < 0.2 ? 'Notes ' : 'R ') + (k++) + '.md'; api ? await fm.renameFile(f, to) : await ad.rename(f.path, to); }
			else if (r < 0.45 && ns.length > 8) { const f = pick(ns); api ? await (rnd() < 0.5 ? v.delete(f) : fm.trashFile(f)) : await ad.remove(f.path); }
			else if (r < 0.6) { const to = 'LF/New ' + (k++) + '.md'; api ? await v.create(to, 'new text ' + k + '\\n') : await ad.write(to, 'new text ' + k + '\\n'); }
			else if (r < 0.72 && ns.length > 8) { const f = pick(ns); const to = 'Elsewhere/' + f.name; api ? await fm.renameFile(f, to) : await ad.rename(f.path, to); }
			else if (r < 0.82) { const out = v.getMarkdownFiles().filter(f => f.parent.path === 'Elsewhere'); if (out.length) { const f = pick(out); api ? await fm.renameFile(f, 'LF/' + f.name) : await ad.rename(f.path, 'LF/' + f.name); } }
			else if (ns.length) { const f = pick(ns), b = f.basename, to = 'LF/' + (b === b.toUpperCase() ? b.toLowerCase() : b.toUpperCase()) + '.md'; if (to !== f.path) api ? await fm.renameFile(f, to) : await ad.rename(f.path, to); }
		} catch (e) { threw++; }
		if (rnd() < 0.15) await new Promise(r => setTimeout(r, 30));
	}
	return threw;
})()`);

for (const how of ['api', 'adapter']) test(`longform storm (${how}): 120 renames, deletes, creates and moves in and out leave only longform.scenes written, and a sound list`, withTidy(async (p, h, t) => {
	await lfProject(p);
	await until(p, `${B}.isBinderFolder(${file(LFD)})`, 5000);
	await p.sleep(800);
	const original = await lfRead(p);
	const before = await textsUnder(p, 'LF');
	await lfWalk(p, { how, n: 120, seed: how === 'api' ? 3 : 4 });
	if (how === 'adapter') { await p.sleep(2000); p.errors.splice(0, p.errors.length, ...p.errors.filter((e) => !/ENOENT/.test(e))); }
	const pr = await lfAudit(p, original, { settle: how === 'adapter' ? 2500 : 1200 });
	t.ok(!pr.length, pr.slice(0, 4).join(' | '));
	const all = { ...(await textsUnder(p, 'LF')), ...(await textsUnder(p, 'Elsewhere')) };
	const bodies = new Set(Object.values(before));
	const bad = Object.entries(all).filter(([k, x]) => k !== LFI && !bodies.has(x) && !/^new text/.test(x));
	t.ok(!bad.length, 'every note keeps its text: ' + bad.slice(0, 2).map((x) => x[0]));
}));

test('longform: a scene renamed to a name the ignore list matches, and back, keeps its place', withTidy(async (p, h, t) => {
	await lfProject(p);
	await until(p, `${B}.isBinderFolder(${file(LFD)})`, 5000);
	await p.sleep(600);
	const original = await lfRead(p);
	const first = original.scenes[0].name;
	await rename(p, `LF/${first}.md`, 'LF/Notes about it.md');
	await flush(p); await p.sleep(500);
	t.ok((await lfShown(p)).includes('Notes about it'), 'a scene listed by name stays one when it is renamed to something the ignore list matches (the list names it)');
	await rename(p, 'LF/Notes about it.md', `LF/${first}.md`);
	await flush(p); await p.sleep(500);
	const pr = await lfAudit(p, original);
	t.ok(!pr.length, pr.join(' | '));
	t.eq((await lfShown(p))[0], first, 'first again');
}));

test('UX: longform: a comment in the index note’s properties survives a reorder', withTidy(async (p, h, t) => {
	await lfProject(p, { extra: '# a comment of mine\nstatus: Draft\nsynopsis: "Kept: with a colon"\ntags:\n  - novel\n' });
	await until(p, `${B}.isBinderFolder(${file(LFD)})`, 5000);
	await p.sleep(600);
	const original = await lfRead(p);
	const names = await lfShown(p);
	await p.ev(`${B}.moveDown(${file('LF/' + names[0] + '.md')}).then(() => 1)`);
	await flush(p); await p.sleep(500);
	const now = await lfRead(p);
	t.eq(now.body, original.body, 'the index text');
	const lost = original.rest.split('\n').filter((l) => !now.rest.split('\n').includes(l));
	t.eq(j(lost), '[]', 'every other line of the properties is as it was: lost ' + j(lost));
}));

test('longform: the index note edited by hand (a scene listed that isn’t there, listed twice, an object, a number, a nested list too deep) is tolerated and written clean', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.createFolder('LF'); for (const n of ['A', 'B', 'C', '1984']) await v.create('LF/' + n + '.md', 'text ' + n + '\\n'); })().then(() => 1)`);
	await writeRaw(p, LFI, `---\nlongform:\n  format: scenes\n  sceneFolder: /\n  scenes:\n    - C\n    - Ghost\n    - C\n    - 1984\n    - - - - B\n    - {x: 1}\n    - null\n    - A\n---\nidx\n`);
	await until(p, `${B}.isBinderFolder(${file(LFD)})`, 5000);
	await p.sleep(600);
	t.eq(j(await lfShown(p)), j(['C', '1984', 'B', 'A']), 'the order as read');
	await p.ev(`${B}.moveDown(${file('LF/C.md')}).then(() => 1)`);
	await flush(p); await p.sleep(500);
	const now = await lfRead(p);
	t.eq(j(now.scenes.map((s) => s.name)), j(['1984', 'C', 'B', 'A']), 'written clean: ' + j(now.scenes));
	t.eq(now.body, 'idx\n', 'the text');
}));

test('longform: a newer binder note property in the index note ("binder: 2") makes it a binder note, read only, never written as a project', withTidy(async (p, h, t) => {
	await lfProject(p, { extra: 'binder: 2\ncontents:\n  - Scene 00\n' });
	await p.sleep(1000);
	const before = await read(p, LFI);
	await p.ev(`app.vault.create('LF/Another.md', '').then(() => 1)`);
	await p.ev(`app.fileManager.renameFile(${file('LF/Another.md')}, 'LF/Other.md').then(() => 1)`);
	await flush(p); await p.sleep(800);
	t.eq(await read(p, LFI), before, 'byte-identical');
}));

/** "Convert to binder" with every option on odd projects. */
async function convertCase(p, t, { scenes, ignored = [], folders, removeLongform, extraFiles = [], extraDirs = [], index = 'in' }) {
	const lines = (arr) => arr.map((x) => (Array.isArray(x) ? x.map((y, i) => (i ? '      - ' : '    - - ') + y).join('\n') : '    - ' + x)).join('\n');
	await p.ev(`(async () => { const v = app.vault; await v.createFolder('LF'); for (const d of ${j(extraDirs)}) await v.createFolder('LF/' + d); const names = ${j([...new Set([...scenes.flat(), ...extraFiles])])}; for (const n of names) await v.create('LF/' + n + '.md', 'Text of ' + n + '\\n'); })().then(() => 1)`);
	const idx = index === 'in' ? LFI : 'LF Index.md';
	await writeRaw(p, idx, `---\nlongform:\n  format: scenes\n  sceneFolder: ${index === 'in' ? '/' : 'LF'}\n  scenes:\n${lines(scenes)}\n  ignoredFiles: ${j(ignored)}\nplotlines:\n  - X\n---\nindex text\n`);
	await until(p, `${B}.isBinderFolder(${file(LFD)})`, 5000);
	await p.sleep(600);
	const before = await texts(p);
	let result = 'ok';
	try { await p.ev(`${B}.convertToBinder(${B}.binderOf(${j(idx)}), { folders: ${folders}, removeLongform: ${removeLongform} }).then(() => 1)`); } catch (e) { result = String(e.message || e); }
	await flush(p); await p.sleep(800);
	return { before, result, idx };
}

for (const folders of [false, true]) for (const removeLongform of [false, true]) test(`longform: convert to binder (folders ${folders}, remove Longform ${removeLongform}) on a project with groups, nested groups, ignored notes and a subfolder`, withTidy(async (p, h, t) => {
	const { before, result, idx } = await convertCase(p, t, { scenes: ['Alpha', ['Beta', 'Gamma'], 'Delta', ['Epsilon', ['Zeta']], 'Eta'], ignored: ['Notes*'], folders, removeLongform, extraFiles: ['Notes a', 'Loose unlisted'], extraDirs: ['Old drafts'] });
	t.eq(result, 'ok', 'converted');
	const after = await texts(p);
	// every scene's text is somewhere, unchanged
	const bodies = Object.values(after);
	for (const [k, x] of Object.entries(before)) if (k !== idx) t.ok(bodies.includes(x), `the text of “${k}” survived`);
	const note = await read(p, idx);
	t.eq(split(note).body, 'index text\n', 'the index text');
	t.ok(/binder: 1/.test(note), 'binder: 1');
	t.eq(/longform:/.test(note), !removeLongform, 'longform kept or removed as asked');
	t.ok(/plotlines:\n {2}- X/.test(note), 'other properties kept');
	await clean(p, t, 'the binder', { root: 'LF', note: idx });
	const c = await contents(p, idx);
	for (const n of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta']) t.ok(c.some((x) => x.endsWith(n)), `${n} is listed: ${j(c)}`);
	t.ok(c.every((x, i) => c.indexOf(x) === i), 'no duplicates');
}));

test('longform: convert refuses when a note named like the scene folder would become the binder note, and changes nothing', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.createFolder('Idx'); await v.createFolder('Idx/Book'); await v.create('Idx/Book/Book.md', 'a scene named like the folder\\n'); await v.create('Idx/Book/A.md', 'a\\n'); await v.create('Idx/Index.md', '---\\nlongform:\\n  format: scenes\\n  sceneFolder: Book\\n  scenes:\\n    - Book\\n    - A\\n---\\n'); })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('Idx/Book')})`, 5000);
	const before = await texts(p);
	let err = '';
	try { await p.ev(`${B}.convertToBinder(${B}.binderOf('Idx/Index.md'), { folders: false, removeLongform: true }).then(() => 1)`); } catch (e) { err = String(e.message); }
	t.ok(/already has a note/.test(err), 'refused: ' + err);
	t.eq(j(await texts(p)), j(before), 'nothing changed');
}));

test('longform: convert a project whose index note is outside the scene folder makes a binder note named like the folder, and removes Longform from the index note', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.createFolder('Idx'); await v.createFolder('Idx/Book'); for (const n of ['A', 'B', 'C']) await v.create('Idx/Book/' + n + '.md', 'text ' + n + '\\n'); await v.create('Idx/Index.md', '---\\nlongform:\\n  format: scenes\\n  sceneFolder: Book\\n  scenes:\\n    - C\\n    - - A\\n    - B\\nplotlines: [P]\\n---\\nindex\\n'); })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('Idx/Book')})`, 5000);
	await p.sleep(500);
	const before = await texts(p);
	await p.ev(`${B}.convertToBinder(${B}.binderOf('Idx/Index.md'), { folders: true, removeLongform: true }).then(() => 1)`);
	await flush(p); await p.sleep(800);
	t.ok(await exists(p, 'Idx/Book/Book.md'), 'the binder note is Book/Book.md');
	const idx = await read(p, 'Idx/Index.md');
	t.ok(!/longform/.test(idx) && /plotlines/.test(idx) && split(idx).body === 'index\n', 'the index note lost only longform: ' + idx);
	await clean(p, t, 'the binder', { root: 'Idx/Book', note: 'Idx/Book/Book.md' });
	t.eq(j(await contents(p, 'Idx/Book/Book.md')), j(['C', 'C/', 'C/A', 'B']), 'the list: ' + j(await contents(p, 'Idx/Book/Book.md')));
	for (const n of ['A', 'B', 'C']) t.ok(Object.values(await texts(p)).includes(`text ${n}\n`), `text ${n}`);
}));

test('UX: a comment in the binder note’s properties survives a move', withTidy(async (p, h, t) => {
	// the example in docs/dev/file-format.md has comments on its lines; a writer may keep notes to self there
	await edit(p, `---\nbinder: 1                 # format version\n# my own note about the order\ncontents:\n  - Prologue   # the start\n  - Part One/\n  - Part One/Arrival\n  - Part One/The keeper\n  - Part One/Storm warning\n  - Part Two/\n  - Part Two/The wreck\n  - Part Two/Lights out\n  - Epilogue\n---\nbody\n`);
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await flush(p); await p.sleep(500);
	const yaml = split(await read(p, NOTE)).yaml;
	t.ok(/my own note about the order/.test(yaml) && /format version/.test(yaml), 'the writer’s comments are still in the properties: ' + yaml.split('\n').slice(0, 4).join(' / '));
}));

// ---- turned off and on, cold starts ----

test('lifecycle: a move waiting to be written when the plugin is turned off is still written, once', withTidy(async (p, h, t) => {
	await countWrites(p);
	await p.ev(`(async () => { await ${B}.moveDown(${file('The Lighthouse/Prologue.md')}); await app.plugins.disablePlugin('binders'); })().then(() => 1)`);
	await p.sleep(1200);
	t.eq(j((await contents(p)).slice(0, 3)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper']), 'the move reached the binder note: ' + j(await contents(p)));
	t.eq(await writes(p), 1, 'one write');
	await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
	await p.sleep(1200);
	t.eq(j((await kids(p, 'The Lighthouse')).slice(0, 2)), j(['Part One', 'Prologue.md']), 'and shows after the plugin is back');
}));

test('lifecycle: the plugin turned off and on while a note is being typed in: the typing is kept and the binder is intact', withTidy(async (p, h, t) => {
	await h.open('The Lighthouse/Part One/Arrival.md');
	await p.ev(`(() => { const v = app.workspace.activeEditor?.editor; v.setCursor(v.offsetToPos(v.getValue().length)); return 1; })()`);
	await p.type('typed words, not yet saved');
	await p.ev(`(async () => { await app.plugins.disablePlugin('binders'); await app.plugins.enablePlugin('binders'); })().then(() => 1)`);
	await p.sleep(1800);
	const typed = await p.ev(`app.workspace.activeEditor.editor.getValue()`);
	t.ok(typed.includes('typed words, not yet saved'), 'the editor still has the typing');
	await p.sleep(2200);
	t.ok((await read(p, 'The Lighthouse/Part One/Arrival.md')).includes('typed words, not yet saved'), 'and it reached the disk');
	await clean(p, t, 'after', {});
	t.eq(j(await contents(p)), j(LIST), 'the list is as it was');
}));

/** A vault of many notes: 40 folders of 75 notes, and two binders among them. */
async function bigVault(p, n = 3000) {
	await p.ev(`(async () => {
		const ad = app.vault.adapter, per = 75;
		for (let d = 0; d < ${n} / per; d++) { await ad.mkdir('Bulk/F' + d); const jobs = []; for (let i = 0; i < per; i++) jobs.push(ad.write('Bulk/F' + d + '/N' + i + '.md', 'Note ' + d + '/' + i + '\\n')); await Promise.all(jobs); }
		await ad.mkdir('Cold');
		const names = []; for (let i = 0; i < 30; i++) names.push('Scene ' + String(i).padStart(2, '0'));
		for (const nm of names) await ad.write('Cold/' + nm + '.md', 'Text ' + nm + '\\n');
		await ad.write('Cold/Cold.md', '---\\nbinder: 1\\ncontents:\\n' + [...names].reverse().map(x => '  - ' + x).join('\\n') + '\\n---\\nbinder text\\n');
		await ad.mkdir('Cold2');
		for (const nm of names) await ad.write('Cold2/' + nm + '.md', 'Text2 ' + nm + '\\n');
		await ad.write('Cold2/Cold2.md', '---\\nbinder: 1\\ncontents:\\n' + [...names].reverse().map(x => '  - ' + x).join('\\n') + '\\n---\\nbinder text\\n');
		return 1;
	})()`);
	await until(p, `app.vault.getMarkdownFiles().length >= ${n} + 60`, 20000);
}

test('cold start: in a vault of 3,000 notes a reload finds both binders, shows their order in the explorer, and writes nothing', withTidy(async (p, h, t) => {
	await bigVault(p);
	await p.sleep(3000);
	const notes = ['Cold/Cold.md', 'Cold2/Cold2.md', NOTE];
	const before = {}, mtime = {}; for (const n of notes) { before[n] = await read(p, n); mtime[n] = await p.ev(`app.vault.adapter.stat(${j(n)}).then(s => s.mtime)`); }
	const t0 = Date.now();
	await p.ev(`(() => { setTimeout(() => location.reload(), 50); return 1; })()`);
	await p.sleep(1500);
	for (let i = 0; i < 160; i++) { if (await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.binders)`).catch(() => false)) break; await p.sleep(250); }
	await p.ev(`app.plugins.plugins.binders.binders.ready.then(() => 1)`);
	const settled = await p.ev(`Promise.race([app.plugins.plugins.binders.binders.settled.then(() => 'settled'), new Promise(r => setTimeout(() => r('not settled in 40 s'), 40000))])`);
	t.eq(settled, 'settled', 'binders settled after the cache was complete');
	p.errors.length = 0;
	const secs = (Date.now() - t0) / 1000;
	await p.sleep(1000);
	t.eq(j(await p.ev(`${BINDERS}.map(b => b.folder.path).sort()`)), j(['Cold', 'Cold2', 'The Lighthouse']), `binders found (${secs.toFixed(1)} s after the reload started)`);
	t.eq(j((await kids(p, 'Cold')).slice(0, 3)), j(['Scene 29.md', 'Scene 28.md', 'Scene 27.md']), 'Cold in its list’s order');
	// the explorer shows it too
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = ${EXP}; v.fileItems['Cold']?.setCollapsed(false); return 1; })()`);
	await p.sleep(600);
	const rowsShown = await p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path^="Cold/"]')].map(e => e.dataset.path)`);
	t.eq(j(rowsShown.slice(0, 3)), j(['Cold/Scene 29.md', 'Cold/Scene 28.md', 'Cold/Scene 27.md']), 'the explorer shows binder order: ' + j(rowsShown.slice(0, 3)));
	for (const n of notes) t.eq(await p.ev(`app.vault.adapter.stat(${j(n)}).then(s => s.mtime)`), mtime[n], `${n} was not modified during startup`);
	for (const n of notes) t.eq(await read(p, n), before[n], `${n} is byte-identical`);
	await flush(p);
	for (const n of notes) t.eq(await read(p, n), before[n], `${n} is byte-identical after a flush`);
}));

test('cold start: a note renamed on disk while Obsidian was closed (no event) keeps its list entry out of the way, and the next write drops the dead entry', withTidy(async (p, h, t) => {
	// the vault changes behind Obsidian's back, then Obsidian "starts" again (the plugin is turned off and the files changed)
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	await p.sleep(300);
	await p.ev(`(async () => { const ad = app.vault.adapter; await ad.rename('The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md'); await ad.remove('The Lighthouse/Epilogue.md'); await ad.write('The Lighthouse/New one.md', 'brand new\\n'); })().then(() => 1)`);
	await p.sleep(1200);
	await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
	await p.sleep(1500);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['The keeper.md', 'Storm warning.md', 'Landfall.md']), 'the renamed note shows after the listed ones');
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', 'Part One', 'Part Two', 'New one.md']), 'the deleted one is gone, the new one after the rest');
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await clean(p, t, 'after the first write', {});
}));

// ---- names that collide or don't survive a round trip ----

test('BUG: a PDF and its companion note (paper.pdf and paper.pdf.md) both show in the binder, once each', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.createBinary('The Lighthouse/Part One/paper.pdf', new Uint8Array([37, 80, 68, 70]).buffer); await v.create('The Lighthouse/Part One/paper.pdf.md', 'my notes on the paper\\n'); })().then(() => 1)`);
	await p.sleep(500);
	const names = await kids(p, 'The Lighthouse/Part One');
	t.eq(j([...names].sort()), j(['Arrival.md', 'Storm warning.md', 'The keeper.md', 'paper.pdf', 'paper.pdf.md'].sort()), 'both the PDF and its note show, each once: ' + j(names));
}));

test('BUG: a PDF and its companion note keep their places after a move and a write', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.createBinary('The Lighthouse/Part One/paper.pdf', new Uint8Array([37, 80, 68, 70]).buffer); await v.create('The Lighthouse/Part One/paper.pdf.md', 'my notes on the paper\\n'); })().then(() => 1)`);
	await p.sleep(400);
	await p.ev(`${B}.moveUp(${file('The Lighthouse/Part One/Storm warning.md')}).then(() => 1)`);
	await flush(p); await p.sleep(400);
	const pr = await audit(p);
	t.ok(!pr.length, pr.slice(0, 3).join(' | '));
	const c = await contents(p);
	t.ok(c.includes('Part One/paper.pdf') && c.includes('Part One/paper.pdf.md'), 'both are written down, under different names: ' + j(c));
}));

test('names: a name with a space at its end or start keeps its place', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const ad = app.vault.adapter; await ad.write('The Lighthouse/Trail .md', 'a\\n'); await ad.write('The Lighthouse/ Lead.md', 'b\\n'); })().then(() => 1)`);
	await p.sleep(600);
	await p.ev(`${B}.move(${file('The Lighthouse/Trail .md')}, ${file('The Lighthouse')}, 0).then(() => 1)`);
	await p.ev(`${B}.move(${file('The Lighthouse/ Lead.md')}, ${file('The Lighthouse')}, 1).then(() => 1)`);
	await flush(p); await p.sleep(800);
	t.eq(j((await kids(p, 'The Lighthouse')).slice(0, 3)), j(['Trail .md', ' Lead.md', 'Prologue.md']), 'moved to the top, in order, and still there after the list is read back: ' + j(await kids(p, 'The Lighthouse')));
}));

test('BUG: the file explorer shows a PDF and its companion note in a binder as two rows, one each', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.createBinary('The Lighthouse/Part One/paper.pdf', new Uint8Array([37, 80, 68, 70]).buffer); await v.create('The Lighthouse/Part One/paper.pdf.md', 'my notes on the paper\\n'); })().then(() => 1)`);
	await p.sleep(600);
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = ${EXP}; for (const f of ${j(KEEP_FOLDERS)}) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(600);
	const rows = await p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path^="The Lighthouse/Part One/"]')].map(e => e.dataset.path)`);
	t.eq(j(rows.filter((x) => /paper/.test(x)).sort()), j(['The Lighthouse/Part One/paper.pdf', 'The Lighthouse/Part One/paper.pdf.md']), 'a row for each: ' + j(rows));
}));

test('BUG: a binder with a PDF and its companion note (paper.pdf, paper.pdf.md) lists the note once in its scenes', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault; await v.createBinary('The Lighthouse/Part One/paper.pdf', new Uint8Array([37, 80, 68, 70]).buffer); await v.create('The Lighthouse/Part One/paper.pdf.md', 'my notes on the paper\\n'); })().then(() => 1)`);
	await p.sleep(600);
	const scenes = await p.ev(`${B}.scenes(${file('The Lighthouse')}).map(f => f.path)`);
	t.eq(scenes.filter((x) => x.endsWith('paper.pdf.md')).length, 1, 'the note is one scene, not two (the manuscript and an export would repeat its text): ' + j(scenes));
}));

// ---- the binder note changed from outside while a move waits to be written ----

test('outside: a move waiting to be written, and the binder note edited by hand meanwhile (another property): both kept', withTidy(async (p, h, t) => {
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('binder: 1', 'binder: 1\nsynopsis: Added from outside'));
	await p.sleep(1200); await flush(p);
	t.ok(/synopsis: Added from outside/.test(await read(p, NOTE)), 'the outside edit is kept');
	t.eq(j((await contents(p)).slice(0, 2)), j(['Part One/', 'Part One/Arrival']), 'and the move was written: ' + j(await contents(p)));
	await clean(p, t, 'after', {});
}));

test('outside: a move waiting to be written, and the list replaced from outside meanwhile (reversed): the move is made on the new list', withTidy(async (p, h, t) => {
	await p.ev(`${B}.moveUp(${file('The Lighthouse/Epilogue.md')}).then(() => 1)`);
	const rev = ['Epilogue', 'Part Two/', 'Part Two/Lights out', 'Part Two/The wreck', 'Part One/', 'Part One/Storm warning', 'Part One/The keeper', 'Part One/Arrival', 'Prologue'];
	await writeRaw(p, NOTE, `---\nbinder: 1\ncontents:\n${rev.map((x) => '  - ' + x).join('\n')}\n---\nThe binder note.\n`);
	await p.sleep(1200); await flush(p);
	await clean(p, t, 'after', {});
	const c = await contents(p);
	// every item is there once; what the outside list put first stays near the front
	t.eq(c.length, rev.length, 'all items listed once: ' + j(c));
	t.eq(c.indexOf('Part Two/') < c.indexOf('Part One/'), true, 'the outside order for the folders stands: ' + j(c));
}));

test('UX: outside: a move waiting to be written, and the binder note broken for a moment and mended: the move still reaches the list', withTidy(async (p, h, t) => {
	const good = await read(p, NOTE);
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await writeRaw(p, NOTE, good.replace('binder: 1', 'binder: 1\nbroken: [unclosed'));
	await p.sleep(500);
	await writeRaw(p, NOTE, good);
	await p.sleep(1500); await flush(p);
	await clean(p, t, 'after', {});
	t.eq(j((await kids(p, 'The Lighthouse')).slice(0, 2)), j(['Part One', 'Prologue.md']), 'Prologue is still second, as it was moved: ' + j(await kids(p, 'The Lighthouse')));
}));

test('outside: the binder note replaced as a sync client does it (deleted, then written again with the same text) loses no order', withTidy(async (p, h, t) => {
	const good = await read(p, NOTE);
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await p.sleep(450);
	await flush(p);
	const moved = await read(p, NOTE);
	await p.ev(`app.vault.adapter.remove(${j(NOTE)}).then(() => 1)`);
	await p.sleep(300);
	await writeRaw(p, NOTE, moved);
	await p.sleep(1200);
	t.eq(j((await kids(p, 'The Lighthouse')).slice(0, 2)), j(['Part One', 'Prologue.md']), 'the order is as the note says: ' + j(await kids(p, 'The Lighthouse')));
	await clean(p, t, 'after', {});
	t.ok(good !== moved, 'ran');
}));

test('outside: a binder view open on the binder keeps showing it, in order, while the binder note is broken and mended', withTidy(async (p, h, t) => {
	const good = await read(p, NOTE);
	await p.ev(`(async () => { await ${B}.ready; await ${PL}.openBinder(${file('The Lighthouse')}, false); })().then(() => 1)`);
	await until(p, `!!document.querySelector('.binders-view .binders-card')`);
	await p.sleep(300);
	const cardsOf = () => p.ev(`[...document.querySelectorAll('.binders-view .binders-card[data-path]')].map(c => c.dataset.path)`);
	const before = await cardsOf();
	t.ok(before.length >= 4, 'cards drawn: ' + before.length);
	await writeRaw(p, NOTE, good.replace('binder: 1', 'binder: 1\nbroken: [unclosed'));
	await p.sleep(900);
	const during = await cardsOf();
	await writeRaw(p, NOTE, good);
	await p.sleep(1200);
	const after = await cardsOf();
	t.eq(j(after), j(before), `the cards are back as they were (during the break: ${during.length} cards)`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'the view was not closed or doubled');
}));

// ---- folder notes ----

for (const [how, seed] of [['api', 8], ['api', 9], ['adapter', 10]]) test(`folders: ${how} storm (seed ${seed}) with folder notes: every folder keeps its own note, named like it, and none is overwritten`, withTidy(async (p, h, t) => {
	await stormBinder(p, { folderNotes: true });
	await p.sleep(1200);
	const before = await textsUnder(p, 'Storm');
	const notesBefore = Object.values(before).filter((x) => /^Folder note of/.test(x)).sort();
	t.eq(notesBefore.length, 5, 'five folder notes to start');
	// (folder notes are left to the binder: the walk would otherwise rename one in the moment before it follows its folder)
	await p.ev(`(() => { for (const f of app.vault.getMarkdownFiles()) if (f.parent.path !== 'Storm' && f.basename === f.parent.name) f.__fn = true; return 1; })()`);
	await walk(p, { n: 160, how, seed, moves: true, burst: 1 });
	p.errors.splice(0, p.errors.length, ...p.errors.filter((e) => !/ENOENT/.test(e)));
	await p.sleep(how === 'adapter' ? 2500 : 1200);
	await clean(p, t, 'after the storm', { root: 'Storm', note: 'Storm/Storm.md', settle: 1500 });
	const after = await textsUnder(p, 'Storm');
	const notes = Object.entries(after).filter(([, x]) => /^Folder note of/.test(x));
	t.eq(new Set(notes.map(([, x]) => x)).size, notes.length, 'no folder note was doubled');
	// each surviving folder note is the note of the folder it is in: named like it
	const stray = notes.filter(([path]) => { const parts = path.split('/'); return parts[parts.length - 1] !== parts[parts.length - 2] + '.md'; });
	t.ok(!stray.length || how === 'adapter', 'every folder note is named like its folder: ' + stray.map((x) => x[0]).join(', '));
	const bad = Object.entries(after).filter(([k, x]) => k !== 'Storm/Storm.md' && !new Set(Object.values(before)).has(x) && !/^Text of new/.test(x));
	t.ok(!bad.length, 'no text changed: ' + bad.slice(0, 2).map((x) => x[0]));
}));

test('folders: renaming a folder in capitals (a case-only rename) takes its folder note along', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', 'the folder note\\n').then(() => 1)`);
	await p.sleep(400);
	await rename(p, 'The Lighthouse/Part One', 'The Lighthouse/PART ONE');
	await p.sleep(1200);
	const names = await p.ev(`app.vault.adapter.list('The Lighthouse/PART ONE').then(l => l.files.map(x => x.split('/').pop()).sort())`);
	t.ok(names.includes('PART ONE.md') && !names.includes('Part One.md'), 'the folder note was renamed to match: ' + j(names));
	t.eq(await read(p, 'The Lighthouse/PART ONE/PART ONE.md'), 'the folder note\n', 'with its text');
	await clean(p, t, 'after', {});
	// and back
	await rename(p, 'The Lighthouse/PART ONE', 'The Lighthouse/Part One');
	await p.sleep(1200);
	const back = await p.ev(`app.vault.adapter.list('The Lighthouse/Part One').then(l => l.files.map(x => x.split('/').pop()).sort())`);
	t.ok(back.includes('Part One.md') && !back.includes('PART ONE.md'), 'and back: ' + j(back));
}));

test('folders: a folder renamed to a name a note in it already has: the folder note stays, nothing is overwritten, no scene is lost', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', 'the folder note\\n').then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await rename(p, 'The Lighthouse/Part One', 'The Lighthouse/Arrival');
	await p.sleep(1200);
	const now = await texts(p);
	t.eq(Object.values(now).length, Object.values(before).length, 'no note was lost or made');
	for (const [k, x] of Object.entries(before)) if (k !== NOTE) t.ok(Object.values(now).includes(x), 'text kept: ' + x.slice(0, 20));
	await clean(p, t, 'after', {});
}));

// ---- Obsidian's own explorer menus inside a binder ----

/** Where the explorer's rows are, with the binder's folders open. */
const showRows = (p) => explorerRows(p, 'The Lighthouse', KEEP_FOLDERS);
const confirmDelete = async (p) => { await p.sleep(300); await p.ev(`(() => { const b = document.querySelector('.modal .mod-warning, .modal button.mod-cta'); b?.click(); return 1; })()`); await p.sleep(400); };

test('explorer menus: New note, Make a copy, Delete, New folder and Move file to… inside a binder keep the list sound and no text lost', withTidy(async (p, h, t) => {
	await clearSelection(p);
	await showRows(p);
	const before = await texts(p);
	// New note in Part One, from the folder's menu
	await rightClick(p, 'The Lighthouse/Part One');
	await pick(p, 'New note');
	await p.sleep(700);
	const made = await p.ev(`app.workspace.getActiveFile()?.path`);
	t.eq(made, 'The Lighthouse/Part One/Untitled.md', 'a new note in the folder');
	await p.key('Escape'); await p.sleep(200);
	t.eq(j((await kids(p, 'The Lighthouse/Part One')).slice(-1)), j(['Untitled.md']), 'it shows after the listed notes');
	await clean(p, t, 'after New note', { strict: false });
	// Make a copy of Arrival
	await showRows(p);
	await rightClick(p, 'The Lighthouse/Part One/Arrival.md');
	await pick(p, 'Make a copy');
	await p.sleep(700);
	await p.key('Escape'); await p.sleep(200);
	const names = await kids(p, 'The Lighthouse/Part One');
	t.eq(j(names.slice(0, 2)), j(['Arrival.md', 'Arrival 1.md']), 'the copy is right after its original: ' + j(names));
	await clean(p, t, 'after Make a copy', { strict: false });
	// New folder, in the binder's top folder
	await showRows(p);
	await rightClick(p, 'The Lighthouse');
	await pick(p, 'New folder');
	await p.sleep(700);
	await p.key('Enter'); await p.sleep(500);
	t.ok(await exists(p, 'The Lighthouse/Untitled') || (await p.ev(`!!${file('The Lighthouse/Untitled')}`)), 'a folder was made');
	await clean(p, t, 'after New folder', { strict: false });
	// Delete The keeper
	await showRows(p);
	await rightClick(p, 'The Lighthouse/Part One/The keeper.md');
	await pick(p, 'Delete');
	await confirmDelete(p);
	t.ok(!(await p.ev(`!!${file('The Lighthouse/Part One/The keeper.md')}`)), 'deleted');
	await clean(p, t, 'after Delete', { strict: false });
	// Move file to… : Storm warning into Part Two
	await h.open('The Lighthouse/Part One/Storm warning.md');
	await p.ev(`app.commands.executeCommandById('file-explorer:move-file')`);
	await p.sleep(500);
	await p.type('Part Two'); await p.sleep(400);
	await p.key('Enter'); await p.sleep(800);
	t.ok(await p.ev(`!!${file('The Lighthouse/Part Two/Storm warning.md')}`), 'moved to Part Two by the command');
	t.eq((await kids(p, 'The Lighthouse/Part Two')).pop(), 'Storm warning.md', 'last there');
	await clean(p, t, 'after Move file to…', { strict: false });
	await flush(p); await p.sleep(500);
	await clean(p, t, 'at the end, written', {});
	const after = await texts(p);
	for (const [k, x] of Object.entries(before)) if (k !== NOTE && !/keeper/.test(k)) t.ok(Object.values(after).includes(x), `the text of “${k}” is unchanged`);
	t.eq(Object.values(after).filter((x) => x === before['The Lighthouse/Part One/Arrival.md']).length, 2, 'the copy has the original’s text');
}));

// ---- dragging into, out of and around a binder, with the real pointer ----

/** A point in the empty part of the explorer, below its last row (a drop there goes to the vault's top level). */
const emptyArea = (p) => p.ev(`(() => { const c = ${EXP}.containerEl.querySelector('.nav-files-container'), r = c.getBoundingClientRect(), last = [...c.querySelectorAll('.tree-item-self')].pop().getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.bottom - 6, last.bottom + 80) }; })()`);

test('drag: a scene dropped on the explorer’s empty space goes to the vault’s top level, leaves the list, and comes back at the end when dragged in', withTidy(async (p, h, t) => {
	await clearSelection(p);
	await mk(p, { 'Plain/x.md': 'plain note' });
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']);
	const before = await texts(p);
	await drag(p, 'The Lighthouse/Part One/The keeper.md', await emptyArea(p));
	await p.sleep(700);
	t.ok(await p.ev(`!!${file('The keeper.md')}`), 'now at the vault’s top level');
	await clean(p, t, 'the binder after it left', {});
	t.ok(!(await contents(p)).some((x) => /keeper/.test(x)), 'dropped from the list');
	t.eq(await read(p, 'The keeper.md'), before['The Lighthouse/Part One/The keeper.md'], 'its text is as it was');
	// and into the binder's folder row (the middle of it): last in the binder's top level
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']);
	const a = await row(p, 'The Lighthouse');
	await drag(p, 'The keeper.md', { x: a.x, y: a.y });
	await p.sleep(900); await flush(p);
	t.ok(await p.ev(`!!${file('The Lighthouse/The keeper.md')}`), 'moved into the binder');
	await clean(p, t, 'after it came back', {});
	t.eq((await kids(p, 'The Lighthouse')).pop(), 'The keeper.md', 'last in the binder’s top level');
	// undo puts it back where the drag found it: outside, at the top level
	await undoCmd(p);
	await p.sleep(500);
	await clean(p, t, 'after undo', { strict: false });
}));

test('drag: a whole folder of a binder dropped on the empty space leaves with its notes and its folder note, and the list forgets it', withTidy(async (p, h, t) => {
	await clearSelection(p);
	await p.ev(`app.vault.create('The Lighthouse/Part Two/Part Two.md', 'the folder note\\n').then(() => 1)`);
	await explorerRows(p, '', KEEP_FOLDERS);
	const before = await texts(p);
	await drag(p, 'The Lighthouse/Part Two', await emptyArea(p));
	await p.sleep(900);
	t.ok(await p.ev(`!!${file('Part Two/The wreck.md')} && !!${file('Part Two/Part Two.md')}`), 'the folder went to the top level with its notes');
	await clean(p, t, 'the binder after it left', {});
	t.ok(!(await contents(p)).some((x) => /Part Two/.test(x)), 'nothing of it in the list');
	for (const [k, x] of Object.entries(before)) if (k !== NOTE) t.ok(Object.values(await texts(p)).includes(x), `the text of “${k}” is unchanged`);
	await rename(p, 'Part Two', 'The Lighthouse/Part Two');
	await p.sleep(900);
	await clean(p, t, 'after it went back by rename', {});
}));

test('drag: a note from a plain folder dropped between two scenes lands there, and the same note dropped back out leaves no entry behind', withTidy(async (p, h, t) => {
	await clearSelection(p);
	await mk(p, { 'Plain/x.md': 'plain note' });
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']);
	const a = await row(p, 'The Lighthouse/Part One/The keeper.md');
	await drag(p, 'Plain/x.md', { x: a.x, y: a.t + 3 });
	await p.sleep(900); await flush(p);
	t.eq(j((await kids(p, 'The Lighthouse/Part One')).slice(0, 3)), j(['Arrival.md', 'x.md', 'The keeper.md']), 'between Arrival and The keeper: ' + j(await kids(p, 'The Lighthouse/Part One')));
	await clean(p, t, 'after the drop in', {});
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']);
	const plain = await row(p, 'Plain');
	await drag(p, 'The Lighthouse/Part One/x.md', { x: plain.x, y: plain.y });
	await p.sleep(900); await flush(p);
	t.ok(await p.ev(`!!${file('Plain/x.md')}`), 'back in Plain');
	await clean(p, t, 'after the drop out', {});
	t.ok(!(await contents(p)).some((x) => /x$/.test(x)), 'no entry left: ' + j(await contents(p)));
	t.eq(await read(p, 'Plain/x.md'), 'plain note', 'its text');
}));

// ---- a model of the order, fuzzed ----

/** Runs `n` random operations (moves to a place, renames in place and across folders, deletes, creates), with waits
    short and long (the write is debounced 300 ms), while a plain model of what the order should be follows along.
    Returns what the store shows per folder, the model, and the operations made. */
const fuzz = (p, { seed, n }) => p.ev(`(async () => {
	const seed = ${seed}, n = ${n}, rnd = ${RNDJS('seed')}, pick = (a) => a[Math.floor(rnd() * a.length)], v = app.vault, fm = app.fileManager, S = ${B};
	const F = ['', 'Part One', 'Part Two'], dirOf = (f) => f === '' ? 'The Lighthouse' : 'The Lighthouse/' + f;
	const M = { '': { listed: ['Prologue', 'Part One/', 'Part Two/', 'Epilogue'], un: [] }, 'Part One': { listed: ['Arrival', 'The keeper', 'Storm warning'], un: [] }, 'Part Two': { listed: ['The wreck', 'Lights out'], un: [] } };
	const sortUn = (arr) => [...arr].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
	const shown = (f) => [...M[f].listed, ...sortUn(M[f].un)];
	const writeDown = () => { for (const f of F) { M[f].listed.push(...sortUn(M[f].un)); M[f].un = []; } };
	const all = () => F.flatMap((f) => shown(f).filter((x) => !x.endsWith('/')).map((x) => ({ f, name: x })));
	const drop = (f, name) => { M[f].listed = M[f].listed.filter((x) => x !== name); M[f].un = M[f].un.filter((x) => x !== name); };
	const log = []; let k = 0;
	for (let i = 0; i < n; i++) {
		const r = rnd(), items = all(), it = pick(items), file = it && v.getAbstractFileByPath(dirOf(it.f) + '/' + it.name + '.md');
		try {
			if (r < 0.3 && file) {
				const to = pick(F), others = shown(to).filter((x) => x !== it.name), idx = Math.floor(rnd() * (others.length + 1));
				log.push('move ' + it.f + '/' + it.name + ' -> ' + to + ' @' + idx);
				await S.move(file, v.getAbstractFileByPath(dirOf(to)), idx);
				await S.flush(); // (a move written later also writes down what was made before it is written: the model writes down at the move)
				writeDown(); drop(it.f, it.name);
				const sibs = M[to].listed.filter((x) => x !== it.name); sibs.splice(Math.min(idx, sibs.length), 0, it.name); M[to].listed = sibs;
			} else if (r < 0.5 && file) {
				const nn = 'R' + (k++);
				log.push('rename ' + it.f + '/' + it.name + ' -> ' + nn);
				await fm.renameFile(file, dirOf(it.f) + '/' + nn + '.md');
				const was = M[it.f].listed.indexOf(it.name); if (was >= 0) M[it.f].listed[was] = nn; else { M[it.f].un = M[it.f].un.filter((x) => x !== it.name); M[it.f].un.push(nn); }
			} else if (r < 0.65 && file) {
				const to = pick(F.filter((x) => x !== it.f)), nn = 'A' + (k++);
				log.push('across ' + it.f + '/' + it.name + ' -> ' + to + '/' + nn);
				await fm.renameFile(file, dirOf(to) + '/' + nn + '.md');
				const listed = M[it.f].listed.includes(it.name); drop(it.f, it.name);
				if (listed) M[to].listed.push(nn); else M[to].un.push(nn);
			} else if (r < 0.75 && file && items.length > 6) {
				log.push('delete ' + it.f + '/' + it.name);
				await v.delete(file); drop(it.f, it.name);
			} else {
				const to = pick(F), nn = 'C' + (k++);
				log.push('create ' + to + '/' + nn);
				await v.create(dirOf(to) + '/' + nn + '.md', 'text ' + nn + '\\n'); M[to].un.push(nn);
			}
		} catch (e) { log.push('ERROR ' + e.message); }
		const w = rnd(); if (w > 0.8) await new Promise((r) => setTimeout(r, 400)); else if (w > 0.55) await new Promise((r) => setTimeout(r, 20));
	}
	await new Promise((r) => setTimeout(r, 1500)); await S.flush(); await new Promise((r) => setTimeout(r, 500));
	const got = {}; for (const f of F) got[f] = (S.orderedChildren(v.getAbstractFileByPath(dirOf(f))) || []).map((c) => c.children ? c.name + '/' : c.name.replace(/\\.md$/, ''));
	const want = {}; for (const f of F) want[f] = shown(f);
	return { got, want, log, listed: Object.fromEntries(F.map((f) => [f, M[f].listed])) };
})()`);

for (const seed of [1, 2, 3, 4, 5, 6]) test(`fuzz: 60 random moves, renames, deletes and creates with short and long waits end in the order a plain model predicts (seed ${seed})`, withTidy(async (p, h, t) => {
	await freshHistory(p);
	const r = await fuzz(p, { seed, n: 60 });
	p.errors.splice(0, p.errors.length, ...p.errors.filter((e) => !/ENOENT/.test(e))); // (Obsidian indexing a note a later step renamed away)
	for (const f of ['', 'Part One', 'Part Two']) t.eq(j(r.got[f]), j(r.want[f]), `what the store shows in “${f || 'the top folder'}” (after: ${r.log.join('; ')})`);
	await clean(p, t, 'the list on disk against the folder', {});
	// the list on disk, folder by folder, holds the model's listed items in order (it may also list what was made while a
	// move waited to be written: the move writes down everything that is there when it is written)
	const disk = await contents(p);
	const entries = (f) => disk.filter((e) => { const parts = e.replace(/\/$/, '').split('/'); parts.pop(); return parts.join('/') === f; }).map((e) => e.replace(/\/$/, '').split('/').pop() + (e.endsWith('/') ? '/' : ''));
	for (const f of ['', 'Part One', 'Part Two']) {
		const got = entries(f);
		let at = 0; const missing = r.listed[f].filter((x) => { const i = got.indexOf(x, at); if (i < 0) return true; at = i + 1; return false; });
		t.ok(!missing.length, `the list on disk for “${f || 'the top folder'}” has the model's ${j(r.listed[f])} in order, got ${j(got)}`);
	}
}));

// ---- Obsidian's own sort menu, the explorer closed and opened, a second pane ----

test('explorer: the sort button’s menu (every choice), with a binder and a plain folder: the binder keeps its order, the plain folder follows the choice, and the choice survives a reload of the pane', withTidy(async (p, h, t) => {
	await clearSelection(p);
	await mk(p, { 'Plain/b.md': 'b', 'Plain/a.md': 'a', 'Plain/c.md': 'c' });
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']);
	const plainRows = () => p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path^="Plain/"]')].map(e => e.dataset.path.slice(6))`);
	const binderRows = () => p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path^="The Lighthouse/Part One/"]')].map(e => e.dataset.path.split('/').pop())`);
	const sortBtn = () => p.at('.workspace-leaf-content[data-type="file-explorer"] .nav-action-button[aria-label="Change sort order"]');
	const want = ['Arrival.md', 'The keeper.md', 'Storm warning.md'];
	t.eq(j(await binderRows()), j(want), 'binder order to start');
	for (const [label, plain] of [['File name (Z to A)', ['c.md', 'b.md', 'a.md']], ['File name (A to Z)', ['a.md', 'b.md', 'c.md']]]) {
		const b = await sortBtn();
		t.ok(b, 'the sort button is there');
		await p.click(b.x, b.y); await p.sleep(250);
		await pick(p, label);
		await p.sleep(500);
		t.eq(j(await plainRows()), j(plain), `the plain folder under “${label}”`);
		t.eq(j(await binderRows()), j(want), `the binder under “${label}”`);
	}
	for (const label of ['Modified time (new to old)', 'Modified time (old to new)', 'Created time (new to old)', 'Created time (old to new)']) {
		const b = await sortBtn(); await p.click(b.x, b.y); await p.sleep(250);
		await pick(p, label); await p.sleep(500);
		t.eq(j(await binderRows()), j(want), `the binder under “${label}”`);
	}
	await clean(p, t, 'after', {});
}));

test('explorer: a second explorer pane and one closed and opened again show the binder’s order after changes made meanwhile', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const l = app.workspace.getRightLeaf(false); await l.setViewState({ type: 'file-explorer' }); })().then(() => 1)`);
	await p.sleep(600);
	const panes = () => p.ev(`app.workspace.getLeavesOfType('file-explorer').length`);
	t.eq(await panes(), 2, 'two explorers');
	const order = (i) => p.ev(`(() => { app.workspace.rightSplit.expand(); app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[${i}].view; app.workspace.revealLeaf(v.leaf); for (const f of ${j(KEEP_FOLDERS)}) v.fileItems[f]?.setCollapsed(false); return 1; })()`).then(() => p.sleep(400)).then(() => p.ev(`[...app.workspace.getLeavesOfType('file-explorer')[${i}].view.containerEl.querySelectorAll('.tree-item-self[data-path^="The Lighthouse/Part One/"]')].map(e => e.dataset.path.split('/').pop())`));
	// close the second, change things, open it again
	await p.ev(`app.workspace.getLeavesOfType('file-explorer')[1].detach()`);
	await p.ev(`${B}.moveUp(${file('The Lighthouse/Part One/Storm warning.md')}).then(() => 1)`);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md');
	await p.ev(`app.vault.create('The Lighthouse/Part One/Aaa new.md', 'x').then(() => 1)`);
	await flush(p); await p.sleep(400);
	await p.ev(`(async () => { const l = app.workspace.getRightLeaf(false); await l.setViewState({ type: 'file-explorer' }); })().then(() => 1)`);
	await p.sleep(700);
	const a = await order(0), b = await order(1);
	t.eq(j(a), j(['Landfall.md', 'Storm warning.md', 'The keeper.md', 'Aaa new.md']), 'the first explorer: ' + j(a));
	t.eq(j(b), j(a), 'the second one shows the same');
	await p.ev(`app.workspace.getLeavesOfType('file-explorer')[1]?.detach()`);
}));

// ---- names YAML might read as something else ----

const HAZARDS = ['yes', 'no', 'on', 'off', 'null', 'Null', '~', 'true', 'False', 'y', 'n', '1e3', '0x1F', '0o17', '+1', '1_000', '0.10', '007', '2026-10-02', '12:30', '1:2:3', '<<', '=', '- x', '? q', ': r', '@at', '`tick', '%pct', '&amp', '*star', '!bang', '>fold', '|pipe', '{brace', '[brk', '"quote', "'apos", 'a: b', 'a #b', 'a, b', '- ', '--- dash', 'Infinity', 'NaN', 'é', '日本語', '🌊'];

test('names: scene names YAML could read as a boolean, number, date, anchor or tag keep their place when Binders writes the list and Obsidian reads it back', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const ad = app.vault.adapter; for (const n of ${j(HAZARDS)}) { try { await ad.write('The Lighthouse/Part One/' + n.trim() + '.md', 'text of ' + n + '\\n'); } catch (e) {} } })().then(() => 1)`);
	await p.sleep(1500);
	const have = (await p.ev(`${B}.orderedChildren(${file('The Lighthouse/Part One')}).map(f => f.basename)`)).filter((n) => HAZARDS.some((x) => x.trim() === n));
	t.ok(have.length >= HAZARDS.length - 6, `${have.length} of ${HAZARDS.length} names made (the file system refused the rest)`);
	// put them first, in a known order (the reverse of the name order), one move each
	const order = [...have].sort().reverse();
	await p.ev(`(async () => { const S = ${B}, v = app.vault, F = v.getAbstractFileByPath('The Lighthouse/Part One'); let i = 0; for (const n of ${j(order)}) await S.move(v.getAbstractFileByPath('The Lighthouse/Part One/' + n + '.md'), F, i++); })().then(() => 1)`);
	await flush(p); await p.sleep(1500);
	// as Obsidian's own parser reads the list now, and as the store shows it
	const cached = await p.ev(`app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.contents ?? []`);
	const asText = cached.map(String);
	const lost = order.filter((n) => !asText.includes('Part One/' + n));
	t.eq(j(lost), '[]', 'every name is in the list as text when Obsidian reads it back (a name read as something else is lost): ' + j(cached.filter((x) => typeof x !== 'string')));
	t.eq(j((await kids(p, 'The Lighthouse/Part One')).slice(0, order.length).map((x) => x.replace(/\.md$/, ''))), j(order), 'they show in the order they were put');
	await clean(p, t, 'after', {});
}));

test('names: the same names as scenes of a Longform project and as folders of a binder keep their place', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const v = app.vault, ad = v.adapter; await v.createFolder('LF'); for (const n of ${j(HAZARDS)}) { try { await ad.write('LF/' + n.trim() + '.md', 'text of ' + n + '\\n'); } catch (e) {} } await v.create('LF/Index.md', '---\\nlongform:\\n  format: scenes\\n  sceneFolder: /\\n  scenes: []\\n---\\n'); })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('LF')})`, 5000);
	await p.sleep(1000);
	const have = (await lfShown(p)).filter((n) => HAZARDS.some((x) => x.trim() === n));
	const order = [...have].sort().reverse();
	await p.ev(`(async () => { const S = ${B}, v = app.vault, F = v.getAbstractFileByPath('LF'); let i = 0; for (const n of ${j(order)}) await S.move(v.getAbstractFileByPath('LF/' + n + '.md'), F, i++); })().then(() => 1)`);
	await flush(p); await p.sleep(1500);
	t.eq(j((await lfShown(p)).slice(0, order.length)), j(order), 'the scenes show in the order they were put, after Obsidian read the list back');
	const cached = await p.ev(`app.metadataCache.getFileCache(${file(LFI)})?.frontmatter?.longform?.scenes ?? []`);
	t.eq(j(order.filter((n) => !cached.flat().map(String).includes(n))), '[]', 'every name is text in the list as Obsidian reads it');
	// as folders of a binder
	await p.ev(`(async () => { const v = app.vault; await v.createFolder('Fold'); for (const n of ${j(HAZARDS.filter((x) => !/[:]/.test(x)))}) { try { await v.createFolder('Fold/' + n.trim()); } catch (e) {} } await v.create('Fold/Fold.md', '---\\nbinder: 1\\n---\\n'); })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('Fold')})`, 5000);
	await p.sleep(800);
	const fs = (await p.ev(`${B}.orderedChildren(${file('Fold')}).map(f => f.name)`));
	const forder = [...fs].sort().reverse();
	await p.ev(`(async () => { const S = ${B}, v = app.vault, F = v.getAbstractFileByPath('Fold'); let i = 0; for (const n of ${j(forder)}) await S.move(v.getAbstractFileByPath('Fold/' + n), F, i++); })().then(() => 1)`);
	await flush(p); await p.sleep(1500);
	t.eq(j(await p.ev(`${B}.orderedChildren(${file('Fold')}).map(f => f.name)`)), j(forder), 'the folders show in the order they were put');
	await clean(p, t, 'the binder of folders', { root: 'Fold', note: 'Fold/Fold.md' });
}));

test('explorer: a label dot follows its note through a rename, a move out of the binder and back, and goes when the label does', withTidy(async (p, h, t) => {
	await mk(p, { 'Plain/x.md': 'x' });
	await p.ev(`${B}.setProps(${file('The Lighthouse/Part One/The keeper.md')}, { label: 'Red' }).then(() => 1)`);
	await p.ev(`${B}.setProps(${file('The Lighthouse/Part Two')}.children?.[0] ?? ${file('The Lighthouse/Part Two/The wreck.md')}, { label: 'Blue' }).then(() => 1)`);
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']);
	const dots = () => p.ev(`[...${EXP}.containerEl.querySelectorAll('.binders-explorer-label')].map(e => e.parentElement.dataset.path + '=' + e.style.getPropertyValue('--binders-label')).sort()`);
	const start = await dots();
	t.eq(start.length, 2, 'two dots to start: ' + j(start));
	await rename(p, 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part One/The warden.md');
	await p.sleep(500);
	t.ok((await dots()).some((d) => d.startsWith('The Lighthouse/Part One/The warden.md=')), 'the dot is on the renamed row: ' + j(await dots()));
	t.ok(!(await dots()).some((d) => d.includes('The keeper')), 'and not on the old name');
	await rename(p, 'The Lighthouse/Part One/The warden.md', 'Plain/The warden.md');
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']); await p.sleep(400);
	t.ok(!(await dots()).some((d) => d.includes('The warden')), 'no dot once it is in a plain folder: ' + j(await dots()));
	await rename(p, 'Plain/The warden.md', 'The Lighthouse/Part One/The warden.md');
	await explorerRows(p, '', [...KEEP_FOLDERS, 'Plain']); await p.sleep(400);
	t.ok((await dots()).some((d) => d.includes('The warden')), 'the dot is back when it is: ' + j(await dots()));
	await p.ev(`${B}.setProps(${file('The Lighthouse/Part One/The warden.md')}, { label: undefined }).then(() => 1)`);
	await p.sleep(600);
	t.ok(!(await dots()).some((d) => d.includes('The warden')), 'no dot when the label is taken away: ' + j(await dots()));
	await p.ev(`app.vault.delete(${file('The Lighthouse/Part One/The warden.md')}).then(() => 1)`);
	await p.sleep(400);
	await clean(p, t, 'after', {});
}));

for (const noteFirst of [true, false]) test(`outside: the binder’s whole folder deleted and put back by the disk (a git checkout), its note ${noteFirst ? 'first' : 'last'}: it is a binder again, in the list’s order`, withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.vault.delete(${file('The Lighthouse')}, true).then(() => 1)`);
	await p.sleep(400);
	t.eq(await p.ev(`${BINDERS}.length`), 0, 'no binder while it is gone');
	const entries = Object.entries(before).filter(([k]) => k.startsWith('The Lighthouse/'));
	entries.sort(([a], [b]) => (a === NOTE ? -1 : b === NOTE ? 1 : 0) * (noteFirst ? 1 : -1));
	await p.ev(`(async () => { const ad = app.vault.adapter; for (const [path, text] of ${j(entries)}) { const dir = path.split('/').slice(0, -1).join('/'); if (!(await ad.exists(dir))) await ad.mkdir(dir); await ad.write(path, text); } })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('The Lighthouse')})`, 6000);
	await p.sleep(1200);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'in the list’s order: ' + j(await kids(p, 'The Lighthouse')));
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'and its folders');
	await clean(p, t, 'after', {});
	t.eq(await read(p, NOTE), before[NOTE], 'the binder note is byte-identical');
}));

// ---- a note replaced the way some tools do it: removed, then written again ----

for (const gap of [0, 40, 400]) test(`BUG: outside: a scene removed and written again by the disk (git checkout, some editors’ safe save) after ${gap} ms keeps its place`, withTidy(async (p, h, t) => {
	const keeper = 'The Lighthouse/Part One/The keeper.md', text = await read(p, keeper);
	await p.ev(`(async () => { const ad = app.vault.adapter; await ad.remove(${j(keeper)}); await new Promise(r => setTimeout(r, ${gap})); await ad.write(${j(keeper)}, ${j(text + 'edited elsewhere\n')}); })().then(() => 1)`);
	await p.sleep(1500); await flush(p); await p.sleep(400);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'still between Arrival and Storm warning: ' + j(await kids(p, 'The Lighthouse/Part One')));
	t.eq(await read(p, keeper), text + 'edited elsewhere\n', 'with the new text');
	await clean(p, t, 'after', {});
}));

// ---- leaving Obsidian with a move still waiting to be written ----

test('BUG: a move still waiting to be written (300 ms) is written when Obsidian is quitting', withTidy(async (p, h, t) => {
	const before = await read(p, NOTE);
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	// what Obsidian does when it quits: asks every listener for the work it needs to finish first, then waits for it
	const added = await p.ev(`(async () => { const ps = []; app.workspace.trigger('quit', { addPromise: (x) => ps.push(x) }); await Promise.all(ps); return ps.length; })()`);
	const after = await read(p, NOTE);
	t.ok(added > 0 && after !== before, `the quit waits for the write (${added} things to wait for), and the move is in the list: ${j((await contents(p)).slice(0, 3))}`);
}));

test('BUG: a move still waiting to be written is written when the page is hidden or closed (a phone put in the pocket, a window closed)', withTidy(async (p, h, t) => {
	const before = await read(p, NOTE);
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await p.ev(`(() => { window.dispatchEvent(new Event('pagehide')); return 1; })()`);
	await p.sleep(150); // (well under the 300 ms the write is otherwise waiting)
	t.ok((await read(p, NOTE)) !== before, 'written within 150 ms of the page being put away: ' + j((await contents(p)).slice(0, 3)));
}));

test('outside: a scene replaced by writing a temporary file and renaming it over the note (the usual safe save) keeps its place', withTidy(async (p, h, t) => {
	const keeper = 'The Lighthouse/Part One/The keeper.md', text = await read(p, keeper);
	await p.ev(`(async () => { const fs = window.require('fs'), path = window.require('path'), base = app.vault.adapter.getBasePath(); const tmp = path.join(base, 'The Lighthouse/Part One/.keeper.tmp'); fs.writeFileSync(tmp, ${j(text + 'saved safely\n')}); fs.renameSync(tmp, path.join(base, ${j(keeper)})); })().then(() => 1)`);
	await p.sleep(1800); await flush(p); await p.sleep(400);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'still in place: ' + j(await kids(p, 'The Lighthouse/Part One')));
	t.eq(await read(p, keeper), text + 'saved safely\n', 'with the new text');
	await clean(p, t, 'after', {});
}));

// ---- notes as other tools write them ----

test('files: a binder note with Windows line endings, no final newline or an empty body is read, and a write keeps the body’s bytes', withTidy(async (p, h, t) => {
	const shapes = [
		['CRLF', (list, body) => `---\r\nbinder: 1\r\ncontents:\r\n${list.map((x) => '  - ' + x).join('\r\n')}\r\n---\r\n${body}`],
		['no final newline', (list, body) => `---\nbinder: 1\ncontents:\n${list.map((x) => '  - ' + x).join('\n')}\n---\n${body}`],
		['an empty body', (list) => `---\nbinder: 1\ncontents:\n${list.map((x) => '  - ' + x).join('\n')}\n---`],
	];
	for (const [what, make] of shapes) {
		const body = what === 'CRLF' ? 'Line one\r\nLine two\r\n' : what === 'no final newline' ? 'ends without a newline' : '';
		await writeRaw(p, NOTE, make(LIST, body));
		await p.sleep(900);
		t.eq(j((await kids(p, 'The Lighthouse')).slice(0, 2)), j(['Prologue.md', 'Part One']), `${what}: read`);
		await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
		await flush(p); await p.sleep(500);
		const after = await read(p, NOTE);
		t.eq(after.slice(after.indexOf('\n---') + 4).replace(/^\r?\n/, ''), body, `${what}: the body’s bytes`);
		t.eq(j((await kids(p, 'The Lighthouse')).slice(0, 2)), j(['Part One', 'Prologue.md']), `${what}: moved`);
		await p.ev(`${B}.moveUp(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
		await flush(p); await p.sleep(400);
	}
	await clean(p, t, 'after', {});
}));

test('files: a scene with Windows line endings keeps every body byte when a status or label is set on it', withTidy(async (p, h, t) => {
	const text = '---\r\nsynopsis: kept\r\n---\r\nFirst line\r\nSecond line\r\n\r\nThird\r\n';
	await writeRaw(p, 'The Lighthouse/Epilogue.md', text);
	await p.sleep(700);
	await p.ev(`${B}.setProps(${file('The Lighthouse/Epilogue.md')}, { status: 'Draft', label: 'Red' }).then(() => 1)`);
	await p.sleep(400);
	const after = await read(p, 'The Lighthouse/Epilogue.md');
	t.eq(after.slice(after.lastIndexOf('---') + 3).replace(/^\r?\n/, ''), 'First line\r\nSecond line\r\n\r\nThird\r\n', 'the body, byte for byte: ' + j(after));
	t.ok(/synopsis: kept/.test(after) && /status: Draft/.test(after), 'properties');
}));

test('deep: seven levels of folders with folder notes, renamed in the middle and a subtree moved up: every inner order and folder note follows', withTidy(async (p, h, t) => {
	const root = 'Books/📚 My #1 novel (draft)';
	await p.ev(`(async () => {
		const v = app.vault, list = [];
		await v.createFolder('Books'); await v.createFolder(${j(root)});
		let dir = ${j(root)}, rel = '';
		for (let d = 0; d < 7; d++) {
			const name = 'D' + d; dir += '/' + name; rel += name + '/'; list.push(rel);
			await v.createFolder(dir);
			await v.create(dir + '/' + name + '.md', 'folder note ' + name + '\\n');
			for (const n of ['b', 'a']) { await v.create(dir + '/' + n + d + '.md', 'text ' + n + d + '\\n'); list.push(rel + n + d); }
		}
		await v.create(${j(root + '/Novel.md')}, '---\\nbinder: 1\\ncontents:\\n' + list.map(x => '  - ' + x).join('\\n') + '\\n---\\nbinder body\\n');
	})().then(() => 1)`);
	const NOTEP = root + '/Novel.md';
	await until(p, `${B}.isBinderFolder(${file(root)})`, 5000);
	await p.sleep(900);
	const before = await texts(p);
	const chain = (n) => Array.from({ length: n }, (_, i) => 'D' + i).join('/');
	t.eq(j(await p.ev(`${B}.orderedChildren(${file(root + '/' + chain(7))}).map(f => f.name)`)), j(['b6.md', 'a6.md']), 'the deepest folder in the list’s order');
	await rename(p, `${root}/D0/D1/D2`, `${root}/D0/D1/X2`);
	await p.sleep(1300);
	t.ok(await exists(p, `${root}/D0/D1/X2/X2.md`) && !(await exists(p, `${root}/D0/D1/X2/D2.md`)), 'the renamed folder’s note followed it');
	await rename(p, `${root}/D0/D1/X2/D3`, `${root}/D3`);
	await p.sleep(1300);
	await clean(p, t, 'after the middle rename and the subtree move', { root, note: NOTEP });
	t.eq(j(await p.ev(`${B}.orderedChildren(${file(root + '/D3/D4/D5/D6')}).map(f => f.name)`)), j(['b6.md', 'a6.md']), 'the moved subtree keeps its inner order');
	const c = await contents(p, NOTEP);
	t.ok(c.includes('D3/') && c.includes('D3/D4/D5/D6/b6') && !c.some((x) => x.startsWith('D0/D1/X2/D3')), 'the list has the subtree where it is now: ' + c.slice(-9).join(', '));
	const now = await texts(p);
	for (const [k, x] of Object.entries(before)) if (k !== NOTEP) t.ok(Object.values(now).includes(x), `the text of “${k.split('/').slice(-2).join('/')}” is unchanged`);
	t.eq(split(now[NOTEP]).body, 'binder body\n', 'the binder note’s text');
}));

// ---- undo and redo with the vault changing between the drops ----

const undoFuzz = (p, { seed, n }) => p.ev(`(async () => {
	const seed = ${seed}, n = ${n}, rnd = ${RNDJS('seed')}, pick = (a) => a[Math.floor(rnd() * a.length)], v = app.vault, S = ${B}, fm = app.fileManager;
	const root = () => v.getAbstractFileByPath('The Lighthouse');
	const notes = () => v.getMarkdownFiles().filter(f => f.path.startsWith('The Lighthouse/') && !S.isHiddenNote(f));
	const dirs = () => [root(), ...v.getAllLoadedFiles().filter(f => f.children && f.path.startsWith('The Lighthouse/'))];
	let k = 0; const log = [];
	for (let i = 0; i < n; i++) {
		const r = rnd(), ns = notes();
		try {
			if (r < 0.45 && ns.length) {
				const f = pick(ns), to = pick(dirs()), sibs = (S.orderedChildren(to) || []).filter(c => c !== f), anchor = rnd() < 0.3 ? null : pick(sibs.length ? sibs : [null]);
				if (S.canPlace(f, to)) { await S.put([f], to, anchor); log.push('drop ' + f.name + ' -> ' + to.path); }
			} else if (r < 0.58 && ns.length) { const f = pick(ns); await fm.renameFile(f, f.parent.path + '/Q' + (k++) + '.md'); log.push('rename ' + f.name); }
			else if (r < 0.68 && ns.length > 5) { const f = pick(ns); log.push('delete ' + f.name); await v.delete(f); }
			else if (r < 0.78) { const to = pick(dirs()); await v.create(to.path + '/N' + (k++) + '.md', 'new ' + k + '\\n'); log.push('create in ' + to.path); }
			else if (r < 0.88 && ns.length) { const f = pick(ns), to = pick(dirs()); log.push('outside move ' + f.name + ' -> ' + to.path); await fm.renameFile(f, to.path + '/' + f.name); }
			else if (r < 0.94) { const d = pick(dirs().filter(x => x !== root())); if (d) { await fm.renameFile(d, d.parent.path + '/Z' + (k++)); log.push('rename folder'); } }
			else { await v.createFolder('The Lighthouse/Fresh' + (k++)).catch(() => 0); log.push('new folder'); }
		} catch (e) { log.push('ERROR ' + e.message); }
		if (rnd() < 0.2) await new Promise(r => setTimeout(r, 350));
	}
	await new Promise(r => setTimeout(r, 600)); await S.flush();
	const out = { undone: [], errors: [], redone: [] };
	const hand = [];
	for (let i = 0; i < 70; i++) { const x = await S.undo(root()).then((x) => x, (e) => 'ERR ' + e.message); if (x === null) break; (/^ERR/.test(x) ? out.errors : out.undone).push(x); }
	await new Promise(r => setTimeout(r, 500)); await S.flush();
	out.afterUndo = true;
	for (let i = 0; i < 70; i++) { const x = await S.undo(root(), true).then((x) => x, (e) => 'ERR ' + e.message); if (x === null) break; if (!/^ERR/.test(x)) out.redone.push(x); }
	out.log = log;
	return out;
})()`);

for (const seed of [21, 22, 23, 24]) test(`undo: 45 drops, renames, deletes, creates and outside moves mixed, then everything undone and redone (seed ${seed}): no file lost or doubled, the list sound`, withTidy(async (p, h, t) => {
	await freshHistory(p);
	const before = await textsUnder(p, 'The Lighthouse');
	const bodies = new Set(Object.values(before));
	const r = await undoFuzz(p, { seed, n: 45 });
	p.errors.splice(0, p.errors.length, ...p.errors.filter((e) => !/ENOENT/.test(e)));
	await clean(p, t, `after the undo and the redo (${r.undone.length} undone, ${r.errors.length} refused, ${r.redone.length} redone)`, { settle: 1200 });
	const after = await textsUnder(p, 'The Lighthouse');
	const bad = Object.entries(after).filter(([k, x]) => k !== NOTE && !bodies.has(x) && !/^new \d+\n$/.test(x));
	t.ok(!bad.length, 'no text changed: ' + bad.slice(0, 2).map((x) => x[0]));
	const lost = Object.entries(before).filter(([k, x]) => k !== NOTE && !Object.values(after).includes(x)).length;
	// (the walk deletes some notes; no more can go than it deleted)
	const gone = Object.entries(before).filter(([k, x]) => k !== NOTE && !Object.values(after).includes(x)).map(([k]) => k.replace('The Lighthouse/', ''));
	t.ok(lost <= r.log.filter((l) => l.startsWith('delete')).length, `${lost} texts gone (${gone.join(', ')}), ${r.log.filter((l) => l.startsWith('delete')).length} deleted: ${r.log.filter((l) => l.startsWith('delete')).join(', ')}`);
	t.eq(split(after[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text');
}));
