// The manuscript (src/view/manuscript.ts, src/view/editable-embed.ts): every note of a folder as one page of live
// editors. Golden rule 2 lives here: every test that types checks the disk, byte for byte.
// Until the binder view shell mounts it, these tests mount the mode in a plain leaf with a ModeContext built in-page.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'manuscript: ' + name, fn });

const B = 'The Lighthouse';
const ORDER = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((n) => `${B}/${n}.md`);
const ALL = [...ORDER, `${B}/${B}.md`];
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
const snapshot = (p) => Object.fromEntries(ALL.map((f) => [f, disk(p, f)]));
const fm = (s) => (s.match(/^---\n[\s\S]*?\n---\n/) || [''])[0];
const J = JSON.stringify;
const M = '__ms.mode';

/** Mounts the manuscript on a folder in a new tab. The view shell does the same with its own context. */
async function mount(p, folder = B, { readOnly = false, owner = 'view' } = {}) {
	await p.ev(`(async () => {
		const pl = app.plugins.plugins.binders; await pl.binders.ready;
		const leaf = app.workspace.getLeaf('tab'); await leaf.setViewState({ type: 'empty' });
		app.workspace.setActiveLeaf(leaf, { focus: true });
		const view = leaf.view, host = view.contentEl; host.empty();
		const f = app.vault.getAbstractFileByPath(${J(folder)});
		const store = pl.binders, binder = store.binderOf(f);
		// a Component that lives as long as the plugin, for the plugin-unload test
		let owner = view;
		if (${J(owner)} === 'plugin') { const C = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(pl))).constructor; owner = new C(); pl.addChild(owner); }
		const typed = [];
		const ctx = { app, plugin: pl, store, binder, folder: f, owner, readOnly: ${J(readOnly)},
			props: () => ({ synopsis: '', status: '', label: '', target: 0 }), setProps: async () => {},
			openFile: (file, n) => app.workspace.getLeaf(n ? 'tab' : 'split').openFile(file), navigate: () => {},
			visible: () => true, filtering: () => false, made: () => {}, words: () => null, option: (k, d) => d, setOption: () => {},
			onTextChange: (file, text) => typed.push([file.path, text]) };
		const mode = pl.modeFactories.manuscript(host, ctx);
		mode.render();
		const ref = store.on('changed', () => mode.refresh());
		owner.register(() => store.offref(ref));
		window.__ms = { mode, leaf, view, host, ctx, owner, typed, ref };
		return 1;
	})()`);
	await settle(p);
}

/** Waits until the sections near the viewport are live (or rendered, when read only). */
async function settle(p, ms = 4000) {
	for (let i = 0; i < ms / 50; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; const near = m.scenes.filter(s => m.near.has(s.el)); return near.length > 0 && near.slice(0, m.liveMax).every(s => m.editable ? (s.live || s.broken) && !s.mounting : s.shown !== null); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(100);
}

const idx = (path) => `${M}.scenes.findIndex(s => s.file.path === ${J(path)})`;
const text = (p, path) => p.ev(`${M}.scenes[${idx(path)}].live.editor.getValue()`);

/** Puts the cursor at the end of the last line of text in a section and focuses it (mounting it if needed). */
async function focusEnd(p, path) {
	await p.ev(`(async () => { const m = ${M}, s = m.scenes[${idx(path)}]; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(100);
}
const flushAll = (p) => p.ev(`Promise.all(${M}.scenes.filter(s => s.live).map(s => s.live.flush())).then(() => 1)`);
const dirty = (p, path) => p.ev(`${M}.scenes[${idx(path)}].live.dirty`);
const activeIn = (p, path) => p.ev(`${M}.scenes[${idx(path)}].el.contains(document.activeElement)`);
const clearNotices = (p) => p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const addLineOutside = (p, path, how = 'process') => p.ev(`(async () => {
	const f = app.vault.getAbstractFileByPath(${J(path)});
	const edit = (s) => s.replace(/\\n---\\n/, '\\n---\\nFrom outside.\\n');
	if (${J(how)} === 'adapter') await app.vault.adapter.write(f.path, edit(await app.vault.adapter.read(f.path)));
	else if (${J(how)} === 'modify') await app.vault.modify(f, edit(await app.vault.read(f)));
	else await app.vault.process(f, edit);
	return 1; })()`);
/** Waits for a condition on disk (external writes reach Obsidian through its file watcher). */
async function until(p, fn, ms = 5000) { for (let i = 0; i < ms / 100; i++) { if (fn()) return true; await p.sleep(100); } return fn(); }

test('saving notes waits for a write already in flight; text and undo survive the delayed disk write', async (p, h, t) => {
	const f = ORDER[2];
	await mount(p);
	const before = disk(p, f);
	await focusEnd(p, f);
	await p.type(' Words waiting for disk.');
	await p.ev(`(() => {
		const m = ${M}, s = m.scenes[${idx(f)}], adapter = app.vault.adapter, write = adapter.write;
		window.__saveDone = false;
		adapter.write = async function (...args) {
			if (args[0] === ${J(f)}) {
				adapter.write = write;
				await new Promise(r => { window.__releaseWrite = r; });
			}
			return write.apply(this, args);
		};
		window.__firstWrite = s.live.flush();
		return 1;
	})()`);
	for (let i = 0; i < 40 && !(await p.ev('!!window.__releaseWrite')); i++) await p.sleep(25);
	await p.ev(`${M}.save([app.vault.getAbstractFileByPath(${J(f)})]).then(() => { window.__saveDone = true; }); 1`);
	await p.sleep(100);
	const early = await p.ev('window.__saveDone');
	await p.ev(`(async () => { window.__releaseWrite(); await window.__firstWrite; while (!window.__saveDone) await new Promise(r => setTimeout(r, 20)); delete window.__releaseWrite; })().then(() => 1)`);
	t.eq(early, false, 'save does not finish before the pending disk write');
	t.eq(disk(p, f), before.trimEnd() + ' Words waiting for disk.\n', 'all the text is written once');
	await p.key('z', 'ctrl');
	await flushAll(p);
	t.eq(disk(p, f), before, 'undo brings the original text back after the delayed save');
});

// ---- layout ----

test('shows every note in binder order, subfolders as headings, each a live editor on its own file', async (p, h, t) => {
	await mount(p);
	const r = await p.ev(`(() => { const m = ${M}; return {
		items: [...m.list.children].map(e => e.classList.contains('binders-manuscript-heading') ? '# ' + e.textContent : e.querySelector('.binders-manuscript-title').textContent),
		paths: m.scenes.map(s => s.file.path),
		live: m.scenes.map(s => !!s.live && !!s.el.querySelector('.cm-content[contenteditable=true]')),
		props: [...m.root.querySelectorAll('.metadata-container, .inline-title, .markdown-embed-link')].filter(e => e.offsetParent).length,
		heads: [...m.root.querySelectorAll('.binders-manuscript-heading > *')].map(e => e.tagName),
		focus: m.scenes.some(s => s.el.contains(document.activeElement)) || m.scenes.some(s => s.live && s.live.editor === app.workspace.activeEditor?.editor),
	}; })()`);
	t.eq(r.items.join('|'), 'Prologue|# Part One|Arrival|The keeper|Storm warning|# Part Two|The wreck|Lights out|Epilogue', 'reading order with headings');
	t.eq(r.paths.join('|'), ORDER.join('|'), 'one section per scene');
	t.ok(r.live.every(Boolean), 'every section is a live editor: ' + J(r.live));
	t.eq(r.props, 0, 'no properties, inline title or embed link showing');
	t.eq(r.heads.join(','), 'H1,H1', 'subfolders are top-level headings');
	t.eq(r.focus, false, 'mounting does not take focus');
	for (const f of ORDER) t.eq(await text(p, f), disk(p, f), `${f}: the editor holds the file`);
});

test('a nested folder heading goes one level down, and a subfolder shows only its own notes', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('${B}/Part One/Night'); await app.vault.create('${B}/Part One/Night/Watch.md', 'The lamp turned.\\n'); return 1; })()`);
	await p.sleep(500);
	await mount(p, `${B}/Part One`);
	const r = await p.ev(`[...${M}.list.children].map(e => e.classList.contains('binders-manuscript-heading') ? e.firstElementChild.tagName + ' ' + e.textContent : e.querySelector('.binders-manuscript-title').textContent).join('|')`);
	t.eq(r, 'Arrival|The keeper|Storm warning|H1 Night|Watch', 'the folder\'s scenes and its subfolder');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('${B}/Part One/Night'), true).then(() => 1)`);
});

test('an empty folder says so', async (p, h, t) => {
	await p.ev(`app.vault.createFolder('${B}/Part Three').then(() => 1)`);
	await p.sleep(400);
	try {
		await mount(p, `${B}/Part Three`);
		t.eq(await p.ev(`${M}.root.querySelector('.binders-empty-title')?.textContent`), 'No notes in this folder yet', 'empty state');
	} finally {
		await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('${B}/Part Three'), true).then(() => 1)`);
	}
});

// ---- typing and saving ----

test('typing in a section saves to exactly that file; every other file byte-identical, frontmatter too', async (p, h, t) => {
	const before = snapshot(p);
	await mount(p);
	const f = ORDER[2];
	await focusEnd(p, f);
	await p.type(' Typed here.');
	await p.key('Enter');
	await p.type('New line');
	t.ok(await activeIn(p, f), 'focus stays in the section');
	t.eq(await p.ev(`app.workspace.activeEditor?.editor === ${M}.scenes[${idx(f)}].live.editor`), true, 'the section is the active editor');
	await p.sleep(2600); // the embed's own debounced save
	const after = snapshot(p);
	t.eq(after[f], before[f].replace(/\n$/, '') + ' Typed here.\nNew line\n', 'the typing is in its file');
	t.eq(fm(after[f]), fm(before[f]), 'frontmatter byte-identical');
	for (const k of Object.keys(before)) if (k !== f) t.eq(after[k], before[k], `${k} untouched`);
});

test('the view reports typing as it happens (for the word count)', async (p, h, t) => {
	await mount(p);
	await focusEnd(p, ORDER[0]);
	await p.type(' more words');
	await p.sleep(400);
	const last = await p.ev(`__ms.typed.filter(x => x[0] === ${J(ORDER[0])}).pop()?.[1] || ''`);
	t.ok(last.endsWith(' more words\n'), 'onTextChange got the text: ' + J(last.slice(-30)));
	await flushAll(p);
});

test('hotkeys and commands act on the focused section only; undo and redo are per section', async (p, h, t) => {
	await mount(p);
	const [a, b] = [ORDER[0], ORDER[1]];
	const origA = await text(p, a), origB = await text(p, b);
	await focusEnd(p, a); await p.type(' one');
	await focusEnd(p, b); await p.type(' two ');
	await p.key('b', 'ctrl'); await p.type('bold'); await p.sleep(100);
	t.ok((await text(p, b)).includes(' two **bold**'), 'Ctrl+B bolds in the focused section: ' + J((await text(p, b)).slice(-30)));
	t.ok(!(await text(p, a)).includes('**'), 'the other section is untouched');
	let n = 0; while ((await text(p, b)) !== origB && n < 15) { await p.key('z', 'ctrl'); n++; }
	t.eq(await text(p, b), origB, 'undo takes this section back to its original text');
	t.ok((await text(p, a)).includes(' one'), 'the other section keeps its typing');
	await p.key('z', 'ctrl', 'shift'); await p.sleep(80);
	t.ok((await text(p, b)) !== origB, 'redo brings typing back');
	await focusEnd(p, a);
	n = 0; while ((await text(p, a)) !== origA && n < 15) { await p.key('z', 'ctrl'); n++; }
	t.eq(await text(p, a), origA, 'the first section has its own history');
	await focusEnd(p, a); await p.type(' ');
	t.eq(await p.ev(`app.commands.executeCommandById('editor:toggle-italics')`), true, 'the italic command runs');
	await p.type('it'); await p.sleep(80);
	t.ok((await text(p, a)).includes(' *it*') && !(await text(p, b)).includes('*it*'), 'the command lands in the focused section only');
	await flushAll(p);
	t.eq(disk(p, a), await text(p, a), 'saved');
});

test('undo reaches typing from before a section was unmounted and mounted again', async (p, h, t) => {
	await mount(p);
	const f = ORDER[3], orig = await text(p, f);
	await focusEnd(p, f); await p.type(' before scrolling away');
	await p.ev(`(async () => { const m = ${M}, s = m.scenes[${idx(f)}]; document.activeElement.blur(); m.unmount(s); await m.mount(s); return 1; })()`);
	t.ok(disk(p, f).includes(' before scrolling away'), 'unmounting saved the typing at once');
	t.ok((await text(p, f)).includes(' before scrolling away'), 'mounted again with it');
	await focusEnd(p, f); await p.key('z', 'ctrl'); await p.sleep(100);
	t.eq(await text(p, f), orig, 'undo still works');
	await flushAll(p);
	t.eq(disk(p, f), orig, 'and saves');
});

test('select all then typing replaces only the body; frontmatter kept', async (p, h, t) => {
	await mount(p);
	const f = ORDER[4], before = disk(p, f);
	await focusEnd(p, f);
	await p.key('a', 'ctrl'); await p.type('Z');
	await flushAll(p);
	t.eq(disk(p, f), fm(before) + 'Z', 'body replaced, frontmatter byte-identical');
});

// ---- outside changes ----

for (const how of ['adapter', 'modify', 'process']) test(`an outside edit (${how}) during unsaved typing: both kept`, async (p, h, t) => {
	await mount(p);
	const f = ORDER[1];
	await focusEnd(p, f); await p.type(' Unsaved typing.');
	t.eq(await dirty(p, f), true, 'save pending');
	await addLineOutside(p, f, how);
	// the adapter write reaches Obsidian through its file watcher
	await until(p, () => false, how === 'adapter' ? 1500 : 500);
	await p.type(' And more.');
	await p.sleep(2800);
	const d = disk(p, f);
	t.ok(d.includes('From outside.') && d.includes(' Unsaved typing. And more.'), 'the file has both: ' + J(d));
	t.eq(await text(p, f), d, 'editor and disk agree');
	t.ok(/^---\n[\s\S]*\n---\n/.test(d), 'frontmatter intact');
	await clearNotices(p);
});

test('an outside edit during typing, with the same note also open in a tab: both kept everywhere', async (p, h, t) => {
	await mount(p);
	const f = ORDER[1];
	await p.ev(`(async () => { const l = window.__tab = app.workspace.getLeaf('split'); await l.openFile(app.vault.getAbstractFileByPath(${J(f)})); return 1; })()`);
	await p.sleep(400);
	await focusEnd(p, f); await p.type(' from section');
	await p.sleep(200);
	t.ok((await p.ev(`__tab.view.editor.getValue()`)).includes(' from section'), 'the tab shows the section\'s typing before any save');
	await addLineOutside(p, f, 'modify');
	await p.sleep(600);
	await p.ev(`(() => { const ed = __tab.view.editor; ed.focus(); const n = ed.lastLine() - 1; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.type(' from tab');
	await p.sleep(3000);
	const d = disk(p, f);
	t.ok(d.includes('From outside.') && d.includes(' from section from tab'), 'disk has all three: ' + J(d));
	t.eq(await text(p, f), d, 'the section agrees with disk');
	t.eq(await p.ev(`__tab.view.editor.getValue()`), d, 'the tab agrees with disk');
	await clearNotices(p);
});

test('a property change (processFrontMatter, as the corkboard does) during unsaved typing: both kept', async (p, h, t) => {
	await mount(p);
	const f = ORDER[0];
	await focusEnd(p, f); await p.type(' Still typing.');
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${J(f)}), fm => { fm.status = 'revised'; }).then(() => 1)`);
	await p.sleep(400);
	await p.type(' Yes.');
	await p.sleep(2800);
	const d = disk(p, f);
	t.ok(d.includes('status: revised') && d.includes(' Still typing. Yes.'), 'both kept: ' + J(d));
	t.eq(await text(p, f), d, 'editor and disk agree');
	await clearNotices(p);
});

test('a delayed notification of an earlier save cannot replay removed text; a real outside revert and undo still work', async (p, h, t) => {
	await mount(p);
	const f = ORDER[0];
	await focusEnd(p, f); await p.type(' First saved draft.'); await flushAll(p);
	await p.sleep(700);
	const earlier = await text(p, f);
	await p.ev(`(() => { const e = ${M}.scenes[${idx(f)}].live.editor, at = e.getValue().indexOf(' First saved draft.'); e.replaceRange('', e.offsetToPos(at), e.offsetToPos(at + ' First saved draft.'.length)); return 1; })()`);
	await flushAll(p);
	const current = await text(p, f);
	await p.ev(`(() => { const file = app.vault.getAbstractFileByPath(${J(f)}); app.metadataCache.trigger('changed', file, ${J(earlier)}, app.metadataCache.getFileCache(file)); return 1; })()`);
	await p.sleep(700);
	t.eq(await text(p, f), current, 'the late notification does not restore text removed through the editor');
	t.eq(disk(p, f), current, 'the current draft stays on disk');
	await p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${J(f)}), ${J(earlier)}).then(() => 1)`);
	await p.sleep(700);
	t.eq(await text(p, f), earlier, 'a genuine external revert to the earlier draft is accepted');
	await focusEnd(p, f); await p.type(' After the outside revert.'); await flushAll(p);
	await p.sleep(600); await p.key('z', 'ctrl'); await flushAll(p);
	t.eq(disk(p, f), earlier, 'undo removes the new typing and keeps every word of the external revert');
});

test('a delayed notification during a newer write cannot replay removed text; a real outside revert and undo still work', async (p, h, t) => {
	await mount(p);
	const f = ORDER[0];
	await focusEnd(p, f); await p.type(' First saved draft.'); await flushAll(p);
	await p.sleep(700);
	const earlier = await text(p, f);
	await p.ev(`(() => { const e = ${M}.scenes[${idx(f)}].live.editor, at = e.getValue().indexOf(' First saved draft.'); e.replaceRange('', e.offsetToPos(at), e.offsetToPos(at + ' First saved draft.'.length)); return 1; })()`);
	await p.ev(`(() => {
		const adapter = app.vault.adapter, write = adapter.write;
		adapter.write = async function (...args) {
			if (args[0] === ${J(f)}) { adapter.write = write; await new Promise(r => { window.__releaseNewerWrite = r; }); }
			return write.apply(this, args);
		};
		window.__newerWrite = ${M}.scenes[${idx(f)}].live.flush();
		return 1;
	})()`);
	for (let i = 0; i < 40 && !(await p.ev('!!window.__releaseNewerWrite')); i++) await p.sleep(25);
	const current = await text(p, f);
	await p.ev(`(() => { const file = app.vault.getAbstractFileByPath(${J(f)}); app.metadataCache.trigger('changed', file, ${J(earlier)}, app.metadataCache.getFileCache(file)); return 1; })()`);
	await p.sleep(100);
	const during = await text(p, f);
	await p.ev('(async () => { window.__releaseNewerWrite(); await window.__newerWrite; delete window.__releaseNewerWrite; return 1; })()');
	await p.sleep(700);
	t.eq(during, current, 'the older notification cannot replace the editor while the newer write is held');
	t.eq(await text(p, f), current, 'the late notification does not restore text removed through the editor');
	t.eq(disk(p, f), current, 'the current draft stays on disk');
	await p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${J(f)}), ${J(earlier)}).then(() => 1)`);
	await p.sleep(700);
	t.eq(await text(p, f), earlier, 'a genuine external revert to the earlier draft is accepted');
	await focusEnd(p, f); await p.type(' After the outside revert.'); await flushAll(p);
	await p.sleep(600); await p.key('z', 'ctrl'); await flushAll(p);
	t.eq(disk(p, f), earlier, 'undo removes the new typing and keeps every word of the external revert');
});

test('an outside edit to a section keeps its cursor and undo history', async (p, h, t) => {
	await mount(p);
	const f = ORDER[5];
	await focusEnd(p, f); await p.type(' mine'); await flushAll(p);
	const cursor = await p.ev(`JSON.stringify(${M}.scenes[${idx(f)}].live.editor.getCursor())`);
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${J(f)}), s => s + 'Added outside.\\n').then(() => 1)`);
	await p.sleep(800);
	t.ok((await text(p, f)).endsWith(' mine\nAdded outside.\n'), 'the outside text shows');
	t.eq(await p.ev(`JSON.stringify(${M}.scenes[${idx(f)}].live.editor.getCursor())`), cursor, 'cursor kept');
	await p.key('z', 'ctrl'); await p.key('z', 'ctrl'); await p.sleep(100);
	t.ok(!(await text(p, f)).includes(' mine'), 'undo reaches typing from before the outside edit');
	await flushAll(p);
});

test('a second manuscript mounting a note with unsaved typing elsewhere starts from that typing, not the old file', async (p, h, t) => {
	await mount(p);
	const f = ORDER[0], before = disk(p, f);
	await focusEnd(p, f); await p.type(' first');
	// another view of the binder opens without taking focus (the first section keeps its unsaved typing)
	const second = await p.ev(`(async () => {
		const leaf = app.workspace.getLeaf('split'); await leaf.setViewState({ type: 'empty' });
		const host = leaf.view.contentEl; host.empty();
		const ctx = Object.assign({}, __ms.ctx, { owner: leaf.view });
		const m = app.plugins.plugins.binders.modeFactories.manuscript(host, ctx); m.render();
		window.__ms2 = { mode: m, leaf };
		const s = m.scenes[0]; await m.mount(s);
		return s.live.editor.getValue(); })()`);
	t.ok(await activeIn(p, f), 'focus stayed in the first manuscript');
	t.ok(second.endsWith(' first\n'), 'the new section has the unsaved typing: ' + J(second.slice(-30)));
	await p.ev(`(() => { const ed = __ms2.mode.scenes[0].live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.type(' second');
	await p.sleep(2800);
	t.eq(disk(p, f), before.replace(/\n$/, '') + ' first second\n', 'both, once');
	await p.ev(`(() => { __ms2.leaf.detach(); return 1; })()`);
});

// ---- moving between sections ----

test('ArrowDown at the end of a section goes into the next; ArrowUp at the start goes back', async (p, h, t) => {
	await mount(p);
	const [a, b] = [ORDER[0], ORDER[1]];
	await focusEnd(p, a);
	await p.key('ArrowDown'); // to the empty last line
	await p.key('ArrowDown'); // into the next section
	t.ok(await activeIn(p, b), 'focus moved into the next section');
	t.eq(await p.ev(`app.workspace.activeEditor?.editor === ${M}.scenes[${idx(b)}].live.editor`), true, 'it is the active editor');
	await p.type('X');
	t.ok((await text(p, b)).startsWith(fm(disk(p, b)) + 'X'), 'typing lands at the start of its body, after the hidden properties: ' + J((await text(p, b)).slice(0, 90)));
	await p.key('Backspace');
	await p.key('ArrowUp');
	t.ok(await activeIn(p, a), 'ArrowUp at the start goes back');
	await p.type('Y');
	t.ok((await text(p, a)).endsWith('Y'), 'at the end of the previous section: ' + J((await text(p, a)).slice(-20)));
	await p.key('Backspace');
	// the middle of a section moves line by line, as usual
	await focusEnd(p, b); await p.key('Enter'); await p.type('two'); await p.key('ArrowUp');
	t.ok(await activeIn(p, b), 'ArrowUp inside a section stays in it');
	await p.key('z', 'ctrl'); await p.key('z', 'ctrl');
	await flushAll(p);
});

test('a section’s title is its note’s name: a click renames it in place, Mod-click and its menu open the note', async (p, h, t) => {
	await mount(p);
	const f = ORDER[6];
	await p.ev(`(() => { ${M}.scenes[${idx(f)}].el.scrollIntoView(); return 1; })()`);
	await p.sleep(200);
	const at = await p.ev(`(() => { const r = ${M}.scenes[${idx(f)}].titleEl.getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })()`);
	const at2 = await p.ev(`(() => { const r = ${M}.scenes[${idx(f)}].titleEl.getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })()`);
	await p.right(at2.x, at2.y);
	const items = await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
	// the menu a card has for the same note: open it, rename it, set its status and label, move it, delete it (last)
	t.eq(items.slice(0, 3).join('|'), 'Open|Open in new tab|Open to the right', 'menu: ' + items.join('|'));
	for (const x of ['Rename', 'Set status', 'Set label', 'Duplicate', 'Move up', 'New note after this']) t.ok(items.includes(x), `the menu has “${x}”`);
	t.eq(items[items.length - 1], 'Delete', 'Delete comes last');
	t.ok(!items.includes('Move down'), 'the last section can’t move down');
	await p.key('Escape');
	await p.sleep(150);
	// a click: the title is edited where it is, as a note's own title is
	await p.click(at2.x, at2.y);
	await p.sleep(150);
	t.ok(await p.ev(`document.activeElement === ${M}.scenes[${idx(f)}].titleEl && document.activeElement.isContentEditable`), 'a click puts the title in edit');
	await p.key('a', 'ctrl'); await p.type('Afterword'); await p.key('Enter');
	await p.sleep(800);
	t.ok(existsSync(join(p.vaultDir, `${B}/Afterword.md`)) && !existsSync(join(p.vaultDir, f)), 'renamed on disk');
	t.eq(await p.ev(`${M}.scenes[${M}.scenes.length - 1].titleEl.textContent`), 'Afterword', 'title follows');
	// Mod-click: the note, in a new tab, as a link would
	const at3 = await p.ev(`(() => { const r = ${M}.scenes[${M}.scenes.length - 1].titleEl.getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })()`);
	await p.click(at3.x, at3.y, { modifiers: 2 });
	await p.sleep(500);
	t.ok(await p.ev(`app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === ${J(B + '/Afterword.md')})`), 'Mod-click opened the note');
});

// ---- the binder changing while the manuscript is open ----

test('reordering scenes while typing: sections follow, focus and typing kept, nothing lost', async (p, h, t) => {
	const before = snapshot(p);
	await mount(p);
	const f = ORDER[2]; // The keeper
	await focusEnd(p, f); await p.type(' Still here');
	await p.ev(`(async () => { const s = app.plugins.plugins.binders.binders; await s.moveUp(app.vault.getAbstractFileByPath(${J(f)})); await s.moveDown(app.vault.getAbstractFileByPath(${J(ORDER[4])})); return 1; })()`);
	await p.sleep(500);
	t.eq(await p.ev(`${M}.scenes.map(s => s.file.basename).join('|')`), 'Prologue|The keeper|Arrival|Storm warning|Lights out|The wreck|Epilogue', 'new order');
	t.eq(await p.ev(`[...${M}.list.children].map(e => e.textContent.slice(0, 12)).join('|').includes('Part One')`), true, 'headings kept');
	t.ok(await activeIn(p, f), 'focus kept in the moved section');
	await p.type(' and typing.');
	await p.sleep(2800);
	t.eq(disk(p, f), before[f].replace(/\n$/, '') + ' Still here and typing.\n', 'every keystroke in its file');
	for (const k of ORDER) if (k !== f) t.eq(disk(p, k), before[k], `${k} untouched`);
});

test('adding, deleting and renaming other scenes while typing', async (p, h, t) => {
	await mount(p);
	const f = ORDER[4]; // The wreck
	const before = disk(p, f);
	await focusEnd(p, f); await p.type(' A');
	await p.ev(`app.plugins.plugins.binders.binders.newScene(app.vault.getAbstractFileByPath('${B}/Part Two'), 0, 'Squall').then(() => 1)`);
	await p.sleep(500);
	await p.type(' B');
	await p.ev(`app.vault.trash(app.vault.getAbstractFileByPath(${J(ORDER[0])}), true).then(() => 1)`);
	await p.sleep(500);
	await p.type(' C');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${J(ORDER[6])}), '${B}/Coda.md').then(() => 1)`);
	await p.sleep(500);
	await p.type(' D');
	t.eq(await p.ev(`${M}.scenes.map(s => s.file.basename).join('|')`), 'Arrival|The keeper|Storm warning|Squall|The wreck|Lights out|Coda', 'sections follow the binder');
	t.eq(await p.ev(`${M}.scenes[${M}.scenes.length - 1].titleEl.textContent`), 'Coda', 'renamed title');
	t.ok(await activeIn(p, f), 'focus kept');
	t.ok(await p.ev(`${M}.scenes.find(s => s.file.basename === 'Squall').live !== undefined`), 'the new scene has a section');
	await p.sleep(2800);
	t.eq(disk(p, f), before.replace(/\n$/, '') + ' A B C D\n', 'all typing saved');
});

test('renaming and moving the scene being typed in: the section follows its file', async (p, h, t) => {
	await mount(p);
	const f = ORDER[1];
	const before = disk(p, f);
	await focusEnd(p, f); await p.type(' one');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${J(f)}), '${B}/Part One/Landfall.md').then(() => 1)`);
	await p.sleep(500);
	await p.type(' two');
	t.eq(await p.ev(`${M}.scenes[1].titleEl.textContent`), 'Landfall', 'title follows the rename');
	t.ok(await activeIn(p, `${B}/Part One/Landfall.md`), 'focus kept');
	// moved into another folder, as dragging a card to another part does
	await p.ev(`app.plugins.plugins.binders.binders.move(app.vault.getAbstractFileByPath('${B}/Part One/Landfall.md'), app.vault.getAbstractFileByPath('${B}/Part Two'), 0).then(() => 1)`);
	await p.sleep(600);
	await p.type(' three');
	t.eq(await p.ev(`${M}.scenes.map(s => s.file.basename).join('|')`), 'Prologue|The keeper|Storm warning|Landfall|The wreck|Lights out|Epilogue', 'the section moved with it');
	t.ok(await activeIn(p, `${B}/Part Two/Landfall.md`), 'focus kept after the move');
	await p.sleep(2800);
	t.eq(disk(p, `${B}/Part Two/Landfall.md`), before.replace(/\n$/, '') + ' one two three\n', 'every keystroke saved to the moved file');
	t.ok(!existsSync(join(p.vaultDir, f)), 'nothing left at the old path');
});

// ---- teardown saves ----

for (const [how, js] of [
	['closing the view', `__ms.leaf.detach()`],
	['switching modes (unload)', `${M}.unload()`],
]) test(`${how} with unsaved typing saves it at once`, async (p, h, t) => {
	await mount(p);
	const f = ORDER[3];
	const handlers = await p.ev(`(app.metadataCache._['changed'] || []).length`);
	await p.ev(`(window.__scope0 = app.keymap.getWindowStack(window).scope, 1)`);
	await focusEnd(p, f); await p.type(' last words');
	t.eq(await dirty(p, f), true, 'save pending');
	await p.ev(`(() => { ${js}; return 1; })()`);
	await p.sleep(300); // well inside the 2 s debounce
	t.ok(disk(p, f).includes(' last words'), 'saved');
	t.eq(await p.ev(`document.querySelectorAll('.binders-manuscript .cm-editor').length`), 0, 'no editors left');
	t.ok(await p.ev(`(app.metadataCache._['changed'] || []).length`) <= handlers - 7, 'the editors\' listeners are gone');
	t.ok(await p.ev(`!app.workspace.activeEditor || !!app.workspace.activeEditor.editor?.cm?.dom?.isConnected`), 'activeEditor not left on a removed section');
	t.ok(await p.ev(`app.keymap.getWindowStack(window).scope === __scope0`), 'no keymap scope left behind');
	await p.sleep(2500);
	t.eq((disk(p, f).match(/ last words/g) || []).length, 1, 'no late second save');
});

test('plugin unload with unsaved typing saves it', async (p, h, t) => {
	await mount(p, B, { owner: 'plugin' });
	const f = ORDER[5];
	await focusEnd(p, f); await p.type(' before unload');
	try {
		await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
		await p.sleep(300);
		t.ok(disk(p, f).includes(' before unload'), 'saved on unload');
	} finally {
		await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
		await p.sleep(500);
	}
});

// ---- read only ----

test('fallback: without editable embeds the manuscript is read only, says so, opens notes on click, writes nothing', async (p, h, t) => {
	const before = snapshot(p);
	await p.ev(`(() => { window.__md = app.embedRegistry.embedByExtension.md; app.embedRegistry.embedByExtension.md = undefined; return 1; })()`);
	try {
		await mount(p);
		const r = await p.ev(`(() => { const m = ${M}; return { editable: m.editable, ce: m.root.querySelectorAll('[contenteditable=true]').length, rendered: m.scenes.filter(s => s.shown !== null).length, notice: m.root.querySelector('.binders-manuscript-notice')?.textContent, first: m.scenes[0].bodyEl.innerText.trim() }; })()`);
		t.eq(r.editable, false, 'not editable');
		t.eq(r.ce, 0, 'nothing editable on the page');
		t.eq(r.rendered, ORDER.length, 'every note rendered');
		t.ok(/read only/.test(r.notice || ''), 'a notice says why: ' + r.notice);
		t.ok(r.first.startsWith('The light had not gone out') && !r.first.includes('---'), 'body without frontmatter: ' + r.first);
		const at = await p.ev(`(() => { const r = ${M}.scenes[1].bodyEl.getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
		await p.click(at.x, at.y);
		await p.sleep(400);
		t.ok(await p.ev(`app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === ${J(ORDER[1])})`), 'clicking a section opens its note');
		// an outside change re-renders
		await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${J(ORDER[0])}), s => s + 'Rendered again.\\n').then(() => 1)`);
		await p.sleep(600);
		t.ok((await p.ev(`${M}.scenes[0].bodyEl.innerText`)).includes('Rendered again.'), 'outside edits show');
		await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${J(ORDER[0])}), s => s.replace('Rendered again.\\n', '')).then(() => 1)`);
		await p.sleep(300);
		for (const k of Object.keys(before)) t.eq(disk(p, k), before[k], `${k} untouched`);
	} finally {
		await p.ev(`(() => { app.embedRegistry.embedByExtension.md = window.__md; return 1; })()`);
	}
});

test('a section’s menu: “New note after this” adds a section with its title ready to type; “Move up” moves the note; typing in other sections is kept', async (p, h, t) => {
	await mount(p);
	const f = ORDER[1], next = ORDER[2], before = snapshot(p);
	// unsaved typing in another section, to see it survive
	await focusEnd(p, ORDER[0]);
	await p.type(' Kept.');
	const menuOn = async (path, title) => {
		await p.ev(`(() => { ${M}.scenes.find(s => s.file.path === ${J(path)}).el.scrollIntoView({ block: 'center' }); return 1; })()`);
		await p.sleep(200);
		const at = await p.ev(`(() => { const r = ${M}.scenes.find(s => s.file.path === ${J(path)}).titleEl.getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })()`);
		await p.right(at.x, at.y);
		await p.ev(`(() => { [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${J(title)}).click(); return 1; })()`);
		await p.sleep(400);
	};
	await menuOn(f, 'New note after this');
	const names = () => p.ev(`${M}.scenes.map(s => s.file.path)`);
	const at = (await names()).indexOf(f) + 1, made = (await names())[at];
	t.ok(made && made !== next && /Untitled/.test(made), 'a new section right after it: ' + made);
	t.ok(await p.ev(`document.activeElement === ${M}.scenes[${at}].titleEl && document.activeElement.isContentEditable`), 'its title is ready to type');
	await p.key('a', 'ctrl'); await p.type('Interlude'); await p.key('Enter');
	await p.sleep(800);
	t.ok((await names()).some((x) => x.endsWith('/Interlude.md')), 'named');
	// move the section after it up, past the new one
	await menuOn(next, 'Move up');
	await p.sleep(400);
	const after = await names();
	t.ok(after.indexOf(next) === after.findIndex((x) => x.endsWith('/Interlude.md')) - 1, 'Move up puts the section before the one above it: ' + after.map((x) => x.split('/').pop()).join(', '));
	await flushAll(p);
	t.ok(disk(p, ORDER[0]).trimEnd().endsWith('Kept.'), 'typing in another section was kept through it all: ' + J(disk(p, ORDER[0]).slice(-30)));
	for (const k of ORDER.slice(1)) t.eq(disk(p, k), before[k], `${k} untouched`);
});
test('a read-only binder shows the manuscript read only', async (p, h, t) => {
	await mount(p, B, { readOnly: true });
	t.eq(await p.ev(`${M}.root.querySelectorAll('[contenteditable=true]').length`), 0, 'nothing editable');
	// (the binder view says why above its toolbar, once: the manuscript doesn't say it again)
	t.eq(await p.ev(`${M}.root.querySelectorAll('.binders-manuscript-notice').length`), 0, 'no second notice');
});

test('with live preview off in the vault, sections still hide the frontmatter', async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('livePreview', false); return 1; })()`);
	try {
		await mount(p);
		const lp = () => p.ev(`${M}.scenes.map(s => s.el.querySelector('.markdown-source-view.is-live-preview') && s.el.querySelector('.cm-line')?.textContent !== '---')`);
		t.ok((await lp()).every(Boolean), 'every section in live preview');
		t.eq(await p.ev(`app.vault.getConfig('livePreview')`), false, 'the vault setting is untouched');
		await p.ev(`(() => { app.vault.setConfig('livePreview', true); app.vault.setConfig('livePreview', false); return 1; })()`);
		await p.sleep(300);
		t.ok((await lp()).every(Boolean), 'still after the setting changes');
	} finally { await p.ev(`(() => { app.vault.setConfig('livePreview', true); return 1; })()`); }
});

// ---- a big binder ----

test('300 scenes: a few live editors, smooth scrolling, typing far down saved, the focused section never unmounted', async (p, h, t) => {
	const N = 300, PARTS = 10;
	const para = 'The sea came up the rocks and the light turned over it, and the keeper wrote it down. '.repeat(6);
	const body = `---\nstatus: draft\nsynopsis: A scene.\n---\n${para}\n\n${para}\n\n${para}\n`;
	await p.ev(`(async () => {
		await app.vault.createFolder('Big');
		for (let k = 0; k < ${PARTS}; k++) await app.vault.createFolder('Big/Part ' + String(k + 1).padStart(2, '0'));
		for (let i = 0; i < ${N}; i++) await app.vault.create('Big/Part ' + String(Math.floor(i / ${N / PARTS}) + 1).padStart(2, '0') + '/Scene ' + String(i).padStart(3, '0') + '.md', ${J(body)});
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Big'));
		return 1; })()`);
	await p.sleep(1500);
	try {
		const t0 = Date.now();
		await mount(p, 'Big');
		const mountMs = Date.now() - t0;
		const s0 = await p.ev(`(() => { const m = ${M}; return { n: m.scenes.length, live: m.scenes.filter(s => s.live).length, rendered: m.scenes.filter(s => s.shown !== null).length, nodes: m.root.querySelectorAll('*').length, h: m.root.scrollHeight }; })()`);
		t.eq(s0.n, N, 'all scenes listed');
		t.ok(s0.live >= 3 && s0.live <= 10, 'only a few live editors: ' + s0.live);
		// scroll through the whole page in steps, as a reader would, timing frames
		const scroll = await p.ev(`(async () => {
			const m = ${M}, frames = [];
			let last = performance.now(), run = true;
			const tick = (now) => { frames.push(now - last); last = now; if (run) requestAnimationFrame(tick); };
			requestAnimationFrame(tick);
			const t0 = performance.now(), jumps = [];
			for (let y = 0; y < m.root.scrollHeight - m.root.clientHeight; y += 400) {
				m.root.scrollTop = y;
				await new Promise(r => requestAnimationFrame(r));
				jumps.push(Math.abs(m.root.scrollTop - y));
				await new Promise(r => setTimeout(r, 16));
			}
			run = false;
			const f = frames.slice(2).sort((a, b) => a - b);
			return { ms: Math.round(performance.now() - t0), frames: f.length, p50: +f[Math.floor(f.length / 2)].toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1), max: +f[f.length - 1].toFixed(1), maxJump: Math.max(...jumps) };
		})()`);
		await settle(p);
		const liveEnd = await p.ev(`${M}.scenes.filter(s => s.live).length`);
		// what's on screen holds still while sections around it render and mount, scrolling down and up
		for (const [from, to] of [[0, 120], [260, 200], [200, 90]]) {
			// where it is on screen after each paint, for a second and a half while the sections around it settle
			const ys = await p.ev(`(async () => {
				const m = ${M}, frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
				m.scenes[${from}].el.scrollIntoView(); for (let i = 0; i < 30; i++) await frame();
				m.scenes[${to}].el.scrollIntoView({ block: 'center' });
				const ys = []; for (let i = 0; i < 90; i++) { await frame(); ys.push(Math.round(m.scenes[${to}].el.getBoundingClientRect().top)); }
				return ys; })()`);
			t.ok(ys.every((y) => Math.abs(y - ys[0]) < 2), `scene ${to} holds still after scrolling from ${from}: ${ys.join(' ')}`);
		}
		// type far down
		const far = 'Big/Part 09/Scene 250.md';
		await focusEnd(p, far);
		await p.type(' Far down.');
		// scroll back to the top while that section has focus and unsaved typing
		await p.ev(`(async () => { ${M}.root.scrollTop = 0; for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r)); return 1; })()`);
		await settle(p);
		// (left that far behind, the section is saved there and then: its editor is free to go)
		t.ok(disk(p, far).includes(' Far down.'), 'what was typed is saved once its section is scrolled away');
		// its editor lets go of the focus that far out of sight, but not of the cursor: the next key goes there
		t.ok(!(await activeIn(p, far)), 'its editor isn’t focused while it’s far out of sight');
		// (typed at once: what's typed while its editor comes back isn't lost)
		for (const ch of ' Still') await p.key(ch); // (real keys: with nothing in focus, only a key press can be heard)
		await p.sleep(300); await p.type('.');
		let back = false;
		for (let i = 0; i < 40 && !(back = await activeIn(p, far)); i++) await p.sleep(100);
		t.ok(back, 'a key typed puts the cursor back in it');
		t.ok(await p.ev(`(() => { const r = ${M}.scenes[${idx(far)}].el.getBoundingClientRect(), v = ${M}.root.getBoundingClientRect(); return r.bottom > v.top && r.top < v.bottom; })()`), 'typing brings the caret back into view');
		// leave it: once saved and not focused, it goes back to rendered text
		await p.ev(`(() => { document.activeElement.blur(); ${M}.root.scrollTop = 0; return 1; })()`);
		await p.sleep(4800);
		t.ok(disk(p, far).endsWith(para + ' Far down. Still.\n'), 'typing saved: ' + J(disk(p, far).slice(-40)));
		t.ok(await p.ev(`!${M}.scenes[${idx(far)}].live`), 'unmounted after saving: ' + J(await p.ev(`(() => { const m = ${M}, s = m.scenes[${idx(far)}]; return { dirty: s.live?.dirty, near: m.near.has(s.el), focus: s.el.contains(document.activeElement), active: document.activeElement?.className, live: m.scenes.filter(x => x.live).map(x => m.scenes.indexOf(x)), top: m.root.scrollTop }; })()`)));
		t.ok((await p.ev(`${M}.scenes[${idx(far)}].bodyEl.innerText`)).includes('Far down. Still.'), 'its rendered text has the typing');
		const liveNow = await p.ev(`${M}.scenes.filter(s => s.live).length`);
		t.ok(liveNow <= 10, 'live editors capped: ' + liveNow);
		// a click on a rendered section far away mounts it with the caret there
		await p.ev(`(() => { ${M}.scenes[180].el.scrollIntoView({ block: 'center' }); return 1; })()`);
		await p.sleep(50);
		const at = await p.ev(`(() => { const r = ${M}.scenes[180].bodyEl.getBoundingClientRect(); return { x: r.x + 40, y: r.y + 12 }; })()`);
		console.log('    300 scenes: ' + J({ mountMs, ...s0, liveAfterScroll: liveEnd, scroll }));
		await p.click(at.x, at.y);
		await p.sleep(400);
		t.ok(await p.ev(`!!${M}.scenes[180].live`) && await p.ev(`${M}.scenes[180].el.contains(document.activeElement)`), 'clicked section is live and focused');
		await p.type('Q');
		await flushAll(p);
		t.ok(disk(p, 'Big/Part 07/Scene 180.md').includes('Q'), 'typing there saved');
		t.eq(fm(disk(p, 'Big/Part 07/Scene 180.md')), '---\nstatus: draft\nsynopsis: A scene.\n---\n', 'its frontmatter kept');
		for (const k of ['Big/Part 01/Scene 000.md', 'Big/Part 05/Scene 149.md', 'Big/Part 10/Scene 299.md']) t.eq(disk(p, k), body, `${k} untouched`);
		console.log('    300 scenes: ' + J({ mountMs, ...s0, liveAfterScroll: liveEnd, scroll }));

	} finally {
		await p.ev(`(async () => { __ms?.leaf?.detach(); await app.vault.delete(app.vault.getAbstractFileByPath('Big'), true); return 1; })()`);
	}
});

// Mobile emulation reloads the app window. Keep this last; it restores desktop mode at the end.
test('mobile: live editors, typing, toolbar commands, merge, save on close', async (p, h, t) => {
	const reload = async (mobile) => {
		await p.ev(`(() => { setTimeout(() => app.emulateMobile(${mobile}), 50); return 1; })()`);
		await p.sleep(1500);
		for (let i = 0; i < 80; i++) { if (await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.modeFactories && app.isMobile === ${mobile})`).catch(() => false)) break; await p.sleep(250); }
		await p.sleep(800);
		await p.ev(`(() => { window.activeWindow = window; window.activeDocument = document; return 1; })()`);
		p.errors.length = 0; // a reload logs Electron's own warnings again
	};
	await reload(true);
	try {
		t.eq(await p.ev(`app.isMobile`), true, 'mobile mode');
		await p.ev(`(() => { const l = []; app.workspace.iterateRootLeaves(x => { l.push(x); }); l.forEach(x => x.detach()); return 1; })()`);
		await mount(p);
		t.eq(await p.ev(`${M}.editable && ${M}.scenes.filter(s => s.live).length`), 6, 'live editors on mobile, six at most');
		t.eq(await p.ev(`${M}.liveMax`), 6, 'fewer live editors on phones');
		const f = ORDER[1];
		await focusEnd(p, f); await p.type(' on the phone ');
		await p.sleep(600); // close the undo group
		t.ok(await p.ev(`!!document.querySelector('.mobile-toolbar') && document.querySelector('.mobile-toolbar').offsetParent !== null`), 'the mobile toolbar shows for the focused section');
		await p.ev(`app.commands.executeCommandById('editor:toggle-bold')`); await p.type('b'); await p.sleep(600);
		t.ok((await text(p, f)).includes(' on the phone **b**'), 'bold from the toolbar command');
		t.eq(await p.ev(`app.commands.executeCommandById('editor:undo')`), true, 'undo command'); await p.sleep(100);
		t.ok(!(await text(p, f)).includes('**b**'), 'undone');
		await addLineOutside(p, f, 'modify');
		await p.sleep(600);
		await p.ev(`(() => { __ms.leaf.detach(); return 1; })()`);
		await p.sleep(300);
		const d = disk(p, f);
		t.ok(d.includes('From outside.') && d.includes(' on the phone '), 'merged and saved on close: ' + J(d));
		await clearNotices(p);
	} finally {
		await reload(false);
	}
});
