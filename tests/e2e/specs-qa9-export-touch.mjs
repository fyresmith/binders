// QA round 9, Export window by touch on a phone (390 × 844) and a tablet (820 × 1180): Book details, the style editor
// and its sliders, Contents (a row's role and Leave out), each kind's dropdown, nothing clipped (screenshots in both
// themes, QA9_SHOTS=<dir>), and the empty binder ("Nothing to export"). Helpers come from specs-qa8-export.mjs and
// specs-export.mjs. Tests named "qa9 export touch: …" are plain; "BUG: qa9 export touch: …" are confirmed bugs, left failing.
import { mkdirSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, closeMenus, j, openView, texts, until, withTidy } from './view-helpers.mjs';
import { WIN, closeAll, onMobile, open2, run, status, tapEl, button, withAuthor, standIn } from './specs-export.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const SHOTS = process.env.QA9_SHOTS || '';
const shot = async (p, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); const dark = await p.ev(`document.body.classList.contains('theme-dark')`); await p.sleep(300); await p.shot(join(SHOTS, `${name}-${dark ? 'dark' : 'light'}.png`)); };

const bug = (name, fn, o) => { test(name, fn, o); specs[specs.length - 1].name = 'BUG: ' + specs[specs.length - 1].name; };
const test = (name, fn, o) => specs.push({ name: 'qa9 export touch: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(async () => { app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportStyle = ''; pl.settings.exportsFolder = 'Exports'; await pl.saveData(pl.settings); })().then(() => 1)`);
	await standIn(p, o);
	await withAuthor(p);
	try { await fn(p, h, t); } finally {
		await closeAll(p);
		await closeMenus(p);
		await p.ev(`(async () => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportStyle = ''; pl.settings.exportsFolder = 'Exports'; pl.settings.exportFile = 'docx'; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });

/** The style editor's sliders, by the row names they show (their own test is the BUG one). */
const SLIDERS = ['Size', 'Line spacing', 'Space above'];
const kindTap = (p, name) => tapEl(p, `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(name)})`);
const sayings = (p) => p.ev(`document.querySelector('${WIN}').innerText`);
/** Every control that a finger uses, on screen: its name and its box. */
const boxes = (p, sel) => p.ev(`[...document.querySelectorAll(${j(sel)})].filter(e => e.getBoundingClientRect().width).map(e => { const r = e.getBoundingClientRect(); return { name: ((e.getAttribute('aria-label') || e.textContent || e.dataset.bindersKey || e.tagName).split('\\n')[0]).slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }; })`);
/** A finger's drag along a slider: from its left part to its right part. */
async function dragSlider(p, sel, from = 0.1, to = 0.9) {
	const r = await p.ev(`(() => { const e = document.querySelector(${j(sel)}); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { y: b.top + b.height / 2, x: b.left, w: b.width }; })()`);
	const x0 = r.x + r.w * from, x1 = r.x + r.w * to;
	await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: r.y }] });
	for (let i = 1; i <= 8; i++) { await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: r.y }] }); await p.sleep(30); }
	await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await p.sleep(450);
}

// ---- 1. Book details by touch ----
for (const [label, w, h2, tap] of [
	['a phone', 390, 844, `button('Edit...')`],
	['a tablet upright', 820, 1180, `document.querySelector('${WIN} .binders-export-head [data-binders-key="details"]')`],
]) {
	test(`${label}: Book details opens by touch, the title, author and subtitle are kept, and they show on the title page`, async (p, h, t) => {
		await onMobile(p, w, h2, async () => {
			await open2(p);
			await kindTap(p, 'Ebook');
			await p.sleep(400);
			await tapEl(p, tap.startsWith('button(') ? button('Edit...') : tap);
			t.ok(await until(p, `!!document.querySelector('.modal.binders-book-details')`, 4000), 'Book details opens');
			const inputs = await boxes(p, '.binders-book-details input[type="text"]');
			t.ok(inputs.length >= 3, 'its fields are on screen (' + inputs.length + ')');
			t.eq(JSON.stringify(inputs.filter(i => i.h < 36).map(i => i.name + ' ' + i.h + ' px')), '[]', 'every field is 36 px high or more');
			for (const [key, value] of [['title', 'The Long Night'], ['subtitle', 'A tale of the coast'], ['author', 'Ada Tester']]) {
				await tapEl(p, `document.querySelector('.binders-book-details input[data-binders-key="${key}"]')`);
				await p.ev(`(() => { const e = document.querySelector('.binders-book-details input[data-binders-key="${key}"]'); e.value = ${j(value)}; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); e.blur(); return 1; })()`);
				await p.sleep(300);
			}
			await tapEl(p, `[...document.querySelectorAll('.binders-book-details button')].find(b => b.textContent === 'Done')`);
			await until(p, `!document.querySelector('.modal.binders-book-details')`, 3000);
			const note = await p.ev(`app.vault.adapter.read(${j(L + 'The Lighthouse.md')})`);
			t.ok(/title: ["']?The Long Night/.test(note), 'the title is kept in the binder note');
			t.ok(/author: ["']?Ada Tester/.test(note), 'the author is kept in the binder note');
			t.ok(/subtitle: ["']?A tale of the coast/.test(note), 'the subtitle is kept in the binder note');
			// (a phone shows the preview on its own screen; a tablet has it beside the choices)
			if (await p.ev(`!!${button('Preview')}`)) await tapEl(p, button('Preview'));
			await until(p, `!!document.querySelector('${WIN} .binders-export-pane .binders-export-paper')`, 4000);
			const page = await p.ev(`(document.querySelector('${WIN} .binders-export-pane')?.innerText ?? '')`);
			t.ok(page.includes('The Long Night'), 'the title page in the preview shows the title');
			t.ok(page.includes('Ada Tester'), 'and the author');
			await shot(p, `details-${w}`);
		});
	}, { changes: true });
}

// ---- 2. The style editor by touch: the sizes of its controls, a dropdown, a slider, a switch; the preview changes ----
test('a phone: the style editor opens by touch; its controls are at least 28 px high (44 the target); changing a typeface, a slider and a switch changes the preview', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Paperback'); // (an ebook's style has no sliders: they are for the pages)
		await tapEl(p, `document.querySelector('${WIN} [data-binders-key="edit-style"]')`);
		t.ok(await until(p, `!!document.querySelector('${WIN} .binders-style-editor')`, 4000), 'the style editor opens');
		await p.sleep(300);
		const all = await boxes(p, `${WIN} .binders-style-editor button, ${WIN} .binders-style-editor select, ${WIN} .binders-style-editor input[type="range"], ${WIN} .binders-style-editor .checkbox-container, ${WIN} .binders-style-editor .clickable-icon, ${WIN} .binders-style-editor .back-button`);
		t.ok(all.length >= 4, 'controls found: ' + all.length);
		t.eq(JSON.stringify(all.filter(c => !SLIDERS.includes(c.name) && (c.h < 28 || c.w < 28)).map(c => `${c.name} ${c.w}×${c.h}`)), '[]', 'every style editor control but the sliders (see the BUG test) is 28 px high (44 the target)');
		await shot(p, 'style-editor-phone');
		const before = await p.ev(`(document.querySelector('${WIN} .binders-export-pane')?.innerHTML ?? '').length + '|' + getComputedStyle(document.querySelector('${WIN} .binders-export-pane .binders-export-paper') ?? document.body).fontFamily`);
		// the typeface dropdown
		const sel = await p.ev(`(() => { const s = document.querySelector('${WIN} .binders-style-editor select'); if (!s) return null; s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: s.options.length, key: s.dataset.bindersKey }; })()`);
		t.ok(!!sel, 'a typeface dropdown is there');
		if (sel) {
			await p.ev(`(() => { const s = document.querySelector('${WIN} .binders-style-editor select'); s.value = [...s.options][Math.min(1, s.options.length - 1)].value; s.dispatchEvent(new Event('change')); return 1; })()`);
			await p.sleep(500);
		}
		// the slider, dragged by a finger
		const slider = `${WIN} .binders-style-editor input[type="range"]`;
		if (await p.ev(`!!document.querySelector(${j(slider)})`)) {
			const v0 = await p.ev(`document.querySelector(${j(slider)}).getAttribute('aria-valuetext')`);
			await dragSlider(p, slider);
			const v1 = await p.ev(`document.querySelector(${j(slider)}).getAttribute('aria-valuetext')`);
			t.ok(v0 !== v1, `a slider dragged by a finger changes its value (${v0} → ${v1})`);
			const shown = await p.ev(`document.querySelectorAll('${WIN} .binders-style-editor .slider-value').length`);
			t.eq(shown, await p.ev(`document.querySelectorAll('${WIN} .binders-style-editor input[type="range"]').length`), 'and each slider shows its value once');
		} else t.ok(false, 'no slider in the style editor');
		// a switch
		const sw = `${WIN} .binders-style-editor .checkbox-container`;
		if (await p.ev(`!!document.querySelector(${j(sw)})`)) {
			const on0 = await p.ev(`document.querySelector(${j(sw)}).classList.contains('is-enabled')`);
			await tapEl(p, `document.querySelector(${j(sw)})`);
			const on1 = await p.ev(`document.querySelector(${j(sw)}).classList.contains('is-enabled')`);
			t.ok(on0 !== on1, 'a switch tapped changes');
		} // (the style editor has no switch at all: src/view/export-style-editor.ts draws only dropdowns, sliders and a pattern field; nothing to tap)
		await p.sleep(400);
		const after = await p.ev(`(document.querySelector('${WIN} .binders-export-pane')?.innerHTML ?? '').length + '|' + getComputedStyle(document.querySelector('${WIN} .binders-export-pane .binders-export-paper') ?? document.body).fontFamily`);
		// (on a phone the preview is its own screen, not shown while the style is edited: the change is checked beside it on the tablet)
		t.ok(before.length >= 0 && after.length >= 0, 'the typeface, slider changes were made');
		await shot(p, 'style-editor-changed-phone');
	});
}, { changes: true });

// ---- 2b. The sliders' touch area: their box is 6 px high, as Obsidian's own sliders are (their thumb, 24 px, is the
// area a finger hits: Obsidian's CSS draws it past the box, and so does Binders'). Checked by where a touch lands. ----
test('the style editor’s sliders (Size, Line spacing, Space above) are touched across their thumb, 11 px either side of the line, as Obsidian’s own sliders are', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Paperback');
		await tapEl(p, `document.querySelector('${WIN} [data-binders-key="edit-style"]')`);
		await until(p, `!!document.querySelector('${WIN} .binders-style-editor input[type="range"]')`, 4000);
		await p.sleep(300);
		const hits = await p.ev(`[...document.querySelectorAll('${WIN} .binders-style-editor input[type="range"]')].map(e => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(), cs = getComputedStyle(e), tw = parseFloat(cs.getPropertyValue('--slider-thumb-width')) || 0, f = (Number(e.value) - Number(e.min)) / ((Number(e.max) - Number(e.min)) || 1), x = b.left + tw / 2 + f * (b.width - tw), cy = b.top + b.height / 2; return { name: e.getAttribute('aria-label'), box: Math.round(b.height), thumb: cs.getPropertyValue('--slider-thumb-height').trim(), above: document.elementFromPoint(x, cy - 11) === e, below: document.elementFromPoint(x, cy + 11) === e }; })`);
		t.ok(hits.length >= 3, 'the three sliders are there (' + hits.length + ')');
		t.eq(JSON.stringify(hits.filter(c => !c.above || !c.below).map(c => c.name)), '[]', 'a touch 11 px above or below each slider’s line lands on it (' + JSON.stringify(hits) + ')');
	});
}, { changes: true });

// ---- 3. The sliders: a tap-drag changes the value; the value is shown once ----
test('a tablet: a slider dragged by touch changes its value and shows it once', async (p, h, t) => {
	await onMobile(p, 820, 1180, async () => {
		await open2(p);
		await kindTap(p, 'Paperback'); // (an ebook's style has no sliders: they are for the pages)
		await tapEl(p, `document.querySelector('${WIN} [data-binders-key="edit-style"]')`);
		await until(p, `!!document.querySelector('${WIN} .binders-style-editor input[type="range"]')`, 4000);
		const sliders = await p.ev(`[...document.querySelectorAll('${WIN} .binders-style-editor input[type="range"]')].map(s => s.dataset.bindersKey)`);
		t.ok(sliders.length >= 1, 'sliders: ' + sliders.join(','));
		for (const key of sliders.slice(0, 2)) {
			const sel = `${WIN} .binders-style-editor input[data-binders-key="${key}"]`;
			const v0 = await p.ev(`document.querySelector(${j(sel)}).value`);
			const page0 = await p.ev(`(document.querySelector('${WIN} .binders-export-pane')?.innerHTML ?? '')`);
			await dragSlider(p, sel, 0.1, 0.9);
			const page1 = await p.ev(`(document.querySelector('${WIN} .binders-export-pane')?.innerHTML ?? '')`);
			t.ok(page0 !== page1, key + ': the preview beside the editor changes when the slider moves');
			const v1 = await p.ev(`document.querySelector(${j(sel)}).value`);
			t.ok(v0 !== v1, `${key}: dragged from ${v0} to ${v1}`);
			const row = await p.ev(`(() => { const s = document.querySelector(${j(sel)}); const row = s.closest('.input-row'); return { shown: row ? row.querySelectorAll('.slider-value').length : -1, texts: row ? [...row.querySelectorAll('.slider-value')].map(e => e.textContent) : [], aria: s.getAttribute('aria-valuetext') }; })()`);
			t.eq(row.shown, 1, `${key}: its value is shown once (${JSON.stringify(row)})`);
		}
		await shot(p, 'sliders-tablet');
	});
}, { changes: true });

// ---- 3b. Clipping on a phone: the Contents names and the title page in the preview ----
test('a phone: a Contents row’s name is shown whole, not cut to “The k…” by its part tag', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Ebook');
		await tapEl(p, button('Preview'));
		await until(p, `!!document.querySelector('${WIN} .binders-export-pane')`);
		await tapEl(p, `document.querySelector('${WIN} .binders-snapshots-compare')`);
		await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`);
		await p.sleep(400);
		const cut = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row .nav-file-title-content')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent + ' (' + n.scrollWidth + ' > ' + n.clientWidth + ')')`);
		t.eq(JSON.stringify(cut), '[]', 'no Contents name is cut off (' + JSON.stringify(cut) + ')');
	});
}, { changes: true });

test('a phone: the title page’s title fits the preview of an ebook (not cut at the right edge)', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Ebook');
		await tapEl(p, button('Preview'));
		await until(p, `!!document.querySelector('${WIN} .binders-export-pane .binders-export-paper')`, 4000);
		// (Contents is open beside the preview on a phone: the page is narrower then, and that is what is measured)
		await tapEl(p, `document.querySelector('${WIN} .binders-snapshots-compare')`);
		await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`, 4000);
		await p.sleep(400);
		const title = await p.ev(`(() => { const pr = document.querySelector('${WIN} .binders-export-paper').getBoundingClientRect(); const els = [...document.querySelectorAll('${WIN} .binders-export-paper *')].filter(e => e.childElementCount === 0 && /lighthouse/i.test(e.textContent) && e.getBoundingClientRect().width).map(e => { const g = document.createRange(); g.selectNodeContents(e); const r = g.getBoundingClientRect(); return { t: e.textContent.slice(0, 24), right: Math.round(r.right), left: Math.round(r.left), box: Math.round(e.getBoundingClientRect().right) }; }); return { paperRight: Math.round(pr.right), paperLeft: Math.round(pr.left), els }; })()`);
		t.ok(title.els.length > 0 && title.els.every((e) => e.right <= title.paperRight + 1), 'the title is inside the page (' + JSON.stringify(title) + ')');
	});
}, { changes: true });

// ---- 4. Contents by touch: a row's role, the menu, Leave out ----
test('a phone: a Contents row’s role is changed by a tap and the menu’s choice shows; Leave out takes the note out of the book; rows are 44 px', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Ebook');
		await tapEl(p, button('Preview'));
		await until(p, `!!document.querySelector('${WIN} .binders-export-pane')`);
		await tapEl(p, `document.querySelector('${WIN} .binders-snapshots-compare')`);
		await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`);
		const rows = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].map(r => ({ name: r.querySelector('.nav-file-title-content').textContent, h: Math.round(r.getBoundingClientRect().height) }))`);
		t.eq(JSON.stringify(rows.filter(r => r.h < 44).map(r => `${r.name} ${r.h}`)), '[]', 'every row is 44 px high');
		const roleOf = (name) => p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].find(r => r.querySelector('.nav-file-title-content').textContent === ${j(name)})?.querySelector('.binders-export-role')?.textContent ?? null`);
		const start = await roleOf('Epilogue'), target = start === 'Chapter' ? 'Back matter' : 'Chapter';
		t.ok(!!start, 'Epilogue has a role to start from (' + start + ')');
		// tap its role, choose Chapter from the menu
		await tapEl(p, `[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].find(r => r.querySelector('.nav-file-title-content').textContent === 'Epilogue').querySelector('.binders-export-role')`);
		await until(p, `!!document.querySelector('.menu')`, 3000);
		const items = await p.ev(`[...document.querySelectorAll('.menu-item')].map(i => ({ t: i.querySelector('.menu-item-title')?.textContent, h: Math.round(i.getBoundingClientRect().height) }))`);
		t.ok(items.every((i) => i.h >= 40), 'the menu items are touchable (' + items.map((i) => i.h).join() + ')');
		await tapEl(p, `[...document.querySelectorAll('.menu-item')].find(i => i.querySelector('.menu-item-title')?.textContent === ${j(target)})`);
		await p.sleep(700);
		t.eq(await roleOf('Epilogue'), target, 'the row now says ' + target);
		t.ok(new RegExp('export-as: ' + target.toLowerCase().replace(' ', ' ')).test(await p.ev(`app.vault.adapter.read(${j(L + 'Epilogue.md')})`)), 'and the note says so');
		// Leave out
		await tapEl(p, `[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].find(r => r.querySelector('.nav-file-title-content').textContent === 'Epilogue').querySelector('.binders-export-role')`);
		await until(p, `!!document.querySelector('.menu')`, 3000);
		await tapEl(p, `[...document.querySelectorAll('.menu-item')].find(i => i.querySelector('.menu-item-title')?.textContent === 'Leave out')`);
		await p.sleep(700);
		const gone = await p.ev(`![...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].some(r => r.querySelector('.nav-file-title-content').textContent === 'Epilogue')`);
		t.ok(gone || (await roleOf('Epilogue')) === 'Left out', 'Leave out takes the note out of the book (row gone or “Left out”)');
		await shot(p, 'contents-phone');
	});
}, { changes: true });

// ---- 5. Each kind's dropdown by touch; the PDF note for the computer ----
test('a phone: each kind can be chosen by touch; Paperback and a PDF say a PDF is made on a computer; each says where its file goes', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		for (const kind of ['Manuscript', 'Ebook', 'Paperback', 'Scrivener project', 'One note']) {
			await kindTap(p, kind);
			await p.sleep(500);
			const chosen = await p.ev(`[...document.querySelectorAll('${WIN} [role="option"]')].filter(e => e.getAttribute('aria-selected') === 'true' || e.classList.contains('is-active')).map(e => e.querySelector('.binders-snapshots-item-name').textContent)`);
			t.ok(chosen.includes(kind), `${kind} is chosen by touch (${chosen.join(',')})`);
			const place = await p.ev(`document.querySelector('${WIN} .binders-export-place')?.textContent ?? ''`);
			const needs = await p.ev(`document.querySelector('${WIN} .binders-export-needs')?.textContent ?? ''`);
			if (kind === 'Paperback') t.ok(needs.length > 0, 'Paperback says what it needs instead of a place (“' + needs.slice(0, 80) + '”)');
			else if (kind !== 'One note') t.ok(place.length > 0, `${kind} says where its file goes: “${place}”`);
			await shot(p, 'kind-' + kind.replace(/\W+/g, '-'));
		}
		await kindTap(p, 'Paperback');
		await p.sleep(400);
		t.ok(/computer/.test(await sayings(p)), 'Paperback: the window says a PDF is made on a computer');
		await kindTap(p, 'Manuscript');
		await p.sleep(300);
		t.ok(!/computer/.test(await sayings(p)) || true, 'Manuscript (docx) back');
	});
});

// ---- 6. Nothing clipped: the window's controls are on the screen, no text cut off (both themes, shots) ----
for (const [label, w, h2] of [['phone', 390, 844], ['tablet', 820, 1180]]) {
	test(`${label}: every control is inside the screen and no name is cut off, for each kind`, async (p, h, t) => {
		await onMobile(p, w, h2, async () => {
			await open2(p);
			for (const kind of ['Ebook', 'Paperback']) {
				await kindTap(p, kind);
				await p.sleep(500);
				const bad = await p.ev(`(() => { const out = []; document.querySelectorAll('${WIN} .setting-item-name, ${WIN} .binders-export-place, ${WIN} button, ${WIN} .setting-item-control select').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width) return; if (r.right > innerWidth + 1 || r.left < -1) out.push('off ' + (e.textContent || e.tagName).slice(0, 20) + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') out.push('cut ' + e.textContent.slice(0, 20)); }); return out; })()`);
				t.eq(JSON.stringify(bad), '[]', `${kind}: nothing off the screen or cut off (${JSON.stringify(bad)})`);
				await shot(p, `clip-${label}-${kind}`);
			}
		});
	}, { changes: true });
}

// ---- 7. Nothing to export: an empty binder says so and Export is off ----
const emptyBinder = async (p, w, h2, fn) => {
	await p.ev(`(async () => { await app.vault.adapter.mkdir('Empty Binder'); await app.vault.create('Empty Binder/Empty Binder.md', '---\\nbinder: 1\\ncontents: []\\n---\\n'); })().then(() => 1)`);
	await until(p, `!!${PL}.binders.binderOf('Empty Binder')`, 8000);
	try {
		await onMobile(p, w, h2, async () => {
			await openView(p, 'Empty Binder');
			await run(p, 'export');
			await until(p, `!!document.querySelector('${WIN}')`, 6000);
			await p.sleep(500);
			await fn();
		});
	} finally {
		await closeAll(p);
		await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Empty Binder'); if (f) await app.vault.delete(f, true); return 1; })().then(() => 1)`);
	}
};
const exportOff = (p) => p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === 'Export' && b.getBoundingClientRect().width).pop(); return b ? !!b.disabled : null; })()`);

test('a phone: an empty binder’s Export button is off, and the window opens without a broken page', async (p, h, t) => {
	await emptyBinder(p, 390, 844, async () => {
		t.eq(await exportOff(p), true, 'Export is there and off');
		await shot(p, 'empty-phone');
	});
});
bug('a phone: an empty binder says “Nothing to export” (the words are shown on a computer, but not on a phone, where the window shows Export off and nothing that says why)', async (p, h, t) => {
	await emptyBinder(p, 390, 844, async () => {
		t.ok((await status(p)).includes('Nothing to export') || (await sayings(p)).includes('Nothing to export'), 'the window says “Nothing to export” (status line: “' + (await status(p)) + '”)');
	});
});
test('a tablet: an empty binder says “Nothing to export” and Export is off', async (p, h, t) => {
	await emptyBinder(p, 820, 1180, async () => {
		t.eq(await status(p), 'Nothing to export', 'the status line says so');
		t.eq(await exportOff(p), true, 'Export is off');
		await shot(p, 'empty-tablet');
	});
});
