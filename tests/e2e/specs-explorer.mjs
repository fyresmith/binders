// The core file explorer: binder order, hidden binder and folder notes, the binder icon, click to open, dragging to
// reorder, mobile.
import { contents } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'explorer: ' + name, fn });

const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const pl = `app.plugins.plugins.binders`;
const BINDER = ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two'];
const IN_ORDER = [
	'The Lighthouse/Prologue.md',
	'The Lighthouse/Part One', 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part One/Storm warning.md',
	'The Lighthouse/Part Two', 'The Lighthouse/Part Two/The wreck.md', 'The Lighthouse/Part Two/Lights out.md',
	'The Lighthouse/Epilogue.md',
];
// Obsidian's own sort: folders first, then notes, by name
const ALPHABETICAL = [
	'The Lighthouse/Part One', 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Storm warning.md', 'The Lighthouse/Part One/The keeper.md',
	'The Lighthouse/Part Two', 'The Lighthouse/Part Two/Lights out.md', 'The Lighthouse/Part Two/The wreck.md',
	'The Lighthouse/Epilogue.md', 'The Lighthouse/Prologue.md', 'The Lighthouse/The Lighthouse.md',
];

/** The explorer's rows under a folder, as the user sees them (top to bottom), with every given folder expanded. */
async function rows(p, under = 'The Lighthouse', expand = BINDER) {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); for (const f of ${JSON.stringify(expand)}) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(350);
	return p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${JSON.stringify(under + '/')}))`);
}
const same = (t, a, b, m) => t.eq(JSON.stringify(a), JSON.stringify(b), m);
const setSettings = (p, s) => p.ev(`(async () => { Object.assign(${pl}.settings, ${JSON.stringify(s)}); await ${pl}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(300));
/** Fails loudly if Obsidian drops or renames the method Binders patches. */
async function patched(p, t) {
	t.ok(await p.ev(`typeof Object.getPrototypeOf(${EXP}).getSortedFolderItems === 'function'`), 'the file explorer still has getSortedFolderItems (an Obsidian update may have removed it: see docs/internals.md)');
	t.eq(await p.ev(`${pl}.explorer.status`), 'patched', 'the explorer patch is on');
}
const reenable = async (p) => {
	await p.ev(`(async () => { await app.plugins.disablePlugin('binders'); await app.plugins.enablePlugin('binders'); })().then(() => 1)`);
	for (let i = 0; i < 40 && (await p.ev(`${pl}?.explorer?.status ?? 'none'`)) !== 'patched'; i++) await p.sleep(100);
	await p.sleep(300);
};

test('shows a binder in binder order, not by name', async (p, h, t) => {
	await patched(p, t);
	same(t, await rows(p), IN_ORDER, 'The Lighthouse and its parts are in binder order, binder note hidden');
});

test('a binder folder says “binder” at the end of its row, as a canvas says “canvas”; no other folder does', async (p, h, t) => {
	await p.ev(`app.vault.create('Sketch.canvas', '{}').then(() => 1)`);
	try {
		await rows(p);
		const tags = await p.ev(`[...document.querySelectorAll('.nav-folder-title .binders-folder-tag')].map(e => e.closest('[data-path]').dataset.path)`);
		same(t, tags, ['Longform demo', 'The Lighthouse'], 'only binder folders (and Longform projects) have the tag');
		const m = await p.ev(`(() => { const row = document.querySelector('.nav-folder-title[data-path="The Lighthouse"]'), tag = row.querySelector('.binders-folder-tag'), own = document.querySelector('.nav-file-title[data-path="Sketch.canvas"] .nav-file-tag');
			const look = (e) => { const s = getComputedStyle(e); return [s.fontSize, s.color, s.backgroundColor, s.textTransform, s.letterSpacing, s.fontWeight].join(' | '); };
			const r = tag.getBoundingClientRect(), o = own.getBoundingClientRect(), rr = row.getBoundingClientRect(), or = own.parentElement.getBoundingClientRect();
			return { text: tag.textContent, look: look(tag), own: look(own), last: row.lastElementChild === tag, fromEnd: Math.round(rr.right - r.right), ownFromEnd: Math.round(or.right - o.right), h: Math.round(r.height), ownH: Math.round(o.height), icon: !!row.querySelector('svg:not(.right-triangle)') }; })()`);
		t.eq(m.text, 'binder', 'it says “binder”');
		t.eq(m.look, m.own, 'in the type, color and case of Obsidian’s own tag');
		t.ok(m.last && m.fromEnd === m.ownFromEnd && m.h === m.ownH, `at the row’s end, where a file’s tag is, and as tall: ${JSON.stringify(m)}`);
		t.ok(!m.icon, 'and there’s no icon before the name');
	} finally {
		await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Sketch.canvas')).then(() => 1)`);
	}
});

test('the folder a binder view shows has the open row’s look in the explorer, as an open note has; it follows the view', async (p, h, t) => {
	await rows(p);
	const lit = () => p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self.is-active')].map(e => e.dataset.path)`);
	const title = (path) => p.at(`.nav-folder-title[data-path="${path}"] .nav-folder-title-content`);
	let at = await title('The Lighthouse');
	await p.click(at.x, at.y); await p.sleep(500);
	same(t, await lit(), ['The Lighthouse'], 'the binder’s row, once its view is open');
	await p.move(900, 500, 2); await p.sleep(200);
	t.ok(await p.ev(`(() => { const a = getComputedStyle(document.querySelector('.nav-folder-title[data-path="The Lighthouse"]')).backgroundColor; return a !== 'rgba(0, 0, 0, 0)'; })()`), 'with the pointer elsewhere, it still shows');
	at = await title('The Lighthouse/Part One');
	await p.click(at.x, at.y); await p.sleep(500);
	same(t, await lit(), ['The Lighthouse/Part One'], 'a folder in it, when the view goes there');
	await p.ev(`app.workspace.getMostRecentLeaf().view.navigate?.(app.vault.getAbstractFileByPath('The Lighthouse/Part Two'))`); await p.sleep(100);
	await p.ev(`app.workspace.getMostRecentLeaf().setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse/Part Two' }, active: true }).then(() => 1)`); await p.sleep(500);
	same(t, await lit(), ['The Lighthouse/Part Two'], 'and wherever the view goes by itself');
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('The Lighthouse/Prologue.md')).then(() => 1)`); await p.sleep(500);
	same(t, await lit(), ['The Lighthouse/Prologue.md'], 'a note opened in its place takes the mark, as ever');
});

test('folders outside binders keep Obsidian’s sort, in every sort order', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Notes'); await app.vault.createFolder('Notes/Zed'); await app.vault.create('Notes/b.md', 'b'); await app.vault.create('Notes/a.md', 'a'); })().then(() => 1)`);
	try {
		same(t, await rows(p, 'Notes', ['Notes']), ['Notes/Zed', 'Notes/a.md', 'Notes/b.md'], 'a plain folder: folders first, then by name');
		await p.ev(`(() => { ${EXP}.setSortOrder('alphabeticalReverse'); return 1; })()`);
		same(t, await rows(p, 'Notes', ['Notes']), ['Notes/Zed', 'Notes/b.md', 'Notes/a.md'], 'a plain folder follows Z to A');
		same(t, await rows(p), IN_ORDER, 'the binder keeps binder order in Z to A');
		await p.ev(`(() => { ${EXP}.setSortOrder('byModifiedTime'); return 1; })()`);
		same(t, await rows(p), IN_ORDER, 'the binder keeps binder order by modified time');
	} finally {
		await p.ev(`(async () => { ${EXP}.setSortOrder('alphabetical'); await app.vault.delete(app.vault.getAbstractFileByPath('Notes'), true); })().then(() => 1)`);
	}
});

test('re-sorts when the binder note changes on disk', async (p, h, t) => {
	await rows(p);
	await p.ev(`(async () => {
		const f = app.vault.getAbstractFileByPath('The Lighthouse/The Lighthouse.md');
		const text = (await app.vault.read(f)).replace('  - Prologue\\n', '').replace('  - Epilogue\\n', '  - Epilogue\\n  - Prologue\\n').replace('  - Part One/Arrival\\n', '').replace('  - Part One/Storm warning\\n', '  - Part One/Storm warning\\n  - Part One/Arrival\\n');
		await app.vault.adapter.write(f.path, text); // as another app would, not through Obsidian
	})().then(() => 1)`);
	let got;
	for (let i = 0; i < 30; i++) { got = await rows(p); if (got[got.length - 1] === 'The Lighthouse/Prologue.md') break; await p.sleep(200); }
	same(t, got, [
		'The Lighthouse/Part One', 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part One/Storm warning.md', 'The Lighthouse/Part One/Arrival.md',
		'The Lighthouse/Part Two', 'The Lighthouse/Part Two/The wreck.md', 'The Lighthouse/Part Two/Lights out.md',
		'The Lighthouse/Epilogue.md', 'The Lighthouse/Prologue.md',
	], 'the new order shows');
});

test('new notes not yet listed go after the listed ones, by name', async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part Two/Aftermath.md', 'x').then(() => 1)`);
	await p.sleep(300);
	same(t, (await rows(p)).filter((x) => x.startsWith('The Lighthouse/Part Two/')), ['The Lighthouse/Part Two/The wreck.md', 'The Lighthouse/Part Two/Lights out.md', 'The Lighthouse/Part Two/Aftermath.md'], 'the new note is last');
});

test('hides binder and folder notes, and shows them when the setting is off', async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', 'The arrival.').then(() => 1)`);
	await p.sleep(300);
	try {
		let r = await rows(p);
		t.ok(!r.includes('The Lighthouse/The Lighthouse.md'), 'binder note hidden');
		t.ok(!r.includes('The Lighthouse/Part One/Part One.md'), 'folder note hidden');
		same(t, r, IN_ORDER, 'nothing else changes');
		// revealing a hidden note (as "Reveal file in navigation" does) must not break the explorer
		await h.open('The Lighthouse/The Lighthouse.md');
		await p.ev(`(() => { ${EXP}.revealInFolder(app.vault.getAbstractFileByPath('The Lighthouse/The Lighthouse.md')); return 1; })()`);
		await p.sleep(300);
		same(t, await rows(p), IN_ORDER, 'still hidden after revealing it');
		await setSettings(p, { hideBinderNotes: false });
		r = await rows(p);
		t.ok(r.includes('The Lighthouse/The Lighthouse.md') && r.includes('The Lighthouse/Part One/Part One.md'), 'both show with the setting off');
		t.eq(r.indexOf('The Lighthouse/Part One/Part One.md'), r.indexOf('The Lighthouse/Part One/Storm warning.md') + 1, 'the unlisted folder note goes after the listed notes');
	} finally { await setSettings(p, { hideBinderNotes: true }); }
});

test('ordering off: Obsidian’s sort, notes shown; on again: binder order', async (p, h, t) => {
	await setSettings(p, { orderExplorer: false });
	try {
		t.eq(await p.ev(`${pl}.explorer.status`), 'off', 'status off');
		same(t, await rows(p), ALPHABETICAL, 'by name, binder note shown');
	} finally { await setSettings(p, { orderExplorer: true }); }
	await patched(p, t);
	same(t, await rows(p), IN_ORDER, 'binder order again');
});

test('turning Binders off restores Obsidian’s sort and removes the icon', async (p, h, t) => {
	await rows(p);
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	try {
		await p.sleep(300);
		same(t, await rows(p), ALPHABETICAL, 'by name again, binder note shown');
		t.eq(await p.ev(`document.querySelectorAll('.binders-folder-tag').length`), 0, 'no icons left');
		t.ok(/sortOrder/.test(await p.ev(`Object.getPrototypeOf(${EXP}).getSortedFolderItems.toString()`)), 'Obsidian’s own method is back, unwrapped');
	} finally { await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`); }
	for (let i = 0; i < 40 && (await p.ev(`${pl}?.explorer?.status ?? 'none'`)) !== 'patched'; i++) await p.sleep(100);
	same(t, await rows(p), IN_ORDER, 'binder order after turning it back on');
});

test('click opens a binder or a folder in one, and still expands it', async (p, h, t) => {
	await p.ev(`app.vault.createFolder('Plain').then(() => 1)`);
	try {
		await rows(p);
		await p.ev(`(() => { window.__opened = []; ${pl}.openBinder = (f) => window.__opened.push(f.path); ${EXP}.fileItems['The Lighthouse/Part One'].setCollapsed(true); return 1; })()`);
		await p.sleep(200);
		const title = (path) => p.at(`.nav-folder-title[data-path="${path}"] .nav-folder-title-content`);
		const collapsed = (path) => p.ev(`${EXP}.fileItems[${JSON.stringify(path)}].collapsed`);
		let at = await title('The Lighthouse/Part One');
		await p.click(at.x, at.y); await p.sleep(250);
		same(t, await p.ev(`window.__opened`), ['The Lighthouse/Part One'], 'the folder in the binder opened');
		t.eq(await collapsed('The Lighthouse/Part One'), false, 'and it expanded');
		at = await title('The Lighthouse/Part One');
		await p.click(at.x, at.y); await p.sleep(250);
		// (its view isn't in front, opening being stubbed out here: a click that opens it doesn't fold it)
		t.eq(await collapsed('The Lighthouse/Part One'), false, 'a second click, opening it again, leaves it open');
		at = await title('The Lighthouse');
		await p.click(at.x, at.y); await p.sleep(250);
		same(t, await p.ev(`window.__opened`), ['The Lighthouse/Part One', 'The Lighthouse/Part One', 'The Lighthouse'], 'the binder itself opens');
		at = await title('Plain');
		await p.click(at.x, at.y); await p.sleep(250);
		t.eq(await p.ev(`window.__opened.length`), 3, 'a folder outside binders does not open');
		// the chevron only expands
		await p.ev(`(() => { ${EXP}.fileItems['The Lighthouse'].setCollapsed(false); ${EXP}.fileItems['The Lighthouse/Part Two'].setCollapsed(true); return 1; })()`); await p.sleep(200);
		at = await p.at(`.nav-folder-title[data-path="The Lighthouse/Part Two"] .collapse-icon`);
		await p.click(at.x, at.y); await p.sleep(250);
		t.eq(await collapsed('The Lighthouse/Part Two'), false, 'the chevron expands');
		t.eq(await p.ev(`window.__opened.length`), 3, 'the chevron does not open the binder');
		// the setting
		await setSettings(p, { openOnClick: false });
		at = await title('The Lighthouse/Part Two');
		await p.click(at.x, at.y); await p.sleep(250);
		t.eq(await p.ev(`window.__opened.length`), 3, 'with the setting off, clicking does not open');
		t.eq(await collapsed('The Lighthouse/Part Two'), true, 'but still collapses');
	} finally {
		await p.ev(`(async () => { delete ${pl}.openBinder; await app.vault.delete(app.vault.getAbstractFileByPath('Plain'), true); })().then(() => 1)`);
	}
});

test('a click that opens a folder’s view doesn’t fold it; once its view is in front, a click folds it as any folder’s', async (p, h, t) => {
	await rows(p);
	const title = (path) => p.at(`.nav-folder-title[data-path="${path}"] .nav-folder-title-content`);
	const collapsed = (path) => p.ev(`${EXP}.fileItems[${JSON.stringify(path)}].collapsed`);
	const shown = () => p.ev(`app.workspace.getMostRecentLeaf().view.folder?.path ?? null`);
	let at = await title('The Lighthouse');
	await p.click(at.x, at.y); await p.sleep(500);
	t.eq(await shown(), 'The Lighthouse', 'the binder opens');
	t.eq(await collapsed('The Lighthouse'), false, 'and stays open in the explorer');
	at = await title('The Lighthouse/Part One');
	await p.click(at.x, at.y); await p.sleep(500);
	t.eq(await shown(), 'The Lighthouse/Part One', 'a folder in it opens');
	t.eq(await collapsed('The Lighthouse/Part One'), false, 'and stays open');
	at = await title('The Lighthouse');
	await p.click(at.x, at.y); await p.sleep(500);
	t.eq(await shown(), 'The Lighthouse', 'back to the binder');
	t.eq(await collapsed('The Lighthouse'), false, 'what’s in it is still listed');
	t.ok(!!(await title('The Lighthouse/Part One')), 'its folders are still in sight');
	at = await title('The Lighthouse');
	await p.click(at.x, at.y); await p.sleep(500);
	t.eq(await collapsed('The Lighthouse'), true, 'a click on the binder already in front folds it');
	await p.click(at.x, at.y); await p.sleep(500);
	t.eq(await collapsed('The Lighthouse'), false, 'and another unfolds it');
});

test('“New binder” in the menu of the explorer’s empty space, and of a folder outside binders: a binder, its name ready to type', async (p, h, t) => {
	await rows(p);
	const items = () => p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
	const pane = await p.at('.workspace-leaf-content[data-type="file-explorer"] .nav-files-container');
	await p.right(pane.x, pane.t + pane.h - 20);
	const list = await items();
	t.ok(list.includes('New binder'), 'the empty space’s menu has it: ' + list.join(', '));
	t.ok(list.indexOf('New binder') > list.indexOf('New note') && list.indexOf('New note') >= 0, 'with “New note” and “New folder”');
	await p.ev(`(() => { [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'New binder').click(); return 1; })()`);
	await p.sleep(700);
	try {
		t.ok(await p.ev(`${pl}.binders.isBinderFolder(app.vault.getAbstractFileByPath('Untitled binder'))`), 'a new folder that is a binder');
		t.ok(await p.ev(`!!document.activeElement?.closest('.nav-folder-title[data-path="Untitled binder"]') && document.activeElement.isContentEditable`), 'its name is ready to type over');
		await p.type('Second novel'); await p.key('Enter'); await p.sleep(600);
		t.ok(await p.ev(`${pl}.binders.isBinderFolder(app.vault.getAbstractFileByPath('Second novel'))`), 'named, it’s still a binder');
		// a folder inside a binder doesn't offer one (a binder in a binder isn't a thing)
		const one = await p.at('.nav-folder-title[data-path="The Lighthouse/Part One"] .nav-folder-title-content');
		await p.right(one.x, one.y);
		t.ok(!(await items()).includes('New binder'), 'not offered inside a binder');
		await p.key('Escape');
	} finally {
		await p.ev(`(async () => { document.querySelectorAll('.menu').forEach(m => m.remove()); for (const n of ['Untitled binder', 'Second novel']) { const f = app.vault.getAbstractFileByPath(n); if (f) await app.vault.delete(f, true); } })().then(() => 1)`);
	}
});

test('without the internal method: a notice, and nothing breaks', async (p, h, t) => {
	// shadow the method on the open explorer (after the re-sort that turning Binders off asks for, which would need it)
	await p.ev(`(async () => { await app.plugins.disablePlugin('binders'); await new Promise(r => setTimeout(r, 400)); ${EXP}.getSortedFolderItems = null; await app.plugins.enablePlugin('binders'); })().then(() => 1)`);
	try {
		for (let i = 0; i < 30 && (await p.ev(`${pl}?.explorer?.status ?? 'none'`)) === 'waiting'; i++) await p.sleep(100);
		t.eq(await p.ev(`${pl}.explorer.status`), 'missing', 'status missing');
		// Obsidian 1.13 shows notices in a window of their own: find it through a notice of ours
		const notices = await p.ev(`(() => { const n = new Notice('probe'); const doc = n.noticeEl.ownerDocument; n.hide(); return [...doc.querySelectorAll('.notice')].map(e => e.textContent).join(' | '); })()`);
		t.ok(/couldn’t change the order of the file explorer.*name order/.test(notices), 'a notice says binders show in name order: ' + notices);
	} finally {
		await p.ev(`(() => { delete ${EXP}.getSortedFolderItems; return 1; })()`);
		await reenable(p);
	}
	await patched(p, t);
	same(t, await rows(p), IN_ORDER, 'binder order once the method is back');
});

test('Mod-click and middle-click open a binder in a new tab; a plain click reuses its tab', async (p, h, t) => {
	await rows(p);
	await p.ev(`(() => { ${EXP}.fileItems['The Lighthouse/Part One'].setCollapsed(true); ${EXP}.fileItems['The Lighthouse/Part Two'].setCollapsed(true); return 1; })()`);
	await p.sleep(200);
	const title = (path) => p.at(`.nav-folder-title[data-path="${path}"] .nav-folder-title-content`);
	const tabs = () => p.ev(`app.workspace.getLeavesOfType('binders-view').map(l => l.getViewState().state.folder)`);
	const active = () => p.ev(`app.workspace.getMostRecentLeaf()?.getViewState().state?.folder ?? null`);
	let at = await title('The Lighthouse');
	await p.click(at.x, at.y); await p.sleep(500);
	same(t, await tabs(), ['The Lighthouse'], 'a plain click opens the binder');
	await p.ev(`(() => { ${EXP}.fileItems['The Lighthouse'].setCollapsed(false); return 1; })()`); await p.sleep(200); // the click collapsed it
	at = await title('The Lighthouse/Part One');
	await p.click(at.x, at.y, { modifiers: process.platform === 'darwin' ? 4 : 2 }); await p.sleep(500);
	same(t, await tabs(), ['The Lighthouse', 'The Lighthouse/Part One'], 'Mod-click opens the folder in a new tab, the first tab unchanged');
	t.eq(await active(), 'The Lighthouse/Part One', 'the new tab is active');
	t.eq(await p.ev(`${EXP}.fileItems['The Lighthouse/Part One'].collapsed`), false, 'and the folder still expands');
	at = await title('The Lighthouse/Part Two');
	await p.click(at.x, at.y, { button: 'middle' }); await p.sleep(500);
	same(t, await tabs(), ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two'], 'a middle click opens a new tab too');
	at = await title('The Lighthouse/Part Two');
	await p.click(at.x, at.y); await p.sleep(500);
	t.eq((await tabs()).length, 3, 'a plain click opens no new tab: it goes to the tab showing that binder');
	// Alt and Shift clicks select in the explorer: they open nothing
	at = await title('The Lighthouse');
	await p.click(at.x, at.y, { modifiers: 1 }); await p.sleep(300);
	await p.click(at.x, at.y, { modifiers: 8 }); await p.sleep(300);
	t.eq((await tabs()).length, 3, 'Alt and Shift clicks open nothing');
});

// ---- dragging to reorder ----

const NOTE = 'The Lighthouse/The Lighthouse.md';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const row = (p, path) => p.at(`.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="${path}"]`);
const texts = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
/** The binder note's `contents`, as written on disk (after anything pending is written). */
async function listOnDisk(p, path = NOTE) {
	await p.ev(`${pl}.binders.flush().then(() => 1)`);
	await p.sleep(150);
	const lines = (await p.ev(`app.vault.adapter.read(${JSON.stringify(path)})`)).split('\n'), i = lines.findIndex((l) => /^contents:/.test(l)), out = [];
	for (const l of lines.slice(i + 1)) { const m = /^\s+- (.*)$/.exec(l); if (!m) break; out.push(m[1].replace(/^(["'])(.*)\1$/, '$2')); }
	return out;
}
/** What shows while a drag is held: Binders' line between two rows, and the hint under the pointer. */
const held = (p) => p.ev(`(() => { const l = document.querySelector('.binders-explorer-drop')?.getBoundingClientRect(); return { line: l ? { y: Math.round(l.top + l.height / 2), left: Math.round(l.left) } : null, hint: document.querySelector('.drag-ghost-action')?.textContent ?? '', into: [...document.querySelectorAll('.is-being-dragged-over')].map(e => e.dataset.path ?? e.querySelector('[data-path]')?.dataset.path) }; })()`);
/** A real drag of an explorer row to a point, with the button held, in steps; returns what showed just before the drop. */
async function dragRow(p, from, to) {
	const a = await row(p, from);
	await p.move(a.x, a.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
	await p.move(a.x + 6, a.y + 6, 3, { buttons: 1 });
	await p.move(to.x, to.y, 8, { buttons: 1 });
	await p.sleep(250);
	const seen = await held(p);
	seen.dragging = await p.ev(`(() => { const d = app.dragManager?.draggable; return d ? { type: d.type, path: d.file?.path ?? null } : null; })()`);
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
	await p.sleep(500);
	return seen;
}
const unchanged = (t, before, after, { skip = [], moved = {} } = {}) => {
	for (const [path, text] of Object.entries(before)) if (!skip.includes(path)) t.eq(after[moved[path] ?? path], text, `“${path}” is unchanged`);
};

test('dragging a note above another reorders the binder: a line shows where, the list changes, no note does', async (p, h, t) => {
	const before = await texts(p);
	await rows(p);
	const a = await row(p, 'The Lighthouse/Part One/Arrival.md');
	const seen = await dragRow(p, 'The Lighthouse/Part One/The keeper.md', { x: a.x, y: a.t + 3 });
	// fails loudly if Obsidian's drag manager changes (see docs/internals.md)
	same(t, seen.dragging, { type: 'file', path: 'The Lighthouse/Part One/The keeper.md' }, 'Obsidian’s drag manager says what is being dragged');
	t.ok(seen.line && Math.abs(seen.line.y - a.t) <= 2, `a line along the top of Arrival (${JSON.stringify(seen.line)} vs ${a.t})`);
	t.eq(seen.hint, 'Move before “Arrival”', 'the hint under the pointer says where');
	same(t, seen.into, [], 'no folder is tinted: this isn’t a move into one');
	same(t, await rows(p), [IN_ORDER[0], IN_ORDER[1], IN_ORDER[3], IN_ORDER[2], ...IN_ORDER.slice(4)], 'The keeper shows before Arrival');
	same(t, await listOnDisk(p), ['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Arrival', ...LIST.slice(4)], 'and the list on disk says so');
	unchanged(t, before, await texts(p), { skip: [NOTE] });
	t.eq(await p.ev(`document.querySelectorAll('.binders-explorer-drop').length`), 0, 'the line is gone');
});

test('dragging below a note in another folder moves the file there, at that place', async (p, h, t) => {
	const before = await texts(p);
	await rows(p);
	const w = await row(p, 'The Lighthouse/Part Two/The wreck.md');
	const seen = await dragRow(p, 'The Lighthouse/Epilogue.md', { x: w.x, y: w.t + w.h - 3 });
	t.eq(seen.hint, 'Move after “The wreck”', 'the hint');
	t.ok(seen.line && Math.abs(seen.line.y - (w.t + w.h)) <= 2, 'a line along the bottom of The wreck');
	same(t, await rows(p), [...IN_ORDER.slice(0, 7), 'The Lighthouse/Part Two/Epilogue.md', 'The Lighthouse/Part Two/Lights out.md'], 'Epilogue is in Part Two, after The wreck');
	same(t, await listOnDisk(p), [...LIST.slice(0, 7), 'Part Two/Epilogue', 'Part Two/Lights out'], 'the list on disk');
	unchanged(t, before, await texts(p), { skip: [NOTE], moved: { 'The Lighthouse/Epilogue.md': 'The Lighthouse/Part Two/Epilogue.md' } });
});

test('a folder’s edges place a drop beside it (below an open folder: at its top); its middle still moves into it', async (p, h, t) => {
	await rows(p);
	// the top edge of Part One: before the folder
	let one = await row(p, 'The Lighthouse/Part One');
	let seen = await dragRow(p, 'The Lighthouse/Epilogue.md', { x: one.x, y: one.t + 2 });
	t.eq(seen.hint, 'Move before “Part One”', 'the top edge: before the folder');
	same(t, (await listOnDisk(p)).slice(0, 3), ['Prologue', 'Epilogue', 'Part One/'], 'Epilogue goes before Part One');
	// the bottom edge of Part Two, which is open: its first item
	await rows(p);
	const two = await row(p, 'The Lighthouse/Part Two');
	seen = await dragRow(p, 'The Lighthouse/Part One/Storm warning.md', { x: two.x, y: two.t + two.h - 2 });
	t.eq(seen.hint, 'Move to the top of “Part Two”', 'below an open folder’s name: the top of what’s in it');
	const list = await listOnDisk(p);
	same(t, list.slice(list.indexOf('Part Two/'), list.indexOf('Part Two/') + 2), ['Part Two/', 'Part Two/Storm warning'], 'Storm warning is first in Part Two');
	t.ok(await p.ev(`app.vault.adapter.exists('The Lighthouse/Part Two/Storm warning.md')`), 'and the file moved there');
	// the middle of Part One: Obsidian's own "move into", which Binders leaves alone (the note goes last, as any note moved in)
	await rows(p);
	one = await row(p, 'The Lighthouse/Part One');
	seen = await dragRow(p, 'The Lighthouse/Prologue.md', { x: one.x, y: one.y });
	t.eq(seen.line, null, 'no line over the middle of a folder');
	same(t, seen.into, ['The Lighthouse/Part One'], 'the folder is tinted, as Obsidian tints it');
	t.ok(await p.ev(`app.vault.adapter.exists('The Lighthouse/Part One/Prologue.md')`), 'the note moved into the folder');
});

test('nothing is taken where a drop would change nothing, or with binder order off', async (p, h, t) => {
	await rows(p);
	const a = await row(p, 'The Lighthouse/Part One/Arrival.md');
	// The keeper is already just below Arrival
	let seen = await dragRow(p, 'The Lighthouse/Part One/The keeper.md', { x: a.x, y: a.t + a.h - 3 });
	t.eq(seen.line, null, 'no line where the note already is');
	same(t, await listOnDisk(p), LIST, 'and nothing changes');
	// (Escape cancels the drag in Chromium itself, which sends no drop: nothing here can test that)
	// with "Order binders in the file explorer" off the explorer is Obsidian's own again
	await setSettings(p, { orderExplorer: false });
	await rows(p);
	const b = await row(p, 'The Lighthouse/Part One/Arrival.md');
	seen = await dragRow(p, 'The Lighthouse/Part One/The keeper.md', { x: b.x, y: b.t + 3 });
	t.eq(seen.line, null, 'no line with the setting off');
	same(t, await listOnDisk(p), LIST, 'and no reorder');
});

test('a Longform project reorders by dragging too: only longform.scenes changes, and no file moves', async (p, h, t) => {
	const before = await texts(p), DIR = 'Longform demo';
	const scenes = async () => { await p.ev(`${pl}.binders.flush().then(() => 1)`); await p.sleep(150); return p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('${DIR}/Index.md')).frontmatter.longform.scenes)`); };
	await rows(p, DIR, [DIR]);
	const hb = await row(p, `${DIR}/Harbor.md`);
	const seen = await dragRow(p, `${DIR}/Return.md`, { x: hb.x, y: hb.t + 3 });
	t.eq(seen.hint, 'Move before “Harbor”', 'the hint');
	for (let i = 0; i < 40 && !(await scenes()).startsWith('["Return"'); i++) await p.sleep(50);
	t.eq(await scenes(), JSON.stringify(['Return', 'Harbor', ['Ticket office', 'The crossing'], 'Island']), 'Return is first, the group as it was');
	same(t, (await rows(p, DIR, [DIR])).slice(0, 2), [`${DIR}/Return.md`, `${DIR}/Harbor.md`], 'and shows first');
	unchanged(t, before, await texts(p), { skip: [`${DIR}/Index.md`] });
	// a note the project ignores takes no drop beside it
	const n = await row(p, `${DIR}/Notes on ferries.md`);
	const over = await dragRow(p, `${DIR}/Island.md`, { x: n.x, y: n.t + 3 });
	t.eq(over.line, null, 'no line beside a note Longform ignores');
});

// Reloads Obsidian twice (into mobile and back), so it is last in this file.
test('mobile: binder order, hidden notes, and tap to open and expand', async (p, h, t) => {
	const reload = async (mobile) => {
		await p.ev(`(() => { setTimeout(() => app.emulateMobile(${mobile}), 50); return 1; })()`);
		await p.sleep(1500);
		for (let i = 0; i < 80; i++) { if (await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer && app.isMobile === ${mobile})`).catch(() => false)) break; await p.sleep(250); }
		await p.sleep(800);
		p.errors.length = 0; // a reload logs Electron's own warnings again
	};
	await reload(true);
	try {
		t.ok(await p.ev(`app.isMobile`), 'Obsidian is in mobile mode');
		await patched(p, t);
		same(t, await rows(p), IN_ORDER, 'binder order on mobile');
		await p.ev(`(() => { window.__opened = []; ${pl}.openBinder = (f) => window.__opened.push(f.path); ${EXP}.fileItems['The Lighthouse/Part One'].setCollapsed(true); return 1; })()`);
		await p.sleep(250);
		const at = await p.at(`.nav-folder-title[data-path="The Lighthouse/Part One"] .nav-folder-title-content`);
		t.ok(at, 'the folder is on screen');
		// a real touch tap, as on a phone
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
		try {
			await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
			await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await p.sleep(400);
		} finally { await p.send('Emulation.setTouchEmulationEnabled', { enabled: false }); }
		same(t, await p.ev(`window.__opened`), ['The Lighthouse/Part One'], 'a tap opens the folder');
		t.eq(await p.ev(`${EXP}.fileItems['The Lighthouse/Part One'].collapsed`), false, 'and expands it');
	} finally { await reload(false); }
	t.ok(!(await p.ev(`app.isMobile`)), 'back on desktop');
});

// ---- Binders' items in the explorer's own menus ----
const menuTitles = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
const pick = async (p, title) => { await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${JSON.stringify(title)}); it.click(); return 1; })()`); await p.sleep(300); };
const rowAt = (p, path) => p.at(`.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="${path}"]`);
/** The binder's list as written in its note, once it lists `want`. */
const listOf = async (p, want) => {
	let list = [];
	for (let i = 0; i < 40; i++) {
		await p.ev(`${pl}.binders.flush().then(() => 1)`);
		list = await contents(p);
		if (list.includes(want)) break;
		await p.sleep(100);
	}
	return list;
};

test('a note’s menu in the explorer: “Show in binder” selects its card, “New scene after this” makes one right after it', async (p, h, t) => {
	await rows(p);
	let at = await rowAt(p, 'The Lighthouse/Part One/Arrival.md');
	await p.right(at.x, at.y);
	const items = await menuTitles(p);
	t.ok(items.includes('Show in binder') && items.includes('New scene after this') && items.includes('Move down'), 'the note’s menu has Binders’ items: ' + items.join(', '));
	await pick(p, 'Show in binder');
	for (let i = 0; i < 30 && !(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-card.is-selected')`)); i++) await p.sleep(100);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card.is-selected')?.dataset.path`), 'The Lighthouse/Part One/Arrival.md', 'the binder opens on its folder, with its card selected');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.folder?.path`), 'The Lighthouse/Part One', 'in the folder the note is in');
	// a note outside any binder has neither
	await p.ev(`app.vault.create('Loose note.md', 'x').then(() => 1)`);
	await p.sleep(300);
	at = await rowAt(p, 'Loose note.md');
	await p.right(at.x, at.y);
	t.ok(!(await menuTitles(p)).some((x) => x === 'Show in binder' || x === 'New scene after this'), 'a note outside binders has no Binders items');
	await p.key('Escape');
	// a new scene right after this one (in a note tab, so the new note opens with its name ready to type)
	await p.ev(`app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath('The Lighthouse/Epilogue.md')).then(() => 1)`);
	at = await rowAt(p, 'The Lighthouse/Part One/Arrival.md');
	await p.right(at.x, at.y);
	await pick(p, 'New scene after this');
	for (let i = 0; i < 30 && !(await p.ev(`!!app.vault.getAbstractFileByPath('The Lighthouse/Part One/Untitled.md')`)); i++) await p.sleep(100);
	same(t, (await listOf(p, 'Part One/Untitled')).slice(1, 5), ['Part One/', 'Part One/Arrival', 'Part One/Untitled', 'Part One/The keeper'], 'the new note comes right after it');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Loose note.md')).then(() => 1)`);
});

test('several items selected in the explorer: “New folder from selection” (named in place) and “Merge notes”, in binder order', async (p, h, t) => {
	await rows(p);
	const before = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
	// Storm warning, then Arrival (clicked out of order): Alt-click adds to the explorer's selection
	const s = await rowAt(p, 'The Lighthouse/Part One/Storm warning.md'), a = await rowAt(p, 'The Lighthouse/Part One/Arrival.md');
	await p.click(s.x, s.y, { modifiers: 1 });
	await p.click(a.x, a.y, { modifiers: 1 });
	await p.right(a.x, a.y);
	const items = await menuTitles(p);
	t.ok(items.includes('New folder from selection') && items.includes('Merge 2 notes'), 'the selection’s menu has Binders’ items: ' + items.join(', '));
	await pick(p, 'New folder from selection');
	for (let i = 0; i < 30 && !(await p.ev(`!!app.vault.getAbstractFileByPath('The Lighthouse/Part One/Untitled/Arrival.md')`)); i++) await p.sleep(100);
	same(t, (await listOf(p, 'Part One/Untitled/Storm warning')).slice(1, 6), ['Part One/', 'Part One/Untitled/', 'Part One/Untitled/Arrival', 'Part One/Untitled/Storm warning', 'Part One/The keeper'], 'a folder where the first was, holding both in binder order');
	// its name is being edited in the explorer, as a new folder's is
	for (let i = 0; i < 20 && !(await p.ev(`!!document.querySelector('.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title .is-being-renamed, .workspace-leaf-content[data-type="file-explorer"] [contenteditable="true"]')`)); i++) await p.sleep(100);
	t.ok(await p.ev(`!!document.querySelector('.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title .is-being-renamed, .workspace-leaf-content[data-type="file-explorer"] [contenteditable="true"]')`), 'the new folder’s name is ready to type');
	await p.type('On the island');
	await p.key('Enter');
	for (let i = 0; i < 30 && !(await p.ev(`!!app.vault.getAbstractFileByPath('The Lighthouse/Part One/On the island/Arrival.md')`)); i++) await p.sleep(100);
	same(t, (await listOf(p, 'Part One/On the island/Storm warning')).slice(2, 5), ['Part One/On the island/', 'Part One/On the island/Arrival', 'Part One/On the island/Storm warning'], 'renamed, its notes with it');
	const after = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
	for (const [k, v] of Object.entries(before)) if (k !== 'The Lighthouse/The Lighthouse.md') t.eq(after[k.replace('Part One/Arrival', 'Part One/On the island/Arrival').replace('Part One/Storm warning', 'Part One/On the island/Storm warning')], v, `${k}: text unchanged`);
	// two notes in different binders (or one outside): nothing of ours
	await p.ev(`app.vault.create('Loose note.md', 'x').then(() => 1)`);
	await p.sleep(300);
	const k = await rowAt(p, 'The Lighthouse/Part One/The keeper.md'), loose = await rowAt(p, 'Loose note.md');
	await p.click(k.x, k.y);
	await p.click(loose.x, loose.y, { modifiers: 1 });
	await p.right(loose.x, loose.y);
	const mixed = await menuTitles(p);
	t.ok(mixed.length > 0 && !mixed.some((x) => x === 'New folder from selection' || /^Merge \d/.test(x)), 'a selection that isn’t all in one binder has no Binders items: ' + mixed.join(', '));
	await p.key('Escape');
});

// Another plugin may patch the explorer's `getSortedFolderItems` too. One that assigns its own function and, turned
// off, puts back what it found takes with it any patch made after its own: Binders'. (monkey-around, which Binders
// uses, takes off only its own.)
const PROTO = `Object.getPrototypeOf(${EXP})`;
const turnOff = (p) => p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`).then(() => p.sleep(400));
const turnOn = async (p) => {
	await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
	for (let i = 0; i < 40 && (await p.ev(`${pl}?.explorer?.status ?? 'none'`)) !== 'patched'; i++) await p.sleep(100);
	await p.sleep(300);
};

test('a patch another plugin takes away with its own is put back: binder order returns when a tab is switched to, and Obsidian’s method is left clean', async (p, h, t) => {
	await rows(p);
	try {
		await turnOff(p);
		// the other plugin, on before Binders
		await p.ev(`(() => { const pr = ${PROTO}; window.__found = pr.getSortedFolderItems; pr.getSortedFolderItems = function (f) { return window.__found.call(this, f); }; return 1; })()`);
		await turnOn(p);
		same(t, await rows(p), IN_ORDER, 'binder order, on top of the other plugin’s patch');
		// it's turned off, and puts back what it found
		await p.ev(`(() => { ${PROTO}.getSortedFolderItems = window.__found; ${EXP}.requestSort(); return 1; })()`); await p.sleep(500);
		same(t, await rows(p), ALPHABETICAL, 'Binders’ patch went with it: by name (what this test is about)');
		await h.open('The Lighthouse/Prologue.md'); await p.sleep(600);
		same(t, await rows(p), IN_ORDER, 'binder order is back once a tab is switched to, with no change to any binder');
		t.eq(await p.ev(`${pl}.explorer.status`), 'patched', 'and the patch says so');
		t.eq(await p.ev(`document.querySelectorAll('.binders-folder-tag').length`), 2, 'each binder is tagged once');
		await turnOff(p);
		t.ok(/sortOrder/.test(await p.ev(`${PROTO}.getSortedFolderItems.toString()`)), 'with Binders off, Obsidian’s own method is back, unwrapped');
		same(t, await rows(p), ALPHABETICAL, 'and its own order');
	} finally { await p.ev(`(async () => { if (app.plugins.plugins.binders) await app.plugins.disablePlugin('binders'); if (window.__found) ${PROTO}.getSortedFolderItems = window.__found; delete window.__found; })().then(() => 1)`); await turnOn(p); }
	same(t, await rows(p), IN_ORDER, 'binder order after turning it back on');
});

test('a plugin that patches the explorer over Binders’ patch, and takes its own off again, leaves Binders’ in place: it isn’t made twice', async (p, h, t) => {
	await rows(p);
	try {
		// the other plugin, on after Binders: its patch calls what it found, which is Binders'
		await p.ev(`(() => { const pr = ${PROTO}; window.__under = pr.getSortedFolderItems; window.__calls = 0; pr.getSortedFolderItems = function (f) { window.__calls++; return window.__under.call(this, f); }; ${EXP}.requestSort(); return 1; })()`); await p.sleep(500);
		t.ok(await p.ev(`window.__calls`) > 0, 'the other plugin’s patch is the one the explorer calls');
		await p.ev(`${pl}.binders.moveDown(app.vault.getAbstractFileByPath('The Lighthouse/Prologue.md')).then(() => 1)`); await p.sleep(700);
		same(t, (await rows(p)).slice(0, 5), ['The Lighthouse/Part One', 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part One/Storm warning.md', 'The Lighthouse/Prologue.md'], 'binder order follows a change, through both patches');
		await p.ev(`(() => { window.__theirs = ${PROTO}.getSortedFolderItems; return 1; })()`);
		await h.open('The Lighthouse/Prologue.md'); await p.sleep(500);
		t.ok(await p.ev(`${PROTO}.getSortedFolderItems === window.__theirs`), 'Binders didn’t patch again over the other plugin’s patch (its own is still under it)');
		// the other plugin is turned off: Binders' patch is what it found, and what it puts back
		await p.ev(`(() => { ${PROTO}.getSortedFolderItems = window.__under; ${EXP}.requestSort(); return 1; })()`); await p.sleep(500);
		await p.ev(`${pl}.binders.moveUp(app.vault.getAbstractFileByPath('The Lighthouse/Prologue.md')).then(() => 1)`); await p.sleep(700);
		same(t, await rows(p), IN_ORDER, 'binder order still');
		t.ok(await p.ev(`${PROTO}.getSortedFolderItems === window.__under`), 'and still the one patch');
		await turnOff(p);
		t.ok(/sortOrder/.test(await p.ev(`${PROTO}.getSortedFolderItems.toString()`)), 'with Binders off, Obsidian’s own method is back, unwrapped');
	} finally {
		// (the other plugin's patch comes off while Binders' is still under it, so Binders' own comes off clean)
		await p.ev(`(async () => { if (window.__theirs && ${PROTO}.getSortedFolderItems === window.__theirs) ${PROTO}.getSortedFolderItems = window.__under; if (app.plugins.plugins.binders) await app.plugins.disablePlugin('binders'); delete window.__under; delete window.__theirs; delete window.__calls; })().then(() => 1)`);
		await turnOn(p);
	}
	same(t, await rows(p), IN_ORDER, 'binder order after turning it back on');
});
