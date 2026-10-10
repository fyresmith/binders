import { bodyStart } from '../scene-text';

/* Find and replace, the pure part: where a query stands in a note's text, and the text with those places replaced.
   Only a note's text is looked through, never its properties. A query is always taken as typed (no patterns).

   What a query does not reach (the maintainer's rule, 2026-10-09): a match that lies wholly inside one of these is no
   match, because changing it would break something or change what the writer didn't mean to touch:
   - where a link leads: `[[Mara]]`, `[[Mara#Storm|her]]`'s "Mara#Storm", `[text](Mara.md)`'s "Mara.md", and the same
     in an embed (the note it leads to keeps its name);
   - a tag: `#Mara`'s "Mara";
   - code (inline, fenced, and a block indented four spaces) and comments (`%% %%`, `<!-- -->`): not prose;
   - a bare web address (after its `https://` or `www.`), a block id (`^mara` ending a line) and the tag name and
     quoted attribute values of a piece of HTML (`<img src="Mara.png">`): where something leads, as a link's target;
   - a link whose first bracket is escaped (`\[[Mara]]`) is no link: its words are prose.
   A link's shown words ("her", "text") are prose and match. To find or change what is kept out, the writer types it
   as written: a query that includes the brackets, the `#`, the backticks or the comment marks reaches outside what it
   guards (the guarded stretch is what is between the marks, not the marks), so it matches. */

export interface Hit { from: number; to: number }
export interface FindOptions { matchCase: boolean }

const literal = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* One pass over a stretch of prose. Groups: 1 and 2 inline code (the ticks, what's between), 3 and 4 comments, 5 a
   wikilink's or embed's target, 6 a Markdown link's destination, 7 a tag (without its `#`; not after a word, so
   `a#b` and a URL's fragment aren't tags, and not a number alone), 8 the part of a web address after its scheme (or
   `www.`), 9 a block id (without its `^`), 10 an HTML tag with a name and only quoted attribute values (a `<` that
   doesn't make a whole tag is prose). Code spans end at a blank line, as in Markdown. */
const INLINE = /(`+)((?:(?!\n[ \t]*\n)[\s\S])*?[^`])\1(?!`)|%%([\s\S]*?)%%|<!--([\s\S]*?)-->|(?<!\\)\[\[([^\]|\n]*)(?:\|[^\]\n]*)?\]\]|\[[^\]\n]*\]\(([^)\n]*)\)|(?<![\p{L}\p{N}_&/\\#])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)|(?<![\p{L}\p{N}_])(?:https?:\/\/|www\.)([^\s<>]+)|(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*\r?$|(<\/?[A-Za-z][\w-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*\s*\/?>)/gmu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The stretches of a text (from `from`: its properties are skipped) that a query doesn't reach, in order, none over
    another. */
export function shielded(text: string, from = 0): Hit[] {
	const out: Hit[] = [];
	const prose = (a: number, b: number): void => {
		if (b <= a) return;
		const part = text.slice(a, b);
		INLINE.lastIndex = 0;
		for (let m = INLINE.exec(part); m; m = INLINE.exec(part)) {
			const at = a + m.index, end = at + m[0].length;
			if (m[1] != null) out.push({ from: at + m[1].length, to: end - m[1].length });
			else if (m[3] != null) out.push({ from: at + 2, to: at + 2 + m[3].length });
			else if (m[4] != null) out.push({ from: at + 4, to: at + 4 + m[4].length });
			else if (m[5] != null) out.push({ from: at + 2, to: at + 2 + m[5].length });
			else if (m[6] != null) out.push({ from: end - 1 - m[6].length, to: end - 1 });
			else if (m[7] != null) out.push({ from: at + 1, to: end });
			else if (m[8] != null) out.push({ from: end - m[8].length, to: end });
			else if (m[9] != null) out.push({ from: at + m[0].indexOf('^') + 1, to: at + m[0].indexOf('^') + 1 + m[9].length });
			else if (m[10] != null) {
				const name = /^<\/?[A-Za-z][\w-]*/.exec(m[10])?.[0] ?? '', skip = name.indexOf('<') + 1 + (name[1] === '/' ? 1 : 0);
				out.push({ from: at + skip, to: at + name.length });
				for (const v of m[10].matchAll(/=\s*("[^"]*"|'[^']*')/g)) out.push({ from: at + v.index + v[0].length - v[1].length + 1, to: at + v.index + v[0].length - 1 });
			}
		}
	};
	// fenced code first: its lines are the stretches between the fences, and the prose is what's around them
	let at = from, proseFrom = from, fence: { mark: string; from: number } | null = null;
	// a block indented four spaces (not a tab: a tab-led line is a paragraph here) is code when it starts the note or
	// follows a blank line, and no list is open (indented lines then belong to the list item)
	let indented: Hit | null = null, blankBefore = true, inList = false;
	const closeIndented = (): void => { if (indented) out.push(indented); indented = null; };
	while (at < text.length) {
		const nl = text.indexOf('\n', at), end = nl < 0 ? text.length : nl, line = text.slice(at, end);
		if (!fence) {
			const m = FENCE.exec(line);
			// (an info string after a backtick fence can't hold a backtick: then it is inline code, not a fence)
			if (m && !(m[1][0] === '`' && line.slice(m[0].length).includes('`'))) { closeIndented(); blankBefore = false; prose(proseFrom, at); fence = { mark: m[1], from: nl < 0 ? text.length : nl + 1 }; }
			else if (/^[ \t\r]*$/.test(line)) blankBefore = true;
			else if (/^ {4,}\S/.test(line)) {
				if (indented) indented.to = end;
				else if (blankBefore && !inList) indented = { from: at, to: end };
				blankBefore = false;
			} else {
				closeIndented();
				if (/^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/.test(line)) inList = true;
				else if (!/^[ \t]/.test(line)) inList = false;
				blankBefore = false;
			}
		} else if (new RegExp(`^ {0,3}${fence.mark[0] === '`' ? '`' : '~'}{${fence.mark.length},}[ \\t]*$`).test(line.replace(/\r$/, ''))) {
			if (at > fence.from) out.push({ from: fence.from, to: at });
			fence = null;
			proseFrom = nl < 0 ? text.length : nl + 1;
		}
		at = nl < 0 ? text.length : nl + 1;
	}
	closeIndented();
	if (fence) { if (text.length > fence.from) out.push({ from: fence.from, to: text.length }); } else prose(proseFrom, text.length);
	out.sort((a, b) => a.from - b.from || b.to - a.to);
	// (an indented block may hold what would be a guard of its own: overlapping stretches are one stretch)
	const merged: Hit[] = [];
	for (const h of out) {
		const last = merged[merged.length - 1];
		if (last && h.from < last.to) last.to = Math.max(last.to, h.to); else merged.push({ ...h });
	}
	return merged;
}

/** The places among `hits` that don't lie wholly inside a guarded stretch (both in order). */
export function outside(hits: readonly Hit[], guarded: readonly Hit[]): Hit[] {
	const out: Hit[] = [];
	let t = 0;
	for (const h of hits) {
		while (t < guarded.length && guarded[t].to < h.to) t++;
		if (!(t < guarded.length && h.from >= guarded[t].from && h.to <= guarded[t].to)) out.push(h);
	}
	return out;
}

/* Matching is done on a folded copy of the text, so that a letter is one letter however it is spelled: each letter
   with its combining marks is a cluster, written in its composed form (NFC), and with Match case off a dotted capital
   İ is an I (the dotless ı stays apart). A match must start and end between clusters (a bare `e` is no match in a
   decomposed é), and its places are given back as places in the text as it is: `from[k]` is where the cluster that
   made folded character k begins. */
const CLUSTER = /[^\p{M}]\p{M}*|\p{M}+/gu;
const fold = (s: string, o: FindOptions): string => {
	const n = s.normalize('NFC');
	return o.matchCase ? n : n.replace(/İ/g, 'I');
};

const raw = (text: string, query: string, o: FindOptions, from: number): Hit[] => {
	const q = fold(query, o), flags = o.matchCase ? 'g' : 'gi', out: Hit[] = [];
	// (plain ASCII has one spelling: no folding, and the places are the text's own)
	if (!/[^\p{ASCII}]/u.test(text.slice(from)) && !/[^\p{ASCII}]/u.test(q)) {
		const re = new RegExp(literal(q), flags);
		re.lastIndex = from;
		for (let m = re.exec(text); m; m = re.exec(text)) out.push({ from: m.index, to: m.index + m[0].length });
		return out;
	}
	let folded = '';
	const origin: number[] = [], head: boolean[] = [];
	for (const c of text.slice(from).matchAll(CLUSTER)) {
		const f = fold(c[0], o);
		for (let k = 0; k < f.length; k++) { origin.push(from + c.index); head.push(k === 0); }
		folded += f;
	}
	origin.push(text.length);
	head.push(true);
	const re = new RegExp(literal(q), flags);
	for (let m = re.exec(folded); m; m = re.exec(folded)) {
		const a = m.index, b = a + m[0].length;
		if (head[a] && head[b]) out.push({ from: origin[a], to: origin[b] });
		// (a match that starts inside a cluster: the next try starts one character on, so none is skipped)
		else re.lastIndex = a + 1;
	}
	return out;
};

/** Every place `query` stands in the text of a note (the whole file is given; its properties are skipped), in order. */
export function findIn(text: string, query: string, o: FindOptions): Hit[] {
	if (!query) return [];
	const start = bodyStart(text), all = raw(text, query, o, start);
	// (what's guarded is worked out only for a note that has a match: most have none)
	return all.length ? outside(all, shielded(text, start)) : all;
}

/** The same in text as it is drawn: `guarded` says what in it a query doesn't reach (a link's words as drawn, a tag). */
export function findPlain(text: string, query: string, o: FindOptions, guarded: readonly Hit[] = []): Hit[] {
	if (!query) return [];
	return outside(raw(text, query, o, 0), guarded);
}

export interface Edit extends Hit { text: string }

/** Where those edits stand once they are made, with what stood there before: the edits that take them back. */
export function inverse(text: string, edits: readonly Edit[]): Edit[] {
	const out: Edit[] = [];
	let shift = 0;
	for (const e of edits) {
		out.push({ from: e.from + shift, to: e.from + shift + e.text.length, text: text.slice(e.from, e.to) });
		shift += e.text.length - (e.to - e.from);
	}
	return out;
}

export const apply = (text: string, edits: readonly Edit[]): string => {
	let out = '', at = 0;
	for (const e of edits) { out += text.slice(at, e.from) + e.text; at = e.to; }
	return out + text.slice(at);
};

/** The text with each of those places replaced by `by` (as typed: no `$1`). */
export function replaceIn(text: string, hits: readonly Hit[], by: string): string {
	let out = '', at = 0;
	for (const h of hits) { out += text.slice(at, h.from) + by; at = h.to; }
	return out + text.slice(at);
}

/** The paragraphs (lines) of a text that hold a hit, each as it is and as it would be: what a review shows. */
export function changedLines(text: string, hits: readonly Hit[], by: string): { before: string; after: string }[] {
	const out: { before: string; after: string }[] = [];
	let i = 0;
	while (i < hits.length) {
		const from = text.lastIndexOf('\n', hits[i].from - 1) + 1, nl = text.indexOf('\n', hits[i].to), to = nl < 0 ? text.length : nl;
		const mine: Hit[] = [];
		while (i < hits.length && hits[i].from < to) { mine.push({ from: hits[i].from - from, to: hits[i].to - from }); i++; }
		const line = text.slice(from, to);
		out.push({ before: line, after: replaceIn(line, mine, by) });
	}
	return out;
}
