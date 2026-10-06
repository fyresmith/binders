import { el } from './el';
import type { Host, Mark, Opened } from './fill';
import type { BookFlow } from './flow';
import { SHY } from './hyphenate';

/* The paginator's pages, for real: the boxes it fills, measured where they will print. Each page is a fixed box
   (`.page`) holding the text block (`.block`: the text, and the notes at its foot); the lines in it are Chromium's.
   Everything the paginator asks (how much room is left, how many lines a paragraph has, where its footnote marks
   are, cut it at this line) is answered here from the layout, and nothing is decided. A page sits in a `.sheet`,
   which the window may show smaller than life: so every measure is taken through `scale()`. */

export interface PageBox { sheet: HTMLElement; page: HTMLElement; text: HTMLElement; notes: HTMLElement; opened: Opened }

export interface DomOptions {
	/** The text block's height, in CSS pixels. */
	block: number;
	/** A book that reads from right to left: its spine is on the other side. */
	rtl: boolean;
	/** How much smaller than life the pages are being shown (1: as they are). */
	scale(): number;
	/** The class a section's pages have. */
	cls(section: number): string;
	/** A section's name in the book: its pages say which they are. */
	id(section: number): string;
	/** Told of a page that holds more than it should (its number, from 1). */
	over?(page: number): void;
}

const isText = (b: HTMLElement) => (b.tagName === 'P' && !b.classList.contains('break') && !b.classList.contains('fig') && !b.classList.contains('toc')) || b.tagName === 'PRE' || b.classList.contains('note');
const rows = (b: HTMLElement) => Array.from((b as HTMLTableElement).rows);

export class DomHost implements Host<HTMLElement> {
	pages: PageBox[] = [];
	private at!: PageBox;
	private leads = new WeakMap<HTMLElement, number>();

	constructor(private doc: Document, private into: HTMLElement, private flow: BookFlow, private o: DomOptions) { }

	private make(cls: string): HTMLElement { return el(this.doc, 'div', cls); }
	private height(e: HTMLElement): number { return e.getBoundingClientRect().height / this.o.scale(); }

	open(opened: Opened, index: number): void {
		if (this.at) this.finish(this.at);
		const spine = (index % 2 === 0) !== this.o.rtl ? 'spine-left' : 'spine-right';
		const sheet = this.make('sheet'), page = this.make(`page ${spine} ${opened.kind}${opened.section >= 0 ? ` ${this.o.cls(opened.section)}` : ''}`);
		if (opened.section >= 0) page.dataset.section = this.o.id(opened.section);
		const block = this.make('block'), text = this.make('text'), notes = this.make('notes');
		block.append(text, notes);
		page.append(block);
		sheet.append(page);
		this.into.append(sheet);
		this.at = { sheet, page, text, notes, opened };
		this.pages.push(this.at);
	}

	room(): number { return this.o.block - this.height(this.at.text) - this.height(this.at.notes) + 0.5; }
	put(b: HTMLElement): void { this.at.text.append(b); }
	pull(b: HTMLElement): void { b.remove(); }
	putNote(n: HTMLElement): void { this.at.notes.append(n); this.at.notes.classList.add('has'); }
	pullNote(n: HTMLElement): void { n.remove(); this.at.notes.classList.toggle('has', this.at.notes.childElementCount > 0); }

	lead(b: HTMLElement): number {
		let l = this.leads.get(b);
		if (l === undefined) { l = parseFloat(getComputedStyle(b).lineHeight) || 16; this.leads.set(b, l); }
		return l;
	}
	lines(b: HTMLElement): number {
		if (b.tagName === 'TABLE') return rows(b).length;
		return isText(b) ? Math.round(this.height(b) / this.lead(b)) : 0;
	}
	most(b: HTMLElement): number {
		const room = this.room();
		if (b.tagName !== 'TABLE') return Math.max(0, Math.min(this.lines(b), this.lines(b) + Math.floor(room / this.lead(b))));
		const foot = b.getBoundingClientRect().bottom, s = this.o.scale();
		return rows(b).filter((r) => (foot - r.getBoundingClientRect().bottom) / s + room >= 0).length;
	}
	spare(b: HTMLElement, k: number): number {
		if (b.tagName !== 'TABLE') return this.room() + (this.lines(b) - k) * this.lead(b);
		const row = rows(b)[k - 1];
		return this.room() + (row ? (b.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom) / this.o.scale() : this.height(b));
	}
	marks(b: HTMLElement): Mark[] {
		const sups = b.querySelectorAll<HTMLElement>('sup[data-note]');
		if (!sups.length) return [];
		const top = b.getBoundingClientRect().top, lead = this.lead(b) * this.o.scale(), table = b.tagName === 'TABLE' ? rows(b) : null;
		return Array.from(sups, (sup) => {
			const r = sup.getBoundingClientRect(), row = table ? table.findIndex((tr) => tr.contains(sup)) : -1;
			return { note: Number(sup.dataset.note), line: table ? Math.max(0, row) : Math.max(0, Math.floor(((r.top + r.bottom) / 2 - top) / lead)) };
		}).sort((a, z) => a.line - z.line);
	}
	note(n: number): HTMLElement | null { return this.flow.note(n); }
	keeps(b: HTMLElement): boolean { return /^H\d$/.test(b.tagName) || b.classList.contains('break'); }
	least(b: HTMLElement): readonly [number, number] { return b.tagName === 'TABLE' ? [2, 1] : b.tagName === 'PRE' ? [1, 1] : [2, 2]; }

	cut(b: HTMLElement, k: number): HTMLElement {
		const rest = b.cloneNode(false) as HTMLElement;
		rest.removeAttribute('id');
		if (b.tagName === 'TABLE') {
			const body = rest.appendChild(el(this.doc, 'tbody'));
			body.append(...rows(b).slice(k));
			return rest;
		}
		const lead = this.lead(b) * this.o.scale(), top = b.getBoundingClientRect().top + k * lead;
		const nodes: [Text, number][] = [];
		let total = 0;
		const walk = this.doc.createTreeWalker(b, NodeFilter.SHOW_TEXT);
		for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) { nodes.push([n, total]); total += n.data.length; }
		if (!total) return rest;
		const at = (offset: number): [Text, number] => { let lo = 0, hi = nodes.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (nodes[mid][1] <= offset) lo = mid; else hi = mid - 1; } return [nodes[lo][0], offset - nodes[lo][1]]; };
		const range = this.doc.createRange();
		// (a soft hyphen or a space the line swallowed has no box: it is where the next character that has one is)
		const middle = (offset: number): number => {
			for (let x = offset; x < total; x++) {
				const [n, o] = at(x);
				if (o >= n.data.length) continue;
				range.setStart(n, o); range.setEnd(n, o + 1);
				const rects = range.getClientRects();
				if (rects.length && rects[0].width > 0) { const r = rects[rects.length - 1]; return (r.top + r.bottom) / 2; }
			}
			return Infinity;
		};
		let lo = 0, hi = total - 1; // the first character on line k or below
		while (lo < hi) { const mid = (lo + hi) >> 1; if (middle(mid) >= top) hi = mid; else lo = mid + 1; }
		const [n, o] = at(lo);
		range.setStart(n, o);
		if (b.lastChild) range.setEndAfter(b.lastChild);
		rest.append(range.extractContents());
		// the paragraph that was cut goes on without an indent, and what is left of it here ends flush
		const part = rest.matches('p, pre') ? rest : rest.querySelector<HTMLElement>('p, pre') ?? rest;
		part.classList.add('cont');
		part.classList.remove('first');
		rest.classList.remove('first', 'sp-a');
		let last: Text | null = null;
		const again = this.doc.createTreeWalker(b, NodeFilter.SHOW_TEXT);
		for (let t = again.nextNode() as Text | null; t; t = again.nextNode() as Text | null) if (t.data.length) last = t;
		(last?.parentElement?.closest<HTMLElement>('p, pre') ?? b).classList.add('cut');
		b.classList.remove('sp-b');
		// a line that ended at a soft hyphen showed a hyphen: it is the paragraph's last character now, so it is written
		if (last && last.data.endsWith(SHY)) last.data = `${last.data.slice(0, -1)}-`;
		for (const e of Array.from(b.querySelectorAll('p, pre'))) if (!e.textContent && !e.childElementCount) e.remove();
		return rest;
	}

	/** A page that is full: the soft hyphens no line broke at are taken out again, and the ones a line did break at
	    become hyphens, so the text a reader selects, searches or has read aloud is the words. */
	finish(p: PageBox): void {
		if (p.page.dataset.done) return;
		if (this.o.block - this.height(p.text) - this.height(p.notes) + 0.5 < 0) this.o.over?.(this.pages.indexOf(p) + 1);
		const walk = this.doc.createTreeWalker(p.page, NodeFilter.SHOW_TEXT), texts: Text[] = [], range = this.doc.createRange();
		for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) if (n.data.includes(SHY)) texts.push(n);
		const changes: [Text, string][] = [];
		for (const n of texts) {
			let out = '', from = 0;
			for (let i = n.data.indexOf(SHY); i >= 0; i = n.data.indexOf(SHY, i + 1)) {
				range.setStart(n, i); range.setEnd(n, i + 1);
				const r = range.getClientRects();
				out += n.data.slice(from, i) + (r.length && r[0].width > 0.01 ? '-' : '');
				from = i + 1;
			}
			changes.push([n, out + n.data.slice(from)]);
		}
		for (const [n, data] of changes) n.data = data;
		// (only now: a finished page out of sight is no longer laid out, and nothing could be measured in it)
		p.page.dataset.done = '1';
	}

	/** The last page is full too. */
	end(): void { if (this.at) this.finish(this.at); }
}

/** A page's text as a reader has it: its blocks a line each, the words in order. */
export function pageText(p: PageBox): string {
	const out: string[] = [];
	const add = (root: HTMLElement) => { for (const e of Array.from(root.children) as HTMLElement[]) out.push(e.tagName === 'TABLE' ? Array.from(e.querySelectorAll('th, td'), (c) => c.textContent ?? '').join(' ') : e.textContent ?? ''); };
	add(p.text); add(p.notes);
	return out.join('\n');
}
