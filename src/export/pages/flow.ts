import { contentsOf } from '../epub';
import { leadSplit } from '../epub-text';
import { plain, type Block, type Book, type Inline, type Picture, type Section } from '../model';
import { against, bookWord, type BookStyle } from '../style';
import { el } from './el';
import type { Flow } from './fill';

/* The book as the blocks its pages are filled with: every section a run of flat blocks (a paragraph, a heading, a
   break, a table, a picture), so the paginator has one kind of thing to place and to cut. What is nested in the
   note (a list in a quotation) is flat here and set in by its depth. Footnotes are made as their marks are met, and
   wait to be put at the foot of a page. It builds elements in the document it is given and measures nothing. */

export interface Look {
	/** A section's heading, a line each. */
	heading(s: Section): string[];
	/** The scene break's mark; "" for space only. */
	mark: string;
	/** A chapter's first words are set apart. */
	lead: boolean;
	/** Sections open on a right-hand page. */
	recto: boolean;
	/** Soft hyphens for some text, or null when the book is set without. */
	hyphenate: ((text: string) => string) | null;
	/** Where a picture's bytes can be shown from. */
	picture(p: Picture): string;
	/** The size a picture is shown at, in CSS pixels: its own, or as much smaller as the text block asks. */
	fit(p: Picture): [width: number, height: number];
	/** The title page, when it is made a way of the look's own (a manuscript's). */
	titlePage?: (page: HTMLElement) => void;
	/** A manuscript: only its title page is a page set by itself; a part is headed as a chapter is. */
	plain?: boolean;
	/** The style the contents are named by (a book's). */
	style?: BookStyle;
}

/** A section's pages: what the paginator fills, and what the pages are then called. */
export interface SectionFlow extends Flow<HTMLElement> { id: string; cls: string; front: boolean }

const DISPLAY = new Set(['title-page', 'copyright', 'dedication', 'epigraph']);

export class BookFlow {
	flows: SectionFlow[] = [];
	private notes = new Map<number, HTMLElement>();
	/** The number each footnote is shown by: from one in each section. */
	private shown = new Map<number, number>();
	private count = 0;

	constructor(private doc: Document, private book: Book, private look: Look) {
		for (const s of book.sections) this.flows.push(this.section(s));
	}

	/** A footnote's block, once its mark has been met. */
	note(n: number): HTMLElement | null { return this.notes.get(n) ?? null; }

	private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] { return el(this.doc, tag, cls, text); }
	private text(s: string, plainly = false): Text { return this.doc.createTextNode(plainly || !this.look.hyphenate ? s : this.look.hyphenate(s)); }

	private section(s: Section): SectionFlow {
		const { book, look } = this, blocks: HTMLElement[] = [];
		this.count = 0;
		const display = look.plain ? !!s.made && s.matter === 'title-page' : s.role === 'part' || (!!s.matter && DISPLAY.has(s.matter));
		const flow: SectionFlow = { id: s.id, cls: s.matter ?? s.role, front: s.role === 'front', blocks, first: display ? 'display' : 'opener', rest: display ? 'display' : 'body', recto: look.recto && s.matter !== 'copyright' };
		if (s.made && s.matter === 'title-page') {
			if (look.titlePage) { const page = this.el('div', 'made'); look.titlePage(page); blocks.push(page); return flow; }
			blocks.push(this.el('h1', '', book.title));
			if (book.subtitle) blocks.push(this.el('p', 'subtitle', book.subtitle));
			if (book.author.trim()) blocks.push(this.el('p', 'author', book.author.trim()));
			return flow;
		}
		if (s.made && s.matter === 'contents') {
			blocks.push(this.heading([bookWord('contents', book.language) || book.title]));
			const list = (entries: ReturnType<typeof contentsOf>, under: boolean) => {
				for (const e of entries) {
					const p = this.el('p', `toc${under ? ' under' : ''}${e.under.length ? ' top' : ''}`);
					p.append(this.el('span', 't', e.label), ' ', this.el('span', 'n'));
					(p.lastChild as HTMLElement).dataset.to = e.s.id;
					blocks.push(p);
					list(e.under, true);
				}
			};
			// (what stands before the contents, the title page above all, isn't listed in them)
			const at = book.sections.indexOf(s);
			if (look.style) list(contentsOf(book, look.style).filter((e) => book.sections.indexOf(e.s) > at), false);
			return flow;
		}
		const lines = look.heading(s);
		if (lines.length) blocks.push(this.heading(lines));
		this.blocks(blocks, s.blocks, { depth: 0, quote: false, first: true, lead: look.lead && s.role === 'chapter', foot: false });
		return flow;
	}

	private heading(lines: readonly string[]): HTMLElement {
		const h = this.el('h1');
		// (the space between its lines is for whoever reads the page's text: each line is a block of its own)
		lines.forEach((l, i) => h.append(i ? ' ' : '', this.el('span', `hl hl${Math.min(i, 1)}`, l)));
		return h;
	}

	private inline(parent: HTMLElement, runs: readonly Inline[], foot: boolean): void {
		for (const r of runs) {
			if (r.kind === 'br') { parent.append(this.el('br')); continue; }
			if (r.kind === 'note') {
				const body = this.book.notes[r.note];
				if (!body) continue;
				// (a note can't carry a note to the foot of the page: its words are set in the note, in brackets)
				if (foot) { parent.append(' ['); body.forEach((b, i) => { if (b.kind === 'p' || b.kind === 'heading') { if (i) parent.append(' '); this.inline(parent, b.runs, true); } }); parent.append(']'); continue; }
				if (!this.shown.has(r.note)) { this.shown.set(r.note, ++this.count); this.makeNote(r.note, body); }
				const sup = this.el('sup', '', String(this.shown.get(r.note)));
				sup.dataset.note = String(r.note);
				parent.append(sup);
				continue;
			}
			let at: HTMLElement = parent;
			if (r.code) at = at.appendChild(this.el('code'));
			if (r.b) at = at.appendChild(this.el('strong'));
			if (r.i) at = at.appendChild(this.el('em'));
			if (r.s) at = at.appendChild(this.el('del'));
			at.append(this.text(r.text, !!r.code));
		}
	}

	private makeNote(n: number, body: readonly Block[]): void {
		const note = this.el('div', 'note'), inner: HTMLElement[] = [];
		note.dataset.note = String(n);
		this.blocks(inner, body, { depth: 0, quote: false, first: true, lead: false, foot: true });
		const label = this.el('span', 'n', String(this.shown.get(n)));
		let first = inner[0];
		if (!first || first.tagName !== 'P') { first = this.el('p', 'first'); inner.unshift(first); }
		first.prepend(label);
		note.append(...inner);
		this.notes.set(n, note);
	}

	/** Blocks, flat. `first`: the next paragraph follows a heading or a break (no indent). */
	private blocks(out: HTMLElement[], list: readonly Block[], x: { depth: number; quote: boolean; first: boolean; lead: boolean; foot: boolean }): void {
		const { look, book } = this, set = `${x.depth ? ` in${Math.min(3, x.depth)}` : ''}${x.quote ? ' q' : ''}`;
		const dir = (e: HTMLElement, runs: readonly Inline[]) => { if (against(plain(runs), book.language)) e.dir = 'auto'; };
		/** A group (a list, a quotation, a table) has half a line above and below it, when it isn't inside another. */
		const group = (make: () => void) => {
			const from = out.length;
			make();
			if (x.depth || out.length === from) return;
			out[from].classList.add('sp-a');
			out[out.length - 1].classList.add('sp-b');
		};
		for (const b of list) {
			if (b.kind === 'p') {
				const p = this.el('p', `${x.first ? 'first' : ''}${set}`.trim()), split = x.lead ? leadSplit(b.runs) : null;
				dir(p, b.runs);
				if (split) { p.append(this.el('span', 'lead', split[0])); this.inline(p, split[1], x.foot); } else this.inline(p, b.runs, x.foot);
				out.push(p);
			} else if (b.kind === 'break') out.push(this.el('p', 'break', look.mark));
			else if (b.kind === 'heading') { const h = this.el(`h${Math.min(4, Math.max(2, b.level))}` as 'h2', set.trim()); dir(h, b.runs); this.inline(h, b.runs, x.foot); out.push(h); }
			else if (b.kind === 'quote') group(() => {
				if (b.title) { const p = this.el('p', `first in${Math.min(3, x.depth + 1)} q`), strong = p.appendChild(this.el('strong')); this.inline(strong, b.title, x.foot); out.push(p); }
				this.blocks(out, b.blocks, { ...x, depth: x.depth + 1, quote: true, first: true, lead: false });
			});
			else if (b.kind === 'list') group(() => b.items.forEach((item, i) => {
				const from = out.length;
				this.blocks(out, item, { ...x, depth: x.depth + 1, first: true, lead: false });
				const p = out[from];
				if (!p || p.tagName !== 'P' || p.classList.contains('break')) return;
				p.classList.add('li');
				p.prepend(this.el('span', 'mk', b.ordered ? `${b.start + i}.` : '•'), ' ');
			}));
			else if (b.kind === 'table' && b.rows.length) group(() => {
				const t = this.el('table', set.trim()), body = t.appendChild(this.el('tbody'));
				b.rows.forEach((row, i) => { const tr = body.appendChild(this.el('tr')); row.forEach((cell, c) => this.inline(tr.appendChild(this.el(i ? 'td' : 'th', b.align[c] ?? '')), cell, x.foot)); });
				out.push(t);
			});
			else if (b.kind === 'code') group(() => { const pre = this.el('pre', set.trim()); pre.append(this.text(b.text, true)); out.push(pre); });
			else if (b.kind === 'image' && b.picture) group(() => {
				const p = this.el('p', `fig${set}`), img = p.appendChild(this.el('img'));
				img.src = look.picture(b.picture); img.alt = b.alt;
				[img.width, img.height] = look.fit(b.picture);
				out.push(p);
			});
			else continue;
			x = { ...x, first: b.kind === 'break' || b.kind === 'heading', lead: false };
		}
	}
}
