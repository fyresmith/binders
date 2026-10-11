import { strToU8, zipSync } from 'fflate';

/* Word files written by hand, for the Word import's tests: XML strings zipped, deliberately not through `writeDocx`
   (that is the round trip's job, tests/import-roundtrip.test.ts). Each stands for one way a file can be written. They
   prove the reader's logic. They do not prove that Word writes what they imitate: docs/dev/import.md lists the files
   the maintainer needs to make for that. */

export const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const words = (n: number, seed: string): string => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';

/** A run of text, with the properties given as XML ("<w:b/>"). */
export const r = (text: string, props = ''): string => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
export interface PO { style?: string; jc?: string; pageBefore?: boolean; ppr?: string; props?: string; ind?: string; num?: [number, number] }
/** A paragraph of one run of text, or of the runs given. */
export const p = (content: string, o: PO = {}): string => {
	const ppr = `${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.pageBefore ? '<w:pageBreakBefore/>' : ''}${o.num ? `<w:numPr><w:ilvl w:val="${o.num[1]}"/><w:numId w:val="${o.num[0]}"/></w:numPr>` : ''}${o.ind ?? ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}${o.ppr ?? ''}`;
	return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${content.startsWith('<') ? content : r(content, o.props)}</w:p>`;
};
export const br = (page = false): string => `<w:r><w:br${page ? ' w:type="page"' : ''}/></w:r>`;

const style = (id: string, name: string, extra = '', based = 'Normal', type = 'paragraph'): string => `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>${based ? `<w:basedOn w:val="${based}"/>` : ''}${extra}</w:style>`;
export const STYLES = `${XML}<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[
	style('Heading1', 'heading 1', '<w:pPr><w:pageBreakBefore/><w:outlineLvl w:val="0"/></w:pPr>'),
	style('Heading2', 'heading 2', '<w:pPr><w:outlineLvl w:val="1"/></w:pPr>'),
	style('Heading3', 'heading 3', '<w:pPr><w:outlineLvl w:val="2"/></w:pPr>'),
	// a Word in another language: the id is its own, the name is the built-in's
	style('berschrift1', 'heading 1', '<w:pPr><w:outlineLvl w:val="0"/></w:pPr>'),
	style('Chapter', 'Chapter title', '<w:pPr><w:outlineLvl w:val="0"/></w:pPr>'),
	style('Title', 'Title', '<w:pPr><w:jc w:val="center"/></w:pPr>'),
	style('SceneBreak', 'Scene Break', '<w:pPr><w:jc w:val="center"/></w:pPr>'),
	style('Quote', 'Quote', '<w:pPr><w:ind w:left="720" w:right="720"/></w:pPr>'),
	style('TOC1', 'toc 1'),
	style('Emphasis', 'Emphasis', '<w:rPr><w:i/></w:rPr>', '', 'character'),
	style('Hyperlink', 'Hyperlink', '', '', 'character'),
].join('')}</w:styles>`;

export const NUMBERING = `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;

export interface Opts { styles?: string; footnotes?: string; endnotes?: string; comments?: string; numbering?: string; producer?: string; extra?: Record<string, string | Uint8Array>; rels?: string; mainPath?: string }
/** A .docx: the body (paragraphs, tables) in a package with the styles and parts given. */
export function docx(body: string, o: Opts = {}): Uint8Array {
	const main = o.mainPath ?? 'word/document.xml', dir = main.slice(0, main.lastIndexOf('/') + 1), file = main.slice(main.lastIndexOf('/') + 1);
	const parts: Record<string, string> = {
		'[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`,
		'_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/></Relationships>`,
		[main]: `${XML}<w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`,
		[`${dir}_rels/${file}.rels`]: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${o.numbering ?? NUMBERING ? '<Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : ''}${o.footnotes ? '<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' : ''}${o.comments ? '<Relationship Id="rIdC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>' : ''}${o.endnotes ? '<Relationship Id="rIdE" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>' : ''}<Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"/>${o.rels ?? ''}</Relationships>`,
		[`${dir}styles.xml`]: o.styles ?? STYLES,
		[`${dir}numbering.xml`]: o.numbering ?? NUMBERING,
		'docProps/app.xml': `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${o.producer ?? 'Test writer'}</Application></Properties>`,
	};
	if (o.footnotes) parts[`${dir}footnotes.xml`] = `${XML}<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${o.footnotes}</w:footnotes>`;
	if (o.endnotes) parts[`${dir}endnotes.xml`] = `${XML}<w:endnotes ${NS}>${o.endnotes}</w:endnotes>`;
	if (o.comments) parts[`${dir}comments.xml`] = `${XML}<w:comments ${NS}>${o.comments}</w:comments>`;
	const bytes: Record<string, Uint8Array> = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, strToU8(v)]));
	for (const [k, v] of Object.entries(o.extra ?? {})) bytes[k] = typeof v === 'string' ? strToU8(v) : v;
	return zipSync(bytes, { level: 0 });
}
export const comment = (id: number, author: string, text: string): string => `<w:comment w:id="${id}" w:author="${author}" w:date="2026-10-01T10:00:00Z"><w:p>${r(text)}</w:p></w:comment>`;
export const footnote = (id: number, text: string): string => `<w:footnote w:id="${id}"><w:p><w:r><w:footnoteRef/></w:r>${r(` ${text}`)}</w:p></w:footnote>`;
export const mark = (id: number): string => `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
export const ins = (inner: string, who = 'Ann', id = 1): string => `<w:ins w:id="${id}" w:author="${who}" w:date="2026-10-01T10:00:00Z">${inner}</w:ins>`;
export const del = (text: string, who = 'Ann', id = 2): string => `<w:del w:id="${id}" w:author="${who}" w:date="2026-10-01T10:00:00Z"><w:r><w:delText xml:space="preserve">${esc(text)}</w:delText></w:r></w:del>`;
