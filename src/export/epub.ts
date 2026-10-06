import { strToU8, zipSync, type Zippable } from 'fflate';
import { esc } from './docx-parts';
import { ebookCss } from './epub-css';
import { Pictures, sectionHtml, titlePageHtml, type Shared } from './epub-text';
import type { Book, Picture, Section } from './model';
import { bookHeading, bookWord, isRtl, type BookStyle } from './style';

/* The ebook writer: a book as an EPUB 3, written by hand as text and zipped with fflate. A file to a section (Apple
   Books and Kobo turn the page between files), a navigation document (which is the contents page too) and an NCX for
   old readers, footnotes a reader pops up, the cover as the package's cover image, and what stores ask a book to
   say about its accessibility. The reader's typeface is left alone (epub-css.ts). Pure: a function from the book
   model and a style to the file's bytes. The design is docs/export.md; EPUBCheck reads what this writes in the tests. */

export interface EbookDetails {
	/** When it is made: the package's "modified". */
	when?: Date;
}

export const EPUB_MIME = 'application/epub+zip';
const XHTML = 'application/xhtml+xml', TYPES: Record<Picture['type'], string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };

/** The book's own identifier: the same for the same title, author and language however often it is exported (a
    store takes a new one for a new book), made from them and nothing else. */
export function bookId(book: Pick<Book, 'title' | 'author' | 'language'>): string {
	const text = `${book.title}\n${book.author}\n${book.language}`;
	let hex = '';
	for (let seed = 0; seed < 4; seed++) {
		let h = 0x811c9dc5 ^ (seed * 0x9e3779b1);
		for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
		hex += (h >>> 0).toString(16).padStart(8, '0');
	}
	return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** A section's name in the contents: its heading's lines as one. */
export const sectionLabel = (s: Section, book: Book, style: BookStyle): string => (s.made && s.matter === 'title-page' ? book.title : bookHeading(style, s, book.language).join(' · '));

interface Entry { s: Section; label: string; under: Entry[] }
/** The contents as a tree: chapters under their part. A section with no name (a made copyright page) and the
    contents itself aren't in it. */
export function contentsOf(book: Book, style: BookStyle): Entry[] {
	const top: Entry[] = [];
	let part: Entry | null = null;
	for (const s of book.sections) {
		const label = sectionLabel(s, book, style);
		if (s.role !== 'chapter') part = null;
		if (!label || s.matter === 'contents') continue;
		const e: Entry = { s, label, under: [] };
		if (s.role === 'part') { part = e; top.push(e); } else (part ? part.under : top).push(e);
	}
	return top;
}

export function writeEpub(book: Book, style: BookStyle, o: EbookDetails = {}): Uint8Array {
	const lang = esc(book.language || 'en'), rtl = isRtl(book.language), id = bookId(book);
	const file = (sid: string) => `${sid}.xhtml`;
	const x: Shared = { book, style, pictures: new Pictures(), home: new Map(), file };
	const contentsWord = bookWord('contents', book.language) || book.title || '·';
	const page = (title: string, body: string, type: string, css: string) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"${rtl ? ' dir="rtl"' : ''}>\n<head><meta charset="utf-8"/><title>${esc(title) || '·'}</title><link rel="stylesheet" type="text/css" href="${css}"/></head>\n<body${type ? ` epub:type="${type}"` : ''}>\n${body}\n</body>\n</html>\n`;

	// ---- the sections, a file each ----
	const files: Record<string, string> = {}, spine: { id: string; href: string; nav?: boolean }[] = [];
	const tree = contentsOf(book, style);
	let inContents = false;
	for (const s of book.sections) {
		if (s.made && s.matter === 'contents') { inContents = true; spine.push({ id: 'nav', href: 'nav.xhtml', nav: true }); continue; }
		const body = s.made && s.matter === 'title-page' ? titlePageHtml(book) : sectionHtml(s, x);
		files[`OEBPS/text/${file(s.id)}`] = page(sectionLabel(s, book, style) || book.title, body, s.role === 'front' ? 'frontmatter' : s.role === 'back' ? 'backmatter' : 'bodymatter', '../css/book.css');
		spine.push({ id: `s-${s.id}`, href: `text/${file(s.id)}` });
	}

	// ---- the contents: the navigation document, and the same list for old readers ----
	const list = (entries: Entry[]): string => `<ol>${entries.map((e) => `<li><a href="text/${file(e.s.id)}">${esc(e.label)}</a>${e.under.length ? list(e.under) : ''}</li>`).join('')}</ol>`;
	const body1 = book.sections.find((s) => !s.made && s.role !== 'front') ?? book.sections.find((s) => !(s.made && s.matter === 'contents'));
	const titlePage = book.sections.find((s) => s.matter === 'title-page');
	const marks = [
		titlePage ? `<li><a epub:type="titlepage" href="text/${file(titlePage.id)}">${esc(book.title || '·')}</a></li>` : '',
		inContents ? `<li><a epub:type="toc" href="nav.xhtml#toc">${esc(contentsWord)}</a></li>` : '',
		body1 ? `<li><a epub:type="bodymatter" href="text/${file(body1.id)}">${esc(sectionLabel(body1, book, style) || book.title || '·')}</a></li>` : '',
	].filter((l) => l).join('');
	files['OEBPS/nav.xhtml'] = page(contentsWord, `<nav epub:type="toc" role="doc-toc" id="toc" aria-labelledby="h">\n<h1 id="h">${esc(contentsWord)}</h1>\n${tree.length ? list(tree) : `<ol><li><a href="${spine.find((p) => !p.nav)?.href ?? 'nav.xhtml'}">${esc(book.title || '·')}</a></li></ol>`}\n</nav>${marks ? `\n<nav epub:type="landmarks" hidden="hidden"><ol>${marks}</ol></nav>` : ''}`, '', 'css/book.css');
	let order = 0;
	const points = (entries: Entry[]): string => entries.map((e) => `<navPoint id="np${++order}" playOrder="${order}"><navLabel><text>${esc(e.label)}</text></navLabel><content src="text/${file(e.s.id)}"/>${points(e.under)}</navPoint>`).join('');
	const navMap = points(tree) || `<navPoint id="np1" playOrder="1"><navLabel><text>${esc(book.title || '·')}</text></navLabel><content src="${spine.find((p) => !p.nav)?.href ?? 'nav.xhtml'}"/></navPoint>`;
	files['OEBPS/toc.ncx'] = `<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${lang}">\n<head><meta name="dtb:uid" content="${id}"/><meta name="dtb:depth" content="${tree.some((e) => e.under.length) ? 2 : 1}"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>\n<docTitle><text>${esc(book.title || '·')}</text></docTitle>\n<navMap>${navMap}</navMap>\n</ncx>\n`;
	files['OEBPS/css/book.css'] = ebookCss(style);

	// ---- the package ----
	const pictures = x.pictures.list, cover = book.cover, alts = pictures.length > 0 && !/<img [^>]*alt=""/.test(Object.values(files).join(''));
	const meta = [
		`<dc:identifier id="bookid">${id}</dc:identifier>`,
		`<dc:title>${esc(book.title) || '·'}</dc:title>`,
		book.subtitle ? `<meta property="dcterms:alternative">${esc(book.subtitle)}</meta>` : '',
		book.author.trim() ? `<dc:creator id="creator">${esc(book.author.trim())}</dc:creator>\n\t<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>` : '',
		`<dc:language>${lang}</dc:language>`,
		book.copyright ? `<dc:rights>${esc(book.copyright.replace(/\n/g, ' '))}</dc:rights>` : '',
		`<meta property="dcterms:modified">${(o.when ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z')}</meta>`,
		cover ? '<meta name="cover" content="cover-image"/>' : '',
		'<meta property="schema:accessMode">textual</meta>',
		pictures.length ? '<meta property="schema:accessMode">visual</meta>' : '',
		!pictures.length || alts ? '<meta property="schema:accessModeSufficient">textual</meta>' : '',
		...['structuralNavigation', 'tableOfContents', 'readingOrder', ...(alts ? ['alternativeText'] : [])].map((f) => `<meta property="schema:accessibilityFeature">${f}</meta>`),
		'<meta property="schema:accessibilityHazard">none</meta>',
	].filter((l) => l).join('\n\t');
	const items = [
		`<item id="nav" href="nav.xhtml" media-type="${XHTML}" properties="nav"/>`,
		'<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
		'<item id="css" href="css/book.css" media-type="text/css"/>',
		cover ? `<item id="cover-image" href="images/cover.${cover.type === 'jpeg' ? 'jpg' : cover.type}" media-type="${TYPES[cover.type]}" properties="cover-image"/>` : '',
		...pictures.map((p, i) => `<item id="img-${i + 1}" href="images/${p.name}" media-type="${TYPES[p.picture.type]}"/>`),
		...spine.filter((p) => !p.nav).map((p) => `<item id="${p.id}" href="${p.href}" media-type="${XHTML}"/>`),
	].filter((l) => l).join('\n\t');
	// (a book whose contents page is turned off still needs something to read: the navigation is then no page of it)
	const refs = spine.map((p) => `<itemref idref="${p.id}"/>`).join('\n\t');
	files['OEBPS/package.opf'] = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"${rtl ? ' dir="rtl"' : ''}>\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n\t${meta}\n</metadata>\n<manifest>\n\t${items}\n</manifest>\n<spine toc="ncx"${rtl ? ' page-progression-direction="rtl"' : ''}>\n\t${refs || '<itemref idref="nav"/>'}\n</spine>\n</package>\n`;

	// ---- the file: `mimetype` first and stored, as an EPUB must have it ----
	const zip: Zippable = { mimetype: [strToU8(EPUB_MIME), { level: 0 }] };
	zip['META-INF/container.xml'] = strToU8('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n');
	for (const [name, text] of Object.entries(files)) zip[name] = strToU8(text);
	// (pictures are packed already: stored as they are)
	if (cover) zip[`OEBPS/images/cover.${cover.type === 'jpeg' ? 'jpg' : cover.type}`] = [cover.data, { level: 0 }];
	for (const p of pictures) zip[`OEBPS/images/${p.name}`] = [p.picture.data, { level: 0 }];
	return zipSync(zip, { level: 6 });
}
