import { tabLines } from '../../paragraphs/text';
import { CODE, lf } from '../../scene-text';
import { parseBody, type Parsed } from '../markdown';

/* A note's text read for a Scrivener project. It is the reader every export uses (markdown.ts), with two things a
   book has no use for and a project does kept through it, as marks in the text no writer types:
     - a comment (`%%…%%`) is not left out: Scrivener has inline annotations, and a comment is one;
     - a paragraph begun with a tab is known as one: it arrives with a first-line indent (never a tab), the others
       flush left with space after them.
   Pure. */

/** Where a comment starts and ends, and the start of a paragraph that was begun with a tab. */
export const NOTE_OPEN = '', NOTE_CLOSE = '', TABBED = '';
const MARKS = /[-]/g;
/** Text without the marks: what is counted, and what is shown. */
export const unmarked = (s: string): string => s.replace(MARKS, '');

export function readText(body: string): Parsed {
	const lines = lf(body).replace(MARKS, '').split('\n');
	for (const i of tabLines(lines.join('\n'))) lines[i] = TABBED + lines[i].replace(/^[ \t]+/, '');
	// a comment is kept, on one line (it may be written over several): its words are the writer's. An HTML comment is
	// left out, as everywhere. Code is left alone.
	const text = lines.join('\n').replace(new RegExp(`${CODE}|%%([\\s\\S]*?)%%`, 'gm'), (m: string, _f: string | undefined, _t: string | undefined, said: string | undefined) => {
		if (said === undefined) return m;
		const words = said.replace(/[]/g, '').replace(/\s+/g, ' ').trim();
		return words ? `${NOTE_OPEN}${words}${NOTE_CLOSE}` : '';
	});
	// An escaped dollar sign is a dollar, not the start of math: it is written as its character reference, which the
	// Markdown reader takes for the dollar sign, so a pair of them is never read as an equation. Code is left alone.
	// A block id (`^id` at a line's end) is kept as typed: Scrivener has it as text, and import makes it a block id again.
	return parseBody(text.replace(new RegExp(`${CODE}|\\\\[\\\\$]`, 'gm'), (m) => (m === '\\$' ? '&#36;' : m)), { blockIds: true });
}
