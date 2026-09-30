// The core file explorer: binder order, hidden binder and folder notes, the binder icon, click to open, mobile.
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

test('binder icon on binder folders only', async (p, h, t) => {
	await rows(p);
	const icons = await p.ev(`[...document.querySelectorAll('.nav-folder-title .binders-folder-icon')].map(e => e.closest('[data-path]').dataset.path)`);
	same(t, icons, ['The Lighthouse'], 'only the binder folder has the icon');
	t.ok(await p.ev(`!!document.querySelector('.nav-folder-title[data-path="The Lighthouse"] .binders-folder-icon svg.lucide-book')`), 'it is the book icon');
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
		t.eq(await p.ev(`document.querySelectorAll('.binders-folder-icon').length`), 0, 'no icons left');
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
		t.eq(await collapsed('The Lighthouse/Part One'), true, 'a second click collapses it');
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
