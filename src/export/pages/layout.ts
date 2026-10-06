import { headingLines, keyword, roundedWords, surname } from '../docx';
import type { ManuscriptStyle } from '../docx-parts';
import type { Book, Picture } from '../model';
import { bookHeading, isRtl, type BookStyle } from '../style';
import { bookCss, manuscriptCss } from './css';
import { DomHost, pageText, type PageBox } from './dom';
import { el } from './el';
import { fill } from './fill';
import { BookFlow, type Look } from './flow';
import { carried, fontStack, fontWarning, loadFonts } from './fonts';
import { furnish, type Furnish, type Furniture } from './furniture';
import { bookGeometry, estimatePages, gutter, manuscriptGeometry, type Geometry, type PageSize } from './geometry';
import { hyphenatorFor } from './patterns';

/* A book laid out as pages, in a document of its own: the pages the window shows and the pages that are printed
   are these, the same boxes. `bookPages` and `manuscriptPages` say how (a style on a page size); `openStage` makes
   the document; `layPages` fills it, a little at a time so a long book doesn't hold the window up. */

/** How a book is to be paged: everything the layout needs beside the book. */
export interface PagesSpec {
	geometry: Geometry;
	/** The pages' stylesheet. */
	css: string;
	/** The typeface to load before anything is measured. */
	typeface: string;
	language: string;
	rtl: boolean;
	look: Pick<Look, 'heading' | 'mark' | 'lead' | 'recto' | 'titlePage' | 'style'>;
	hyphens: boolean;
	furnish: Omit<Furnish, 'front'>;
	/** Something to tell the writer (the typeface doesn't hold the book's script); "" for nothing. */
	warning: string;
	/** The same book with more room at its spine, when it came to so many pages that it needs it; else null. */
	thicker?: (pages: number) => PagesSpec | null;
}

/** A book style on a page size: the paperback. */
export function bookPages(book: Book, style: BookStyle, size: PageSize, words: number, pages?: number): PagesSpec {
	const flat = bookGeometry(style, size), g = bookGeometry(style, size, pages ?? estimatePages(words, flat)), language = book.language || 'en';
	return {
		geometry: g, css: bookCss(style, g, fontStack(style.typeface, language)), typeface: style.typeface, language, rtl: isRtl(language),
		look: { heading: (s) => bookHeading(style, s, language), mark: style['scene-break'], lead: style['first-words'] === 'small capitals', recto: style['chapter-opens'] === 'right-hand page', style },
		hyphens: style.alignment !== 'left',
		furnish: { heads: style['running-heads'], numbers: style['page-numbers'], title: book.title, author: book.author.trim() },
		warning: fontWarning(style.typeface, language),
		thicker: (count) => (gutter(count) > g.inside + 0.01 ? bookPages(book, style, size, words, count) : null),
	};
}

/** A manuscript style on Letter or A4: the manuscript as a PDF, set as the Word file is. */
export function manuscriptPages(book: Book, style: ManuscriptStyle, paper: PageSize, details: { contact: string[]; words: number }): PagesSpec {
	const g = manuscriptGeometry(style, paper), language = book.language || 'en';
	const header = style.header === 'none' ? '' : style.header === 'page' ? '{page}' : `${[surname(book.author), keyword(book.title)].filter((x) => x).join(' / ')} / {page}`;
	const titlePage = (page: HTMLElement) => {
		const doc = page.ownerDocument, top = page.appendChild(el(doc, 'div', 'contact')), who = top.appendChild(el(doc, 'div'));
		for (const line of [book.author, ...details.contact].filter((l) => l.trim())) who.append(el(doc, 'p', '', line), ' ');
		top.append(el(doc, 'p', '', `about ${roundedWords(details.words).toLocaleString('en-US')} words`));
		page.append(' ', el(doc, 'h1', '', book.title), ' ');
		if (book.author.trim()) page.append(el(doc, 'p', 'by', `by ${book.author.trim()}`));
	};
	return {
		geometry: g, css: manuscriptCss(style, g), typeface: style.typeface, language, rtl: isRtl(language),
		look: { heading: headingLines, mark: style.sceneBreak, lead: false, recto: false, titlePage },
		hyphens: false,
		furnish: { heads: 'none', numbers: 'none', title: book.title, author: book.author.trim(), header },
		warning: '',
	};
}

/** A manuscript has its own title page, which the book model doesn't make: the book with one in front. */
export function withTitlePage(book: Book): Book {
	return { ...book, sections: [{ id: 'title-page', role: 'front', matter: 'title-page', made: true, number: null, title: '', blocks: [], paths: [] }, ...book.sections] };
}

// ---- the document the pages are in ----

const PX = 96 / 72;
/** How the pages stand in their document: sheets side by side as spreads (the first page alone on the right), or
    one under another; each shown at the scale the window gives (`--s`), on the desk's color (`--desk`). */
const screenCss = (g: Geometry): string => `:root { --w: ${g.width * PX}px; --h: ${g.height * PX}px; --s: 1; --desk: #8a8a8a; }
html { background: var(--desk); }
body { margin: 0; }
#book { display: grid; grid-template-columns: repeat(2, max-content); justify-content: center; gap: 20px 0; padding: 20px 12px; }
#book.single { grid-template-columns: max-content; gap: 14px; }
#book:not(.single) .sheet:first-child { grid-column: 2; }
.sheet { width: calc(var(--w) * var(--s)); height: calc(var(--h) * var(--s)); overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); background: #fff; }
.sheet > .page { transform: scale(var(--s)); transform-origin: 0 0; }
[dir="rtl"] .sheet > .page { transform-origin: 100% 0; }
.page[data-done] { content-visibility: auto; }
`;

export interface Stage {
	frame: HTMLIFrameElement;
	doc: Document;
	/** Where the sheets go. */
	book: HTMLElement;
	/** The pages' stylesheet, and the window's own few values (the scale, the desk). */
	sheet: HTMLStyleElement;
	vars: HTMLStyleElement;
	/** The typefaces loaded into it. */
	faces: Set<string>;
	close(): void;
}

/** A document for pages, in a frame put into `parent`: nothing of the theme reaches into it. */
export async function openStage(parent: HTMLElement, cls: string): Promise<Stage> {
	const frame = parent.createEl('iframe', { cls, attr: { title: 'The pages', srcdoc: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' } });
	// (a frame that isn't in the window never loads: better said than waited for)
	await new Promise<void>((done, no) => { frame.addEventListener('load', () => done(), { once: true }); window.setTimeout(() => no(new Error('The pages couldn’t be laid out here.')), 10000); }).catch((e) => { frame.remove(); throw e; });
	const doc = frame.contentDocument;
	if (!doc) { frame.remove(); throw new Error('The pages couldn’t be laid out here.'); }
	const sheet = doc.head.appendChild(el(doc, 'style')), vars = doc.head.appendChild(el(doc, 'style'));
	const book = doc.body.appendChild(el(doc, 'div'));
	book.id = 'book';
	return { frame, doc, book, sheet, vars, faces: new Set(), close: () => frame.remove() };
}

// ---- laying out ----

export interface LayOptions {
	/** Called now and then with how many pages there are so far. */
	tick?: (pages: number) => void;
	cancelled?: () => boolean;
	/** How much smaller than life the pages are shown while they are measured. */
	scale?: () => number;
}

/** The pages, laid out. */
export interface Laid {
	spec: PagesSpec;
	pages: PageBox[];
	furniture: Furniture[];
	/** The pages that hold more than they should (their numbers from 1): something on them is taller than a page. */
	over: number[];
	/** Each page's text, in order. */
	texts(): string[];
	/** The pages as the HTML that is printed, pictures and all. */
	html(): string;
	/** How long the layout took, in milliseconds. */
	took: number;
}

const base64 = (data: Uint8Array): string => { let s = ''; for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000)); return btoa(s); };

/** Lays a book out on a stage. Null if it was cancelled. The stage is emptied first: it holds one book. */
export async function layPages(stage: Stage, book: Book, spec: PagesSpec, o: LayOptions = {}): Promise<Laid | null> {
	const { doc } = stage, g = spec.geometry, began = performance.now();
	stage.book.replaceChildren();
	stage.sheet.textContent = screenCss(g) + spec.css;
	stage.book.dir = spec.rtl ? 'rtl' : 'ltr';
	stage.book.lang = spec.language;
	if (carried(spec.typeface) && !stage.faces.has(spec.typeface)) { await loadFonts(doc, spec.typeface); stage.faces.add(spec.typeface); }
	if (o.cancelled?.()) return null;

	const urls = new Map<string, Picture>(), hyphenator = spec.hyphens ? hyphenatorFor(spec.language) : null;
	const wide = (g.width - g.inside - g.outside) * PX, tall = (g.block - g.lead) * PX;
	const flow = new BookFlow(doc, book, {
		...spec.look,
		hyphenate: hyphenator ? (t) => hyphenator.hyphenate(t) : null,
		picture: (p) => { const url = URL.createObjectURL(new Blob([p.data.slice().buffer], { type: `image/${p.type}` })); urls.set(url, p); return url; },
		fit: (p) => { const k = Math.min(1, wide / Math.max(1, p.width), tall / Math.max(1, p.height)); return [Math.max(1, Math.floor(p.width * k)), Math.max(1, Math.floor(p.height * k))]; },
	});
	const over: number[] = [];
	const host = new DomHost(doc, stage.book, flow, { block: g.block * PX, rtl: spec.rtl, scale: o.scale ?? (() => 1), cls: (s) => flow.flows[s].cls, over: (page) => over.push(page) });
	const drop = () => { for (const u of urls.keys()) URL.revokeObjectURL(u); };

	const it = fill(host, flow.flows);
	let step = it.next(), at = performance.now();
	while (!step.done) {
		if (performance.now() - at > 40) {
			o.tick?.(host.pages.length);
			await new Promise((r) => window.setTimeout(r, 0));
			if (o.cancelled?.() || !stage.frame.isConnected) { drop(); return null; }
			at = performance.now();
		}
		step = it.next();
	}
	host.end();
	// a book that came to more pages than was thought may need more room at its spine: then it is laid out again
	const thicker = spec.thicker?.(host.pages.length);
	if (thicker) { drop(); return layPages(stage, book, thicker, o); }

	const furniture = furnish(step.value, { ...spec.furnish, front: flow.flows.map((f) => f.front) });
	dress(doc, host.pages, furniture, flow, spec);
	return {
		spec, pages: host.pages, furniture, over, took: performance.now() - began,
		texts: () => host.pages.map(pageText),
		html: () => host.pages.map((p) => { let html = p.page.outerHTML; for (const [url, pic] of urls) html = html.split(url).join(`data:image/${pic.type};base64,${base64(pic.data)}`); return html; }).join('\n'),
	};
}

/** The heads and the numbers put on the pages, the contents given their page numbers, and a scene break that fell
    at the head of a page given a mark (space alone would not be seen there). */
function dress(doc: Document, pages: PageBox[], furniture: Furniture[], flow: BookFlow, spec: PagesSpec): void {
	const first = new Map<string, string>();
	pages.forEach((p, i) => { const id = p.opened.section >= 0 ? flow.flows[p.opened.section].id : ''; if (id && !first.has(id)) first.set(id, furniture[i].number); });
	pages.forEach((p, i) => {
		const f = furniture[i];
		if (f.head || f.folio === 'head') {
			const head = el(doc, 'div', `head${f.folio === 'head' ? ' outside' : ''}`);
			if (spec.furnish.header !== undefined) head.textContent = f.head;
			else { if (f.folio === 'head') head.append(el(doc, 'span', 'n', f.number)); if (f.head) head.append(el(doc, 'span', 't', f.head)); }
			p.page.prepend(head);
		}
		if (f.folio === 'foot') p.page.append(el(doc, 'div', 'folio', f.number));
		for (const n of Array.from(p.text.querySelectorAll<HTMLElement>('p.toc .n'))) n.textContent = first.get(n.dataset.to ?? '') ?? '';
		const top = p.text.firstElementChild;
		if (top?.classList.contains('break')) { top.classList.add('edge'); if (!top.textContent?.trim()) top.textContent = '* * *'; }
	});
}
