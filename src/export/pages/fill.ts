/* The paginator: pages are Binders', lines are Chromium's. Fixed page boxes are filled a block at a time; a block
   that doesn't fit is cut at a line (never leaving too few lines at the foot of one page or the head of the next),
   a footnote goes to the foot of the page its mark is on (and one too long for its page flows on to the next), a
   heading or a scene break is never the last thing on a page, and a section opens on a right-hand page when the
   style says so, with a blank page before it if need be.

   What is here is the deciding, and it is pure: everything that needs a measure is asked of a `Host`, which is the
   real pages in pages/dom.ts and a few numbers in the unit tests. The design is docs/dev/export.md. */

export type PageKind = 'blank' | 'display' | 'opener' | 'body';
/** A page as it was opened: what it is, and the section it belongs to (-1 for a blank page). */
export interface Opened { kind: PageKind; section: number }

/** A piece of the book that begins a page: its blocks, the kind of its first page and of those after it, and
    whether it must begin on a right-hand page. */
export interface Flow<B> { blocks: B[]; first: PageKind; rest: PageKind; recto: boolean }

/** A footnote's mark in a block: which note, and the line of the block it is in (from 0). */
export interface Mark { note: number; line: number }

export interface Host<B> {
	/** A new page: the one filled from now on. */
	open(page: Opened, index: number): void;
	/** The room left on the page; under zero when it is over-full. */
	room(): number;
	put(b: B): void;
	pull(b: B): void;
	putNote(n: B): void;
	pullNote(n: B): void;
	/** How many lines (a table: rows) a block on the page has; 0 for one that can't be cut. */
	lines(b: B): number;
	/** The height of a line of it. */
	lead(b: B): number;
	/** How many of the lines of the last block on the page fit, the page's notes being what they are now. */
	most(b: B): number;
	/** The room left if the last block ended after its line `k`. */
	spare(b: B, k: number): number;
	/** The footnotes marked in a block on the page, in order. */
	marks(b: B): Mark[];
	/** Cuts a block or a note on the page before its line `k`, and returns the rest, which is on no page. */
	cut(b: B, k: number): B;
	/** A footnote's block; null when the book has none by that number. */
	note(n: number): B | null;
	/** True for what is kept with what follows it: a heading, a scene break. */
	keeps(b: B): boolean;
	/** The fewest lines to leave at the foot of a page, and to carry to the head of the next. */
	least(b: B): readonly [foot: number, head: number];
}

/** Fills pages with the book. It hands back the pages opened so far each time one is opened, so that a long book
    can be laid out a little at a time; the pages are its result. */
export function* fill<B>(host: Host<B>, flows: readonly Flow<B>[]): Generator<number, Opened[]> {
	const pages: Opened[] = [];
	/** What is on the page being filled, and the notes each block brought with it. */
	let here: B[] = [];
	const noted = new Map<B, number[]>(), placed = new Set<number>();
	/** The ends of footnotes too long for their page: first on the next. */
	let carry: B[] = [];
	/** True when the page being filled began with such an end. */
	let carried = false;

	const open = (kind: PageKind, section: number) => {
		host.open({ kind, section }, pages.length);
		pages.push({ kind, section });
		here = [];
		const waiting = carry;
		carried = waiting.length > 0;
		carry = [];
		for (let i = 0; i < waiting.length; i++) {
			const n = waiting[i];
			host.putNote(n);
			const room = host.room(), lines = host.lines(n);
			if (room >= 0 || !lines) continue;
			// what doesn't fit goes on to the page after; at least a line stays, or nothing would ever move
			const fit = Math.max(i === 0 ? 1 : 0, lines + Math.floor(room / host.lead(n)));
			if (fit >= lines) continue;
			if (fit <= 0) host.pullNote(n); else carry.push(host.cut(n, fit));
			if (fit <= 0) carry.push(n);
			carry.push(...waiting.slice(i + 1));
			break;
		}
	};
	/** The notes of the block's marks in its first `k` lines are on the page, and no other of its notes. */
	const setNotes = (b: B, marks: readonly Mark[], k: number) => {
		const had = noted.get(b) ?? [], want: number[] = [];
		for (const m of marks) if (m.line < k && !want.includes(m.note) && (had.includes(m.note) || !placed.has(m.note)) && host.note(m.note)) want.push(m.note);
		for (const n of had) if (!want.includes(n)) { const el = host.note(n); if (el) host.pullNote(el); placed.delete(n); }
		for (const n of want) if (!had.includes(n)) { const el = host.note(n); if (el) host.putNote(el); placed.add(n); }
		noted.set(b, want);
	};
	const unplace = (b: B) => { setNotes(b, [], 0); host.pull(b); noted.delete(b); };

	for (let s = 0; s < flows.length; s++) {
		const flow = flows[s];
		if (flow.recto && pages.length % 2 === 1) { open('blank', -1); yield pages.length; }
		open(flow.first, s);
		yield pages.length;
		const queue = [...flow.blocks];
		while (queue.length) {
			const b = queue.shift();
			host.put(b);
			here.push(b);
			const marks = host.marks(b);
			setNotes(b, marks, Infinity);
			if (host.room() >= 0) continue;

			// It doesn't fit whole. How many of its lines do, with the notes those lines call?
			const lines = host.lines(b), [foot, head] = host.least(b);
			let k = 0;
			if (lines) {
				setNotes(b, marks, 0);
				const cap = (n: number) => (n < lines && n > lines - head ? lines - head : Math.min(n, lines));
				k = cap(host.most(b));
				for (;;) {
					const within = marks.filter((m) => m.line < k);
					setNotes(b, marks, k);
					const fit = cap(host.most(b));
					if (fit >= k) break;
					const last = within.length ? within[within.length - 1].line : -1;
					if (fit > last) { k = fit; break; }
					k = cap(last);
				}
				// the next mark's line may still stay, if its note can begin here and end on the next page
				const next = marks.find((m) => m.line >= k && !placed.has(m.note)), to = next ? next.line + 1 : 0, el = next ? host.note(next.note) : null;
				const only = marks.filter((m) => m.line >= k && m.line < to && !placed.has(m.note)).length === 1;
				if (next && el && only && to >= foot && cap(to) === to && host.spare(b, to) > 0) {
					host.putNote(el);
					const all = host.lines(el), fit = all + Math.floor(host.spare(b, to) / host.lead(el));
					if (all && fit >= 2 && all - fit >= 2) {
						carry.push(host.cut(el, fit));
						placed.add(next.note);
						noted.set(b, [...(noted.get(b) ?? []), next.note]);
						k = to;
					} else host.pullNote(el);
				}
				if (k < foot) k = 0;
			}
			if (lines && k >= lines) continue;
			// alone on an empty page, it can't be sent to the next: it is cut where it must be, or left as it is
			if (k === 0 && here.length === 1 && !carried) {
				if (!lines) { setNotes(b, marks, Infinity); continue; }
				setNotes(b, marks, 0);
				k = Math.max(1, host.most(b));
				setNotes(b, marks, k);
				if (k >= lines) continue;
			}
			if (k > 0) queue.unshift(host.cut(b, k));
			else {
				const back = [b];
				here.pop();
				unplace(b);
				while (here.length > 1 && host.keeps(here[here.length - 1])) { const prev = here.pop(); unplace(prev); back.unshift(prev); }
				queue.unshift(...back);
			}
			open(flow.rest, s);
			yield pages.length;
		}
		while (carry.length) { open(flow.rest, s); yield pages.length; }
	}
	return pages;
}
