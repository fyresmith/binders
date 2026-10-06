/* An element of the pages' own document. The pages are laid out in a frame of their own, so that no theme's or
   plugin's CSS reaches a book; Obsidian's `createEl` helpers belong to its windows and aren't in that document, so
   elements are made by the document itself. Text is always set as text: nothing here reads HTML. */

const XHTML = 'http://www.w3.org/1999/xhtml';

export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
	const e = doc.createElementNS(XHTML, tag) as HTMLElementTagNameMap[K];
	if (cls) e.className = cls;
	if (text) e.textContent = text;
	return e;
}
