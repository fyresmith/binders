import { readFileSync, readdirSync } from 'fs';
import { CLASSIC } from '../src/export/style';
import { fill, type Flow, type Host, type Mark, type Opened, type PageKind } from '../src/export/pages/fill';
import { furnish } from '../src/export/pages/furniture';
import { TRIM_SIZES, bookGeometry, gutter, manuscriptGeometry, paperSize, trimSize } from '../src/export/pages/geometry';
import { Hyphenator, SHY, unhyphenated } from '../src/export/pages/hyphenate';
import { hyphenatorFor } from '../src/export/pages/patterns';
import { manuscriptStyle } from '../src/export/docx-parts';
import { pdfPages, withInfo } from '../src/export/pdf-info';
import { done, eq, ok } from './harness';

// ---- the paginator, on pages that are only numbers: a line is 1 high, a page holds `H` of them ----

interface Blk { id: string; lines: number; marks: Mark[]; keep?: boolean; solid?: boolean; rows?: boolean }
interface Pg { opened: Opened; text: Blk[]; notes: Blk[] }
const RULE = 1; // what the rule over a page's notes takes

class Fake implements Host<Blk> {
	pages: Pg[] = [];
	constructor(private H: number, private notes: Map<number, Blk>) { }
	private get at(): Pg { return this.pages[this.pages.length - 1]; }
	open(opened: Opened): void { this.pages.push({ opened, text: [], notes: [] }); }
	room(): number { const p = this.at, n = p.notes.reduce((s, b) => s + b.lines, 0); return this.H - p.text.reduce((s, b) => s + b.lines, 0) - (n ? n + RULE : 0); }
	put(b: Blk): void { this.at.text.push(b); }
	pull(b: Blk): void { this.at.text.splice(this.at.text.indexOf(b), 1); }
	putNote(n: Blk): void { this.at.notes.push(n); }
	pullNote(n: Blk): void { this.at.notes.splice(this.at.notes.indexOf(n), 1); }
	lines(b: Blk): number { return b.solid || b.keep ? 0 : b.lines; }
	lead(): number { return 1; }
	most(b: Blk): number { return Math.max(0, Math.min(this.lines(b), this.lines(b) + Math.floor(this.room()))); }
	spare(b: Blk, k: number): number { return this.room() + (b.lines - k); }
	marks(b: Blk): Mark[] { return b.marks; }
	cut(b: Blk, k: number): Blk {
		const rest: Blk = { id: `${b.id}+`, lines: b.lines - k, marks: b.marks.filter((m) => m.line >= k).map((m) => ({ note: m.note, line: m.line - k })), rows: b.rows };
		b.marks = b.marks.filter((m) => m.line < k);
		b.lines = k;
		return rest;
	}
	note(n: number): Blk | null { return this.notes.get(n) ?? null; }
	keeps(b: Blk): boolean { return !!b.keep; }
	least(b: Blk): readonly [number, number] { return b.rows ? [2, 1] : [2, 2]; }
}

const p = (id: string, lines: number, ...marks: [note: number, line: number][]): Blk => ({ id, lines, marks: marks.map(([note, line]) => ({ note, line })) });
const flow = (blocks: Blk[], recto = false, first: PageKind = 'opener'): Flow<Blk> => ({ blocks, first, rest: first === 'display' ? 'display' : 'body', recto });
function run(H: number, flows: Flow<Blk>[], notes: Record<number, number> = {}): { pages: Pg[]; opened: Opened[]; said: string } {
	const host = new Fake(H, new Map(Object.entries(notes).map(([n, lines]) => [Number(n), { id: `n${n}`, lines, marks: [] }])));
	const it = fill(host, flows);
	let r = it.next(), turns = 0;
	while (!r.done) { r = it.next(); if (++turns > 5000) throw new Error('the paginator never ends'); }
	const said = host.pages.map((pg) => `${pg.text.map((b) => `${b.id}:${b.lines}`).join(' ')}${pg.notes.length ? ` | ${pg.notes.map((b) => `${b.id}:${b.lines}`).join(' ')}` : ''}`).join(' / ');
	return { pages: host.pages, opened: r.value, said };
}

{
	eq(run(10, [flow([p('a', 5), p('b', 5), p('c', 5)])]).said, 'a:5 b:5 / c:5', 'paragraphs fill a page and go on to the next');
	eq(run(10, [flow([p('a', 8), p('b', 5)])]).said, 'a:8 b:2 / b+:3', 'a paragraph is cut at a line');
	eq(run(10, [flow([p('a', 9), p('b', 4)])]).said, 'a:9 / b:4', 'never one line alone at the foot of a page');
	eq(run(10, [flow([p('a', 7), p('b', 4)])]).said, 'a:7 b:2 / b+:2', 'never one line alone at the head of the next');
	eq(run(10, [flow([p('a', 9), p('b', 3)])]).said, 'a:9 / b:3', 'a paragraph of three lines is never cut');
	eq(run(10, [flow([p('a', 8), { id: 'h', lines: 1, marks: [], keep: true }, p('b', 4)])]).said, 'a:8 / h:1 b:4', 'a heading is never left at the foot of a page');
	eq(run(10, [flow([p('a', 8), { id: 'h', lines: 1, marks: [], keep: true }, { id: 'h2', lines: 1, marks: [], keep: true }, p('b', 4)])]).said, 'a:8 / h:1 h2:1 b:4', 'nor two of them');
	eq(run(10, [flow([p('a', 9), { id: 'br', lines: 1, marks: [], keep: true }, p('b', 4)])]).said, 'a:9 / br:1 b:4', 'a scene break that falls at a page turn opens the next page');
	eq(run(10, [flow([p('a', 4), { id: 'pic', lines: 30, marks: [], solid: true }, p('b', 4)])]).said, 'a:4 / pic:30 / b:4', 'what is taller than a page has a page to itself, and the book goes on');
	eq(run(10, [flow([p('a', 7), { id: 't', lines: 6, marks: [], rows: true }])]).said, 'a:7 t:3 / t+:3', 'a table is broken between rows');
	eq(run(10, [flow([p('a', 9), { id: 't', lines: 6, marks: [], rows: true }])]).said, 'a:9 / t:6', 'never its head row alone');
}

// ---- footnotes ----
{
	eq(run(10, [flow([p('a', 4, [0, 1]), p('b', 3)])], { 0: 2 }).said, 'a:4 b:3 | n0:2', 'a footnote is at the foot of the page its mark is on');
	eq(run(10, [flow([p('a', 8, [0, 7])])], { 0: 3 }).said, 'a:6 / a+:2 | n0:3', 'no room for the note: the line with its mark goes over, and the note with it');
	// the spike's bug: a paragraph cut before its mark kept the room the note would have taken, and left the page short
	eq(run(10, [flow([p('a', 14, [0, 12])])], { 0: 3 }).said, 'a:10 / a+:4 | n0:3', 'a paragraph cut before its footnote mark fills its page');
	eq(run(10, [flow([p('a', 6), p('b', 6, [0, 1], [1, 4])])], { 0: 1, 1: 2 }).said, 'a:6 b:2 | n0:1 / b+:4 | n1:2', 'each note with its own mark’s lines');
	const long = run(10, [flow([p('a', 4, [0, 3])])], { 0: 12 });
	eq(long.said, 'a:4 | n0:5 /  | n0+:7', 'a footnote too long for its page begins under its mark and flows on to the next');
	eq(run(10, [flow([p('a', 4, [0, 3])])], { 0: 30 }).pages.length, 4, 'and on, over as many pages as it needs');
	eq(run(10, [flow([p('a', 3, [0, 0]), p('b', 3, [0, 1])])], { 0: 2 }).said, 'a:3 b:3 | n0:2', 'a note marked twice is set once');
}

// ---- pages: right-hand openings, the kinds ----
{
	const r = run(10, [flow([p('t', 2)], true, 'display'), flow([p('c', 2)], false, 'display'), flow([p('a', 12)], true), flow([p('b', 3)], true)]);
	eq(r.opened.map((o) => `${o.kind}${o.section}`).join(' '), 'display0 display1 opener2 body2 opener3', 'a section opens on a right-hand page');
	const odd = run(10, [flow([p('t', 2)], true, 'display'), flow([p('a', 3)], true), flow([p('b', 3)], true)]);
	eq(odd.opened.map((o) => `${o.kind}${o.section}`).join(' '), 'display0 blank-1 opener1 blank-1 opener2', 'with a blank page before it when it must');
	eq(run(10, [flow([p('a', 3)]), flow([p('b', 3)])]).opened.length, 2, 'or on the next page, when the style says so');
}

// ---- whatever the book, the pages hold: nothing lost, nothing over-full, every note on its mark's page or after ----
{
	let seed = 7;
	const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
	let bad = '';
	for (let round = 0; round < 300 && !bad; round++) {
		const H = 6 + rnd(30), notes: Record<number, number> = {}, flows: Flow<Blk>[] = [];
		let n = 0, total = 0;
		for (let s = 0; s < 1 + rnd(4); s++) {
			const blocks: Blk[] = [];
			for (let i = 0; i < 1 + rnd(25); i++) {
				const kind = rnd(12), lines = kind === 0 ? 1 : 1 + rnd(kind === 1 ? 40 : 12);
				const b: Blk = { id: `s${s}b${i}`, lines, marks: [], keep: kind === 0, solid: kind === 2 && lines < H, rows: kind === 3 };
				if (!b.keep && !b.solid && rnd(3) === 0) for (let m = 0; m <= rnd(3); m++) { notes[n] = 1 + rnd(m ? 4 : 2 * H); b.marks.push({ note: n++, line: rnd(lines) }); }
				b.marks.sort((a, z) => a.line - z.line);
				total += lines;
				blocks.push(b);
			}
			flows.push(flow(blocks, rnd(2) === 0));
		}
		const noteLines = Object.values(notes).reduce((a, b) => a + b, 0);
		let r: ReturnType<typeof run>;
		try { r = run(H, flows, notes); } catch (e) { bad = `round ${round}: ${String(e)}`; break; }
		const text = r.pages.reduce((s, pg) => s + pg.text.reduce((x, b) => x + b.lines, 0), 0), under = r.pages.reduce((s, pg) => s + pg.notes.reduce((x, b) => x + b.lines, 0), 0);
		if (text !== total || under !== noteLines) bad = `round ${round}: ${text}/${total} lines of text, ${under}/${noteLines} of notes`;
		const order = r.pages.flatMap((pg) => pg.text.map((b) => b.id.replace(/\++$/, ''))).filter((id, i, all) => id !== all[i - 1]).join(), was = flows.flatMap((f) => f.blocks.map((b) => b.id)).join();
		if (order !== was) bad = `round ${round}: the blocks are out of order`;
		r.pages.forEach((pg, i) => {
			const used = pg.text.reduce((x, b) => x + b.lines, 0) + (pg.notes.length ? pg.notes.reduce((x, b) => x + b.lines, 0) + RULE : 0);
			const alone = pg.text.length <= 1 && (pg.text[0]?.solid || pg.text[0]?.keep || pg.text[0]?.lines === 1 || !pg.text.length) || pg.text.every((b) => b.keep);
			if (used > H && !alone && !(pg.text.length === 1 && pg.notes.length)) bad = `round ${round}: page ${i + 1} holds ${used} lines of ${H} (${r.said})`;
			for (const b of pg.text) for (const m of b.marks) {
				const first = r.pages.findIndex((x) => x.notes.some((nb) => nb.id === `n${m.note}`));
				if (first !== i) bad = `round ${round}: note ${m.note} begins on page ${first + 1}, its mark is on page ${i + 1}`;
			}
		});
	}
	ok(!bad, `300 books of every shape are paged whole: ${bad}`);
}

// ---- heads and numbers ----
{
	const pages: Opened[] = [{ kind: 'display', section: 0 }, { kind: 'display', section: 1 }, { kind: 'opener', section: 2 }, { kind: 'body', section: 2 }, { kind: 'blank', section: -1 }, { kind: 'opener', section: 3 }, { kind: 'body', section: 3 }, { kind: 'body', section: 3 }, { kind: 'opener', section: 4 }];
	const front = [true, true, true, false, false];
	const f = furnish(pages, { heads: 'author and title', numbers: 'foot', title: 'The Lighthouse', author: 'Ada Vane', front });
	eq(f.map((x) => x.number).join(' '), 'i ii iii iv v 1 2 3 4', 'front matter is counted in Roman numerals; the text starts at 1');
	eq(f.map((x) => x.folio || '-').join(' '), '- - foot foot - foot foot foot foot', 'a title page and a blank page show no number');
	eq(f.map((x) => x.head || '-').join(' | '), '- | - | - | - | - | - | The Lighthouse | Ada Vane | -', 'the author on the left, the title on the right, and no head where a chapter opens');
	const top = furnish(pages, { heads: 'title', numbers: 'top outside', title: 'T', author: 'A', front });
	eq(top.map((x) => x.folio || '-').join(' '), '- - foot foot - foot head head foot', 'a number at the top is at the foot where a chapter opens');
	eq(furnish(pages, { heads: 'none', numbers: 'none', title: 'T', author: 'A', front }).every((x) => !x.head && !x.folio), true, 'a style can have neither');
	const ms = furnish([{ kind: 'display', section: 0 }, { kind: 'opener', section: 1 }, { kind: 'body', section: 1 }], { heads: 'none', numbers: 'none', title: '', author: '', header: 'Vane / LIGHTHOUSE / {page}', front: [true, false] });
	eq(ms.map((x) => x.head || '-').join(' | '), '- | Vane / LIGHTHOUSE / 1 | Vane / LIGHTHOUSE / 2', 'a manuscript counts from its first page of text');
}

// ---- the page's measures ----
{
	eq(TRIM_SIZES.map((s) => s.name).join(', '), '5 × 8 in, 5.25 × 8 in, 5.5 × 8.5 in, 6 × 9 in, A5', 'the trim sizes');
	eq(trimSize('nothing').id, '5x8', 'a size that isn’t there is the first');
	eq(paperSize('a4').name, 'A4', 'a manuscript is on Letter or A4');
	const g = bookGeometry(CLASSIC, trimSize('5x8'));
	eq(g.lead, 15, 'Classic: 11 on 15');
	eq(g.block, g.lines * g.lead, 'the text block is a whole number of lines');
	ok(g.top + g.block + 30 < g.height, 'with room under it for the page number');
	ok(g.inside > g.outside, 'the inside margin is the wider');
	eq(bookGeometry({ ...CLASSIC, margins: 'narrow' }, trimSize('5x8'), 620).inside, gutter(620), 'a thick book has at least the printers’ margin at its spine');
	eq([100, 200, 400, 600, 800].map((n) => gutter(n) / 72).join(' '), '0.375 0.5 0.625 0.75 0.875', 'the printers’ table');
	ok(bookGeometry({ ...CLASSIC, margins: 'wide' }, trimSize('5x8')).lines < bookGeometry({ ...CLASSIC, margins: 'narrow' }, trimSize('5x8')).lines, 'wide margins hold fewer lines');
	ok(bookGeometry(CLASSIC, trimSize('6x9')).lines > g.lines, 'a larger page holds more');
	const m = manuscriptGeometry(manuscriptStyle('Standard manuscript'), paperSize('letter'));
	eq(`${m.lead} ${m.lines} ${m.inside}`, '24 27 72', 'a manuscript: double-spaced, an inch all round');
}

// ---- hyphenation ----
{
	const en = hyphenatorFor('en-US') as Hyphenator, show = (h: Hyphenator, w: string) => h.hyphenate(w).split(SHY).join('-');
	eq(show(en, 'hyphenation'), 'hy-phen-ation', 'TeX’s patterns, American');
	eq(show(en, 'lighthouse keeper'), 'light-house keeper', 'a word at a time, and short words whole');
	eq(show(hyphenatorFor('en-GB') as Hyphenator, 'hyphenation'), 'hy-phen-a-tion', 'British English has its own');
	eq(show(hyphenatorFor('de') as Hyphenator, 'Leuchtturmwärter'), 'Leucht-turm-wär-ter', 'German');
	eq(show(hyphenatorFor('fr-CA') as Hyphenator, 'bibliothèque'), 'bi-blio-thèque', 'French, by the language’s first letters');
	ok(['es', 'it', 'pt', 'pt-BR'].every((l) => hyphenatorFor(l)), 'Spanish, Italian and Portuguese too');
	ok(['nl', 'ru', 'ja', 'he', 'xx'].every((l) => hyphenatorFor(l) === null), 'and none where there are no patterns');
	// the words TeX's files break by hand (\hyphenation) come with the patterns, and are believed before them
	eq(show(en, 'associate, present, reformation'), 'as-so-ciate, present, ref-or-ma-tion', 'TeX’s own exceptions, American');
	eq(show(hyphenatorFor('en') as Hyphenator, 'Manuscript, university'), 'Ma-nu-script, uni-ver-sity', 'and British, whatever the capitals');
	eq(show(hyphenatorFor('pt') as Hyphenator, 'software constituição'), 'soft-ware cons-ti-tu-ição', 'Portuguese, with a break kept four letters from the end');
	eq(show(hyphenatorFor('es') as Hyphenator, 'desarrollo'), 'de-sa-rro-llo', 'Spanish');
	eq(show(hyphenatorFor('it') as Hyphenator, 'straordinariamente'), 'straor-di-na-ria-men-te', 'Italian');
	// every pattern set travels with its makers' notice: a comment the build keeps in main.js (it starts with "!")
	const sets = readdirSync('src/export/pages/patterns'), heads = sets.map((f) => readFileSync(`src/export/pages/patterns/${f}`, 'utf8').split('*/')[0]);
	eq(sets.join(' '), 'de.ts en-gb.ts en-us.ts es.ts fr.ts it.ts pt.ts', 'a module a language');
	ok(heads.every((h) => h.startsWith('/*! ') && /% copyright: Copyright/.test(h) && /% licence:/.test(h)), 'each with its copyright and its licence at its head');
	eq(heads.filter((h) => /name: (MIT|BSD 3-clause)/.test(h) || /Copying and distribution of this file, with or without modification,\n%\s+are permitted/.test(h)).length, sets.length, 'and each a licence that may travel in the plugin');
	const text = 'The keeper—unremarkable, extraordinarily patient—waited. “Unbelievable,” she said; it’s 1,000 well-known İstanbul.';
	eq(unhyphenated(en.hyphenate(text)), text, 'only soft hyphens are added: the words are the words');
	ok(en.hyphenate(text).includes(SHY), 'and there are some');
}

// ---- what a PDF says about itself ----
{
	const body = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 3 /Kids [] >>\nendobj\n';
	const pdf = `${body}xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;
	const bytes = (t: string) => Uint8Array.from(t, (c) => c.charCodeAt(0)), text = (d: Uint8Array) => String.fromCharCode(...d);
	eq(pdfPages(bytes(pdf)), 3, 'a PDF’s pages are counted');
	const out = text(withInfo(bytes(pdf), { title: 'Łódź', author: 'Mara Lindqvist', creator: 'Binders', when: new Date(Date.UTC(2026, 9, 5, 12, 0, 0)) }));
	ok(out.startsWith(pdf), 'the title and the author are added after the file: nothing that was printed changes');
	ok(out.includes('/Title <FEFF014100F30064017A>') && out.includes('/Author <FEFF004D0061007200610020004C0069006E006400710076006900730074>'), 'as text any PDF reader can read, in any alphabet');
	ok(out.includes('/CreationDate (D:20261005120000Z)'), 'with when it was made');
	const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(out)?.[1]), obj = Number(/\n3 1\n(\d{10}) 00000 n /.exec(out)?.[1]);
	ok(out.slice(xref).startsWith('xref\n0 1\n') && out.slice(obj).startsWith('3 0 obj\n'), 'and the file’s own table points at them');
	ok(out.includes(`/Size 4 /Root 1 0 R /Info 3 0 R /Prev ${body.length} >>`), 'after the table that was there');
	eq(text(withInfo(bytes('not a pdf'), { title: 'T', author: '', creator: 'B' })), 'not a pdf', 'a file that isn’t built that way is left as it is');
}

done('export-pages');
