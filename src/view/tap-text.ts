/* Where a tap on a section's plain text is in its note. The manuscript draws a section as plain text until it's
   tapped, then as its editor, and the two don't always break their lines at the same words (an editor keeps the
   space at a line's end on that line; drawn text lets it hang), nor stand at the same height (a code block, a
   table). So the caret isn't put at the point tapped, where another letter may be by then: it's put at the letter
   that was there. Pure: no Obsidian, no DOM. */

/** Runs of white space as one space each (drawn text has the note's line breaks as spaces, or as nothing), with where
    each character kept was in the text; the last entry is the text's length. */
function squeezed(text: string): { text: string; at: number[] } {
	let out = '';
	const at: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const space = /\s/.test(text[i]);
		if (space && out.endsWith(' ')) continue;
		out += space ? ' ' : text[i];
		at.push(i);
	}
	at.push(text.length);
	return { text: out, at };
}

/** Every place `part` is found in `text`: the position of its end (`end`) or its start. */
function found(text: string, part: string, end: boolean): number[] {
	const out: number[] = [];
	if (!part) return out;
	for (let i = text.indexOf(part); i >= 0; i = text.indexOf(part, i + 1)) out.push(end ? i + part.length : i);
	return out;
}

/** The position in `src` (a block of a note, as written) of a place in that block as drawn: `before` is the drawn
    text up to the place, `after` the drawn text from it on. The words around the place are looked for in the
    source, as many as it takes to find one place only: the source has marks the drawn text doesn't (`**`, `[[`, a
    list's dash), so the whole text can't be laid over it, but a few words either side nearly always can. Where the
    same words stand more than once, the one as far through the block as the place was. Null if it can't be told
    (the caller then goes by the point on screen). */
export function sourceOffset(src: string, before: string, after: string): number | null {
	const s = squeezed(src), b = squeezed(before).text, a = squeezed(after).text;
	// (a space on both sides of the place is one space in the drawn text)
	const drawn = b.endsWith(' ') && a.startsWith(' ') ? b + a.slice(1) : b + a;
	if (!drawn.trim()) return null;
	const share = drawn.length ? b.length / drawn.length : 0;
	const nearest = (list: number[]): number => list.reduce((best, p) => (Math.abs(p / Math.max(1, s.text.length) - share) < Math.abs(best / Math.max(1, s.text.length) - share) ? p : best));
	const SIZES = [32, 16, 8, 4, 2];
	// the words on both sides, where they meet
	for (const n of SIZES) {
		const head = b.slice(-n), tail = a.slice(0, n);
		const ends = found(s.text, head, true), starts = found(s.text, tail, false);
		const both = ends.filter((p) => starts.includes(p));
		if (both.length) return s.at[nearest(both)];
	}
	// or on one side: the other is cut by a mark (the place just after a bold word, the end of a list's item). The
	// place is at the end of the words before it if a space follows (the end of a word, of a line), else at the
	// start of the words after it. (So few letters that they could be anywhere count only if they're in one place.)
	const sides = /^\s|^$/.test(a) ? [true, false] : [false, true];
	for (const end of sides) {
		for (const n of SIZES) {
			const part = end ? b.slice(-n) : a.slice(0, n), list = found(s.text, part, end);
			if (!part.trim() || !list.length || (list.length > 1 && n <= 4)) continue;
			return s.at[nearest(list)];
		}
	}
	// nothing drawn before the place: the block's first text (after its marks), or its end
	if (!b.trim()) { const first = /[^\s#>*+\-\d.)[\]]/.exec(src); return first ? first.index : null; }
	if (!a.trim()) return src.replace(/\s+$/, '').length;
	return null;
}
