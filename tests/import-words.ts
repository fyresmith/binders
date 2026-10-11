import { strFromU8, unzipSync } from 'fflate';
import { tokens, type Words } from './export-words';

/* The Word import's word-for-word oracle: the words of any .docx, read by regular expressions that share no code with
   the importer's reader (src/docx/). In document order: every `w:t`, a revision that was deleted left out (`w:del`
   and `w:moveFrom`; their text is `w:delText` anyway), field instructions left out, the second copy of a text box
   (`mc:Fallback`) left out, and each footnote's words held apart, in the order of their marks. */

const unxml = (s: string): string => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
const settled = (xml: string): string => xml
	.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
	.replace(/<w:(del|moveFrom)\b[^>]*>[\s\S]*?<\/w:\1>/g, '')
	.replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, '');
/** The text of some XML with each note mark as `\uE000id\uE001`. */
const flat = (xml: string, mark: string): string => [...settled(xml).matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(footnote|endnote)Reference w:id="(\d+)"\/>|<w:(?:br|tab)\b[^>]*\/>|<\/w:p>/g)].map((m) => (m[1] !== undefined ? unxml(m[1]) : m[2] ? `\uE000${m[2] === 'endnote' ? `e${m[3]}` : m[3]}\uE001` : ' ')).join('').replace(mark, '');

export function docxWords(bytes: Uint8Array): Words {
	const raw = unzipSync(bytes), read = (name: string) => (raw[name] ? strFromU8(raw[name]) : '');
	const text = flat(read('word/document.xml'), '');
	const notes = new Map<string, string>();
	for (const [file, key] of [['footnotes', 'footnote'], ['endnotes', 'endnote']] as const) {
		for (const m of read(`word/${file}.xml`).matchAll(new RegExp(`<w:${key} (?:w:type="(\\w+)" )?w:id="(\\d+)">([\\s\\S]*?)</w:${key}>`, 'g'))) {
			if (m[1] === 'separator' || m[1] === 'continuationSeparator') continue;
			notes.set(key === 'endnote' ? `e${m[2]}` : m[2], flat(m[3], ''));
		}
	}
	const body: string[] = [], out: string[] = [], seen = new Set<string>();
	for (const piece of text.split(/(\uE000[^\uE001]*\uE001)/)) {
		const m = /^\uE000([^\uE001]*)\uE001$/.exec(piece);
		if (!m) { for (const w of tokens(piece)) body.push(w); continue; }
		if (!seen.has(m[1])) { seen.add(m[1]); for (const w of tokens(notes.get(m[1]) ?? '')) out.push(w); }
	}
	return { body, notes: out };
}

import { noteWords } from './export-scriv-words';
import type { ImportPlan } from '../src/import/plan';

/** What a plan holds, in the binder's order: each row's heading (the words it was named from), then its text, with
    the footnotes' words held apart in the order of their marks. */
export function plannedWords(plan: ImportPlan): Words {
	const body: string[] = [], notes: string[] = [];
	for (const n of plan.notes.slice(1)) {
		if (n.heading) for (const w of tokens(n.heading)) body.push(w);
		const text = n.heading && n.body.startsWith(`# ${n.heading}\n\n`) ? n.body.slice(n.heading.length + 4) : n.body;
		const w = noteWords(text);
		for (const x of w.body) body.push(x);
		for (const x of w.notes) notes.push(x);
	}
	return { body, notes };
}
