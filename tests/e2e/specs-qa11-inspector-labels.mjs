// QA round 11, the inspector and labels: what the inspector's fields write, to which note, as the selection moves in each
// mode; a label or status renamed, recoloured or removed in settings while it is in use; arranged by label, a card
// dragged to another line and the inspector following it; several notes with different labels; odd text (YAML words,
// punctuation, line breaks) typed into the inspector and read back from disk; the inspector on a phone and a tablet.
// Tests named "qa11 inspector-labels: …", and "BUG: qa11 inspector-labels: …" where a bug is confirmed (they fail until
// fixed). Golden rules 2 and 3: every change is checked against the note's properties and body on disk.
import { PL, VIEW, answer, clickMenu, closeMenus, file, j, menuItems, openView, read, reload, split, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 inspector-labels: ' + name, fn: withTidy(run(fn)) });
const bug = (name, fn) => specs.push({ name: 'BUG: qa11 inspector-labels: ' + name, fn: withTidy(run(fn)) });
const run = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await cleanUp(p); } };

// ---- the vault ----
const L = 'The Lighthouse/', P1 = L + 'Part One/', P2 = L + 'Part Two/';
const PROLOGUE = L + 'Prologue.md', ARRIVAL = P1 + 'Arrival.md', KEEPER = P1 + 'The keeper.md', STORM = P1 + 'Storm warning.md';
const WRECK = P2 + 'The wreck.md', LIGHTS = P2 + 'Lights out.md';
const LEAF = '.workspace-leaf.mod-active';
const CORK = `${LEAF} .binders-view`;
// the lines of a board arranged by label: "No label" is 0, then the eight labels in settings order
const LINE = { Blue: 6 };
const DEFAULTS = `{ labels: [['Red','red'],['Orange','orange'],['Yellow','yellow'],['Green','green'],['Cyan','cyan'],['Blue','blue'],['Purple','purple'],['Pink','pink']].map(([name, color]) => ({ name, color })), statuses: ['Idea','Draft','Revised','Done'], explorerLabels: true, hideBinderNotes: true, orderExplorer: true, openOnClick: true, synopsisProp: 'synopsis', statusProp: 'status', labelProp: 'label', targetProp: 'target' }`;

// ---- helpers ----
const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
const fieldSel = (f) => `${I} [data-field="${f}"]`;
const cardSel = (path) => `${CORK} .binders-card[data-path=${j(path)}]`;
const cardFoot = (path) => `${cardSel(path)} .binders-card-footer`;
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? {})`).then(JSON.parse);
const setFm = (p, path, obj) => p.ev(`app.fileManager.processFrontMatter(${file(path)}, fm => { const o = ${j(obj)}; for (const k in o) { if (o[k] === null) delete fm[k]; else fm[k] = o[k]; } }).then(() => 1)`).then(() => p.sleep(300));
const paneName = (p) => p.ev(`document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent ?? null`);
const onItem = (p, title) => until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === ${j(title)}`, 4000);
const fieldText = (p, f) => p.ev(`document.querySelector(${j(fieldSel(f))})?.textContent ?? null`);
const dotColor = (p) => p.ev(`(() => { const d = document.querySelector(${j(fieldSel('label') + ' .binders-label-dot')}); return d ? getComputedStyle(d).backgroundColor : null; })()`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')].map(n => n.textContent)).filter(Boolean); })()`);
const checked = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.mod-checked') || e.classList.contains('mod-checked')).map(e => e.querySelector('.menu-item-title')?.textContent)`);

/** The inspector in the right sidebar, alone, the way the inspector spec puts it (the contents left out). */
async function side(p) {
	await p.ev(`(async () => {
		const ws = app.workspace;
		for (const t of ['binders-inspector', 'binders-contents']) ws.detachLeavesOfType(t);
		ws.rightSplit.expand();
		const b = ws.getRightLeaf(false); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b);
		const main = ws.getMostRecentLeaf(ws.rootSplit); if (main) ws.setActiveLeaf(main, { focus: true });
	})().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(I)})`);
	await p.sleep(250);
}
/** The binder view on a folder, in a mode (arranged by label when `arrange` is given). */
async function board(p, folder, mode = 'corkboard', arrange = null) {
	await openView(p, folder);
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), mode: ${j(mode)}, options: ${j(arrange ? { arrange } : {})} } }); })().then(() => 1)`);
	await until(p, `!!document.querySelector('${CORK} .binders-card[data-path]') || !!document.querySelector('${LEAF} .binders-lanes')`);
	await p.sleep(400);
}
const clickCard = async (p, path, extra) => { const at = await p.at(cardFoot(path)); if (!at) throw new Error('no card ' + path); await p.click(at.x, at.y, extra); await p.sleep(300); };
/** Clicks one of the inspector's fields (a text starts being edited, a row opens its menu). */
async function field(p, f) {
	await p.ev(`(() => { document.querySelector(${j(fieldSel(f))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	const at = await p.at(fieldSel(f));
	if (!at) throw new Error(`the inspector has no “${f}”`);
	await p.click(at.x, at.y);
	await p.sleep(250);
}
const sharedBody = (p, path) => read(p, path).then((t) => split(t).body);

// ---- settings ----
const TAB = `app.setting.activeTab.containerEl`;
async function openSettings(p) {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `${TAB}.querySelectorAll('.binders-settings-label').length > 0`);
	await p.sleep(200);
}
const closeSettings = (p) => p.ev(`(() => { try { app.setting.close(); } catch {} return 1; })()`).then(() => p.sleep(250));
/** Types a name into a settings row's field and leaves it (as the settings spec does). */
const typeName = (p, kind, i, value) => p.ev(`(() => { const el = ${TAB}.querySelectorAll('.binders-settings-${kind} input[type="text"]')[${i}]; el.focus(); el.value = ${j(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`).then(() => p.sleep(300));
const setColor = (p, i, v) => p.ev(`(() => { const s = ${TAB}.querySelectorAll('.binders-settings-label select[aria-label="Color"]')[${i}]; s.value = ${j(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`).then(() => p.sleep(300));
const deleteRow = (p, i) => p.ev(`(() => { ${TAB}.querySelectorAll('.binders-settings-label')[${i}].querySelector('[aria-label="Delete"]').click(); return 1; })()`).then(() => p.sleep(350));

async function cleanUp(p) {
	await closeMenus(p);
	await p.ev(`(() => { document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`).catch(() => {});
	await p.ev(`(async () => { Object.assign(${PL}.settings, ${DEFAULTS}); await ${PL}.saveSettings(); })().then(() => 1)`).catch(() => {});
	await closeSettings(p).catch(() => {});
	await p.sleep(200);
}

// =====================================================================================================================
// What the inspector shows and writes
// =====================================================================================================================

test('a label changed in settings’ color reaches the inspector’s dot at once, as it reaches the cards', async (p, h, t) => {
	await setFm(p, ARRIVAL, { label: 'blue' });
	await board(p, P1);
	await side(p);
	await clickCard(p, ARRIVAL);
	t.ok(await onItem(p, 'Arrival'), 'the inspector is on Arrival');
	const before = await dotColor(p);
	t.ok(before && before !== 'rgba(0, 0, 0, 0)', 'its label dot has Blue: ' + before);
	await openSettings(p);
	await setColor(p, 5, 'green');
	await closeSettings(p);
	const until1 = await until(p, `(() => { const d = document.querySelector(${j(fieldSel('label') + ' .binders-label-dot')}); return d && getComputedStyle(d).backgroundColor !== ${j(before)}; })()`, 2500);
	t.ok(until1, 'the inspector’s dot is green after Blue was changed to green in settings: ' + (await dotColor(p)));
	t.eq(await fieldText(p, 'label'), 'Blue', 'the name stays Blue');
});

test('a label written by hand in the note, or arriving by sync, shows in the inspector at once, and goes when it goes', async (p, h, t) => {
	await board(p, P1);
	await side(p);
	await clickCard(p, ARRIVAL);
	t.ok(await onItem(p, 'Arrival'), 'the inspector is on Arrival');
	t.eq(await fieldText(p, 'label'), 'No label', 'no label to begin with');
	await setFm(p, ARRIVAL, { label: 'Green' });
	t.ok(await until(p, `document.querySelector(${j(fieldSel('label'))})?.textContent === 'Green'`, 3000), 'a label written outside: the inspector says Green');
	await setFm(p, ARRIVAL, { label: 'green' });
	t.ok(await until(p, `document.querySelector(${j(fieldSel('label'))})?.textContent === 'Green'`, 3000), 'the same label in lower case is still Green, not a new name');
	await setFm(p, ARRIVAL, { label: null });
	t.ok(await until(p, `document.querySelector(${j(fieldSel('label'))})?.textContent === 'No label'`, 3000), 'taken away outside: No label again');
});

test('a label renamed in settings (and its notes changed too) is the name the inspector shows, without reselecting', async (p, h, t) => {
	await setFm(p, LIGHTS, { label: 'Blue' });
	await board(p, P2);
	await side(p);
	await clickCard(p, LIGHTS);
	t.ok(await onItem(p, 'Lights out'), 'the inspector is on Lights out');
	t.eq(await fieldText(p, 'label'), 'Blue', 'it says Blue');
	await openSettings(p);
	await typeName(p, 'labels', 5, 'Sky');
	t.ok(await answer(p, 'Change it'), 'asked whether the one note with Blue takes Sky');
	await closeSettings(p);
	t.ok(await until(p, `(app.metadataCache.getFileCache(${file(LIGHTS)})?.frontmatter?.label ?? null) === 'Sky'`, 4000), 'the note says Sky on disk');
	t.ok(await until(p, `document.querySelector(${j(fieldSel('label'))})?.textContent === 'Sky'`, 3000), 'the inspector says Sky: ' + (await fieldText(p, 'label')));
});

test('a status renamed in settings: the folder note and every note that had it change, and the others don’t', async (p, h, t) => {
	// a folder's status lives in its folder note, made by the inspector's own status menu
	await board(p, P1);
	await side(p);
	await p.ev(`(async () => { const v = ${VIEW}; const f = app.vault.getAbstractFileByPath(${j(P1.slice(0, -1))}); await ${PL}.binders.ensureFolderNote(f); return 1; })().then(() => 1)`);
	await p.sleep(300);
	const note = await p.ev(`(() => { const f = app.vault.getAbstractFileByPath(${j(P1.slice(0, -1))}); return f?.children?.find(c => c.extension === 'md' && c.basename === f.name)?.path ?? null; })()`);
	t.ok(!!note, 'the folder has its folder note: ' + note);
	await setFm(p, note, { status: 'Draft' });
	await setFm(p, KEEPER, { status: 'draft' });
	await setFm(p, WRECK, { status: 'Draft' });
	await openSettings(p);
	await typeName(p, 'status', 1, 'Drafting');
	const asked = await p.ev(`[...document.querySelectorAll('.modal')].map(m => m.textContent).join(' | ')`);
	// (the folder note, The keeper, The wreck and Prologue: four in the binder, Prologue's "draft" in lower case too)
	t.ok(/4 notes have the status “Draft”/.test(asked), 'the question counts the four: ' + asked.slice(0, 200));
	t.ok(await answer(p, 'Change them'), 'answered yes');
	await closeSettings(p);
	const want = { [note]: 'Drafting', [KEEPER]: 'Drafting', [WRECK]: 'Drafting', [PROLOGUE]: 'Drafting', [ARRIVAL]: 'revised', [STORM]: 'idea' };
	for (const [path, s] of Object.entries(want)) t.eq((await fm(p, path)).status, s, `“${path}” has ${s}`);
});

test('a target shared by several notes: Tab out of the field changes none, and a number typed changes all of them', async (p, h, t) => {
	await setFm(p, ARRIVAL, { target: 500 });
	await setFm(p, KEEPER, { target: 1000 });
	await board(p, P1);
	await side(p);
	await clickCard(p, ARRIVAL);
	await clickCard(p, KEEPER, { modifiers: 2 });
	t.ok(await onItem(p, '2 notes selected'), 'two selected: ' + (await paneName(p)));
	t.ok((await fieldText(p, 'target') ?? '').includes('Mixed'), 'their targets are shown as Mixed: ' + (await fieldText(p, 'target')));
	await field(p, 'target');
	await p.key('Tab');
	await p.sleep(400);
	t.eq((await fm(p, ARRIVAL)).target, 500, 'Arrival keeps 500 after a Tab through the empty field');
	t.eq((await fm(p, KEEPER)).target, 1000, 'The keeper keeps 1000 after a Tab through the empty field');
	await field(p, 'target');
	await p.key('a', 'ctrl');
	await p.type('800');
	await p.key('Enter');
	await p.sleep(400);
	t.eq((await fm(p, ARRIVAL)).target, 800, 'a number typed: Arrival is 800');
	t.eq((await fm(p, KEEPER)).target, 800, 'and The keeper too');
});

test('a synopsis full of YAML’s punctuation is written as typed, read back the same, and the body is untouched', async (p, h, t) => {
	const typed = `"Mara" arrives: 'the keeper' # not a comment - [draft] {x} & *y* \\ %, ~ ! | > @ \`code\` ? yes`;
	const before = await sharedBody(p, ARRIVAL);
	await board(p, P1);
	await side(p);
	await clickCard(p, ARRIVAL);
	await field(p, 'synopsis');
	await p.key('a', 'ctrl');
	await p.type(typed);
	await p.key('Enter', 'ctrl');
	await p.sleep(400);
	t.eq((await fm(p, ARRIVAL)).synopsis, typed, 'the note’s synopsis is exactly what was typed');
	t.eq(await sharedBody(p, ARRIVAL), before, 'the body is byte for byte what it was');
	t.ok((await p.ev(`document.querySelector(${j(CORK + ' .binders-card[data-path="' + ARRIVAL + '"] .binders-card-synopsis')})?.textContent ?? ''`)).includes('“Mara” arrives'), 'the card shows it');
});

test('a synopsis with a line break is kept as two lines in the note, and both lines reach the card', async (p, h, t) => {
	await board(p, P1);
	await side(p);
	await clickCard(p, STORM);
	await field(p, 'synopsis');
	await p.key('a', 'ctrl');
	await p.type('First line\nsecond line');
	await p.key('Enter', 'ctrl');
	await p.sleep(400);
	t.eq((await fm(p, STORM)).synopsis, 'First line\nsecond line', 'the note has the two lines');
	t.ok((await p.ev(`document.querySelector(${j(CORK + ' .binders-card[data-path="' + STORM + '"]')})?.textContent ?? ''`)).includes('second line'), 'the card shows the second line');
});

test('statuses that YAML would read as something else (null, a date, yes, a tag, a colon and a comma) are written and shown as text', async (p, h, t) => {
	await board(p, P1);
	await side(p);
	await clickCard(p, ARRIVAL);
	for (const s of ['null', '2026-10-01', 'yes', '#draft', 'Draft: pass 2, final']) {
		await field(p, 'status');
		await clickMenu(p, 'New status...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.type(s);
		await p.key('Enter');
		await p.sleep(400);
		t.eq((await fm(p, ARRIVAL)).status, s, `written as “${s}”`);
		t.eq(await fieldText(p, 'status'), s, `and the inspector says “${s}”`);
	}
});

test('several notes with different labels: the inspector says Mixed, and a label picked from it goes to all of them; No label takes it from all', async (p, h, t) => {
	await setFm(p, ARRIVAL, { label: 'Red' });
	await setFm(p, KEEPER, { label: null });
	await setFm(p, STORM, { label: 'Blue' });
	await board(p, P1);
	await side(p);
	await clickCard(p, ARRIVAL);
	await clickCard(p, KEEPER, { modifiers: 2 });
	await clickCard(p, STORM, { modifiers: 2 });
	t.ok(await onItem(p, '3 notes selected'), 'three selected: ' + (await paneName(p)));
	t.eq(await fieldText(p, 'label'), 'Mixed', 'their labels are Mixed');
	await field(p, 'label');
	t.ok((await menuItems(p)).includes('No label'), 'Mixed offers No label, as a status does');
	await clickMenu(p, 'Green');
	await p.sleep(400);
	for (const path of [ARRIVAL, KEEPER, STORM]) t.eq((await fm(p, path)).label, 'Green', `${path.split('/').pop()} is Green`);
	t.eq(await fieldText(p, 'label'), 'Green', 'and the inspector says Green for all');
	await field(p, 'label');
	await clickMenu(p, 'No label');
	await p.sleep(400);
	for (const path of [ARRIVAL, KEEPER, STORM]) t.eq((await fm(p, path)).label ?? null, null, `${path.split('/').pop()} has no label`);
});

test('arranged by label: a card dragged to another line takes its label, and the inspector says so without reselecting', async (p, h, t) => {
	await board(p, P1, 'corkboard', 'label');
	await until(p, `!!document.querySelector('${LEAF} .binders-lanes > .binders-lane[data-lane="${LINE.Blue}"]')`);
	await p.sleep(300);
	await side(p);
	await clickCard(p, ARRIVAL);
	t.ok(await onItem(p, 'Arrival'), 'the inspector is on Arrival');
	t.eq(await fieldText(p, 'label'), 'No label', 'it starts with no label');
	const from = await p.at(cardSel(ARRIVAL)), line = await p.at(`${LEAF} .binders-lanes > .binders-lane[data-lane="${LINE.Blue}"]`);
	await p.move(from.x, from.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
	await p.move(from.x, line.y, 14, { buttons: 1 });
	await p.sleep(200);
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x, y: line.y, button: 'left', clickCount: 1 });
	t.ok(await until(p, `(app.metadataCache.getFileCache(${file(ARRIVAL)})?.frontmatter?.label ?? null) === 'Blue'`, 4000), 'the note now says Blue');
	t.ok(await until(p, `document.querySelector(${j(fieldSel('label'))})?.textContent === 'Blue'`, 3000), 'the inspector says Blue: ' + (await fieldText(p, 'label')));
});

test('a label deleted from settings while notes have it: they keep its name in the inspector and in the menu, and No label still takes it away', async (p, h, t) => {
	await setFm(p, KEEPER, { label: 'Blue' });
	await board(p, P1);
	await side(p);
	await clickCard(p, KEEPER);
	t.ok(await onItem(p, 'The keeper'), 'the inspector is on The keeper');
	await openSettings(p);
	await deleteRow(p, 5);
	await closeSettings(p);
	t.eq(await p.ev(`${PL}.settings.labels.length`), 7, 'Blue is gone from the list');
	t.eq(await fieldText(p, 'label'), 'Blue', 'the inspector still says Blue, as written');
	await field(p, 'label');
	t.ok((await checked(p)).includes('Blue'), 'the menu ticks Blue (it is in use)');
	await closeMenus(p);
	await field(p, 'label');
	await clickMenu(p, 'No label');
	await p.sleep(400);
	t.eq((await fm(p, KEEPER)).label ?? null, null, 'No label took it off the note');
	t.eq(await fieldText(p, 'label'), 'No label', 'the inspector says No label');
});

// =====================================================================================================================
// A phone and a tablet
// =====================================================================================================================

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const itemAt = (p, title) => p.ev(`(() => { const all = [...document.querySelectorAll('.menu .menu-item')].filter(e => (e.querySelector('.menu-item-title')?.textContent ?? '') === ${j(title)}); const it = all[all.length - 1]; if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
async function onDevice(p, width, height, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await closeMenus(p);
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}

for (const [device, width, height] of [['a phone', 390, 844], ['a tablet', 820, 1180]]) {
	test(`${device}: the inspector’s status and label menus, by touch, write the note and the pane shows the choice`, async (p, h, t) => {
		await onDevice(p, width, height, async () => {
			await p.ev(`(() => { for (const t of ['binders-inspector', 'binders-contents']) app.workspace.detachLeavesOfType(t); return 1; })()`);
			await openView(p, P1);
			await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
			await until(p, `!!document.querySelector('${CORK} .binders-card[data-path]')`);
			await p.sleep(300);
			const at = await p.at(cardFoot(ARRIVAL));
			t.ok(!!at, 'the card is on screen');
			await tap(p, at.x, at.y);
			await p.ev(`app.commands.executeCommandById('binders:show-inspector'); 1`);
			t.ok(await onItem(p, 'Arrival'), device + ': the inspector shows Arrival: ' + (await paneName(p)));
			const st = await p.at(fieldSel('status'));
			t.ok(!!st, device + ': the status row is on screen');
			await tap(p, st.x, st.y);
			await p.sleep(300);
			const pick = await itemAt(p, 'Revised');
			t.ok(!!pick, device + ': the status menu offers Revised: ' + (await menuItems(p)).join(', '));
			if (pick) await tap(p, pick.x, pick.y);
			await p.sleep(400);
			t.eq((await fm(p, ARRIVAL)).status, 'Revised', device + ': the note says Revised');
			const lb = await p.at(fieldSel('label'));
			if (lb) await tap(p, lb.x, lb.y);
			await p.sleep(300);
			const green = await itemAt(p, 'Green');
			t.ok(!!green, device + ': the label menu offers Green');
			if (green) await tap(p, green.x, green.y);
			await p.sleep(400);
			t.eq((await fm(p, ARRIVAL)).label, 'Green', device + ': the note says Green');
			t.eq(await fieldText(p, 'label'), 'Green', device + ': the pane says Green: ' + (await paneName(p)));
		});
	});
}

// =====================================================================================================================
// Odd labels and statuses, in the menus
// =====================================================================================================================

test('a status typed in “New status...” with spaces around it is written trimmed, and the menu ticks it', async (p, h, t) => {
	await board(p, P1);
	await side(p);
	await clickCard(p, ARRIVAL);
	await field(p, 'status');
	await clickMenu(p, 'New status...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.type('  On hold  ');
	await p.key('Enter');
	await p.sleep(400);
	t.eq((await fm(p, ARRIVAL)).status, 'On hold', 'written trimmed');
	await field(p, 'status');
	t.ok((await checked(p)).includes('On hold'), 'and the menu ticks it');
});
