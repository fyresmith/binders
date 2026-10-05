import { inlines, type Block, type Inline } from './model';

/* Typed text set as a book has it: straight quotes curled for the book's language, two hyphens a dash, three full
   stops an ellipsis. Code is left as typed. Only these characters change: no word is added, dropped or moved. Pure. */

/** Opening and closing double quotes, then single ones, by language (its first two letters). English for the rest. */
const QUOTES: Record<string, readonly [string, string, string, string]> = {
	en: ['“', '”', '‘', '’'],
	de: ['„', '“', '‚', '‘'],
	fr: ['«\u00A0', '\u00A0»', '“', '”'],
};
/** Words English begins with an apostrophe, where a quote would open. */
const ELIDED = /^(?:\d0s|\d\d\b|tis\b|twas\b|twere\b|em\b|cause\b|til\b|round\b|n\b|bout\b)/i;
const opens = (before: string): boolean => before === '' || /[\s([{\u00A0—–-]|[“‘„‚«]/.test(before);

/** A stretch of text, typeset. `before` is the character it follows ("" at a paragraph's start). */
export function typeset(text: string, before = '', language = 'en'): string {
	const q = QUOTES[language.slice(0, 2).toLowerCase()] ?? QUOTES.en;
	let out = '', prev = before;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		let put = c;
		if (c === '.' && text.startsWith('...', i) && text[i + 3] !== '.' && prev !== '.') { put = '…'; i += 2; }
		else if (c === '-' && text[i + 1] === '-' && prev !== '-') { put = '—'; i += text[i + 2] === '-' && text[i + 3] !== '-' ? 2 : 1; }
		else if (c === '"') put = opens(prev) ? q[0] : q[1];
		else if (c === '\'') put = opens(prev) && !ELIDED.test(text.slice(i + 1)) ? q[2] : q[3];
		out += put;
		prev = put[put.length - 1];
	}
	return out;
}

/** Inline content typeset in place: what a quote follows is looked for across runs (an italic word in quotes). */
export function typesetRuns(runs: Inline[], language = 'en'): void {
	let before = '';
	for (const r of runs) {
		if (r.kind === 'br') { before = ''; continue; }
		if (r.kind !== 'text' || !r.text) continue;
		if (!r.code) r.text = typeset(r.text, before, language);
		before = r.text[r.text.length - 1];
	}
}

/** Every paragraph, heading, quotation, list and table of some blocks typeset in place. */
export function typesetBlocks(blocks: Block[], language = 'en'): void {
	for (const runs of inlines(blocks)) typesetRuns(runs, language);
}
