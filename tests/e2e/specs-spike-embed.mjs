// Spike (0.6): editable Markdown embeds stacked on one page, as the manuscript will do.
// Builds the embeds in-page with plain JS against Obsidian's internals; see docs/spike-manuscript.md.
// Not product code: src/ is untouched. Delete or fold into specs-manuscript.mjs when 0.6 lands.
import { readFileSync } from 'fs';
import { join } from 'path';

export const specs = [];
const test = (name, fn) => specs.push({ name, fn });

const B = 'The Lighthouse';
const NOTES = [`${B}/Prologue.md`, `${B}/Part One/Arrival.md`, `${B}/Part One/The keeper.md`];
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
const snapshot = (p) => Object.fromEntries(NOTES.concat(`${B}/Epilogue.md`, `${B}/The Lighthouse.md`).map((f) => [f, disk(p, f)]));

// The wrapper under test, injected into the page. This is the sketch of mountEditor() in docs/spike-manuscript.md.
const INSTALL = `(() => {
	const S = window.__spike = window.__spike || {};
	// Harness quirk, not an embed issue: headless, activeWindow points at an about:blank iframe, so app.keymap looks up
	// the wrong window's scope and no Obsidian hotkey (even Ctrl+B in a normal note) fires. Real windows get focus events.
	window.activeWindow = window; window.activeDocument = document;
	S.supported = () => {
		const create = app.embedRegistry && app.embedRegistry.embedByExtension && app.embedRegistry.embedByExtension.md;
		if (typeof create !== 'function') return false;
		const probe = create({ app, containerEl: createDiv(), state: {} }, app.vault.getMarkdownFiles()[0], '');
		const ok = ['loadFile', 'showEditor', 'showPreview', 'save', 'set', 'loadFileInternal', 'onFileChanged', 'unload']
			.every(k => typeof probe[k] === 'function') && 'editable' in probe && typeof probe.requestSave?.cancel === 'function';
		return ok;
	};
	S.mount = async (container, file, parent, opts = {}) => {
		const el = container.createDiv({ cls: 'binders-section' });
		const embed = app.embedRegistry.embedByExtension.md({ app, containerEl: el, state: {} }, file, '');
		const proto = Object.getPrototypeOf(embed);
		embed.editable = true;
		// Native embeds ignore external changes while they have unsaved typing, then overwrite them on save.
		// Drop that gate: loadFileInternal already does a 3-way merge when dirty, like a normal note.
		if (opts.merge !== false) embed.onFileChanged = function (f, data, cache) { if (f === this.file && data !== this.data) this.loadFileInternal(data, cache); };
		parent.addChild(embed); // load(): registers metadataCache 'changed' + vault 'rename'
		await embed.loadFile();
		// A forced set() rebuilds the CodeMirror state (undo history and cursor lost). Keep external reloads incremental.
		if (opts.merge !== false) embed.set = function (text) { return proto.set.call(this, text, false); };
		// showEditor() focuses the new editor (and on mobile would raise the keyboard): put focus back where it was
		const prev = activeDocument.activeElement;
		embed.showEditor();
		// With "Live preview" off in the vault, the editor opens in source mode and shows the raw frontmatter.
		// The manuscript hides properties, so switch this editor (only) to live preview.
		if (embed.editMode.sourceMode && opts.livePreview !== false) embed.editMode.toggleSource();
		if (!opts.focus && el.contains(activeDocument.activeElement)) {
			app.workspace.unsetActiveEditor(embed);
			if (prev && prev !== activeDocument.body && prev.isConnected) prev.focus({ preventScroll: true }); else activeDocument.activeElement.blur();
		}
		// No focus handling needed for commands: the embed's editor sets workspace.activeEditor itself on focus
		// (and updates the mobile toolbar), so hotkeys and palette commands act on the focused section.
		const flush = async () => { embed.requestSave.cancel(); if (embed.editMode) embed.text = embed.editMode.get(); if (embed.dirty) await embed.save(embed.text, true); };
		return {
			embed, el,
			get editor() { return embed.editor; },
			flush,
			// saveHistory(): Obsidian's own per-file undo cache (last 20 files), restored when an editor opens that file again
			async unload() { await flush(); embed.editMode?.saveHistory?.(); parent.removeChild(embed); el.remove(); },
		};
	};
	S.host = async () => {
		const leaf = app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: 'empty' });
		app.workspace.setActiveLeaf(leaf, { focus: true });
		const view = leaf.view;
		const root = view.containerEl.children[1];
		root.empty();
		const scroller = root.createDiv({ cls: 'binders-manuscript' });
		scroller.style.cssText = 'overflow:auto;height:100%';
		S.leaf = leaf; S.view = view; S.scroller = scroller; S.sections = [];
		return scroller;
	};
	S.mountAll = async (paths, opts) => {
		const scroller = await S.host();
		for (const path of paths) S.sections.push(await S.mount(scroller, app.vault.getAbstractFileByPath(path), S.view, opts));
		return S.sections.length;
	};
	return 1;
})()`;

async function setup(p, opts = {}) {
	await p.ev(INSTALL);
	await p.ev(`__spike.mountAll(${JSON.stringify(NOTES)}, ${JSON.stringify(opts)})`);
	await p.sleep(300);
}
// Put the cursor at the end of the last line of text in section i and focus it.
async function focusEnd(p, i) {
	await p.ev(`(() => { const s = __spike.sections[${i}]; s.el.scrollIntoView(); const ed = s.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(80);
}
const text = (p, i) => p.ev(`__spike.sections[${i}].editor.getValue()`);

test('spike: three editable embeds mount, each a live editor on its own file', async (p, h, t) => {
	t.ok(await p.ev(INSTALL) && await p.ev(`__spike.supported()`), 'feature check passes');
	await setup(p);
	const info = await p.ev(`__spike.sections.map(s => ({ path: s.embed.file.path, mode: s.embed.getMode(), cm: !!s.el.querySelector('.cm-editor .cm-content[contenteditable=true]') }))`);
	t.eq(info.map((s) => s.path).join('|'), NOTES.join('|'), 'one section per note, in order');
	t.ok(info.every((s) => s.mode === 'source' && s.cm), 'every section is a live CodeMirror editor');
	t.ok(await p.ev(`!__spike.sections.some(s => s.el.contains(document.activeElement)) && !__spike.sections.some(s => s.embed === app.workspace.activeEditor)`), 'mounting does not steal focus or the active editor: ' + await p.ev(`JSON.stringify([document.activeElement?.className, __spike.sections.findIndex(s => s.el.contains(document.activeElement)), __spike.sections.findIndex(s => s.embed === app.workspace.activeEditor)])`));
	for (let i = 0; i < 3; i++) t.eq(await text(p, i), disk(p, NOTES[i]), `section ${i} holds its file's text`);
});

test('spike: typing into section 2 saves to that file only, other files byte-identical', async (p, h, t) => {
	const before = snapshot(p);
	await setup(p);
	await focusEnd(p, 1);
	await p.type(' Typed here.');
	await p.key('Enter');
	await p.type('New line');
	t.eq(await p.ev(`app.workspace.activeEditor === __spike.sections[1].embed`), true, 'the focused section is the active editor');
	// no flush: rely on the embed's own 2s debounced save
	await p.sleep(2600);
	const after = snapshot(p);
	t.eq(after[NOTES[1]], before[NOTES[1]].replace(/\n$/, '') + ' Typed here.\nNew line\n', 'section 2 file has the typing, frontmatter intact');
	for (const f of Object.keys(before)) if (f !== NOTES[1]) t.eq(after[f], before[f], `${f} untouched`);
});

test('spike: hotkeys route to the focused section (bold, undo, redo), per section', async (p, h, t) => {
	await setup(p);
	const orig1 = await text(p, 0), orig2 = await text(p, 1);
	await focusEnd(p, 0); await p.type(' one');
	await focusEnd(p, 1); await p.type(' two ');
	// Ctrl+B is an Obsidian hotkey (editor:toggle-bold), not a CodeMirror key: it runs a command on workspace.activeEditor
	await p.key('b', 'ctrl'); await p.type('bold'); await p.sleep(100);
	t.ok((await text(p, 1)).includes(' two **bold**'), 'bold applied in section 2: ' + JSON.stringify((await text(p, 1)).slice(-30)));
	t.ok(!(await text(p, 0)).includes('**'), 'section 1 untouched by the hotkey');
	// Ctrl+Z is CodeMirror's own keymap: each section has its own history
	let n = 0; while ((await text(p, 1)) !== orig2 && n < 12) { await p.key('z', 'ctrl'); n++; }
	t.eq(await text(p, 1), orig2, `undo in section 2 goes back to its original text (${n} steps)`);
	t.ok((await text(p, 0)).includes(' one'), 'section 1 keeps its typing (separate history)');
	await p.key('z', 'ctrl', 'shift'); await p.sleep(80);
	t.ok((await text(p, 1)) !== orig2, 'redo in section 2 brings typing back');
	await focusEnd(p, 0);
	n = 0; while ((await text(p, 0)) !== orig1 && n < 12) { await p.key('z', 'ctrl'); n++; }
	t.eq(await text(p, 0), orig1, 'undo in section 1 is its own history');
	// commands from the palette act on the focused section too (editor:undo/redo are mobile-only; see the mobile test)
	await focusEnd(p, 0); await p.type(' ');
	t.eq(await p.ev(`app.commands.executeCommandById('editor:toggle-italics')`), true, 'italic command runs');
	await p.type('it'); await p.sleep(80);
	t.ok((await text(p, 0)).includes(' *it*') && !(await text(p, 1)).includes('*it*'), 'italic lands in section 1 only');
	await p.ev(`Promise.all(__spike.sections.map(s => s.flush())).then(() => 1)`);
});

test('spike: external edit to a clean section shows up, keeps undo history and cursor', async (p, h, t) => {
	await setup(p);
	await focusEnd(p, 2); await p.type(' mine'); await p.ev(`__spike.sections[2].flush().then(() => 1)`);
	const cursor = await p.ev(`JSON.stringify(__spike.sections[2].editor.getCursor())`);
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(NOTES[2])}); await app.vault.process(f, s => s + 'Added outside.\\n'); })().then(() => 1)`);
	await p.sleep(800);
	t.ok((await text(p, 2)).endsWith(' mine\nAdded outside.\n'), 'external text appears: ' + JSON.stringify((await text(p, 2)).slice(-40)));
	t.eq(await p.ev(`JSON.stringify(__spike.sections[2].editor.getCursor())`), cursor, 'cursor stays put');
	await p.key('z', 'ctrl'); await p.key('z', 'ctrl'); await p.sleep(80);
	t.ok(!(await text(p, 2)).includes(' mine'), 'undo still reaches typing made before the external edit');
});

test('spike: external edit while a section has unsaved typing merges both, nothing lost', async (p, h, t) => {
	await setup(p);
	await focusEnd(p, 1); await p.type(' Unsaved typing.');
	t.eq(await p.ev(`__spike.sections[1].embed.dirty`), true, 'section is dirty (save pending)');
	// someone else (sync, another plugin) adds a line at the top of the body
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(NOTES[1])}); await app.vault.process(f, s => s.replace(/\\n---\\n/, '\\n---\\nFrom outside.\\n')); })().then(() => 1)`);
	await p.sleep(600);
	await p.sleep(2600); // let the debounced save run
	const d = disk(p, NOTES[1]);
	t.ok(d.includes('From outside.') && d.includes(' Unsaved typing.'), 'disk has both edits: ' + JSON.stringify(d));
	t.eq(await text(p, 1), d, 'editor and disk agree');
	t.ok(/^---\n[\s\S]*\n---\n/.test(d), 'frontmatter intact');
	// the merge shows Obsidian's own "merged" notice; close it
	await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`);
});

test('spike: WITHOUT the patch, native embeds clobber an external edit made during unsaved typing', async (p, h, t) => {
	await setup(p, { merge: false });
	await focusEnd(p, 1); await p.type(' Unsaved typing.');
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(NOTES[1])}); await app.vault.process(f, s => s.replace(/\\n---\\n/, '\\n---\\nFrom outside.\\n')); })().then(() => 1)`);
	await p.sleep(3200);
	const d = disk(p, NOTES[1]);
	// documents the native behavior the wrapper must fix: the external line is lost
	t.ok(!d.includes('From outside.') && d.includes(' Unsaved typing.'), 'native: external edit overwritten: ' + JSON.stringify(d));
});

test('spike: properties can be hidden; editing the body keeps frontmatter byte-for-byte', async (p, h, t) => {
	await setup(p);
	const fm = (s) => s.match(/^---\n[\s\S]*?\n---\n/)[0];
	const before = disk(p, NOTES[0]);
	// hide properties and the inline title with a class on the manuscript (would live in styles.css)
	await p.ev(`(() => { const st = document.head.createEl('style', { attr: { id: 'spike-style' } }); st.textContent = '.binders-manuscript { --metadata-display-editing: none; --metadata-display-reading: none; } .binders-manuscript .inline-title, .binders-manuscript .markdown-embed-link { display: none; }'; return 1; })()`);
	const shown = await p.ev(`[...__spike.scroller.querySelectorAll('.metadata-container, .inline-title')].filter(e => e.offsetParent).length`);
	t.eq(shown, 0, 'no properties block or inline title visible');
	// Ctrl+Home and typing must land in the body, not the hidden frontmatter
	await focusEnd(p, 0);
	await p.ev(`(() => { const ed = __spike.sections[0].editor; ed.setCursor({ line: 0, ch: 0 }); return 1; })()`);
	await p.key('ArrowDown'); await p.type('X');
	const after = disk(p, NOTES[0]) === before ? (await p.ev(`__spike.sections[0].flush().then(() => 1)`), disk(p, NOTES[0])) : disk(p, NOTES[0]);
	const where = await p.ev(`JSON.stringify(__spike.sections[0].editor.getCursor())`);
	t.eq(fm(after), fm(before), 'frontmatter byte-identical after body typing (cursor ' + where + ')');
	t.ok(after.includes('X'), 'typed text saved');
	await p.ev(`document.getElementById('spike-style')?.remove()`);
});

test('spike: with live preview off in the vault, sections still hide the frontmatter', async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('livePreview', false); return 1; })()`);
	try {
		await setup(p);
		const r = await p.ev(`__spike.sections.map(s => ({ lp: s.embed.editMode.sourceMode === false, first: s.el.querySelector('.cm-line')?.textContent }))`);
		t.ok(r.every((x) => x.lp), 'every section in live preview');
		t.ok(r.every((x) => x.first !== '---'), 'frontmatter not shown as text: ' + JSON.stringify(r.map((x) => x.first)));
		t.eq(await p.ev(`app.vault.getConfig('livePreview')`), false, 'the vault setting is untouched');
	} finally { await p.ev(`(() => { app.vault.setConfig('livePreview', true); return 1; })()`); }
});

test('spike: select-all then typing in a section keeps the frontmatter', async (p, h, t) => {
	await setup(p);
	await p.ev(`(() => { const st = document.head.createEl('style', { attr: { id: 'spike-style' } }); st.textContent = '.binders-manuscript .metadata-container { display: none; }'; return 1; })()`);
	await focusEnd(p, 2);
	await p.key('a', 'ctrl'); await p.type('Z');
	await p.ev(`__spike.sections[2].flush().then(() => 1)`);
	const d = disk(p, NOTES[2]);
	// Live preview's Ctrl+A selects the body only when properties are shown as a widget, even hidden by CSS
	t.eq(d, disk(p, NOTES[2]).match(/^---\n[\s\S]*?\n---\n/)[0] + 'Z', 'body replaced, frontmatter kept');
	await p.ev(`document.getElementById('spike-style')?.remove()`);
});

test('spike: teardown saves pending typing, leaves no editors, listeners or errors', async (p, h, t) => {
	await p.ev(INSTALL);
	const handlers0 = await p.ev(`(app.metadataCache._['changed'] || []).length`);
	const scope0 = await p.ev(`(window.__scope0 = app.keymap.getWindowStack(window).scope, 1)`);
	await setup(p);
	await focusEnd(p, 1); await p.type(' last words');
	t.eq(await p.ev(`__spike.sections[1].embed.dirty`), true, 'save pending before teardown');
	await p.ev(`(async () => { window.__embeds = __spike.sections.map(s => s.embed); for (const s of __spike.sections) await s.unload(); __spike.sections = []; return 1; })()`);
	t.ok(disk(p, NOTES[1]).includes(' last words'), 'pending typing saved on unload, immediately');
	t.eq(await p.ev(`(app.metadataCache._['changed'] || []).length`), handlers0, 'every metadataCache listener the embeds added is gone');
	t.eq(await p.ev(`__spike.scroller.querySelectorAll('.cm-editor').length`), 0, 'no editors left in the DOM');
	t.ok(await p.ev(`!__embeds.includes(app.workspace.activeEditor)`), 'activeEditor not left pointing at an unloaded embed');
	t.ok(scope0 && await p.ev(`app.keymap.getWindowStack(window).scope === __scope0`), 'no keymap scope left pushed');
	await p.sleep(2500); // a stale debounced save must not fire after unload
	t.ok(disk(p, NOTES[1]).includes(' last words'), 'still saved');
});

test('spike: closing the leaf (parent unload) without flushing still saves typing', async (p, h, t) => {
	await setup(p);
	await focusEnd(p, 0); await p.type(' closing');
	await p.ev(`(() => { __spike.leaf.detach(); return 1; })()`);
	await p.sleep(2600);
	// works only because the embed's debounced save still fires after unload; the wrapper should flush on unload anyway
	t.ok(disk(p, NOTES[0]).includes(' closing'), 'typing saved after the leaf closed');
});

test('spike: a property change (processFrontMatter) during unsaved typing keeps both', async (p, h, t) => {
	await setup(p);
	await focusEnd(p, 0); await p.type(' Still typing.');
	// what the corkboard does when you change a status while the manuscript has unsaved typing
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${JSON.stringify(NOTES[0])}), fm => { fm.status = 'revised'; }).then(() => 1)`);
	await p.sleep(3200);
	const d = disk(p, NOTES[0]);
	t.ok(d.includes('status: revised') && d.includes(' Still typing.'), 'both kept: ' + JSON.stringify(d));
	t.eq(await text(p, 0), d, 'editor and disk agree');
	await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`);
});

test('spike: unmount and remount a section (virtualization) keeps its undo history', async (p, h, t) => {
	await setup(p);
	const orig = await text(p, 2);
	await focusEnd(p, 2); await p.type(' before scrolling away');
	await p.ev(`(async () => { const s = __spike.sections[2]; await s.unload(); __spike.sections[2] = await __spike.mount(__spike.scroller, app.vault.getAbstractFileByPath(${JSON.stringify(NOTES[2])}), __spike.view); return 1; })()`);
	await p.sleep(200);
	t.ok((await text(p, 2)).includes(' before scrolling away'), 'remounted with the saved text');
	await focusEnd(p, 2); await p.key('z', 'ctrl'); await p.sleep(80);
	console.log('    undo after remount restores original: ' + ((await text(p, 2)) === orig));
	t.eq(await text(p, 2), orig, 'undo reaches typing made before the remount (Obsidian keeps recent editor history per file)');
	await p.ev(`__spike.sections[2].flush().then(() => 1)`);
});

test('spike: the same note open in a tab and in a section stays in sync both ways', async (p, h, t) => {
	await setup(p);
	await p.ev(`(async () => { const l = window.__tab = app.workspace.getLeaf('split'); await l.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(NOTES[1])})); return 1; })()`);
	await p.sleep(300);
	await focusEnd(p, 1); await p.type(' from section');
	await p.sleep(200);
	t.ok((await p.ev(`__tab.view.editor.getValue()`)).includes(' from section'), 'tab shows section typing before any save');
	await p.ev(`(() => { const ed = __tab.view.editor; ed.focus(); const n = ed.lastLine() - 1; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.type(' from tab');
	await p.sleep(300);
	t.ok((await text(p, 1)).includes(' from section from tab'), 'section shows tab typing: ' + JSON.stringify((await text(p, 1)).slice(-40)));
	await p.sleep(2600);
	t.ok(disk(p, NOTES[1]).includes(' from section from tab'), 'disk has both');
	t.eq(await text(p, 1), disk(p, NOTES[1]), 'section agrees with disk');
});

test('spike: read-only fallback with the public MarkdownRenderer', async (p, h, t) => {
	await p.ev(INSTALL);
	const r = await p.ev(`(async () => {
		// In the plugin this is simply: import { MarkdownRenderer } from 'obsidian'. In-page we find the same class by
		// walking up from a note's reading view (MarkdownPreviewView) to the constructor that owns the static renderMarkdown().
		const scroller = await __spike.host();
		const tmp = app.workspace.getLeaf('split');
		await tmp.openFile(app.vault.getMarkdownFiles()[0]);
		let C = tmp.view.previewMode.constructor;
		while (C && !Object.prototype.hasOwnProperty.call(C, 'renderMarkdown')) C = Object.getPrototypeOf(C);
		tmp.detach();
		if (!C) return { found: false };
		for (const path of ${JSON.stringify(NOTES)}) {
			const f = app.vault.getAbstractFileByPath(path);
			const el = scroller.createDiv({ cls: 'binders-section markdown-rendered' });
			const cache = app.metadataCache.getFileCache(f);
			const raw = await app.vault.cachedRead(f);
			const body = cache?.frontmatterPosition ? raw.slice(cache.frontmatterPosition.end.offset).replace(/^\\n/, '') : raw;
			await C.render(app, body, el, path, __spike.view);
		}
		const secs = [...scroller.querySelectorAll('.binders-section')];
		return { found: true, n: secs.length, editable: scroller.querySelectorAll('[contenteditable=true]').length, text: secs[1].innerText.trim().slice(0, 40) };
	})()`);
	t.ok(r.found, 'MarkdownRenderer reachable');
	t.eq(r.n, 3, 'three read-only sections');
	t.eq(r.editable, 0, 'nothing editable');
	t.ok(r.text.length > 0 && !r.text.startsWith('---'), 'body rendered without frontmatter: ' + r.text);
});

// Cost: mount 50 and 200 editors. Notes are generated in the throwaway vault; the runner deletes them afterwards.
for (const N of [50, 200]) test(`spike: cost of mounting ${N} editable embeds`, async (p, h, t) => {
	await p.ev(INSTALL);
	const para = 'The sea came up the rocks and the light turned over it. '.repeat(20);
	await p.ev(`(async () => { if (!app.vault.getAbstractFileByPath('Bulk')) await app.vault.createFolder('Bulk'); for (let i = 0; i < ${N}; i++) await app.vault.create('Bulk/Scene ' + String(i).padStart(3, '0') + '.md', '---\\nstatus: draft\\n---\\n' + ${JSON.stringify(para + '\n\n')}.repeat(8)); return 1; })()`);
	await p.sleep(500);
	// heap after a forced GC (over CDP), before and after mounting
	const heap = async () => { await p.send('HeapProfiler.collectGarbage'); return (await p.send('Runtime.getHeapUsage')).result.usedSize; };
	await p.send('HeapProfiler.enable');
	await p.ev(`__spike.host().then(() => 1)`);
	const m0 = await heap();
	const r = await p.ev(`(async () => {
		const files = app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Bulk/')).sort((a, b) => a.path.localeCompare(b.path));
		const t0 = performance.now();
		for (const f of files) __spike.sections.push(await __spike.mount(__spike.scroller, f, __spike.view));
		const t1 = performance.now();
		await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
		const t2 = performance.now();
		const t3 = performance.now(); __spike.scroller.scrollTop = __spike.scroller.scrollHeight; await new Promise(r => requestAnimationFrame(r)); const t4 = performance.now();
		return { n: files.length, mountMs: Math.round(t1 - t0), perMs: +((t1 - t0) / files.length).toFixed(1), paintMs: Math.round(t2 - t1), nodes: __spike.scroller.querySelectorAll('*').length, scrollMs: Math.round(t4 - t3) };
	})()`);
	r.heapMB = +(((await heap()) - m0) / 1048576).toFixed(1);
	r.unloadMs = await p.ev(`(async () => { const t5 = performance.now(); for (const s of __spike.sections) await s.unload(); __spike.sections = []; return Math.round(performance.now() - t5); })()`);
	r.heapAfterUnloadMB = +(((await heap()) - m0) / 1048576).toFixed(1);
	await p.send('HeapProfiler.disable');
	console.log(`    ${N} embeds: ` + JSON.stringify(r));
	t.eq(r.n, N, 'all mounted');
});

// Mobile emulation reloads the app window. Keep this last; it restores desktop mode at the end.
test('spike: mobile (app.emulateMobile): mount, type, undo, external merge, teardown', async (p, h, t) => {
	const wait = async () => { for (let i = 0; i < 80 && !(await p.ev('!!(window.app && app.workspace && app.workspace.layoutReady)').catch(() => false)); i++) await p.sleep(250); await p.sleep(800); };
	await p.ev(`(() => { app.emulateMobile(true); return 1; })()`).catch(() => {});
	await p.sleep(1500); await wait();
	try {
		t.eq(await p.ev(`app.isMobile`), true, 'mobile emulation on');
		await p.ev(`(() => { const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); return 1; })()`);
		t.ok(await p.ev(INSTALL) && await p.ev(`__spike.supported()`), 'feature check passes on mobile');
		await setup(p);
		t.ok(await p.ev(`__spike.sections.every(s => s.embed.getMode() === 'source' && !!s.el.querySelector('.cm-content[contenteditable=true]'))`), 'three live editors');
		t.eq(await p.ev(`__spike.sections.some(s => s.embed.useIframe || !!s.el.querySelector('iframe'))`), false, 'no iframes on mobile');
		const orig = await text(p, 1);
		await focusEnd(p, 1); await p.type(' on the phone ');
		await p.sleep(600); // close the undo group
		t.eq(await p.ev(`app.workspace.activeEditor === __spike.sections[1].embed`), true, 'active editor follows focus');
		t.ok(await p.ev(`!!document.querySelector('.mobile-toolbar') && document.querySelector('.mobile-toolbar').offsetParent !== null`), 'the mobile editing toolbar shows for a focused section');
		// mobile toolbar commands run through activeEditor
		await p.ev(`app.commands.executeCommandById('editor:toggle-bold')`); await p.type('b'); await p.sleep(80);
		t.ok((await text(p, 1)).includes(' on the phone **b**'), 'bold command applies in the section');
		await p.sleep(600);
		t.eq(await p.ev(`app.commands.executeCommandById('editor:undo')`), true, 'mobile undo command runs');
		await p.sleep(80);
		t.ok(!(await text(p, 1)).includes('**b**') && (await text(p, 1)).includes(' on the phone'), 'undo command undoes the last step only: ' + JSON.stringify((await text(p, 1)).slice(-30)));
		await p.ev(`app.commands.executeCommandById('editor:redo')`); await p.sleep(80);
		t.ok((await text(p, 1)).includes('**b**'), 'redo command brings it back');
		await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${JSON.stringify(NOTES[1])}); await app.vault.process(f, s => s.replace(/\\n---\\n/, '\\n---\\nFrom outside.\\n')); })().then(() => 1)`);
		await p.sleep(600);
		await p.ev(`(async () => { for (const s of __spike.sections) await s.unload(); return 1; })()`);
		const d = disk(p, NOTES[1]);
		t.ok(d.includes('From outside.') && d.includes(' on the phone'), 'merge and save on teardown: ' + JSON.stringify(d));
		t.ok(orig.length > 0, 'had text');
		await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`);
		// cost on (emulated) mobile: 50 sections of the test notes, repeated
		const r = await p.ev(`(async () => {
			const files = []; for (let i = 0; i < 50; i++) files.push(app.vault.getAbstractFileByPath(${JSON.stringify(NOTES)}[i % 3]));
			const scroller = await __spike.host(); const t0 = performance.now();
			for (const f of files) __spike.sections.push(await __spike.mount(scroller, f, __spike.view));
			const ms = performance.now() - t0; for (const s of __spike.sections) await s.unload();
			return Math.round(ms);
		})()`);
		console.log('    mobile, 50 embeds mount ms: ' + r);
	} finally {
		await p.ev(`(() => { app.emulateMobile(false); return 1; })()`).catch(() => {});
		await p.sleep(1500); await wait();
		p.errors.length = 0; // reload noise; errors during the test itself were checked by assertions above
	}
});
