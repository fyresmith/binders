import { countWords } from '../view/words';
import { bodyStart } from '../scene-text';

/* The record's word counting: what a change typed in an editor adds to a note's words or takes from them, and
   whether it was typing or a block of text arriving or going. Pure (CodeMirror's document is read through the two
   methods of `Doc`, so a test needs none).

   A word is a word as Obsidian's status bar counts it (`countWords`), whatever the setting that says how the exported
   book counts: a change is worked out on the few characters it touches, and the book's rule needs a whole note. The
   day's totals, stamped beside this, follow the setting; the difference is small and is what "changed elsewhere" is. */

/** Over this many words in one change, it came or went a block at a time (a paste, a chapter deleted): Dabble's rule. */
export const BLOCK = 50;

export interface Doc { length: number; sliceString(from: number, to?: number): string }
export interface Change { fromA: number; toA: number; fromB: number; toB: number }
export interface Counted { added: number; cut: number; block: number }

// (what can be part of a word: letters, marks, digits, hyphens and apostrophes; not a Han, Hiragana or Katakana character, each of which is a word)
const INSIDE = /[\p{L}\p{M}\p{N}'’-]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const REACH = 64;

/** The text from `from` to `to`, made longer at either end by the word it is in the middle of, so that a letter typed
    on a word is no new word and one typed after a space is. */
function whole(doc: Doc, from: number, to: number): string {
	let a = from, b = to;
	while (a > 0 && from - a < REACH) { const ch = doc.sliceString(a - 1, a); if (!INSIDE.test(ch) || CJK.test(ch)) break; a--; }
	while (b < doc.length && b - to < REACH) { const ch = doc.sliceString(b, b + 1); if (!INSIDE.test(ch) || CJK.test(ch)) break; b++; }
	return doc.sliceString(a, b);
}

/** What one change did to the words: typing (added or cut) up to `BLOCK` words, over that a block brought in (+) or
    taken out (−). */
export function changeWords(before: Doc, after: Doc, c: Change): Counted {
	const delta = countWords(whole(after, c.fromB, c.toB)) - countWords(whole(before, c.fromA, c.toA));
	if (Math.abs(delta) > BLOCK) return { added: 0, cut: 0, block: delta };
	return { added: Math.max(0, delta), cut: Math.max(0, -delta), block: 0 };
}

/** Is a change wholly inside a note's properties? It is no writing. (`head`: the text from the start of the note, as
    far as properties could reach.) */
export const inProperties = (head: string, to: number): boolean => to <= bodyStart(head);
