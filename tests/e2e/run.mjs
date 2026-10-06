// End-to-end tests in real, headless Obsidian (see driver.mjs). Each run uses a throwaway copy of test-vault.
//   npm run e2e                     all tests, light theme
//   npm run e2e -- --theme dark     or: --theme both
//   npm run e2e -- --grep order     only tests whose name matches
//   npm run e2e -- --repeat 3       run everything several times
//   npm run e2e -- --specs a.mjs,b.mjs    only these spec files (default: every tests/e2e/specs*.mjs)
//   npm run e2e -- --shots dir      where failure screenshots go (default test-dist/e2e-failures)
//   npm run e2e -- --hover          a mouse that hovers (see docs/dev/development.md); also BINDERS_HOVER=1
//   npm run e2e -- --timeout 1200   how long one test may take, in seconds (default 600); a test's own `timeout` (ms,
//                                   beside its name and fn) wins. A test over its limit fails, and its Obsidian is replaced.
// Tests listed in open-findings.json are known to fail (see there): they're reported, and don't fail the run.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import { launch, VAULT } from './driver.mjs';
import { TimedOut, limitOf, withLimit } from './run-all-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const themes = arg('theme', 'light') === 'both' ? ['light', 'dark'] : [arg('theme', 'light')];
const grep = arg('grep', '') ? new RegExp(arg('grep'), 'i') : null;
const repeat = Number(arg('repeat', '1'));
const shots = arg('shots', 'test-dist/e2e-failures');
mkdirSync(shots, { recursive: true });

// the pristine test vault, so each test starts from the same notes
const pristine = new Map();
const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (f === '.obsidian') continue; if (statSync(p).isDirectory()) walk(p); else if (/\.md$/.test(f)) pristine.set(relative(VAULT, p), readFileSync(p, 'utf8')); } };
walk(VAULT);

const specFiles = arg('specs', '') ? arg('specs').split(',') : readdirSync('tests/e2e').filter((f) => /^specs.*\.mjs$/.test(f)).map((f) => 'tests/e2e/' + f);
const specs = [];
for (const f of specFiles) specs.push(...(await import(pathToFileURL(f).href)).specs);

// Findings still open, by the test's name: scenarios kept failing on purpose until what they show is fixed or decided.
// One of them failing doesn't fail the run; one of them passing is said at the end, so the list stays true.
const OPEN = 'tests/e2e/open-findings.json';
const open = new Set(existsSync(OPEN) ? JSON.parse(readFileSync(OPEN, 'utf8')).map((f) => f.name) : []);

class Fail extends Error {}
const results = [];
let lost = 0;
for (let round = 1; round <= repeat; round++) {
	for (const theme of themes) {
		// (an Obsidian that doesn't come up in three minutes isn't going to: twice more, then the run ends saying so)
		const start = async () => {
			for (let tries = 1; ; tries++) {
				try { return await withLimit(launch({ theme, ...(process.argv.includes('--hover') ? { hover: true } : {}) }), 180000, 'starting Obsidian'); } catch (e) {
					if (tries >= 3) throw e;
					console.log(`Obsidian did not start (${e.message}): trying again.`);
				}
			}
		};
		let p = await start(), h = helpers(p);
		// (OBSIDIAN_ASAR can point at an older build: every log says which one ran)
		console.log(`Obsidian ${p.running.obsidian}, Electron ${p.running.electron}${repeat > 1 ? ` [${theme} #${round}]` : themes.length > 1 ? ` [${theme}]` : ''}`);
		for (const s of specs) {
			if (grep && !grep.test(s.name)) continue;
			const name = `${s.name} [${theme}${repeat > 1 ? ' #' + round : ''}]`;
			const t0 = Date.now();
			p.errors.length = 0;
			let err = null, stuck = false;
			const limit = limitOf(s, arg('timeout', ''));
			try {
				// One call that is never answered (it happened: a job sat two hours on one, and 402 tests never ran) must
				// not hold the run: past its limit the test has failed, and its Obsidian is ended below, which also ends
				// whatever the test is still waiting on.
				await withLimit((async () => {
					await h.reset();
					await s.fn(p, h, {
						ok: (c, m) => { if (!c) throw new Fail(m); },
						eq: (a, b, m) => { if (a !== b) throw new Fail(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
					});
					await p.sleep(80);
				})(), limit, 'the test');
				const bad = p.errors.filter((e) => !/ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/.test(e));
				if (bad.length) throw new Fail('errors logged: ' + bad.slice(0, 3).join(' ; '));
			} catch (e) {
				stuck = e instanceof TimedOut;
				err = stuck ? `timed out: ${e.message} (--timeout <seconds>, or a timeout in ms on the test, gives it longer)` : e instanceof Fail ? e.message : 'crashed: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ');
				// (the picture too is asked of a page that may never answer)
				await withLimit(p.shot(join(shots, name.replace(/[^\w]+/g, '_') + '.png')), 10000, 'the screenshot').catch(() => {});
			}
			const known = open.has(s.name);
			results.push({ name, ok: !err, err, known, ms: Date.now() - t0 });
			console.log(`${err ? (known ? '○' : '✗') : '✓'} ${name} ${err ? '\n    ' + err : ''} (${Date.now() - t0}ms)`);
			// Obsidian ended under that test (a crash, or the machine out of memory): the test has failed, and the rest
			// run in a new one. Four in a row, and it isn't going to start.
			// One that timed out is ended here: nothing says what state the page was left in, or that it answers at all.
			if (p.gone || stuck) {
				const ended = p.gone;
				await p.close().catch(() => {});
				if (ended && ++lost > 3) { console.log('Obsidian ended four times: stopping.'); process.exit(1); }
				console.log(ended ? 'Obsidian ended: starting another.' : 'That Obsidian is closed: starting another.');
				p = await start(); h = helpers(p);
			} else if (!err) lost = 0;
		}
		await p.close();
	}
}
const failed = results.filter((r) => !r.ok && !r.known), still = results.filter((r) => !r.ok && r.known), fixed = results.filter((r) => r.ok && r.known);
console.log(`\n${results.length - failed.length - still.length} passed, ${failed.length} failed${still.length ? `, ${still.length} open findings (${OPEN})` : ''}`);
if (fixed.length) console.log(`\nListed as open, and passing: take them off the list if that's for good\n${fixed.map((r) => '  ' + r.name).join('\n')}`);
process.exit(failed.length ? 1 : 0);

function helpers(p) {
	// Obsidian's own settings (the vault's config) as this Obsidian started with them, read before its first test
	let config = null;
	const h = {
		/** Close every pane (the plugin's views in a sidebar and every other window too), put every test note back as it
		    was, delete anything tests created, reset the plugin's settings and Obsidian's own, clear notices and the saved
		    mobile layout, and focus the main window. */
		async reset() {
			await p.focusMain();
			config ??= await p.ev(`JSON.stringify(app.vault.config ?? {})`);
			// the window and its sidebars as a fresh Obsidian has them: a test that opened the right sidebar (or failed
			// before it could give the window its size back) would narrow the pane of every test after it
			await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
			await p.ev(`(() => { app.workspace.leftSplit.expand(); app.workspace.rightSplit.collapse(); return 1; })()`);
			await p.ev(`(async () => {
				document.querySelectorAll('.modal-close-button').forEach(b => b.click());
				// the layout saved in mobile mode, so a test that switches to mobile starts from the same one every time
				const mobile = app.vault.configDir + '/workspace-mobile.json'; if (await app.vault.adapter.exists(mobile)) await app.vault.adapter.remove(mobile);
				const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); // not while iterating
				// and what isn't in the main window's middle: a view of the plugin's left in a sidebar (a phone's drawer too),
				// and everything in another window, which is then closed. One left over is counted by the next test that
				// counts binder views.
				const stray = []; app.workspace.iterateAllLeaves(l => { const type = l.getViewState().type, win = l.getContainer?.()?.win; if ((win && win !== window) || type === 'binders-view' || type === 'binders-snapshot') stray.push(l); });
				stray.forEach(l => l.detach());
				for (const w of [...(app.workspace.floatingSplit?.children ?? [])]) { try { w.win?.close(); } catch { /* closed with its last tab */ } }
				// Obsidian's own settings as they were: a test that sets one and fails before it puts it back (or puts it
				// back only at its end) would have every test after it deleting to the vault's trash, or typing in Vim
				const was = ${config}, now = app.vault.config ?? {};
				for (const k of new Set([...Object.keys(was), ...Object.keys(now)])) {
					if (JSON.stringify(was[k]) === JSON.stringify(now[k])) continue;
					if (k === 'theme' && typeof was[k] === 'string') { app.changeTheme(was[k]); continue; }
					app.vault.setConfig(k, was[k]); // (a key that wasn't there is taken away: Obsidian's default again)
					if (k === 'baseFontSize') app.updateFontSize?.();
					if (k === 'rightToLeft') { document.body.classList.toggle('mod-rtl', !!was[k]); document.body.dir = was[k] ? 'rtl' : ''; }
				}
				// what earlier tests put in the vault's trash: a note trashed again under the same name gets a number
				// ("The keeper 2.md"), and a test reading ".trash/The keeper.md" would read the older one
				try { if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); } catch { /* no trash in the vault: nothing to clear */ }
				// folders a test made and left (the notes in them are put right below; an extra folder would show in the
				// next test's binder)
				const own = new Set(['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'Longform demo']);
				for (const f of app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !own.has(f.path)).sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
				// (a binder opens as its view was last left: each test starts with none remembered)
				app.plugins.plugins.binders?.lastView?.clear();
				await new Promise(r => setTimeout(r, 150));
				const files = ${JSON.stringify([...pristine])};
				for (const [path, text] of files) {
					const f = app.vault.getAbstractFileByPath(path);
					if (f) await app.vault.modify(f, text); else { const dir = path.split('/').slice(0, -1).join('/'); if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir); await app.vault.create(path, text); }
				}
				const keep = new Set(files.map(f => f[0]));
				for (const f of app.vault.getFiles()) if (!keep.has(f.path) && f.extension === 'md') await app.vault.delete(f);
				// (and nothing remembered on this device about where exports are saved)
				app.saveLocalStorage('binders-export', null);
				// every setting back to its default: with no saved data, loadSettings() takes the defaults
				const pl = app.plugins.plugins.binders; if (pl) { await pl.saveData({}); await pl.loadSettings(); await pl.saveSettings(); pl.binders.refresh(); }
			})().then(() => 1)`);
			await p.sleep(250);
			// notices left by the last test (or by closing its views) could cover what the next one clicks; Obsidian 1.13
			// may show them in a window of their own, found through a notice of ours
			await p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		},
		open: (path) => p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${JSON.stringify(path)})).then(() => 1)`).then(() => p.sleep(400)),
		run: (id) => p.ev(`app.commands.executeCommandById('binders:${id}')`),
		Fail,
	};
	return h;
}
