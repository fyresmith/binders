// Binder settings (src/view/binder-settings.ts): the two-pane dialog that holds what a binder keeps about itself. The
// ways in; each page keeps its change as it is made and writes only the binder note's own properties (the files are
// read back); the undo each control keeps; Calendar's one Save; read-only for a newer format and a Longform project;
// the phone's list, page and back. Labels and statuses of a binder's own are in specs-binder-labels.mjs.
import { B, NOTE, PL, clickMenu, closeMenus, hoverMenu, file, j, menuItems, openView, read, same, split, texts, until, withTidy, writeRaw } from './view-helpers.mjs';
import { PHONE, onDevice } from './specs-qa5-manuscript.mjs';

export const specs = [];
export const D = '.modal.binders-bset';
const L = 'The Lighthouse/';
const MORE = '.workspace-leaf.mod-active .view-action[aria-label="More options"]';

export const close = async (p) => {
	await p.ev(`(() => { document.querySelectorAll('.modal-container .modal-close-button').forEach((b) => b.click()); try { app.setting.close(); } catch {} return 1; })()`);
	await until(p, `!document.querySelector('.modal-container')`, 3000).catch(() => {});
};
const test = (name, fn, extra = {}) => specs.push({ name: 'binder settings: ' + name, ...extra, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeMenus(p); await close(p); } }) });
const guard = (name, fn) => test(name, fn, { tier: 'guard' });

/** Opens the view's More options (again, if the first press found the view not ready). */
export const moreOptions = async (p) => {
	for (let i = 0; i < 4; i++) {
		const more = await p.at(MORE);
		await p.click(more.x, more.y);
		await p.sleep(500);
		if ((await menuItems(p)).length) return;
	}
};
/** Opens the dialog from the More options of the view on `folder` (a view is in front, so no command is guessing which binder). */
export const openFor = async (p, folder, page = 'book') => {
	await openView(p, folder);
	await moreOptions(p);
	await clickMenu(p, 'Binder settings...');
	await until(p, `!!document.querySelector('${D}')`);
	await showPage(p, page);
};
export const openDialog = (p, page = 'book') => openFor(p, 'The Lighthouse', page);
export const showPage = async (p, page) => {
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="page-${page}"]').click(); return 1; })()`);
	await until(p, `document.querySelector('${D} .binders-bset-body')?.dataset.page === '${page}'`);
	await p.sleep(150);
};
export const pageOf = (p) => p.ev(`document.querySelector('${D} .binders-bset-body')?.dataset.page ?? null`);
/** Types into a field as a writer does (the value, then the event that says it was left). */
export const typeIn = (p, sel, value, events = ['input', 'change']) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); e.focus(); e.value = ${j(value)}; for (const n of ${j(events)}) e.dispatchEvent(new Event(n, { bubbles: true })); return 1; })()`);
export const fm = (p, path = NOTE) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? null)`).then(JSON.parse);
export const mk = (p, files) => p.ev(`(async () => { for (const [path, text] of Object.entries(${j(files)})) { const dir = path.split('/').slice(0, -1).join('/'); if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir); if (app.vault.getAbstractFileByPath(path)) await app.vault.adapter.write(path, text); else await app.vault.create(path, text); } })().then(() => 1)`);
const enabled = (p) => p.ev(`[...document.querySelectorAll('${D} .binders-bset-page input:not(.checkbox-container input), ${D} .binders-bset-page .checkbox-container:not(.is-disabled), ${D} .binders-bset-page select, ${D} .binders-bset-page textarea, ${D} .binders-bset-page button')].filter((e) => !e.disabled && !e.closest('[aria-hidden="true"]')).map((e) => e.dataset.bindersKey || e.getAttribute('aria-label') || e.textContent || e.tagName)`);
const wait = async (p, expr, ms = 4000) => { if (!(await until(p, expr, ms))) throw new Error('never became true: ' + expr.slice(0, 160)); };

test('it opens from the command, the view’s More options and a binder folder’s menu in the file explorer, at the Book page; “Edit calendar...” opens it at Calendar (“Edit labels...” is checked in specs-labels.mjs and the lanes’ and card menus’ specs)', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { app.commands.executeCommandById('binders:open-binder-settings'); return 1; })()`);
	await wait(p, `!!document.querySelector('${D}')`);
	t.eq(await pageOf(p), 'book', 'the command opens it at Book');
	t.eq(await p.ev(`document.querySelector('${D} .modal-title').textContent`), 'Binder settings', 'it is called “Binder settings”');
	t.eq(await p.ev(`document.querySelector('${D} .binders-snapshots-of').textContent`), 'The Lighthouse', 'its sidebar is headed by the binder’s name');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${D} .binders-bset-pages .binders-snapshots-item-name')].map((e) => e.textContent)`)), j(['Book', 'Goal', 'Labels', 'Statuses', 'New notes', 'Calendar']), 'the six pages');
	t.ok(await p.ev(`!document.querySelector('${D} button.mod-cta')`), 'there is no Save or Done on Book');
	await close(p);
	// the view's More options
	await moreOptions(p);
	t.ok((await menuItems(p)).includes('Binder settings...'), 'More options has “Binder settings...”: ' + j(await menuItems(p)));
	await clickMenu(p, 'Binder settings...');
	await wait(p, `!!document.querySelector('${D}')`);
	t.eq(await pageOf(p), 'book', 'which opens the dialog');
	await close(p);
	// the file explorer's menu on the binder's folder, and not on a folder inside it
	const titles = (path) => p.ev(`(() => {
		const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const s = {}, it = new Proxy({}, { get: (x, m) => m === 's' ? s : (v) => { if (m === 'setTitle') s.t = v; if (m === 'onClick') s.f = v; return it; } }); cb(it); items.push(s); return menu; } : () => menu });
		app.workspace.trigger('file-menu', menu, ${file(path)}, 'file-explorer-context-menu');
		return items.map((i) => i.t);
	})()`);
	const own = await titles('The Lighthouse');
	t.ok(own.includes('Binder settings...') && own.indexOf('Binder settings...') === own.indexOf('Export...') + 1, 'the binder folder’s menu has it right after “Export...”: ' + own.join(', '));
	t.ok(!(await titles('The Lighthouse/Part One')).includes('Binder settings...'), 'a folder inside it does not');
	// "Edit calendar..." and "Edit labels..."
	await p.ev(`(() => { app.commands.executeCommandById('binders:edit-calendar'); return 1; })()`);
	await wait(p, `document.querySelector('${D} .binders-bset-body')?.dataset.page === 'calendar'`);
	t.ok(true, '“Edit calendar...” opens it at Calendar');
	await close(p);
});

test('opened from a folder inside a binder it is the binder’s settings, and says which binder', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await moreOptions(p);
	await clickMenu(p, 'Binder settings...');
	await wait(p, `!!document.querySelector('${D}')`);
	t.eq(await p.ev(`document.querySelector('${D} .binders-snapshots-of').textContent`), 'The Lighthouse', 'it is headed by the binder, not the folder');
	t.ok(/settings of the binder “The Lighthouse”, which “Part One” is in/.test(await p.ev(`document.querySelector('${D} .binders-bset-from')?.textContent ?? ''`)), 'and says so');
});

guard('Book: a title is kept when its field is left, as the binder note’s own property and nothing else', async (p, h, t) => {
	const before = await texts(p);
	await openDialog(p, 'book');
	await typeIn(p, `${D} [data-binders-key="title"]`, 'The Beacon');
	await wait(p, `app.vault.adapter.read(${j(NOTE)}).then((x) => x.includes('title: The Beacon'))`);
	const now = await read(p, NOTE);
	t.eq(split(now).body, split(before[NOTE]).body, 'the binder note’s text is as it was');
	t.ok(split(now).yaml.startsWith(split(before[NOTE]).yaml), 'and its properties as they were, in place, with title added');
	await close(p);
	same(t, before, await texts(p), { skip: [NOTE] });
});

guard('Goal: a target, a deadline and writing days are kept as they are made, each one step for Undo; only the binder note changes', async (p, h, t) => {
	const before = await texts(p);
	await openDialog(p, 'goal');
	const d = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
	await typeIn(p, `${D} [data-binders-key="goal-target"]`, '90,000');
	await wait(p, `${PL}.app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.target === 90000`);
	t.eq((await fm(p)).target, 90000, 'the target is kept');
	await typeIn(p, `${D} [data-binders-key="goal-deadline"]`, d);
	await wait(p, `${PL}.app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.deadline`);
	t.ok(String((await fm(p)).deadline).startsWith(d), 'the deadline is kept');
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="goal-day-0"]').click(); return 1; })()`);
	await wait(p, `Array.isArray(${PL}.app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.['writing-days'])`);
	t.ok(!(await fm(p))['writing-days'].includes('Sunday') && (await fm(p))['writing-days'].includes('Monday'), 'a day taken off is kept as the days written on');
	// a plan that cannot be: said, and not written
	await typeIn(p, `${D} [data-binders-key="goal-deadline"]`, '2001-01-01');
	await p.sleep(400);
	t.ok(/passed/.test(await p.ev(`document.querySelector('${D} .binders-pot-form-problem')?.textContent ?? ''`)), 'a date gone by is said');
	t.ok(String((await fm(p)).deadline).startsWith(d), 'and not written');
	// Undo takes the last change back, one step
	const steps = await p.ev(`${B}.undos.length`);
	t.ok(steps >= 3, 'each change is a step: ' + steps);
	await p.ev(`${B}.undo(${j(NOTE)}).then(() => 1)`);
	await p.sleep(500);
	t.ok(!(await fm(p))['writing-days'], 'Undo takes the days back');
	t.eq((await fm(p)).target, 90000, 'and the target is still there');
	await close(p);
	same(t, before, await texts(p), { skip: [NOTE] });
});

guard('New notes: a template is chosen for the binder’s new notes (one step of Undo); the revision note is chosen and taken away', async (p, h, t) => {
	await mk(p, { 'Templates/Scene.md': '# {{title}}\n', 'Notes/Fixes.md': '- [ ] one\n' });
	await p.ev(`(async () => { const c = app.internalPlugins?.plugins?.templates; if (c) c.instance.options.folder = 'Templates'; })().then(() => 1)`);
	const before = await texts(p);
	await openDialog(p, 'new-notes');
	t.ok(await p.ev(`!!document.querySelector('${D} [data-binders-key="template"]')`), 'there is a template choice');
	await p.ev(`(() => { const s = document.querySelector('${D} [data-binders-key="template"]'); const o = [...s.options].find((x) => x.textContent === 'Scene'); if (!o) return 0; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await wait(p, `/Scene/.test(String(app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.template ?? ''))`).catch(() => {});
	t.ok(/Scene/.test(String((await fm(p)).template ?? '')), 'the template is named in the binder note');
	// the revision note
	if (!(await p.ev(`!!document.querySelector('${D} [data-binders-key="revision-choose"]')`))) throw new Error('page: ' + (await p.ev(`document.querySelector('${D} .binders-bset-body').innerHTML.slice(0, 2500)`)));
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="revision-choose"]').click(); return 1; })()`);
	await wait(p, `!!document.querySelector('.prompt')`);
	await p.type('Fixes');
	await p.sleep(300);
	await p.key('Enter');
	await wait(p, `/Fixes/.test(String(app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.revision ?? ''))`);
	t.ok(true, 'a note is chosen as the revision note, named by a link');
	await wait(p, `!!document.querySelector('${D} [data-binders-key="revision-clear"]')`);
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="revision-clear"]').click(); return 1; })()`);
	await wait(p, `!app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.revision`);
	t.ok(true, 'and taken away');
	await close(p);
	const now = await texts(p);
	t.eq(split(now[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is untouched');
	t.eq(now['Notes/Fixes.md'], before['Notes/Fixes.md'], 'so is the revision note');
});

guard('Calendar: nothing is kept until Save; Save writes the calendar as one step; the page says what saving can change', async (p, h, t) => {
	const before = await texts(p);
	await openDialog(p, 'calendar');
	t.ok(/story dates/.test(await p.ev(`document.querySelector('${D} .binders-calendar-says')?.textContent ?? ''`)), 'the page says saving can change what dates mean');
	await p.ev(`(() => { const s = [...document.querySelectorAll('${D} .binders-calendar-form select')][0]; s.value = [...s.options].find((o) => /30|thirteen|13|Gregorian/i.test(o.textContent) && o.value !== s.value)?.value ?? s.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await p.sleep(400);
	t.eq(split(await read(p, NOTE)).yaml, split(before[NOTE]).yaml, 'a change on the page is a draft: the note is as it was');
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="calendar-save"]').click(); return 1; })()`);
	await p.sleep(900);
	await close(p);
	const now = await texts(p);
	t.eq(split(now[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is as it was');
	for (const k of Object.keys(before)) if (k !== NOTE) t.eq(now[k], before[k], `${k} is as it was`);
});

guard('a binder in a newer format shows every page and enables nothing; a Longform project says so and offers “Convert to binder”; no file changes', async (p, h, t) => {
	await mk(p, { 'Future/Future.md': '---\nbinder: 99\ncontents:\n  - One\n---\n', 'Future/One.md': 'one' });
	await until(p, `!!${B}.problem('Future')`, 6000);
	const before = await texts(p);
	await openFor(p, 'Future');
	for (const page of ['book', 'goal', 'labels', 'statuses', 'new-notes', 'calendar']) {
		await showPage(p, page);
		t.ok(/newer version of Binders/.test(await p.ev(`document.querySelector('${D} .binders-bset-locked')?.textContent ?? ''`)), `${page}: one line at the top says why`);
		t.eq(j(await enabled(p)), '[]', `${page}: nothing is enabled`);
	}
	await close(p);
	same(t, before, await texts(p));
	// a Longform project
	await openFor(p, 'Longform demo');
	for (const page of ['book', 'labels', 'calendar']) {
		await showPage(p, page);
		t.eq(await p.ev(`document.querySelector('${D} .binders-bset-locked p')?.textContent ?? ''`), 'Longform keeps this project’s settings in its index note; Binders writes nothing of its own there.', `${page}: the Longform line`);
		t.ok(await p.ev(`!!document.querySelector('${D} [data-binders-key="convert"]')`), `${page}: “Convert to binder” is offered`);
		t.eq(j((await enabled(p)).filter((x) => x !== 'convert')), '[]', `${page}: nothing else is enabled`);
	}
	await close(p);
	same(t, before, await texts(p));
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Future'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
});

test('on a phone the dialog is a list of pages, then a page with a back button; the binder note is opened from Book', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await openView(p, 'The Lighthouse');
		await p.ev(`(() => { app.commands.executeCommandById('binders:open-binder-settings'); return 1; })()`);
		await wait(p, `!!document.querySelector('${D}')`);
		t.ok(await p.ev(`!!document.querySelector('${D} .binders-bset-pages') && !document.querySelector('${D} .binders-bset-pane')?.isConnected`), 'it opens on the list of pages');
		await p.ev(`(() => { document.querySelector('${D} [data-binders-key="page-goal"]').click(); return 1; })()`);
		await wait(p, `document.querySelector('${D} .binders-bset-body')?.dataset.page === 'goal'`);
		t.ok(await p.ev(`!!document.querySelector('${D} .modal-setting-back-button') && !document.querySelector('${D} .binders-bset-pages')?.isConnected`), 'a page has a back button, and the list is away');
		await p.ev(`(() => { document.querySelector('${D} .modal-setting-back-button').click(); return 1; })()`);
		await wait(p, `!!document.querySelector('${D} .binders-bset-pages')?.isConnected`);
		t.ok(true, 'Back returns to the list');
		await p.ev(`(() => { document.querySelector('${D} [data-binders-key="page-book"]').click(); return 1; })()`);
		await wait(p, `!!document.querySelector('${D} [data-binders-key="open-binder-note"]')`);
		t.ok(true, 'Book has “Open binder note” at its foot, on a phone only');
	});
});
