// The manuscript's section editors and the room a plugin's gutter handles need (issue #36: Dragger, Notion Block, Tiny
// Dragger and Feel the Notion draw their handles in the editor's left gutter, and a section's editor clipped them).
// Dragger (2.1.1, its default settings) draws its handle in a gutter with no width at the start of the editor's text,
// and moves the 20 px handle left by its own width: its right edge is the line's text edge, its left edge 20 px left
// of it. The stand-in below is that box, inside the section's own scroller, so it is clipped as the real one is.
import { VIEW, openView, withTidy, until } from './view-helpers.mjs';

export const tier = 'look';
export const specs = [];
const test = (name, fn) => specs.push({ name: 'manuscript-gutter: ' + name, fn: withTidy(fn) });

const J = JSON.stringify;
const LEAF = '.workspace-leaf.mod-active';
const B = 'Gutter';
const HANDLE = 20; // Dragger's default handle size, px

async function openMs(p) {
	await openView(p, B);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('${LEAF} .binders-manuscript .cm-scroller')`, 8000);
	await p.sleep(500);
}

/** A binder “Gutter”: a text section, a section with a table wider than the page, and a plain one after it. */
async function setup(p) {
	const head = Array.from({ length: 10 }, (_, c) => `Column ${c + 1} heading`).join(' | ');
	const sep = Array.from({ length: 10 }, () => '---').join(' | ');
	const row = Array.from({ length: 10 }, (_, c) => `c${c + 1}` + 'unbreakable'.repeat(4)).join(' | ');
	const table = `| ${head} |\n| ${sep} |\n| ${row} |\n`;
	await p.ev(`(async () => {
		await app.vault.createFolder(${J(B)});
		await app.vault.adapter.write(${J(`${B}/1 Text.md`)}, 'The first paragraph of the book, and the keeper wrote it down.\\n');
		await app.vault.adapter.write(${J(`${B}/2 Table.md`)}, ${J(`Before the table.\n\n${table}\nAfter the table.\n`)});
		await app.vault.adapter.write(${J(`${B}/3 Last.md`)}, 'The last paragraph.\\n');
		await new Promise(r => setTimeout(r, 700));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath(${J(B)}));
		return 1; })()`);
	await p.sleep(800);
	await openMs(p);
}

/** The section at `which` (0 is the first editor): its text's left edge, its scroller's box, the pane's and the page's. */
const measure = (p, which) => p.ev(`(() => {
	const pane = document.querySelector('${LEAF} .binders-manuscript');
	const sc = [...document.querySelectorAll('${LEAF} .binders-manuscript .cm-scroller')][${which}];
	const page = document.querySelector('${LEAF} .binders-manuscript-page');
	const line = sc.querySelector('.cm-line');
	const r = document.createRange(); r.selectNodeContents(line);
	const t = r.getClientRects()[0];
	const b = sc.getBoundingClientRect(), pb = pane.getBoundingClientRect(), pg = page.getBoundingClientRect();
	return {
		text: Math.round(t.left * 10) / 10,
		page: Math.round(pg.left * 10) / 10,
		scroller: [Math.round(b.left), Math.round(b.right)],
		pane: [Math.round(pb.left), Math.round(pb.right)],
		scrolls: sc.scrollWidth - sc.clientWidth,
	};
})()`);

/** A stand-in for Dragger's handle, inside the section's scroller (its positioned box, so the scroller clips it). */
const standIn = (p, which) => p.ev(`(() => {
	const sc = [...document.querySelectorAll('${LEAF} .binders-manuscript .cm-scroller')][${which}];
	const r = document.createRange(); r.selectNodeContents(sc.querySelector('.cm-line'));
	const t = r.getClientRects()[0];
	const sb = sc.getBoundingClientRect();
	const h = document.createElement('div');
	h.className = 'manuscript-gutter-test-handle';
	h.style.cssText = 'position:absolute;width:${HANDLE}px;height:${HANDLE}px;background:red;z-index:50;';
	h.style.left = (t.left - sb.left - sc.clientLeft + sc.scrollLeft - ${HANDLE}) + 'px';
	h.style.top = (t.top - sb.top - sc.clientTop + sc.scrollTop + t.height / 2 - ${HANDLE} / 2) + 'px';
	sc.appendChild(h);
	const b = h.getBoundingClientRect(), y = b.top + b.height / 2;
	// the centre, and the handle’s outer edge: a clipped handle loses the part past the scroller’s edge
	const at = (x) => document.elementFromPoint(x, y) === h;
	return { centre: at(b.left + b.width / 2), edge: at(b.left + 1), handle: [Math.round(b.left), Math.round(b.right)], scroller: [Math.round(sb.left), Math.round(sb.right)] };
})()`);

const clear = (p) => p.ev(`document.querySelectorAll('.manuscript-gutter-test-handle').forEach(e => e.remove()) && 1`);

test('a handle in the gutter of a section is drawn whole: the pointer finds it at its centre and at its outer edge', async (p, h, t) => {
	await setup(p);
	const s = await standIn(p, 0);
	await clear(p);
	t.ok(s.centre && s.edge, 'the handle is not clipped by the section’s editor: ' + J(s));
});

test('the text stays where it was: a section’s first line starts on the page’s text edge', async (p, h, t) => {
	await setup(p);
	const m = await measure(p, 0);
	t.ok(Math.abs(m.text - m.page) <= 1, 'the text is on the page’s text edge: ' + J(m));
});

test('a table wider than the page scrolls sideways inside its section, and the section stays within the pane', async (p, h, t) => {
	await setup(p);
	// the table’s section, scrolled to: it is made live (an editor) only near the screen
	await p.ev(`(() => { const c = [...document.querySelectorAll('${LEAF} .binders-manuscript td, ${LEAF} .binders-manuscript th')][0]; c?.scrollIntoView({ block: 'center' }); return 1; })()`);
	await until(p, `[...document.querySelectorAll('${LEAF} .binders-manuscript .cm-scroller')].some(s => s.querySelector('.cm-table-widget, table'))`, 8000);
	await p.sleep(400);
	const k = await p.ev(`(() => { const all = [...document.querySelectorAll('${LEAF} .binders-manuscript .cm-scroller')]; return Math.max(0, all.findIndex(s => s.querySelector('.cm-table-widget, table'))); })()`);
	const m = await measure(p, k);
	// the table widget is the one that scrolls sideways (its own box), so its edges and its scrolling are read too
	const w = await p.ev(`(() => { const sc = [...document.querySelectorAll('${LEAF} .binders-manuscript .cm-scroller')][${k}]; const e = sc.querySelector('.cm-table-widget, table'); const r = e.getBoundingClientRect(); return { scrolls: e.scrollWidth - e.clientWidth, box: [Math.round(r.left), Math.round(r.right)], table: e.tagName }; })()`);
	const pane = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-manuscript'); return { sw: e.scrollWidth, cw: e.clientWidth }; })()`);
	t.ok(w.scrolls > 0 || m.scrolls > 0, 'the table is wider than its section and scrolls sideways there: ' + J({ m, w }));
	t.ok(m.scroller[0] >= m.pane[0] && m.scroller[1] <= m.pane[1], 'the section stays inside the pane: ' + J(m));
	t.ok(pane.sw <= pane.cw, 'the pane does not scroll sideways: ' + J(pane));
});
