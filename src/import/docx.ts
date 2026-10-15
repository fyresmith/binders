import { readDocx, type DocxFile } from '../docx/read';
import { readRtfDocument } from './rtf-doc';
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
     - a comment in the margin is `%%Name: text%%` at the end of the words it is on (not in a heading, which is a name);
     - a PNG or JPEG is a mark in the text, `![[binders-import-picture-N]]`, that the plan puts where the file will be;
     - a first-line tab the writer typed is kept when "Start a paragraph with a tab" is on, and dropped, said, if not;
       a file Binders made reads its first-line indent back as that tab;
     - a style's indent is layout and is dropped, so is every font, size and color;
     - a line break in a chapter's heading ("Chapter One", then its title) is " - ", which export reads back;
     - a heading the file numbers, with no text of its own, is a heading with no text: named by its place. */

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
	let text = '', empties = 0, page = false, tabbed = false, prevList = false, headingNotes = 0;
	const units: Unit[] = [];
	// The size most of the book is set in, by its letters: a short line set larger is a sign of a heading, as bold is
	// (never a heading by itself). Only when the file says what sizes its text is in.
	const sizes = new Map<number, number>();
	for (const p of doc.paras) if (p.size) sizes.set(p.size, (sizes.get(p.size) ?? 0) + p.runs.reduce((n, r) => n + (r.kind === 'text' ? r.text.length : 0), 0));
	const body = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	const large = (p: Para): boolean => !!body && !!p.size && p.size >= body * 1.2 && p.size - body >= 4;
	/** A paragraph's runs, for a heading with its breaks as " - " and without what isn't a name (a comment, a picture). */
	const runsOf = (p: Para, heading: boolean) => p.runs.filter((r) => !heading || (r.kind !== 'comment' && r.kind !== 'picture')).map((r, i, all) => (heading && r.kind === 'br' ? { kind: 'text' as const, text: i > 0 && i < all.length - 1 ? ' - ' : '', b: false, i: false, s: false } : r));
	const md = (p: Para, heading: boolean, nested = false): string => runsToMarkdown(runsOf(p, heading), (n) => doc.notes[n].map((q) => md(q, false, true)).filter(Boolean).join(' '), nested);
	const plain = (p: Para, heading: boolean): string => p.runs.map((r, i, all) => (r.kind === 'text' ? r.text : r.kind === 'br' ? (heading && i > 0 && i < all.length - 1 ? ' - ' : ' ') : '')).join('').replace(/\s+/g, ' ').trim();
	for (const p of doc.paras) {
		const level = headingLevel(p), t = plain(p, level !== null);
		const has = p.runs.some((r) => r.kind === 'note' || r.kind === 'picture' || (r.kind === 'text' && r.text.trim()));
		// (a heading the file numbers is a chapter's start with no words of its own)
		const numbered = level !== null && !has && p.numbered;
		if (!has && !numbered) { empties++; page ||= p.pageBefore; continue; }
		if (level !== null && p.runs.some((r) => r.kind === 'comment' || r.kind === 'picture')) headingNotes++;
		let body = md(p, level !== null);
		let marker = p.style === 'scene break' || p.style === 'scenebreak';
		if (!marker && level === null && t && isMarker(unit(t))) marker = true;
		const list = !!p.list && level === null && !marker;
		let lead = '';
		if (level !== null) lead = body ? `${'#'.repeat(Math.min(6, level))} ` : '';
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
			heading: level, raw: level !== null ? body : undefined, pageBefore: p.pageBefore || page, centered: p.align === 'center', emphatic: ((bold || large(p)) && wordCount(t) > 0) || caps,
			marker, gap: 1 + empties, toc: p.toc, start, end: text.length, words: marker ? 0 : wordCount(t), empty: false,
		}));
		empties = 0;
		page = false;
	}
	if (headingNotes) said.push('A comment or picture in a heading isn’t brought in: a heading is a name.');
	if (tabbed && !o.tabs) said.push('Paragraphs that began with a tab come in without it: “Start a paragraph with a tab” is off in Binders’ settings, and Obsidian would show a line that starts with a tab as code.');
	return { text: text + '\n', units, said, skipped: '', pictures: doc.pictures };
}

/** What the writer chooses about a Word file, and what it is read with. */
export interface WordOptions {
	tabs: boolean;
	/** Tracked changes: accepted ('final'), or rejected ('original'). */
	revisions: 'final' | 'original';
	comments: boolean;
	/** Underlined text in a file that has italics too. */
	underline: 'plain' | 'italic';
}

/** A Word file already opened, read with these choices: its text and units, ready for `planManuscript`. `origin`: the bytes (a
    file from the device) or the file's path (one already in the vault). It can be read again with other choices. */
export function wordRead(file: DocxFile, name: string, origin: ManuscriptRead['origin'], o: WordOptions): ManuscriptRead {
	const doc = settle(file, o.revisions, { underline: o.underline, comments: o.comments });
	if (!doc.paras.some((p) => p.runs.some((r) => r.kind === 'text' && r.text.trim()))) { const kind = documentKind(name); throw new Error(`This ${kind === 'rtf' ? 'rich text' : 'Word'} file has no text in it.`); }
	const f = doc.found;
	return {
		name: name.replace(/\.[^.]+$/, '') || name, file: name, origin, scan: docToScan(doc, o),
		word: { revisions: f.revisions, comments: f.comments, hasUnderline: f.hasUnderline, hasItalic: f.hasItalic },
		reread: (choices) => wordRead(file, name, origin, { ...o, ...choices }),
	};
}

/** The word processors' files import reads, by their names: Word and rich text. */
export const DOCUMENT = /\.(docx|docm|dotx|rtf)$/i;
/** What the file is, by its name and, for rich text, its first bytes too (a `.doc` that is really rich text). */
export function documentKind(name: string, bytes?: Uint8Array): 'word' | 'rtf' | null {
	if (/\.rtf$/i.test(name) || (bytes && bytes[0] === 0x7b && bytes[1] === 0x5c && bytes[2] === 0x72 && bytes[3] === 0x74 && bytes[4] === 0x66)) return 'rtf';
	return /\.(docx|docm|dotx)$/i.test(name) ? 'word' : null;
}

/** A Word or rich text file, read: each into the same document, so what comes after is one. */
export function readDocument(bytes: Uint8Array, file: string, origin: ManuscriptRead['origin'], o: { tabs: boolean } & Partial<WordOptions>): ManuscriptRead {
	const doc = documentKind(file, bytes) === 'rtf' ? readRtfDocument(bytes) : readDocx(bytes);
	return wordRead(doc, file, origin, { revisions: 'final', comments: true, underline: 'plain', ...o });
}

/** A Word file, read. */
export function readWord(bytes: Uint8Array, file: string, origin: ManuscriptRead['origin'], o: { tabs: boolean } & Partial<WordOptions>): ManuscriptRead {
	return wordRead(readDocx(bytes), file, origin, { revisions: 'final', comments: true, underline: 'plain', ...o });
}
