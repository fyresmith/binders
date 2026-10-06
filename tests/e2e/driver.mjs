// Drives a real, headless Obsidian over the Chrome DevTools protocol.
// Obsidian runs with its own throwaway profile and a throwaway copy of test-vault, so nothing real is touched.
import { execFileSync, spawn } from 'child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';

const ELECTRON = process.env.OBSIDIAN_ELECTRON || '/usr/lib/electron43/electron';
const ASAR = process.env.OBSIDIAN_ASAR || '/usr/lib/obsidian/app.asar';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(url, onEvent) {
	const ws = new WebSocket(url);
	let id = 0;
	const pending = new Map();
	ws.addEventListener('message', (m) => {
		const d = JSON.parse(m.data);
		if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
		else if (d.method) onEvent(d);
	});
	// When Obsidian ends under a test (a crash, the machine out of memory), what was asked and what is asked next fail
	// with a reason. Left waiting, Node would find nothing more to do and end the whole run without a word.
	const state = { closed: false };
	const gone = () => new Error('Obsidian is gone: the connection to it closed');
	ws.addEventListener('close', () => { state.closed = true; for (const [, r] of pending) r({ gone: true }); pending.clear(); });
	const send = (method, params = {}) => new Promise((r, j) => {
		if (state.closed) return j(gone());
		const i = ++id;
		pending.set(i, (d) => (d.gone ? j(gone()) : r(d)));
		ws.send(JSON.stringify({ id: i, method, params }));
	});
	return new Promise((r, j) => { ws.addEventListener('open', () => r({ ws, send, state })); ws.addEventListener('error', j); });
}

// Every Obsidian started here and its throwaway folder, so none is left running (or on disk) when the tests are stopped
// part-way: Ctrl-C, a kill, or a crash of the runner. Each runs in a process group of its own, ended as one.
const live = new Map();
// Asked first, so Obsidian closes as it would for a user. An old one (1.8.7 does this, headless) ends its windows and
// stays: what hasn't gone two seconds later is ended outright, or every launch would leave a process behind.
const force = (pid) => { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } };
const end = (proc, work) => {
	live.delete(proc);
	try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill(); } catch { /* gone */ } }
	setTimeout(() => force(proc.pid), 2000).unref();
	return () => rmSync(work, { recursive: true, force: true });
};
let guarded = false;
/** Set on the first launch, not on import: a script that only reads the spec files keeps its own handling of Ctrl-C. */
function guard() {
	if (guarded) return;
	guarded = true;
	process.on('exit', () => {
		const left = [...live].map(([proc, work]) => ({ pid: proc.pid, clear: end(proc, work) }));
		// Obsidian writes to its profile as it closes: wait (there's no await here) until each group is gone, three seconds at most
		const gone = (pid) => { try { process.kill(-pid, 0); return false; } catch { return true; } };
		const nap = new Int32Array(new SharedArrayBuffer(4));
		for (let i = 0; i < 60 && !left.every((l) => gone(l.pid)); i++) Atomics.wait(nap, 0, 0, 50);
		for (const l of left) { force(l.pid); try { l.clear(); } catch { /* still closing: the folder stays in the temp directory */ } }
	});
	for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(signal, () => process.exit(code));
}

// What that can't cover: a runner killed outright (SIGKILL, or the machine out of memory) ends without a word, and its
// Obsidian carries on. So everything started is also written down, a line each, in `started.jsonl` in the run's
// screenshots folder (--shots; run-all.mjs names the file itself, in BINDERS_E2E_STARTED), and `reap` ends exactly
// those: `node tests/e2e/run-all.mjs --reap`. Nothing is ever killed by its name.
const shots = process.argv.indexOf('--shots');
export const STARTED = process.env.BINDERS_E2E_STARTED || join(shots > 0 && process.argv[shots + 1] ? process.argv[shots + 1] : 'test-dist/e2e-failures', 'started.jsonl');
/** Writes down a runner (this process) and, with `pid`, an Obsidian it started and that Obsidian's folder. */
export function record(row = {}, file = STARTED) {
	try { mkdirSync(dirname(file), { recursive: true }); appendFileSync(file, JSON.stringify({ runner: process.pid, script: process.argv[1] ?? '', ...row }) + '\n'); } catch { /* a record is a help, not a need */ }
}
/** Ends every runner and Obsidian written down in `file` that is still what it was (a process id can be given to
    something else later: each is checked against its command line first), removes their throwaway folders, and the
    file. Returns how many of each. */
export async function reap(file = STARTED) {
	const done = { runners: 0, obsidians: 0, folders: 0 };
	if (!existsSync(file)) return done;
	const rows = readFileSync(file, 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
	const args = (pid) => { try { return execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).trim(); } catch { return ''; } };
	const kill = (pid, signal) => { try { process.kill(pid, signal); return true; } catch { return false; } };
	const wait = async (left, ms) => { for (let t = 0; t < ms && left(); t += 100) await sleep(100); };
	// the runners first (they'd start another Obsidian for their next theme), asked nicely so each closes its own
	const runners = new Map(rows.filter((r) => r.runner && r.runner !== process.pid && r.script).map((r) => [r.runner, r.script]));
	// (a row has the script's whole path; the command line has it as it was typed, `node tests/e2e/run.mjs`: read from
	// the folder the process is in, where the system says which that is)
	const runs = (pid, script) => {
		if (args(pid).includes(script)) return true;
		try { const cwd = readlinkSync(`/proc/${pid}/cwd`); return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').some((a) => a && resolve(cwd, a) === script); } catch { return false; }
	};
	for (const [pid, script] of runners) if (runs(pid, script) && kill(pid, 'SIGTERM')) done.runners++;
	await wait(() => [...runners].some(([pid, script]) => runs(pid, script)), 3500);
	for (const [pid, script] of runners) if (runs(pid, script)) kill(pid, 'SIGKILL');
	const mine = rows.filter((r) => r.pid && r.work && args(r.pid).includes(`--user-data-dir=${r.work}`));
	for (const r of mine) if (kill(-r.pid, 'SIGTERM') || kill(r.pid, 'SIGTERM')) done.obsidians++;
	const there = (r) => args(r.pid).includes(`--user-data-dir=${r.work}`);
	await wait(() => mine.some(there), 2500);
	for (const r of mine) if (there(r)) { kill(-r.pid, 'SIGKILL'); kill(r.pid, 'SIGKILL'); }
	await wait(() => mine.some(there), 1000);
	for (const work of new Set(rows.map((r) => r.work).filter((w) => w && basename(w).startsWith('binders-e2e-') && existsSync(w)))) { try { rmSync(work, { recursive: true, force: true }); done.folders++; } catch { /* in use by something else */ } }
	rmSync(file, { force: true });
	return done;
}

// BINDERS_TEST_VAULT: another vault to copy (say, a clean checkout of test-vault while the working one is in use)
export const VAULT = process.env.BINDERS_TEST_VAULT || 'test-vault';

// Headless, Chromium finds no mouse on the machine, so the page is told it has no pointer at all: `(hover: hover)` and
// `(pointer: fine)` never match, and every rule and line of code behind them goes untested. These settings give the page
// a desktop's pointer: a mouse that hovers. BINDERS_HOVER=1 (or launch({ hover: true })) turns it on.
const HOVER = process.env.BINDERS_HOVER === '1';
const POINTER = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';

export async function launch({ vault = VAULT, theme = 'light', width = 1440, height = 900, hover = HOVER } = {}) {
	if (!existsSync(ELECTRON) || !existsSync(ASAR)) throw new Error(`Obsidian not found. Set OBSIDIAN_ELECTRON and OBSIDIAN_ASAR (looked for ${ELECTRON} and ${ASAR}).`);
	const work = mkdtempSync(join(tmpdir(), 'binders-e2e-'));
	const vaultDir = join(work, 'vault');
	cpSync(vault, vaultDir, { recursive: true });
	rmSync(join(vaultDir, '.obsidian/workspace.json'), { force: true });
	// Let Chromium reserve the port. Guessing one can attach a test to another running vault.
	// (as root, as in a cloud sandbox or a container, Electron refuses to start without --no-sandbox)
	const root = process.getuid?.() === 0;
	const proc = spawn(ELECTRON, ['--ozone-platform=headless', '--disable-gpu', ...(root ? ['--no-sandbox'] : []), ...(hover ? [POINTER] : []), `--user-data-dir=${join(work, 'profile')}`, '--remote-debugging-port=0', ASAR], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
	guard();
	live.set(proc, work);
	record({ pid: proc.pid, work });
	const port = await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => { end(proc, work)(); reject(new Error('Obsidian did not expose its debugging port')); }, 20000);
		proc.stderr.on('data', (data) => {
			const match = data.toString().match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
			if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
		});
		proc.once('error', (e) => { clearTimeout(timeout); reject(e); });
		proc.once('exit', () => { clearTimeout(timeout); reject(new Error('Obsidian exited before exposing its debugging port')); });
	});
	const errors = [];
	const targets = async () => {
		for (let i = 0; i < 80; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (l.length) return l; } catch { /* starting */ } await sleep(250); }
		throw new Error('Obsidian did not start');
	};
	let list = await targets(), page = list.find((t) => t.type === 'page');
	if (page.url.includes('starter')) {
		const st = await connect(page.webSocketDebuggerUrl, () => {});
		await st.send('Runtime.evaluate', { expression: `require('electron').ipcRenderer.sendSync('vault-open', ${JSON.stringify(vaultDir)}, false)` });
		for (let i = 0; i < 60; i++) { await sleep(300); list = await targets(); page = list.find((t) => t.type === 'page' && !t.url.includes('starter')); if (page) break; }
		st.ws.close();
	}
	const { ws, send: raw, state: link } = await connect(page.webSocketDebuggerUrl, (d) => {
		if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
		if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning' || d.params.type === 'assert')) errors.push(`console.${d.params.type}: ` + d.params.args.map((a) => a.value ?? a.description).join(' '));
	});
	// Touch emulation swaps the mouse for a finger (no hover, a coarse pointer), which is what a phone test wants. Turning
	// it off doesn't bring the mouse back: Chromium falls back to what it found on the machine, which is nothing. Sending
	// the page its preferences again applies the command line's settings once more ('animate' is the default, so nothing
	// else changes). Without Electron's remote module the pointer stays gone until the next reload.
	const POINTS = `matchMedia('(hover: hover)').matches ? 'mouse' : matchMedia('(pointer: coarse)').matches ? 'touch' : 'none'`;
	const mouseBack = async () => {
		const say = (expression) => raw('Runtime.evaluate', { expression, returnByValue: true }).then((r) => r.result?.result?.value);
		await say(`(() => { try { require('electron').remote.getCurrentWebContents().setImageAnimationPolicy('animate'); } catch { /* no remote */ } return 1; })()`);
		for (let i = 0; i < 40 && (await say(POINTS)) !== 'mouse'; i++) await sleep(25);
	};
	const send = async (method, params = {}) => {
		const r = await raw(method, params);
		if (hover && method === 'Emulation.setTouchEmulationEnabled' && !params.enabled) await mouseBack();
		return r;
	};
	await send('Runtime.enable');
	await send('Page.enable');
	await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
	const ev = async (expr) => {
		const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
		if (r.error) throw new Error('evaluate: ' + r.error.message);
		if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
		return r.result.result?.value;
	};
	for (let i = 0; i < 80 && !(await ev('!!(window.app && app.workspace && app.workspace.layoutReady)').catch(() => false)); i++) await sleep(250);
	if (await ev('app.vault.adapter.basePath') !== vaultDir) { ws.close(); end(proc, work)(); throw new Error('Refusing to test a vault outside this session’s throwaway copy'); }
	// which Obsidian this is, from what it tells the page: OBSIDIAN_ASAR can point at any build, and a run should say which
	const ua = await ev('navigator.userAgent');
	const running = { obsidian: /obsidian\/([\d.]+)/i.exec(ua)?.[1] ?? '?', electron: /Electron\/([\d.]+)/.exec(ua)?.[1] ?? '?' };
	await ev(`(async () => { app.plugins.setEnable(true); await app.plugins.loadManifests(); await app.plugins.enablePluginAndSave('binders'); app.changeTheme(${JSON.stringify(theme === 'dark' ? 'obsidian' : 'moonstone')}); })().then(() => 1)`);
	// a fresh vault with plugins asks whether to trust its author: say yes, then close anything left open
	for (let i = 0; i < 20; i++) {
		const done = await ev(`(() => { const b = [...document.querySelectorAll('.modal button')].find(b => /trust/i.test(b.textContent)); if (b) { b.click(); return true; } return false; })()`).catch(() => false);
		if (done) break;
		await sleep(250);
	}
	await sleep(400);
	await ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`).catch(() => {});
	// headless, activeWindow points at an about:blank iframe (or Obsidian's notice window), so Obsidian's hotkeys never
	// fire and menus shown without a position open there: focus the main window again (after a reload too)
	const focusMain = () => ev(`(() => { window.dispatchEvent(new FocusEvent('focus')); window.activeWindow = window; window.activeDocument = document; return 1; })()`);
	await focusMain();

	const named = { Escape: ['Escape', 27], Enter: ['Enter', 13], Backspace: ['Backspace', 8], Delete: ['Delete', 46], Tab: ['Tab', 9], ArrowDown: ['ArrowDown', 40], ArrowUp: ['ArrowUp', 38], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], '/': ['Slash', 191], '.': ['Period', 190], '?': ['Slash', 191], '+': ['Equal', 187], '=': ['Equal', 187], '-': ['Minus', 189], ' ': ['Space', 32], Home: ['Home', 36], End: ['End', 35], F2: ['F2', 113], F10: ['F10', 121], ContextMenu: ['ContextMenu', 93] };
	const mods = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
	let mx = width / 2, my = height / 2;
	const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
	const o = {
		ev, send, sleep, errors, width, height, vaultDir, focusMain, running,
		/** True once the connection to Obsidian has closed (it crashed, or was ended from outside): launch another. */
		get gone() { return link.closed; },
		/** The pointer the page believes it has: 'mouse' (it hovers), 'touch' (touch emulation is on) or 'none'. */
		pointer: () => ev(POINTS),
		/** The text of the tooltip showing now, or null. */
		tooltip: () => ev(`(() => { const t = [...document.querySelectorAll('.tooltip')].pop(); return t ? t.textContent : null; })()`),
		/** Rests the pointer on an element (a selector and which match, or a point) and waits for the tooltip that brings
		    up: its text, or null if none came in `ms`. With no tooltip to wait for, pass `ms: 0`. */
		async hover(target, { i = 0, ms = 1500 } = {}) {
			const at = typeof target === 'string' ? await o.at(target, i) : target;
			if (!at) throw new Error(`nothing to hover: ${target}`);
			// a tooltip comes when the pointer enters, so come from outside, and wait for one that wasn't there before
			if (at.w && Math.abs(mx - at.x) <= at.w / 2 && Math.abs(my - at.y) <= at.h / 2) await o.move(at.l - 3, at.t - 3, 2);
			await ev(`(() => { window.__bindersTip = [...document.querySelectorAll('.tooltip')].pop() ?? null; return 1; })()`);
			await o.move(at.x, at.y, 6);
			for (let n = 0; n < ms / 50; n++) {
				const tip = await ev(`(() => { const t = [...document.querySelectorAll('.tooltip')].pop(); return t && t !== window.__bindersTip ? t.textContent : null; })()`);
				if (tip != null) return tip;
				await sleep(50);
			}
			return null;
		},
		async move(x, y, steps = 6, extra = {}) { for (let i = 1; i <= steps; i++) await mouse('mouseMoved', mx + (x - mx) * i / steps, my + (y - my) * i / steps, { button: extra.buttons ? 'left' : 'none', ...extra }); mx = x; my = y; },
		async click(x, y, extra = {}) { await o.focusMain(); await o.move(x, y, 2); await mouse('mousePressed', x, y, extra); await mouse('mouseReleased', x, y, extra); await sleep(60); },
		/** A real double-click: the second press has clickCount 2, so the page gets a `dblclick`. */
		async dbl(x, y, modifiers = 0) { await o.move(x, y, 2); for (const clickCount of [1, 2]) { await mouse('mousePressed', x, y, { clickCount, modifiers }); await mouse('mouseReleased', x, y, { clickCount, modifiers }); await sleep(40); } await sleep(150); },
		async right(x, y) { await o.focusMain(); await o.move(x, y, 2); await mouse('mousePressed', x, y, { button: 'right' }); await mouse('mouseReleased', x, y, { button: 'right' }); await sleep(120); },
		async drag(x0, y0, x1, y1, steps = 14, extra = {}) { await o.move(x0, y0, 2); await mouse('mousePressed', x0, y0, extra); mx = x0; my = y0; await o.move(x1, y1, steps, { buttons: 1, ...extra }); await mouse('mouseReleased', x1, y1, extra); await sleep(120); },
		async wheel(x, y, dy, ctrl = false, dx = 0) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: dx, deltaY: dy, modifiers: ctrl ? 2 : 0 }); },
		async key(key, ...m) {
			const modifiers = m.reduce((a, k) => a | mods[k], 0);
			const code = named[key] ? named[key][0] : /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : /^[0-9]$/.test(key) ? 'Digit' + key : undefined;
			const vk = named[key] ? named[key][1] : key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined;
			// Enter types a new line, as a real key does (in a textarea or a contenteditable, unless a handler prevents it)
			const text = !(modifiers & 2) && !(modifiers & 4) ? (key.length === 1 ? key : key === 'Enter' ? '\r' : undefined) : undefined;
			await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text, modifiers });
			await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
			await sleep(40);
		},
		async type(text) { for (const ch of text) await send('Input.insertText', { text: ch }); await sleep(60); },
		async shot(path) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.result.data, 'base64')); },
		/** Centre of the first element matching a selector, or null. */
		async at(sel, i = 0) { return ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width && !r.height) return null; return {x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height}; })()`); },
		async close() {
			try { ws.close(); } catch { /* gone */ }
			const clear = end(proc, work);
			for (let i = 0; i < 20 && proc.exitCode === null && proc.signalCode === null; i++) await sleep(100);
			force(proc.pid); // (and whatever of its group is left)
			await sleep(200);
			clear();
		},
	};
	return o;
}
