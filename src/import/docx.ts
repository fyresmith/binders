import { readDocx } from '../docx/read';
import { settle } from '../docx/settle';
import { isMarker, unit, wordCount, type Unit } from './detect';
import type { Para, SourceDoc } from './doc';
import type { ManuscriptRead } from './manuscript';
import { runsToMarkdown } from './markdown';

/* A Word file as the text the manuscript import cuts: its paragraphs written as Markdown, one after another with a
   blank line between (list items under one another), and a unit for each paragraph in the detector's terms (a
   heading by its style's name or outline level, a page break, centered, bold or capital, a scene break by its style).
   The pieces of a chapter are then slices of this text, as they are for a Markdown note, so detect.ts and
   manuscript.ts are the same for both. What a paragraph's words are is unchanged: only marks are added.
     - footnotes come in place, as `^[...]` (Obsidian's own), so no note is left at a foot;
     - a first-line tab the writer typed is kept when "Start a paragraph with a tab" is on, and dropped, said, if not;
       a file Binders made reads its first-line indent back as that tab;
     - a style's indent is layout and is dropped, so is every font, size and color;
     - a line break in a chapter's heading ("Chapter One", then its title) is " - ", which export reads back. */

const isCaps = (t: string): boolean => /\p{L}/u.test(t) && t === t.toUpperCase() && t !== t.toLowerCase();
const QUOTES = new Set(['quote', 'block text', 'intense quote', 'block quotation']);

/** A paragraph's level as a heading, from its style's name or its outline level; the title styles are no heading. */
function headingLevel(p: Para): number | null {
	if (p.toc || p.style === 'title' || p.style === 'subtitle') return null;
	const m = /^heading (\d)$/.exec(p.style);
	if (m) return Number(m[1]);
	return p.outline !== null && !/^toc /.test(p.style) ? p.outline + 1 : null;
}

/** A word processor's document as a Markdown text and the units found in it. */
export function docToScan(doc: SourceDoc, o: { tabs: boolean }): ManuscriptRead['scan'] {
	const said = [...doc.said];
	let text = '', empties = 0, page = false, tabbed = false, prevList = false;
	const units: Unit[] = [];
	const md = (p: Para, heading: boolean, nested = false): string => runsToMarkdown(p.runs.map((r, i, all) => (heading && r.kind === 'br' ? { kind: 'text' as const, text: i > 0 && i < all.length - 1 ? ' - ' : '', b: false, i: false, s: false } : r)), (n) => doc.notes[n].map((q) => md(q, false, true)).filter(Boolean).join(' '), nested);
	const plain = (p: Para, heading: boolean): string => p.runs.map((r, i, all) => (r.kind === 'text' ? r.text : r.kind === 'br' ? (heading && i > 0 && i < all.length - 1 ? ' - ' : ' ') : '')).join('').replace(/\s+/g, ' ').trim();
	for (const p of doc.paras) {
		const level = headingLevel(p), t = plain(p, level !== null), has = p.runs.some((r) => r.kind === 'note' || (r.kind === 'text' && r.text.trim()));
		if (!has) { empties++; page ||= p.pageBefore; continue; }
		const title = p.style === 'title' || p.style === 'subtitle';
		let body = md(p, level !== null);
		let marker = p.style === 'scene break' || p.style === 'scenebreak';
		if (!marker && !level && isMarker(unit(t))) marker = true;
		const list = !!p.list && level === null && !marker;
		let lead = '';
		if (level !== null) lead = `${'#'.repeat(Math.min(6, level))} `;
		else if (marker) { lead = ''; body = '***'; }
		else if (QUOTES.has(p.style) || (p.indent.left >= 720 && p.indent.right >= 720)) lead = '> ';
		else if (list) lead = `${'  '.repeat(Math.min(p.list?.level ?? 0, 8))}${p.list?.ordered ? '1. ' : '- '}`;
		else {
			// a file Binders made sets every paragraph's first line in: that is the tab a writer typed
			const set = doc.producer === 'Binders' && p.style === 'normal' && p.indent.first > 0;
			if (p.leadTab || set) { tabbed = true; if (o.tabs) lead = '\t'; }
		}
		text += text ? (list && prevList ? '\n' : '\n\n') : '';
		const start = text.length;
		text += lead + body;
		prevList = list;
		const caps = isCaps(t);
		const bold = p.runs.every((r) => r.kind !== 'text' || !r.text.trim() || r.b);
		units.push(unit(t, {
			heading: level, raw: level !== null ? body : undefined, pageBefore: p.pageBefore || page, centered: p.align === 'center', emphatic: (bold && wordCount(t) > 0) || caps,
			marker, gap: 1 + empties, toc: p.toc, start, end: text.length, words: marker ? 0 : wordCount(t),
		}));
		void title;
		empties = 0;
		page = false;
	}
	if (tabbed && !o.tabs) said.push('Paragraphs that began with a tab come in without it: “Start a paragraph with a tab” is off in Binders’ settings, and Obsidian would show a line that starts with a tab as code.');
	return { text: text + '\n', units, said, skipped: '' };
}

/** A Word file, read: its text and units, ready for `planManuscript`. `origin`: the bytes (a file from the device) or the
    note's path (a file already in the vault). */
export function readWord(bytes: Uint8Array, file: string, origin: ManuscriptRead['origin'], o: { tabs: boolean }): ManuscriptRead {
	const doc = settle(readDocx(bytes), 'final');
	if (!doc.paras.some((p) => p.runs.some((r) => r.kind === 'text' && r.text.trim()))) throw new Error('This Word file has no text in it.');
	return { name: file.replace(/\.[^.]+$/, '') || file, file, origin, scan: docToScan(doc, o) };
}
