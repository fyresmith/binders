// Mobile (app.emulateMobile, with touch): a phone (390 px) and a tablet (820 px). Every mode fits and works by touch:
// the toolbar, the mode menu as Obsidian's sheet, the plot grid clear of the navigation bar, the manuscript's sections
// without a note's header spacing. Reloads Obsidian, so each test puts it back on the desktop.
import { VIEW, j, openView, reload, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'mobile: ' + name, fn });

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(400); };

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

for (const [device, width, height] of [['phone', 390, 844], ['tablet', 820, 1180]]) {
	test(`${device}: every mode fits, and the mode menu works by touch`, async (p, h, t) => {
		await onDevice(p, width, height, async () => {
			t.ok(await p.ev(`app.isMobile`), 'mobile');
			await openView(p);
			const overflow = () => p.ev(`(() => { const b = document.querySelector('.workspace-leaf.mod-active .binders-toolbar'), v = b.closest('.binders-view').getBoundingClientRect(); return { scroll: b.scrollWidth - b.clientWidth, right: Math.round(b.getBoundingClientRect().right - v.right) }; })()`);
			for (const mode of ['corkboard', 'plotgrid', 'manuscript']) {
				// by touch: the mode button, then the mode in Obsidian's menu
				const b = await p.at(`.workspace-leaf.mod-active .binders-mode-button`);
				await tap(p, b.x, b.y);
				const item = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.textContent.includes(${j({ corkboard: 'Corkboard', plotgrid: 'Plot grid', manuscript: 'Manuscript' }[mode])})); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
				t.ok(item, `${mode}: the mode menu opened`);
				await tap(p, item.x, item.y);
				await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-mode-${mode}')`);
				await p.sleep(600);
				const o = await overflow();
				t.ok(o.scroll <= 0 && o.right <= 0, `${mode}: the toolbar fits (${j(o)})`);
				t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view').scrollWidth <= document.querySelector('.workspace-leaf.mod-active .binders-view').clientWidth`), `${mode}: nothing sticks out sideways`);
			}
			// the manuscript: a section's editor has no top spacing of its own (on phones, a note's editor makes room for
			// Obsidian's floating header)
			await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-manuscript .cm-scroller')`, 5000);
			t.eq(await p.ev(`getComputedStyle(document.querySelector('.workspace-leaf.mod-active .binders-manuscript .cm-scroller')).paddingTop`), '0px', 'no gap above a section’s text');
			// the plot grid: its last row clears the navigation bar when scrolled to the end
			await p.ev(`(() => { ${VIEW}.setMode('plotgrid'); return 1; })()`);
			await p.sleep(500);
			const clear = await p.ev(`(() => { const g = document.querySelector('.workspace-leaf.mod-active .binders-plotgrid'); g.scrollTop = g.scrollHeight; const rows = g.querySelectorAll('tbody tr'), last = rows[rows.length - 1].getBoundingClientRect(), bar = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return { last: Math.round(last.bottom), bar: bar && bar.height ? Math.round(bar.top) : null }; })()`);
			t.ok(clear.bar == null || clear.last <= clear.bar, 'the last row clears the navigation bar: ' + j(clear));
		});
	});
}
