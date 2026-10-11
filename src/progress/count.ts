import { bodyStart } from '../scene-text';
import { countWords } from '../view/words';

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

/** Typing up to `BLOCK` words (a net gain is added, a net loss cut); over that, a block brought in (+) or taken out (−). */
function classify(delta: number): Counted {
	if (Math.abs(delta) > BLOCK) return { added: 0, cut: 0, block: delta };
	return { added: Math.max(0, delta), cut: Math.max(0, -delta), block: 0 };
}

const changeDelta = (before: Doc, after: Doc, c: Change): number => countWords(whole(after, c.fromB, c.toB)) - countWords(whole(before, c.fromA, c.toA));

/** What one change did to the words: typing (added or cut) up to `BLOCK` words, over that a block brought in (+) or
    taken out (−). */
export function changeWords(before: Doc, after: Doc, c: Change): Counted { return classify(changeDelta(before, after, c)); }

/** What a transaction did: all its changes together, as one (a piece of text dragged to another place is a change
    that takes it out and one that puts it in, and is no writing). `front`: where the note's text starts in `before`;
    a change that ends before it is in the properties and counts for nothing. */
export function transactionWords(before: Doc, after: Doc, changes: Change[], front = 0): Counted {
	let delta = 0;
	for (const c of changes) if (c.toA > front || c.fromA === c.toA && c.fromA > front) delta += changeDelta(before, after, c);
	return classify(delta);
}

/** Where a note's text starts, after its properties (0 if it has none), read from the start of its document. */
export function frontOf(doc: Doc): number {
	if (doc.sliceString(0, 3) !== '---') return 0;
	const n = bodyStart(doc.sliceString(0, 1500));
	return n || bodyStart(doc.sliceString(0, 40000));
}
