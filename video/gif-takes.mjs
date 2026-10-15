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

const here = dirname(fileURLToPath(import.meta.url)), dir = join(here, 'public/gif-takes'), file = join(here, 'src/gif-takes.json');
const L = 'The Lighthouse', j = JSON.stringify;
const REWRITE = 'The flare went up red. Nobody spoke.', TASK = 'Red flare or white?';

/** `book`: 'small' is the manual's own example; 'full' is the listing's, a novel half written, sixteen scenes of it. */
export async function session(p, book = 'small') {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const acts = [];
	let frames = 0, surface = 'desk';
	let seen_ = '';
	/** A picture of the window; the same picture twice is kept once. */
	const shot = async () => {
		const r = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
		if (r.result.data === seen_) return frames - 1;
		seen_ = r.result.data;
		writeFileSync(join(dir, `f${String(frames).padStart(4, '0')}.jpg`), Buffer.from(r.result.data, 'base64'));
		return frames++;
	};
	// The app's own animations (a menu opening, cards making room, a window coming up) last a fifth of a second or so:
	// a picture takes a twentieth. So the app is slowed to SLOW of its speed while it is photographed, and each
	// picture's time is counted in the app's time, not the clock's: a picture for every frame of the film, and more.
	const SLOW = 0.15;
	const slowed = async () => { await p.send('Animation.enable'); await p.send('Animation.setPlaybackRate', { playbackRate: SLOW }); };
	/** The window, again and again, after something was done, until `ms` of the app's time has passed (and long enough
	    by the clock for what the app does in its own time, a file read or a page laid out): [picture, milliseconds after]. */
	const burst = async (ms = 520) => {
		const from = Date.now(), out = [], real = Math.max(ms, 320 / SLOW);
		do { const dt = Date.now() - from, f = await shot(); if (!out.length || out[out.length - 1][0] !== f) out.push([f, Math.round(dt * SLOW)]); } while (Date.now() - from < real);
		return out;
	};
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

	// ---- the listing's GIF: Part Two on the corkboard, "The wreck" put first, then the same scenes in the other modes ----
	const W = Number(process.env.GIF_W || 1180), H = Number(process.env.GIF_H || 740);
	await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
	await p.sleep(600);
	const WHEN = { 'The glass falls': '1987-06-17', 'Lights out': '1987-06-19', 'The wreck': '1987-06-19', 'The lamp room': '1987-06-20', 'Seven men ashore': '1987-06-20', 'What the mate saw': '1987-06-21', 'The cut page': '1987-06-23', 'The dark hour': '1987-06-22' };
	await p.ev(`(async () => {
		const pl = app.plugins.plugins.binders, at = (x) => app.vault.getAbstractFileByPath(x);
		const st = document.createElement('style'); st.textContent = '.tooltip { display: none; }'; document.head.append(st);
		for (const [name, date] of Object.entries(${j(WHEN)})) await app.fileManager.processFrontMatter(at(${j(L)} + '/Part Two/' + name + '.md'), (fm) => { fm['story-date'] = date; });
		// (The wreck starts in the middle of the board, so the drag that puts it first crosses it)
		const two = ['The glass falls', 'The lamp room', 'Lights out', 'Seven men ashore', 'What the mate saw', 'The cut page', 'The dark hour', 'The wreck'].map((n) => 'Part Two/' + n);
		await app.fileManager.processFrontMatter(at(${j(L)} + '/The Lighthouse.md'), (fm) => { const c = fm.contents.filter((x) => x === 'Part Two/' || !x.startsWith('Part Two/')); const i = c.indexOf('Part Two/'); c.splice(i + 1, 0, ...two); fm.contents = c; });
		await new Promise((r) => setTimeout(r, 800));
		for (const e of document.querySelectorAll('.workspace-drawer *, .workspace-sidedock-vault-profile *')) if (!e.children.length && e.textContent.trim() === 'vault') e.textContent = 'Writing';
		document.querySelector('.status-bar')?.hide();
		app.workspace.getLeavesOfType('binders-view').forEach((l) => l.detach());
		app.workspace.leftSplit.expand();
		await pl.binders.settled;
		await pl.openBinder(at(${j(L)} + '/Part Two'));
		${V}.setMode('corkboard');
		const ex = app.workspace.getLeavesOfType('file-explorer')[0].view;
		ex.fileItems[${j(L)}]?.setCollapsed(false);
		ex.fileItems[${j(L)} + '/Part One']?.setCollapsed(true);
		ex.fileItems[${j(L)} + '/Part Three']?.setCollapsed(true);
		ex.fileItems[${j(L)} + '/Part Two']?.setCollapsed(false);
		document.querySelectorAll('.notice').forEach((n) => n.remove());
	})().then(() => 1)`);
	await p.sleep(2500);
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach((n) => n.remove()); return 1; })()`);
	await slowed();
	// (the board as the clip opens and closes: The wreck in the middle, put there by a drag, so Undo is lit at both
	// ends; nothing selected, the pointer over the empty slot at the board's foot)
	const card = (name) => `document.querySelector('.binders-card[data-path$="Part Two/${name}.md"]')`;
	const rest = { x: W - 180, y: H - 210, w: 60, h: 60 };
	const putBack = async (name) => { const w = await box(card('The wreck'), 'the card of The wreck'), m = await box(card('What the mate saw'), 'the card of What the mate saw'); return drag(name, { x: w.x - 20, y: w.y - 24 }, { x: m.l + 24, y: m.y - 14 }, { w: 80, n: 84 }); };
	await putBack('setup-back');
	await p.sleep(500);
	await click('setup-rest', rest);
	await p.sleep(600);
	acts.splice(0);
	acts.push({ surface, name: 'start', kind: 'still', hover: await shot() });
	const wreck = await box(`document.querySelector('.binders-card[data-path$="Part Two/The wreck.md"]')`, 'the card of The wreck'), lead = await box(`document.querySelector('.binders-card')`, 'the first card');
	await drag('wreck-first', { x: wreck.x - 20, y: wreck.y - 24 }, { x: lead.l + 24, y: lead.y - 14 }, { w: 80, n: 84 });
	await p.sleep(500);
	await click('mode-1', await box(modeButton('Corkboard'), 'the mode button'));
	await click('manuscript', await menuRow('Manuscript'), { ms: 1000 });
	await p.sleep(900);
	await wheel('read', { x: Math.round(W * 0.62), y: Math.round(H * 0.55) }, 700, 24);
	await p.sleep(300);
	await click('mode-2', await box(modeButton('Manuscript'), 'the mode button'));
	await click('outliner', await menuRow('Outliner'), { ms: 1000 });
	await p.sleep(700);
	await click('mode-3', await box(modeButton('Outliner'), 'the mode button'));
	await click('timeline', await menuRow('Timeline'), { ms: 1200 });
	await p.sleep(700);
	await click('mode-4', await box(modeButton('Timeline'), 'the mode button'));
	await click('corkboard', await menuRow('Corkboard'), { ms: 1000 });
	await p.sleep(500);
	await putBack('wreck-back');
	await p.sleep(500);
	await click('rest', rest, { ms: 700 });
	await p.sleep(300);
	acts.push({ surface, name: 'end', kind: 'still', hover: await shot() });
	writeFileSync(file, JSON.stringify({ book: 'full', W, H, frames, acts }));
	process.exit(0);
}
