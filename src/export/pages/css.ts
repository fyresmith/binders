import type { ManuscriptStyle } from '../docx-parts';
import type { BookStyle } from '../style';
import type { Geometry } from './geometry';

/* A style as the stylesheet of its pages: the same rules for the pages in the window and the pages that are
   printed, so one is the other. Every vertical measure is a whole number of lines (or half a line, twice), so the
   lines of facing pages stand at the same heights. Lengths are in points. Pure. */

const n = (v: number): string => `${Math.round(v * 100) / 100}pt`;
/** A string as CSS holds one. */
const str = (s: string): string => `"${s.replace(/[\\"]/g, '\\$&').replace(/\n/g, ' ')}"`;

/** What both kinds of page share: the page box, its text block, the notes at its foot, and the blocks a note can hold. */
function core(g: Geometry, o: { family: string; step: number; noteSize: number; noteLead: number; justified: boolean }): string[] {
	const last = o.justified ? 'justify' : 'start';
	return [
		`.page { width: ${n(g.width)}; height: ${n(g.height)}; box-sizing: border-box; position: relative; overflow: hidden; padding: ${n(g.top)} ${n(g.outside)} 0 ${n(g.inside)}; background: #fff; color: #000; font: ${n(g.size)}/${n(g.lead)} ${o.family}; font-kerning: normal; text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; overflow-wrap: break-word; }`,
		`.page.spine-right { padding-left: ${n(g.outside)}; padding-right: ${n(g.inside)}; }`,
		`.block { height: ${n(g.block)}; position: relative; }`,
		`.text { display: flow-root; text-align: ${o.justified ? 'justify' : 'start'}; hyphens: ${o.justified ? 'manual' : 'none'}; }`,
		'p, h1, h2, h3, h4, pre, table, figure { margin: 0; }',
		'p.first, p.cont, p.li, p.fig { text-indent: 0; }',
		`.cut { text-align-last: ${last}; }`,
		`.in1 { margin-inline-start: ${n(o.step)}; } .in2 { margin-inline-start: ${n(o.step * 2)}; } .in3 { margin-inline-start: ${n(o.step * 3)}; }`,
		`.q { margin-inline-end: ${n(o.step)}; }`,
		`.sp-a { margin-top: ${n(g.lead / 2)}; } .sp-b { margin-bottom: ${n(g.lead / 2)}; }`,
		'p.li { position: relative; }',
		`.mk { position: absolute; inset-inline-start: ${n(-o.step)}; width: ${n(o.step - g.size * 0.4)}; text-align: end; text-indent: 0; }`,
		`h2, h3, h4 { font-size: 1em; line-height: ${n(g.lead)}; padding-top: ${n(g.lead)}; text-align: start; hyphens: none; }`,
		'h3, h4 { font-style: italic; font-weight: 400; }',
		`pre { white-space: pre-wrap; font: ${n(g.size * 0.8)}/${n(g.lead)} "Courier New", "Courier Prime", Cousine, "Liberation Mono", monospace; text-align: start; }`,
		'code { font-family: "Courier New", "Courier Prime", Cousine, "Liberation Mono", monospace; font-size: 0.85em; }',
		`table { border-collapse: collapse; width: 100%; font-size: ${n(g.size * 0.88)}; text-align: start; hyphens: none; }`,
		`th, td { padding: ${n(g.lead * 0.12)} ${n(g.size * 0.4)}; border-bottom: 0.4pt solid #000; vertical-align: top; text-align: start; font-weight: 400; }`,
		'th { font-weight: 700; } .center { text-align: center; } .right { text-align: end; }',
		'p.fig { text-align: center; line-height: 0; }',
		'sup { font-size: 0.68em; line-height: 0; vertical-align: super; font-variant-numeric: lining-nums; padding-inline-start: 0.08em; }',
		`.notes { position: absolute; left: 0; right: 0; bottom: 0; font-size: ${n(o.noteSize)}; line-height: ${n(o.noteLead)}; text-align: ${o.justified ? 'justify' : 'start'}; hyphens: ${o.justified ? 'manual' : 'none'}; }`,
		`.notes.has { padding-top: ${n(o.noteLead)}; }`,
		`.notes.has::before { content: ""; display: block; width: ${n(Math.min(72, g.width * 0.12))}; border-top: 0.5pt solid #000; margin-bottom: ${n(o.noteLead / 2)}; }`,
		'.note p { text-indent: 0; } .note .n { font-variant-numeric: lining-nums; margin-inline-end: 0.5em; }',
		'.head, .folio { position: absolute; left: 0; right: 0; }',
		'[dir="rtl"] .page, .page[dir="rtl"] { direction: rtl; }',
	];
}

const LETTERING: Record<BookStyle['heading-lettering'], string> = {
	'small capitals': 'font-variant-caps: all-small-caps; letter-spacing: 0.18em;', capitals: 'text-transform: uppercase; letter-spacing: 0.12em;', italic: 'font-style: italic;', 'as typed': '',
};
const HSIZE: Record<BookStyle['heading-size'], number> = { small: 1, medium: 1.45, large: 2.6 };

/** A book style on its page. `family`: the typeface and what stands in for it (pages/fonts.ts). */
export function bookCss(s: BookStyle, g: Geometry, family: string): string {
	const left = s['heading-alignment'] === 'left', spaced = s.paragraphs === 'spaced', justified = s.alignment !== 'left', mark = s['scene-break'];
	const hs = HSIZE[s['heading-size']] ?? 1, hl = Math.ceil(g.size * hs * 1.2 / g.lead) * g.lead, small = Math.max(7.5, g.size - 2.5), fig = Math.max(8.5, g.size - 1.5);
	const noteSize = Math.max(7, g.size - 2.5), noteLead = Math.round(noteSize * 1.35 * 2) / 2, top = s['page-numbers'] === 'top outside';
	const rules = [
		...core(g, { family, step: g.lead * 1.4, noteSize, noteLead, justified }),
		'.page { font-variant-numeric: oldstyle-nums; }',
		`p { text-indent: ${spaced ? '0' : n(g.lead)}; }`,
		spaced ? `p + p { margin-top: ${n(g.lead / 2)}; } p + p.cont:first-child { margin-top: 0; }` : '',
		s['first-words'] === 'small capitals' ? '.lead { font-variant-caps: all-small-caps; letter-spacing: 0.06em; }' : '',
		`h1 { font-size: ${n(g.size * hs)}; line-height: ${n(hl)}; font-weight: 400; font-variant-numeric: lining-nums; ${LETTERING[s['heading-lettering']] ?? ''} text-align: ${left ? 'start' : 'center'}; hyphens: none; padding: ${n(g.sink)} 0 ${n((hs > 2 ? 2 : 3) * g.lead)}; }`,
		'h1 .hl { display: block; }',
		`h1 .hl1 { ${hs > 1.2 ? 'font-size: 0.62em; letter-spacing: 0; text-transform: none; font-variant-caps: normal; font-style: italic;' : ''} }`,
		`p.break { text-indent: 0; text-align: center; padding: ${n(mark ? g.lead : 0)} 0; height: ${n(g.lead)}; font-size: ${n(Math.max(6, g.size - 2))}; line-height: ${n(g.lead)}; box-sizing: content-box; word-spacing: 0.6em; }`,
		`.head { top: ${n(g.top - 27)}; padding: 0 ${n(g.outside)} 0 ${n(g.inside)}; font-size: ${n(small)}; line-height: 12pt; display: flex; gap: 1.6em; justify-content: center; align-items: baseline; }`,
		`.folio { top: ${n(g.top + g.block + 16)}; padding: 0 ${n(g.outside)} 0 ${n(g.inside)}; font-size: ${n(fig)}; line-height: 12pt; text-align: center; }`,
		`.spine-right :is(.head, .folio) { padding-left: ${n(g.outside)}; padding-right: ${n(g.inside)}; }`,
		'.head .t { font-variant-caps: all-small-caps; letter-spacing: 0.16em; }',
		`.head .n { font-size: ${n(fig)}; }`,
		top ? '.head.outside { justify-content: flex-start; flex-direction: row-reverse; } .spine-right .head.outside { flex-direction: row; }' : '',
		`.page.title-page .text, .page.part .text { text-align: ${left ? 'start' : 'center'}; hyphens: none; }`,
		`.page.title-page h1 { font-size: ${n(Math.max(22, g.size * 2.1))}; line-height: 1.25; letter-spacing: ${left ? '0' : '0.04em'}; font-variant-caps: normal; text-transform: none; font-style: normal; padding: ${n(Math.round(g.lines * 0.22) * g.lead)} 0 0; }`,
		`.page.title-page p { text-indent: 0; margin-top: ${n(g.lead)}; } .page.title-page p.subtitle { font-style: italic; }`,
		`.page.title-page p.author { margin-top: ${n(2 * g.lead)}; ${left ? '' : 'font-variant-caps: all-small-caps; letter-spacing: 0.16em;'} }`,
		`.page.part h1 { padding-top: ${n(Math.round(g.lines * 0.3) * g.lead)}; }`,
		`.page.copyright .text { position: absolute; left: 0; right: 0; bottom: 0; text-align: start; hyphens: none; font-size: ${n(noteSize)}; line-height: 12pt; }`,
		'.page.copyright p { text-indent: 0; margin-top: 6pt; }',
		`.page:is(.dedication, .epigraph) .text { text-align: center; font-style: italic; hyphens: none; padding-top: ${n(Math.round(g.lines * 0.22) * g.lead)}; }`,
		'.page:is(.dedication, .epigraph) p { text-indent: 0; } .page:is(.dedication, .epigraph) h1 { display: none; }',
		`p.toc { display: flex; gap: 1em; text-indent: 0; text-align: start; hyphens: none; } p.toc .n { margin-inline-start: auto; min-width: 2.2em; text-align: end; font-variant-numeric: lining-nums; }`,
		`p.toc.under { margin-inline-start: ${n(g.lead)}; } p.toc.top { margin-top: ${n(g.lead / 2)}; }`,
	];
	return `${rules.filter((r) => r).join('\n')}\n${s.css?.trim() ? `${s.css.trim()}\n` : ''}`;
}

/** A manuscript style on its page: standard manuscript format, as the Word file has it. */
export function manuscriptCss(s: ManuscriptStyle, g: Geometry): string {
	const family = s.typeface === 'Courier New' ? '"Courier New", "Courier Prime", Cousine, "Liberation Mono", monospace' : '"Times New Roman", Tinos, "Liberation Serif", Times, serif';
	return [
		...core(g, { family, step: 36, noteSize: 12, noteLead: g.lead, justified: false }),
		'p { text-indent: 36pt; }',
		s.italics === 'underlined' ? 'em { font-style: normal; text-decoration: underline; }' : '',
		`h1 { font-size: 1em; font-weight: 400; text-align: center; padding: ${n(g.sink)} 0 ${n(g.lead)}; }`,
		'h1 .hl { display: block; }',
		`p.break { text-indent: 0; text-align: center; }`,
		`.head { top: 36pt; padding: 0 72pt; line-height: 12pt; text-align: end; }`,
		'.folio { display: none; }',
		`.page.title-page .contact { display: flex; justify-content: space-between; line-height: 14pt; } .page.title-page p { text-indent: 0; }`,
		`.page.title-page h1 { text-transform: uppercase; padding: ${n(Math.round(g.lines * 0.36) * g.lead)} 0 0; }`,
		'.page.title-page p.by { text-align: center; }',
		`p.toc { display: flex; gap: 1em; text-indent: 0; } p.toc .n { margin-inline-start: auto; }`,
	].filter((r) => r).join('\n') + '\n';
}

/** The page's own size, for the printer: one box to a sheet, nothing asked of the browser's own paging. */
export const printCss = (g: Geometry): string => `@page { size: ${n(g.width)} ${n(g.height)}; margin: 0; }\nhtml, body { margin: 0; padding: 0; background: #fff; }\n.page { break-after: page; }\n`;

export { str as cssString };
