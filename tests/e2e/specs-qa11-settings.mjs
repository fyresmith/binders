// QA round 11, the settings tab: every control of Binders' settings, changed through the tab as a writer does (clicks,
// typing, Enter, Tab, Escape), with the behaviour checked where the setting is used, the saved file read back, and the
// plugin disabled and enabled ("a restart") with the value still there. Tests named "qa11 settings: …" pass;
// "BUG: …" are confirmed bugs (they fail now and stay as the regression); "NIT: …" are small things.
import { PL, VIEW, answer, j, read, split, until, withTidy, openView } from './view-helpers.mjs';

export const specs = [];
const TAB = 'app.setting.activeTab.containerEl';
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const EXPLEAF = '.workspace-leaf-content[data-type="file-explorer"]';
const L = 'The Lighthouse/';
const KEEPER = L + 'Part One/The keeper.md', ARRIVAL = L + 'Part One/Arrival.md', PROLOGUE = L + 'Prologue.md';
// the explorer's rows under The Lighthouse, as specs-explorer.mjs has them (with binder order, and without it)
const IN_ORDER = [
	'The Lighthouse/Prologue.md',
	'The Lighthouse/Part One', 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part One/Storm warning.md',
	'The Lighthouse/Part Two', 'The Lighthouse/Part Two/The wreck.md', 'The Lighthouse/Part Two/Lights out.md',
	'The Lighthouse/Epilogue.md',
];
const ALPHABETICAL = [
	'The Lighthouse/Part One', 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Storm warning.md', 'The Lighthouse/Part One/The keeper.md',
	'The Lighthouse/Part Two', 'The Lighthouse/Part Two/Lights out.md', 'The Lighthouse/Part Two/The wreck.md',
	'The Lighthouse/Epilogue.md', 'The Lighthouse/Prologue.md', 'The Lighthouse/The Lighthouse.md',
];
const DATA = `app.vault.configDir + '/plugins/binders/data.json'`;

/** Each check runs even after one fails (a test is a finding list): the test fails once, naming them all. */
const test = (name, fn) => specs.push({ name: 'qa11 settings: ' + name, fn: withTidy(async (p, h, t) => {
	const bad = [];
	const s = {
		ok: (v, m) => { if (!v) bad.push(m); },
		eq: (a, b, m) => { if (a !== b) bad.push(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
	};
	try { await fn(p, h, s); } catch (e) { bad.push('stopped: ' + (e.message || e).toString().slice(0, 300)); }
	if (bad.length) t.ok(false, bad.join(' | '));
}) });

// ---- the tab, as a writer reaches it ----
// In Obsidian 1.13 the settings open in a window of their own, which the driver's mouse and keys don't reach: so a
// switch or button is clicked with a click() on its element, and a field is typed into by setting its value and
// sending the input and key events the field listens for (as specs.mjs does). The events are the ones a writer's are.

const SETTINGS_OPEN = `!!app.setting?.activeTab?.containerEl?.isConnected`;
const openSettings = async (p) => {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `${TAB}.querySelectorAll('.setting-item').length > 5`, 4000);
	await p.sleep(300);
};
/** Open, as the tab is when it's shown: a test that revealed the explorer or a view may have closed it. */
const ensureSettings = async (p) => { if (!(await p.ev(SETTINGS_OPEN))) await openSettings(p); };
const closeSettings = (p) => p.ev(`(() => { try { app.setting.close(); } catch {} return 1; })()`).then(() => p.sleep(300));
/** The tab's row whose name is this (a group's heading is a row too). */
const ROW = (name) => `[...${TAB}.querySelectorAll('.setting-item')].find(r => r.querySelector('.setting-item-name')?.textContent === ${j(name)})`;
const CHECK = (name) => `${ROW(name)}?.querySelector('.checkbox-container')`;
const FIELD = (name) => `${ROW(name)}?.querySelector('input[type="text"], textarea')`;
/** The documents a notice or a dialog may be in: the main window, and the settings' window. */
const DOCS = `[...new Set([document, app.setting?.activeTab?.containerEl?.ownerDocument].filter(Boolean))]`;
const notices = (p) => p.ev(`${DOCS}.flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join(' | ')`);
/** A click as a writer's: the element's own click, which Obsidian's switch and buttons listen for. */
async function tap(p, el) {
	await ensureSettings(p);
	const ok = await p.ev(`(() => { const e = ${el}; if (!e) return false; e.click(); return true; })()`);
	if (!ok) throw new Error('nothing to click: ' + el.slice(0, 140));
	await p.sleep(300);
}
/** A key, as it reaches the field: Enter and Escape are sent to it, Tab leaves it. */
const KEY = (k) => ({ Enter: 'Enter', Escape: 'Escape' })[k];
/** Types into a field the way a writer does: its text selected, typed, then Enter, Tab or Escape. */
async function typeInto(p, el, text, end = 'Enter') {
	await ensureSettings(p);
	const ok = await p.ev(`(() => { const i = ${el}; if (!i) return false; i.focus(); i.select(); return true; })()`);
	if (!ok) throw new Error('no field: ' + el.slice(0, 140));
	await p.ev(`(() => { const i = ${el}; const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, ${j(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await p.sleep(120);
	if (KEY(end)) await p.ev(`(() => { const i = ${el}; i.dispatchEvent(new KeyboardEvent('keydown', { key: ${j(end)}, bubbles: true, cancelable: true })); return 1; })()`);
	else if (end === 'Tab') await p.ev(`(() => { ${el}.blur(); return 1; })()`);
	await p.sleep(450);
}
const checked = (p, name) => p.ev(`(() => { const c = ${CHECK(name)}; return c ? c.classList.contains('is-enabled') : null; })()`);
const disabled = (p, name) => p.ev(`(() => { const r = ${ROW(name)}; const c = r?.querySelector('.checkbox-container'); const i = r?.querySelector('input[type="checkbox"]'); return !!(i?.disabled || c?.classList.contains('is-disabled') || r?.classList.contains('is-disabled')); })()`);
/** Sets a switch by clicking it, when it isn't already as asked. */
async function setSwitch(p, name, on) {
	await ensureSettings(p);
	if ((await checked(p, name)) !== on) await tap(p, CHECK(name));
	await until(p, `${ROW(name)}?.querySelector('.checkbox-container')?.classList.contains('is-enabled') === ${on}`, 2000);
}
const field = (p, name) => p.ev(`${FIELD(name)}?.value ?? null`);
const dataFile = (p) => p.ev(`app.vault.adapter.read(${DATA}).then(t => JSON.parse(t), () => null)`);
/** The saved setting, once it's on disk (saves are written in the background). */
async function saved(p, key, want, ms = 3000) {
	let v;
	for (let i = 0; i < ms / 100; i++) { v = (await dataFile(p))?.[key]; if (j(v) === j(want)) return v; await p.sleep(100); }
	return v;
}
/** The plugin disabled and enabled, as a restart does; the explorer patch is back when it's done. */
async function restart(p) {
	await p.ev(`(async () => { await app.plugins.disablePlugin('binders'); await app.plugins.enablePlugin('binders'); })().then(() => 1)`);
	await until(p, `${PL}?.explorer?.status === 'patched' && !!${PL}?.settings`, 8000);
	await p.sleep(400);
}
/** Focus mode on the note, by its command, once it's shown; and out of it, only if it is on (the command toggles). */
const enterFocus = async (p, h, note) => {
	await h.open(note);
	await p.sleep(400);
	await h.run('focus');
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`, 4000);
	await p.sleep(500);
};
const leaveFocus = async (p, h) => { if (await p.ev(`document.body.classList.contains('binders-focus')`)) { await h.run('focus'); await p.sleep(400); } };
const pluginSetting = (p, key) => p.ev(`${PL}.settings[${j(key)}]`);
const closeViews = (p) => p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); app.workspace.getLeavesOfType('binders-inspector').forEach(l => l.detach()); app.workspace.getLeavesOfType('binders-contents').forEach(l => l.detach()); await new Promise(r => setTimeout(r, 200)); return 1; })().then(() => 1)`);

// ---- the file explorer, as a writer sees it ----

async function rows(p, under = 'The Lighthouse') {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); for (const f of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two']) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(350);
	return p.ev(`[...document.querySelectorAll('${EXPLEAF} .tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${j(under + '/')}))`);
}
const same = (t, a, b, m) => t.eq(j(a), j(b), m);

// ---- the first test: what a fresh vault shows ----

const DEFAULTS_SWITCHES = {
	'Order binders in the file explorer': true, 'Open binders from the file explorer': true, 'Hide binder and folder notes': true,
	'Show label colors in the file explorer': true, 'Start a paragraph with a tab': true, 'Indent paragraphs': false,
	'Show the inspector and contents with a binder': true, 'Count words as the exported book does': true,
	'Typewriter scrolling': true, 'Show the scenes before and after': false, 'Show where you are': false, 'Show word counts': false,
	'Dim other paragraphs': true, 'Dim the background': true, 'Enter fullscreen': false,
};
const DEFAULT_TEXT = { 'Exports folder': 'Exports', 'Your name': '', 'Styles folder': 'Export styles', 'Words to write today': '', 'Synopsis': 'synopsis', 'Status': 'status', 'Label': 'label', 'Target': 'target', 'Notes': 'notes' };
const GROUPS = ['File explorer', 'Paragraphs', 'Sidebar', 'Word counts', 'Labels', 'Statuses', 'Focus mode', 'Export', 'Property names'];

test('a fresh vault: every control shows the default the docs give, in the order the docs list them', async (p, h, t) => {
	await openSettings(p);
	try {
		const groups = await p.ev(`[...${TAB}.querySelectorAll('.setting-item.setting-item-heading .setting-item-name')].map(e => e.textContent)`);
		same(t, groups, GROUPS, 'the headings, in the order docs/settings.md has them');
		for (const [name, on] of Object.entries(DEFAULTS_SWITCHES)) {
			const v = await checked(p, name);
			t.eq(v, on, `“${name}” is ${on ? 'on' : 'off'} on a fresh vault`);
		}
		for (const [name, want] of Object.entries(DEFAULT_TEXT)) {
			const v = await field(p, name);
			t.eq(v, want, `“${name}” holds its default`);
		}
		t.eq(await p.ev(`${FIELD('Words to write today')}.placeholder`), 'None', 'the goal says None');
		t.eq(await p.ev(`${FIELD('Exports folder')}.placeholder`), 'Exports', 'the Exports folder placeholder is the default');
		t.eq(await p.ev(`${TAB}.querySelector('.binders-settings-contact textarea').value`), '', 'contact details are empty');
		const names = await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-label input[type="text"]')].map(i => i.value)`);
		same(t, names, ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'], 'the eight labels, in order');
		const sts = await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-status input[type="text"]')].map(i => i.value)`);
		same(t, sts, ['Idea', 'Draft', 'Revised', 'Done'], 'the four statuses, in order');
		t.ok(await disabled(p, 'Remembered places') || await p.ev(`${TAB}.querySelector('.binders-settings-places button').disabled`), '“Ask again” is off until an export is remembered');
		t.ok(!(await disabled(p, 'Hide binder and folder notes')), 'Hide binder and folder notes is on the tab, and usable, with order on');
	} finally { await closeSettings(p); }
});

test('the tab’s words: sentence case, no “please”, a full stop at each sentence’s end, and no shouting', async (p, h, t) => {
	await openSettings(p);
	try {
		const texts = await p.ev(`(() => {
			const out = [];
			for (const r of ${TAB}.querySelectorAll('.setting-item')) {
				const n = r.querySelector('.setting-item-name')?.textContent, d = r.querySelector('.setting-item-description')?.textContent;
				if (n) out.push(['name', n]);
				if (d) out.push(['desc', d]);
			}
			for (const b of ${TAB}.querySelectorAll('button, [aria-label]')) { const a = b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent; if (a && a.trim()) out.push(['label', a.trim()]); }
			for (const i of ${TAB}.querySelectorAll('input[placeholder], textarea[placeholder]')) out.push(['placeholder', i.placeholder]);
			return out;
		})()`);
		// a word that starts a sentence, or a file path, or one of Obsidian's own names, may be capitalized
		const KEPT = new Set(['Obsidian', 'Sync', 'Custom', 'Manuscript', 'Ebook', 'Paperback', 'Scrivener', 'Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Label', 'Status', 'Target', 'Notes', 'Synopsis', 'Export', 'Exports', 'Idea', 'Draft', 'Revised', 'Done', 'None', 'Books/Exports']);
		const bad = [];
		for (const [kind, s] of texts) {
			if (/please/i.test(s)) bad.push(`${kind} “${s}” says please`);
			if (/!/.test(s) && kind !== 'placeholder') bad.push(`${kind} “${s}” has an exclamation mark`);
			if (kind === 'desc' && !/[.)”"]$/.test(s.trim())) bad.push(`desc “${s.slice(-30)}” does not end a sentence`);
			if (kind === 'name' || kind === 'label' || kind === 'desc') {
				const words = s.split(/\s+/);
				for (let i = 1; i < words.length; i++) {
					const w = words[i], before = words[i - 1];
					if (/^[A-Z]/.test(w) && !/[.!?:]$/.test(before) && !/^[“"]/.test(w) && !w.includes('/') && !KEPT.has(w.replace(/[.,;:’”"]+$/, '').replace(/[’']s$/, ''))) { bad.push(`${kind} “${s.slice(0, 70)}” capitalizes “${w}”`); break; }
				}
			}
		}
		t.ok(bad.length === 0, `${texts.length} texts read; ${bad.length ? bad.slice(0, 8).join(' ; ') : 'all sentence case'}`);
	} finally { await closeSettings(p); }
});

// ---- the file explorer ----

test('order binders in the file explorer: off shows the explorer by name and greys out “Hide binder and folder notes”; on again restores the order; both survive a restart', async (p, h, t) => {
	same(t, (await rows(p)).filter(x => x !== 'The Lighthouse'), IN_ORDER, 'the binder in its own order to begin with');
	await openSettings(p);
	try {
		await setSwitch(p, 'Order binders in the file explorer', false);
		t.eq(await disabled(p, 'Hide binder and folder notes'), true, 'with order off, “Hide binder and folder notes” is greyed out');
		t.eq(await saved(p, 'orderExplorer', false), false, 'saved to data.json');
		await closeSettings(p);
		same(t, (await rows(p)).filter(x => x !== 'The Lighthouse'), ALPHABETICAL, 'the explorer by name, at once');
		await restart(p);
		t.eq(await pluginSetting(p, 'orderExplorer'), false, 'after a restart the setting is still off');
		same(t, (await rows(p)).filter(x => x !== 'The Lighthouse'), ALPHABETICAL, 'and the explorer is still by name after a restart');
		await openSettings(p);
		await setSwitch(p, 'Order binders in the file explorer', true);
		t.eq(await disabled(p, 'Hide binder and folder notes'), false, '“Hide binder and folder notes” is usable again');
		await closeSettings(p);
		same(t, (await rows(p)).filter(x => x !== 'The Lighthouse'), IN_ORDER, 'the binder order is back at once');
		await restart(p);
		same(t, (await rows(p)).filter(x => x !== 'The Lighthouse'), IN_ORDER, 'and after a restart');
	} finally { await closeSettings(p); }
});

test('hide binder and folder notes: off lists The Lighthouse’s own note in the explorer, on hides it again; after a restart too', async (p, h, t) => {
	const own = L + 'The Lighthouse.md';
	await openSettings(p);
	try {
		t.ok(!(await rows(p)).includes(own), 'hidden by default');
		await setSwitch(p, 'Hide binder and folder notes', false);
		await closeSettings(p);
		t.ok((await rows(p)).includes(own), 'off: the binder’s own note is listed, at once');
		await restart(p);
		t.ok((await rows(p)).includes(own), 'off after a restart: still listed');
		await openSettings(p);
		t.eq(await pluginSetting(p, 'hideBinderNotes'), false, 'the setting kept its value through the restart');
		await setSwitch(p, 'Hide binder and folder notes', true);
		await closeSettings(p);
		t.ok(!(await rows(p)).includes(own), 'on again: hidden at once');
	} finally { await closeSettings(p); }
});

test('open binders from the file explorer: off, a click on a binder opens nothing; on, it opens the binder view; both after a restart', async (p, h, t) => {
	const click = async () => {
		const at = await p.ev(`(() => { const e = document.querySelector('${EXPLEAF} .tree-item-self[data-path="The Lighthouse"]'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
		if (!at) throw new Error('the binder is not in the explorer');
		await p.click(at.x, at.y);
		await p.sleep(700);
		return p.ev(`app.workspace.getLeavesOfType('binders-view').length`);
	};
	await rows(p);
	await closeViews(p);
	await openSettings(p);
	await setSwitch(p, 'Open binders from the file explorer', false);
	await closeSettings(p);
	t.eq(await click(), 0, 'off: a click on the binder in the explorer opens no binder view');
	await restart(p);
	await rows(p);
	t.eq(await click(), 0, 'off after a restart: still nothing opens');
	await openSettings(p);
	await setSwitch(p, 'Open binders from the file explorer', true);
	await closeSettings(p);
	await closeViews(p);
	t.ok((await click()) >= 1, 'on: the same click opens the binder view');
	await closeViews(p);
});

test('show label colors in the file explorer: off takes the dots away at once and after a restart, on puts them back', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(PROLOGUE)}), fm => { fm.label = 'Red'; }).then(() => 1)`);
	await rows(p);
	await until(p, `document.querySelectorAll('${EXPLEAF} .binders-explorer-label').length > 0`, 3000);
	const dots = () => p.ev(`document.querySelectorAll('${EXPLEAF} .binders-explorer-label').length`);
	const before = await dots();
	t.ok(before > 0, `a labeled note has its dot to begin with (${before})`);
	await openSettings(p);
	await setSwitch(p, 'Show label colors in the file explorer', false);
	await closeSettings(p);
	t.eq(await dots(), 0, 'off: no dots, at once');
	await restart(p);
	await rows(p);
	t.eq(await dots(), 0, 'off after a restart: no dots');
	await openSettings(p);
	await setSwitch(p, 'Show label colors in the file explorer', true);
	await closeSettings(p);
	await until(p, `document.querySelectorAll('${EXPLEAF} .binders-explorer-label').length > 0`, 3000);
	t.eq(await dots(), before, 'on: the dots are back, as many as there were');
});

// ---- the sidebar, paragraphs and word counts: the switches save, and the first two change what they say ----

test('show the inspector and contents with a binder: off, opening a binder adds neither; on, it adds both; after a restart too', async (p, h, t) => {
	const tabs = () => p.ev(`({ inspector: app.workspace.getLeavesOfType('binders-inspector').length, contents: app.workspace.getLeavesOfType('binders-contents').length })`);
	await openSettings(p);
	await setSwitch(p, 'Show the inspector and contents with a binder', false);
	await closeSettings(p);
	await closeViews(p);
	await openView(p, 'The Lighthouse');
	await p.sleep(600);
	const off = await tabs();
	t.eq(j(off), j({ inspector: 0, contents: 0 }), 'off: a binder opens without the inspector or contents');
	await restart(p);
	await closeViews(p);
	await openView(p, 'The Lighthouse');
	await p.sleep(600);
	t.eq(j(await tabs()), j({ inspector: 0, contents: 0 }), 'off after a restart: still neither');
	await openSettings(p);
	await setSwitch(p, 'Show the inspector and contents with a binder', true);
	await closeSettings(p);
	await closeViews(p);
	await openView(p, 'The Lighthouse');
	await until(p, `app.workspace.getLeavesOfType('binders-inspector').length > 0 && app.workspace.getLeavesOfType('binders-contents').length > 0`, 4000);
	t.eq(j(await tabs()), j({ inspector: 1, contents: 1 }), 'on: the inspector and the contents are put beside it');
});

test('the paragraph switches save, and are on disk after a restart, as the tab shows them', async (p, h, t) => {
	await openSettings(p);
	try {
		await setSwitch(p, 'Start a paragraph with a tab', false);
		await setSwitch(p, 'Indent paragraphs', true);
		t.eq(await saved(p, 'tabParagraphs', false), false, 'Start a paragraph with a tab: off, saved');
		t.eq(await saved(p, 'indentParagraphs', true), true, 'Indent paragraphs: on, saved');
	} finally { await closeSettings(p); }
	await restart(p);
	await openSettings(p);
	try {
		t.eq(await checked(p, 'Start a paragraph with a tab'), false, 'after a restart: paragraphs with a tab are off');
		t.eq(await checked(p, 'Indent paragraphs'), true, 'after a restart: indent is on');
		await setSwitch(p, 'Start a paragraph with a tab', true);
		await setSwitch(p, 'Indent paragraphs', false);
		t.eq(await saved(p, 'indentParagraphs', false), false, 'and back: indent off, saved');
	} finally { await closeSettings(p); }
});

test('BUG: “Count words as the exported book does”: turned off in the tab, it stays on: nothing is saved, and it is on again after a restart', async (p, h, t) => {
	await openSettings(p);
	try {
		await setSwitch(p, 'Count words as the exported book does', false);
		t.eq(await checked(p, 'Count words as the exported book does'), false, 'the switch shows off');
		t.eq(await saved(p, 'bookWords', false), false, 'and the setting is saved as off');
		t.eq(await pluginSetting(p, 'bookWords'), false, 'the plugin has it off');
	} finally { await closeSettings(p); }
	await restart(p);
	await openSettings(p);
	try {
		t.eq(await checked(p, 'Count words as the exported book does'), false, 'after a restart, the switch is off as it was left');
	} finally { await closeSettings(p); }
	await restart(p);
	await openSettings(p);
	try { await setSwitch(p, 'Count words as the exported book does', true); } finally { await closeSettings(p); }
});

// ---- focus mode: each switch changes an open focus session at once ----

test('focus mode’s switches change a focus session that is open, at once, and survive a restart', async (p, h, t) => {
	await enterFocus(p, h, KEEPER);
	const leaf = (cls) => p.ev(`!!document.querySelector('.binders-focus-leaf.${cls}')`);
	const body = (cls) => p.ev(`document.body.classList.contains('${cls}')`);
	try {
		t.eq(await body('binders-focus-dark'), true, 'focus mode: dim the background is on by default');
		t.eq(await leaf('has-numbers'), false, 'focus mode: no word counts by default');
		await openSettings(p);
		t.ok(await p.ev(SETTINGS_OPEN), 'the settings open while focus mode is on');
		await setSwitch(p, 'Show word counts', true);
		await setSwitch(p, 'Show where you are', true);
		await setSwitch(p, 'Dim the background', false);
		await setSwitch(p, 'Dim other paragraphs', false);
		await setSwitch(p, 'Typewriter scrolling', false);
		await closeSettings(p);
		await p.sleep(300);
		t.eq(await leaf('has-numbers'), true, 'Show word counts on: the corner shows, at once');
		t.eq(await leaf('has-place'), true, 'Show where you are on: the place shows, at once');
		t.eq(await body('binders-focus-dark'), false, 'Dim the background off: the page is the theme’s, at once');
		t.eq(await body('binders-focus-dim'), false, 'Dim other paragraphs off: at once');
		t.eq(await p.ev(`!document.querySelector('.binders-focus-leaf.is-typewriter')`), true, 'Typewriter scrolling off: at once');
		await restart(p);
		t.eq(await pluginSetting(p, 'focusNumbers'), true, 'after a restart: Show word counts is still on');
		t.eq(await pluginSetting(p, 'focusTypewriter'), false, 'after a restart: typewriter scrolling is still off');
		await enterFocus(p, h, KEEPER);
		t.eq(await leaf('has-numbers'), true, 'after a restart, in focus mode again: the corner is still shown');
		await openSettings(p);
		t.eq(await checked(p, 'Show word counts'), true, 'and the tab shows it');
		await setSwitch(p, 'Show word counts', false);
		await setSwitch(p, 'Show where you are', false);
		await setSwitch(p, 'Dim the background', true);
		await setSwitch(p, 'Dim other paragraphs', true);
		await setSwitch(p, 'Typewriter scrolling', true);
		await closeSettings(p);
		t.eq(await leaf('has-numbers'), false, 'and back: the corner goes at once');
		t.eq(await body('binders-focus-dark'), true, 'and the page is charcoal again');
	} finally {
		await closeSettings(p);
		await leaveFocus(p, h);
	}
});

// ---- the goal ----

test('words to write today: “1,500” is kept and shows in focus mode; words, and a negative, are refused and put back; empty is none', async (p, h, t) => {
	await enterFocus(p, h, KEEPER);
	try {
		await openSettings(p);
		await setSwitch(p, 'Show word counts', true);
		const goal = 'Words to write today';
		await typeInto(p, FIELD(goal), '1,500');
		t.eq(await saved(p, 'focusGoal', 1500), 1500, '“1,500” is saved as 1500');
		t.eq(await field(p, goal), '1500', 'and the field shows 1500');
		await closeSettings(p);
		await p.sleep(300);
		const corner = await p.ev(`document.querySelector('.binders-focus-session')?.textContent ?? ''`);
		t.ok(/1[,.  ]?500 today/.test(corner), `focus mode shows the goal: “${corner}”`);
		await openSettings(p);
		await typeInto(p, FIELD(goal), 'lots');
		t.eq(await pluginSetting(p, 'focusGoal'), 1500, '“lots” doesn’t change the goal');
		t.ok(/whole number/.test(await notices(p)), `and says a goal is a whole number: “${await notices(p)}”`);
		t.eq(await field(p, goal), '1500', 'and the field goes back to 1500');
		await typeInto(p, FIELD(goal), '-40');
		t.eq(await pluginSetting(p, 'focusGoal'), 1500, '“-40” is refused too');
		await typeInto(p, FIELD(goal), '');
		t.eq(await saved(p, 'focusGoal', 0), 0, 'empty is no goal');
		t.eq(await field(p, goal), '', 'and the field shows the placeholder again');
		await restart(p);
		await openSettings(p);
		t.eq(await field(p, goal), '', 'after a restart: still none');
		await typeInto(p, FIELD(goal), '750');
		await closeSettings(p);
		await restart(p);
		await openSettings(p);
		t.eq(await field(p, goal), '750', 'a goal of 750 is still there after a restart');
		await typeInto(p, FIELD(goal), '');
	} finally {
		await closeSettings(p);
		await leaveFocus(p, h);
	}
});

test('NIT: words to write today: a decimal point is taken out, so “1.5” becomes a goal of 15 words', async (p, h, t) => {
	await openSettings(p);
	try {
		await typeInto(p, FIELD('Words to write today'), '1.5');
		const got = await pluginSetting(p, 'focusGoal');
		t.ok(got !== 15, `“1.5” is refused, or read as one number, not made into ${got} words (the field now says “${await field(p, 'Words to write today')}”)`);
	} finally { await closeSettings(p); }
});

// ---- labels ----

test('a label renamed in the tab asks about the notes that have it: “Change it” changes them on disk, a duplicate name is refused, Escape puts a name back and keeps the tab', async (p, h, t) => {
	const label = (i) => `${TAB}.querySelectorAll('.binders-settings-label input[type="text"]')[${i}]`;
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(KEEPER)}), fm => { fm.label = 'Red'; }).then(() => 1)`);
	await p.sleep(300);
	await openSettings(p);
	try {
		await typeInto(p, label(0), 'Crimson');
		t.ok(await until(p, `${DOCS}.some(d => [...d.querySelectorAll('.modal')].some(m => /Rename the label/.test(m.textContent)))`, 3000), 'renaming a label that notes have asks about them');
		await answer(p, 'Change it');
		await p.sleep(500);
		const fm = split(await read(p, KEEPER)).yaml;
		t.ok(/^label: "?Crimson"?$/m.test(fm), `the note that had Red now says Crimson on disk (${fm.match(/^label:.*$/m)?.[0]})`);
		t.eq((await dataFile(p))?.labels?.[0]?.name, 'Crimson', 'and the list says Crimson');
		// a name another label has, in another case: refused, and the row says its old name
		await typeInto(p, label(5), 'CRIMSON');
		t.ok(/already/.test(await notices(p)), `a duplicate name is refused: “${await notices(p)}”`);
		t.eq(await p.ev(`${label(5)}.value`), 'Blue', 'and the row is Blue again');
		t.eq((await dataFile(p))?.labels?.[5]?.name, 'Blue', 'the saved list still has Blue');
		// Escape on a changed name puts it back, and the tab stays open
		await typeInto(p, label(5), 'Xyz', 'Escape');
		t.eq(await p.ev(`${label(5)}.value`), 'Blue', 'Escape puts the name back');
		t.ok(await p.ev(SETTINGS_OPEN), 'and Escape doesn’t close the settings');
	} finally {
		await closeSettings(p);
	}
});

test('a label renamed in the tab, and Cancel on the question: the note keeps the old name on disk, and the list has the new one', async (p, h, t) => {
	const label = (i) => `${TAB}.querySelectorAll('.binders-settings-label input[type="text"]')[${i}]`;
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(KEEPER)}), fm => { fm.label = 'Red'; }).then(() => 1)`);
	await p.sleep(300);
	await openSettings(p);
	try {
		await typeInto(p, label(0), 'Scarlet');
		await until(p, `${DOCS}.some(d => [...d.querySelectorAll('.modal')].some(m => /Rename the label/.test(m.textContent)))`, 3000);
		await answer(p, 'Cancel');
		await p.sleep(400);
		t.ok(/^label: "?Red"?$/m.test(split(await read(p, KEEPER)).yaml), 'the note keeps Red on disk');
		t.eq((await dataFile(p))?.labels?.[0]?.name, 'Scarlet', 'the list has the new name');
	} finally { await closeSettings(p); }
});

// ---- export: the folders, the name and the contact details ----

test('Exports folder: “/Books/Exports/” is kept as “Books/Exports”; a dot or a bad character is refused; empty is Exports again; after a restart too', async (p, h, t) => {
	const ex = 'Exports folder';
	await openSettings(p);
	try {
		await typeInto(p, FIELD(ex), '/Books/Exports/');
		t.eq(await saved(p, 'exportsFolder', 'Books/Exports'), 'Books/Exports', 'the slashes at the ends go, and it is saved');
		t.eq(await field(p, ex), 'Books/Exports', 'and the field shows it');
		await restart(p);
		await openSettings(p);
		t.eq(await field(p, ex), 'Books/Exports', 'after a restart: the same');
		await typeInto(p, FIELD(ex), '.hidden');
		t.ok(/can’t be used/.test(await notices(p)), `a name that starts with a dot is refused: “${await notices(p)}”`);
		t.eq(await field(p, ex), 'Books/Exports', 'and it goes back');
		await typeInto(p, FIELD(ex), 'bad*name');
		t.eq(await pluginSetting(p, 'exportsFolder'), 'Books/Exports', 'a star is refused too');
		await typeInto(p, FIELD(ex), '');
		t.eq(await saved(p, 'exportsFolder', 'Exports'), 'Exports', 'empty is the default, Exports');
	} finally { await closeSettings(p); }
});

test('your name and contact details: the name is kept when Tab leaves it, Escape in it puts it back, and the contact lines typed are kept when the tab closes, and after a restart', async (p, h, t) => {
	await openSettings(p);
	try {
		await typeInto(p, FIELD('Your name'), 'Ada Writer', 'Tab');
		t.eq(await saved(p, 'authorName', 'Ada Writer'), 'Ada Writer', 'the name is saved when Tab leaves the field');
		await typeInto(p, FIELD('Your name'), 'Someone else', 'Escape');
		t.eq(await field(p, 'Your name'), 'Ada Writer', 'Escape in the name puts it back');
		t.ok(await p.ev(SETTINGS_OPEN), 'and keeps the tab open');
		const contact = `${TAB}.querySelector('.binders-settings-contact textarea')`;
		await typeInto(p, contact, '12 Lane Road\nada@example.com', null);
		await p.sleep(200);
		// (Escape sent as a key event doesn't close Obsidian's settings window here, so the tab is closed as Escape closes it)
		await closeSettings(p);
		await p.sleep(700);
		t.eq(await p.ev(SETTINGS_OPEN), false, 'the settings closed, with the contact typed');
	} finally { await closeSettings(p); }
	t.eq(await saved(p, 'contact', '12 Lane Road\nada@example.com'), '12 Lane Road\nada@example.com', 'the contact lines typed before Escape closed the tab are on disk');
	await restart(p);
	await openSettings(p);
	try {
		t.eq(await p.ev(`${TAB}.querySelector('.binders-settings-contact textarea').value`), '12 Lane Road\nada@example.com', 'after a restart the contact details are there');
	} finally { await closeSettings(p); }
});

test('styles folder: renamed with its styles on disk; a name of a folder that is there is refused and put back; the name is back at the end', async (p, h, t) => {
	const folder = await p.ev(`${PL}.styles.folder`);
	await p.ev(`app.vault.createFolder(${j(folder)}).then(() => 1, () => 1)`);
	await p.sleep(200);
	await openSettings(p);
	try {
		await typeInto(p, FIELD('Styles folder'), 'Book styles');
		await until(p, `!!app.vault.getAbstractFileByPath('Book styles')`, 3000);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath('Book styles') && !app.vault.getAbstractFileByPath(${j(folder)})`), 'the folder is renamed on disk');
		t.eq(await saved(p, 'stylesFolder', 'Book styles'), 'Book styles', 'and the setting is saved');
		await typeInto(p, FIELD('Styles folder'), 'The Lighthouse');
		t.ok(/already something named/.test(await notices(p)) || /already/.test(await notices(p)), `a folder that’s there is refused: “${await notices(p)}”`);
		t.eq(await field(p, 'Styles folder'), 'Book styles', 'and the field goes back');
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath('The Lighthouse/The Lighthouse.md')`), 'and the binder is untouched');
		await restart(p);
		await openSettings(p);
		t.eq(await field(p, 'Styles folder'), 'Book styles', 'after a restart the name is still Book styles');
		await typeInto(p, FIELD('Styles folder'), folder);
		await until(p, `!!app.vault.getAbstractFileByPath(${j(folder)})`, 3000);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(folder)}) && !app.vault.getAbstractFileByPath('Book styles')`), 'and back: the folder has its name again');
	} finally {
		await closeSettings(p);
		await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Book styles'); if (f) await app.vault.delete(f, true); const g = app.vault.getAbstractFileByPath(${j(folder)}); if (g) await app.vault.delete(g, true); return 1; })().then(() => 1)`).catch(() => {});
	}
});

test('property names: a new name is read from the notes, a name another property has or one Binders keeps is refused, and a blank name is the default', async (p, h, t) => {
	// a note whose card text is under the name the tab is set to, and not under the old one
	const text = await read(p, PROLOGUE);
	const { yaml, body } = split(text);
	await p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${j(PROLOGUE)}), ${j(`---\n${yaml}\nsummary: Prologue in the summary\n---\n${body}`)}).then(() => 1)`);
	await p.sleep(400);
	await openSettings(p);
	try {
		await typeInto(p, FIELD('Synopsis'), 'summary');
		t.eq(await saved(p, 'synopsisProp', 'summary'), 'summary', 'Synopsis is saved as summary');
		await closeSettings(p);
		await openView(p, 'The Lighthouse');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="${PROLOGUE}"]')`, 4000);
		// (the card's synopsis is a field: its words are its value, not its text)
		const cardText = `(() => { const e = document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="${PROLOGUE}"] .binders-card-synopsis'); return e ? (e.value ?? e.innerText ?? e.textContent ?? '') : ''; })()`;
		await until(p, `${cardText}.includes('Prologue in the summary')`, 4000);
		const card = await p.ev(cardText);
		const fm = await p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(PROLOGUE)}))?.frontmatter ?? null)`);
		t.ok(card.includes('Prologue in the summary'), `the card shows the summary property: “${card}” (note: ${fm})`);
		await openSettings(p);
		await typeInto(p, FIELD('Status'), 'label');
		t.ok(/is the property for the label/.test(await notices(p)), `Status can’t be label: “${await notices(p)}”`);
		t.eq(await field(p, 'Status'), 'status', 'and it goes back to status');
		await typeInto(p, FIELD('Notes'), 'export');
		t.ok(/keeps “export” for itself/.test(await notices(p)), `Notes can’t be export: “${await notices(p)}”`);
		t.eq(await field(p, 'Notes'), 'notes', 'and it goes back to notes');
		await typeInto(p, FIELD('Target'), 'Binder');
		t.ok(/keeps “Binder” for itself/.test(await notices(p)) || /keeps “binder” for itself/.test(await notices(p)), `Target can’t be binder, in any case: “${await notices(p)}”`);
		await typeInto(p, FIELD('Synopsis'), '');
		t.eq(await saved(p, 'synopsisProp', 'synopsis'), 'synopsis', 'a blank name is the default again');
		await restart(p);
		await openSettings(p);
		t.eq(await field(p, 'Synopsis'), 'synopsis', 'after a restart: synopsis');
		t.eq(await field(p, 'Status'), 'status', 'and status is still status');
	} finally { await closeSettings(p); }
});

test('remembered places: “Ask again” is on once an export is remembered, lists it, and forgets it on the device', async (p, h, t) => {
	await p.ev(`app.saveLocalStorage('binders-export', { places: { 'manuscript\\nThe Lighthouse': '/Documents/Book.docx' }, written: {}, last: {} })`);
	await openSettings(p);
	try {
		const desc = () => p.ev(`${TAB}.querySelector('.binders-settings-places .setting-item-description').textContent`);
		t.ok((await desc()).includes('The Lighthouse (Manuscript) to /Documents/Book.docx'), `the place is listed: “${await desc()}”`);
		t.eq(await p.ev(`${TAB}.querySelector('.binders-settings-places button').disabled`), false, '“Ask again” is on');
		await tap(p, `${TAB}.querySelector('.binders-settings-places button')`);
		await p.sleep(300);
		t.ok((await desc()).startsWith('Every export asks'), 'after Ask again, every export asks');
		t.eq(await p.ev(`${TAB}.querySelector('.binders-settings-places button').disabled`), true, '“Ask again” is off again');
		t.eq(await p.ev(`(app.loadLocalStorage('binders-export') ?? {}).places && Object.keys(app.loadLocalStorage('binders-export').places).length`), 0, 'and nothing is remembered on the device');
	} finally { await closeSettings(p); }
});

test('everything changed, a restart, every control shows what was set; then all of it back by the tab, and the file holds the defaults', async (p, h, t) => {
	await openSettings(p);
	try {
		await setSwitch(p, 'Hide binder and folder notes', false);
		await setSwitch(p, 'Order binders in the file explorer', false);
		await setSwitch(p, 'Show word counts', true);
		await setSwitch(p, 'Indent paragraphs', true);
		await setSwitch(p, 'Enter fullscreen', true);
		await typeInto(p, FIELD('Your name'), 'Ada Writer', 'Tab');
		await typeInto(p, FIELD('Exports folder'), 'Books');
		await typeInto(p, FIELD('Words to write today'), '900');
		await typeInto(p, FIELD('Target'), 'goal');
		await closeSettings(p);
	} finally { await closeSettings(p); }
	await restart(p);
	await openSettings(p);
	try {
		const expect = { 'Order binders in the file explorer': false, 'Hide binder and folder notes': false, 'Show word counts': true, 'Indent paragraphs': true, 'Enter fullscreen': true };
		for (const [name, on] of Object.entries(expect)) {
			const shown = await checked(p, name);
			t.eq(shown, on, `after a restart: “${name}” is ${on ? 'on' : 'off'}`);
		}
		t.eq(await field(p, 'Your name'), 'Ada Writer', 'after a restart: Your name');
		t.eq(await field(p, 'Exports folder'), 'Books', 'after a restart: Exports folder');
		t.eq(await field(p, 'Words to write today'), '900', 'after a restart: the goal');
		t.eq(await field(p, 'Target'), 'goal', 'after a restart: Target');
		// and back, by the tab
		for (const [name, on] of Object.entries({ 'Order binders in the file explorer': true, 'Hide binder and folder notes': true, 'Show word counts': false, 'Indent paragraphs': false, 'Enter fullscreen': false })) await setSwitch(p, name, on);
		await typeInto(p, FIELD('Your name'), '', 'Enter');
		await typeInto(p, FIELD('Exports folder'), '', 'Enter');
		await typeInto(p, FIELD('Words to write today'), '', 'Enter');
		await typeInto(p, FIELD('Target'), 'target', 'Enter');
	} finally { await closeSettings(p); }
	const d = await dataFile(p);
	t.eq(j([d.orderExplorer, d.hideBinderNotes, d.focusNumbers, d.indentParagraphs, d.focusFullscreen, d.authorName, d.exportsFolder, d.focusGoal, d.targetProp]), j([true, true, false, false, false, '', 'Exports', 0, 'target']), 'the file holds the defaults again');
});
