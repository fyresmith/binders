import { headingLines, roundedWords } from '../export/docx';
import type { ManuscriptStyle } from '../export/docx-parts';
import { contentsOf } from '../export/epub';
import { leadSplit } from '../export/epub-text';
import { plain, type Block, type Book, type Inline, type OutlineRow, type Section } from '../export/model';
import { against, bookHeading, bookWord, isRtl, type BookStyle } from '../export/style';

/* What the Export window shows of a manuscript before it is made: its text as it will read, set as the style sets
   it (the typeface, the spacing, the headings, the breaks, the notes), on paper that is white in both themes. It is
   one continuous sheet, not pages: Word sets its own lines and turns its own pages, and the pages Binders lays out
   itself come with the PDF. And "Contents": every item of the binder with the role it was given. Drawn from the same
   book model the Word writer reads, with `createEl` only. */

const ROLE: Record<string, string> = { part: 'Part', chapter: 'Chapter', scene: 'Scene', front: 'Front matter', back: 'Back matter', out: 'Left out', group: '' };
/** A role as "Contents" says it. */
export const roleName = (r: OutlineRow): string => `${ROLE[r.role] ?? ''}${r.number != null ? ` ${r.number}` : ''}`;

/** "Contents": the binder's items, each with its role; one that is left out is faint. A row opens its note. */
export function drawOutline(el: HTMLElement, book: Book, open: (path: string) => void): void {
	el.empty();
	el.setAttrs({ role: 'list', 'aria-label': 'Contents' });
	if (!book.outline.length) el.createDiv({ cls: 'binders-export-none', text: 'Nothing here is exported.' });
	for (const r of book.outline) {
		const role = roleName(r);
		const row = el.createDiv({ cls: 'tree-item nav-file', attr: { role: 'listitem' } });
		const self = row.createDiv({ cls: 'tree-item-self nav-file-title binders-export-row', attr: { 'aria-label': role ? `${r.name}, ${role.toLowerCase()}` : r.name } });
		self.setCssProps({ '--binders-export-depth': String(r.depth) });
		self.toggleClass('binders-export-out', r.role === 'out');
		self.createDiv({ cls: 'tree-item-inner nav-file-title-content', text: r.name });
		if (role) self.createDiv({ cls: 'nav-file-tag', text: role });
		if (!r.folder) {
			self.addClass('is-clickable');
			self.setAttrs({ tabindex: '0', role: 'button' });
			self.addEventListener('click', () => open(r.path));
			self.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.path); } });
		}
	}
}

/** Draws a manuscript's text into `el`, a section at a time so a long book doesn't hold the window up. Returns what
    stops it (the window closed, or another preview took its place). */
export function drawManuscript(el: HTMLElement, book: Book, style: ManuscriptStyle, details: { contact: string[]; words: number }): () => void {
	el.empty();
	const paper = el.createDiv({ cls: 'binders-export-paper', attr: { lang: book.language } });
	paper.toggleClass('mod-courier', style.typeface === 'Courier New');
	paper.dataset.spacing = style.lineSpacing === 'double' ? '2' : style.lineSpacing === 'single' ? '1' : '1.5';
	paper.toggleClass('mod-underline', style.italics === 'underlined');
	paper.toggleClass('mod-top', style.chapterStarts === 'at the top');
	const urls: string[] = [];

	const inline = (parent: HTMLElement, runs: readonly Inline[], notes: number[]) => {
		for (const r of runs) {
			if (r.kind === 'br') { parent.createEl('br'); continue; }
			if (r.kind === 'note') { if (!notes.includes(r.note)) notes.push(r.note); parent.createEl('sup', { text: String(r.note + 1) }); continue; }
			let at: HTMLElement = parent;
			if (r.code) at = at.createEl('code');
			if (r.b) at = at.createEl('strong');
			if (r.i) at = at.createEl('em');
			if (r.s) at = at.createEl('del');
			at.appendText(r.text);
		}
	};
	const blocks = (parent: HTMLElement, list: readonly Block[], notes: number[]) => {
		for (const b of list) {
			if (b.kind === 'p') inline(parent.createEl('p'), b.runs, notes);
			else if (b.kind === 'break') parent.createEl('p', { cls: 'binders-export-break', text: style.sceneBreak });
			else if (b.kind === 'heading') inline(parent.createEl('h3', { cls: `binders-export-sub mod-${Math.min(4, Math.max(2, b.level))}` }), b.runs, notes);
			else if (b.kind === 'code') parent.createEl('pre', { text: b.text });
			else if (b.kind === 'quote') { const q = parent.createEl('blockquote'); if (b.title) inline(q.createEl('p').createEl('strong'), b.title, notes); blocks(q, b.blocks, notes); }
			else if (b.kind === 'list') { const l = parent.createEl(b.ordered ? 'ol' : 'ul'); if (b.ordered) l.setAttr('start', String(b.start)); for (const item of b.items) blocks(l.createEl('li'), item, notes); }
			else if (b.kind === 'table') { const t = parent.createEl('table'); b.rows.forEach((row, i) => { const tr = t.createEl('tr'); for (const cell of row) inline(tr.createEl(i ? 'td' : 'th'), cell, notes); }); }
			else if (b.kind === 'image' && b.picture) {
				const url = URL.createObjectURL(new Blob([b.picture.data.slice().buffer], { type: `image/${b.picture.type}` }));
				urls.push(url);
				parent.createEl('img', { cls: 'binders-export-picture', attr: { src: url, alt: b.alt } });
			}
		}
	};
	const section = (s: Section) => {
		const sec = paper.createEl('section', { cls: `binders-export-section mod-${s.role}` });
		const h = sec.createEl('h2', { cls: 'binders-export-heading' });
		headingLines(s).forEach((line, i) => { if (i) h.createEl('br'); h.appendText(line); });
		const notes: number[] = [];
		blocks(sec, s.blocks, notes);
		if (notes.length) {
			// (Word sets each note at the foot of its page: here they follow their chapter)
			const foot = sec.createDiv({ cls: 'binders-export-notes' });
			for (const n of notes) {
				const row = foot.createDiv({ cls: 'binders-export-footnote' }), body = book.notes[n] ?? [];
				blocks(row, body, []);
				(row.querySelector('p') ?? row).prepend(createEl('sup', { text: String(n + 1) }), ' ');
			}
		}
	};

	if (style.titlePage) {
		const page = paper.createEl('section', { cls: 'binders-export-section binders-export-titlepage' });
		const top = page.createDiv({ cls: 'binders-export-contact' }), who = top.createDiv();
		for (const line of [book.author, ...details.contact].filter((l) => l.trim())) who.createDiv({ text: line });
		top.createDiv({ text: `about ${roundedWords(details.words).toLocaleString('en-US')} words` });
		page.createEl('h1', { cls: 'binders-export-title', text: book.title });
		if (book.author.trim()) page.createEl('p', { cls: 'binders-export-by', text: `by ${book.author.trim()}` });
	}
	if (!book.sections.length) paper.createEl('p', { cls: 'binders-export-none', text: 'Nothing here is exported: the binder has no notes, or they are all left out.' });

	// the first sections at once, the rest a few at a time
	let at = 0, timer = 0, stopped = false;
	const more = () => {
		const until = Date.now() + 12;
		while (at < book.sections.length && (at < 3 || Date.now() < until)) section(book.sections[at++]);
		if (at < book.sections.length && !stopped) timer = window.setTimeout(more, 0);
	};
	more();
	return () => { stopped = true; window.clearTimeout(timer); for (const u of urls) URL.revokeObjectURL(u); };
}

/** Draws an ebook's text into `el`: one column on paper, in the shape the style gives it (how a chapter opens, the
    first words, the breaks, the indents), with the pages Binders makes. Not pages, and not the typeface: a reader
    chooses those. The same sections, headings and marks the EPUB writer sets, from the same model. Returns what
    stops it. */
export function drawEbook(el: HTMLElement, book: Book, style: BookStyle): () => void {
	el.empty();
	const paper = el.createDiv({ cls: 'binders-export-paper mod-ebook', attr: { lang: book.language, dir: isRtl(book.language) ? 'rtl' : 'ltr' } });
	paper.dataset.lettering = style['heading-lettering'];
	paper.dataset.heading = style['heading-alignment'];
	paper.dataset.paragraphs = style.paragraphs;
	paper.dataset.firstWords = style['first-words'];
	const urls: string[] = [];

	const inline = (parent: HTMLElement, runs: readonly Inline[], notes: number[]) => {
		for (const r of runs) {
			if (r.kind === 'br') { parent.createEl('br'); continue; }
			if (r.kind === 'note') { if (!notes.includes(r.note)) notes.push(r.note); parent.createEl('sup', { text: String(notes.indexOf(r.note) + 1) }); continue; }
			let at: HTMLElement = parent;
			if (r.href || r.at) at = at.createSpan({ cls: 'binders-export-link' });
			if (r.code) at = at.createEl('code');
			if (r.b) at = at.createEl('strong');
			if (r.i) at = at.createEl('em');
			if (r.s) at = at.createEl('del');
			at.appendText(r.text);
		}
	};
	/** `opening`: these blocks open a chapter, whose first words a style may set apart. */
	const blocks = (parent: HTMLElement, list: readonly Block[], notes: number[], opening = false) => {
		let first = true, lead = opening && style['first-words'] === 'small capitals';
		for (const b of list) {
			if (b.kind === 'p') {
				const p = parent.createEl('p', { cls: first ? 'mod-first' : '' }), split = lead ? leadSplit(b.runs) : null;
				if (against(plain(b.runs), book.language)) p.setAttr('dir', 'auto');
				if (split) { p.createSpan({ cls: 'binders-export-lead', text: split[0] }); inline(p, split[1], notes); } else inline(p, b.runs, notes);
			} else if (b.kind === 'break') parent.createEl('p', { cls: 'binders-export-break', text: style['scene-break'] || ' ' });
			else if (b.kind === 'heading') inline(parent.createEl('h3', { cls: `binders-export-sub mod-${Math.min(4, Math.max(2, b.level))}` }), b.runs, notes);
			else if (b.kind === 'code') parent.createEl('pre', { text: b.text });
			else if (b.kind === 'quote') { const q = parent.createEl('blockquote'); if (b.title) inline(q.createEl('p', { cls: 'mod-first' }).createEl('strong'), b.title, notes); blocks(q, b.blocks, notes); }
			else if (b.kind === 'list') { const l = parent.createEl(b.ordered ? 'ol' : 'ul'); if (b.ordered) l.setAttr('start', String(b.start)); for (const item of b.items) blocks(l.createEl('li'), item, notes); }
			else if (b.kind === 'table') { const t = parent.createEl('table'); b.rows.forEach((row, i) => { const tr = t.createEl('tr'); for (const cell of row) inline(tr.createEl(i ? 'td' : 'th'), cell, notes); }); }
			else if (b.kind === 'image' && b.picture) {
				const url = URL.createObjectURL(new Blob([b.picture.data.slice().buffer], { type: `image/${b.picture.type}` }));
				urls.push(url);
				parent.createEl('img', { cls: 'binders-export-picture', attr: { src: url, alt: b.alt } });
			} else continue;
			first = b.kind === 'break' || b.kind === 'heading';
			lead = false;
		}
	};
	const section = (s: Section) => {
		const sec = paper.createEl('section', { cls: `binders-export-section mod-${s.role}${s.matter ? ` mod-${s.matter}` : ''}` });
		if (s.made && s.matter === 'title-page') {
			sec.createEl('h1', { cls: 'binders-export-title', text: book.title });
			if (book.subtitle) sec.createEl('p', { cls: 'binders-export-subtitle', text: book.subtitle });
			if (book.author.trim()) sec.createEl('p', { cls: 'binders-export-by', text: book.author.trim() });
			return;
		}
		if (s.made && s.matter === 'contents') {
			sec.createEl('h2', { cls: 'binders-export-heading', text: bookWord('contents', book.language) || book.title });
			const list = (parent: HTMLElement, entries: ReturnType<typeof contentsOf>) => { const ol = parent.createEl('ol', { cls: 'binders-export-toc' }); for (const e of entries) { const li = ol.createEl('li', { text: e.label }); if (e.under.length) list(li, e.under); } };
			list(sec, contentsOf(book, style));
			return;
		}
		const lines = bookHeading(style, s, book.language);
		if (lines.length) { const h = sec.createEl('h2', { cls: 'binders-export-heading' }); lines.forEach((line, i) => h.createSpan({ cls: i ? 'binders-export-heading-title' : '', text: line })); }
		const notes: number[] = [];
		blocks(sec, s.blocks, notes, s.role === 'chapter');
		if (notes.length) {
			// (in the ebook each is a note the reader pops up from its mark: here they follow their chapter)
			const foot = sec.createDiv({ cls: 'binders-export-notes' });
			notes.forEach((n, i) => {
				const row = foot.createDiv({ cls: 'binders-export-footnote' });
				blocks(row, book.notes[n] ?? [], []);
				(row.querySelector('p') ?? row).prepend(createEl('sup', { text: String(i + 1) }), ' ');
			});
		}
	};
	if (book.cover) {
		const url = URL.createObjectURL(new Blob([book.cover.data.slice().buffer], { type: `image/${book.cover.type}` }));
		urls.push(url);
		paper.createEl('section', { cls: 'binders-export-section mod-cover' }).createEl('img', { cls: 'binders-export-picture', attr: { src: url, alt: 'The cover' } });
	}
	if (!book.sections.some((s) => !s.made)) paper.createEl('p', { cls: 'binders-export-none', text: 'Nothing here is exported: the binder has no notes, or they are all left out.' });

	let at = 0, timer = 0, stopped = false;
	const more = () => {
		const until = Date.now() + 12;
		while (at < book.sections.length && (at < 6 || Date.now() < until)) section(book.sections[at++]);
		if (at < book.sections.length && !stopped) timer = window.setTimeout(more, 0);
	};
	more();
	return () => { stopped = true; window.clearTimeout(timer); for (const u of urls) URL.revokeObjectURL(u); };
}
