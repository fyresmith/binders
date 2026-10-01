// The app going to the background (another app in front, the screen off): on a phone it may never come back, and nothing
// says so first, so whatever is being typed is written at that moment. And a save that's slow doesn't lose what's typed
// while it runs.
import { NOTE, VIEW, card, contents, exists, j, openView, read, same, texts, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'background: ' + name, fn });

const L = 'The Lighthouse/';
/** What the browser does when the app is hidden, and when it's shown again. */
const hide = (p) => p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return 1; })()`);
const show = (p) => p.ev(`(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); return 1; })()`);

test('a synopsis being typed on a card is saved when the app is hidden, and its field stays open to carry on with', async (p, h, t) => {
	await openView(p);
	const c = await p.at(card(L + 'Prologue.md'));
	await p.click(c.x, c.t + 12);
	const s = await p.at(`${card(L + 'Prologue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y); await p.sleep(200);
	t.ok(await p.ev(`document.activeElement.matches('textarea')`), 'the synopsis is being edited');
	await p.type(' And then it did.');
	try {
		await hide(p);
		await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${JSON.stringify(L + 'Prologue.md')}))?.frontmatter?.synopsis?.endsWith('And then it did.')`, 4000);
		t.ok((await read(p, L + 'Prologue.md')).includes('And then it did.'), 'what was typed is in the note');
		t.ok(await p.ev(`document.activeElement.matches('textarea') && document.activeElement.value.endsWith('And then it did.')`), 'and the field is still open, with it');
	} finally { await show(p); }
	await p.type(' Twice.'); await p.key('Tab'); await p.sleep(600);
	t.ok((await read(p, L + 'Prologue.md')).includes('And then it did. Twice.'), 'typing carries on, and is saved as ever');
});

test('a folder’s synopsis being typed on its stack is saved to its folder note when the app is hidden, and its field stays open', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const c = await p.at(card(L + 'Part One'));
	await p.click(c.x, c.t + 14);
	await p.sleep(800); // (a stack's synopsis takes a click once the stack has been selected a moment)
	const s = await p.at(`${card(L + 'Part One')} .binders-card-synopsis`);
	await p.click(s.x, s.y); await p.sleep(200);
	t.ok(await p.ev(`document.activeElement.matches('${card(L + 'Part One')} textarea')`), 'the stack’s synopsis is being edited');
	t.ok(!(await exists(p, L + 'Part One/Part One.md')), 'the folder has no note of its own yet');
	await p.type('Mara comes ashore.');
	try {
		await hide(p);
		await until(p, `app.vault.adapter.exists(${JSON.stringify(L + 'Part One/Part One.md')})`, 4000);
		await until(p, `app.vault.adapter.read(${JSON.stringify(L + 'Part One/Part One.md')}).then(x => x.includes('Mara comes ashore.'))`, 4000);
		t.eq((await read(p, L + 'Part One/Part One.md')).trim(), '---\nsynopsis: Mara comes ashore.\n---', 'what was typed is in the folder’s note, made for it at that moment');
		t.ok(await p.ev(`document.activeElement.matches('textarea') && document.activeElement.value === 'Mara comes ashore.'`), 'and the field is still open, with it');
	} finally { await show(p); }
	await p.type(' Twice.'); await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.read(${JSON.stringify(L + 'Part One/Part One.md')}).then(x => x.includes('Mara comes ashore. Twice.'))`, 4000);
	t.eq((await read(p, L + 'Part One/Part One.md')).trim(), '---\nsynopsis: Mara comes ashore. Twice.\n---', 'typing carries on, and is saved as ever');
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the folder’s note is not in the binder’s list');
	same(t, before, await texts(p));
	t.eq(await read(p, NOTE), before[NOTE], 'the binder note untouched');
}));

test('typing in the manuscript is saved when the app is hidden, without waiting for the usual moment', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!${VIEW}.current?.scenes?.[0]?.live?.cm`, 5000);
	const before = await read(p, L + 'Prologue.md');
	await p.ev(`(() => { const cm = ${VIEW}.current.scenes[0].live.cm; cm.focus(); cm.dispatch({ selection: { anchor: cm.state.doc.length - 1 } }); return 1; })()`);
	await p.type(' HIDDEN-ONE');
	try {
		await hide(p);
		await until(p, `app.vault.adapter.read(${JSON.stringify(L + 'Prologue.md')}).then(x => x.includes('HIDDEN-ONE'))`, 1200);
		t.eq(await read(p, L + 'Prologue.md'), before.replace(/\n$/, ' HIDDEN-ONE\n'), 'the note has what was typed, once, within a second (the usual save waits two)');
	} finally { await show(p); }
});

test('a title typed on while its first save is still being written is saved too', async (p, h, t) => {
	await openView(p);
	const c = await p.at(card(L + 'Epilogue.md'));
	await p.click(c.x, c.t + 12);
	await p.key('F2'); await p.sleep(200);
	t.ok(await p.ev(`document.activeElement.matches('input')`), 'the title is being edited');
	// (a slow device: the rename takes a while)
	await p.ev(`(() => { const fm = app.fileManager, o = fm.renameFile.bind(fm); window.__slow = () => { fm.renameFile = o; }; fm.renameFile = async (f, to) => { await new Promise(r => setTimeout(r, 500)); return o(f, to); }; return 1; })()`);
	try {
		await p.ev(`(() => { const i = document.activeElement; i.value = 'Coda'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); return 1; })()`);
		await p.sleep(100);
		await p.ev(`(() => { const i = document.activeElement; if (i.matches('input')) { i.value = 'Coda, again'; i.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()`);
		await until(p, `!!app.vault.getAbstractFileByPath(${JSON.stringify(L + 'Coda, again.md')})`, 5000);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${JSON.stringify(L + 'Coda, again.md')}) && !app.vault.getAbstractFileByPath(${JSON.stringify(L + 'Coda.md')})`), 'the note has the name as it was last typed');
	} finally { await p.ev(`(() => { window.__slow?.(); return 1; })()`); }
});
