import { el } from './el';
import type { Host, Mark, Opened } from './fill';
import type { BookFlow } from './flow';
import { SHY } from './hyphenate';

/* The paginator's pages, for real: the boxes it fills, measured where they will print. Each page is a fixed box
   (`.page`) holding the text block (`.block`: the text, and the notes at its foot); the lines in it are Chromium's.
   Everything the paginator asks (how much room is left, how many lines a paragraph has, where its footnote marks
   are, cut it at this line) is answered here from the layout, and nothing is decided. A page sits in a `.sheet`,
   which the window may show smaller than life: so every measure is taken through `scale()`.

   When a page is full its lines are made fast (`finish`): the soft hyphens come out, and each line's end is written
   down as a break. From then on no line of it can be broken anywhere else, by a printer that measures a hair
   differently or by letters that sit closer once the soft hyphen between them is gone. */

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
/** The box a character is drawn in, of those a range gives for it: a soft hyphen a line broke at has an empty one and
    then its hyphen's; one no line broke at, and a space a line's end swallowed, have none that is wide. */
const wide = (rects: DOMRectList): DOMRect | null => { for (let i = rects.length - 1; i >= 0; i--) if (rects[i].width > 0.01) return rects[i]; return null; };
const rows = (b: HTMLElement) => Array.from((b as HTMLTableElement).rows);

/** A block's text read as one run of characters, each of which can be asked where it stands. */
class Run {
	nodes: [Text, number][] = [];
	all = '';
	private range: Range;
	constructor(doc: Document, b: HTMLElement) {
		const walk = doc.createTreeWalker(b, NodeFilter.SHOW_TEXT);
		for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) { this.nodes.push([n, this.all.length]); this.all += n.data; }
		this.range = doc.createRange();
	}
	/** The text node a character is in, and its place there. */
	at(offset: number): [Text, number] {
		let lo = 0, hi = this.nodes.length - 1;
		while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.nodes[mid][1] <= offset) lo = mid; else hi = mid - 1; }
		return [this.nodes[lo][0], offset - this.nodes[lo][1]];
	}
	private box(offset: number): DOMRect | null {
		const [n, o] = this.at(offset);
		if (o >= n.data.length) return null;
		this.range.setStart(n, o); this.range.setEnd(n, o + 1);
		return wide(this.range.getClientRects());
	}
	/** How far down the middle of a character's line is: the character's own, or (for one with no box: a soft
	    hyphen, a space a line swallowed) the next that has one. */
	middle(offset: number): number {
		for (let x = offset; x < this.all.length; x++) { const r = this.box(x); if (r) return (r.top + r.bottom) / 2; }
		return Infinity;
	}
	/** The same for the last character that has a box. */
	last(): number {
		for (let x = this.all.length - 1; x >= 0; x--) { const r = this.box(x); if (r) return (r.top + r.bottom) / 2; }
		return -Infinity;
	}
	/** The first character whose line's middle is at `y` or under it. */
	firstAt(y: number, from = 0): number {
		let lo = from, hi = this.all.length - 1;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (this.middle(mid) >= y) hi = mid; else lo = mid + 1; }
		return lo;
	}
}

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
		const run = new Run(this.doc, b);
		if (!run.all.length) return rest;
		const [n, o] = run.at(run.firstAt(b.getBoundingClientRect().top + k * this.lead(b) * this.o.scale()));
		const range = this.doc.createRange();
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

	/** A page that is full has its lines made fast. In every block that was given soft hyphens: the ones no line
	    broke at are taken out and the ones a line did break at become hyphens, so the text a reader selects, searches
	    or has read aloud is the words; and each line's end becomes a break, so the lines stay the lines that were
	    measured (two letters sit a little closer once no soft hyphen is between them). */
	finish(p: PageBox): void {
		if (p.page.dataset.done) return;
		if (this.o.block - this.height(p.text) - this.height(p.notes) + 0.5 < 0) this.o.over?.(this.pages.indexOf(p) + 1);
		const walk = this.doc.createTreeWalker(p.page, NodeFilter.SHOW_TEXT), blocks = new Set<HTMLElement>();
		for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
			if (!n.data.includes(SHY)) continue;
			const b = n.parentElement?.closest<HTMLElement>('p, pre, h1, h2, h3, h4, td, th');
			if (b) blocks.add(b);
		}
		// everything is read before anything is written: a change would have the page laid out again for each block
		const writes = Array.from(blocks, (b) => this.fasten(b));
		for (const write of writes) write();
		// (only now: a finished page out of sight is no longer laid out, and nothing could be measured in it)
		p.page.dataset.done = '1';
	}

	/** Reads where a block's lines end, and returns what writes that down. */
	private fasten(b: HTMLElement): () => void {
		const run = new Run(this.doc, b), all = run.all, starts = new Set<number>();
		const cell = b.tagName === 'TD' || b.tagName === 'TH', lead = this.lead(b) * this.o.scale();
		// (a table's cell keeps its own lines: its width is the table's to give)
		const first = cell ? Infinity : run.middle(0), lines = Number.isFinite(first) ? Math.round((run.last() - first) / lead) + 1 : 1;
		const justified = !cell && getComputedStyle(b).textAlign === 'justify';
		let from = 0;
		for (let j = 1; j < lines; j++) { from = run.firstAt(first - lead / 2 + j * lead, from); starts.add(from); }
		/** True for a soft hyphen a line broke at: the next character that isn't one begins a line. */
		const used = (i: number): boolean => { let x = i + 1; while (all[x] === SHY) x++; return starts.has(x); };
		return () => {
			for (let k = run.nodes.length - 1; k >= 0; k--) {
				const [node, g] = run.nodes[k], data = node.data, pieces: string[] = [];
				let cur = '';
				for (let i = 0; i < data.length; i++) {
					if (starts.has(g + i) && g + i > 0) { pieces.push(cur); cur = ''; }
					cur += data[i] !== SHY ? data[i] : used(g + i) ? '-' : '';
				}
				node.data = pieces.length ? pieces[0] : cur;
				let after: ChildNode = node;
				for (const piece of pieces.length ? [...pieces.slice(1), cur] : []) {
					const br = el(this.doc, 'br'), text = this.doc.createTextNode(piece);
					after.after(br, text);
					after = text;
				}
			}
			if (cell) return;
			b.classList.add('pin');
			if (!justified) return;
			// every line but the last is set to the full measure, as it was; the last ends where its words end
			b.classList.add('just');
			if (!b.classList.contains('cut')) b.append(el(this.doc, 'span', 'fill'));
		};
	}

	/** The last page is full too. */
	end(): void { if (this.at) this.finish(this.at); }
}

/** A page's text as a reader has it: its blocks a line each, a line break a new line, the words in order. */
export function pageText(p: PageBox): string {
	const out: string[] = [];
	const text = (e: Element): string => Array.from(e.childNodes, (n) => (n.nodeType === 3 ? (n as Text).data : n.nodeName === 'BR' ? '\n' : n.nodeType === 1 ? text(n as Element) : '')).join('');
	const add = (root: HTMLElement) => { for (const e of Array.from(root.children)) out.push(e.tagName === 'TABLE' ? Array.from(e.querySelectorAll('th, td'), text).join(' ') : text(e)); };
	add(p.text); add(p.notes);
	return out.join('\n');
}
