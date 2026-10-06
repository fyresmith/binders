/* Hyphenation, Binders' own: Electron carries no hyphenation dictionaries, so `hyphens: auto` does nothing there.
   Words are given soft hyphens (U+00AD) where TeX's patterns for the book's language allow a break (Liang's
   algorithm), Chromium breaks lines at them, and the ones no line used are taken out again after layout
   (pages/dom.ts), so the PDF's text stays the words. The patterns are TeX's own files (pages/patterns.ts). Pure. */

/** A language's patterns as pages/patterns/ holds them: under each length, the patterns of that length run
    together; a digit in a pattern is how good (odd) or bad (even) a break there is; `_` is a word's edge.
    `exceptions` are words broken by hand, at their hyphens, believed before the patterns. */
export interface Patterns { leftmin: number; rightmin: number; patterns: Record<string, string>; exceptions?: string }

interface Node { points?: number[]; next: Map<string, Node> }
export const SHY = '­';
/** Words shorter than this are never broken. */
const SHORTEST = 6;
const WORD = /[\p{L}\p{M}]+/gu;

export class Hyphenator {
	private root: Node = { next: new Map() };
	private known = new Map<string, number[]>();
	private cache = new Map<string, string>();
	private left: number;
	private right: number;

	constructor(p: Patterns) {
		this.left = p.leftmin; this.right = p.rightmin;
		for (const [size, run] of Object.entries(p.patterns)) {
			const n = Number(size);
			for (let at = 0; at + n <= run.length; at += n) {
				const points = [0];
				let node = this.root;
				for (const ch of run.slice(at, at + n)) {
					if (ch >= '0' && ch <= '9') { points[points.length - 1] = Number(ch); continue; }
					let to = node.next.get(ch);
					if (!to) node.next.set(ch, (to = { next: new Map() }));
					node = to;
					points.push(0);
				}
				node.points = points;
			}
		}
		for (const w of (p.exceptions ?? '').split(/[,\s]+/).filter((x) => x)) {
			const breaks: number[] = [];
			let at = 0;
			for (const part of w.split(/[-‧]/).slice(0, -1)) { at += part.length; breaks.push(at); }
			this.known.set(w.replace(/[-‧]/g, '').toLowerCase(), breaks);
		}
	}

	/** Where a word may be broken: before the letters at these places. */
	breaks(word: string): number[] {
		const lower = word.toLowerCase(), listed = this.known.get(lower);
		if (listed) return listed;
		// (a letter whose lower case is longer than itself would put every place after it out: such a word is left whole)
		if (lower.length !== word.length) return [];
		const text = `_${lower}_`, points = new Array<number>(text.length + 1).fill(0);
		for (let i = 0; i < text.length; i++) {
			let node: Node | undefined = this.root;
			for (let j = i; j < text.length && node; j++) {
				node = node.next.get(text[j]);
				const p = node?.points;
				if (p) for (let k = 0; k < p.length; k++) if (p[k] > points[i + k]) points[i + k] = p[k];
			}
		}
		const out: number[] = [];
		for (let at = this.left; at <= word.length - this.right; at++) if (points[at + 1] % 2) out.push(at);
		return out;
	}

	/** Some text with a soft hyphen at every place one of its words may be broken. Nothing else changes. */
	hyphenate(text: string): string {
		return text.replace(WORD, (word) => {
			if (word.length < SHORTEST) return word;
			let made = this.cache.get(word);
			if (made === undefined) {
				const at = this.breaks(word);
				made = word;
				for (let i = at.length - 1; i >= 0; i--) made = made.slice(0, at[i]) + SHY + made.slice(at[i]);
				if (this.cache.size < 50000) this.cache.set(word, made);
			}
			return made;
		});
	}
}

/** Text without its soft hyphens. */
export const unhyphenated = (text: string): string => text.split(SHY).join('');
