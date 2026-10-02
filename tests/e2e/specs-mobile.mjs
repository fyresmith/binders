// Mobile (app.emulateMobile, with touch): a phone (390 px) and a tablet (820 px). Every mode fits and works by touch:
// the toolbar, the mode menu as Obsidian's sheet, the outliner clear of the navigation bar, the manuscript's sections
// without a note's header spacing. Reloads Obsidian, so each test puts it back on the desktop.
import { NOTE, VIEW, card, cards, contents, exists, flush, j, openView, reload, same, texts, until, withTidy } from './view-helpers.mjs';

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

// The on-screen keyboard is emulated as a shorter viewport, which is what Obsidian's app is given when it's up.
// `short`: is the view too short for the toolbar and a few lines with the keyboard up; `always`: and without it.
for (const [what, width, height, keyboard, short, always] of [['a small phone', 320, 568, 260, true, false], ['a phone on its side', 844, 390, 190, true, false], ['a small phone on its side', 568, 320, 180, true, true], ['a phone held upright', 390, 844, 336, false, false]]) {
	test(`${what}: ${short ? 'while something is typed in with the keyboard up, the toolbar gives its line to the page; it’s there whenever nothing is being edited' : 'with the keyboard up there’s room, and the toolbar stays'}`, async (p, h, t) => {
		await onDevice(p, width, height, async () => {
			const V = '.workspace-leaf.mod-active .binders-view';
			await openView(p);
			const look = () => p.ev(`(() => { const v = document.querySelector('${V}'), r = (e) => e.getBoundingClientRect(); const bar = r(v.querySelector('.binders-toolbar')), page = r(v.querySelector('.binders-mode')); return { bar: Math.round(bar.height), pageTop: Math.round(page.top - r(v).top), under: Math.round(r(v).bottom - page.bottom), scrolled: v.scrollTop }; })()`);
			const size = async (hh) => { await p.send('Emulation.setDeviceMetricsOverride', { width, height: hh, deviceScaleFactor: 1, mobile: true }); await p.sleep(500); };
			const GONE = j({ bar: 0, pageTop: 0, under: 0, scrolled: 0 });
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
				await until(p, `!!document.querySelector('${V} .binders-mode-${mode} .binders-view-synopsis')`);
				await p.sleep(500);
				const before = await look();
				t.ok(before.bar >= 40 && before.pageTop === before.bar, `${mode}: with nothing being edited the toolbar is above the page: ${j(before)}`);
				// the keyboard up with nothing in the view being typed in (a search in the sidebar, say): it stays
				await size(height - keyboard);
				t.ok((await look()).bar >= 40, `${mode}: and it stays when the screen is shortened with no field of the view open`);
				await size(height);
				// a field of the view opened (the folder's synopsis, on the page in every mode), then the keyboard
				await p.ev(`(() => { document.querySelector('${V} .binders-view-synopsis').focus(); return 1; })()`);
				await p.key('Enter');
				await p.sleep(300);
				t.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', `${mode}: the synopsis is being typed in`);
				t.eq(j(await look()), always ? GONE : j(before), `${mode}: with its field open and no keyboard yet, the toolbar ${always ? 'has made room: the view is that short' : 'is where it was'}`);
				await size(height - keyboard);
				if (short) t.eq(j(await look()), GONE, `${mode}: with the keyboard up the page has the whole view`);
				else t.eq(j(await look()), j(before), `${mode}: with the keyboard up the toolbar is where it was`);
				await p.key('Escape');
				await p.sleep(300);
				t.ok((await look()).bar >= 40, `${mode}: the field closed, the toolbar is back, keyboard or no`);
				await size(height);
				t.eq(j(await look()), j(before), `${mode}: and all is as it was once the keyboard has gone`);
			}
			// the manuscript's own text: an editor with the cursor in it counts as typing
			await until(p, `!!document.querySelector('${V} .binders-manuscript .cm-content')`, 5000);
			await p.ev(`(() => { document.querySelector('${V} .binders-manuscript .cm-content').focus(); return 1; })()`);
			await size(height - keyboard);
			t.eq((await look()).bar > 0, !short, `manuscript: with the cursor in its text and the keyboard up, the toolbar ${short ? 'gives its line to the page' : 'stays'}`);
			await p.ev(`(() => { document.activeElement.blur(); return 1; })()`);
			await size(height);
			t.ok((await look()).bar >= 40, 'manuscript: and is back when the text is left');
		});
	});
}

for (const [device, width, height] of [['phone', 390, 844], ['tablet', 820, 1180]]) {
	test(`${device}: every mode fits, and the mode menu works by touch`, async (p, h, t) => {
		await onDevice(p, width, height, async () => {
			t.ok(await p.ev(`app.isMobile`), 'mobile');
			await openView(p);
			const overflow = () => p.ev(`(() => { const b = document.querySelector('.workspace-leaf.mod-active .binders-toolbar'), v = b.closest('.binders-view').getBoundingClientRect(); return { scroll: b.scrollWidth - b.clientWidth, right: Math.round(b.getBoundingClientRect().right - v.right) }; })()`);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				// by touch: the mode button, then the mode in Obsidian's menu
				const b = await p.at(`.workspace-leaf.mod-active .binders-mode-button`);
				await tap(p, b.x, b.y);
				const item = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.textContent.includes(${j({ corkboard: 'Corkboard', outliner: 'Outliner', manuscript: 'Manuscript' }[mode])})); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
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
			// the outliner: its last row clears the navigation bar when scrolled to the end
			await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
			await p.sleep(500);
			const clear = await p.ev(`(() => { const g = document.querySelector('.workspace-leaf.mod-active .binders-outliner'); g.scrollTop = g.scrollHeight; const rows = g.querySelectorAll('.binders-outliner-row'), last = rows[rows.length - 1].getBoundingClientRect(), bar = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return { last: Math.round(last.bottom), bar: bar && bar.height ? Math.round(bar.top) : null }; })()`);
			t.ok(clear.bar == null || clear.last <= clear.bar, 'the last row clears the navigation bar: ' + j(clear));
		});
	});

	test(`${device}: a tap on a stack’s name goes into the folder, where the toolbar still fits and has the way back up; a card held and dragged onto a stack goes into it`, withTidy(async (p, h, t) => {
		await onDevice(p, width, height, async () => {
			const L = 'The Lighthouse/';
			const before = await texts(p);
			await openView(p);
			t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'the binder’s board: its notes, and a stack for each folder');
			const fits = () => p.ev(`(() => { const b = document.querySelector('.workspace-leaf.mod-active .binders-toolbar'), v = b.closest('.binders-view'), r = v.getBoundingClientRect(); return { scroll: b.scrollWidth - b.clientWidth, right: Math.round(b.getBoundingClientRect().right - r.right), wide: v.scrollWidth - v.clientWidth }; })()`);
			// every card is inside the board (a folder's is a card like the others: nothing is drawn under it)
			const out = await p.ev(`(() => { const v = document.querySelector('.workspace-leaf.mod-active .binders-corkboard').getBoundingClientRect(); return [...document.querySelectorAll('.workspace-leaf.mod-active .binders-card')].filter(c => { const r = c.getBoundingClientRect(); return r.left < v.left || r.right > v.right + 0.5; }).length; })()`);
			t.eq(out, 0, 'no card sticks out of the board');
			// in by the stack's name
			const name = await p.at(`${card(L + 'Part One')} .binders-card-title`);
			await tap(p, name.x, name.y);
			await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
			t.eq(await p.ev(`app.workspace.getMostRecentLeaf().getViewState().state?.folder`), L + 'Part One', 'a tap on a stack’s name goes into the folder');
			await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 3`);
			t.eq(j(await cards(p)), j(['Arrival', 'The keeper', 'Storm warning'].map((x) => L + 'Part One/' + x + '.md')), 'with its notes as cards');
			await p.sleep(400);
			const o = await fits();
			t.ok(o.scroll <= 0 && o.right <= 0 && o.wide <= 0, `inside a folder the toolbar, with the way up in it, still fits (${j(o)})`);
			// out by the way up: on a phone an arrow, on a tablet the folder's name in the breadcrumb
			const ways = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-breadcrumbs [data-path]')].filter(e => e.getBoundingClientRect().width > 0).map(e => e.className.split(' ')[0])`);
			t.eq(j(ways), j(device === 'phone' ? ['binders-crumb-up', 'binders-crumb'] : ['binders-crumb']), 'the way up shows: the binder’s name, on a phone with an arrow before it');
			const up = await p.at(`.workspace-leaf.mod-active .binders-breadcrumbs .${ways[0]}[data-path]`);
			await tap(p, up.x, up.y);
			await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
			t.eq(await p.ev(`app.workspace.getMostRecentLeaf().getViewState().state?.folder`), 'The Lighthouse', 'a tap on it comes back out');
			await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 4`);
			await p.sleep(400);
			// a long press on Epilogue, then a drag onto the middle of Part Two's stack
			const e = await p.at(card(L + 'Epilogue.md')), st = await p.at(card(L + 'Part Two'));
			await touch(p, 'touchStart', e.x, e.y);
			await p.sleep(650);
			for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', e.x + (st.x - e.x) * i / 12, e.y + (st.y - e.y) * i / 12); await p.sleep(20); }
			await p.sleep(150);
			t.ok(await p.ev(`document.querySelector('${card(L + 'Part Two')}').classList.contains('is-being-dragged-over')`), 'held over a stack, the stack shows it will take the card');
			await touch(p, 'touchEnd');
			await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Epilogue.md')`);
			await flush(p);
			t.ok(!(await exists(p, L + 'Epilogue.md')), 'let go there, the note goes into the folder');
			t.eq(j((await contents(p)).slice(-3)), j(['Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Epilogue']), 'at its end');
			same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Epilogue.md']: L + 'Part Two/Epilogue.md' } });
			t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and no menu opens');
		});
	}));
}
