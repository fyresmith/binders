// End-to-end tests in real, headless Obsidian (see driver.mjs). Each run uses a throwaway copy of test-vault.
//   npm run e2e                     all tests, light theme
//   npm run e2e -- --theme dark     or: --theme both
//   npm run e2e -- --grep order     only tests whose name matches
//   npm run e2e -- --all-themes     every test in every theme asked for (a core test runs in the light theme only, a look
//                                   test in both: tiers-lib.mjs)
//   npm run e2e -- --repeat 3       run everything several times
//   npm run e2e -- --specs a.mjs,b.mjs    only these spec files (default: every tests/e2e/specs*.mjs)
//   npm run e2e -- --shots dir      where failure screenshots go (default test-dist/e2e-failures)
//   npm run e2e -- --hover          a mouse that hovers (see docs/dev/development.md); also BINDERS_HOVER=1
//   npm run e2e -- --timeout 1200   how long one test may take, in seconds (default 600); a test's own `timeout` (ms,
//                                   beside its name and fn) wins. A test over its limit fails, and its Obsidian is replaced.
// Tests listed in open-findings.json are known to fail (see there), and so are those quarantine.json holds: they're
// reported, and don't fail the run. Nor does a failure of the look tier (tiers-lib.mjs): it is reported, as look.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import { launch, VAULT } from './driver.mjs';
import { TimedOut, limitOf, withLimit } from './run-all-lib.mjs';
import { quarantine, tiered, today } from './tiers-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const themes = arg('theme', 'light') === 'both' ? ['light', 'dark'] : [arg('theme', 'light')];
const grep = arg('grep', '') ? new RegExp(arg('grep'), 'i') : null;
const repeat = Number(arg('repeat', '1'));
const allThemes = process.argv.includes('--all-themes');
const shots = arg('shots', 'test-dist/e2e-failures');
mkdirSync(shots, { recursive: true });

// the pristine test vault, so each test starts from the same notes
const pristine = new Map();
// (every file of any kind is listed, and every folder: the reset takes away whatever else a test left)
const pristineFiles = new Set(), pristineDirs = new Set();
const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (f === '.obsidian') continue; if (statSync(p).isDirectory()) { pristineDirs.add(relative(VAULT, p)); walk(p); } else { pristineFiles.add(relative(VAULT, p)); if (/\.md$/.test(f)) pristine.set(relative(VAULT, p), readFileSync(p, 'utf8')); } } };
walk(VAULT);

const specFiles = arg('specs', '') ? arg('specs').split(',') : readdirSync('tests/e2e').filter((f) => /^specs.*\.mjs$/.test(f)).map((f) => 'tests/e2e/' + f);
const specs = [];
const LOOK = 'tests/e2e/tiers.json', looks = existsSync(LOOK) ? JSON.parse(readFileSync(LOOK, 'utf8')) : {};
for (const f of specFiles) specs.push(...tiered(await import(pathToFileURL(f).href), looks[f] ?? looks[f.replace(/^\.\//, '')]));

// Findings still open, by the test's name: scenarios kept failing on purpose until what they show is fixed or decided.
// One of them failing doesn't fail the run; one of them passing is said at the end, so the list stays true.
const OPEN = 'tests/e2e/open-findings.json';
const open = new Set(existsSync(OPEN) ? JSON.parse(readFileSync(OPEN, 'utf8')).map((f) => f.name) : []);
// (and the quarantine's, until their dates: tests that fail for a reason of the machine)
const QUARANTINE = 'tests/e2e/quarantine.json';
const held = quarantine(existsSync(QUARANTINE) ? JSON.parse(readFileSync(QUARANTINE, 'utf8')) : [], today());
for (const b of held.bad) console.log(b);

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
			if (!allThemes && !s.themes.includes(theme)) continue;
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
				// An exception fails the test, and so does an error or a warning logged by Binders' own code. What Obsidian,
				// CodeMirror or Electron log (a file indexed after a test renamed it, "Measure loop restarted") is theirs: it is
				// said here and doesn't fail it. A test that is about the console still reads every message in p.errors.
				const noise = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
				const said = p.errors.filter((e) => !noise.test(e)), blocking = said.filter((e) => e.ours || /^exception: /.test(e));
				if (said.length > blocking.length) console.log(`    · logged by Obsidian or CodeMirror, not failing: ${said.filter((e) => !blocking.includes(e)).slice(0, 2).map((e) => String(e).split('\n')[0].slice(0, 160)).join(' ; ')}`);
				if (blocking.length) throw new Fail('errors logged: ' + blocking.slice(0, 3).join(' ; '));
			} catch (e) {
				stuck = e instanceof TimedOut;
				err = stuck ? `timed out: ${e.message} (--timeout <seconds>, or a timeout in ms on the test, gives it longer)` : e instanceof Fail ? e.message : 'crashed: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ');
				// (the picture too is asked of a page that may never answer)
				await withLimit(p.shot(join(shots, name.replace(/[^\w]+/g, '_') + '.png')), 10000, 'the screenshot').catch(() => {});
			}
			const known = open.has(s.name) || held.active.has(s.name);
			results.push({ name, ok: !err, err, known, look: s.tier === 'look', ms: Date.now() - t0 });
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
const look = failed.filter((r) => r.look);
// (run-all.mjs reads the first line: "n passed, n failed" stays as it was, the look failures counted among the failed)
console.log(`\n${results.length - failed.length - still.length} passed, ${failed.length} failed${look.length ? ` (${look.length} of them look, which doesn't block)` : ''}${still.length ? `, ${still.length} open findings or quarantined` : ''}`);
if (look.length) console.log(`\nLook failures, reported and not blocking\n${look.map((r) => '  ' + r.name).join('\n')}`);
if (fixed.length) console.log(`\nListed as open or quarantined, and passing: take them off the list if that's for good\n${fixed.map((r) => '  ' + r.name).join('\n')}`);
process.exit(failed.length > look.length ? 1 : 0);

function helpers(p) {
	// Obsidian's own settings (the vault's config) as this Obsidian started with them, read before its first test
	let config = null;
	const h = {
		/** Close every pane (the plugin's views in a sidebar and every other window too), put every test note back as it
		    was, delete anything tests created, reset the plugin's settings and Obsidian's own, clear notices and the saved
		    mobile layout, and focus the main window. */
		async reset() {
			await p.focusMain();
			// a test that failed or timed out in its own wait may leave deletes running: the vault is quiet when its count of
			// files and folders is the same three times, a moment apart (ten seconds at most, then on regardless)
			await p.ev(`(async () => { let last = -1, same = 0; for (let i = 0; i < 100 && same < 2; i++) { const n = app.vault.getAllLoadedFiles().length; same = n === last ? same + 1 : 0; last = n; await new Promise(r => setTimeout(r, 100)); } return 1; })()`);
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
				const own = new Set(${JSON.stringify([...pristineDirs])});
				for (const f of app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !own.has(f.path)).sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
				// (and no record of the binders' writing kept in memory: the files went with the folders)
				app.plugins.plugins.binders?.progress?.forget();
				// (a binder opens as its view was last left: each test starts with none remembered)
				app.plugins.plugins.binders?.lastView?.clear();
				await new Promise(r => setTimeout(r, 150));
				const files = ${JSON.stringify([...pristine])};
				for (const [path, text] of files) {
					const f = app.vault.getAbstractFileByPath(path);
					if (f) await app.vault.modify(f, text); else { const dir = path.split('/').slice(0, -1).join('/'); if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir); await app.vault.create(path, text); }
				}
				// (and any file the pristine vault hasn't, of whatever kind: a picture a test saved would sit in the next
				// test's vault; Obsidian doesn't list .obsidian, and the trash is cleared above)
				const keep = new Set(${JSON.stringify([...pristineFiles])});
				for (const f of app.vault.getFiles()) if (!keep.has(f.path)) await app.vault.delete(f);
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
