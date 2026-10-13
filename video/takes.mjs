// The take: the film's one evening of work, done in the real app and photographed. plates.mjs has the manual's
// screenshot script call `session` once its book is made, with its handle on Obsidian (`p`, tests/e2e/driver.mjs).
//
// What is kept is not a recording to be played back but what each thing done looked like: for a click, the window
// with the pointer resting on its target, then the window every few milliseconds after the press, each with how
// long after; for a drag, the window at each step of the way; for typing, the window after each key; for the wheel,
// after each step. Where the pointer is between those, how fast it goes and when each thing happens are the
// film's to decide (src/direction.mjs): the same take can be cut again without being shot again.
// Written to public/takes (the pictures) and src/takes.json (what was done, in order).
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url)), dir = join(here, 'public/takes'), file = join(here, 'src/takes.json');
const L = 'The Lighthouse', j = JSON.stringify;
const REWRITE = 'The flare went up red. Nobody spoke.', TASK = 'Red flare or white?';

/** `book`: 'small' is the manual's own example; 'full' is the listing's, a novel half written, sixteen scenes of it. */
export async function session(p, book = 'small') {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const acts = [];
	let frames = 0, surface = 'desk';
	const shot = async () => {
		const r = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
		writeFileSync(join(dir, `f${String(frames).padStart(4, '0')}.jpg`), Buffer.from(r.result.data, 'base64'));
		return frames++;
	};
	/** The window, again and again, for `ms` after something was done: [picture, milliseconds after]. */
	const burst = async (ms = 520) => { const from = Date.now(), out = []; do { const dt = Date.now() - from; out.push([await shot(), dt]); } while (Date.now() - from < ms); return out; };
	const box = async (expr, what) => {
		const b = await p.ev(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
		if (!b) throw new Error(`the take found no ${what}`);
		return b;
	};
	const mouse = (type, x, y, extra = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
	const act = (a) => { acts.push({ surface, ...a }); return a; };
	/** A click (or a right-click, or two or three in a row) on a point, a target of `w` by `h` around it. */
	const click = async (name, at, { button = 'left', count = 1, ms = 520, w = at.w, h = at.h } = {}) => {
		await p.move(at.x, at.y, 3); await p.sleep(140);
		const hover = await shot();
		for (let c = 1; c <= count; c++) { await mouse('mousePressed', at.x, at.y, { button, clickCount: c }); await mouse('mouseReleased', at.x, at.y, { button, clickCount: c }); }
		return act({ name, kind: button === 'right' ? 'right' : ['click', 'double', 'triple'][count - 1], x: at.x, y: at.y, w, h, hover, after: await burst(ms) });
	};
	/** A drag from one point to another, bowed a little: the window at each of `n` steps, then after the drop. */
	const drag = async (name, from, to, { n = 72, bow = 22, w = 60 } = {}) => {
		await p.move(from.x, from.y, 3); await p.sleep(140);
		const hover = await shot(), steps = [];
		await mouse('mousePressed', from.x, from.y);
		for (let i = 1; i <= n; i++) {
			const u = i / n, x = from.x + (to.x - from.x) * u, y = from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * bow;
			await p.move(x, y, 1, { buttons: 1 }); await p.sleep(28);
			steps.push([await shot(), Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
		}
		await p.sleep(120);
		const held = await shot();
		await mouse('mouseReleased', to.x, to.y);
		return act({ name, kind: 'drag', x: from.x, y: from.y, w, h: w, tx: to.x, ty: to.y, hover, steps, held, after: await burst(620) });
	};
	const type = async (name, text, at) => {
		const keys = [];
		for (const ch of text) { await p.send('Input.insertText', { text: ch }); await p.sleep(30); keys.push(await shot()); }
		return act({ name, kind: 'type', text, x: at.x, y: at.y, keys, after: await burst(300) });
	};
	const key = async (name, k, ms = 520) => { const before = await shot(); await p.key(k); return act({ name, kind: 'key', key: k, hover: before, after: await burst(ms) }); };
	const wheel = async (name, at, total, n = 30) => {
		await p.move(at.x, at.y, 3); await p.sleep(120);
		const hover = await shot(), steps = [];
		// (an eased swipe: most of the way early, then slowing)
		for (let i = 1; i <= n; i++) { const d = total * (Math.pow(i / n, 0.5) - Math.pow((i - 1) / n, 0.5)); await p.wheel(at.x, at.y, d); await p.sleep(40); steps.push(await shot()); }
		return act({ name, kind: 'wheel', x: at.x, y: at.y, w: 300, h: 300, hover, steps, after: await burst(300) });
	};
	const touch = (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	const tap = async (name, at, { ms = 700 } = {}) => {
		const hover = await shot();
		await touch('touchStart', at.x, at.y);
		await p.sleep(60);
		await touch('touchEnd', at.x, at.y);
		return act({ name, kind: 'tap', x: at.x, y: at.y, w: Math.max(44, Math.min(at.w, at.h)), h: 44, hover, after: await burst(ms) });
	};
	const row = (path) => `document.querySelector('.nav-folder-title[data-path=${j(path)}], .nav-file-title[data-path=${j(path)}]')`;
	const seen = `e.getBoundingClientRect().width > 0`;
	const item = (text) => `[...document.querySelectorAll('.menu-item')].filter((e) => ${seen}).find((e) => e.textContent.trim().startsWith(${j(text)}))`;
	/** A row of the menu that is open: the pointer aims at its words, a third of the way along. */
	const menuRow = async (text) => { const b = await box(item(text), `menu row "${text}"`); return { ...b, x: b.l + Math.min(b.w * 0.38, 90) }; };
	const title = (name) => `[...document.querySelectorAll('.binders-manuscript-title')].find((e) => e.textContent.trim() === ${j(name)})`;
	const modeButton = (text) => `[...document.querySelectorAll('.binders-toolbar *')].filter((e) => e.textContent.trim() === ${j(text)} && ${seen}).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]`;
	const more = `[...document.querySelectorAll('.view-header [aria-label="More options"], .view-actions [aria-label="More options"]')].filter((e) => ${seen}).pop()`;
	const V = `app.workspace.getLeavesOfType('binders-view')[0].view`;
	const ready = async (phone) => { for (let i = 0; i < 120 && !(await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer && app.isMobile === ${phone})`).catch(() => false)); i++) await p.sleep(200); };

	// ---- the evening begins: an ordinary folder, its notes by name ----
	await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
	await p.sleep(600);
	await p.ev(`(async () => {
		const at = (x) => app.vault.getAbstractFileByPath(x);
		// (a tooltip under a pointer the film draws elsewhere would be a lie)
		const st = document.createElement('style'); st.textContent = '.tooltip { display: none; }'; document.head.append(st);
		app.workspace.getLeavesOfType('binders-view').forEach((l) => l.detach());
		for (const x of [${j(L)} + '/Part Three', ${j(L)} + '/Snapshots', ${j(L)} + '/The Lighthouse.md', ${j(L)} + '/Part One/Part One.md', ${j(L)} + '/Part Two/Part Two.md']) if (at(x)) await app.vault.delete(at(x), true);
		// (the line she will rewrite: the full book's scene opens with it; the small one's is given it)
		await app.vault.process(at(${j(L)} + '/Part Two/The wreck.md'), (t) => t.includes('The flare went up') ? t : t.trimEnd() + '\\n\\nMara saw it from the gallery, and for a moment took it for a town.\\n\\nThe flare went up at ten past two and hung over the Skerry.\\n');
		// (the throwaway vault is named "vault"; a writer's is not)
		for (const e of document.querySelectorAll('.workspace-drawer *, .workspace-sidedock-vault-profile *')) if (!e.children.length && e.textContent.trim() === 'vault') e.textContent = 'Writing';
		await new Promise((r) => setTimeout(r, 1200));
		const ex = app.workspace.getLeavesOfType('file-explorer')[0].view;
		ex.fileItems[${j(L)}]?.setCollapsed(false);
		for (const f of [${j(L)} + '/Part One', ${j(L)} + '/Part Two']) ex.fileItems[f]?.setCollapsed(true);
	})().then(() => 1)`);
	await p.sleep(1000);
	await p.move(700, 600, 2);
	acts.push({ surface, name: 'start', kind: 'still', hover: await shot() });

	// the folder made a binder; the Prologue put first
	await click('folder-menu', await box(row(L), 'the folder in the explorer'), { button: 'right' });
	await click('make-binder', await menuRow('Make this folder a binder'), { ms: 900 });
	await p.sleep(600);
	const pro = await box(row(L + '/Prologue.md'), 'Prologue'), one = await box(row(L + '/Part One'), 'Part One');
	await drag('prologue-up', { x: pro.l + 90, y: pro.y }, { x: one.l + 90, y: one.t + 2 }, { w: 25, bow: 0, n: 60 });
	await p.sleep(500);
	// Part Two, opened from the explorer; "The wreck" put first
	await click('open-part-two', await box(row(L + '/Part Two'), 'Part Two in the explorer'), { ms: 900 });
	await p.sleep(900);
	const wreck = await box(`document.querySelector('.binders-card[data-path$="The wreck.md"]')`, 'the card of The wreck'), lead = await box(`document.querySelector('.binders-card')`, 'the first card');
	await drag('wreck-first', { x: wreck.x - 20, y: wreck.y - 24 }, { x: lead.l + 24, y: lead.y - 14 }, { w: 80, n: 84 });
	await p.sleep(500);
	// the manuscript of Part Two; a snapshot of "The wreck"; its last line rewritten; what changed
	await click('mode-1', await box(modeButton('Corkboard'), 'the mode button'));
	await click('manuscript', await menuRow('Manuscript'), { ms: 1000 });
	await p.sleep(900);
	await click('title-menu-1', await box(title('The wreck'), 'the title of The wreck'), { button: 'right' });
	await click('snapshots-1', await menuRow('Snapshots'));
	await click('take-snapshot', await menuRow('Take a snapshot'), { ms: 900 });
	await p.sleep(400);
	const last = await box(`(() => { const t = ${title('The wreck')}; return [...document.querySelectorAll('.cm-line')].filter((e) => e.getBoundingClientRect().top > t.getBoundingClientRect().bottom && e.textContent.startsWith('The flare went up'))[0]; })()`, 'the last line of The wreck');
	const inLine = { x: last.l + 210, y: last.y, w: 300, h: 22 };
	await click('select-line', inLine, { count: 3, ms: 300 });
	await type('rewrite', REWRITE, inLine);
	await p.sleep(900); // (Obsidian saves the note)
	await click('title-menu-2', await box(title('The wreck'), 'the title of The wreck'), { button: 'right' });
	await click('snapshots-2', await menuRow('Snapshots'));
	await click('show-snapshots', await menuRow('Show snapshots'), { ms: 1100 });
	await p.sleep(500);
	await click('show-changes', await box(`[...document.querySelectorAll('.modal *')].filter((e) => e.textContent.trim() === 'Show changes' && ${seen}).pop()`, 'Show changes'), { ms: 900 });
	acts[acts.length - 1].marks = await p.ev(`[...document.querySelectorAll('.modal *')].filter((e) => e.children.length === 0 && /^(The flare went up|The ship came in)/.test(e.textContent.trim()) && ${seen}).map((e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })`);
	await key('close-snapshots', 'Escape');
	await p.sleep(300);
	// the outliner: the scene marked revised
	await click('mode-2', await box(modeButton('Manuscript'), 'the mode button'));
	await click('outliner', await menuRow('Outliner'), { ms: 1000 });
	await p.sleep(700);
	await click('status-cell', await box(`[...document.querySelectorAll('.binders-outliner-row')].find((e) => e.textContent.includes('The wreck')).querySelectorAll('.binders-outliner-cell.is-menu')[1]`, 'the status of The wreck in the outliner'));
	await click('revised', await menuRow('Revised'), { ms: 900 });
	await p.sleep(500);

	// ---- away from the desk: the same binder on a phone ----
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(true), 50); return 1; })()`);
	await p.sleep(3000);
	await ready(true);
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await p.ev(`(async () => { const pl = app.plugins.plugins.binders; await pl.binders.settled; app.changeTheme('obsidian'); app.workspace.leftSplit?.collapse?.(); await pl.openBinder(app.vault.getAbstractFileByPath(${j(L)} + '/Part Two')); ${V}.setMode('corkboard'); })().then(() => 1)`);
	await p.sleep(2500);
	surface = 'phone';
	acts.push({ surface, name: 'phone-start', kind: 'still', hover: await shot() });
	await tap('phone-card', await box(`document.querySelector('.binders-card[data-path$="The wreck.md"] .binders-card-footer')`, 'The wreck on the phone'));
	await tap('phone-more', await box(more, 'More options on the phone'), { ms: 900 });
	await tap('phone-add-task', await menuRow('Add revision task'), { ms: 900 });
	const field = await box(`document.querySelector('.prompt-input')`, 'the task field on the phone');
	await type('phone-type', TASK, field);
	await key('phone-enter', 'Enter', 1200);
	await p.sleep(600);

	// ---- the desk again: the task is waiting; then the book is made ----
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await p.ev(`(() => { setTimeout(() => app.emulateMobile(false), 50); return 1; })()`);
	await p.sleep(3000);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
	await ready(false);
	await p.ev(`(async () => { const pl = app.plugins.plugins.binders; await pl.binders.settled; app.changeTheme('obsidian'); app.workspace.leftSplit.expand(); await pl.openBinder(app.vault.getAbstractFileByPath(${j(L)})); ${V}.setMode('manuscript'); app.commands.executeCommandById('binders:show-revision'); const st = document.createElement('style'); st.textContent = '.tooltip { display: none; }'; document.head.append(st); })().then(() => 1)`);
	await p.sleep(2600);
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach((n) => n.remove()); return 1; })()`);
	surface = 'desk';
	await p.move(760, 560, 2);
	acts.push({ surface, name: 'desk-again', kind: 'still', hover: await shot() });
	await click('task', await box(`document.querySelector('.binders-revision-task .binders-revision-text')`, 'the task in the Revision pane'), { ms: 1100 });
	await click('tick', await box(`document.querySelector('.binders-revision-task input[type=checkbox]')`, "the task's tick box"), { ms: 800 });
	await click('more-options', await box(more, 'More options'));
	await click('export', await menuRow('Export...'), { ms: 2600 });
	await p.sleep(1200);
	await click('paperback', await box(`[...document.querySelectorAll('.binders-export-kinds > *')].find((e) => e.textContent.trim().startsWith('Paperback'))`, 'Paperback in the Export window'), { ms: 2400 });
	await p.sleep(1500);
	await wheel('pages', { x: 880, y: 470 }, book === 'full' ? 3650 : 2700, 40); // (past the title and the contents, to a page of the book)
	const button = await box(`[...document.querySelectorAll('.modal button')].filter((e) => e.textContent.trim() === 'Export' && ${seen}).pop()`, 'the Export button');
	await p.move(button.x, button.y, 3); await p.sleep(200);
	// (not pressed: what follows it is the system's own save window. The film cuts on the press.)
	act({ name: 'export-button', kind: 'click', x: button.x, y: button.y, w: button.w, h: button.h, hover: await shot(), after: [] });

	writeFileSync(file, JSON.stringify({ book, frames, acts }));
	process.exit(0);
}
