import { strToU8, zipSync } from 'fflate';
import { DRAWING, W, XML, appXml, contentTypes, coreXml, esc, numberingXml, relsXml, rootRels, settingsXml, stylesXml, type ManuscriptStyle, type Rel } from './docx-parts';
import { numberWords, type Block, type Book, type Inline, type Picture, type Section, type Text } from './model';

/* The Word writer: a book as a .docx in standard manuscript format, with real Word styles (Heading 1 chapters, a
   scene-break style, footnotes as footnotes), which is what agents, editors, Vellum and Atticus read. Written by hand
   and zipped with fflate. Pure: a function from the book model to the file's bytes. The fixed parts are in
   docx-parts.ts. */

/** What a manuscript says besides the book: for its title page. */
export interface ManuscriptDetails {
	/** Contact details, a line each, under the writer's name. */
	contact: string[];
	/** The book's words, to be rounded. */
	words: number;
	/** When it is made (the file's own date). */
	when?: Date;
}

/** A word count as a title page gives it: to the nearest hundred, or thousand for a book. */
export const roundedWords = (n: number): number => (n < 20000 ? Math.max(100, Math.round(n / 100) * 100) : Math.round(n / 1000) * 1000);
/** The count as a title page says it. A book with no words says none: "about 100 words" would be a count it hasn't. */
export const aboutWords = (n: number): string => (n > 0 ? `about ${roundedWords(n).toLocaleString('en-US')} words` : '');
/** The word of a title a header carries: the title in capitals, without an article in front. */
export const keyword = (title: string): string => title.trim().replace(/^(the|a|an)\s+/i, '').toUpperCase();
export const surname = (author: string): string => author.trim().split(/\s+/).pop() ?? '';

/** A section's heading, a line each: "Chapter One" and its title; a name alone for a prologue or a dedication. */
export function headingLines(s: Section): string[] {
	const number = s.number == null ? '' : `${s.role === 'part' ? 'Part' : 'Chapter'} ${numberWords(s.number)}`;
	return [number, s.title].filter((l) => l);
}

/** One XML part being written (the text, or the footnotes): each has its own links and pictures. */
class Part {
	rels: Rel[] = [];
	constructor(private prefix: string, private media: Map<Picture, string>) { }
	rel(type: Rel['type'], target: string): string {
		const had = this.rels.find((r) => r.type === type && r.target === target);
		if (had) return had.id;
		const id = `${this.prefix}${this.rels.length + 1}`;
		this.rels.push({ id, type, target });
		return id;
	}
	picture(p: Picture): string {
		let name = this.media.get(p);
		if (!name) { name = `image${this.media.size + 1}.${p.type}`; this.media.set(p, name); }
		return this.rel('image', `media/${name}`);
	}
}

const PAGE = '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>';
/** The room for a picture: the text's width, and most of its height (in EMU, 914400 to the inch). */
const MAX_W = 6.5 * 914400, MAX_H = 8 * 914400;

export function writeDocx(book: Book, style: ManuscriptStyle, details: ManuscriptDetails): Uint8Array {
	const media = new Map<Picture, string>(), nums: { ordered: boolean; start: number; level: number }[] = [];
	const doc = new Part('rId', media), foot = new Part('rId', media);
	let drawings = 0;
	/** Footnotes whose mark has been set, with the number Word gives each: a second mark of the same one is that
	    number, as text. */
	const marked = new Map<number, number>();

	const t = (s: string) => `<w:t xml:space="preserve">${esc(s)}</w:t>`;
	const rpr = (r: Partial<Text>, extra = '') => {
		const inner = `${extra}${r.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:eastAsia="Courier New"/>' : ''}${r.b ? '<w:b/>' : ''}${r.i && style.italics === 'italic' ? '<w:i/>' : ''}${r.s ? '<w:strike/>' : ''}${r.i && style.italics === 'underlined' ? '<w:u w:val="single"/>' : ''}`;
		return inner ? `<w:rPr>${inner}</w:rPr>` : '';
	};
	/** Text in a run: a tab and a line break (in code) are Word's own. */
	const textRun = (r: Partial<Text>, text: string, extra = '') => `<w:r>${rpr(r, extra)}${text.split(/(\n|\t)/).map((s) => (s === '\n' ? '<w:br/>' : s === '\t' ? '<w:tab/>' : s ? t(s) : '')).join('')}</w:r>`;
	const runs = (list: readonly Inline[], part: Part, mark: Partial<Text> = {}): string => list.map((r) => {
		if (r.kind === 'br') return '<w:r><w:br/></w:r>';
		if (r.kind === 'note') {
			if (part === foot) return ''; // (a footnote can't carry one: `flatten` has put its words in the text)
			const had = marked.get(r.note);
			if (had) return textRun({}, String(had), '<w:rStyle w:val="FootnoteReference"/>');
			marked.set(r.note, marked.size + 1);
			return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${r.note + 2}"/></w:r>`;
		}
		const set = { ...r, b: r.b || mark.b };
		return r.href ? `<w:hyperlink r:id="${part.rel('hyperlink', r.href)}">${textRun(set, r.text, '<w:rStyle w:val="Hyperlink"/>')}</w:hyperlink>` : textRun(set, r.text);
	}).join('');
	const para = (styleId: string, inner: string, ppr = '') => `<w:p><w:pPr><w:pStyle w:val="${styleId}"/>${ppr}</w:pPr>${inner}</w:p>`;
	const words = (styleId: string, text: string) => para(styleId, text.split('\n').map((l, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${t(l)}</w:r>`).join(''));

	const drawing = (p: Picture, alt: string, part: Part): string => {
		const k = Math.min(1, MAX_W / (p.width * 9525), MAX_H / (p.height * 9525)), cx = Math.round(p.width * 9525 * k), cy = Math.round(p.height * 9525 * k), id = ++drawings;
		return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${part.picture(p)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
	};

	/** Blocks as paragraphs. `base`: the style a plain paragraph has here; `lead`: what the very first paragraph
	    starts with (a footnote's own number); `level`: how deep in lists. */
	const flow = (blocks: readonly Block[], part: Part, base = 'Normal', lead = '', level = 0): string => {
		const out: string[] = [];
		const first = () => { const l = lead; lead = ''; return l; };
		for (const b of blocks) {
			if (b.kind === 'p') out.push(para(base, first() + runs(b.runs, part)));
			else if (b.kind === 'break') out.push(words('SceneBreak', style.sceneBreak));
			else if (b.kind === 'heading') out.push(para(`Heading${Math.min(6, Math.max(2, b.level))}`, first() + runs(b.runs, part)));
			else if (b.kind === 'code') out.push(para('Code', first() + textRun({}, b.text)));
			else if (b.kind === 'image') { if (b.picture) out.push(para('Figure', first() + drawing(b.picture, b.alt, part))); }
			else if (b.kind === 'quote') {
				if (b.title) out.push(para('Quote', first() + runs(b.title, part, { b: true })));
				out.push(flow(b.blocks, part, 'Quote', first(), level));
			} else if (b.kind === 'list') {
				const numId = nums.push({ ordered: b.ordered, start: b.start, level: Math.min(level, 8) });
				for (const item of b.items) {
					// an item's first paragraph carries its bullet or number; what else it holds is set under it
					const [head, ...rest] = item, ind = `<w:ind w:left="${720 * (level + 1)}" w:firstLine="0"/>`;
					const num = `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`;
					out.push(para('ListParagraph', first() + (head?.kind === 'p' ? runs(head.runs, part) : ''), num));
					const under = head?.kind === 'p' ? rest : item;
					for (const u of under) out.push(u.kind === 'p' ? para('ListParagraph', runs(u.runs, part), ind) : flow([u], part, 'ListParagraph', '', level + 1));
				}
			} else if (b.kind === 'table') {
				const cols = Math.max(1, ...b.rows.map((r) => r.length)), width = Math.floor(9360 / cols), edge = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
				const cell = (c: Inline[] | undefined, i: number, head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${para('TableText', runs(c ?? [], part, head ? { b: true } : {}), b.align[i] && b.align[i] !== 'left' ? `<w:jc w:val="${b.align[i]}"/>` : '')}</w:tc>`;
				if (lead) out.push(para(base, first()));
				out.push(`<w:tbl><w:tblPr><w:tblW w:w="${width * cols}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(edge).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(cols)}</w:tblGrid>${b.rows.map((row, r) => `<w:tr>${Array.from({ length: cols }, (_, i) => cell(row[i], i, r === 0)).join('')}</w:tr>`).join('')}</w:tbl>`);
				// (Word wants a paragraph after a table that ends a cell, a note or the text)
				if (b === blocks[blocks.length - 1]) out.push(para(base, ''));
			}
		}
		if (lead) out.push(para(base, lead));
		return out.join('');
	};

	// ---- the text ----
	const body: string[] = [], author = book.author.trim(), approx = aboutWords(details.words);
	const header = style.header !== 'none';
	// (`first`: the pages are counted from the text's first, whatever came before it)
	const sect = (head: boolean, first = true) => `<w:sectPr>${head ? `<w:headerReference w:type="default" r:id="${doc.rel('header', 'header1.xml')}"/>` : ''}${PAGE}${first ? '<w:pgNumType w:start="1"/>' : ''}</w:sectPr>`;
	// (the links every text has, in an order that never changes)
	doc.rel('styles', 'styles.xml'); doc.rel('settings', 'settings.xml'); doc.rel('footnotes', 'footnotes.xml');
	if (style.titlePage) {
		// contact details and the count at the top, the title halfway down; no header on this page
		const contact = [author, ...details.contact].filter((l) => l.trim());
		body.push(`<w:p><w:pPr><w:pStyle w:val="Contact"/><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr><w:r>${t(contact[0] ?? '')}</w:r>${approx ? `<w:r><w:tab/>${t(approx)}</w:r>` : ''}</w:p>`);
		for (const l of contact.slice(1)) body.push(words('Contact', l));
		body.push(words('Title', book.title));
		if (author) body.push(words('Byline', `by ${author}`));
		body.push(`<w:p><w:pPr><w:pStyle w:val="Byline"/>${sect(false)}</w:pPr></w:p>`);
	}
	book.sections.forEach((s, i) => {
		// Each chapter is a section of the file as well as a new page: the room above a chapter's heading is kept at
		// the top of a section by every word processor, and at the top of a mere new page only by some. The section
		// before ends in a paragraph a point high, which holds that section's page settings.
		if (i) body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:ind w:firstLine="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>${sect(header, i === 1)}</w:pPr></w:p>`);
		body.push(words('Heading1', headingLines(s).join('\n')));
		body.push(flow(s.blocks, doc));
	});
	if (!book.sections.length) body.push(para('Normal', ''));
	body.push(sect(header, book.sections.length < 2));

	// ---- the footnotes: Word's two separators, then each note under its own number ----
	const sep = (id: number, type: string, mark: string) => `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:${mark}/></w:r></w:p></w:footnote>`;
	const ref = `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r>${t(' ')}</w:r>`;
	const notes = book.notes.map((n, i) => (marked.has(i) ? `<w:footnote w:id="${i + 2}">${flow(flatten(n, book), foot, 'FootnoteText', ref)}</w:footnote>` : '')).join('');

	const files: Record<string, string> = {
		'[Content_Types].xml': contentTypes({ header, numbering: nums.length > 0, images: [...new Set([...media.keys()].map((p) => p.type))] }),
		'_rels/.rels': rootRels(),
		'docProps/core.xml': coreXml(book.title, author, book.language, details.when ?? new Date()),
		'docProps/app.xml': appXml(),
		'word/styles.xml': stylesXml(style, book.language),
		'word/settings.xml': settingsXml(),
		'word/footnotes.xml': `${XML}<w:footnotes ${W} ${DRAWING}>${sep(0, 'separator', 'separator')}${sep(1, 'continuationSeparator', 'continuationSeparator')}${notes}</w:footnotes>`,
		'word/document.xml': `${XML}<w:document ${W} ${DRAWING}><w:body>${body.join('')}</w:body></w:document>`,
	};
	if (nums.length) { doc.rel('numbering', 'numbering.xml'); files['word/numbering.xml'] = numberingXml(nums); }
	if (header) {
		const field = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
		const said = style.header === 'page' ? '' : [surname(author), keyword(book.title), ''].filter((x, i) => x || i === 2).join(' / ');
		files['word/header1.xml'] = `${XML}<w:hdr ${W}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>${said ? `<w:r>${t(said)}</w:r>` : ''}${field}</w:p></w:hdr>`;
	}
	files['word/_rels/document.xml.rels'] = relsXml(doc.rels);
	if (foot.rels.length) files['word/_rels/footnotes.xml.rels'] = relsXml(foot.rels);

	const zip: Record<string, Uint8Array> = {};
	for (const [name, text] of Object.entries(files)) zip[name] = strToU8(text);
	for (const [p, name] of media) zip[`word/media/${name}`] = p.data;
	return zipSync(zip, { level: 6 });
}

/** A footnote's blocks with the footnotes marked inside it written out in their place, in brackets: Word has no
    footnote on a footnote, and their words must be somewhere. */
function flatten(blocks: readonly Block[], book: Book, seen = new Set<readonly Block[]>()): Block[] {
	const inside = (runs: Inline[]): Inline[] => runs.flatMap((r): Inline[] => {
		if (r.kind !== 'note') return [r];
		const n = book.notes[r.note];
		if (!n || seen.has(n)) return [];
		const text: Inline[] = [];
		for (const b of flatten(n, book, new Set([...seen, blocks, n]))) if (b.kind === 'p' || b.kind === 'heading') text.push(...(text.length ? [{ kind: 'text', text: ' ' } as Inline] : []), ...b.runs);
		return text.length ? [{ kind: 'text', text: ' [' }, ...text, { kind: 'text', text: ']' }] : [];
	});
	const walk = (list: readonly Block[]): Block[] => list.map((b): Block => {
		if (b.kind === 'p' || b.kind === 'heading') return { ...b, runs: inside(b.runs) };
		if (b.kind === 'quote') return { ...b, title: b.title ? inside(b.title) : undefined, blocks: walk(b.blocks) };
		if (b.kind === 'list') return { ...b, items: b.items.map(walk) };
		if (b.kind === 'table') return { ...b, rows: b.rows.map((row) => row.map(inside)) };
		return b;
	});
	return walk(blocks);
}
