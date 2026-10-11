import type { TAbstractFile } from 'obsidian';
import type { FindState, Found } from './find-bar';

/* Find and replace on the boards (the corkboard and the outliner): the cards and rows whose notes have a match are lit,
   the rest step back. The find bar (find-bar.ts) says what was found; this marks it on what the mode has drawn. The
   manuscript marks its own text (manuscript.ts), and the view tells this which mode it is in. */

/** What the marks need of the view. */
export interface BoardFindHost {
	/** The element the mode draws in (it changes when the view is built again), or null before there is one. */
	body(): HTMLElement | null;
	/** Whether the mode is the manuscript, which marks its own text. */
	manuscript(): boolean;
}

export class BoardFind {
	/** What the find bar last found, or null with no bar open. */
	state: FindState | null = null;
	private watcher: MutationObserver | null = null;
	private raf = 0;
	private scroller: HTMLElement | null = null;

	constructor(private host: BoardFindHost) {}

	/** What scrolls on the boards (the corkboard's page, the outliner's). */
	root(): HTMLElement | null { return this.host.body()?.querySelector<HTMLElement>(':scope > .binders-outliner, :scope > .binders-corkboard') ?? null; }

	/** The bar is closed: nothing is looked for, and the page's scrolling is no longer watched. */
	stop(): void { this.state = null; this.track(false); }

	/** The rows in sight are marked again as the page scrolls (only those: a row far off is marked as it comes near). */
	track(on: boolean): void {
		const root = on ? this.root() : null;
		if (root === this.scroller) return;
		this.scroller?.removeEventListener('scroll', this.onScroll);
		this.scroller = root;
		root?.addEventListener('scroll', this.onScroll, { passive: true });
	}

	private onScroll = (): void => {
		if (this.raf || !this.state) return;
		const body = this.host.body();
		if (body) this.raf = body.win.requestAnimationFrame(() => { this.raf = 0; this.mark(); });
	};

	/** The boards draw their cards again as the binder changes: what's marked is marked again after. Called each time the
	    view is built, with a new body. */
	watch(): void {
		this.watcher?.disconnect();
		const body = this.host.body();
		if (!body) return;
		this.watcher = new MutationObserver(() => {
			if (!this.state || this.host.manuscript() || this.raf) return;
			this.raf = body.win.requestAnimationFrame(() => { this.raf = 0; this.mark(); });
		});
		this.watcher.observe(body, { childList: true, subtree: true });
	}

	/** The boards and the outliner: a card or row whose note has a match stays as it is, with the line the first match
	    is in where its synopsis was; the rest step back. A folder's card or row stands for what is in it (and its card
	    marks which of the notes it lists have a match). Only what is in sight, and a screen either side of it, is
	    marked: five thousand rows are not worth drawing at once. */
	mark(): void {
		const body = this.host.body(), st = this.state, on = !!st && !this.host.manuscript() && !!st.query;
		if (!body) return;
		if (!on) {
			for (const el of Array.from(body.querySelectorAll<HTMLElement>('.is-find-hit, .is-find-miss, .has-find-excerpt'))) { el.removeClasses(['is-find-hit', 'is-find-miss', 'has-find-excerpt']); el.querySelector('.binders-find-flair')?.remove(); el.querySelector('.binders-find-excerpt')?.remove(); }
			body.removeClass('is-finding');
			return;
		}
		// how many matches in each note, and in each folder above it
		const by = new Map<string, Found>(), totals = new Map<string, number>();
		for (const f of st.found) {
			const file = f.source.file;
			if (!file) continue;
			by.set(file.path, f);
			for (let t: TAbstractFile | null = file; t; t = t.parent) totals.set(t.path, (totals.get(t.path) ?? 0) + f.hits.length);
		}
		const band = (this.root() ?? body).getBoundingClientRect();
		const all = Array.from(body.querySelectorAll<HTMLElement>('.binders-card[data-path], .binders-outliner-row[data-path]'));
		// (the ones in sight, found by halving: cards and rows lie in the order they are read, so asking each one where it is
		// would make the page lay itself out again after every one marked)
		const lo = band.top - band.height, hi = band.bottom + band.height;
		const first = (test: (el: HTMLElement) => boolean): number => { let a = 0, z = all.length; while (a < z) { const m = (a + z) >> 1; if (test(all[m])) z = m; else a = m + 1; } return a; };
		const from = first((el) => el.getBoundingClientRect().bottom >= lo), to = first((el) => el.getBoundingClientRect().top > hi);
		for (const el of all.slice(from, to)) {
			const path = el.dataset.path ?? '', c = totals.get(path) ?? 0;
			el.toggleClass('is-find-hit', c > 0);
			el.toggleClass('is-find-miss', c === 0);
			// a row says how many at its end, as a tree's row does (a card says nothing about itself that isn't the writer's)
			const title = el.hasClass('binders-outliner-row') ? el.querySelector<HTMLElement>('.binders-outliner-cell') : null;
			let flair = el.querySelector<HTMLElement>('.binders-find-flair');
			if (c > 0 && title) {
				flair ??= title.createSpan({ cls: 'binders-find-flair' });
				if (flair.textContent !== c.toLocaleString()) flair.setText(c.toLocaleString());
			} else flair?.remove();
			// a folder's card lists some of its notes by name: the ones with a match say so
			for (const item of Array.from(el.querySelectorAll<HTMLElement>('.binders-card-held-item[data-path]'))) {
				const n = totals.get(item.dataset.path ?? '') ?? 0;
				item.toggleClass('is-find-hit', n > 0);
				item.toggleClass('is-find-miss', n === 0);
			}
			// a note's card or row shows the line the first match is in, where its synopsis is: why it is lit
			const own = by.get(path), syn = el.querySelector<HTMLElement>('.binders-card-synopsis, .binders-outliner-synopsis');
			let ex = el.querySelector<HTMLElement>('.binders-find-excerpt');
			if (own && syn) {
				const h = own.hits[0], t = own.text, key = `${st.query}\n${h.from}\n${t.length}`;
				if (ex?.dataset.key !== key) {
					ex?.remove();
					ex = createDiv({ cls: 'binders-find-excerpt', attr: { 'data-key': key } });
					const line = t.lastIndexOf('\n', h.from - 1) + 1, nl = t.indexOf('\n', h.to), end = Math.min(nl < 0 ? t.length : nl, h.to + 200);
					// (a row has one line for it: it starts at the match, so that's in sight at any width)
					let from = Math.max(line, h.from - (el.hasClass('binders-outliner-row') ? 0 : 48));
					if (from > line) { const sp = t.indexOf(' ', from); if (sp >= 0 && sp < h.from) from = sp + 1; ex.appendText('… '); }
					ex.appendText(t.slice(from, h.from));
					ex.createSpan({ cls: 'search-result-file-matched-text', text: t.slice(h.from, h.to) });
					ex.appendText(t.slice(h.to, end));
					syn.after(ex);
				}
				el.addClass('has-find-excerpt');
			} else { ex?.remove(); el.removeClass('has-find-excerpt'); }
		}
		body.addClass('is-finding');
	}
}
