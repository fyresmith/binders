import { isMarker, readsAsTitle, unit, wordCount, type Unit } from './detect';
import { escapeMarkdown } from './markdown';

/* A Markdown or plain text file as units for the detector (detect.ts), and the text they were found in.
   The pieces of a manuscript are cut out of `Scan.text` by the units' offsets, so for Markdown they are the writer's
   own bytes: nothing is rewritten. Plain text is first made into Markdown that reads as it did (paragraphs with a
   blank line between, a hard-wrapped paragraph on one line, marks Markdown would take for markup escaped), and the
   units are found in that. Pure. */

/** The most characters a text may be: it is held whole while it is read and planned. */
export const MAX_CHARS = 64 * 1024 * 1024;

export interface Decoded { text: string; said: string[] }
export interface Scan {
	/** The text the units are in, and the pieces are cut from. */
	text: string;
	units: Unit[];
	said: string[];
	/** The text before the first unit: a note's properties, which are not part of the manuscript. */
	skipped: string;
	/** Pictures the text has by their mark (`PICTURE_MARK` and an index): their bytes are inflated when asked for. */
	pictures?: { ext: string; load(): Uint8Array | null }[];
}

/** A file's bytes as text: by its byte-order mark if it has one, else UTF-8, else Windows-1252 (and said). Line
    endings are made "\n": they are no part of the writing. */
export function decodeText(bytes: Uint8Array): Decoded {
	const said: string[] = [];
	let text: string;
	const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
	if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
	else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
	else {
		try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(bom)); } catch {
			text = new TextDecoder('windows-1252').decode(bytes);
			said.push('This file isn’t UTF-8, so its characters were read as Windows-1252, the usual Western set. If an accented letter looks wrong, save the file as UTF-8 and choose it again.');
		}
	}
	if (text.length > MAX_CHARS) throw new Error('This file is larger than import can hold (64 million characters).');
	const head = text.slice(0, 8000);
	// (a file of other things than text: a picture, a program, a Word file renamed)
	let odd = 0;
	for (let i = 0; i < head.length; i++) { const c = head.charCodeAt(i); if (c < 9 || (c > 13 && c < 32 && c !== 12) || c === 0xfffd) odd++; }
	if (odd > head.length / 100) throw new Error('This doesn’t look like a text file. For a Word file, wait for a later version of Binders, or save it as text first.');
	return { text: (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n'), said };
}

/** A line's words with the marks of emphasis around them taken off. */
const unmarked = (t: string): string => t.trim().replace(/^(\*\*|__)(.+)\1$/, '$2').replace(/^([*_])(.+)\1$/, '$2');
const isCaps = (t: string): boolean => /\p{L}/u.test(t) && t === t.toUpperCase() && t !== t.toLowerCase();
const bold = (t: string): boolean => /^(\*\*|__).+\1$/.test(t.trim());

/** The block of properties at the top of a note, which is the note's and not the manuscript's. */
function propertiesOf(text: string): string {
	return /^---[ \t]*\n(?:[\s\S]*?\n)?(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text)?.[0] ?? '';
}

/** Markdown (a note, a `.md` file) as units. Headings are ATX (`# Title`) outside code, comments and math; a mark
    between scenes counts only on a line of its own between blank ones (under a line of text it would be Markdown's
    other kind of heading); everything else is a paragraph, which ends at a blank line or at a heading. */
export function scanMarkdown(text: string): Scan {
	const skipped = propertiesOf(text), units: Unit[] = [];
	let at = skipped.length, blank = 0, para: { start: number; end: number; lines: string[]; gap: number } | null = null;
	const flush = () => {
		if (!para) return;
		const joined = para.lines.map((l) => l.trim()).join(' '), t = unmarked(joined);
		units.push(unit(t, { raw: joined, gap: para.gap, start: para.start, end: para.end, emphatic: bold(joined) || isCaps(t), words: wordCount(t) }));
		para = null;
	};
	const lines = text.slice(at).split('\n');
	let open: { close: RegExp; start: number; end: number; gap: number } | null = null;
	for (let k = 0; k < lines.length; k++) {
		const line = lines[k], start = at, end = at + line.length;
		at = end + 1;
		if (open) {
			open.end = end;
			if (open.close.test(line)) { units.push(unit('(code or comment)', { gap: open.gap, start: open.start, end: open.end, words: 0, empty: false })); open = null; blank = 0; }
			continue;
		}
		if (!line.trim()) { flush(); blank++; continue; }
		// an opaque block: its lines are neither headings nor text to read for titles (and say no words of their own)
		const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line), math = /^\s*\$\$\s*$/.test(line), comment = /^\s*%%/.test(line) && !/%%\s*$/.test(line.trim().slice(2)), html = /^\s*<!--/.test(line) && !/-->/.test(line);
		if (fence || math || comment || html) {
			flush();
			open = { close: fence ? new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`) : math ? /^\s*\$\$\s*$/ : comment ? /%%/ : /-->/, start, end, gap: blank };
			continue;
		}
		const h = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
		if (h && h[2].trim() && !/^#+$/.test(h[2].trim())) {
			flush();
			const t = h[2].trim();
			units.push(unit(t, { heading: h[1].length, gap: blank, start, end, emphatic: false }));
			blank = 0;
			continue;
		}
		const alone = (!para) && !(lines[k + 1] ?? '').trim();
		if (alone && isMarker(unit(line))) {
			units.push(unit(line.trim(), { gap: blank, start, end }));
			blank = 0;
			continue;
		}
		if (!para) para = { start, end, lines: [line], gap: blank };
		else { para.lines.push(line); para.end = end; }
		blank = 0;
	}
	flush();
	return { text, units, said: [], skipped };
}

interface Para { lines: string[]; gap: number; page: boolean; tab: boolean; lead: number }

/** Plain text as units, in Markdown made from it. `tabs`: "Start a paragraph with a tab" is on, so a paragraph
    that began with a tab keeps it. */
export function scanPlain(raw: string, o: { tabs: boolean }): Scan {
	const said: string[] = [];
	const paras: Para[] = [];
	let cur: Para | null = null, gap = 0, page = false;
	for (const line0 of raw.split('\n')) {
		// (a form feed is a page break in a text file; it is no character of the writing)
		const form = line0.includes('\f'), line = line0.replace(/\f/g, '').replace(/\s+$/, '');
		if (form) { cur = null; page = true; }
		if (!line.trim()) { cur = null; gap++; continue; }
		const lead = /^[ \t]*/.exec(line)?.[0] ?? '';
		if (!cur) { cur = { lines: [], gap, page, tab: lead.includes('\t'), lead: lead.replace(/\t/g, '    ').length }; paras.push(cur); gap = 0; page = false; }
		cur.lines.push(line.trim());
	}
	// hard-wrapped: most lines of a paragraph that goes on are close to the longest line there is
	const goes = paras.filter((p) => p.lines.length > 1).flatMap((p) => p.lines.slice(0, -1));
	const longest = Math.max(0, ...paras.filter((p) => p.lines.length > 1).flatMap((p) => p.lines.map((l) => l.length)));
	const wrapped = goes.length >= 2 && longest >= 40 && longest <= 120 && goes.filter((l) => l.length >= longest * 0.6).length >= goes.length * 0.8;
	let text = '';
	const units: Unit[] = [];
	if (paras.some((p) => p.tab) && !o.tabs) said.push('Paragraphs that began with a tab come in without it: “Start a paragraph with a tab” is off in Binders’ settings, and Obsidian would show a line that starts with a tab as code.');
	const emit = (lines: string[], p: Para, extra: Partial<Unit> = {}) => {
		const joined = wrapped ? lines.join(' ') : lines.join('\n');
		const flat = lines.join(' '), mark = unit(flat);
		const marked = isMarker(mark);
		// (a mark between scenes is a rule here: what was typed is not Markdown to be escaped)
		const body = marked ? '***' : escapeMarkdown(wrapped ? joined : joined.split('\n').join('  \n'));
		const lead = !marked && p.tab && o.tabs ? '\t' : '';
		if (text) text += '\n\n';
		const start = text.length;
		text += lead + body;
		units.push(unit(flat, { gap: p.gap, pageBefore: p.page, centered: p.lines.length === 1 && p.lead >= 6, emphatic: isCaps(flat), start, end: text.length, marker: false, ...extra }));
	};
	for (const p of paras) {
		// a title with its text under it and no blank line between: the title is its own paragraph
		if (p.lines.length > 1 && readsAsTitle(p.lines[0])) {
			emit([p.lines[0]], p);
			emit(p.lines.slice(1), { ...p, gap: 0, page: false, tab: false });
		} else emit(p.lines, p);
	}
	text += '\n';
	return { text, units, said, skipped: '' };
}
