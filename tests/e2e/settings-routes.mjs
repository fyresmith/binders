// Where each row of Binders' settings tab is: on the tab itself, or on a page a row of the tab opens (Obsidian 1.13's
// pages, src/settings.ts). A test asks for a row by its name and goes through here, as tests go through menu-routes.mjs
// for menus: moving a row to another page is then one edit in this map, and no test breaks.

/** The page each row is on, by the row's name (or by a list's class); a row not named here is on the tab. */
export const PAGE_OF = {
	labels: 'Labels', 'binders-settings-labels': 'Labels', 'binders-settings-label': 'Labels', 'Add label': 'Labels', 'Restore the default labels': 'Labels',
	statuses: 'Statuses', 'binders-settings-statuses': 'Statuses', 'binders-settings-status': 'Statuses', 'Add status': 'Statuses', 'Restore the default statuses': 'Statuses',
	'Typewriter scrolling': 'Focus mode', 'Show the scenes before and after': 'Focus mode', 'Show where you are': 'Focus mode', 'Show word counts': 'Focus mode',
	'Dim other paragraphs': 'Focus mode', 'Dim the background': 'Focus mode', 'Enter fullscreen': 'Focus mode',
	'Exports folder': 'Folders', 'Styles folder': 'Folders', 'Remembered places': 'Folders', 'binders-settings-exports': 'Folders', 'binders-settings-styles': 'Folders', 'binders-settings-places': 'Folders',
	Title: 'Property names', Synopsis: 'Property names', Status: 'Property names', Label: 'Property names', Target: 'Property names',
	'Story date': 'Property names', 'Story order': 'Property names', Notes: 'Property names', 'binders-settings-props': 'Property names',
};

/** The element the settings' rows are drawn in now: the page that is open, else the tab. */
export const SHOWN = `(app.setting.getCurrentPageEl?.() ?? app.setting.activeTab?.containerEl)`;

/** The name of the page open now, or null on the tab. */
export const pageNow = (p) => p.ev(`(() => { const s = app.setting; return s.pageStack?.length ? s.pageStack[s.pageStack.length - 1].page.title ?? null : null; })()`);

/** The settings open at Binders' tab, at its top (any page that was open is closed). */
export async function openTab(p) {
	await p.ev(`(() => { const s = app.setting; s.open(); while (s.pageStack?.length) s.closePage(); s.openTabById('binders'); while (s.pageStack?.length) s.closePage(); return 1; })()`);
	for (let i = 0; i < 40 && !(await p.ev(`(app.setting.activeTab?.containerEl?.querySelectorAll('.setting-item').length ?? 0) > 5`).catch(() => false)); i++) await p.sleep(100);
	await p.sleep(200);
}

/** The settings open where this row is (a row's name, a list's name or class): the page it is on is opened as a writer
    does, by a click on the tab's row for it. The settings are opened if they aren't. */
export const showRow = (p, row) => showPage(p, PAGE_OF[row] ?? null);

/** The settings open at this page of Binders' tab (by its row's name: "Labels", "Focus mode"), or at the tab for null. */
export async function showPage(p, page) {
	const open = await p.ev(`!!app.setting?.activeTab?.containerEl?.isConnected || !!app.setting?.pageStack?.length`).catch(() => false);
	if (open && (await pageNow(p)) === page && (await p.ev(`app.setting.activeTab?.id`)) === 'binders') return;
	await openTab(p);
	if (!page) return;
	await p.ev(`(() => { const r = [...app.setting.activeTab.containerEl.querySelectorAll('.setting-item.mod-navigable')].find(r => r.querySelector('.setting-item-name')?.textContent === ${JSON.stringify(page)}); if (!r) throw new Error('no row opens the page ${page}'); r.click(); return 1; })()`);
	for (let i = 0; i < 40 && (await pageNow(p)) !== page; i++) await p.sleep(50);
	await p.sleep(300);
}
