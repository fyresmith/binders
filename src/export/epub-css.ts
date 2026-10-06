import type { BookStyle } from './style';

/* A book style as an ebook's stylesheet. An ebook's style is its shape: how a chapter opens, what a scene break is,
   whether paragraphs are indented, how the first words are set. The typeface, the size, the colours, the margins
   and whether lines are justified are the reader's own (and Kindle strips them if a book forces them), so none of
   them is here: the style's values for those are for the pages. Pure. */

const LETTERING: Record<BookStyle['heading-lettering'], string> = {
	'small capitals': 'text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.95em;',
	capitals: 'text-transform: uppercase; letter-spacing: 0.12em;',
	italic: 'font-style: italic;',
	'as typed': '',
};
const SIZE: Record<BookStyle['heading-size'], number> = { small: 1.1, medium: 1.5, large: 2.2 };

export function ebookCss(s: BookStyle): string {
	const left = s['heading-alignment'] === 'left', spaced = s.paragraphs === 'spaced', mark = s['scene-break'], big = s['heading-size'] !== 'small';
	const above = Math.max(1.2, s['space-above'] / 7).toFixed(1);
	const rules = [
		`/* Binders, “${s.name.replace(/\*\//g, '')}” as an ebook: the reader keeps its own typeface, size, colours and margins. */`,
		'@namespace epub "http://www.idpf.org/2007/ops";',
		`p { margin: 0; text-indent: ${spaced ? '0' : '1.4em'}; widows: 2; orphans: 2; }`,
		spaced ? 'p + p { margin-top: 0.7em; }' : '',
		'p.first { text-indent: 0; }',
		s['first-words'] === 'small capitals' ? '.lead { text-transform: uppercase; font-size: 0.82em; letter-spacing: 0.06em; }' : '',
		`h1 { font-size: ${SIZE[s['heading-size']]}em; font-weight: normal; text-align: ${left ? 'start' : 'center'}; ${LETTERING[s['heading-lettering']]} margin: ${above}em 0 ${big ? 1.4 : 2.2}em; page-break-after: avoid; break-after: avoid; }`,
		'h1 .hl { display: block; }',
		`h1 .hl1 { margin-top: 0.5em;${big ? ' font-size: 0.62em; font-style: italic; letter-spacing: 0; text-transform: none;' : ''} }`,
		'h2, h3, h4 { font-size: 1em; margin: 1.4em 0 0.6em; page-break-after: avoid; break-after: avoid; }',
		'h3, h4 { font-style: italic; font-weight: normal; }',
		`p.break { text-indent: 0; text-align: center; margin: ${mark ? '1.1em' : '0.6em'} 0; page-break-after: avoid; break-after: avoid; }`,
		'section.part h1 { margin-top: 30%; }',
		'blockquote { margin: 1em 1.4em; }',
		'blockquote p, li p, td p { text-indent: 0; }',
		'ul, ol { margin: 0.8em 0; padding-inline-start: 1.6em; }',
		'pre { white-space: pre-wrap; font-size: 0.85em; margin: 1em 0; }',
		'code { font-family: monospace; }',
		'table { border-collapse: collapse; margin: 1em auto; }',
		'th, td { padding: 0.2em 0.6em; border-bottom: 1px solid; text-align: start; vertical-align: top; }',
		'th.center, td.center { text-align: center; }',
		'th.right, td.right { text-align: end; }',
		'figure { margin: 1em 0; text-align: center; }',
		'img { max-width: 100%; height: auto; }',
		'a.noteref { font-size: 0.75em; vertical-align: super; line-height: 0; text-decoration: none; }',
		'section.notes { margin-top: 2.5em; font-size: 0.9em; }',
		'section.notes p { text-indent: 0; margin-bottom: 0.5em; }',
		`.titlepage { text-align: ${left ? 'start' : 'center'}; }`,
		`.titlepage h1 { font-size: 1.9em; letter-spacing: ${left ? '0' : '0.06em'}; margin: 22% 0 0.9em; text-transform: none; font-style: normal; }`,
		`.titlepage p { text-indent: 0; margin-bottom: 0.9em; }`,
		`.titlepage p.subtitle { font-style: italic; }`,
		`.titlepage p.author { margin-top: 2.5em;${left ? '' : ' letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.9em;'} }`,
		'section.copyright p { text-indent: 0; font-size: 0.85em; margin-bottom: 0.8em; }',
		'section.dedication, section.epigraph { text-align: center; font-style: italic; }',
		'section.dedication p, section.epigraph p { text-indent: 0; }',
		'nav#toc ol { list-style: none; margin: 0; padding: 0; }',
		'nav#toc ol ol { padding-inline-start: 1.4em; }',
		'nav#toc li { margin: 0.5em 0; }',
		'nav#toc a { text-decoration: none; }',
	];
	return `${rules.filter((r) => r).join('\n')}\n${s.css?.trim() ? `${s.css.trim()}\n` : ''}`;
}
