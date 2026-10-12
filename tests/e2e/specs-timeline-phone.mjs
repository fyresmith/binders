// The timeline on a phone and a tablet (emulated through `app.emulateMobile`, by touch): a phone has the line down and
// nothing else, each date over its cards and the undated in a row at the foot that opens; a tablet has both shapes and
// "Arrange". A tap selects, a tap on a card's title opens its note, a finger held still asks for the menu.
import { VIEW, flush, j, menuItems, closeMenus, reload, texts, until, withTidy } from './view-helpers.mjs';
import { T, look, open, seed } from './specs-timeline.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'timeline, by touch: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const PROLOGUE = 'Prologue.md', ARRIVAL = 'Part One/Arrival.md', KEEPER = 'Part One/The keeper.md', STORM = 'Part One/Storm warning.md', WRECK = 'Part Two/The wreck.md', LIGHTS = 'Part Two/Lights out.md';
const DATES = { [PROLOGUE]: '1986-12', [ARRIVAL]: '1987-06-11', [KEEPER]: '1987-06-11', [STORM]: '1987-06-17', [WRECK]: '1987-06-19', [LIGHTS]: '1987-06-19' };
const cardSel = (path) => `${T} .binders-card[data-path="${L}${path}"]`;

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(400); };
const hold = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(650); await touch(p, 'touchEnd'); await p.sleep(500); };
const selected = (p) => p.ev(`${VIEW}.current.selected().map(f => f.basename)`);

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

test('a phone: time runs down whatever was chosen on a computer, each year and date over its cards in one column; no Arrange; the tray is a row at the foot that opens and shuts', async (p, h, t) => {
	await seed(p, DATES);
	await onDevice(p, 390, 844, async () => {
		const before = await texts(p);
		await open(p, 'across');
		const s = await look(p);
		t.eq(s.shape, 'mod-down mod-heads', 'the line runs down, each date a heading, though the view’s option says across');
		t.eq(j(s.years), j(['1986', '1987']), 'the years');
		t.eq(j(s.dates), j(['December', '11 June', '17 June', '19 June']), 'the dates');
		t.eq(j(s.gaps), j(['5 months']), 'the gap');
		t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-arrange-button').classList.contains('is-hidden')`), 'the toolbar has no Arrange: there is one way');
		const geo = await p.ev(`(() => { const box = document.querySelector('${T}'), b = box.getBoundingClientRect(), c = [...box.querySelectorAll('.binders-timeline .binders-card[data-path]')].map(x => x.getBoundingClientRect()); return { wide: box.scrollWidth <= box.clientWidth + 1, lefts: [...new Set(c.map(r => Math.round(r.left)))].length, fits: c.every(r => r.left >= b.left && r.right <= b.right), stacked: c.every((r, i) => !i || r.top >= c[i - 1].bottom) }; })()`);
		t.eq(j(geo), j({ wide: true, lefts: 1, fits: true, stacked: true }), 'one column, as wide as the page, nothing to scroll sideways');
		// the tray: shut, a row at the foot above Obsidian's bar; a tap opens it, another shuts it
		t.eq(s.count, '1', 'the tray says how many scenes have no date');
		t.eq(j(s.tray), j([]), 'and is shut');
		const head = `${T} .binders-timeline-tray-head`;
		const row = await p.ev(`(() => { const r = document.querySelector('${head}').getBoundingClientRect(), b = document.querySelector('${T}').getBoundingClientRect(); return { height: Math.round(r.height), inside: r.bottom <= b.bottom + 1 && r.top > b.top + b.height / 2, wide: Math.round(r.width) >= document.querySelector('${T}').clientWidth - 2 }; })()`);
		t.ok(row.height >= 44 && row.inside && row.wide, `its row is at the foot of the pane, as wide as it, and tall enough for a thumb: ${j(row)}`);
		let at = await p.at(head);
		await tap(p, at.x, at.y);
		await until(p, `!!document.querySelector('${T} .binders-timeline-tray .binders-card[data-path]')`);
		t.eq(j((await look(p)).tray), j(['7 Epilogue']), 'a tap opens it');
		t.eq(await p.ev(`document.querySelector('${head}').getAttribute('aria-expanded')`), 'true', 'and it says it is open');
		at = await p.at(head);
		await tap(p, at.x, at.y);
		await until(p, `!document.querySelector('${T} .binders-timeline-tray .binders-card[data-path]')`);
		t.eq(await p.ev(`document.querySelector('${head}').getAttribute('aria-expanded')`), 'false', 'another shuts it');
		// a swipe scrolls and selects nothing
		const mid = await p.ev(`(() => { const b = document.querySelector('${T}').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height * 0.6) }; })()`);
		await touch(p, 'touchStart', mid.x, mid.y);
		for (let i = 1; i <= 6; i++) { await touch(p, 'touchMove', mid.x, mid.y - i * 30); await p.sleep(16); }
		await touch(p, 'touchEnd');
		await p.sleep(500);
		t.eq((await selected(p)).length, 0, 'a swipe selects nothing');
		await flush(p);
		const after = await texts(p);
		for (const path of Object.keys(before)) t.eq(after[path], before[path], `“${path}” is unchanged`);
	});
});

test('a phone: a tap on a card selects it, a tap on its title opens its note, and a finger held still on it asks for its menu', async (p, h, t) => {
	await seed(p, DATES);
	await onDevice(p, 390, 844, async () => {
		await open(p, 'down');
		let at = await p.at(`${cardSel(PROLOGUE)} .binders-card-footer`);
		await tap(p, at.x, at.y);
		t.eq(j(await selected(p)), j(['Prologue']), 'a tap on the card selects it');
		t.ok(await p.ev(`document.querySelector(${j(cardSel(PROLOGUE))}).classList.contains('is-selected')`), 'and it shows');
		await hold(p, at.x, at.y);
		const items = await menuItems(p);
		t.ok(items.includes('More') && items.includes('Select more'), 'held still, its menu has Select more and More (where Set story date... and Remove story date are): ' + items.join(', '));
		await closeMenus(p);
		await p.sleep(300);
		at = await p.at(`${cardSel(ARRIVAL)} .binders-card-title`);
		await tap(p, at.x, at.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + ARRIVAL)}`, 5000);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + ARRIVAL, 'a tap on a card’s title opens its note');
	});
});

test('a tablet: both shapes, with Arrange in the toolbar; across, the cards stand on both sides of the line', async (p, h, t) => {
	await seed(p, DATES);
	await onDevice(p, 820, 1180, async () => {
		await open(p, 'down');
		t.eq((await look(p)).shape, 'mod-down mod-strip', 'time down, the dates beside the line as on a computer');
		const A = '.workspace-leaf.mod-active .binders-arrange-button';
		t.ok(await p.ev(`!document.querySelector('${A}').classList.contains('is-hidden')`), 'the toolbar has Arrange');
		const at = await p.at(A);
		await tap(p, at.x, at.y);
		t.eq(j(await menuItems(p)), j(['Time down', 'Time across']), 'with the two ways');
		await p.ev(`(() => { [...document.querySelectorAll('.menu .menu-item')].find(i => i.querySelector('.menu-item-title')?.textContent === 'Time across').click(); return 1; })()`);
		await until(p, `document.querySelector('${T}')?.classList.contains('mod-across')`);
		await p.sleep(300);
		const s = await look(p);
		t.eq(s.shape, 'mod-across', 'time across');
		t.eq(s.line.length, 6, 'every dated scene on the line');
		const c = await p.at(`${cardSel(STORM)} .binders-card-footer`);
		await tap(p, c.x, c.y);
		t.eq(j(await selected(p)), j(['Storm warning']), 'a tap selects there too');
	});
});
