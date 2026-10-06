import { Platform } from 'obsidian';
import { pdfPages, withInfo } from './pdf-info';

/* Printing pages to a PDF, on a computer. Obsidian has no API for it: this is Electron's `<webview>` tag and its
   `printToPDF`, so it is here and nowhere else (golden rule 5), looked at before it is trusted, and `printer()` is
   null wherever it isn't to be had (a phone, a tablet, an Obsidian whose webviews are off): then the window says
   "PDF isn't available here" and nothing is tried (docs/internals.md).

   The pages are Binders' own boxes, already laid out (pages/layout.ts); the webview is handed them as text, in a
   document of its own that no theme reaches, and prints one box to a sheet. Nothing is asked of Chromium's own
   paging but the sheet's size. A second window would do the same and crashes Electron when it has no screen. */

export interface PrintJob {
	title: string;
	author: string;
	language: string;
	rtl: boolean;
	/** The stylesheet: the faces, the pages' rules, the sheet's size. */
	css: string;
	/** The pages, as HTML. */
	body: string;
	/** How many pages there are: the PDF must have as many. */
	pages: number;
}

export interface Printer { print(job: PrintJob): Promise<Uint8Array> }

interface WebviewTag extends HTMLElement {
	executeJavaScript(code: string): Promise<unknown>;
	printToPDF(options: Record<string, unknown>): Promise<Uint8Array>;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** How long the webview may take to come up, and to print. */
const LOAD_MS = 20000, PRINT_MS = 300000;
const within = <T>(ms: number, what: string, p: Promise<T>): Promise<T> => Promise.race([p, new Promise<T>((_, no) => window.setTimeout(() => no(new Error(`${what} took too long.`)), ms))]);

/** The way to a PDF, or null where there is none. */
export function printer(): Printer | null {
	if (!Platform.isDesktopApp || Platform.isMobile) return null;
	try {
		const probe = createEl('webview' as 'div') as unknown as Partial<WebviewTag>;
		if (typeof probe.printToPDF !== 'function' || typeof probe.executeJavaScript !== 'function') return null;
	} catch { return null; }
	return { print };
}

async function print(job: PrintJob): Promise<Uint8Array> {
	const html = `<!doctype html><html lang="${esc(job.language)}"${job.rtl ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><title>${esc(job.title)}</title><meta name="author" content="${esc(job.author)}"><style>${job.css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${job.body}</body></html>`;
	const view = activeDocument.body.createEl('webview' as 'div', { cls: 'binders-export-printer', attr: { src: 'about:blank', nodeintegration: 'false', 'aria-hidden': 'true' } }) as unknown as WebviewTag;
	try {
		await within(LOAD_MS, 'Starting the printer', new Promise<void>((ok, no) => {
			view.addEventListener('dom-ready', () => ok(), { once: true });
			view.addEventListener('did-fail-load', () => no(new Error('The printer’s page didn’t load.')), { once: true });
		}));
		// the pages are written into the webview's own document, and it says when every face and picture is in
		const ready = `(() => { document.open(); document.write(${JSON.stringify(html)}); document.close();
			return new Promise((done) => { const go = () => Promise.all([...document.fonts].map((f) => f.load().catch(() => null))).then(() => document.fonts.ready).then(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))))).then(() => done(document.querySelectorAll('.page').length));
				if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true }); }); })()`;
		const there = await within(LOAD_MS * 3, 'Getting the pages ready', view.executeJavaScript(ready));
		if (there !== job.pages) throw new Error('The pages didn’t reach the printer whole.');
		const pdf = await within(PRINT_MS, 'Printing', view.printToPDF({ preferCSSPageSize: true, printBackground: true, generateTaggedPDF: true }));
		const data = new Uint8Array(pdf);
		const made = pdfPages(data);
		if (made !== -1 && made !== job.pages) throw new Error(`The PDF came out with ${made.toLocaleString()} pages where the book has ${job.pages.toLocaleString()}.`);
		return withInfo(data, { title: job.title, author: job.author, creator: 'Binders, in Obsidian' });
	} finally { view.remove(); }
}
