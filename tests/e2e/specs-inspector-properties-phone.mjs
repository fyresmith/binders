// The writer's own properties in the inspector, by touch on an emulated phone and tablet: a list goes under its name
// on a phone (the drawer leaves about 100px beside it) and stays beside it on a tablet, rows are tall enough for a
// finger and nothing scrolls sideways, and a number, a tick and a list are edited by tapping.
import { NOTE, VIEW, j, openView, read, reload, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'inspector properties phone: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const ARRIVAL = L + 'Part One/Arrival.md';
const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
const field = (k) => `${I} [data-field="prop:${k}"]`;
const fmOf = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? null)`).then(JSON.parse);
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const tapIn = async (p, sel) => {
	await p.ev(`document.querySelector(${j(sel)})?.scrollIntoView({ block: 'center' })`);
	await p.sleep(250);
	const at = await p.at(sel);
	if (!at) throw new Error('nothing to tap: ' + sel);
	await tap(p, at.x, at.y);
};
async function onDevice(p, width, height, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}

for (const [device, width, height] of [['a phone', 390, 844], ['a tablet', 820, 1180]]) {
	test(`${device}: pinned rows are tall enough for a finger, a list is under its name on a phone and beside it on a tablet, and a number, a box and a list are edited by tapping`, async (p, h, t) => {
		await writeRaw(p, ARRIVAL, '---\npov: Mara\ncharacters:\n  - "[[Mara]]"\n  - Harrow\n  - The master with a long name\nbeats: 3\nfinished: false\n---\nThe supply boat left Mara on the jetty with two cases.\n');
		await writeRaw(p, NOTE, (await read(p, NOTE)).replace('plotlines:', 'inspector:\n  - pov\n  - characters\n  - beats\n  - finished\nplotlines:'));
		await p.sleep(600);
		await onDevice(p, width, height, async () => {
			await p.ev(`(() => { for (const t of ['binders-inspector', 'binders-contents']) app.workspace.detachLeavesOfType(t); return 1; })()`);
			await openView(p, 'The Lighthouse/Part One');
			await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
			await p.sleep(1500);
			const at = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.textContent.includes('The supply boat left')); const x = s?.querySelector('.cm-line, p'); const r = x?.getBoundingClientRect(); return r ? { x: r.left + 20, y: r.top + r.height / 2 } : null; })()`);
			await tap(p, at.x, at.y);
			await p.sleep(700);
			await p.ev(`(async () => { document.activeElement?.blur?.(); await app.commands.executeCommandById('binders:show-inspector'); })().then(() => 1)`);
			await until(p, `!!document.querySelector(${j(field('beats'))})?.offsetParent`, 6000);
			await p.sleep(500);
			const geo = await p.ev(`(() => { const pane = document.querySelector(${j(I)}), r = pane.getBoundingClientRect(); const row = (k) => document.querySelector(${j(I)} + ' [data-property-key="' + k + '"]'); const b = (e) => e.getBoundingClientRect(); const list = row('characters'); return { left: r.left, right: r.right, wide: innerWidth, over: pane.scrollWidth - pane.clientWidth, heights: ['pov', 'characters', 'beats', 'finished'].map((k) => Math.round(b(row(k)).height)), under: b(list.querySelector('.metadata-property-value')).top >= b(list.querySelector('.metadata-property-key')).bottom - 1, beside: b(list.querySelector('.metadata-property-value')).left > b(list.querySelector('.metadata-property-key')).left + 40 }; })()`);
			t.ok(geo.left >= 0 && geo.right <= geo.wide + 1 && geo.over <= 0, 'the pane is within the screen, nothing scrolls sideways: ' + j(geo));
			t.ok(geo.heights.every((x) => x >= 44), 'every pinned row is tall enough for a finger: ' + geo.heights.join(', '));
			if (device === 'a phone') t.ok(geo.under, 'a list is under its name: ' + j(geo));
			else t.ok(geo.beside && !geo.under, 'on a tablet a list stays beside its name: ' + j(geo));
			// a number: tapped, typed, left by a tap elsewhere in the pane
			await tapIn(p, field('beats') + ' input, ' + field('beats') + ' [contenteditable]');
			await p.ev(`document.activeElement?.select?.()`);
			await p.type('34');
			await tapIn(p, I + ' .binders-inspector-name');
			await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.beats === 34`, 5000);
			t.eq((await fmOf(p, ARRIVAL)).beats, 34, 'a number typed by touch is a number in the note');
			// a box
			await tapIn(p, field('finished') + ' input[type="checkbox"]');
			await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.finished === true`, 5000);
			t.eq((await fmOf(p, ARRIVAL)).finished, true, 'a box ticked by touch');
			// a list: an item typed
			await tapIn(p, field('characters') + ' .multi-select-input');
			await p.type('Ines');
			await p.key('Enter');
			await tapIn(p, I + ' .binders-inspector-name');
			await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.characters?.includes('Ines')`, 5000);
			t.eq(JSON.stringify((await fmOf(p, ARRIVAL)).characters.slice(0, 3)), JSON.stringify(['[[Mara]]', 'Harrow', 'The master with a long name']), 'the list kept what it had, and Ines is added');
			const text = await read(p, ARRIVAL);
			t.ok(text.endsWith('The supply boat left Mara on the jetty with two cases.\n'), 'the text of the note is untouched');
		});
	});
}
