import { unzipSync, strFromU8 } from 'fflate';
import { lf, parts, stripComments } from '../src/scene-text';
import { assignRoles, type SourceItem } from '../src/export/roles';
import type { Structure } from '../src/export/model';

/* The word-for-word test's two readers, for the unit tests. One reads the words out of a .docx; the other reads the
   words that went in, straight from the notes' Markdown, with rules of its own (a few lines of patterns, not the
   parser export uses). An export is right when the two agree: no word dropped, repeated or out of order. */

/** A text's words: runs of letters and digits. Marks, spaces and typeset quotes and dashes are no part of them. */
export const tokens = (text: string): string[] => text.normalize('NFC').match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];

export interface Words { body: string[]; notes: string[] }

const unxml = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** The text Word shows for a paragraph's XML: its runs joined as they stand, a tab or a line break a space. A
    footnote's mark written as its number isn't the writer's word. */
const shown = (p: string): string => [...p.replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:rStyle w:val="FootnoteReference"\/>[\s\S]*?<\/w:r>/g, '').matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:(tab|br)\/>/g)].map((m) => (m[1] !== undefined ? unxml(m[1]) : ' ')).join('');
const paragraphs = (xml: string): { style: string; text: string }[] => [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map((m) => ({ style: /<w:pStyle w:val="([^"]+)"/.exec(m[0])?.[1] ?? '', text: shown(m[0]) }));

/** A .docx, read back: its parts, the words of its text (without the pages and headings export makes: the title
    page, each section's heading, the scene-break marks) and of its footnotes, and its headings as text. */
export function readDocx(bytes: Uint8Array): Words & { files: Record<string, string>; headings: string[]; raw: Record<string, Uint8Array> } {
	const raw = unzipSync(bytes), files: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw)) if (/\.(xml|rels)$/.test(k)) files[k] = strFromU8(v);
	const made = new Set(['Title', 'Byline', 'Contact', 'Heading1', 'SceneBreak']);
	const all = paragraphs(files['word/document.xml'] ?? '');
	const notes = [...(files['word/footnotes.xml'] ?? '').matchAll(/<w:footnote w:id="(\d+)">([\s\S]*?)<\/w:footnote>/g)].flatMap((m) => paragraphs(m[2]).flatMap((p) => tokens(p.text)));
	return { files, raw, headings: all.filter((p) => p.style === 'Heading1').map((p) => p.text), body: all.filter((p) => !made.has(p.style)).flatMap((p) => tokens(p.text)), notes };
}

/** What a note embeds, for the oracle: a note's text, or nothing (a picture, a missing file). */
export type Embedded = (target: string) => string | null;

const MARK = /\[\^([^\]\s]+)\]|\^\[((?:[^[\]\n]|\[[^[\]\n]*\])+)\]/g;

/** A note's text as plain words in reading order, with each footnote's text held apart at its mark. */
function plainText(body: string, embedded: Embedded, pool: string[], depth = 0): string {
	let s = stripComments(lf(body)).replace(/[]/g, '');
	// footnotes written out under the text: taken away, and kept by their label
	const defs = new Map<string, string>();
	s = s.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.*(?:\n(?: {4}|\t).*)*)/gm, (_m, id: string, text: string) => { if (!defs.has(id)) defs.set(id, text); return ''; });
	// what is embedded: a note's text in its place (one level deep), anything else gone
	s = s.replace(/!\[\[([^\]\n]+?)\]\]/g, (_m, target: string) => { const t = depth ? null : embedded(target.split(/\\?\|/)[0].trim()); return t == null ? '' : `\n\n${plainText(parts(t).body, embedded, pool, 1)}\n\n`; });
	s = s.replace(/\[\[([^\]\n]+?)\]\]/g, (_m, link: string) => { const at = link.search(/\\?\|/); return at < 0 ? link.replace(/#/g, ' ') : link.slice(at).replace(/^\\?\|/, ''); });
	// a footnote inside a footnote is set in its place
	const inner = (text: string, seen: string[]): string => text.replace(MARK, (m, id: string | undefined, typed: string | undefined) => (typed !== undefined ? ` ${inner(typed, seen)} ` : defs.has(id) && !seen.includes(id) ? ` ${inner(defs.get(id), [...seen, id])} ` : m));
	const first = new Map<string, number>();
	s = s.replace(MARK, (m, id: string | undefined, typed: string | undefined) => {
		if (typed !== undefined) return `${pool.push(inner(typed, [])) - 1}`;
		if (!defs.has(id)) return m;
		// (a second mark of the same footnote is the same footnote: its words are there once)
		if (first.has(id)) return '';
		first.set(id, pool.push(inner(defs.get(id), [id])) - 1);
		return `${first.get(id)}`;
	});
	return s;
}

/** Markdown's own marks taken off a text, as far as words go. */
function unmark(s: string): string {
	return s
		.replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, '')                       // a fence, and the language it names
		.replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '')                       // a picture: its alt text is no word on the page
		.replace(/\]\([^)\n]*\)/g, ']')                                // a link is its words
		.replace(/^ {0,3}\[[^\]\n]+\]:[ \t]+\S.*$/gm, '')              // a link's definition
		.replace(/<([a-z][\w+.-]*:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/gi, '$1') // an address between angle brackets is itself
		.replace(/<\/?[a-zA-Z][^>\n]*>/g, ' ')                         // HTML: its text stays
		.replace(/^[ \t]*(?:#(?=[^\s#]*[^\d\s#])[\p{L}\p{N}_/-]+[ \t]*)+$/gmu, '') // a line of tags
		.replace(/(^|[ \t])\^[A-Za-z0-9-]+[ \t]*$/gm, '')              // a block's id
		.replace(/^[ \t>]*\[![\w-]+\][+-]?/gm, '')                     // a callout's kind
		.replace(/^([ \t>]*(?:[-*+][ \t]+)?)\d{1,9}[.)](?=[ \t]|$)/gm, '$1') // a list's number is Word's to give
		.replace(/^[ \t>]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm, '') // a table's rule
		.replace(/\*+|~~|`+/g, '');
}

/** The words that go into an export of these items under this structure, and the words of its footnotes in the
    order of their marks. Front and back matter are in only when `matter` says so. */
export function sourceWords(items: readonly SourceItem[], structure: Structure, embedded: Embedded = () => null, matter = false): Words {
	const body: string[] = [], pool: string[] = [], order: number[] = [];
	for (const p of assignRoles(items, structure).placed) {
		if (p.item.kind !== 'note' || p.role === 'out' || p.role === 'group' || (!matter && (p.role === 'front' || p.role === 'back'))) continue;
		let text = unmark(plainText(p.item.text ?? '', embedded, pool));
		// a level-one heading at the top of a note that opens a section is its title: a heading export makes
		if (p.role !== 'scene') text = text.replace(/^\s*# +[^\n]*\S[^\n]*(\n|$)/, '');
		for (const piece of text.split(/(\d+)/)) {
			const m = /^(\d+)$/.exec(piece);
			if (m) order.push(Number(m[1])); else body.push(...tokens(piece));
		}
	}
	const notes: string[] = [];
	for (const n of order) for (const piece of unmark(pool[n]).split(/\d+/)) notes.push(...tokens(piece));
	return { body, notes };
}

/** Where two lists of words first differ, with the words around it; null when they are the same. */
export function firstDifference(want: readonly string[], got: readonly string[]): string | null {
	let i = 0;
	while (i < want.length && i < got.length && want[i] === got[i]) i++;
	if (i === want.length && i === got.length) return null;
	return `at word ${i} of ${want.length} (got ${got.length}): wanted “${want.slice(Math.max(0, i - 3), i + 4).join(' ')}”, got “${got.slice(Math.max(0, i - 3), i + 4).join(' ')}”`;
}
