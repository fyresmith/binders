import { tokens, type Words } from './export-words';

/* The word-for-word test's two readers for the Scrivener project, for the unit tests. One reads the text back out of
   an RTF file (a small reader of RTF, written for the test: it shares nothing with the writer). The other reads the
   words that went in straight from a note's Markdown, by a few lines of patterns (not the parser export uses). A
   project is right when, for every document, the two agree: no word dropped, repeated or out of order. */

const IGNORED = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'fldinst']);

/** The text an RTF file shows: its paragraphs a line each, a tab a tab, what isn't text (the fonts, a picture's
    bytes, a field's address) left out. */
export function rtfText(src: string): string {
	let out = '', i = 0, skip = false;
	const stack: boolean[] = [];
	while (i < src.length) {
		const ch = src[i];
		if (ch === '{') { stack.push(skip); i++; continue; }
		if (ch === '}') { skip = stack.pop() ?? false; i++; continue; }
		if (ch !== '\\') { if (!skip && ch !== '\n' && ch !== '\r') out += ch; i++; continue; }
		const next = src[i + 1];
		if (next === '\\' || next === '{' || next === '}') { if (!skip) out += next; i += 2; continue; }
		if (next === '*') { skip = true; i += 2; continue; }
		if (next === '\'') { if (!skip) out += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)); i += 4; continue; }
		const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 48));
		if (!m) { i += 2; continue; }
		i += m[0].length;
		const word = m[1], n = m[2] === undefined ? null : Number(m[2]);
		if (IGNORED.has(word)) skip = true;
		else if (skip) continue;
		else if (word === 'u' && n !== null) { out += String.fromCharCode(n < 0 ? n + 65536 : n); i++; } // (and the one character that stands in for it)
		else if (word === 'par' || word === 'line') out += '\n';
		else if (word === 'tab') out += '\t';
	}
	return out;
}

const FOOTNOTE = /\{\\Scrv_fn=([\s\S]*?)\\end_Scrv_fn\}/g;
const ANNOTATION = /\{\\Scrv_annot \\color=\{[^}]*\} \\text=([\s\S]*?)\\end_Scrv_annot\}/g;

/** The words of a document: of its text (a comment's in their place) and of its footnotes, which Scrivener keeps
    in the text between its own markers. A list's number is the list's, not the writer's word. */
export function rtfWords(src: string): Words & { text: string } {
	const text = rtfText(src), notes: string[] = [];
	const body = text.replace(FOOTNOTE, (_m, said: string) => { notes.push(...tokens(said)); return ' '; }).replace(ANNOTATION, ' $1 ').replace(/^\d+\.\t/gm, '');
	return { text, body: tokens(body), notes };
}

const lf = (s: string) => s.replace(/\r\n?/g, '\n');
const MARK = /\[\^([^\]\s]+)\]|\^\[((?:[^[\]\n]|\[[^[\]\n]*\])+)\]/g;
const FENCED = /^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)(?:\n {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;

/** The words that go into a document made from a note's text (without its properties), and its footnotes' words in
    the order of their marks. `shown`: whether a picture the note names is one the project can show. */
export function noteWords(body: string, shown: (name: string) => boolean = () => false): Words {
	const code: string[] = [], pool: string[] = [], order: number[] = [];
	const hold = (said: string) => `\uF100${code.push(said) - 1}\uF101`;
	// code is the writer's text as typed: set aside first, so nothing below reads it
	let s = lf(body).replace(/[\uE000-\uF8FF]/g, '').replace(FENCED, (_m, _f: string, inner: string) => `\n${hold(inner)}\n`).replace(/(`+)(?!`)([^\n]*?[^`\n])\1(?!`)/g, (_m, _t: string, inner: string) => hold(inner));
	// a comment is kept (an annotation); an HTML one is left out
	s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/%%([\s\S]*?)%%/g, ' $1 ');
	// a picture that can be shown is no word; anything else embedded stays as it is typed
	s = s.replace(/!\[\[([^\]\n]+?)\]\]/g, (_m, target: string) => { const name = target.split(/\\?\|/)[0].trim(); return shown(name) ? '' : ` ${name} `; });
	s = s.replace(/!\[([^\]\n]*)\]\(([^)\n]*)\)/g, (_m, alt: string, at: string) => (shown(at.trim()) ? '' : ` ${alt} ${at} `));
	s = s.replace(/\[\[([^\]\n]+?)\]\]/g, (_m, link: string) => { const at = link.search(/\\?\|/); return at >= 0 ? link.slice(at).replace(/^\\?\|/, '') : link.split('#').map((p, i) => (i ? p : p.split('/').pop() ?? p)).join(' '); });
	const defs = new Map<string, string>();
	s = s.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.*(?:\n(?: {4}|\t).*)*)/gm, (_m, id: string, text: string) => { if (!defs.has(id)) defs.set(id, text); return ''; });
	const inner = (text: string, seen: string[]): string => text.replace(MARK, (m, id: string | undefined, typed: string | undefined) => (typed !== undefined ? ` ${inner(typed, seen)} ` : defs.has(id as string) && !seen.includes(id as string) ? ` ${inner(defs.get(id as string) as string, [...seen, id as string])} ` : m));
	const first = new Set<string>();
	s = s.replace(MARK, (m, id: string | undefined, typed: string | undefined) => {
		if (typed !== undefined) return `\uF102${pool.push(inner(typed, [])) - 1}\uF103`;
		if (!defs.has(id as string)) return m;
		if (first.has(id as string)) return ''; // (marked twice, written once)
		first.add(id as string);
		return `\uF102${pool.push(inner(defs.get(id as string) as string, [id as string])) - 1}\uF103`;
	});
	const unmark = (t: string) => t
		.replace(/\]\([^)\n]*\)/g, ']')                                  // a link is its words
		.replace(/^ {0,3}\[[^\]\n]+\]:[ \t]+\S.*$/gm, '')                // a link's definition
		.replace(/<([a-z][\w+.-]*:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/gi, '$1') // an address between angle brackets
		.replace(/<\/?[a-zA-Z][^>\n]*>/g, ' ')                           // HTML: its text stays
		.replace(/^[ \t]*(?:#(?=[^\s#]*[^\d\s#])[\p{L}\p{N}_/-]+[ \t]*)+$/gmu, '') // a line of tags
		.replace(/(^|[ \t])\^[A-Za-z0-9-]+[ \t]*$/gm, '')                // a block's id
		.replace(/^[ \t>]*\[![\w-]+\][+-]?/gm, '')                       // a callout's kind
		.replace(/^([ \t>]*(?:[-*+][ \t]+)?)\d{1,9}[.)](?=[ \t]|$)/gm, '$1') // a list's number
		.replace(/\*+|~~/g, '')                                         // emphasis
		.replace(/\uF100(\d+)\uF101/g, (_m, n: string) => ` ${code[Number(n)]} `);
	const out: string[] = [];
	for (const piece of unmark(s).split(/\uF102(\d+)\uF103/)) {
		if (/^\d+$/.test(piece) && pool[Number(piece)] !== undefined && out.length % 2) order.push(Number(piece));
		out.push(piece);
	}
	const bodyWords = out.filter((_p, i) => i % 2 === 0).flatMap((p) => tokens(p));
	return { body: bodyWords, notes: order.flatMap((n) => tokens(unmark(pool[n]).replace(/\uF102\d+\uF103/g, ' '))) };
}
