/* The fixed parts of a Word file in manuscript format: its styles, its numbering, its settings and the package's own
   small files, written by hand as text (a library for this is a quarter of the plugin's size). Word is strict about
   the order of the elements inside `w:pPr`, `w:rPr`, `w:style` and `w:sectPr`: keep it as it is here. Pure. */

/** How a manuscript is set: what the Style choice in the window names, and what its editor will change. */
export interface ManuscriptStyle {
	name: string;
	typeface: 'Times New Roman' | 'Courier New';
	lineSpacing: 'double' | 'one and a half' | 'single';
	italics: 'italic' | 'underlined';
	chapterStarts: 'a third of the way down' | 'at the top';
	/** The scene break's mark. */
	sceneBreak: string;
	header: 'Surname / TITLE / page' | 'page' | 'none';
	titlePage: boolean;
}

/** The three built in (docs/export.md, "Styles"). The first is what a manuscript starts as. */
export const MANUSCRIPT_STYLES: readonly ManuscriptStyle[] = [
	{ name: 'Standard manuscript', typeface: 'Times New Roman', lineSpacing: 'double', italics: 'italic', chapterStarts: 'a third of the way down', sceneBreak: '#', header: 'Surname / TITLE / page', titlePage: true },
	{ name: 'Standard manuscript, Courier', typeface: 'Courier New', lineSpacing: 'double', italics: 'underlined', chapterStarts: 'a third of the way down', sceneBreak: '#', header: 'Surname / TITLE / page', titlePage: true },
	{ name: 'Plain, for a typesetter', typeface: 'Times New Roman', lineSpacing: 'single', italics: 'italic', chapterStarts: 'at the top', sceneBreak: '***', header: 'none', titlePage: false },
];
export const manuscriptStyle = (name: unknown): ManuscriptStyle => MANUSCRIPT_STYLES.find((s) => s.name === name) ?? MANUSCRIPT_STYLES[0];

export const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
export const DRAWING = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
export const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Text made safe for XML: its three marks escaped, and the characters XML can't hold left out. */
export const esc = (s: string): string => s
	// eslint-disable-next-line no-control-regex -- control characters are what this takes out: XML 1.0 has no way to hold them
	.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
	.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
	.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LINE = { double: 480, 'one and a half': 360, single: 240 } as const;

export function stylesXml(s: ManuscriptStyle, language: string): string {
	const line = LINE[s.lineSpacing], spacing = `<w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="auto"/>`, single = '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>';
	const style = (id: string, name: string, ppr: string, rpr = '', next = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${next ? `<w:next w:val="${next}"/>` : ''}<w:qFormat/><w:pPr>${ppr}</w:pPr>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}</w:style>`;
	const flush = '<w:ind w:firstLine="0"/>', mono = '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:eastAsia="Courier New"/>';
	const heading = (n: number) => style(`Heading${n}`, `heading ${n}`, `<w:keepNext/><w:spacing w:before="${line}" w:after="0" w:line="${line}" w:lineRule="auto"/>${flush}<w:outlineLvl w:val="${n - 1}"/>`, n === 2 ? '<w:b/>' : n === 3 ? '<w:b/><w:i/>' : '<w:i/>', 'Normal');
	return `${XML}<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${s.typeface}" w:hAnsi="${s.typeface}" w:cs="${s.typeface}" w:eastAsia="${s.typeface}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="${esc(language)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${spacing}</w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl w:val="0"/>${spacing}<w:ind w:firstLine="720"/></w:pPr></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
${style('Heading1', 'heading 1', `<w:keepNext/><w:pageBreakBefore/><w:spacing w:before="${s.chapterStarts === 'at the top' ? 0 : 4320}" w:after="${line}" w:line="${line}" w:lineRule="auto"/>${flush}<w:jc w:val="center"/><w:outlineLvl w:val="0"/>`, '', 'Normal')}
${[2, 3, 4, 5, 6].map(heading).join('\n')}
${style('Title', 'Title', `<w:spacing w:before="4800" w:after="0" w:line="480" w:lineRule="auto"/>${flush}<w:jc w:val="center"/>`, '<w:caps/>', 'Byline')}
${style('Byline', 'Byline', `${flush}<w:jc w:val="center"/>`)}
${style('Contact', 'Contact', `${single}${flush}`)}
${style('SceneBreak', 'Scene Break', `<w:keepNext/>${flush}<w:jc w:val="center"/>`, '', 'Normal')}
${style('Quote', 'Quote', '<w:ind w:left="720" w:right="720" w:firstLine="0"/>')}
${style('ListParagraph', 'List Paragraph', '<w:ind w:left="720" w:firstLine="0"/>')}
${style('Code', 'Code', `${single}${flush}`, `${mono}<w:sz w:val="20"/><w:szCs w:val="20"/>`)}
${style('Figure', 'Figure', `${single}${flush}<w:jc w:val="center"/>`)}
${style('TableText', 'Table Text', `${single}${flush}`)}
${style('Header', 'header', `${single}${flush}<w:jc w:val="right"/>`)}
${style('FootnoteText', 'footnote text', `${spacing}${flush}`)}
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;
}

/** Lists: one pattern of bullets and one of numbers, nine levels each. Every list in the text is an instance of one
    of them (`nums`: which, and the number an ordered one starts at), so each starts its own count. */
export function numberingXml(nums: readonly { ordered: boolean; start: number; level: number }[]): string {
	const levels = (ordered: boolean) => Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${ordered ? 'decimal' : 'bullet'}"/><w:lvlText w:val="${ordered ? `%${i + 1}.` : '•'}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
	return `${XML}<w:numbering ${W}><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum><w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>${nums.map((n, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${n.ordered ? 2 : 1}"/>${n.ordered ? `<w:lvlOverride w:ilvl="${n.level}"><w:startOverride w:val="${n.start}"/></w:lvlOverride>` : ''}</w:num>`).join('')}</w:numbering>`;
}

export const settingsXml = (): string => `${XML}<w:settings ${W}><w:defaultTabStop w:val="720"/><w:footnotePr><w:footnote w:id="0"/><w:footnote w:id="1"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

/** A part's links to other parts and to the web. */
export interface Rel { id: string; type: 'styles' | 'settings' | 'numbering' | 'footnotes' | 'header' | 'image' | 'hyperlink'; target: string }
export const relsXml = (rels: readonly Rel[]): string => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((r) => `<Relationship Id="${r.id}" Type="${REL}/${r.type}" Target="${esc(r.target)}"${r.type === 'hyperlink' ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;

export const rootRels = (): string => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`;

export function contentTypes(o: { header: boolean; numbering: boolean; images: readonly string[] }): string {
	const main = 'application/vnd.openxmlformats-officedocument.wordprocessingml', part = (name: string, type: string) => `<Override PartName="/${name}" ContentType="${type}"/>`;
	const mime = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' } as Record<string, string>;
	return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${o.images.map((t) => `<Default Extension="${t}" ContentType="${mime[t]}"/>`).join('')}${part('word/document.xml', `${main}.document.main+xml`)}${part('word/styles.xml', `${main}.styles+xml`)}${part('word/settings.xml', `${main}.settings+xml`)}${part('word/footnotes.xml', `${main}.footnotes+xml`)}${o.numbering ? part('word/numbering.xml', `${main}.numbering+xml`) : ''}${o.header ? part('word/header1.xml', `${main}.header+xml`) : ''}${part('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml')}${part('docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml')}</Types>`;
}

export const coreXml = (title: string, author: string, language: string, when: Date): string => {
	const at = when.toISOString().replace(/\.\d+Z$/, 'Z');
	return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dc:language>${esc(language)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${at}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${at}</dcterms:modified></cp:coreProperties>`;
};
export const appXml = (): string => `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Binders</Application></Properties>`;
