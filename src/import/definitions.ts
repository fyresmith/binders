/* Footnotes and links written out at the foot of a long text (`[^1]: …`, `[label]: https://…`), put with the pieces the
   text is cut into: each goes to the piece or pieces that mark it. Pure. This is the one rewrite splitting a text makes
   beyond cutting it (docs/dev/import.md, "Definitions"): without it a footnote marked in chapter two but written at the
   end of the book is, in a note of chapter two, a mark that finds nothing. A definition that no piece marks stays where it
   is, and so does one in the only piece that marks it, so a text with none to move is returned as it came.
   Words are unchanged by it: a definition's words are the footnote's, wherever it is written (the word-for-word test reads
   a footnote at its mark). */

interface Block { label: string; lines: string[]; piece: number; at: number }

const FOOTNOTE = /^\[(\^[^\]\s]+)\]:/;
const LINK = /^ {0,3}\[([^\]\n^][^\]\n]*)\]:[ \t]+\S/;

/** The blocks of definitions in a text's lines: a definition's first line and the indented lines that go on from it. */
function blocks(lines: string[], piece: number): Block[] {
	const out: Block[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = FOOTNOTE.exec(lines[i]) ?? LINK.exec(lines[i]);
		if (!m) continue;
		let j = i + 1;
		while (j < lines.length && /^(?: {4}|\t)\S/.test(lines[j])) j++;
		out.push({ label: m[1].toLowerCase().replace(/\s+/g, ' '), lines: lines.slice(i, j), piece, at: i });
		i = j - 1;
	}
	return out;
}

/** Whether a text marks a definition: `[^1]`, `[label]`, `[words][label]`. */
const marks = (text: string, label: string): boolean => text.toLowerCase().includes(`[${label}]`);

export function moveDefinitions(pieces: readonly string[]): string[] {
	const lines = pieces.map((p) => p.split('\n'));
	const all = lines.flatMap((l, i) => blocks(l, i));
	// (the first of two of one label is the one that counts)
	const seen = new Set<string>(), defs = all.filter((b) => { if (seen.has(b.label)) return false; seen.add(b.label); return true; });
	if (!defs.length) return [...pieces];
	const bare = lines.map((l, i) => { const own = new Set(all.filter((b) => b.piece === i).flatMap((b) => Array.from({ length: b.lines.length }, (_, k) => b.at + k))); return l.filter((_, k) => !own.has(k)).join('\n'); });
	const moves = defs.map((d) => ({ d, to: bare.map((t, i) => (marks(t, d.label) ? i : -1)).filter((i) => i >= 0) }))
		.filter(({ d, to }) => to.length && !(to.length === 1 && to[0] === d.piece));
	if (!moves.length) return [...pieces];
	const out = [...pieces];
	// taken from where they were written (unless that piece marks them too), then put at the foot of each piece that does
	for (let i = 0; i < pieces.length; i++) {
		const drop = new Set<number>();
		for (const { d, to } of moves) if (d.piece === i && !to.includes(i)) for (let k = 0; k < d.lines.length; k++) drop.add(d.at + k);
		if (!drop.size) continue;
		const kept: string[] = [];
		lines[i].forEach((l, k) => {
			if (drop.has(k)) { if (!drop.has(k + 1) && kept.length && !kept[kept.length - 1].trim() && !(lines[i][k + 1] ?? '').trim()) kept.pop(); return; }
			kept.push(l);
		});
		out[i] = kept.join('\n');
	}
	for (let i = 0; i < pieces.length; i++) {
		const add = moves.filter(({ d, to }) => to.includes(i) && d.piece !== i).map(({ d }) => d.lines.join('\n'));
		if (add.length) out[i] = `${out[i].replace(/\s+$/, '')}\n\n${add.join('\n')}\n`;
	}
	return out;
}
