import { Platform } from 'obsidian';
import { pdfPages, withInfo } from './pdf-info';

/* Printing pages to a PDF, on a computer. Obsidian has no API for it: this is Electron's `<webview>` tag and its
   `printToPDF`, so it is here and nowhere else (golden rule 5), looked at before it is trusted, and `printer()` is
   null wherever it isn't to be had (a phone, a tablet, an Obsidian whose webviews are off): then the window says
   "PDF isn't available here" and nothing is tried (docs/dev/internals.md).

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

/** `stop`: the writer's own stop (Cancel, or the window closed). The print ends there and then, with nothing made. */
export interface Printer { print(job: PrintJob, stop?: AbortSignal): Promise<Uint8Array> }

interface WebviewTag extends HTMLElement {
	executeJavaScript(code: string): Promise<unknown>;
	printToPDF(options: Record<string, unknown>): Promise<Uint8Array>;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** How long the webview may take to come up, and to print. */
const LOAD_MS = 20000, PRINT_MS = 300000;
/** A step of the print, for as long as it may take and no longer, or until it is stopped. */
function within<T>(ms: number, what: string, p: Promise<T>, stopped: Promise<never>): Promise<T> {
	let timer = 0;
	return Promise.race([p, stopped, new Promise<never>((_, no) => { timer = window.setTimeout(() => no(new Error(`${what} took too long.`)), ms); })]).finally(() => window.clearTimeout(timer));
}

/** Whether this Obsidian's webviews can print: looked at once, with a webview made for the look and never put in the
    page. The window asks each time it is drawn, and what an Obsidian can do doesn't change while it runs. */
let able: boolean | null = null;
function canPrint(): boolean {
	try {
		const probe = createEl('webview' as 'div') as unknown as Partial<WebviewTag>;
		return typeof probe.printToPDF === 'function' && typeof probe.executeJavaScript === 'function';
	} catch { return false; }
}

/** The way to a PDF, or null where there is none. (A phone, or Obsidian's own emulation of one, is asked each time:
    that can change under a running plugin.) */
export function printer(): Printer | null {
	if (!Platform.isDesktopApp || Platform.isMobile) return null;
	able ??= canPrint();
	return able ? { print } : null;
}

async function print(job: PrintJob, stop?: AbortSignal): Promise<Uint8Array> {
	// Stopped by the writer: whatever is being waited for is waited for no longer, and the webview goes at once (the
	// `finally` below), where it would have gone on printing out of sight for as long as a print may take.
	const stopped = new Promise<never>((_, no) => {
		const end = () => no(new Error('The export was stopped.'));
		if (stop?.aborted) end(); else stop?.addEventListener('abort', end, { once: true });
	});
	stopped.catch(() => { /* (a stop after the print is done: nobody is waiting) */ });
	const html = `<!doctype html><html lang="${esc(job.language)}"${job.rtl ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><title>${esc(job.title)}</title><meta name="author" content="${esc(job.author)}"><style>${job.css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${job.body}</body></html>`;
	const view = activeDocument.body.createEl('webview' as 'div', { cls: 'binders-export-printer', attr: { src: 'about:blank', 'aria-hidden': 'true' } }) as unknown as WebviewTag;
	try {
		await within(LOAD_MS, 'Starting the printer', new Promise<void>((ok, no) => {
			view.addEventListener('dom-ready', () => ok(), { once: true });
			view.addEventListener('did-fail-load', () => no(new Error('The printer’s page didn’t load.')), { once: true });
		}), stopped);
		// the pages are written into the webview's own document, and it says when every face and picture is in
		const ready = `(() => { document.open(); document.write(${JSON.stringify(html)}); document.close();
			return new Promise((done) => { const go = () => Promise.all([...document.fonts].map((f) => f.load().catch(() => null))).then(() => document.fonts.ready).then(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))))).then(() => done(document.querySelectorAll('.page').length));
				if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true }); }); })()`;
		const there = await within(LOAD_MS * 3, 'Getting the pages ready', view.executeJavaScript(ready), stopped);
		if (there !== job.pages) throw new Error('The pages didn’t reach the printer whole.');
		const pdf = await within(PRINT_MS, 'Printing', view.printToPDF({ preferCSSPageSize: true, printBackground: true, generateTaggedPDF: true }), stopped);
		const data = new Uint8Array(pdf);
		const made = pdfPages(data);
		if (made !== -1 && made !== job.pages) throw new Error(`The PDF came out with ${made.toLocaleString()} pages where the book has ${job.pages.toLocaleString()}.`);
		return withInfo(data, { title: job.title, author: job.author, creator: 'Binders, in Obsidian' });
	} finally { view.remove(); }
}
